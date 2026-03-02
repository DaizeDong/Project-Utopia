import "./types.js";
import { createInitialGameState, createWorker, createVisitor, createAnimal } from "../entities/EntityFactory.js";
import { ENTITY_TYPE, ANIMAL_KIND, VISITOR_KIND, TILE } from "../config/constants.js";
import { SceneRenderer } from "../render/SceneRenderer.js";
import { BuildToolbar } from "../ui/tools/BuildToolbar.js";
import { HUDController } from "../ui/hud/HUDController.js";
import { InspectorPanel } from "../ui/panels/InspectorPanel.js";
import { EventPanel } from "../ui/panels/EventPanel.js";
import { PerformancePanel } from "../ui/panels/PerformancePanel.js";
import { DeveloperPanel } from "../ui/panels/DeveloperPanel.js";
import { BuildSystem } from "../simulation/construction/BuildSystem.js";
import { SimulationClock } from "./SimulationClock.js";
import { RoleAssignmentSystem } from "../simulation/population/RoleAssignmentSystem.js";
import { EnvironmentDirectorSystem } from "../simulation/ai/director/EnvironmentDirectorSystem.js";
import { WeatherSystem } from "../world/weather/WeatherSystem.js";
import { WorldEventSystem } from "../world/events/WorldEventSystem.js";
import { NPCBrainSystem } from "../simulation/ai/brains/NPCBrainSystem.js";
import { WorkerAISystem } from "../simulation/npc/WorkerAISystem.js";
import { VisitorAISystem } from "../simulation/npc/VisitorAISystem.js";
import { AnimalAISystem } from "../simulation/npc/AnimalAISystem.js";
import { BoidsSystem } from "../simulation/movement/BoidsSystem.js";
import { ResourceSystem } from "../simulation/economy/ResourceSystem.js";
import { ProgressionSystem } from "../simulation/meta/ProgressionSystem.js";
import { createServices } from "./createServices.js";
import { GameLoop } from "./GameLoop.js";
import { computeSimulationStepPlan } from "./simStepper.js";
import { DEFAULT_BENCHMARK_CONFIG, sanitizeBenchmarkConfig, sanitizeControlSettings } from "./controlSanitizers.js";
import { randomPassableTile, tileToWorld, createInitialGrid, countTilesByType, MAP_TEMPLATES, validateGeneratedGrid } from "../world/grid/Grid.js";
import { pushWarning } from "./warnings.js";

function deepReplaceObject(target, next) {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, next);
}

export class GameApp {
  constructor(canvas) {
    this.state = createInitialGameState();
    this.#sanitizeControls(false);
    this.services = createServices(this.state.world.mapSeed);

    this.buildSystem = new BuildSystem({
      onAction: (event) => {
        this.services.replayService.push({
          channel: "build",
          simSec: this.state.metrics.timeSec,
          ...event,
        });
      },
    });
    this.renderer = new SceneRenderer(canvas, this.state, this.buildSystem, (id) => {
      this.state.controls.selectedEntityId = id;
    });

    this.toolbar = new BuildToolbar(this.state, {
      onRegenerateMap: (params) => this.regenerateWorld(params),
      onDoctrineChange: (doctrineId) => this.setDoctrine(doctrineId),
      onApplyPopulationTargets: (targets) => this.applyPopulationTargets(targets),
      onUndo: () => this.undoLastBuild(),
      onRedo: () => this.redoLastBuild(),
      onSaveSnapshot: (slotId) => this.saveSnapshot(slotId),
      onLoadSnapshot: (slotId) => this.loadSnapshot(slotId),
      onExportReplay: () => this.exportReplay(),
      onComparePresets: () => this.buildPresetComparison(),
      onSetTileIconsVisible: (enabled) => this.setTileIconsVisible(enabled),
      onSetUnitSpritesVisible: (enabled) => this.setUnitSpritesVisible(enabled),
      onSetFixedStepHz: (hz) => this.setFixedStepHz(hz),
      onSetCameraZoomRange: (minZoom, maxZoom) => this.setCameraZoomRange(minZoom, maxZoom),
      onSetRenderDetailThreshold: (value) => this.setRenderDetailThreshold(value),
    });
    this.hud = new HUDController(this.state);
    this.inspector = new InspectorPanel(this.state);
    this.eventPanel = new EventPanel(this.state);
    this.performancePanel = new PerformancePanel(this.state, {
      onSetExtraWorkers: (count) => this.setExtraWorkers(count),
      onRunBenchmark: () => this.startBenchmark(),
      onCancelBenchmark: () => this.cancelBenchmark(),
      onDownloadBenchmark: () => this.downloadBenchmarkCsv(),
      onPauseToggle: () => this.togglePause(),
      onStepFrame: () => this.stepFrames(1),
      onStepFrames: (count) => this.stepFrames(count),
      onSetTimeScale: (scale) => this.setTimeScale(scale),
      onSetBenchmarkConfig: (config) => this.setBenchmarkConfig(config),
    });
    this.developerPanel = new DeveloperPanel(this.state);

    this.benchmark = {
      running: false,
      activeConfig: null,
      stageIndex: 0,
      stageElapsedSec: 0,
      sampleCount: 0,
      sumFps: 0,
      sumFrameMs: 0,
      results: [],
      csv: "",
    };

    this.systems = this.createSystems();

    this.loop = new GameLoop(
      (dt) => this.update(dt),
      (dt) => this.render(dt),
      {
        maxFps: 60,
        onError: (err) => {
          this.#reportLoopError(err);
        },
      },
    );
    this.accumulatorSec = 0;
    this.maxSimulationStepsPerFrame = 5;
    this.uiRefreshIntervalSec = 1 / 8;
    this.uiRefreshAccumulator = this.uiRefreshIntervalSec;
    this.systemProfileInterval = 4;
    this.systemProfileCounter = 0;
    this.memoryGuard = {
      active: false,
      lastTrimSec: -999,
    };
    this.lastLoopErrorAtMs = -999999;
    this.lastLoopErrorText = "";
    this.#recomputePopulationBreakdown();
  }

  createSystems() {
    return [
      new SimulationClock(),
      new ProgressionSystem(),
      new RoleAssignmentSystem(),
      new EnvironmentDirectorSystem(),
      new WeatherSystem(),
      new WorldEventSystem(),
      new NPCBrainSystem(),
      new WorkerAISystem(),
      new VisitorAISystem(),
      new AnimalAISystem(),
      new BoidsSystem(),
      new ResourceSystem(),
    ];
  }

  stepSimulation(simDt) {
    const timings = this.state.debug.systemTimingsMs ?? (this.state.debug.systemTimingsMs = {});
    const simStart = performance.now();
    const shouldProfile = this.systemProfileCounter === 0;
    this.systemProfileCounter = (this.systemProfileCounter + 1) % this.systemProfileInterval;

    for (const system of this.systems) {
      const t0 = shouldProfile ? performance.now() : 0;
      try {
        system.update(simDt, this.state, this.services);
      } catch (err) {
        const msg = `${system.name} failed: ${String(err?.message ?? err)}`;
        this.state.ai.lastError = msg;
        pushWarning(this.state, msg, "error", system.name);
      } finally {
        if (shouldProfile) {
          const dtMs = performance.now() - t0;
          const stat = timings[system.name] ?? { last: 0, avg: 0, peak: 0 };
          stat.last = dtMs;
          stat.avg = stat.avg * 0.85 + dtMs * 0.15;
          stat.peak = Math.max(stat.peak * 0.996, dtMs);
          timings[system.name] = stat;
        }
      }
    }

    const simCost = performance.now() - simStart;
    this.state.metrics.simCostMs = simCost;
    this.state.metrics.cpuBudgetMs = this.state.metrics.cpuBudgetMs * 0.9 + simCost * 0.1;
    this.#recomputePopulationBreakdown();

    this.updateBenchmark(simDt);
  }

  update(frameDt) {
    const frameStart = performance.now();
    const controls = this.state.controls;
    const fixedStepSec = Math.max(1 / 120, Math.min(1 / 5, controls.fixedStepSec || 1 / 30));
    const stepPlan = computeSimulationStepPlan({
      frameDt,
      accumulatorSec: this.accumulatorSec,
      isPaused: controls.isPaused,
      stepFramesPending: controls.stepFramesPending,
      fixedStepSec,
      timeScale: controls.timeScale,
      maxSteps: this.maxSimulationStepsPerFrame,
    });

    this.accumulatorSec = stepPlan.nextAccumulatorSec;
    controls.stepFramesPending = Math.max(0, controls.stepFramesPending - stepPlan.consumedStepFrames);

    for (let i = 0; i < stepPlan.steps; i += 1) {
      this.stepSimulation(fixedStepSec);
    }

    if (controls.isPaused && this.benchmark.running && stepPlan.steps === 0) {
      this.state.metrics.benchmarkStatus = "paused";
    }

    this.state.metrics.frameMs = performance.now() - frameStart;
    this.state.metrics.simDt = stepPlan.simDt;
    this.state.metrics.simStepsThisFrame = stepPlan.steps;
    this.state.metrics.isDebugStepping = Boolean(controls.isPaused);

    const instantFps = 1 / Math.max(0.0001, frameDt);
    this.state.metrics.averageFps = this.state.metrics.averageFps * 0.95 + instantFps * 0.05;

    const entityCount = this.state.agents.length + this.state.animals.length;
    if (entityCount >= 700) {
      this.uiRefreshIntervalSec = 1 / 3;
    } else if (entityCount >= 350) {
      this.uiRefreshIntervalSec = 1 / 5;
    } else {
      this.uiRefreshIntervalSec = 1 / 8;
    }

    const wrapRoot = document.getElementById("wrap");
    if (wrapRoot?.classList.contains("dock-collapsed")) {
      this.uiRefreshIntervalSec = Math.max(this.uiRefreshIntervalSec, 1 / 3);
    }

    if (performance.memory?.usedJSHeapSize) {
      this.state.metrics.memoryMb = performance.memory.usedJSHeapSize / (1024 * 1024);
    }
    this.#applyMemoryPressureGuard();
    if (this.state.debug) {
      this.state.debug.rng = this.services.rng.snapshot();
    }
  }

  render(dt) {
    const uiStart = performance.now();
    this.uiRefreshAccumulator += dt;
    if (this.uiRefreshAccumulator >= this.uiRefreshIntervalSec) {
      this.#safeRenderPanel("HUD", () => this.hud.render());
      this.#safeRenderPanel("Inspector", () => this.inspector.render());
      this.#safeRenderPanel("EventPanel", () => this.eventPanel.render());
      this.#safeRenderPanel("PerformancePanel", () => this.performancePanel.render());
      const wrapRoot = document.getElementById("wrap");
      if (!wrapRoot?.classList.contains("dock-collapsed")) {
        this.#safeRenderPanel("DeveloperPanel", () => this.developerPanel.render());
      }
      this.#safeRenderPanel("BuildToolbar", () => this.toolbar.sync());
      this.uiRefreshAccumulator = 0;
    }
    this.state.metrics.uiCpuMs = performance.now() - uiStart;
    const renderStart = performance.now();
    this.#safeRenderPanel("SceneRenderer", () => this.renderer.render(dt));
    this.state.metrics.renderCpuMs = performance.now() - renderStart;
  }

  setExtraWorkers(extraCount) {
    const safeCount = Math.max(0, Math.min(500, extraCount | 0));
    const baseWorkers = this.state.agents.filter((a) => a.type === ENTITY_TYPE.WORKER && !a.isStressWorker);
    const stressWorkers = this.state.agents.filter((a) => a.type === ENTITY_TYPE.WORKER && a.isStressWorker);
    const nonWorkers = this.state.agents.filter((a) => a.type !== ENTITY_TYPE.WORKER);

    if (stressWorkers.length < safeCount) {
      const addCount = safeCount - stressWorkers.length;
      for (let i = 0; i < addCount; i += 1) {
        const tile = randomPassableTile(this.state.grid, () => this.services.rng.next());
        const p = tileToWorld(tile.ix, tile.iz, this.state.grid);
        const worker = createWorker(p.x, p.z, () => this.services.rng.next());
        worker.isStressWorker = true;
        stressWorkers.push(worker);
      }
    } else if (stressWorkers.length > safeCount) {
      stressWorkers.length = safeCount;
    }

    this.state.agents = [...baseWorkers, ...stressWorkers, ...nonWorkers];
    this.state.controls.stressExtraWorkers = safeCount;
    this.#recomputePopulationBreakdown();
    this.state.controls.actionMessage = `Set stress workers to ${safeCount}.`;
    this.state.controls.actionKind = "success";
    this.services.replayService.push({
      channel: "population",
      kind: "setStressWorkers",
      value: safeCount,
      simSec: this.state.metrics.timeSec,
    });
  }

  applyPopulationTargets(targets = {}) {
    const safeTargets = {
      workers: Math.max(0, Math.min(500, Number(targets.workers) || 0)),
      visitors: Math.max(0, Math.min(300, Number(targets.visitors) || 0)),
      herbivores: Math.max(0, Math.min(400, Number(targets.herbivores) || 0)),
      predators: Math.max(0, Math.min(200, Number(targets.predators) || 0)),
    };

    const baseWorkers = this.state.agents.filter((a) => a.type === ENTITY_TYPE.WORKER && !a.isStressWorker);
    const stressWorkers = this.state.agents.filter((a) => a.type === ENTITY_TYPE.WORKER && a.isStressWorker);
    const visitors = this.state.agents.filter((a) => a.type === ENTITY_TYPE.VISITOR);
    const herbivores = this.state.animals.filter((a) => a.kind === ANIMAL_KIND.HERBIVORE);
    const predators = this.state.animals.filter((a) => a.kind === ANIMAL_KIND.PREDATOR);

    const resizeList = (list, targetCount, spawnFactory) => {
      const next = list.slice(0, Math.max(0, targetCount));
      while (next.length < targetCount) {
        next.push(spawnFactory(next.length));
      }
      return next;
    };

    const nextWorkers = resizeList(baseWorkers, safeTargets.workers, () => {
      const tile = randomPassableTile(this.state.grid, () => this.services.rng.next());
      const pos = tileToWorld(tile.ix, tile.iz, this.state.grid);
      return createWorker(pos.x, pos.z, () => this.services.rng.next());
    });

    const nextVisitors = resizeList(visitors, safeTargets.visitors, (i) => {
      const tile = randomPassableTile(this.state.grid, () => this.services.rng.next());
      const pos = tileToWorld(tile.ix, tile.iz, this.state.grid);
      const kind = i % 5 === 0 ? VISITOR_KIND.TRADER : VISITOR_KIND.SABOTEUR;
      return createVisitor(pos.x, pos.z, kind, () => this.services.rng.next());
    });

    const nextHerbivores = resizeList(herbivores, safeTargets.herbivores, () => {
      const tile = randomPassableTile(this.state.grid, () => this.services.rng.next());
      const pos = tileToWorld(tile.ix, tile.iz, this.state.grid);
      return createAnimal(pos.x, pos.z, ANIMAL_KIND.HERBIVORE, () => this.services.rng.next());
    });

    const nextPredators = resizeList(predators, safeTargets.predators, () => {
      const tile = randomPassableTile(this.state.grid, () => this.services.rng.next());
      const pos = tileToWorld(tile.ix, tile.iz, this.state.grid);
      return createAnimal(pos.x, pos.z, ANIMAL_KIND.PREDATOR, () => this.services.rng.next());
    });

    this.state.agents = [...nextWorkers, ...stressWorkers, ...nextVisitors];
    this.state.animals = [...nextHerbivores, ...nextPredators];
    this.state.controls.populationTargets = { ...safeTargets };
    this.#recomputePopulationBreakdown();

    if (this.state.controls.selectedEntityId) {
      const exists = this.state.agents.some((a) => a.id === this.state.controls.selectedEntityId)
        || this.state.animals.some((a) => a.id === this.state.controls.selectedEntityId);
      if (!exists) this.state.controls.selectedEntityId = null;
    }

    this.state.controls.actionMessage = `Population applied (base): W${safeTargets.workers} V${safeTargets.visitors} H${safeTargets.herbivores} P${safeTargets.predators}.`;
    this.state.controls.actionKind = "success";
    this.services.replayService.push({
      channel: "population",
      kind: "applyBaseTargets",
      value: safeTargets,
      simSec: this.state.metrics.timeSec,
    });
  }

  startBenchmark() {
    if (this.benchmark.running) return;
    if (this.state.controls.isPaused) {
      this.state.controls.actionMessage = "Resume simulation before benchmark.";
      this.state.controls.actionKind = "error";
      return;
    }

    const { config: benchmarkConfig, corrections } = sanitizeBenchmarkConfig(
      this.state.controls.benchmarkConfig,
      DEFAULT_BENCHMARK_CONFIG,
    );
    this.state.controls.benchmarkConfig = benchmarkConfig;

    this.benchmark.running = true;
    this.benchmark.activeConfig = benchmarkConfig;
    this.benchmark.stageIndex = 0;
    this.benchmark.stageElapsedSec = 0;
    this.benchmark.sampleCount = 0;
    this.benchmark.sumFps = 0;
    this.benchmark.sumFrameMs = 0;
    this.benchmark.results = [];
    this.benchmark.csv = "";
    this.state.metrics.benchmarkCsvReady = false;

    this.setExtraWorkers(benchmarkConfig.schedule[0]);
    this.state.metrics.benchmarkStatus = `running load=${benchmarkConfig.schedule[0]}`;
    this.state.controls.actionMessage = corrections.length > 0
      ? `Benchmark started (${corrections.join(" ")})`
      : "Benchmark started.";
    this.state.controls.actionKind = "info";
    this.services.replayService.push({ channel: "time", kind: "pauseToggle", value: this.state.controls.isPaused, simSec: this.state.metrics.timeSec });
  }

  cancelBenchmark() {
    this.benchmark.running = false;
    this.benchmark.activeConfig = null;
    this.state.metrics.benchmarkCsvReady = false;
    this.benchmark.csv = "";
    this.state.metrics.benchmarkStatus = "cancelled";
    this.state.controls.actionMessage = "Benchmark cancelled.";
    this.state.controls.actionKind = "info";
  }

  updateBenchmark(dt) {
    if (!this.benchmark.running) return;
    if (this.state.controls.isPaused) {
      this.state.metrics.benchmarkStatus = "paused (debug mode)";
      return;
    }

    const config = this.benchmark.activeConfig ?? this.state.controls.benchmarkConfig ?? DEFAULT_BENCHMARK_CONFIG;
    this.benchmark.stageElapsedSec += dt;
    const load = config.schedule[this.benchmark.stageIndex];

    if (this.benchmark.stageElapsedSec >= config.sampleStartSec) {
      this.benchmark.sampleCount += 1;
      this.benchmark.sumFps += this.state.metrics.averageFps;
      this.benchmark.sumFrameMs += this.state.metrics.frameMs;
    }

    if (this.benchmark.stageElapsedSec < config.stageDurationSec) {
      const remain = Math.max(0, config.stageDurationSec - this.benchmark.stageElapsedSec);
      this.state.metrics.benchmarkStatus = `running load=${load} t=${remain.toFixed(1)}s`;
      return;
    }

    const avgFps = this.benchmark.sampleCount > 0
      ? this.benchmark.sumFps / this.benchmark.sampleCount
      : this.state.metrics.averageFps;
    const avgFrameMs = this.benchmark.sampleCount > 0
      ? this.benchmark.sumFrameMs / this.benchmark.sampleCount
      : this.state.metrics.frameMs;

    this.benchmark.results.push({
      load,
      workers: this.state.agents.filter((a) => a.type === "WORKER").length,
      totalEntities: this.state.agents.length + this.state.animals.length,
      avgFps,
      avgFrameMs,
    });

    this.benchmark.stageIndex += 1;
    this.benchmark.stageElapsedSec = 0;
    this.benchmark.sampleCount = 0;
    this.benchmark.sumFps = 0;
    this.benchmark.sumFrameMs = 0;

    if (this.benchmark.stageIndex >= config.schedule.length) {
      this.benchmark.running = false;
      this.benchmark.activeConfig = null;
      this.benchmark.csv = this.buildBenchmarkCsv();
      this.state.metrics.benchmarkCsvReady = true;
      this.state.metrics.benchmarkStatus = "done (csv ready)";
      return;
    }

    const nextLoad = config.schedule[this.benchmark.stageIndex];
    this.setExtraWorkers(nextLoad);
  }

  buildBenchmarkCsv() {
    const header = "load,workers,total_entities,avg_fps,avg_frame_ms";
    const rows = this.benchmark.results.map((r) => {
      return [
        r.load,
        r.workers,
        r.totalEntities,
        r.avgFps.toFixed(2),
        r.avgFrameMs.toFixed(3),
      ].join(",");
    });
    return `${header}\n${rows.join("\n")}\n`;
  }

  downloadBenchmarkCsv() {
    if (!this.benchmark.csv) return;
    const blob = new Blob([this.benchmark.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `utopia-benchmark-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    this.state.controls.actionMessage = "Benchmark CSV downloaded.";
    this.state.controls.actionKind = "success";
  }

  togglePause() {
    this.state.controls.isPaused = !this.state.controls.isPaused;
    if (!this.state.controls.isPaused) {
      this.state.controls.stepFramesPending = 0;
      this.state.controls.actionMessage = "Simulation resumed.";
    } else {
      this.state.controls.actionMessage = "Simulation paused.";
    }
    this.state.controls.actionKind = "info";
  }

  stepFrames(frameCount) {
    const n = Math.max(1, frameCount | 0);
    this.state.controls.isPaused = true;
    this.state.controls.stepFramesPending = Math.min(240, this.state.controls.stepFramesPending + n);
    this.state.controls.actionMessage = `Queued ${n} simulation step(s).`;
    this.state.controls.actionKind = "info";
    this.services.replayService.push({ channel: "time", kind: "step", value: n, simSec: this.state.metrics.timeSec });
  }

  setTimeScale(scale) {
    const clamped = Math.max(0.25, Math.min(2.0, Number(scale) || 1));
    this.state.controls.timeScale = clamped;
    this.state.controls.actionMessage = `Time scale ${clamped.toFixed(2)}x`;
    this.state.controls.actionKind = "info";
    this.services.replayService.push({ channel: "time", kind: "timeScale", value: clamped, simSec: this.state.metrics.timeSec });
  }

  setFixedStepHz(hz) {
    const clampedHz = Math.max(5, Math.min(120, Number(hz) || 30));
    this.state.controls.fixedStepSec = 1 / clampedHz;
    const { corrections } = this.#sanitizeControls(false);
    this.state.controls.actionMessage = corrections.length > 0
      ? corrections[0]
      : `Simulation tick set to ${clampedHz.toFixed(1)} Hz.`;
    this.state.controls.actionKind = "info";
  }

  setTileIconsVisible(enabled) {
    this.state.controls.showTileIcons = Boolean(enabled);
    this.state.controls.actionMessage = this.state.controls.showTileIcons
      ? "Tile icons enabled."
      : "Tile icons hidden.";
    this.state.controls.actionKind = "info";
  }

  setUnitSpritesVisible(enabled) {
    this.state.controls.showUnitSprites = Boolean(enabled);
    this.state.controls.actionMessage = this.state.controls.showUnitSprites
      ? "Unit sprites enabled."
      : "Unit sprites hidden.";
    this.state.controls.actionKind = "info";
  }

  setCameraZoomRange(minZoom, maxZoom) {
    this.state.controls.cameraMinZoom = Number(minZoom);
    this.state.controls.cameraMaxZoom = Number(maxZoom);
    const { corrections } = this.#sanitizeControls(false);
    if (corrections.length > 0) {
      this.state.controls.actionMessage = corrections[0];
      this.state.controls.actionKind = "error";
      return;
    }
    this.state.controls.actionMessage = `Camera zoom range set: ${this.state.controls.cameraMinZoom.toFixed(2)} - ${this.state.controls.cameraMaxZoom.toFixed(2)}`;
    this.state.controls.actionKind = "info";
  }

  setRenderDetailThreshold(value) {
    this.state.controls.renderModelDisableThreshold = Math.round(Number(value) || 260);
    const { corrections } = this.#sanitizeControls(false);
    this.state.controls.actionMessage = corrections.length > 0
      ? corrections[0]
      : `Render detail threshold set to ${this.state.controls.renderModelDisableThreshold}.`;
    this.state.controls.actionKind = "info";
  }

  setBenchmarkConfig(rawConfig) {
    const { config, corrections } = sanitizeBenchmarkConfig(rawConfig, DEFAULT_BENCHMARK_CONFIG);
    this.state.controls.benchmarkConfig = config;
    if (this.benchmark.running) {
      this.state.controls.actionMessage = "Benchmark config saved. It will apply on next benchmark run.";
      this.state.controls.actionKind = "info";
      return;
    }
    this.state.controls.actionMessage = corrections.length > 0
      ? `Benchmark config updated (${corrections.join(" ")})`
      : "Benchmark config updated.";
    this.state.controls.actionKind = "success";
  }

  setDoctrine(doctrineId) {
    this.state.controls.doctrine = doctrineId;
    this.state.controls.actionMessage = `Doctrine set to ${doctrineId}.`;
    this.state.controls.actionKind = "info";
    this.services.replayService.push({ channel: "doctrine", kind: "setDoctrine", value: doctrineId, simSec: this.state.metrics.timeSec });
  }

  regenerateWorld({ templateId, seed, terrainTuning }) {
    const next = createInitialGameState({ templateId, seed, terrainTuning });

    next.ai.enabled = this.state.ai.enabled;
    next.controls.tool = this.state.controls.tool;
    next.controls.farmRatio = this.state.controls.farmRatio;
    next.controls.timeScale = this.state.controls.timeScale;
    next.controls.doctrine = this.state.controls.doctrine;
    next.controls.visualPreset = this.state.controls.visualPreset;
    next.controls.showTileIcons = this.state.controls.showTileIcons;
    next.controls.showUnitSprites = this.state.controls.showUnitSprites;
    next.controls.fixedStepSec = this.state.controls.fixedStepSec;
    next.controls.cameraMinZoom = this.state.controls.cameraMinZoom;
    next.controls.cameraMaxZoom = this.state.controls.cameraMaxZoom;
    next.controls.renderModelDisableThreshold = this.state.controls.renderModelDisableThreshold;
    next.controls.benchmarkConfig = { ...this.state.controls.benchmarkConfig };
    next.controls.populationTargets = { ...this.state.controls.populationTargets };
    next.controls.terrainTuning = { ...(terrainTuning ?? next.controls.terrainTuning ?? this.state.controls.terrainTuning) };
    next.controls.saveSlotId = this.state.controls.saveSlotId ?? "default";

    deepReplaceObject(this.state, next);
    this.#sanitizeControls(false);

    this.systems = this.createSystems();
    this.services = createServices(this.state.world.mapSeed);
    this.accumulatorSec = 0;
    this.systemProfileCounter = 0;

    this.benchmark.running = false;
    this.benchmark.activeConfig = null;
    this.benchmark.csv = "";
    this.state.metrics.benchmarkCsvReady = false;
    this.state.metrics.benchmarkStatus = "idle";
    this.#recomputePopulationBreakdown();

    this.state.controls.actionMessage = `Regenerated map: ${this.state.world.mapTemplateName} (seed ${this.state.world.mapSeed})`;
    this.state.controls.actionKind = "success";
    this.services.replayService.push({
      channel: "map",
      kind: "regenerate",
      value: { templateId: this.state.world.mapTemplateId, seed: this.state.world.mapSeed },
      simSec: this.state.metrics.timeSec,
    });
  }

  undoLastBuild() {
    const result = this.buildSystem.undo(this.state);
    if (!result.ok) {
      this.state.controls.actionMessage = result.reason === "emptyHistory" ? "Nothing to undo." : "Undo failed.";
      this.state.controls.actionKind = "error";
      return;
    }
    this.state.controls.actionMessage = `Undo ${result.tool} at (${result.ix}, ${result.iz})`;
    this.state.controls.actionKind = "info";
  }

  redoLastBuild() {
    const result = this.buildSystem.redo(this.state);
    if (!result.ok) {
      const msg = result.reason === "insufficientResource" ? "Redo failed: insufficient resources." : "Nothing to redo.";
      this.state.controls.actionMessage = msg;
      this.state.controls.actionKind = "error";
      return;
    }
    this.state.controls.actionMessage = `Redo ${result.tool} at (${result.ix}, ${result.iz})`;
    this.state.controls.actionKind = "info";
  }

  saveSnapshot(slotId = this.state.controls.saveSlotId ?? "default") {
    const result = this.services.snapshotService.saveToStorage(slotId, this.state, this.services.rng.snapshot());
    this.state.controls.saveSlotId = slotId;
    this.state.controls.actionMessage = `Snapshot saved (${slotId}, ${result.bytes} bytes).`;
    this.state.controls.actionKind = "success";
  }

  loadSnapshot(slotId = this.state.controls.saveSlotId ?? "default") {
    const restored = this.services.snapshotService.loadFromStorage(slotId);
    if (!restored) {
      this.state.controls.actionMessage = `Snapshot slot '${slotId}' not found.`;
      this.state.controls.actionKind = "error";
      return;
    }
    deepReplaceObject(this.state, restored);
    this.#sanitizeControls(false);
    this.services = createServices(this.state.world.mapSeed);
    if (restored.meta?.rng) this.services.rng.restore(restored.meta.rng);
    this.systems = this.createSystems();
    this.state.controls.saveSlotId = slotId;
    this.accumulatorSec = 0;
    this.systemProfileCounter = 0;
    this.#recomputePopulationBreakdown();
    this.state.controls.actionMessage = `Snapshot loaded (${slotId}).`;
    this.state.controls.actionKind = "success";
  }

  exportReplay() {
    const blob = new Blob([this.services.replayService.exportJson()], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `utopia-replay-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    this.state.controls.actionMessage = "Replay trace exported.";
    this.state.controls.actionKind = "success";
  }

  buildPresetComparison() {
    const seed = this.state.world.mapSeed;
    const rows = MAP_TEMPLATES.map((template) => {
      const grid = createInitialGrid({ templateId: template.id, seed });
      const area = grid.width * grid.height;
      const roads = countTilesByType(grid, [TILE.ROAD]);
      const water = countTilesByType(grid, [TILE.WATER]);
      const passable = countTilesByType(grid, [TILE.GRASS, TILE.ROAD, TILE.FARM, TILE.LUMBER, TILE.WAREHOUSE, TILE.RUINS]);
      const valid = validateGeneratedGrid(grid);
      return {
        templateId: template.id,
        roads,
        roadPct: ((roads / area) * 100).toFixed(1),
        waterPct: ((water / area) * 100).toFixed(1),
        passablePct: ((passable / area) * 100).toFixed(1),
        validation: valid.ok ? "ok" : valid.issues.join("; "),
      };
    });
    this.state.debug.presetComparison = rows;
    this.services.replayService.push({ channel: "map", kind: "comparePresets", value: { seed }, simSec: this.state.metrics.timeSec });
    this.state.controls.actionMessage = `Preset comparison ready (${rows.length} presets, seed ${seed}). See Developer panel.`;
    this.state.controls.actionKind = "info";
  }

  #recomputePopulationBreakdown() {
    let baseWorkers = 0;
    let stressWorkers = 0;
    let visitors = 0;
    let farmers = 0;
    let loggers = 0;
    for (const agent of this.state.agents) {
      if (agent.type === ENTITY_TYPE.WORKER) {
        if (agent.isStressWorker) stressWorkers += 1;
        else baseWorkers += 1;
        if (agent.role === "FARM") farmers += 1;
        if (agent.role === "WOOD") loggers += 1;
      } else if (agent.type === ENTITY_TYPE.VISITOR) {
        visitors += 1;
      }
    }
    let herbivores = 0;
    let predators = 0;
    for (const animal of this.state.animals) {
      if (animal.kind === ANIMAL_KIND.HERBIVORE) herbivores += 1;
      if (animal.kind === ANIMAL_KIND.PREDATOR) predators += 1;
    }
    const totalWorkers = baseWorkers + stressWorkers;
    const totalEntities = this.state.agents.length + this.state.animals.length;
    this.state.controls.populationBreakdown = {
      baseWorkers,
      stressWorkers,
      totalWorkers,
      totalEntities,
    };
    this.state.metrics.populationStats = {
      workers: totalWorkers,
      baseWorkers,
      stressWorkers,
      visitors,
      herbivores,
      predators,
      farmers,
      loggers,
      totalEntities,
    };
  }

  #reportLoopError(err) {
    const messageCore = String(err?.message ?? err);
    const msg = `Main loop error: ${messageCore}`;
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    const duplicate = msg === this.lastLoopErrorText && nowMs - this.lastLoopErrorAtMs < 2000;
    this.lastLoopErrorAtMs = nowMs;
    this.lastLoopErrorText = msg;
    if (!duplicate) {
      pushWarning(this.state, msg, "error", "GameLoop");
      console.error("[Project Utopia] main loop failed:", err);
    }
    this.state.controls.actionMessage = msg;
    this.state.controls.actionKind = "error";
    const actionEl = document.getElementById("actionVal");
    if (actionEl) actionEl.textContent = msg;
  }

  #safeRenderPanel(panelName, renderFn) {
    try {
      renderFn();
    } catch (err) {
      this.#reportLoopError(new Error(`${panelName}: ${String(err?.message ?? err)}`));
    }
  }

  #sanitizeControls(notify = false) {
    const { corrections } = sanitizeControlSettings(this.state.controls);
    if (notify && corrections.length > 0) {
      this.state.controls.actionMessage = corrections.join(" ");
      this.state.controls.actionKind = "error";
    }
    return { corrections };
  }

  #applyMemoryPressureGuard() {
    const memMb = Number(this.state.metrics.memoryMb ?? 0);
    if (!Number.isFinite(memMb) || memMb <= 0) return;

    const nowSec = Number(this.state.metrics.timeSec ?? 0);
    const highWater = memMb >= 700;
    const severeWater = memMb >= 900;

    if (highWater && nowSec - this.memoryGuard.lastTrimSec >= 6) {
      this.services.pathCache.clear();
      this.services.replayService.clear();
      this.state.debug.aiTrace = (this.state.debug.aiTrace ?? []).slice(0, 16);
      this.state.debug.eventTrace = (this.state.debug.eventTrace ?? []).slice(0, 16);
      this.state.debug.presetComparison = (this.state.debug.presetComparison ?? []).slice(0, 8);
      this.state.metrics.warningLog = (this.state.metrics.warningLog ?? []).slice(-40);
      this.state.metrics.warnings = (this.state.metrics.warnings ?? []).slice(-10);
      this.memoryGuard.lastTrimSec = nowSec;
      pushWarning(this.state, `Memory guard trimmed caches at ${memMb.toFixed(1)}MB`, "warn", "MemoryGuard");
    }

    if (severeWater && !this.memoryGuard.active) {
      this.memoryGuard.active = true;
      this.state.controls.showTileIcons = false;
      this.state.controls.showUnitSprites = false;
      this.state.controls.renderModelDisableThreshold = Math.min(
        Number(this.state.controls.renderModelDisableThreshold ?? 260),
        120,
      );
      this.uiRefreshIntervalSec = Math.max(this.uiRefreshIntervalSec, 1 / 2);
      if (typeof document !== "undefined") {
        const wrapRoot = document.getElementById("wrap");
        wrapRoot?.classList.add("dock-collapsed");
      }
      this.state.controls.actionMessage = `Memory pressure mode enabled (${memMb.toFixed(0)}MB).`;
      this.state.controls.actionKind = "error";
      this.#sanitizeControls(false);
    }

    if (!highWater && this.memoryGuard.active && nowSec - this.memoryGuard.lastTrimSec >= 20) {
      this.memoryGuard.active = false;
    }
  }

  start() {
    this.loop.start();
  }

  stop() {
    this.loop.stop();
  }

  dispose() {
    this.stop();
    this.renderer?.dispose?.();
  }
}
