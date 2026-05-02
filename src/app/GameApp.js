import "./types.js";
import { createInitialGameState, createWorker, createVisitor, createAnimal } from "../entities/EntityFactory.js";
import { ENTITY_TYPE, ANIMAL_KIND, VISITOR_KIND, TILE, TILE_INFO } from "../config/constants.js";
import { SceneRenderer } from "../render/SceneRenderer.js";
import { BuildToolbar } from "../ui/tools/BuildToolbar.js";
import { HUDController } from "../ui/hud/HUDController.js";
import { GameStateOverlay } from "../ui/hud/GameStateOverlay.js";
import { InspectorPanel } from "../ui/panels/InspectorPanel.js";
import { AIDecisionPanel } from "../ui/panels/AIDecisionPanel.js";
import { AIAutomationPanel } from "../ui/panels/AIAutomationPanel.js";
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
import { PopulationGrowthSystem, __devForceSpawnWorkers } from "../simulation/population/PopulationGrowthSystem.js";
import { MemoryStore } from "../simulation/ai/memory/MemoryStore.js";
import { MemoryObserver } from "../simulation/ai/memory/MemoryObserver.js";
import { StrategicDirector } from "../simulation/ai/strategic/StrategicDirector.js";
import { EnvironmentDirectorSystem } from "../simulation/ai/director/EnvironmentDirectorSystem.js";
import { WeatherSystem } from "../world/weather/WeatherSystem.js";
import { WorldEventSystem } from "../world/events/WorldEventSystem.js";
import { NPCBrainSystem } from "../simulation/ai/brains/NPCBrainSystem.js";
import { WorkerAISystem } from "../simulation/npc/WorkerAISystem.js";
import { ConstructionSystem } from "../simulation/construction/ConstructionSystem.js";
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
import { AgentDirectorSystem } from "../simulation/ai/colony/AgentDirectorSystem.js";
import { ProgressionSystem } from "../simulation/meta/ProgressionSystem.js";
import { DevIndexSystem } from "../simulation/meta/DevIndexSystem.js";
import { RaidEscalatorSystem } from "../simulation/meta/RaidEscalatorSystem.js";
import { EventDirectorSystem } from "../simulation/meta/EventDirectorSystem.js";
import { createServices } from "./createServices.js";
import { GameLoop } from "./GameLoop.js";
import { computeSimulationStepPlan } from "./simStepper.js";
import {
  DEFAULT_BENCHMARK_CONFIG,
  DEFAULT_DISPLAY_SETTINGS,
  sanitizeBenchmarkConfig,
  sanitizeControlSettings,
  sanitizeDisplaySettings,
} from "./controlSanitizers.js";
import { resolveGlobalShortcut } from "./shortcutResolver.js";
import {
  readInitialDevMode,
  applyInitialDevMode,
  isDevModeChord,
  isDevMode,
  toggleDevMode,
  readInitialUiProfile,
  applyUiProfile,
} from "./devModeGate.js";
import { randomPassableTile, tileToWorld, createInitialGrid, countTilesByType, MAP_TEMPLATES, validateGeneratedGrid, pickBootSeed } from "../world/grid/Grid.js";
import { pushWarning } from "./warnings.js";
import { buildLongRunTelemetry } from "./longRunTelemetry.js";
import { resetAiRuntimeStats } from "./aiRuntimeStats.js";
import { evaluateRunOutcomeState } from "./runOutcome.js";
import { ensurePerformanceTelemetry, recordPerformanceSample } from "./performanceTelemetry.js";
import { getScenarioIntroPayload } from "../world/scenarios/ScenarioFactory.js";
import { setActiveUiProfile } from "./uiProfileState.js";
import { audioSystem } from "../audio/AudioSystem.js";

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

function readOfflineAiFallbackFlag() {
  try {
    const params = new URLSearchParams(globalThis?.location?.search ?? "");
    return params.get("offlineAi") === "1";
  } catch {
    return false;
  }
}

// v0.10.1-n (A2 perftrace) — `?perftrace=1` opts into a structured top-system
// budget snapshot on `window.__perftrace`. Without the flag the snapshot is
// never written so we avoid the per-frame sort + allocation A2 flagged as a
// GC-sawtooth concern. `window.__fps_observed` is unconditional so blind
// (headless) reviewers can read the render-loop FPS even when RAF is throttled.
function readPerftraceFlag() {
  try {
    const params = new URLSearchParams(globalThis?.location?.search ?? "");
    return params.get("perftrace") === "1";
  } catch {
    return false;
  }
}

export class GameApp {
  constructor(canvas) {
    // v0.10.1 A7-rationality-audit R2 (P0 #7) — every fresh page load
    // picks a unique boot seed. `pickBootSeed` honours `?seed=<n>` (URL),
    // `localStorage.utopia:bootSeed` (pinned), and otherwise rolls a
    // 31-bit random integer. Tests / benchmarks bypass GameApp entirely
    // and call `createInitialGameState({ seed: 1337, ... })` directly so
    // their determinism is unaffected. Without this, the leaderboard
    // recorded every fresh-boot loss as `seed 1337 · loss`.
    const bootSeed = pickBootSeed({
      urlParams: typeof globalThis !== "undefined" && globalThis.location?.search != null
        ? new URLSearchParams(globalThis.location.search)
        : new URLSearchParams(""),
      storage: typeof localStorage !== "undefined" ? localStorage : null,
    });
    // v0.8.10 — game UI starts the player on a bare map (zero pre-built
    // buildings/roads/walls). Headless tests / benchmarks / scenarios that
    // need the legacy pre-stamped infrastructure call createInitialGameState
    // without bareInitial (default false).
    this.state = createInitialGameState({ bareInitial: true, seed: bootSeed });
    this.#sanitizeControls(false);
    this.#applyDisplaySettingsToDom();
    // v0.8.2 Round0 01c-ui — Developer mode gate.
    // Reads ?dev=1 URL query and `localStorage.utopia:devMode`, and wires a
    // Ctrl+Shift+D chord to toggle `document.body.classList` in-place.
    this.#initDevModeGate();
    // v0.8.2 Round0 02b-casual — UI profile gate. Reads `?ui=casual|full`
    // URL query and `localStorage.utopia:uiProfile`; applies body.casual-mode
    // and html[data-ui-profile] so CSS / panels can adapt. Orthogonal to
    // body.dev-mode (both may be set). Default = "casual" for first-timers.
    this.#initUiProfileGate();
    this.offlineAiFallback = readOfflineAiFallbackFlag();
    // v0.10.1-n (A2 perftrace) — cached once at construct so the per-frame
    // body can branch on a primitive without re-parsing `location.search`.
    this.perftraceEnabled = readPerftraceFlag();
    // Rolling FPS samples for the always-on `window.__fps_observed` surface.
    // `_fpsSamplesMs` is a fixed-capacity ring (last 60 frame-Dt values in ms);
    // `_fpsRingHead` advances modulo capacity, `_fpsRingFilled` tracks how
    // many slots are valid so p5 percentile is meaningful before the ring fills.
    // `_perftraceTopBuffer` is a pre-allocated 3-slot scratch array reused
    // every RAF tick when the flag is on (avoids allocation per A2 risk note).
    this._fpsSamplesMs = new Float32Array(60);
    this._fpsRingHead = 0;
    this._fpsRingFilled = 0;
    this._fpsObservedSmoothed = 0;
    this._fpsObservedSampleCount = 0;
    this._perftraceTopBuffer = [
      { name: "", last: 0, avg: 0, peak: 0 },
      { name: "", last: 0, avg: 0, peak: 0 },
      { name: "", last: 0, avg: 0, peak: 0 },
    ];
    this.services = createServices(this.state.world.mapSeed, {
      offlineAiFallback: this.offlineAiFallback,
    });

    this.buildSystem = new BuildSystem({
      onAction: (event) => {
        this.services.replayService.push({
          channel: "build",
          simSec: this.state.metrics.timeSec,
          ...event,
        });
        // Audio: play building-placed sound for successful placements (not erase).
        if (event.kind === "build" && event.tool !== "erase") {
          audioSystem.onBuildingPlaced();
        }
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
      onSetDisplaySettings: (settings) => this.setDisplaySettings(settings),
    });
    this.hud = new HUDController(this.state);
    this.inspector = new InspectorPanel(this.state);
    this.aiDecisionPanel = new AIDecisionPanel(this.state);
    this.aiAutomationPanel = new AIAutomationPanel(this.state);
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
      // v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 3d) — leaderboard
      // handlers. The overlay never reaches into services directly so we
      // can stub these in tests / null-out for benchmark mode.
      getLeaderboard: () => this.services.leaderboardService?.listTopByScore?.(10) ?? [],
      getLeaderboardRankForSeed: (seed) =>
        this.services.leaderboardService?.findRankBySeed?.(seed) ?? { rank: 0, total: 0 },
      onClearLeaderboard: () => this.services.leaderboardService?.clear?.(),
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
      // v0.8.7 T3-3 (QA2-F3): forward `utopia:clearToasts` to SceneRenderer.
      // BuildToolbar dispatches this on tool-change so stale toasts don't
      // outlive the tool that produced them.
      this.boundOnClearToasts = () => {
        if (this.renderer && typeof this.renderer.clearToasts === "function") {
          this.renderer.clearToasts();
        }
      };
      document.addEventListener("utopia:clearToasts", this.boundOnClearToasts);
    }

    // AI Debug button opens the player-facing AI Log tab so players can
    // inspect LLM call logs without hunting through the sidebar tabs manually.
    if (typeof document !== "undefined") {
      const aiDebugBtn = document.getElementById("aiDebugBtn");
      if (aiDebugBtn) {
        aiDebugBtn.addEventListener("click", () => {
          // Open the sidebar if it is currently collapsed.
          const wrap = document.getElementById("wrap");
          if (wrap && !wrap.classList.contains("sidebar-open")) {
            // v0.8.8 A5 (F14) \u2014 `sidebar-collapsed` removal no longer
            // needed (BuildToolbar no longer applies it).
            wrap.classList.add("sidebar-open");
            const toggleBtn = document.getElementById("sidebarToggleBtn");
            if (toggleBtn) toggleBtn.textContent = "\u2190";
            try { localStorage.setItem("utopiaSidebarOpen", "1"); } catch {}
          }
          const aiLogTabBtn = document.querySelector(".sidebar-tab-btn[data-sidebar-target='ai-log']");
          if (aiLogTabBtn) {
            aiLogTabBtn.click();
          }
          document
            .querySelectorAll("[data-sidebar-panel='ai-log'] details.card[data-panel-key]")
            .forEach((panel) => {
              panel.open = true;
            });
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
      frameSamplesMs: [],
      actualScaleSamples: [],
      cappedSamples: 0,
      results: [],
      csv: "",
    };

    this.systems = this.createSystems();
    this.services.memoryStore = this.memoryStore;

    this.loop = new GameLoop(
      (dt, frameInfo) => this.update(dt, frameInfo),
      (dt, frameInfo) => this.render(dt, frameInfo),
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
    this.maxSimulationStepsPerFrame = 24;
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
    if (this.offlineAiFallback) {
      this.aiHealthMonitor.lastStatus = "offline-fallback";
      this.aiHealthMonitor.lastHasApiKey = false;
      this.state.metrics.proxyHealth = "offline-fallback";
      this.state.metrics.proxyHasApiKey = false;
      this.state.ai.coverageTarget = "fallback";
    } else {
      this.#queueAiHealthProbe("startup");
    }
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
      new EventDirectorSystem(),
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
      // v0.8.4 building-construction (Agent A) — completes blueprint/demolish
      // overlays after WorkerAISystem applies workAppliedSec for the tick.
      new ConstructionSystem(),
      new VisitorAISystem(),
      new AnimalAISystem(),
      new MortalitySystem(),
      new WildlifePopulationSystem(),
      new BoidsSystem(),
      new ResourceSystem(),
      new ProcessingSystem(),
      // Phase A LLM Colony Planner: AgentDirectorSystem wraps the legacy
      // ColonyDirectorSystem and routes through services.llmClient (proxy)
      // when Autopilot/coverageTarget="llm". When coverageTarget="fallback"
      // it short-circuits straight to the algorithmic ColonyDirectorSystem
      // so manual mode behaviour is preserved.
      new AgentDirectorSystem(this.memoryStore),
      // Keep ColonyDirectorSystem import for back-compat; AgentDirectorSystem
      // owns its own internal `_fallback` ColonyDirectorSystem instance.
      // (No standalone ColonyDirectorSystem entry — would double-build.)
    ];
    // Reference the import to keep linters happy if AgentDirector ever stops
    // wrapping ColonyDirector internally; tests import ColonyDirectorSystem
    // directly so the symbol must remain available at module level.
    void ColonyDirectorSystem;
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
    this.#maybeAutopilotFoodPreCrisis();
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

  #maybeAutopilotFoodPreCrisis() {
    const state = this.state;
    if (state.benchmarkMode === true) return;
    state.ai ??= {};
    const ai = state.ai;
    if (!ai.enabled) return;
    const nowSec = Number(state.metrics?.timeSec ?? 0);
    const events = state.events?.log ?? [];
    let preCrisisEvent = null;
    const cutoff = nowSec - 1;
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const ev = events[i];
      if (!ev || typeof ev.t !== "number") continue;
      if (ev.t < cutoff) break;
      if (ev.type === "food_precrisis_detected") { preCrisisEvent = ev; break; }
    }

    if (preCrisisEvent && ai.foodRecoveryMode !== true) {
      ai.foodRecoveryMode = true;
      ai.foodRecoveryStartedSec = nowSec;
      ai.foodRecoveryReason = "food runway unsafe";
      const d = preCrisisEvent.detail ?? {};
      // v0.10.1-r3-A5 P0-2: unify food-rate sampler. The recovery toast
      // historically displayed `produced - consumed` from the pre-crisis
      // event detail, while the HUD Resource panel displays
      // `produced - consumed - spoiled` from `state.metrics.*PerMin`. On a
      // colony with significant spoilage (no warehouse coverage), the two
      // numbers diverged by 13× (-509/min toast vs -39/min panel) and read
      // as a 13× false alarm. Subtracting `foodSpoiledPerMin` here makes
      // the toast read the same number the player sees in the resource
      // panel. Falls back to the event detail's netPerMin when the
      // spoilage metric isn't yet flushed.
      const spoil = Number(state.metrics?.foodSpoiledPerMin ?? 0);
      const eventNet = Number(d.netPerMin ?? 0);
      const net = Number.isFinite(spoil) ? eventNet - spoil : eventNet;
      const risk = Number(d.starvationRisk ?? 0);
      state.controls.actionKind = "warning";
      state.controls.actionMessage = `Autopilot recovery: food runway unsafe (net ${net.toFixed(1)}/min, risk ${risk}). Expansion paused; farms, warehouses, and roads take priority.`;
    }

    if (ai.foodRecoveryMode === true) {
      const food = Number(state.resources?.food ?? 0);
      const produced = Number(state.metrics?.foodProducedPerMin ?? 0);
      const consumed = Number(state.metrics?.foodConsumedPerMin ?? 0);
      const risk = Number(state.metrics?.starvationRiskCount ?? 0);
      const startedAt = Number(ai.foodRecoveryStartedSec ?? nowSec);
      if (food >= 24 && produced >= consumed && risk <= 0 && nowSec - startedAt >= 20) {
        ai.foodRecoveryMode = false;
        ai.foodRecoveryReason = "";
        state.controls.actionKind = "info";
        state.controls.actionMessage = "Autopilot recovery cleared: food runway is stable.";
      }
    }
  }

  #tunePathBudgetForLoad(targetScale, entityCount) {
    const budget = this.services?.pathBudget;
    if (budget && Number.isFinite(Number(budget.maxMs))) {
      budget.baseMaxMs ??= Number(budget.maxMs ?? 3);
      const base = Math.max(0, Number(budget.baseMaxMs ?? 3));
      const desired = targetScale >= 7 && entityCount >= 1000 ? 32
        : targetScale >= 7 && entityCount >= 700 ? 24
          : entityCount >= 1000 ? 18
            : entityCount >= 700 ? 12
              : base;
      budget.maxMs = Math.max(base, desired);
    }
    const workerStats = this.services?.pathWorkerPool?.getStats?.();
    if (workerStats && this.state.debug?.astar) {
      this.state.debug.astar.workerPool = workerStats;
    }
  }

  update(frameDt, frameInfo = null) {
    const frameStart = performance.now();
    const controls = this.state.controls;
    const runLocked = this.state.session.phase !== "active";
    const rawFrameDt = Math.max(0.0001, Number(frameInfo?.rawDt ?? frameDt) || frameDt || 0.0001);
    const rawFrameMs = Math.max(0, Number(frameInfo?.elapsedMs ?? rawFrameDt * 1000) || 0);
    this.state.metrics.wallTimeSec = Number(this.state.metrics.wallTimeSec ?? 0) + rawFrameDt;
    const targetScale = Math.max(0.1, Number(controls.timeScale ?? 1) || 1);
    const entityCount = this.state.agents.length + this.state.animals.length;
    this.#tunePathBudgetForLoad(targetScale, entityCount);
    const perf = ensurePerformanceTelemetry(this.state.metrics);
    const previousCap = Boolean(this.state.metrics.performanceCap?.active);
    const lastSimMs = Number(this.state.metrics.simCostMs ?? 0);
    const lastFrameSimMs = Number(this.state.metrics.simCpuFrameMs ?? lastSimMs);
    const lastWorkMs = Number(this.state.metrics.workFrameMs ?? this.state.metrics.frameMs ?? 0);
    const lastRenderMs = Number(this.state.metrics.renderCpuMs ?? 0);
    const severeFramePressure = lastWorkMs > 90 || lastFrameSimMs > 34 || lastRenderMs > 35;
    const moderateFramePressure = lastWorkMs > 45
      || lastFrameSimMs > 22
      || lastRenderMs > 20
      || Number(perf.workFrameP95Ms ?? 0) > 45;
    const previousSlowFrame = severeFramePressure || moderateFramePressure;
    let effectiveMaxSteps = this.maxSimulationStepsPerFrame;
    const maxCpuThroughputMode = !controls.isPaused && !runLocked && targetScale >= 7 && entityCount >= 700;
    if (!maxCpuThroughputMode && !controls.isPaused && !runLocked && (targetScale >= 7 || entityCount >= 700) && (previousCap || previousSlowFrame)) {
      if (severeFramePressure) {
        effectiveMaxSteps = entityCount >= 1000 ? 3 : entityCount >= 700 ? 4 : 6;
      } else if (moderateFramePressure) {
        effectiveMaxSteps = entityCount >= 1000 ? 4 : entityCount >= 700 ? 6 : 8;
      }
    }
    const baseFixedStepSec = Math.max(1 / 120, Math.min(1 / 5, controls.fixedStepSec || 1 / 30));
    const highLoadFixedStepSec = targetScale >= 7 && entityCount >= 1000
      ? 1 / 10
      : targetScale >= 7 && entityCount >= 700
        ? 1 / 12
        : baseFixedStepSec;
    const fixedStepSec = Math.max(baseFixedStepSec, highLoadFixedStepSec);
    const stepPlan = computeSimulationStepPlan({
      frameDt,
      accumulatorSec: this.accumulatorSec,
      isPaused: controls.isPaused || runLocked,
      stepFramesPending: controls.stepFramesPending,
      fixedStepSec,
      timeScale: controls.timeScale,
      maxSteps: effectiveMaxSteps,
    });

    this.accumulatorSec = stepPlan.nextAccumulatorSec;
    controls.stepFramesPending = Math.max(0, controls.stepFramesPending - stepPlan.consumedStepFrames);

    let frameSimCpuMs = 0;
    for (let i = 0; i < stepPlan.steps; i += 1) {
      const simStepStart = performance.now();
      this.stepSimulation(fixedStepSec);
      frameSimCpuMs += performance.now() - simStepStart;
    }
    this.state.metrics.simCpuFrameMs = frameSimCpuMs;

    this.#evaluateRunOutcome();

    if (controls.isPaused && this.benchmark.running && stepPlan.steps === 0) {
      this.state.metrics.benchmarkStatus = "paused";
    }

    this.state.metrics.frameMs = performance.now() - frameStart;
    this.state.metrics.workFrameMs = this.state.metrics.frameMs + Number(this.state.metrics.uiCpuMs ?? 0) + Number(this.state.metrics.renderCpuMs ?? 0);
    this.state.metrics.rawFrameMs = rawFrameMs;
    this.state.metrics.simDt = stepPlan.simDt;
    this.state.metrics.simStepsThisFrame = stepPlan.steps;
    const actualScale = frameDt > 0 ? stepPlan.simDt / frameDt : 0;
    const actualWallScale = rawFrameDt > 0 ? stepPlan.simDt / rawFrameDt : 0;
    this.state.metrics.timeScaleActual = (this.state.metrics.timeScaleActual ?? actualScale) * 0.85 + actualScale * 0.15;
    this.state.metrics.timeScaleActualWall = (this.state.metrics.timeScaleActualWall ?? actualWallScale) * 0.85 + actualWallScale * 0.15;
    this.state.metrics.isDebugStepping = Boolean(controls.isPaused);

    const instantFps = 1 / Math.max(0.0001, rawFrameDt);
    this.state.metrics.averageFps = this.state.metrics.averageFps * 0.95 + instantFps * 0.05;
    this.state.metrics.observedFps = instantFps;

    if (entityCount >= 1000 || rawFrameMs > 90) {
      this.uiRefreshIntervalSec = 1;
    } else if (entityCount >= 700 || rawFrameMs > 55) {
      this.uiRefreshIntervalSec = 1 / 2;
    } else if (entityCount >= 350) {
      this.uiRefreshIntervalSec = 1 / 4;
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
    const smoothedActualWall = Number(this.state.metrics.timeScaleActualWall ?? actualWallScale);
    const diverged = targetScale >= 4 && smoothedActualWall < targetScale * 0.85;
    const currentFramePressure = Number(this.state.metrics.workFrameMs ?? this.state.metrics.frameMs ?? 0) > 45
      || Number(this.state.metrics.simCpuFrameMs ?? this.state.metrics.simCostMs ?? 0) > 22
      || Number(this.state.metrics.renderCpuMs ?? 0) > 24;
    const capActive = !controls.isPaused && !runLocked && targetScale >= 4
      && (diverged || effectiveMaxSteps < this.maxSimulationStepsPerFrame || currentFramePressure);
    const capReason = capActive
      ? (effectiveMaxSteps < this.maxSimulationStepsPerFrame
        ? `frame-pressure step cap ${effectiveMaxSteps}/${this.maxSimulationStepsPerFrame}`
        : "target speed above measured wall-clock throughput")
      : "";
    this.state.metrics.performanceCap = {
      active: capActive,
      reason: capReason,
      targetScale,
      actualScale: smoothedActualWall,
      effectiveMaxSteps,
      fixedStepSec,
      workFrameMs: this.state.metrics.workFrameMs,
    };
    this._pendingFrameTelemetry = {
      rawFrameMs,
      simMs: frameSimCpuMs,
      targetScale,
      actualScale: smoothedActualWall,
      entityCount,
      capActive,
      capReason,
      effectiveMaxSteps,
      fixedStepSec,
    };
    this.#applyMemoryPressureGuard();
    // v0.10.1-n (A2 perftrace) — render-loop derived observability surface.
    // Always-on FPS so headless reviewers (whose RAF is throttled to 1 Hz)
    // can still read the value the game *thinks* it is rendering at via
    // `window.__fps_observed`. When `?perftrace=1` is set, additionally
    // export a top-3 hot-system snapshot to `window.__perftrace`.
    this.#publishPerftraceSurfaces(rawFrameDt, rawFrameMs);
    this.aiHealthMonitor.elapsedSec += frameDt;
    if (this.aiHealthMonitor.elapsedSec >= this.aiHealthMonitor.intervalSec) {
      this.aiHealthMonitor.elapsedSec = 0;
      this.#queueAiHealthProbe("poll");
    }
    if (this.state.debug) {
      this.state.debug.rng = this.services.rng.snapshot();
    }
  }

  // v0.10.1-n (A2 perftrace) — Step 1 + Step 2.
  // Step 1 (always on): writes `window.__fps_observed = { fps, p5, sampleCount,
  //   frameDtMs }` derived from the game's own render loop. EMA alpha=0.15
  //   matches `timeScaleActual` smoothing. Headless Chromium throttles RAF to
  //   1 Hz, but the game still ticks via the GameLoop callback — so this is
  //   the only honest FPS the validator can read in CI.
  // Step 2 (gated by `?perftrace=1`): writes `window.__perftrace` with the
  //   top-3 entries of `state.debug.systemTimingsMs` sorted by `.peak` then
  //   `.avg`, plus the simStepper signals. Reuses the pre-allocated
  //   `_perftraceTopBuffer` so the gated path allocates nothing per frame.
  #publishPerftraceSurfaces(rawFrameDt, rawFrameMs) {
    if (typeof window === "undefined") return;

    const dtMs = Math.max(0.0001, rawFrameMs > 0 ? rawFrameMs : rawFrameDt * 1000);
    const instantFps = 1000 / dtMs;
    const alpha = 0.15;
    this._fpsObservedSmoothed = this._fpsObservedSampleCount === 0
      ? instantFps
      : this._fpsObservedSmoothed * (1 - alpha) + instantFps * alpha;
    this._fpsObservedSampleCount += 1;
    const ringCap = this._fpsSamplesMs.length;
    this._fpsSamplesMs[this._fpsRingHead] = dtMs;
    this._fpsRingHead = (this._fpsRingHead + 1) % ringCap;
    if (this._fpsRingFilled < ringCap) this._fpsRingFilled += 1;
    // p5 of FPS = 5th-percentile FPS = inverse of 95th-percentile dtMs.
    // Sort a copy of the populated ring slice (small, 60 floats) once per
    // tick; this allocates ~60 * 8 bytes which is small versus the GC noise
    // already present in render. We can revisit if A2 follow-up flags it.
    const filled = this._fpsRingFilled;
    let p5Fps = this._fpsObservedSmoothed;
    if (filled >= 2) {
      const copy = new Array(filled);
      for (let i = 0; i < filled; i += 1) copy[i] = this._fpsSamplesMs[i];
      copy.sort((a, b) => a - b);
      const p95Idx = Math.min(filled - 1, Math.floor(filled * 0.95));
      const p95DtMs = Math.max(0.0001, copy[p95Idx]);
      p5Fps = 1000 / p95DtMs;
    }
    window.__fps_observed = {
      fps: Number.isFinite(this._fpsObservedSmoothed) ? this._fpsObservedSmoothed : 0,
      p5: Number.isFinite(p5Fps) ? p5Fps : 0,
      sampleCount: this._fpsObservedSampleCount,
      frameDtMs: dtMs,
    };

    if (!this.perftraceEnabled) return;
    const timings = this.state.debug?.systemTimingsMs;
    if (!timings || typeof timings !== "object") return;
    // Find the top-3 entries by `.peak` (then `.avg` as tiebreaker) without
    // a full sort: we walk all entries 3 times, picking the largest each
    // pass. systemTimingsMs is small (~22 systems) so 3*N is cheap.
    const buf = this._perftraceTopBuffer;
    const usedNames = new Set();
    for (let slot = 0; slot < buf.length; slot += 1) {
      let bestName = "";
      let bestPeak = -1;
      let bestAvg = -1;
      let bestLast = 0;
      for (const name in timings) {
        if (usedNames.has(name)) continue;
        const stat = timings[name];
        if (!stat) continue;
        const peak = Number(stat.peak ?? 0);
        const avg = Number(stat.avg ?? 0);
        if (peak > bestPeak || (peak === bestPeak && avg > bestAvg)) {
          bestPeak = peak;
          bestAvg = avg;
          bestLast = Number(stat.last ?? 0);
          bestName = name;
        }
      }
      const cell = buf[slot];
      cell.name = bestName;
      cell.last = bestName ? bestLast : 0;
      cell.avg = bestName ? bestAvg : 0;
      cell.peak = bestName ? bestPeak : 0;
      if (bestName) usedNames.add(bestName);
    }
    window.__perftrace = {
      topSystems: buf,
      maxStepsPerFrame: this.maxSimulationStepsPerFrame,
      simStepsThisFrame: Number(this.state.metrics?.simStepsThisFrame ?? 0),
      timeScaleActualWall: Number(this.state.metrics?.timeScaleActualWall ?? 0),
    };
  }

  render(dt) {
    this.state.metrics.renderFrameCount += 1;
    const uiStart = performance.now();
    this.uiRefreshAccumulator += dt;
    if (this.uiRefreshAccumulator >= this.uiRefreshIntervalSec) {
      const isTextInteractionActive = this.#isUiTextInteractionActive();
      if (!isTextInteractionActive) {
        this.#safeRenderPanel("HUD", () => this.hud.render());
        this.#safeRenderPanel("AIAutomationPanel", () => this.aiAutomationPanel.render());
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
    recordPerformanceSample(this.state.metrics, {
      ...(this._pendingFrameTelemetry ?? {}),
      simMs: this.state.metrics.simCpuFrameMs,
      simLastStepMs: this.state.metrics.simCostMs,
      workFrameMs: Number(this.state.metrics.frameMs ?? 0) + Number(this.state.metrics.uiCpuMs ?? 0) + Number(this.state.metrics.renderCpuMs ?? 0),
      uiMs: this.state.metrics.uiCpuMs,
      renderMs: this.state.metrics.renderCpuMs,
    });
    this._pendingFrameTelemetry = null;
  }

  setExtraWorkers(extraCount) {
    const safeCount = Math.max(0, Math.min(1000, extraCount | 0));
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
        worker.hunger = 1;
        worker.rest = 1;
        worker.morale = 1;
        worker.mood = 1;
        worker.stateLabel = "Stress patrol";
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
    this.benchmark.frameSamplesMs = [];
    this.benchmark.actualScaleSamples = [];
    this.benchmark.cappedSamples = 0;
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
      this.benchmark.sumFrameMs += this.state.metrics.rawFrameMs || this.state.metrics.frameMs;
      this.benchmark.frameSamplesMs.push(Number(this.state.metrics.rawFrameMs || this.state.metrics.frameMs || 0));
      this.benchmark.actualScaleSamples.push(Number(this.state.metrics.timeScaleActualWall ?? this.state.metrics.timeScaleActual ?? 0));
      if (this.state.metrics.performanceCap?.active) this.benchmark.cappedSamples += 1;
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
      p95FrameMs: this.#benchmarkPercentile(this.benchmark.frameSamplesMs, 95),
      p99FrameMs: this.#benchmarkPercentile(this.benchmark.frameSamplesMs, 99),
      avgActualScale: this.benchmark.actualScaleSamples.length > 0
        ? this.benchmark.actualScaleSamples.reduce((sum, value) => sum + value, 0) / this.benchmark.actualScaleSamples.length
        : Number(this.state.metrics.timeScaleActualWall ?? 0),
      cappedPct: this.benchmark.sampleCount > 0 ? (this.benchmark.cappedSamples / this.benchmark.sampleCount) * 100 : 0,
      bottleneck: this.state.metrics.performance?.bottleneck ?? "unknown",
    });

    this.benchmark.stageIndex += 1;
    this.benchmark.stageElapsedSec = 0;
    this.benchmark.sampleCount = 0;
    this.benchmark.sumFps = 0;
    this.benchmark.sumFrameMs = 0;
    this.benchmark.frameSamplesMs = [];
    this.benchmark.actualScaleSamples = [];
    this.benchmark.cappedSamples = 0;

    if (this.benchmark.stageIndex >= config.schedule.length) {
      this.benchmark.running = false;
      this.benchmark.activeConfig = null;
      this.benchmark.csv = this.buildBenchmarkCsv();
      this.state.metrics.benchmarkCsvReady = true;
      const worst = this.benchmark.results.reduce((acc, row) => (
        !acc || row.p95FrameMs > acc.p95FrameMs ? row : acc
      ), null);
      const failed = this.benchmark.results.some((row) => row.p95FrameMs > 66 || row.avgFps < 15);
      this.state.metrics.benchmarkLastRun = {
        status: failed ? "fail" : "pass",
        stages: this.benchmark.results.length,
        worstLoad: worst?.load ?? 0,
        worstP95FrameMs: worst?.p95FrameMs ?? 0,
        worstBottleneck: worst?.bottleneck ?? "unknown",
      };
      this.state.metrics.benchmarkStatus = failed ? "done: needs optimization (csv ready)" : "done: pass (csv ready)";
      return;
    }

    const nextLoad = config.schedule[this.benchmark.stageIndex];
    this.setExtraWorkers(nextLoad);
  }

  #benchmarkPercentile(samples = [], p = 95) {
    if (!Array.isArray(samples) || samples.length === 0) return 0;
    const sorted = samples
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((Math.max(0, Math.min(100, p)) / 100) * sorted.length) - 1));
    return sorted[idx];
  }

  buildBenchmarkCsv() {
    const header = "load,workers,total_entities,avg_fps,avg_frame_ms,p95_frame_ms,p99_frame_ms,avg_actual_scale,capped_pct,bottleneck";
    const rows = this.benchmark.results.map((r) => {
      return [
        r.load,
        r.workers,
        r.totalEntities,
        r.avgFps.toFixed(2),
        r.avgFrameMs.toFixed(3),
        r.p95FrameMs.toFixed(3),
        r.p99FrameMs.toFixed(3),
        r.avgActualScale.toFixed(2),
        r.cappedPct.toFixed(1),
        r.bottleneck,
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
    // v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 5c) — ceiling raised
    // 4.0 → 8.0 to match the new simStepper safeScale clamp. The downstream
    // simStepper still does its own clamp at 8 (defence in depth) and
    // HUDController.timeScaleActualLabel surfaces the real saturated
    // rate when CPU-bound frames push actual back below requested.
    const clamped = Math.max(0.25, Math.min(8.0, Number(scale) || 1));
    this.state.controls.timeScale = clamped;
    this.state.controls.actionMessage = `Time scale ${clamped.toFixed(2)}x`;
    this.state.controls.actionKind = "info";
    this.services.replayService.push({ channel: "time", kind: "timeScale", value: clamped, simSec: this.state.metrics.timeSec });
  }

  // v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 5c) — speed-tier stepper.
  // Tiers are the discrete speed grid players cycle through with `[` / `]`.
  // Routed through `setTimeScale` so the actionMessage / replay-record
  // path matches the existing speed-button click contract. Direction +1
  // steps up, -1 steps down; clamped to the tier table's bounds.
  stepSpeedTier(direction = 1) {
    const TIERS = [0.5, 1, 2, 4, 8];
    const dir = Number(direction) >= 0 ? 1 : -1;
    const current = Number(this.state.controls.timeScale ?? 1);
    // Find the closest tier index by absolute distance.
    let bestIdx = 0;
    let bestDelta = Infinity;
    for (let i = 0; i < TIERS.length; i += 1) {
      const d = Math.abs(TIERS[i] - current);
      if (d < bestDelta) { bestDelta = d; bestIdx = i; }
    }
    const nextIdx = Math.max(0, Math.min(TIERS.length - 1, bestIdx + dir));
    const nextScale = TIERS[nextIdx];
    if (nextScale === current && nextIdx === bestIdx) return;
    this.state.controls.isPaused = false;
    this.setTimeScale(nextScale);
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

  setDisplaySettings(rawSettings = {}) {
    const previous = this.state.controls.display ?? DEFAULT_DISPLAY_SETTINGS;
    const merged = { ...previous, ...(rawSettings ?? {}) };
    const { settings, corrections } = sanitizeDisplaySettings(merged, DEFAULT_DISPLAY_SETTINGS);
    this.state.controls.display = settings;
    this.#applyDisplaySettingsToDom();
    this.renderer?.applyDisplaySettings?.(settings);

    const restartFieldsChanged =
      settings.antialias !== previous.antialias ||
      settings.powerPreference !== previous.powerPreference;
    const resolutionPct = Math.round(settings.resolutionScale * 100);
    const uiPct = Math.round(settings.uiScale * 100);
    const note = restartFieldsChanged
      ? " Anti-aliasing/GPU preference apply on next renderer start."
      : "";
    this.state.controls.actionMessage = corrections.length > 0
      ? corrections[0]
      : `Display updated: ${settings.preset}, ${resolutionPct}% render, ${uiPct}% UI.${note}`;
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
    const next = createInitialGameState({ templateId, seed, terrainTuning, width, height, bareInitial: true });
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
    next.controls.display = { ...(this.state.controls.display ?? DEFAULT_DISPLAY_SETTINGS) };
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
    this.services?.dispose?.();
    this.services = createServices(this.state.world.mapSeed, {
      offlineAiFallback: this.offlineAiFallback,
    });
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
    // v0.10.1-n (A7-rationality-audit P0 #1) — clear HUD caches that survive
    // deepReplaceObject(). The 3-sec rate window (_lastResourceSnapshot.t)
    // and runout-smoothed EWMA otherwise leak the previous run's numbers
    // into the new run's stat bar / rate breakdown for ≥1 minute. Guarded
    // because the very first regenerate call (during constructor) runs
    // before this.hud is wired.
    this.hud?.resetTransientCaches?.();

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
    // A1-stability-hunter Round 3 P0: defence-in-depth around the
    // `snapshotService` `stripUncloneable` fix. If a fresh listener leak
    // sneaks past the recursive scrubber (e.g. a class instance whose
    // toString throws, or a future `structuredClone` quirk), the catch
    // surfaces a user-visible warning via the existing `actionMessage`
    // channel rather than crashing the main loop on an uncaught
    // `DataCloneError`. Save still propagates the failure to callers via
    // `{ok:false}` so `__utopiaLongRun` automation can react.
    let result;
    try {
      result = this.services.snapshotService.saveToStorage(
        slotId,
        this.state,
        this.services.rng.snapshot(),
        { view: this.renderer?.getViewState?.() ?? null },
      );
    } catch (e) {
      const reasonText = `Save Snapshot failed: ${e?.message ?? String(e)}`;
      this.state.controls.actionMessage = reasonText;
      this.state.controls.actionKind = "error";
      return { ok: false, reason: "saveError", reasonText };
    }
    this.state.controls.saveSlotId = slotId;
    this.state.controls.actionMessage = `Snapshot saved (${slotId}, ${result.bytes} bytes).`;
    this.state.controls.actionKind = "success";
    // A1-stability-hunter P2: align return shape with the rest of the
    // `__utopiaLongRun` shims (`{ok, ...}`); existing UI caller in
    // `onSaveSnapshot` ignores the return so this is purely additive.
    return { ok: true, slotId, bytes: result.bytes };
  }

  loadSnapshot(slotId = this.state.controls.saveSlotId ?? "default") {
    const restored = this.services.snapshotService.loadFromStorage(slotId);
    if (!restored) {
      const reasonText = `Snapshot slot '${slotId}' not found.`;
      this.state.controls.actionMessage = reasonText;
      this.state.controls.actionKind = "error";
      // A1-stability-hunter P2: structured failure result so external
      // automation (e.g. `__utopiaLongRun.loadSnapshot`) can distinguish
      // "no such slot" from "succeeded".
      return { ok: false, reason: "notFound", reasonText };
    }
    deepReplaceObject(this.state, restored);
    this.#sanitizeControls(false);
    this.renderer?.applyDisplaySettings?.(this.state.controls.display);
    this.services?.dispose?.();
    this.services = createServices(this.state.world.mapSeed, {
      offlineAiFallback: this.offlineAiFallback,
    });
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
    // A1-stability-hunter P2: success-shape mirrors `placeToolAt`'s
    // `{ok:true, ...}` contract; UI caller in `onLoadSnapshot` ignores.
    return { ok: true, slotId, phase: this.state.session.phase };
  }

  /**
   * v0.10.1 HW7 Final-Polish-Loop Round 0 (B1 action-items-auditor).
   *
   * Dev-only: fast-fill the colony's worker count to `target` so a perf
   * reviewer can reproduce the 75-100 worker stutter scenario directly in
   * an in-browser Playwright session, without invoking the Node-side
   * `scripts/long-run-support.mjs` validator. Called via the always-on
   * `__utopiaLongRun.devStressSpawn(target)` shim.
   *
   * Result shape:
   *   { ok: true, spawned: <int>, total: <int>, fallbackTilesUsed: <int> }
   *   { ok: false, reason: 'invalid_target' | 'no_session' }
   *
   * Notes:
   *   - `target` is silently clamped to [0, 500].
   *   - Returns `{ ok: false, reason: 'no_session' }` when no session is
   *     active (phase !== 'active').
   *   - Honours the infrastructure cap (`populationInfraCap`) — does NOT
   *     bypass the documented balance invariant.
   *
   * @param {number} target               Desired total worker count (0..500).
   * @param {object} [_options]           Reserved for future tuning.
   * @returns {{ok:true, spawned:number, total:number, fallbackTilesUsed:number} |
   *           {ok:false, reason:'invalid_target'|'no_session'}}
   */
  devStressSpawn(target, _options = {}) {
    if (!Number.isFinite(Number(target))) {
      return { ok: false, reason: "invalid_target" };
    }
    if (!this.state || this.state?.session?.phase !== "active") {
      return { ok: false, reason: "no_session" };
    }
    const result = __devForceSpawnWorkers(
      this.state,
      Number(target),
      () => this.services.rng.next(),
    );
    this.#recomputePopulationBreakdown();
    return {
      ok: true,
      spawned: result.spawned,
      total: result.total,
      fallbackTilesUsed: result.fallbackTilesUsed,
    };
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
    if (this.offlineAiFallback) return;
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
          // v0.8.2 Round-6 Wave-1 01a-onboarding (Step 3): in-fiction phrasing
          // for proxy-no-key. The original "AI proxy has no API key" leaked
          // dev jargon ("proxy", "API key") into the player's first 60s. The
          // fallback director steers the colony either way; the player only
          // needs to know the colony is running and the storyteller is the
          // built-in one.
          this.state.controls.actionMessage = "Story AI offline — fallback director is steering. (Game still works.)";
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
          // v0.8.2 Round-6 Wave-1 01a-onboarding (Step 3): drop the raw
          // err.message ("fetch failed", "AbortError: timeout", etc.) from
          // the player-facing actionMessage and rephrase in-fiction. The
          // original message is still captured to console.warn + a
          // dev-targeted `pushWarning(..., "ai-health")` so the dev panel /
          // browser console retains the diagnostic. This silences the red
          // toast strip that reviewers consistently report as "looks like
          // the game is broken on first launch".
          //
          // v0.8.2 Round-6 Wave-1 01c-ui (Step 3): also stash the raw err
          // string on `state.debug.lastAiError` so dev-mode tooling can
          // read it (per Stage B summary §2 D1 — Wave-1 main-author of the
          // dev-mode quarantine introduces this state field). Casual
          // `actionMessage` keeps the in-fiction "Story AI is offline ..."
          // phrasing pinned by 01a's onboarding-noise-reduction.test.js
          // (do-not-rollback rule); dev-mode `actionMessage` tacks the
          // err.message onto the toast for engineers. `actionKind` flips
          // to `"ai-down"` so HUD can theme the toast distinctly from
          // generic `info` events.
          const errText = String(err?.message ?? err ?? "unknown");
          console.warn("[Project Utopia] AI proxy unreachable:", errText);
          pushWarning(this.state, `AI proxy unreachable (${errText}). Fallback director engaged.`, "warn", "ai-health");
          if (!this.state.debug || typeof this.state.debug !== "object") this.state.debug = {};
          this.state.debug.lastAiError = errText;
          // Casual baseline: keep the 01a in-fiction phrasing (pinned by
          // onboarding-noise-reduction.test.js — do-not-rollback rule).
          this.state.controls.actionMessage = "Story AI is offline — fallback director is steering. (Game still works.)";
          if (isDevMode(this.state)) {
            this.state.controls.actionMessage += ` [${errText}]`;
          }
          this.state.controls.actionKind = "ai-down";
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
      const inputType = String(active.getAttribute?.("type") ?? "text").toLowerCase();
      const textLikeInput = tag === "INPUT"
        && ["", "text", "number", "search", "email", "url", "password", "tel"].includes(inputType);
      if ((textLikeInput || tag === "TEXTAREA" || tag === "SELECT") && !active.disabled) {
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

    // v0.8.2 Round-6 Wave-1 02b-casual (Step 2) — defensive F1 swallow.
    // Even before resolveGlobalShortcut runs we unconditionally call
    // preventDefault for the F1 key. The browser default in some shells
    // ("Help", quick-find, legacy refresh) reloads the page and casual
    // reviewer lost progress 3× in 25min to this. Cheap belt-and-braces
    // — runs even when shouldIgnoreGlobalShortcut would otherwise let the
    // event bubble (e.g. a focused button on the topbar).
    if (event && (event.key === "F1" || event.code === "F1")) {
      event.preventDefault();
    }

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
    // v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 5c) — `[` / `]` step the
    // speed tier without involving the speed-button click handlers. Routed
    // through `stepSpeedTier` so the actionMessage / replay-record path
    // matches a button click.
    if (action.type === "speedTierStep") {
      this.stepSpeedTier(action.direction);
      return;
    }
    // v0.8.2 Round-6 Wave-1 02b-casual (Step 2) — F1 / ? open the in-game
    // Help modal. The modal itself is wired in index.html via
    // window.__utopiaHelp.open(); we delegate to that global so the modal
    // remains the single source of truth (CSS, focus management, ESC-to-
    // close all live there). Defensive guard if the global is missing.
    if (action.type === "openHelp") {
      const helpApi = (typeof window !== "undefined") ? window.__utopiaHelp : null;
      if (helpApi && typeof helpApi.open === "function") {
        helpApi.open();
      }
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
    // v0.10.1-n (A7-rationality-audit P0 #3) — align "OFF" wording with the
    // sidebar tooltip + Help dialog so reviewers reading the docs cannot
    // mistake the toast for a different action ("Tile icons enabled" came
    // from setTileIconsVisible — a different sidebar button — not L).
    const label = mode === "heat"
      ? "Heat lens ON — red = surplus, blue = starved."
      : mode === "off"
        ? "Heat lens OFF."
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
    // v0.10.1-A3 R2 (F5) — pulse the terrainLensLabel briefly when an
    // overlay flips ON so the player notices the lens auto-switched in
    // response to a tool selection (Farm → Fertility, Quarry → Node
    // Health, etc.). The CSS rule `body.overlay-just-toggled
    // #terrainLensLabel:not([hidden])` runs a 1.4s keyframe; we strip
    // the class after the animation so subsequent renders don't restart
    // it. Only triggers on mode-on transitions (mode != null) — turning
    // an overlay OFF is a quiet action.
    if (mode && typeof document !== "undefined" && document.body && typeof document.body.classList !== "undefined") {
      try {
        document.body.classList.remove("overlay-just-toggled");
        // Force a reflow so re-adding the class restarts the keyframe.
        // eslint-disable-next-line no-unused-expressions
        void document.body.offsetWidth;
        document.body.classList.add("overlay-just-toggled");
        if (typeof setTimeout === "function") {
          setTimeout(() => {
            try { document.body.classList.remove("overlay-just-toggled"); } catch { /* DOM gone — safe no-op */ }
          }, 1400);
        }
      } catch {
        // headless DOM / forbidden contexts — pulse is UI sugar.
      }
    }
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
        // v0.10.1-A3 (F3) — surface BOTH the tool that was selected AND the
        // auto-overlay side-effect in one toast. Reviewer A3 pressed `2`
        // expecting a build-tool toast and instead saw the overlay name only,
        // making the keybinding feel like a lie. Format:
        //   "Tool: Farm · auto-overlay: Fertility"
        const MODE_LABELS = {
          fertility:     "Fertility",
          elevation:     "Elevation",
          connectivity:  "Connectivity",
          nodeDepletion: "Node Health",
        };
        const toolLabel = typeof tool === "string" && tool.length > 0
          ? tool.charAt(0).toUpperCase() + tool.slice(1)
          : String(tool);
        this.state.controls.actionMessage =
          `Tool: ${toolLabel} · auto-overlay: ${MODE_LABELS[mode] ?? mode}`;
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
    // v0.8.2 Round-6 Wave-1 02b-casual (Step 3) — blur the menu's
    // <select id="overlayMapTemplate"> and any focused menu select so
    // pressing 1-9 after Start Colony selects a build tool instead of
    // re-rolling the map template. Casual reviewer reported "I pressed 3
    // and the map regenerated" — this is the select element keeping
    // keyboard focus and consuming digit keys for option-cycling. We
    // only blur known menu selects (by id whitelist) to avoid clobbering
    // unrelated input focus the user may have intentionally established.
    if (typeof document !== "undefined") {
      const MENU_SELECT_IDS = ["overlayMapTemplate", "mapTemplateSelect", "doctrineSelect"];
      for (const id of MENU_SELECT_IDS) {
        document.getElementById(id)?.blur?.();
      }
      const active = document.activeElement;
      if (active && typeof active.matches === "function") {
        if (active.matches("#overlayMapTemplate, #mapTemplateSelect, #doctrineSelect")) {
          active.blur?.();
        }
      }
    }
    this.#setRunPhase("active", {
      actionMessage: `Run started: ${mapLabel} (${mapSize} tiles). Build the starter network now. Try Again replays this layout; New Map rerolls.`,
      actionKind: "success",
    });
    audioSystem.onGameStart();
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
    // v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 2b) — record the run into
    // the local leaderboard BEFORE flipping to the end phase so the boot /
    // end overlay reads the freshest entry on its first render. The
    // benchmarkMode bypass mirrors ResourceSystem's pattern (see :462) so
    // long-horizon-bench runs do not pollute the persistent leaderboard.
    // ANY storage failure (QuotaExceededError, Safari private-mode, etc.)
    // is swallowed by the service itself — try/catch here is a second safety
    // net so a bad serialiser path can never block the end-phase transition.
    if (this.state.benchmarkMode !== true) {
      try {
        this.services.leaderboardService?.recordRunResult({
          ts: Date.now(),
          seed: this.state.world?.mapSeed,
          templateId: this.state.world?.mapTemplateId,
          templateName: this.state.world?.mapTemplateName,
          scenarioId: this.state.gameplay?.scenario?.id ?? "",
          survivedSec: Math.floor(this.state.metrics?.timeSec ?? 0),
          score: Math.floor(this.state.metrics?.survivalScore ?? 0),
          devIndex: Math.round(this.state.gameplay?.devIndexSmoothed ?? this.state.gameplay?.devIndex ?? 0),
          deaths: Number(this.state.metrics?.deathsTotal ?? 0),
          workers: Number(this.state.metrics?.populationStats?.workers ?? 0),
          cause: outcome.outcome ?? "loss",
        });
      } catch {
        // intentional: leaderboard persistence must never block end-phase.
      }
    }
    this.#setRunPhase("end", {
      ...outcome,
    });
  }

  #applyDisplaySettingsToDom() {
    const { settings } = sanitizeDisplaySettings(this.state.controls.display, DEFAULT_DISPLAY_SETTINGS);
    this.state.controls.display = settings;
    if (typeof document === "undefined") return;
    // v0.9.2-ui (F15) — kept --utopia-ui-scale for backward compatibility,
    // but layout now scales by rem via --utopia-font-scale. zoom() squashed
    // pixels; rem reflows layout so shrinking re-flows instead of forcing
    // visual shrinkage. The slider (80-140%) maps to a 0.85-1.15x scaling
    // of the responsive base (clamp(12px, 0.6vw + 0.55rem, 16px)) so the
    // player's UI-Scale choice adjusts legibility without forcing pixel
    // shrinkage.
    const scale = Number(settings.uiScale ?? 1);
    document.documentElement.style.setProperty("--utopia-ui-scale", scale.toFixed(2));
    // Map 0.8-1.4 slider range to a 0.85-1.15× type-scale multiplier so
    // visual change is smoother and legibility stays readable at extremes.
    const typeScale = 0.85 + 0.3 * Math.max(0, Math.min(1, (scale - 0.8) / 0.6));
    document.documentElement.style.setProperty("--utopia-font-scale", typeScale.toFixed(3));
  }

  #sanitizeControls(notify = false) {
    const { corrections } = sanitizeControlSettings(this.state.controls);
    this.#applyDisplaySettingsToDom();
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
      this.state.controls.display = sanitizeDisplaySettings({
        ...(this.state.controls.display ?? DEFAULT_DISPLAY_SETTINGS),
        preset: "performance",
        resolutionScale: 0.65,
        renderMode: "2d",
        shadowQuality: "off",
        effectsEnabled: false,
        weatherParticles: false,
        heatLabels: false,
        entityAnimations: false,
      }, DEFAULT_DISPLAY_SETTINGS).settings;
      this.uiRefreshIntervalSec = Math.max(this.uiRefreshIntervalSec, 1 / 2);
      if (typeof document !== "undefined") {
        const wrapRoot = document.getElementById("wrap");
        wrapRoot?.classList.add("dock-collapsed");
      }
      this.state.controls.actionMessage = `Memory pressure mode enabled (${memMb.toFixed(0)}MB).`;
      this.state.controls.actionKind = "error";
      this.#sanitizeControls(false);
      this.renderer?.applyDisplaySettings?.(this.state.controls.display);
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
    this.services?.dispose?.();
    this.renderer?.dispose?.();
  }
}
