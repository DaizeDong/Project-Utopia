import "./types.js";
import { createInitialGameState, createWorker, createVisitor, createAnimal } from "../entities/EntityFactory.js";
import { ENTITY_TYPE, ANIMAL_KIND, VISITOR_KIND } from "../config/constants.js";
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
import { randomPassableTile, tileToWorld } from "../world/grid/Grid.js";

function deepReplaceObject(target, next) {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, next);
}

export class GameApp {
  constructor(canvas) {
    this.state = createInitialGameState();
    this.services = createServices();

    this.buildSystem = new BuildSystem();
    this.renderer = new SceneRenderer(canvas, this.state, this.buildSystem, (id) => {
      this.state.controls.selectedEntityId = id;
    });

    this.toolbar = new BuildToolbar(this.state, {
      onRegenerateMap: (params) => this.regenerateWorld(params),
      onDoctrineChange: (doctrineId) => this.setDoctrine(doctrineId),
      onApplyPopulationTargets: (targets) => this.applyPopulationTargets(targets),
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
    });
    this.developerPanel = new DeveloperPanel(this.state);

    this.benchmark = {
      running: false,
      schedule: [0, 100, 200, 300, 400, 500],
      stageIndex: 0,
      stageElapsedSec: 0,
      stageDurationSec: 4,
      sampleStartSec: 1.2,
      sampleCount: 0,
      sumFps: 0,
      sumFrameMs: 0,
      results: [],
      csv: "",
    };

    this.systems = this.createSystems();

    this.loop = new GameLoop((dt) => this.update(dt), (dt) => this.render(dt));
    this.accumulatorSec = 0;
    this.maxSimulationStepsPerFrame = 10;
    this.uiRefreshIntervalSec = 1 / 15;
    this.uiRefreshAccumulator = this.uiRefreshIntervalSec;
    this.systemProfileInterval = 4;
    this.systemProfileCounter = 0;
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
        this.state.metrics.warnings.push(msg);
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

    if (performance.memory?.usedJSHeapSize) {
      this.state.metrics.memoryMb = performance.memory.usedJSHeapSize / (1024 * 1024);
    }
  }

  render(dt) {
    this.uiRefreshAccumulator += dt;
    if (this.uiRefreshAccumulator >= this.uiRefreshIntervalSec) {
      this.hud.render();
      this.inspector.render();
      this.eventPanel.render();
      this.performancePanel.render();
      this.developerPanel.render();
      this.toolbar.sync();
      this.uiRefreshAccumulator = 0;
    }
    this.renderer.render(dt);
  }

  setExtraWorkers(extraCount) {
    const safeCount = Math.max(0, Math.min(500, extraCount | 0));
    const baseWorkers = this.state.agents.filter((a) => a.type === ENTITY_TYPE.WORKER && !a.isStressWorker);
    const stressWorkers = this.state.agents.filter((a) => a.type === ENTITY_TYPE.WORKER && a.isStressWorker);
    const nonWorkers = this.state.agents.filter((a) => a.type !== ENTITY_TYPE.WORKER);

    if (stressWorkers.length < safeCount) {
      const addCount = safeCount - stressWorkers.length;
      for (let i = 0; i < addCount; i += 1) {
        const tile = randomPassableTile(this.state.grid);
        const p = tileToWorld(tile.ix, tile.iz, this.state.grid);
        const worker = createWorker(p.x, p.z);
        worker.isStressWorker = true;
        stressWorkers.push(worker);
      }
    } else if (stressWorkers.length > safeCount) {
      stressWorkers.length = safeCount;
    }

    this.state.agents = [...baseWorkers, ...stressWorkers, ...nonWorkers];
    this.state.controls.stressExtraWorkers = safeCount;
    this.state.controls.actionMessage = `Set stress workers to ${safeCount}.`;
    this.state.controls.actionKind = "success";
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
      const tile = randomPassableTile(this.state.grid);
      const pos = tileToWorld(tile.ix, tile.iz, this.state.grid);
      return createWorker(pos.x, pos.z);
    });

    const nextVisitors = resizeList(visitors, safeTargets.visitors, (i) => {
      const tile = randomPassableTile(this.state.grid);
      const pos = tileToWorld(tile.ix, tile.iz, this.state.grid);
      const kind = i % 5 === 0 ? VISITOR_KIND.TRADER : VISITOR_KIND.SABOTEUR;
      return createVisitor(pos.x, pos.z, kind);
    });

    const nextHerbivores = resizeList(herbivores, safeTargets.herbivores, () => {
      const tile = randomPassableTile(this.state.grid);
      const pos = tileToWorld(tile.ix, tile.iz, this.state.grid);
      return createAnimal(pos.x, pos.z, ANIMAL_KIND.HERBIVORE);
    });

    const nextPredators = resizeList(predators, safeTargets.predators, () => {
      const tile = randomPassableTile(this.state.grid);
      const pos = tileToWorld(tile.ix, tile.iz, this.state.grid);
      return createAnimal(pos.x, pos.z, ANIMAL_KIND.PREDATOR);
    });

    this.state.agents = [...nextWorkers, ...stressWorkers, ...nextVisitors];
    this.state.animals = [...nextHerbivores, ...nextPredators];
    this.state.controls.populationTargets = { ...safeTargets };

    if (this.state.controls.selectedEntityId) {
      const exists = this.state.agents.some((a) => a.id === this.state.controls.selectedEntityId)
        || this.state.animals.some((a) => a.id === this.state.controls.selectedEntityId);
      if (!exists) this.state.controls.selectedEntityId = null;
    }

    this.state.controls.actionMessage = `Population applied: W${safeTargets.workers} V${safeTargets.visitors} H${safeTargets.herbivores} P${safeTargets.predators}.`;
    this.state.controls.actionKind = "success";
  }

  startBenchmark() {
    if (this.benchmark.running) return;
    if (this.state.controls.isPaused) {
      this.state.controls.actionMessage = "Resume simulation before benchmark.";
      this.state.controls.actionKind = "error";
      return;
    }

    this.benchmark.running = true;
    this.benchmark.stageIndex = 0;
    this.benchmark.stageElapsedSec = 0;
    this.benchmark.sampleCount = 0;
    this.benchmark.sumFps = 0;
    this.benchmark.sumFrameMs = 0;
    this.benchmark.results = [];
    this.benchmark.csv = "";
    this.state.metrics.benchmarkCsvReady = false;

    this.setExtraWorkers(this.benchmark.schedule[0]);
    this.state.metrics.benchmarkStatus = `running load=${this.benchmark.schedule[0]}`;
    this.state.controls.actionMessage = "Benchmark started.";
    this.state.controls.actionKind = "info";
  }

  cancelBenchmark() {
    this.benchmark.running = false;
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

    this.benchmark.stageElapsedSec += dt;
    const load = this.benchmark.schedule[this.benchmark.stageIndex];

    if (this.benchmark.stageElapsedSec >= this.benchmark.sampleStartSec) {
      this.benchmark.sampleCount += 1;
      this.benchmark.sumFps += this.state.metrics.averageFps;
      this.benchmark.sumFrameMs += this.state.metrics.frameMs;
    }

    if (this.benchmark.stageElapsedSec < this.benchmark.stageDurationSec) {
      const remain = Math.max(0, this.benchmark.stageDurationSec - this.benchmark.stageElapsedSec);
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

    if (this.benchmark.stageIndex >= this.benchmark.schedule.length) {
      this.benchmark.running = false;
      this.benchmark.csv = this.buildBenchmarkCsv();
      this.state.metrics.benchmarkCsvReady = true;
      this.state.metrics.benchmarkStatus = "done (csv ready)";
      return;
    }

    const nextLoad = this.benchmark.schedule[this.benchmark.stageIndex];
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
  }

  setTimeScale(scale) {
    const clamped = Math.max(0.25, Math.min(2.0, Number(scale) || 1));
    this.state.controls.timeScale = clamped;
    this.state.controls.actionMessage = `Time scale ${clamped.toFixed(2)}x`;
    this.state.controls.actionKind = "info";
  }

  setDoctrine(doctrineId) {
    this.state.controls.doctrine = doctrineId;
    this.state.controls.actionMessage = `Doctrine set to ${doctrineId}.`;
    this.state.controls.actionKind = "info";
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
    next.controls.populationTargets = { ...this.state.controls.populationTargets };
    next.controls.terrainTuning = { ...(terrainTuning ?? next.controls.terrainTuning ?? this.state.controls.terrainTuning) };

    deepReplaceObject(this.state, next);

    this.systems = this.createSystems();
    this.services.pathCache.clear();
    this.accumulatorSec = 0;
    this.systemProfileCounter = 0;

    this.benchmark.running = false;
    this.benchmark.csv = "";
    this.state.metrics.benchmarkCsvReady = false;
    this.state.metrics.benchmarkStatus = "idle";

    this.state.controls.actionMessage = `Regenerated map: ${this.state.world.mapTemplateName} (seed ${this.state.world.mapSeed})`;
    this.state.controls.actionKind = "success";
  }

  start() {
    this.loop.start();
  }
}
