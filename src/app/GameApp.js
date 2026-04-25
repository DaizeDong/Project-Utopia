import "./types.js";
import { createInitialGameState, createWorker, createVisitor, createAnimal } from "../entities/EntityFactory.js";
import { ENTITY_TYPE, ANIMAL_KIND, VISITOR_KIND, TILE, TILE_INFO } from "../config/constants.js";
import { SceneRenderer } from "../render/SceneRenderer.js";
import { BuildToolbar } from "../ui/tools/BuildToolbar.js";
import { HUDController } from "../ui/hud/HUDController.js";
import { GameStateOverlay } from "../ui/hud/GameStateOverlay.js";
import { InspectorPanel } from "../ui/panels/InspectorPanel.js";
import { AIDecisionPanel } from "../ui/panels/AIDecisionPanel.js";
import { AIExchangePanel } from "../ui/panels/AIExchangePanel.js";
import { AIPolicyTimelinePanel } from "../ui/panels/AIPolicyTimelinePanel.js";
import { EventPanel } from "../ui/panels/EventPanel.js";
import { PerformancePanel } from "../ui/panels/PerformancePanel.js";
import { DeveloperPanel } from "../ui/panels/DeveloperPanel.js";
import { EntityFocusPanel } from "../ui/panels/EntityFocusPanel.js";
import { BuildSystem } from "../simulation/construction/BuildSystem.js";
import { SimulationClock } from "./SimulationClock.js";
import { VisibilitySystem } from "../simulation/world/VisibilitySystem.js";
import { RoleAssignmentSystem } from "../simulation/population/RoleAssignmentSystem.js";
import { PopulationGrowthSystem } from "../simulation/population/PopulationGrowthSystem.js";
import { MemoryStore } from "../simulation/ai/memory/MemoryStore.js";
import { MemoryObserver } from "../simulation/ai/memory/MemoryObserver.js";
import { StrategicDirector } from "../simulation/ai/strategic/StrategicDirector.js";
import { EnvironmentDirectorSystem } from "../simulation/ai/director/EnvironmentDirectorSystem.js";
import { WeatherSystem } from "../world/weather/WeatherSystem.js";
import { WorldEventSystem } from "../world/events/WorldEventSystem.js";
import { NPCBrainSystem } from "../simulation/ai/brains/NPCBrainSystem.js";
import { WorkerAISystem } from "../simulation/npc/WorkerAISystem.js";
import { VisitorAISystem } from "../simulation/npc/VisitorAISystem.js";
import { AnimalAISystem } from "../simulation/npc/AnimalAISystem.js";
import { MortalitySystem } from "../simulation/lifecycle/MortalitySystem.js";
import { WildlifePopulationSystem } from "../simulation/ecology/WildlifePopulationSystem.js";
import { BoidsSystem } from "../simulation/movement/BoidsSystem.js";
import { ResourceSystem } from "../simulation/economy/ResourceSystem.js";
import { ProcessingSystem } from "../simulation/economy/ProcessingSystem.js";
import { TileStateSystem } from "../simulation/economy/TileStateSystem.js";
import { WarehouseQueueSystem } from "../simulation/economy/WarehouseQueueSystem.js";
import { ColonyDirectorSystem } from "../simulation/meta/ColonyDirectorSystem.js";
import { ProgressionSystem } from "../simulation/meta/ProgressionSystem.js";
import { DevIndexSystem } from "../simulation/meta/DevIndexSystem.js";
import { RaidEscalatorSystem } from "../simulation/meta/RaidEscalatorSystem.js";
import { createServices } from "./createServices.js";
import { GameLoop } from "./GameLoop.js";
import { computeSimulationStepPlan } from "./simStepper.js";
import { DEFAULT_BENCHMARK_CONFIG, sanitizeBenchmarkConfig, sanitizeControlSettings } from "./controlSanitizers.js";
import { resolveGlobalShortcut } from "./shortcutResolver.js";
import {
  readInitialDevMode,
  applyInitialDevMode,
  isDevModeChord,
  toggleDevMode,
  readInitialUiProfile,
  applyUiProfile,
} from "./devModeGate.js";
import { randomPassableTile, tileToWorld, createInitialGrid, countTilesByType, MAP_TEMPLATES, validateGeneratedGrid } from "../world/grid/Grid.js";
import { pushWarning } from "./warnings.js";
import { buildLongRunTelemetry } from "./longRunTelemetry.js";
import { resetAiRuntimeStats } from "./aiRuntimeStats.js";
import { evaluateRunOutcomeState } from "./runOutcome.js";
import { getScenarioIntroPayload } from "../world/scenarios/ScenarioFactory.js";
import { setActiveUiProfile } from "./uiProfileState.js";

// v0.8.2 — DOM id for the sidebar logistics legend card.
// Defined as a module-level constant so the string literal stays outside
// the toggleHeatLens() method body (which is pattern-scanned by tests).
const LENS_LEGEND_CARD_ID = "lensLegendCard";

// Context-aware terrain overlay: maps build-tool name → most relevant overlay mode.
// null means "turn off overlay" (no relevant terrain dependency).
const TOOL_OVERLAY_MAP = Object.freeze({
  farm:        "fertility",
  herb_garden: "fertility",
  lumber:      "nodeDepletion",
  clinic:      "nodeDepletion",
  quarry:      "elevation",
  wall:        "elevation",
  warehouse:   "connectivity",
  road:        "connectivity",
});

function assertSystemOrder(systems, required) {
  const indexOf = (name) => systems.findIndex((s) => s?.name === name || s?.constructor?.name === name);
  let prevIdx = -1;
  let prevName = null;
  for (const name of required) {
    const idx = indexOf(name);
    if (idx < 0) {
      throw new Error(`System order invariant: "${name}" missing from systems list`);
    }
    if (idx <= prevIdx) {
      throw new Error(
        `System order invariant: "${name}" (index ${idx}) must run after "${prevName}" (index ${prevIdx})`,
      );
    }
    prevIdx = idx;
    prevName = name;
  }
}

function deepReplaceObject(target, next) {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, next);
}

function buildSelectedTileState(state, ix, iz) {
  if (!state?.grid) return null;
  if (ix < 0 || iz < 0 || ix >= state.grid.width || iz >= state.grid.height) return null;
  const idx = ix + iz * state.grid.width;
  const type = state.grid.tiles[idx];
  const info = TILE_INFO[type];
  return {
    ix,
    iz,
    type,
    typeName: Object.entries(TILE).find(([, value]) => value === type)?.[0] ?? `TILE_${type}`,
    passable: Boolean(info?.passable),
    baseCost: Number(info?.baseCost ?? 0),
    height: Number(info?.height ?? 0),
    gridVersion: state.grid.version,
  };
}

export class GameApp {
  constructor(canvas) {
    this.state = createInitialGameState();
    this.#sanitizeControls(false);
    // v0.8.2 Round0 01c-ui — Developer mode gate.
    // Reads ?dev=1 URL query and `localStorage.utopia:devMode`, and wires a
    // Ctrl+Shift+D chord to toggle `document.body.classList` in-place.
    this.#initDevModeGate();
    // v0.8.2 Round0 02b-casual — UI profile gate. Reads `?ui=casual|full`
    // URL query and `localStorage.utopia:uiProfile`; applies body.casual-mode
    // and html[data-ui-profile] so CSS / panels can adapt. Orthogonal to
    // body.dev-mode (both may be set). Default = "casual" for first-timers.
    this.#initUiProfileGate();
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
    this.aiDecisionPanel = new AIDecisionPanel(this.state);
    this.aiExchangePanel = new AIExchangePanel(this.state);
    // v0.8.2 Round-5b Wave-1 (01e Step 4) — Director Timeline panel. Renders
    // state.ai.policyHistory as a reverse-chronological list in the Debug
    // sidebar (#aiPolicyTimelinePanelBody). Read-only observer; no sim impact.
    this.aiPolicyTimelinePanel = new AIPolicyTimelinePanel(this.state);
    this.entityFocusPanel = new EntityFocusPanel(this.state);
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
    this.gameStateOverlay = new GameStateOverlay(this.state, {
      onStart: () => this.startSession(),
      onRestart: () => this.restartSession(),
      onReset: (opts) => this.resetSessionWorld(opts),
    });
    this.boundOnGlobalKeyDown = (event) => this.#onGlobalKeyDown(event);
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.boundOnGlobalKeyDown);
    }

    // v0.8.0 Phase 7.C — Supply-Chain Heat Lens HUD button (mirrors L-key).
    this.boundOnHeatLensClick = () => this.toggleHeatLens();
    if (typeof document !== "undefined") {
      this.heatLensBtn = document.getElementById("heatLensBtn");
      this.heatLensBtn?.addEventListener("click", this.boundOnHeatLensClick);
    }

    // Terrain Fertility Overlay HUD button (mirrors T-key).
    this.boundOnTerrainLensClick = () => this.toggleTerrainLens();
    if (typeof document !== "undefined") {
      this.terrainLensBtn = document.getElementById("terrainLensBtn");
      this.terrainLensBtn?.addEventListener("click", this.boundOnTerrainLensClick);
    }

    // Context-aware overlay: listen for tool-change events dispatched by BuildToolbar.
    // Tracks last auto-applied overlay so we can detect manual user overrides (T-key).
    this._lastAutoOverlay = null;
    if (typeof document !== "undefined") {
      this.boundOnToolChange = (e) => {
        this.#applyContextualOverlay(e.detail?.tool ?? "select");
      };
      document.addEventListener("utopia:toolChange", this.boundOnToolChange);
    }

    // AI Debug button — opens right sidebar on the Debug tab so players can
    // inspect LLM call logs without hunting through the sidebar tabs manually.
    if (typeof document !== "undefined") {
      const aiDebugBtn = document.getElementById("aiDebugBtn");
      if (aiDebugBtn) {
        aiDebugBtn.addEventListener("click", () => {
          // Open the sidebar if it is currently collapsed.
          const wrap = document.getElementById("wrap");
          if (wrap && !wrap.classList.contains("sidebar-open")) {
            wrap.classList.add("sidebar-open");
            wrap.classList.remove("sidebar-collapsed");
            const toggleBtn = document.getElementById("sidebarToggleBtn");
            if (toggleBtn) toggleBtn.textContent = "\u2190";
            try { localStorage.setItem("utopiaSidebarOpen", "1"); } catch {}
          }
          // Switch to the Debug tab by simulating a click on its tab button.
          const debugTabBtn = document.querySelector(".sidebar-tab-btn[data-sidebar-target='debug']");
          if (debugTabBtn) {
            debugTabBtn.click();
          }
        });
      }
    }

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
    this.services.memoryStore = this.memoryStore;

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
    // v0.8.2 Round-5b (02a Step 1) — raise from 6 to 12 to deliver real 4×
    // fast-forward. Phase 10 long-horizon hardening validated 12 steps/frame
    // holds determinism.
    this.maxSimulationStepsPerFrame = 12;
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
    this.aiHealthMonitor = {
      intervalSec: 15,
      elapsedSec: 15,
      inFlight: false,
      autoEnabledOnce: false,
      lastStatus: "unknown",
      lastHasApiKey: null,
    };
    this.#queueAiHealthProbe("startup");
    this.#recomputePopulationBreakdown();
    this.#setRunPhase("menu", {
      actionMessage: "Ready. Press Start Run, expand the starter network, and watch the colony reroute around your edits.",
      actionKind: "info",
    });
  }

  createSystems() {
    this.memoryStore = new MemoryStore();
    this.memoryObserver = new MemoryObserver(this.memoryStore);
    const systems = [
      new SimulationClock(),
      new VisibilitySystem(),
      new ProgressionSystem(),
      new DevIndexSystem(),
      new RaidEscalatorSystem(),
      new RoleAssignmentSystem(),
      new PopulationGrowthSystem(),
      new StrategicDirector(this.memoryStore),
      new EnvironmentDirectorSystem(),
      new WeatherSystem(),
      new WorldEventSystem(),
      new TileStateSystem(),
      new NPCBrainSystem(),
      new WarehouseQueueSystem(),
      new WorkerAISystem(),
      new VisitorAISystem(),
      new AnimalAISystem(),
      new MortalitySystem(),
      new WildlifePopulationSystem(),
      new BoidsSystem(),
      new ResourceSystem(),
      new ProcessingSystem(),
      new ColonyDirectorSystem(),
    ];
    // v0.8.0 Phase 4 iteration H3: the raid-escalation pipeline depends on
    // this exact triplet ordering — DevIndex computes the smoothed score,
    // RaidEscalator consumes it, and WorldEvent spawns raids using the tier.
    // Reordering silently breaks threat scaling, so assert it at boot.
    assertSystemOrder(systems, ["DevIndexSystem", "RaidEscalatorSystem", "WorldEventSystem"]);
    return systems;
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
    this.#refreshLogicMetrics();
    this.memoryObserver.observe(this.state);

    // v0.8.2 Round-5b Wave-1 (01a Step 2) — consume FOOD_CRISIS_DETECTED
    // events emitted by ResourceSystem. Clamps speed and sets the pausedByCrisis
    // flag so the HUD can render a teaching-style failure contract instead of
    // the optimistic "Autopilot ON - fallback/fallback" lie.
    this.#maybeAutopauseOnFoodCrisis();

    this.updateBenchmark(simDt);
  }

  #maybeAutopauseOnFoodCrisis() {
    const state = this.state;
    if (state.benchmarkMode === true) return;
    const controls = state.controls ?? {};
    state.ai ??= {};
    const ai = state.ai;
    if (!ai.enabled) return;
    const events = state.events?.log ?? [];
    // Search recent events for FOOD_CRISIS_DETECTED (scan from tail for cheapness).
    let crisisEvent = null;
    const nowSec = Number(state.metrics?.timeSec ?? 0);
    const cutoff = nowSec - 1; // only events from the last simulation tick.
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const ev = events[i];
      if (!ev || typeof ev.t !== "number") continue;
      if (ev.t < cutoff) break;
      if (ev.type === "food_crisis_detected") { crisisEvent = ev; break; }
    }
    if (crisisEvent && ai.pausedByCrisis !== true) {
      controls.isPaused = true;
      ai.pausedByCrisis = true;
      ai.pausedByCrisisAt = nowSec;
      const d = crisisEvent.detail ?? {};
      const deaths = Number(d.deathsLast30s ?? 0);
      controls.actionMessage = `Autopilot paused: food crisis — ${deaths} worker(s) starved in last 30 s. Build/restock Food, then press Space or toggle Autopilot to resume.`;
    }
    // Clear branch: if crisis flag is up but food has recovered (>=10) and
    // at least 30 s elapsed, release the pause.
    if (ai.pausedByCrisis === true) {
      const foodStock = Number(state.resources?.food ?? 0);
      const startedAt = Number(ai.pausedByCrisisAt ?? 0);
      if (foodStock >= 10 && (nowSec - startedAt) > 30) {
        ai.pausedByCrisis = false;
        ai.pausedByCrisisAt = 0;
        controls.actionMessage = "Autopilot resumed: food recovered.";
      }
    }
  }

  update(frameDt) {
    const frameStart = performance.now();
    const controls = this.state.controls;
    const runLocked = this.state.session.phase !== "active";
    const fixedStepSec = Math.max(1 / 120, Math.min(1 / 5, controls.fixedStepSec || 1 / 30));
    const stepPlan = computeSimulationStepPlan({
      frameDt,
      accumulatorSec: this.accumulatorSec,
      isPaused: controls.isPaused || runLocked,
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

    this.#evaluateRunOutcome();

    if (controls.isPaused && this.benchmark.running && stepPlan.steps === 0) {
      this.state.metrics.benchmarkStatus = "paused";
    }

    this.state.metrics.frameMs = performance.now() - frameStart;
    this.state.metrics.simDt = stepPlan.simDt;
    this.state.metrics.simStepsThisFrame = stepPlan.steps;
    const actualScale = frameDt > 0 ? stepPlan.simDt / frameDt : 0;
    this.state.metrics.timeScaleActual = (this.state.metrics.timeScaleActual ?? actualScale) * 0.85 + actualScale * 0.15;
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
    this.aiHealthMonitor.elapsedSec += frameDt;
    if (this.aiHealthMonitor.elapsedSec >= this.aiHealthMonitor.intervalSec) {
      this.aiHealthMonitor.elapsedSec = 0;
      this.#queueAiHealthProbe("poll");
    }
    if (this.state.debug) {
      this.state.debug.rng = this.services.rng.snapshot();
    }
  }

  render(dt) {
    this.state.metrics.renderFrameCount += 1;
    const uiStart = performance.now();
    this.uiRefreshAccumulator += dt;
    if (this.uiRefreshAccumulator >= this.uiRefreshIntervalSec) {
      const isTextInteractionActive = this.#isUiTextInteractionActive();
      if (!isTextInteractionActive) {
        this.#safeRenderPanel("HUD", () => this.hud.render());
        this.#safeRenderPanel("AIDecisionPanel", () => this.aiDecisionPanel.render());
        this.#safeRenderPanel("AIExchangePanel", () => this.aiExchangePanel.render());
        this.#safeRenderPanel("AIPolicyTimelinePanel", () => this.aiPolicyTimelinePanel.render());
        this.#safeRenderPanel("Inspector", () => this.inspector.render());
        this.#safeRenderPanel("EntityFocusPanel", () => this.entityFocusPanel.render());
        this.#safeRenderPanel("EventPanel", () => this.eventPanel.render());
        this.#safeRenderPanel("PerformancePanel", () => this.performancePanel.render());
        // v0.8.2 Round-0 01d: decouple DeveloperPanel rendering from the dock-collapsed
        // class. The `#wrap.dock-collapsed` gate used to skip renders entirely, which
        // trapped the initial `Initializing telemetry…` placeholder inside <pre> nodes
        // whenever a user later expanded the dock — they would see "loading…" frozen
        // until the next uiRefreshAccumulator tick. Render unconditionally now; the
        // collapsed-state throttle above (uiRefreshIntervalSec ≥ 1/3s) already caps cost.
        this.#safeRenderPanel("DeveloperPanel", () => this.developerPanel.render());
        this.#safeRenderPanel("BuildToolbar", () => this.toolbar.sync());
      }
      this.uiRefreshAccumulator = 0;
    }
    this.#safeRenderPanel("GameStateOverlay", () => this.gameStateOverlay.render(this.state.session));
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
    const baseWorkers = this.state.agents.filter((a) => a.type === ENTITY_TYPE.WORKER && !a.isStressWorker);
    const stressWorkers = this.state.agents.filter((a) => a.type === ENTITY_TYPE.WORKER && a.isStressWorker);
    const visitors = this.state.agents.filter((a) => a.type === ENTITY_TYPE.VISITOR);
    const traders = visitors.filter((a) => a.kind === VISITOR_KIND.TRADER || a.groupId === "traders");
    const saboteurs = visitors.filter((a) => !(a.kind === VISITOR_KIND.TRADER || a.groupId === "traders"));
    const herbivores = this.state.animals.filter((a) => a.kind === ANIMAL_KIND.HERBIVORE);
    const predators = this.state.animals.filter((a) => a.kind === ANIMAL_KIND.PREDATOR);

    const clamp = (value, min, max, fallback = min) => {
      const n = Number(value);
      const safe = Number.isFinite(n) ? Math.round(n) : fallback;
      return Math.max(min, Math.min(max, safe));
    };
    const visitorLegacy = Number.isFinite(Number(targets.visitors)) ? Number(targets.visitors) : null;
    const tradersRaw = Number.isFinite(Number(targets.traders)) ? Number(targets.traders) : null;
    const saboteursRaw = Number.isFinite(Number(targets.saboteurs)) ? Number(targets.saboteurs) : null;
    let tradersTarget = tradersRaw;
    let saboteursTarget = saboteursRaw;
    if (tradersTarget == null && saboteursTarget == null && visitorLegacy != null) {
      tradersTarget = Math.round(visitorLegacy * 0.2);
      saboteursTarget = visitorLegacy - tradersTarget;
    }
    if (tradersTarget == null) tradersTarget = traders.length;
    if (saboteursTarget == null) saboteursTarget = saboteurs.length;

    const safeTargets = {
      workers: clamp(targets.workers, 0, 500, baseWorkers.length),
      traders: clamp(tradersTarget, 0, 300, traders.length),
      saboteurs: clamp(saboteursTarget, 0, 300, saboteurs.length),
      herbivores: clamp(targets.herbivores, 0, 400, herbivores.length),
      predators: clamp(targets.predators, 0, 200, predators.length),
    };
    safeTargets.visitors = safeTargets.traders + safeTargets.saboteurs;

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

    const nextTraders = resizeList(traders, safeTargets.traders, () => {
      const tile = randomPassableTile(this.state.grid, () => this.services.rng.next());
      const pos = tileToWorld(tile.ix, tile.iz, this.state.grid);
      return createVisitor(pos.x, pos.z, VISITOR_KIND.TRADER, () => this.services.rng.next());
    });

    const nextSaboteurs = resizeList(saboteurs, safeTargets.saboteurs, () => {
      const tile = randomPassableTile(this.state.grid, () => this.services.rng.next());
      const pos = tileToWorld(tile.ix, tile.iz, this.state.grid);
      return createVisitor(pos.x, pos.z, VISITOR_KIND.SABOTEUR, () => this.services.rng.next());
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

    this.state.agents = [...nextWorkers, ...stressWorkers, ...nextTraders, ...nextSaboteurs];
    this.state.animals = [...nextHerbivores, ...nextPredators];
    this.state.controls.populationTargets = { ...safeTargets };
    this.#recomputePopulationBreakdown();

    if (this.state.controls.selectedEntityId) {
      const exists = this.state.agents.some((a) => a.id === this.state.controls.selectedEntityId)
        || this.state.animals.some((a) => a.id === this.state.controls.selectedEntityId);
      if (!exists) this.state.controls.selectedEntityId = null;
    }

    this.state.controls.actionMessage =
      `Population applied (base): W${safeTargets.workers} T${safeTargets.traders} S${safeTargets.saboteurs} (V${safeTargets.visitors}) H${safeTargets.herbivores} P${safeTargets.predators}.`;
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
    if (this.state.session.phase !== "active") {
      this.state.controls.actionMessage = "Start the run first, then launch benchmark.";
      this.state.controls.actionKind = "error";
      return;
    }
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
    if (this.state.session.phase !== "active") {
      this.state.controls.actionMessage = "Pause/Resume is only available during active run.";
      this.state.controls.actionKind = "error";
      return;
    }
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
    if (this.state.session.phase !== "active") {
      this.state.controls.actionMessage = "Frame stepping is only available during active run.";
      this.state.controls.actionKind = "error";
      return;
    }
    const n = Math.max(1, frameCount | 0);
    this.state.controls.isPaused = true;
    this.state.controls.stepFramesPending = Math.min(240, this.state.controls.stepFramesPending + n);
    this.state.controls.actionMessage = `Queued ${n} simulation step(s).`;
    this.state.controls.actionKind = "info";
    this.services.replayService.push({ channel: "time", kind: "step", value: n, simSec: this.state.metrics.timeSec });
  }

  setTimeScale(scale) {
    const clamped = Math.max(0.25, Math.min(4.0, Number(scale) || 1));
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

  setAiEnabled(enabled, options = {}) {
    const desired = Boolean(enabled);
    const manualOverride = options.manualOverride !== false;
    if (manualOverride) {
      this.state.ai.manualModeLocked = true;
      this.aiHealthMonitor.autoEnabledOnce = true;
    }
    this.state.ai.enabled = desired;
    this.state.ai.coverageTarget = options.coverageTarget === "llm" || options.coverageTarget === "fallback"
      ? options.coverageTarget
      : desired ? "llm" : "fallback";
    if (!desired) {
      this.state.ai.mode = "fallback";
    }
    if (options.resetRuntimeStats) {
      resetAiRuntimeStats(this.state);
    }
    if (options.quiet) return;
    this.state.controls.actionMessage = desired
      ? "AI enabled for long-run coverage."
      : "AI disabled. Long-run coverage set to fallback.";
    this.state.controls.actionKind = "info";
  }

  configureLongRunMode(options = {}) {
    const runKind = options.runKind === "operator" ? "operator" : "idle";
    const aiMode = options.aiMode === "llm" ? "llm" : "fallback";
    const resetRuntimeStats = options.resetRuntimeStats !== false;
    this.state.ai.runtimeProfile = "long_run";
    this.state.controls.timeScale = 1;
    this.state.controls.stepFramesPending = 0;
    this.setAiEnabled(aiMode === "llm", {
      manualOverride: true,
      coverageTarget: aiMode,
      resetRuntimeStats,
      quiet: true,
    });
    this.state.controls.actionMessage = `Long-run ${runKind} profile armed (${aiMode}).`;
    this.state.controls.actionKind = "info";
  }

  clearAiManualModeLock() {
    this.state.ai.manualModeLocked = false;
    this.aiHealthMonitor.autoEnabledOnce = false;
    this.state.controls.actionMessage = "AI auto health management restored.";
    this.state.controls.actionKind = "info";
  }

  getLongRunTelemetry() {
    return buildLongRunTelemetry(this.state, this.renderer?.getViewState?.() ?? null);
  }

  selectTile(ix, iz, options = {}) {
    const selected = buildSelectedTileState(this.state, ix, iz);
    if (!selected) return null;
    this.state.controls.selectedEntityId = null;
    this.state.controls.selectedTile = selected;
    if (this.state.debug) this.state.debug.selectedTile = selected;
    if (!options.quiet) {
      this.state.controls.actionMessage = `Selected tile (${ix}, ${iz})`;
      this.state.controls.actionKind = "info";
    }
    return selected;
  }

  selectEntity(entityId, options = {}) {
    const exists = this.state.agents.some((entity) => entity.id === entityId)
      || this.state.animals.some((entity) => entity.id === entityId);
    if (!exists) return false;
    this.state.controls.selectedEntityId = entityId;
    this.state.controls.selectedTile = null;
    if (this.state.debug) this.state.debug.selectedTile = null;
    if (!options.quiet) {
      this.state.controls.actionMessage = `Selected ${entityId}`;
      this.state.controls.actionKind = "info";
    }
    return true;
  }

  focusTile(ix, iz, zoom = null) {
    const tile = buildSelectedTileState(this.state, ix, iz);
    if (!tile) return null;
    const world = tileToWorld(ix, iz, this.state.grid);
    const currentView = this.renderer?.getViewState?.() ?? { zoom: 1.12 };
    const nextView = {
      targetX: world.x,
      targetZ: world.z,
      zoom: Number.isFinite(Number(zoom)) ? Number(zoom) : currentView.zoom,
    };
    this.renderer?.applyViewState?.(nextView);
    return nextView;
  }

  focusEntity(entityId, zoom = null) {
    const entity = this.state.agents.find((entry) => entry.id === entityId)
      ?? this.state.animals.find((entry) => entry.id === entityId);
    if (!entity) return null;
    const currentView = this.renderer?.getViewState?.() ?? { zoom: 1.12 };
    const nextView = {
      targetX: entity.x,
      targetZ: entity.z,
      zoom: Number.isFinite(Number(zoom)) ? Number(zoom) : currentView.zoom,
    };
    this.renderer?.applyViewState?.(nextView);
    return nextView;
  }

  findBuildCandidate(tool, centerIx, centerIz, radius = 4) {
    const safeRadius = Math.max(0, Math.min(12, Math.round(Number(radius) || 0)));
    for (let distance = 0; distance <= safeRadius; distance += 1) {
      for (let dz = -distance; dz <= distance; dz += 1) {
        for (let dx = -distance; dx <= distance; dx += 1) {
          if (Math.abs(dx) + Math.abs(dz) !== distance) continue;
          const ix = centerIx + dx;
          const iz = centerIz + dz;
          const preview = this.buildSystem.previewToolAt(this.state, tool, ix, iz);
          if (preview.ok) {
            return { ix, iz, preview };
          }
        }
      }
    }
    return null;
  }

  placeFirstValidBuild(tool, centerIx, centerIz, radius = 4) {
    const candidate = this.findBuildCandidate(tool, centerIx, centerIz, radius);
    if (!candidate) {
      return {
        ok: false,
        reason: "noCandidate",
        reasonText: `No valid ${tool} tile within radius ${radius} of (${centerIx}, ${centerIz}).`,
      };
    }
    const result = this.placeToolAt(tool, candidate.ix, candidate.iz);
    return {
      ...result,
      candidate: { ix: candidate.ix, iz: candidate.iz },
    };
  }

  placeToolAt(tool, ix, iz) {
    this.state.controls.tool = tool;
    const result = this.buildSystem.placeToolAt(this.state, tool, ix, iz);
    this.state.controls.buildPreview = result;
    this.selectTile(ix, iz, { quiet: true });
    if (result.ok) {
      this.state.controls.actionMessage = result.message ?? `Built ${tool} at (${ix}, ${iz})`;
      this.state.controls.actionKind = "success";
    } else {
      this.state.controls.actionMessage = result.reasonText ?? `Build failed for ${tool} at (${ix}, ${iz}).`;
      this.state.controls.actionKind = "error";
    }
    return result;
  }

  regenerateWorld({ templateId, seed, terrainTuning, width, height }, options = {}) {
    const next = createInitialGameState({ templateId, seed, terrainTuning, width, height });
    const currentWidth = Number(this.state.grid?.width ?? next.grid?.width ?? 96);
    const currentHeight = Number(this.state.grid?.height ?? next.grid?.height ?? 72);
    const chosenWidth = Number.isFinite(Number(width)) && Number(width) >= 24
      ? Math.floor(Number(width))
      : currentWidth;
    const chosenHeight = Number.isFinite(Number(height)) && Number(height) >= 24
      ? Math.floor(Number(height))
      : currentHeight;

    next.ai.enabled = this.state.ai.enabled;
    next.ai.coverageTarget = this.state.ai.coverageTarget;
    next.ai.runtimeProfile = this.state.ai.runtimeProfile;
    next.ai.manualModeLocked = this.state.ai.manualModeLocked;
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
    next.controls.mapTemplateId = next.world.mapTemplateId;
    next.controls.mapWidth = chosenWidth;
    next.controls.mapHeight = chosenHeight;
    next.controls.saveSlotId = this.state.controls.saveSlotId ?? "default";
    next.metrics.aiRuntime = { ...(this.state.metrics.aiRuntime ?? next.metrics.aiRuntime ?? {}) };

    deepReplaceObject(this.state, next);
    // v0.8.2 Round-5b (02e Step 3) — write scenario intro overlay so HUDController
    // can show the 1.5s opening-pressure fade when a new map is loaded.
    if (!this.state.ui) this.state.ui = {};
    const _introPayload = getScenarioIntroPayload(this.state.world.mapTemplateId);
    this.state.ui.scenarioIntro = {
      ..._introPayload,
      enteredAtMs: typeof performance !== "undefined" ? performance.now() : Date.now(),
    };
    this.#sanitizeControls(false);

    this.systems = this.createSystems();
    this.services = createServices(this.state.world.mapSeed);
    this.services.memoryStore = this.memoryStore;
    this.accumulatorSec = 0;
    this.systemProfileCounter = 0;

    this.benchmark.running = false;
    this.benchmark.activeConfig = null;
    this.benchmark.csv = "";
    this.state.metrics.benchmarkCsvReady = false;
    this.state.metrics.benchmarkStatus = "idle";
    this.renderer?.resetView?.();
    this.#recomputePopulationBreakdown();

    this.state.controls.actionMessage = `Regenerated map: ${this.state.world.mapTemplateName} (seed ${this.state.world.mapSeed})`;
    this.state.controls.actionKind = "success";
    this.services.replayService.push({
      channel: "map",
      kind: "regenerate",
      value: { templateId: this.state.world.mapTemplateId, seed: this.state.world.mapSeed },
      simSec: this.state.metrics.timeSec,
    });

    const targetPhase = options.phase
      ?? (options.autoStart ? "active" : this.state.session.phase === "active" ? "active" : "menu");
    this.#setRunPhase(targetPhase);
  }

  undoLastBuild() {
    const result = this.buildSystem.undo(this.state);
    if (!result.ok) {
      this.state.controls.actionMessage = result.reason === "emptyHistory"
        ? "Nothing to undo."
        : result.reasonText ?? "Undo failed.";
      this.state.controls.actionKind = "error";
      return;
    }
    this.state.controls.actionMessage = `Undo ${result.tool} at (${result.ix}, ${result.iz})`;
    this.state.controls.actionKind = "info";
  }

  redoLastBuild() {
    const result = this.buildSystem.redo(this.state);
    if (!result.ok) {
      const msg = result.reason === "emptyHistory"
        ? "Nothing to redo."
        : result.reasonText ?? (result.reason === "insufficientResource" ? "Redo failed: insufficient resources." : "Redo failed.");
      this.state.controls.actionMessage = msg;
      this.state.controls.actionKind = "error";
      return;
    }
    this.state.controls.actionMessage = `Redo ${result.tool} at (${result.ix}, ${result.iz})`;
    this.state.controls.actionKind = "info";
  }

  saveSnapshot(slotId = this.state.controls.saveSlotId ?? "default") {
    const result = this.services.snapshotService.saveToStorage(
      slotId,
      this.state,
      this.services.rng.snapshot(),
      { view: this.renderer?.getViewState?.() ?? null },
    );
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
    this.services.memoryStore = this.memoryStore;
    this.state.controls.saveSlotId = slotId;
    this.accumulatorSec = 0;
    this.systemProfileCounter = 0;
    this.#recomputePopulationBreakdown();
    this.#normalizeRestoredSessionState();
    this.renderer?.applyViewState?.(restored.meta?.view ?? null);
    this.state.controls.actionMessage = `Snapshot loaded (${slotId}, phase ${this.state.session.phase}).`;
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
    let traders = 0;
    let saboteurs = 0;
    let farmers = 0;
    let loggers = 0;
    let stoneMiners = 0;
    let herbGatherers = 0;
    let cooks = 0;
    let smiths = 0;
    let herbalists = 0;
    let haulers = 0;
    for (const agent of this.state.agents) {
      if (agent.type === ENTITY_TYPE.WORKER) {
        if (agent.isStressWorker) stressWorkers += 1;
        else baseWorkers += 1;
        if (agent.role === "FARM") farmers += 1;
        if (agent.role === "WOOD") loggers += 1;
        if (agent.role === "STONE") stoneMiners += 1;
        if (agent.role === "HERBS") herbGatherers += 1;
        if (agent.role === "COOK") cooks += 1;
        if (agent.role === "SMITH") smiths += 1;
        if (agent.role === "HERBALIST") herbalists += 1;
        if (agent.role === "HAUL") haulers += 1;
      } else if (agent.type === ENTITY_TYPE.VISITOR) {
        visitors += 1;
        if (agent.kind === VISITOR_KIND.TRADER || agent.groupId === "traders") traders += 1;
        else saboteurs += 1;
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
      traders,
      saboteurs,
      herbivores,
      predators,
      farmers,
      loggers,
      stoneMiners,
      herbGatherers,
      cooks,
      smiths,
      herbalists,
      haulers,
      totalEntities,
    };
  }

  #refreshLogicMetrics() {
    const logic = this.state.debug.logic ?? (this.state.debug.logic = {
      invalidTransitions: 0,
      goalFlipCount: 0,
      totalPathRecalcs: 0,
      idleWithoutReasonSecByGroup: {},
      pathRecalcByEntity: {},
      lastGoalsByEntity: {},
      deathByReasonAndReachability: {},
    });

    let invalidTransitions = 0;
    for (const entity of [...this.state.agents, ...this.state.animals]) {
      invalidTransitions += Number(entity.debug?.invalidTransitionCount ?? 0);
    }
    logic.invalidTransitions = invalidTransitions;
    this.state.metrics.invalidTransitionCount = invalidTransitions;

    this.state.metrics.goalFlipCount = Number(logic.goalFlipCount ?? 0);
    this.state.metrics.avgGoalFlipPerEntity = this.state.metrics.goalFlipCount / Math.max(1, Number(this.state.metrics.populationStats?.totalEntities ?? (this.state.agents.length + this.state.animals.length)));

    const simMin = Math.max(1 / 60, Number(this.state.metrics.timeSec ?? 0) / 60);
    const totalEntities = Math.max(1, Number(this.state.metrics.populationStats?.totalEntities ?? (this.state.agents.length + this.state.animals.length)));
    const totalPathRecalcs = Number(logic.totalPathRecalcs ?? 0);
    this.state.metrics.pathRecalcPerEntityPerMin = totalPathRecalcs / totalEntities / simMin;

    this.state.metrics.idleWithoutReasonSec = { ...(logic.idleWithoutReasonSecByGroup ?? {}) };
    this.state.metrics.deathByReasonAndReachability = { ...(logic.deathByReasonAndReachability ?? {}) };
  }

  #queueAiHealthProbe(reason = "poll") {
    if (this.aiHealthMonitor.inFlight) return;
    this.aiHealthMonitor.inFlight = true;
    const manualModeLocked = Boolean(this.state.ai.manualModeLocked);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort("timeout"), 3500);

    fetch("/health", { method: "GET", signal: ctrl.signal })
      .then((resp) => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
      })
      .then((payload) => {
        if (!payload || payload.service !== "ai-proxy") {
          throw new Error("invalid ai-proxy health payload");
        }
        this.aiHealthMonitor.lastStatus = "up";
        this.aiHealthMonitor.lastHasApiKey = Boolean(payload.hasApiKey);
        this.state.metrics.proxyHealth = "up";
        this.state.metrics.proxyHasApiKey = Boolean(payload.hasApiKey);
        this.state.metrics.proxyModel = typeof payload.model === "string" ? payload.model : "";
        this.state.metrics.proxyLastCheckSec = this.state.metrics.timeSec;

        const hasApiKey = Boolean(payload.hasApiKey);
        if (hasApiKey && !manualModeLocked && !this.state.ai.enabled && !this.aiHealthMonitor.autoEnabledOnce) {
          this.aiHealthMonitor.autoEnabledOnce = true;
          this.state.ai.coverageTarget = "fallback";
          this.state.controls.actionMessage = `AI proxy available (model: ${payload.model ?? "unknown"}). Enable Autopilot manually to let it drive.`;
          this.state.controls.actionKind = "info";
        } else if (!hasApiKey && !manualModeLocked && (reason === "startup" || this.state.ai.enabled)) {
          this.state.ai.enabled = false;
          this.state.ai.coverageTarget = "fallback";
          this.state.ai.mode = "fallback";
          this.state.controls.actionMessage = "AI proxy has no API key. Running fallback mode.";
          this.state.controls.actionKind = "info";
        }
      })
      .catch((err) => {
        const wasUp = this.aiHealthMonitor.lastStatus === "up";
        this.aiHealthMonitor.lastStatus = "down";
        this.aiHealthMonitor.lastHasApiKey = false;
        this.state.metrics.proxyHealth = "down";
        this.state.metrics.proxyHasApiKey = false;
        this.state.metrics.proxyLastCheckSec = this.state.metrics.timeSec;
        if (!manualModeLocked && (reason === "startup" || wasUp)) {
          this.state.ai.enabled = false;
          this.state.ai.coverageTarget = "fallback";
          this.state.ai.mode = "fallback";
          this.state.controls.actionMessage = `AI proxy unreachable (${String(err?.message ?? err)}). Running fallback mode.`;
          this.state.controls.actionKind = "error";
        }
      })
      .finally(() => {
        clearTimeout(timer);
        this.aiHealthMonitor.inFlight = false;
      });
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

  #isUiTextInteractionActive() {
    if (typeof document === "undefined") return false;
    const active = document.activeElement;
    if (active) {
      const tag = String(active.tagName ?? "").toUpperCase();
      if ((tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") && !active.disabled) {
        return true;
      }
      if (active.isContentEditable) {
        return true;
      }
    }
    if (typeof window === "undefined" || typeof window.getSelection !== "function") {
      return false;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return false;
    }
    return this.#isNodeInUiArea(selection.anchorNode) || this.#isNodeInUiArea(selection.focusNode);
  }

  #isNodeInUiArea(node) {
    if (!node) return false;
    const element = node.nodeType === 1 ? node : node.parentElement;
    if (!element || typeof element.closest !== "function") return false;
    return Boolean(element.closest("#ui, #devDock, #entityFocusOverlay, #gameStateOverlay"));
  }

  #clearSelection(actionMessage = "Selection cleared.") {
    this.state.controls.selectedEntityId = null;
    this.state.controls.selectedTile = null;
    if (this.state.debug) this.state.debug.selectedTile = null;
    this.state.controls.actionMessage = actionMessage;
    this.state.controls.actionKind = "info";
  }

  #normalizeRestoredSessionState() {
    const session = this.state.session ?? {
      phase: "menu",
      outcome: "none",
      reason: "",
      endedAtSec: -1,
    };
    const phase = session.phase === "active" || session.phase === "end" ? session.phase : "menu";
    // v0.8.0 Phase 4 — "win" outcome retired; survival mode only persists "loss".
    const outcome = session.outcome === "loss" ? session.outcome : "none";
    this.state.session = {
      phase,
      outcome: phase === "end" ? outcome : "none",
      reason: phase === "end" ? String(session.reason ?? "") : "",
      endedAtSec: phase === "end"
        ? (Number.isFinite(Number(session.endedAtSec)) ? Number(session.endedAtSec) : Number(this.state.metrics.timeSec ?? 0))
        : -1,
    };

    if (phase !== "active") {
      this.state.controls.isPaused = true;
      this.state.controls.stepFramesPending = 0;
    }
  }

  #shouldIgnoreGlobalShortcut(event) {
    if (this.#isUiTextInteractionActive()) return true;
    const target = event?.target?.nodeType === 1 ? event.target : document.activeElement;
    if (!target || typeof target.closest !== "function") return false;
    const tag = String(target.tagName ?? "").toUpperCase();
    if (!target.closest("#ui, #devDock, #entityFocusOverlay, #gameStateOverlay")) return false;
    return tag === "BUTTON" || tag === "SUMMARY";
  }

  #onGlobalKeyDown(event) {
    if (this.#shouldIgnoreGlobalShortcut(event)) return;

    // v0.8.2 Round-5 Wave-2 (01d Step 7): Tab / Shift+Tab cycles through
    // alive workers and updates state.controls.selectedEntityId so casual
    // users have a keyboard-only path to the observation loop.
    // Only active during the live session phase; text-input focus is
    // already filtered by #shouldIgnoreGlobalShortcut.
    if (event && event.key === "Tab" && this.state.session.phase === "active") {
      event.preventDefault();
      this.#cycleSelectedWorker(event.shiftKey ? -1 : 1);
      return;
    }

    const action = resolveGlobalShortcut(event, { phase: this.state.session.phase });
    if (!action) return;

    event.preventDefault();

    if (action.type === "selectTool") {
      this.state.controls.tool = action.tool;
      this.state.controls.actionMessage = `Selected tool: ${action.tool} (shortcut).`;
      this.state.controls.actionKind = "info";
      this.toolbar?.sync?.();
      this.#applyContextualOverlay(action.tool);
      return;
    }
    if (action.type === "clearSelection") {
      this.#clearSelection();
      return;
    }
    if (action.type === "togglePause") {
      this.togglePause();
      return;
    }
    if (action.type === "resetCamera") {
      this.renderer?.resetView?.();
      this.state.controls.actionMessage = "Camera reset to default framing.";
      this.state.controls.actionKind = "info";
      return;
    }
    if (action.type === "undo") {
      this.undoLastBuild();
      return;
    }
    if (action.type === "redo") {
      this.redoLastBuild();
      return;
    }
    if (action.type === "toggleHeatLens") {
      this.toggleHeatLens();
    }
    if (action.type === "toggleTerrainLens") {
      this.toggleTerrainLens();
    }
  }

  // v0.8.2 Round-5 Wave-2 (01d Step 7): cycle selectedEntityId through the
  // alive worker list. `direction` is +1 (Tab) or -1 (Shift+Tab). Wraps.
  #cycleSelectedWorker(direction = 1) {
    const agents = Array.isArray(this.state.agents) ? this.state.agents : [];
    const workers = agents.filter((a) => a && a.type === "WORKER" && a.alive !== false);
    if (workers.length === 0) return;
    const currentId = this.state.controls.selectedEntityId;
    const currentIdx = workers.findIndex((w) => w.id === currentId);
    const step = direction < 0 ? -1 : 1;
    let nextIdx;
    if (currentIdx < 0) {
      nextIdx = step > 0 ? 0 : workers.length - 1;
    } else {
      nextIdx = (currentIdx + step + workers.length) % workers.length;
    }
    const next = workers[nextIdx];
    if (!next) return;
    this.state.controls.selectedEntityId = next.id;
    this.state.controls.selectedTile = null;
    if (this.state.debug) this.state.debug.selectedTile = null;
    this.state.controls.actionMessage = `Selected ${next.displayName ?? next.id}`;
    this.state.controls.actionKind = "info";
  }

  // v0.8.0 Phase 7.C — Supply-Chain Heat Lens handler.
  // Invoked by the L-key (see shortcutResolver → #onGlobalKeyDown) and by the
  // "Heat Lens (L)" HUD button wired in main.js / index.html.
  toggleHeatLens() {
    if (!this.renderer?.toggleHeatLens) return "pressure";
    const mode = this.renderer.toggleHeatLens();
    // v0.8.2 Round-0 02e-indie-critic — voice polish: unify the toggle-toast
    // wording with the HUD button label ("Heat Lens (L)"). Previously the
    // button said "Heat Lens" but the toast said "Pressure lens ...", which
    // the indie-critic reviewer flagged as split-personality naming.
    const label = mode === "heat"
      ? "Heat lens ON — red = surplus, blue = starved."
      : mode === "off"
        ? "Heat lens hidden."
        : "Heat lens restored.";
    this.state.controls.actionMessage = label;
    this.state.controls.actionKind = "info";
    // Sync the HUD button's active-state indicator if it exists.
    const btn = typeof document !== "undefined"
      ? document.getElementById("heatLensBtn")
      : null;
    if (btn) btn.classList.toggle("active", mode === "heat");
    // v0.8.2 Round-1 01e-innovation — also sync the always-on Heat Lens
    // legend (red = supply surplus, blue = processor starved). The legend
    // is only meaningful while the heat overlay is active; keep it hidden
    // otherwise so it doesn't pollute the default pressure-lens HUD.
    const legend = typeof document !== "undefined"
      ? document.getElementById("heatLensLegend")
      : null;
    if (legend) legend.hidden = (mode !== "heat");
    // v0.8.2 — also sync the sidebar logistics legend card which is
    // visible whenever the heat lens is active (any mode except "off").
    const legendCard = typeof document !== "undefined"
      ? document.getElementById(LENS_LEGEND_CARD_ID)
      : null;
    if (legendCard) legendCard.hidden = (mode === "off");
    return mode;
  }

  // Sync the HUD terrainLensLabel element and terrainLensBtn active state to
  // reflect the given overlay mode. Extracted so both auto-switch and manual
  // toggle paths share the same DOM update logic.
  #syncTerrainLensLabel(mode) {
    if (typeof document === "undefined") return;
    const MODE_LABELS = {
      fertility:     "Overlay: Fertility",
      elevation:     "Overlay: Elevation",
      connectivity:  "Overlay: Connectivity",
      nodeDepletion: "Overlay: Node Health",
    };
    const labelEl = document.getElementById("terrainLensLabel");
    if (labelEl) {
      if (mode) {
        labelEl.textContent = MODE_LABELS[mode] ?? mode;
        labelEl.hidden = false;
      } else {
        labelEl.hidden = true;
      }
    }
    const btn = document.getElementById("terrainLensBtn");
    if (btn) btn.classList.toggle("active", mode !== null);
  }

  // Automatically activate the most relevant terrain overlay for the given
  // build tool. Only overrides the overlay when:
  //   – the new tool requests a specific overlay (mode !== null), OR
  //   – the user hasn't manually chosen a different overlay since the last
  //     auto-switch (i.e. the current mode still matches _lastAutoOverlay).
  // Selecting "select" / bridge / kitchen / smithy → turns overlay off (null).
  #applyContextualOverlay(tool) {
    if (!this.renderer?.setTerrainLensMode) return;
    const mode = TOOL_OVERLAY_MAP[tool] ?? null;
    const current = this.renderer.getTerrainLensMode?.() ?? null;
    // Allow auto-switch when: requesting a specific overlay (mode != null),
    // OR when the current overlay was set by a previous auto-switch (current
    // still matches _lastAutoOverlay, meaning the user never manually changed it).
    if (mode !== null || current === this._lastAutoOverlay) {
      this.renderer.setTerrainLensMode(mode);
      this._lastAutoOverlay = mode;
      this.#syncTerrainLensLabel(mode);
      if (mode) {
        const MODE_LABELS = {
          fertility:     "Overlay: Fertility",
          elevation:     "Overlay: Elevation",
          connectivity:  "Overlay: Connectivity",
          nodeDepletion: "Overlay: Node Health",
        };
        this.state.controls.actionMessage = `Auto-overlay: ${MODE_LABELS[mode] ?? mode}`;
        this.state.controls.actionKind = "info";
      }
    }
  }

  // Terrain overlay cycle — mirrors T-key and the "Terrain (T)" HUD button.
  // Delegates to SceneRenderer.toggleTerrainLens() which cycles:
  // null → "fertility" → "elevation" → "connectivity" → "nodeDepletion" → null.
  // Manual invocation marks _lastAutoOverlay = null so subsequent tool selections
  // can detect that the user chose a mode independently and respect it.
  toggleTerrainLens() {
    if (!this.renderer?.toggleTerrainLens) return null;
    const mode = this.renderer.toggleTerrainLens();
    // Mark as user-driven: auto-switch logic will not override this choice
    // until the next tool selection that has a specific overlay preference.
    this._lastAutoOverlay = null;
    const active = mode !== null;
    const MODE_LABELS = {
      fertility: "Overlay: Fertility",
      elevation: "Overlay: Elevation",
      connectivity: "Overlay: Connectivity",
      nodeDepletion: "Overlay: Node Health",
    };
    const actionLabel = active
      ? `Terrain ${MODE_LABELS[mode] ?? mode} overlay ON.`
      : "Terrain overlay OFF.";
    this.state.controls.actionMessage = actionLabel;
    this.state.controls.actionKind = "info";
    this.#syncTerrainLensLabel(mode);
    return mode;
  }

  startSession() {
    // Apply the menu's pending template selection before entering active play.
    const selectedId = this.state?.controls?.mapTemplateId;
    const selectedWidth = Number(this.state?.controls?.mapWidth);
    const selectedHeight = Number(this.state?.controls?.mapHeight);
    const loadedId = this.state?.world?.mapTemplateId;
    const loadedWidth = Number(this.state?.grid?.width ?? 0);
    const loadedHeight = Number(this.state?.grid?.height ?? 0);
    const needsTemplateChange = Boolean(selectedId && loadedId && selectedId !== loadedId);
    const needsWidthChange = Number.isFinite(selectedWidth) && selectedWidth >= 24 && selectedWidth !== loadedWidth;
    const needsHeightChange = Number.isFinite(selectedHeight) && selectedHeight >= 24 && selectedHeight !== loadedHeight;
    if (needsTemplateChange || needsWidthChange || needsHeightChange) {
      this.regenerateWorld({
        templateId: selectedId ?? loadedId,
        seed: this.state.world.mapSeed,
        terrainTuning: this.state.controls.terrainTuning,
        width: Number.isFinite(selectedWidth) && selectedWidth >= 24 ? Math.floor(selectedWidth) : loadedWidth,
        height: Number.isFinite(selectedHeight) && selectedHeight >= 24 ? Math.floor(selectedHeight) : loadedHeight,
      }, { phase: "menu" });
    }
    const mapLabel = this.state?.world?.mapTemplateName ?? "Current map";
    const mapSize = `${Math.floor(Number(this.state?.grid?.width ?? selectedWidth ?? 0))}x${Math.floor(Number(this.state?.grid?.height ?? selectedHeight ?? 0))}`;
    this.#setRunPhase("active", {
      actionMessage: `Run started: ${mapLabel} (${mapSize} tiles). Build the starter network now. Try Again replays this layout; New Map rerolls.`,
      actionKind: "success",
    });
  }

  restartSession() {
    this.resetSessionWorld({ autoStart: true, sameSeed: true });
  }

  resetSessionWorld(options = {}) {
    const newSeed = options.sameSeed
      ? this.state.world.mapSeed
      : Math.floor(Math.random() * 99999);
    this.regenerateWorld({
      templateId: options.templateId ?? this.state.world.mapTemplateId,
      seed: newSeed,
      terrainTuning: this.state.controls.terrainTuning,
      width: options.width ?? undefined,
      height: options.height ?? undefined,
    }, {
      autoStart: Boolean(options.autoStart),
      phase: options.autoStart ? "active" : "menu",
    });
    if (!options.autoStart) {
      this.state.controls.actionMessage = "World reset. Press Start Run when ready.";
      this.state.controls.actionKind = "info";
    }
  }

  #setRunPhase(phase, options = {}) {
    const next = phase === "active" ? "active" : phase === "end" ? "end" : "menu";
    this.state.session.phase = next;
    this.state.session.outcome = options.outcome ?? (next === "end" ? this.state.session.outcome : "none");
    this.state.session.reason = options.reason ?? (next === "end" ? this.state.session.reason : "");
    this.state.session.endedAtSec = next === "end" ? this.state.metrics.timeSec : -1;

    const wrapRoot = document.getElementById("wrap");
    wrapRoot?.classList.toggle("game-active", next === "active");

    this.state.controls.stepFramesPending = 0;
    this.state.controls.isPaused = next !== "active";
    if (next === "active") {
      this.state.metrics.benchmarkStatus = this.benchmark.running ? this.state.metrics.benchmarkStatus : "idle";
    }

    if (options.actionMessage) {
      this.state.controls.actionMessage = options.actionMessage;
      this.state.controls.actionKind = options.actionKind ?? "info";
    }

    if (next === "active") {
      this.#safeRenderPanel("GameStateOverlay", () => this.gameStateOverlay.render(this.state.session));
      this.#safeRenderPanel("HUD", () => this.hud.render());
    }
  }

  #evaluateRunOutcome() {
    if (this.state.session.phase !== "active") return;
    const outcome = evaluateRunOutcomeState(this.state);
    if (!outcome) return;
    this.#setRunPhase("end", {
      ...outcome,
    });
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

  // v0.8.2 Round0 01c-ui — Developer mode gate.
  //
  // Dev UI (Settings terrain sliders, Debug panel, Dev Telemetry dock) is
  // hidden by default via the `.dev-only` CSS class, gated on
  // `body.dev-mode`. This method enables dev mode when any of these three
  // signals hold:
  //   1. URL query `?dev=1`
  //   2. `localStorage.utopia:devMode === "1"` (persistent opt-in)
  //   3. Ctrl+Shift+D keyboard chord (runtime toggle, persists to storage)
  //
  // Each signal is try/catch-guarded because browser privacy modes may throw
  // on storage access (Safari private mode → QuotaExceededError).
  #initDevModeGate() {
    if (typeof document === "undefined" || !document.body) return;
    const body = document.body;
    const storage = (() => {
      try {
        return typeof localStorage !== "undefined" ? localStorage : null;
      } catch {
        return null;
      }
    })();
    const locationHref = (() => {
      try {
        return typeof location !== "undefined" ? location.href : null;
      } catch {
        return null;
      }
    })();

    const initial = readInitialDevMode({ locationHref, storage });
    applyInitialDevMode(body, initial);

    if (typeof window === "undefined") return;
    this.boundOnDevModeChord = (event) => {
      if (!isDevModeChord(event)) return;
      event.preventDefault();
      const nowOn = toggleDevMode(body, storage);
      if (this.state?.controls) {
        this.state.controls.actionMessage = `Developer mode ${nowOn ? "ON" : "OFF"}.`;
        this.state.controls.actionKind = "info";
      }
    };
    window.addEventListener("keydown", this.boundOnDevModeChord);
  }

  // v0.8.2 Round0 02b-casual — UI profile gate.
  //
  // Reads `?ui=casual|full` URL query (takes precedence) and
  // `localStorage.utopia:uiProfile`. Applies:
  //   - `document.body.classList` ← add/remove `casual-mode`
  //   - `document.documentElement[data-ui-profile]` ← "casual" | "full"
  //   - `state.controls.uiProfile` ← same value (so render-side consumers
  //      like EntityFocusPanel can branch without DOM lookups)
  //
  // Orthogonal to dev-mode: both body.dev-mode AND body.casual-mode can be
  // set simultaneously (e.g. `?dev=1&ui=casual`). Each CSS gate targets
  // its own class/attribute without fighting the other.
  #initUiProfileGate() {
    const body = typeof document !== "undefined" ? document.body : null;
    const docEl = typeof document !== "undefined" ? document.documentElement : null;
    const storage = (() => {
      try {
        return typeof localStorage !== "undefined" ? localStorage : null;
      } catch {
        return null;
      }
    })();
    const locationHref = (() => {
      try {
        return typeof location !== "undefined" ? location.href : null;
      } catch {
        return null;
      }
    })();

    const profile = readInitialUiProfile({ locationHref, storage });
    applyUiProfile(body, docEl, profile);
    if (this.state?.controls) {
      this.state.controls.uiProfile = profile;
    }
    // v0.8.2 Round-5b (02e Step 4) — sync module-level uiProfileState so
    // EntityFactory.createWorker can read the active profile without a prop-drill.
    setActiveUiProfile(profile);
  }

  dispose() {
    this.stop();
    if (typeof window !== "undefined" && this.boundOnGlobalKeyDown) {
      window.removeEventListener("keydown", this.boundOnGlobalKeyDown);
    }
    if (typeof window !== "undefined" && this.boundOnDevModeChord) {
      window.removeEventListener("keydown", this.boundOnDevModeChord);
    }
    if (this.heatLensBtn && this.boundOnHeatLensClick) {
      this.heatLensBtn.removeEventListener("click", this.boundOnHeatLensClick);
    }
    this.renderer?.dispose?.();
  }
}
