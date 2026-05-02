# Architecture Overview — Project Utopia

> Last updated: v0.10.1 HW7 Final-Polish-Loop (Round 0 → R3 + Hotfix iter 1-4). Source of truth: `src/config/constants.js`, `src/app/GameApp.js`, `src/entities/EntityFactory.js`.

## HW7 Final-Polish-Loop refactor waves (C1 roadmap status)

The HW7 polish loop ran four rounds (R0 → R3) plus a four-iteration hotfix pass. Architectural movement during this window was concentrated in the C1-code-architect "PriorityFSM extraction" roadmap:

| Wave | Status | Round | Outcome |
|---|---|---|---|
| wave-1 — docs sync (worker-ai.md → v0.10.0 PriorityFSM) | DONE | R0 | commit 78b346e (`docs/systems/03-worker-ai.md` +309/-301 + `worker-fsm-doc-contract.test.js` lock) |
| wave-2 — extract generic `PriorityFSM` dispatcher; `WorkerFSM.js` becomes ~55 LOC facade | DONE | R1 | commit 439b120 (`src/simulation/npc/PriorityFSM.js` introduced; `fsm/WorkerFSM.js` re-exports the facade) |
| wave-3 — VisitorAI staged behind `FEATURE_FLAGS.USE_VISITOR_FSM` (default OFF) + 3 `fsm/Visitor*.js` files + 9 invariant tests | DONE | R2 | commit d725bcf |
| wave-3.5 — flag flipped ON + flag retired; legacy `StatePlanner`/`StateGraph` dispatch in `VisitorAISystem.update()` deleted | DONE | R3 | `USE_VISITOR_FSM` removed from `FEATURE_FLAGS`; VisitorAISystem unconditionally routes through `fsm/VisitorFSM.js` |
| wave-4 — AnimalAI migration onto the same `PriorityFSM` dispatcher | PENDING | — | deferred to HW8 (`debt-anim-1` carried forward) |

`ColonyPlanner` (1867 LOC) and `ColonyPerceiver` (1966 LOC) remain the two D-grade systems; their refactor is the C1 roadmap's "Refactor-3" item and is **not started** — see `debt-cp-*` / `debt-perc-*` in `docs/systems/03-worker-ai.md` § Architectural Debt.

`PriorityFSM` (`src/simulation/npc/PriorityFSM.js`) is the unified NPC AI dispatcher framework: it accepts injected `STATE_BEHAVIOR` / `STATE_TRANSITIONS` / `DISPLAY_LABEL` maps and is consumed by both `WorkerFSM` and `VisitorFSM`. AnimalFSM (HW8) will be the third consumer.

## HW7 Hotfix wave (iter 1-4)

A four-iteration hotfix pass ran after R3 closeout to address user-playtest issues that were not in scope for the formal review-driven plans:

- **iter 1-2 (Batch A — wildlife + boids path-dampening)** — `INITIAL_POPULATION.herbivores 3 → 8`, `predators 1 → 2`, `BALANCE.wildlifeSpawnRadiusBonus 3 → 6`, plus a hard-coded `SEP_DAMPEN_ON_PATH = 0.35` constant in `BoidsSystem.computeBoidsForce` so workers/visitors with an active A* path receive ~3× weaker inter-entity separation (lets seek dominate sep on narrow lanes).
- **iter 2 (Batch B — recovery essentials + autopilot scout)** — `RECOVERY_ESSENTIAL_TYPES = Set(["farm","lumber","warehouse","road"])` exported from `ProgressionSystem.js`; `ColonyDirectorSystem` reads it for the recovery whitelist + adds a "scout-road-toward-fogged-stone" proposer.
- **iter 3 (Batch C — Dev Entity Inject + heat-lens worker tooltip)** — dev-only `__devSpawnAnimals` / `__devClearVisitors` on `GameApp` + per-tile worker aggregator in `PressureLens` for live tooltip enrichment.
- **iter 4 (Batch E + F — pop cap removal + bottom dev dock hidden)** — `infraCap` / `popCap` `Math.min(80, ...)` clamps deleted from `PopulationGrowthSystem` + `ColonyPerceiver`; default `state.controls.recruitTarget` raised 16 → 500; `#devDock` force-hidden via `display: none !important` in `index.html` so dev mode matches production-deploy parity.

---

## Game Loop

The game is driven by a **fixed-timestep accumulator loop** implemented across three files.

`src/app/GameLoop.js` owns the raw `requestAnimationFrame` driver. It caps render rate at 60 FPS (`maxFps`), clamps raw `dt` to 100 ms to prevent spiral-of-death on tab un-focus, and calls two callbacks each frame:

```
GameLoop.frame(now)
  → app.update(frameDt)   // physics / simulation tick
  → app.render(frameDt)   // Three.js scene + UI panels
```

`src/app/simStepper.js` (`computeSimulationStepPlan`) converts wall-clock `frameDt` into an integer number of fixed simulation steps to execute this frame. Key parameters:

| Parameter | Default | Notes |
|---|---|---|
| `fixedStepSec` | 1/30 s | Configurable 1/120–1/5 via Performance Panel |
| `timeScale` | 1 | Clamped 0.1–4.0; ×4 is the "Fast Forward" ceiling |
| `maxSteps` | 6 | Hard cap prevents CPU spiral under load |
| accumulator ceiling | 0.5 s | Prevents unbounded catch-up debt |

When paused, the accumulator stops but `stepFramesPending > 0` allows single-step debugging via the Performance Panel.

`GameApp.stepSimulation(simDt)` iterates the ordered systems array and calls `system.update(simDt, state, services)` for each one. Per-system wall-clock timings are profiled every 4th frame and stored in `state.debug.systemTimingsMs`.

---

## SYSTEM_ORDER — The Fixed Update Pipeline

All 23 declared systems run in the sequence defined in `src/config/constants.js`. The array is frozen and validated at boot by `assertSystemOrder`, which enforces that certain triplets appear in the correct relative order (e.g. `DevIndexSystem` → `RaidEscalatorSystem` → `EventDirectorSystem`).

```js
export const SYSTEM_ORDER = Object.freeze([
  "SimulationClock",         // 1.  Advance timeSec, tick; day/night cycle
  "VisibilitySystem",        // 2.  Update fog-of-war reveal radius
  "ProgressionSystem",       // 3.  Objectives, milestone checks, survival score
  "DevIndexSystem",          // 4.  Compute 6-dimension DevIndex score
  "RaidEscalatorSystem",     // 5.  Consume DevIndex → set raid tier/interval
  "EventDirectorSystem",     // 6.  v0.8.2 R6/W2 — proactive event pressure (queues raids/morale/disease/wildfire)
  "AgentDirectorSystem",     // 7.  v0.10.x Phase A — LLM colony planner; wraps ColonyDirectorSystem as fallback
  "RoleAssignmentSystem",    // 8.  Reassign worker roles based on quotas
  "PopulationGrowthSystem",  // 9.  Births, emigration, recruitTarget gating (no hard pop cap as of HW7 hotfix iter4)
  "EnvironmentDirectorSystem",// 10. Apply LLM/fallback environment directives
  "WeatherSystem",           // 11. Advance weather state machine
  "WorldEventSystem",        // 12. Spawn raids, caravans, migrations
  "TileStateSystem",         // 13. Soil fertility, salinization, fallow ticks
  "NPCBrainSystem",          // 14. LLM/fallback policy dispatch to groups
  "WarehouseQueueSystem",    // 15. Route haul requests through warehouse slots
  "WorkerAISystem",          // 16. Per-worker FSM dispatch → action execution
  "ConstructionSystem",      // 17. v0.8.4 Agent A — apply builder workSec, complete sites
  "VisitorAISystem",         // 18. Trader/saboteur behaviour (Visitor PriorityFSM as of R3)
  "AnimalAISystem",          // 19. Herbivore/predator behaviour (legacy StatePlanner — wave-4 pending)
  "MortalitySystem",         // 20. Hunger death, starvation timers, medicine
  "BoidsSystem",             // 21. Flocking velocity integration (path-dampened separation as of HW7 hotfix iter1)
  "ResourceSystem",          // 22. Resource flow accounting, spoilage, crisis detection
  "ProcessingSystem",        // 23. Kitchen/smithy/clinic production cycles
]);
```

`AgentDirectorSystem` internally wraps the legacy `ColonyDirectorSystem` as a fallback and delegates to it when `state.ai.coverageTarget === "fallback"` (Autopilot OFF), so behaviour is unchanged for non-LLM runs. The actual `createSystems()` array in `GameApp` additionally includes `WildlifePopulationSystem` (between `MortalitySystem` and `BoidsSystem`) — the `SYSTEM_ORDER` constant documents the canonical intent order; the runtime assertion only checks the declared triplet constraints.

---

## Global State Object

There is **one mutable plain-object tree** (`state`) that every system reads and writes directly. It is created by `createInitialGameState()` in `src/entities/EntityFactory.js` and stored as `GameApp.state`. No message passing, no reactive framework — systems mutate state in place.

### Top-level fields

```js
state = {
  // ── World ─────────────────────────────────────────────────────────────────
  grid,          // { tiles: Uint8Array(96×72), width, height, seed, version,
                 //   tileState: Array, nodeFlags: Uint8Array, fogState: Uint8Array,
                 //   elevation: Float32Array, moisture: Float32Array, … }

  // ── Entities ──────────────────────────────────────────────────────────────
  agents,        // Agent[]  — workers + visitors (mixed ENTITY_TYPE)
  animals,       // Animal[] — herbivores + predators

  // ── Economy ───────────────────────────────────────────────────────────────
  resources: {
    food, wood, stone, herbs,     // raw resources (colony-wide stockpile)
    meals, medicine, tools,       // processed goods
  },
  buildings,     // { farms, lumbers, warehouses, roads, … } — counts rebuilt
                 // from grid by rebuildBuildingStats() whenever tiles change

  // ── Environment ───────────────────────────────────────────────────────────
  weather: {
    current,               // WEATHER enum key
    timeLeftSec,
    moveCostMultiplier,
    farmProductionMultiplier,
    hazardTiles,           // Array<{ix,iz}> of active hazard positions
    hazardTileSet,         // Set<"ix,iz"> for O(1) lookup
    pressureScore,
    …
  },
  environment: {
    dayNightPhase,         // 0-1 within 60s cycle
    isNight,
    lightLevel,            // 0-1 (0 = midnight, 1 = noon)
  },
  events: {
    log,                   // ring buffer of last 200 GameEventBus events
    listeners,             // Map<eventType, handler[]>
    queue,                 // pending world events
    active,                // currently active world events
  },

  // ── AI ────────────────────────────────────────────────────────────────────
  ai: {
    enabled,               // bool — autopilot on/off
    mode,                  // "fallback" | "llm"
    groupPolicies,         // Map<groupId, { data: PolicyObject }>
    lastEnvironmentDirective,
    lastPolicyBatch,
    policyHistory,         // ring buffer of 32 policy-change records
    groupStateTargets,     // Map<groupId, stateTarget>
    pausedByCrisis,        // bool — food-crisis auto-pause flag
    …
  },

  // ── Gameplay / Meta ───────────────────────────────────────────────────────
  gameplay: {
    doctrine,              // "balanced" | "military" | "economic" | …
    modifiers,             // { farmYield, lumberYield, … } — doctrine multipliers
    prosperity,            // 0-100
    threat,                // 0-100
    devIndex,              // 0-100 composite development score
    devIndexSmoothed,
    devIndexDims,          // { population, economy, infrastructure, production,
                           //   defense, resilience }
    devIndexHistory,       // Array of { t, score } samples
    raidEscalation,        // { tier, intervalTicks, intensityMultiplier }
    scenario,              // active ScenarioBundle
    objectives,            // Array<Objective>
    objectiveIndex,        // current active objective
    wildlifeRuntime,       // zone control, cluster state
    recovery,              // { charges, activeBoostSec, collapseRisk }
    …
  },

  // ── Metrics / Telemetry ───────────────────────────────────────────────────
  metrics: {
    timeSec, tick, frameCount, renderFrameCount,
    averageFps, simCostMs, frameMs, uiCpuMs, renderCpuMs,
    deathsTotal, deathsByReason,
    survivalScore, birthsTotal,
    logistics,             // { carryingWorkers, avgDepotDistance, … }
    ecology,               // { activeGrazers, pressuredFarms, … }
    spatialPressure,       // { weatherPressure, eventPressure, … }
    aiRuntime,             // { decisions, latency, … }
    …
  },

  // ── Controls ──────────────────────────────────────────────────────────────
  controls: {
    tool,                  // active build tool name
    isPaused,
    timeScale,
    fixedStepSec,
    roleQuotas,            // { cook, smith, herbalist, haul, stone, herbs }
    populationTargets,     // { workers, traders, saboteurs, herbivores, predators }
    selectedEntityId,
    doctrine,
    actionMessage,         // one-line status shown in HUD
    …
  },

  // ── Session ───────────────────────────────────────────────────────────────
  session: {
    phase,                 // "menu" | "active" | "ended"
    outcome,               // "none" | "victory" | "defeat"
    reason,
    endedAtSec,
  },

  // ── World Metadata ────────────────────────────────────────────────────────
  world: {
    mapTemplateId, mapTemplateName, mapSeed, terrainTuning,
  },

  // ── Debug ─────────────────────────────────────────────────────────────────
  debug: {
    systemTimingsMs,       // { [systemName]: { last, avg, peak } }
    astar,                 // A* cache hit/miss stats
    boids,                 // flocking stats
    traffic,               // tile load/penalty data
    gridStats,             // counts by tile type
    logic,                 // path recalcs, goal flips, invalid transitions
    …
  },
}
```

### Agent object (worker)

Each element of `state.agents` with `type === "WORKER"` has this shape:

```js
{
  id, displayName, type: "WORKER",
  x, z,                  // world-space position (float)
  vx, vz,                // current velocity
  desiredVel: {x, z},    // boids target velocity
  role,                  // ROLE enum key
  groupId,               // "workers"
  hunger, stamina,       // 0-1 needs
  rest, morale, social, mood,
  carry: { food, wood, stone, herbs }, // items in transit (not colony stockpile)
  hp, maxHp, alive, deathReason, deathSec,
  stateLabel,            // display string ("Idle", "Harvest", …) — single-write by FSM dispatcher
  fsm: {                 // v0.10.0+ PriorityFSM source of truth
    state,               //   STATE enum value (IDLE / SEEKING_HARVEST / HARVESTING / …)
    enteredAtSec,        //   timeSec at last transition into this state
    target,              //   { ix, iz, meta? } chosen by current state's onEnter
    payload,             //   free-form per-state scratch (cleared on transition)
  },
  targetTile,            // { ix, iz } current pathing destination
  path,                  // Array<{ix,iz}> A* result
  pathIndex,
  blackboard: {
    intent,              // semantic intent string ("harvest", "deliver", …)
    aiTargetState,       // policy-derived state target from NPCBrainSystem fanout
    emergencyRationCooldownSec,
    carryAgeSec,         // continuous-non-zero-carry timer (drives carry-pressure transition)
    carryTicks,          // off-road tick counter (drives perishable spoilage)
  },
  policy,                // active policy override from NPCBrainSystem
  traits, skills, backstory,
  metabolism: { hungerSeekThreshold, eatRecoveryTarget, … },
  relationships,         // { workerId: opinion -1..1 }
  memory: { recentEvents, dangerTiles },
  debug: { lastIntent, lastPathLength, lastPathRecalcSec },
}
```

Animals (`state.animals`) share most navigation fields but have `kind` (HERBIVORE / PREDATOR), territory memory, and no `carry` or `role`.

---

## How Systems Communicate

All inter-system communication happens through **direct mutation of the shared `state` object**. There is no message bus between systems (the `GameEventBus` is a lightweight append-only event log on `state.events.log`, used for UI display and one-way notifications, not for system-to-system coordination).

Patterns used:

**Read → Write in a later system.** `DevIndexSystem` writes `state.gameplay.devIndex` and `devIndexDims`; `RaidEscalatorSystem` reads those fields in the next slot. The ordering constraint in `SYSTEM_ORDER` enforces the dependency.

**Shared sub-objects.** `state.ai.groupPolicies` (a `Map`) is written by `NPCBrainSystem` and read by `WorkerAISystem`, `VisitorAISystem`, `AnimalAISystem` via `worker.policy ?? state.ai.groupPolicies.get(groupId)`.

**Side-channel scratch fields.** `state._resourceFlowAccum` is lazily initialised by `ResourceSystem`; `ProcessingSystem` and `MortalitySystem` call the exported `recordResourceFlow(state, resource, kind, amount)` helper to accumulate flow data before `ResourceSystem` flushes it to `state.metrics`.

**GameEventBus.** `emitEvent(state, EVENT_TYPES.X, detail)` appends a timestamped record to `state.events.log` (capped at 200 entries). Systems subscribe via `state.events.listeners` (a `Map`). Used for: worker death, weather change, food crisis, raid, day/night transition. `GameApp.#maybeAutopauseOnFoodCrisis()` scans the tail of the log after each `stepSimulation` to detect `FOOD_CRISIS_DETECTED` events.

**Services object.** `GameApp` passes a `services` bag as the third argument to every `system.update(dt, state, services)`. This bag is mutation-safe (systems can write transient fields to it) and holds:

```js
services = {
  pathCache,        // PathCache(700) — LRU A* result cache
  pathBudget,       // { tick, usedMs, skipped, maxMs } — per-tick CPU budget
  llmClient,        // LLMClient — async HTTP wrapper for /api/ai/*
  fallbackEnvironment, fallbackPolicies,  // deterministic offline generators
  rng,              // SeededRng — shared deterministic PRNG
  snapshotService,  // save/load slots
  replayService,    // structured replay event log
  memoryStore,      // MemoryStore — AI long-term memory stream
}
```

---

## Module Organisation

```
src/
├── app/                   Application bootstrap and frame loop
│   ├── GameApp.js         Root class: owns state, systems, renderer, UI panels
│   ├── GameLoop.js        rAF driver with FPS cap and dt clamp
│   ├── SimulationClock.js First system: advances timeSec, tick, day/night
│   ├── simStepper.js      Fixed-step accumulator computation (pure function)
│   ├── createServices.js  Factory for the services bag (pathCache, rng, llm, …)
│   ├── rng.js             SeededRng, deriveRngSeed
│   ├── snapshotService.js Save/load JSON snapshots
│   ├── replayService.js   Structured replay event log
│   ├── warnings.js        pushWarning() → state.metrics.warnings
│   └── …                  devModeGate, shortcutResolver, aiRuntimeStats, …
│
├── config/                Frozen constants and balance values
│   ├── constants.js       TILE, ROLE, ENTITY_TYPE, SYSTEM_ORDER, TILE_INFO, …
│   ├── balance.js         BALANCE — all numeric tuning parameters
│   └── aiConfig.js        GROUP_IDS, DEFAULT_GROUP_POLICIES, intent tables
│
├── entities/
│   └── EntityFactory.js   createInitialGameState(), createWorker(),
│                          createVisitor(), createAnimal()
│
├── simulation/
│   ├── economy/           Resource and building systems
│   │   ├── ResourceSystem.js      Colony-wide stockpile accounting, spoilage,
│   │   │                          food-crisis detection, resource flow tracking
│   │   ├── ProcessingSystem.js    Kitchen / smithy / clinic production cycles
│   │   ├── TileStateSystem.js     Soil fertility, salinization, fallow, node depletion
│   │   ├── WarehouseQueueSystem.js Haul slot routing and timeout
│   │   └── LogisticsSystem.js     Isolation scoring, worksite distance metrics
│   │
│   ├── npc/               Entity AI execution layer
│   │   ├── WorkerAISystem.js      Per-worker tick — drives WorkerFSM + mood/social bookkeeping
│   │   ├── VisitorAISystem.js     Trader / saboteur behaviour (PriorityFSM via fsm/VisitorFSM.js)
│   │   ├── AnimalAISystem.js      Herbivore / predator behaviour (legacy StatePlanner — wave-4 pending)
│   │   ├── PriorityFSM.js         Generic priority dispatcher (HW7 R1 wave-2; shared by Worker + Visitor)
│   │   ├── JobReservation.js      Tile-level job lock registry
│   │   ├── fsm/                   PriorityFSM definitions (Worker + Visitor)
│   │   │   ├── WorkerFSM.js       Thin facade over PriorityFSM (~55 LOC)
│   │   │   ├── WorkerStates.js    STATE enum, STATE_BEHAVIOR, DISPLAY_LABEL maps
│   │   │   ├── WorkerTransitions.js  STATE_TRANSITIONS[from] = [{ priority, to, when }, …]
│   │   │   ├── WorkerConditions.js / WorkerHelpers.js  Predicates + reservation helpers
│   │   │   ├── VisitorFSM.js      Visitor PriorityFSM facade (HW7 R3 wave-3.5)
│   │   │   ├── VisitorStates.js   Visitor state behaviour map
│   │   │   └── VisitorTransitions.js  Visitor priority-ordered transitions
│   │   └── state/                 LEGACY — only AnimalAISystem still imports from here
│   │       ├── StatePlanner.js    planEntityDesiredState() — animal policy → desired state
│   │       ├── StateGraph.js      transitionEntityState(), valid transitions
│   │       └── StateFeasibility.js isStateFeasible() — resource/reachability guards
│   │
│   ├── ai/                AI decision layer (above NPC execution)
│   │   ├── brains/
│   │   │   └── NPCBrainSystem.js  Schedules LLM/fallback policy requests per group
│   │   ├── strategic/
│   │   │   ├── StrategicDirector.js  High-level goal selection (grow/defend/survive)
│   │   │   └── DecisionScheduler.js  Rate-limits expensive AI calls
│   │   ├── director/
│   │   │   └── EnvironmentDirectorSystem.js  Applies environment directives to world
│   │   ├── colony/
│   │   │   ├── ColonyPlanner.js   Role-aware production plans for fallback AI
│   │   │   ├── ColonyPerceiver.js Snapshot of colony state for AI prompts
│   │   │   ├── PlacementSpecialist.js  Tile placement heuristics
│   │   │   ├── RoadPlanner.js     Algorithmic road network expansion
│   │   │   └── PlanExecutor.js    Executes AI build/assign plans
│   │   ├── llm/
│   │   │   ├── LLMClient.js       Async HTTP client for /api/ai/environment + /policy
│   │   │   ├── PromptBuilder.js   Constructs LLM prompts; exports offline fallbacks
│   │   │   ├── ResponseSchema.js  Validates and sanitises LLM JSON responses
│   │   │   └── Guardrails.js      Post-validation safety clamps
│   │   └── memory/
│   │       ├── MemoryStore.js     Rolling event memory stream
│   │       ├── MemoryObserver.js  Ingests state changes into MemoryStore
│   │       └── WorldSummary.js    Builds concise state summaries for AI prompts
│   │
│   ├── meta/              Colony-level scoring and event management
│   │   ├── ColonyDirectorSystem.js  Auto-builder (phase: bootstrap → expansion)
│   │   ├── DevIndexSystem.js        Six-dimension development score
│   │   ├── RaidEscalatorSystem.js   Maps DevIndex → raid tier/interval
│   │   ├── ProgressionSystem.js     Objective tracking, survival score accrual
│   │   ├── RaidEscalatorSystem.js
│   │   └── GameEventBus.js          emitEvent(), EVENT_TYPES, initEventBus()
│   │
│   ├── population/
│   │   ├── RoleAssignmentSystem.js  Pop-aware quota computation and role assignment
│   │   └── PopulationGrowthSystem.js  Birth/death/emigration events
│   │
│   ├── lifecycle/
│   │   └── MortalitySystem.js       Hunger death timers, medicine healing,
│   │                                predation kill processing
│   │
│   ├── navigation/        Pathfinding infrastructure
│   │   ├── AStar.js         Grid A* implementation
│   │   ├── Navigation.js    Entity path lifecycle: request, follow, stuck detection
│   │   ├── PathCache.js     LRU cache keyed on (from, to, gridVersion)
│   │   └── RoadNetwork.js   Union-Find road connectivity + speed bonus
│   │
│   ├── construction/
│   │   ├── BuildSystem.js    Player tile placement, undo/redo stack
│   │   └── BuildAdvisor.js   Cost / feasibility checks for auto-builder
│   │
│   ├── ecology/
│   │   └── WildlifePopulationSystem.js  Zone-aware animal births, predator retreats
│   │
│   ├── movement/
│   │   └── BoidsSystem.js    Velocity integration, separation, collision avoidance
│   │       (uses SpatialHash.js for neighbour queries)
│   │
│   └── telemetry/
│       └── EconomyTelemetry.js  Sliding-window production/consumption metrics
│
├── world/                 Grid, terrain and scenario generation
│   ├── grid/
│   │   ├── Grid.js          createInitialGrid(), worldToTile(), tileToWorld(),
│   │   │                    rebuildBuildingStats(), MAP_TEMPLATES, …
│   │   └── TileTypes.js     Passability and cost helpers
│   ├── scenarios/
│   │   └── ScenarioFactory.js  buildScenarioBundle(), seedResourceNodes(),
│   │                           wildlife zones, objective sets
│   ├── weather/
│   │   └── WeatherSystem.js    State machine: clear/rain/storm/drought/winter
│   └── events/
│       └── WorldEventSystem.js Raid / caravan / migration spawning
│
├── render/                Three.js rendering
│   ├── SceneRenderer.js   Scene graph, camera, tile meshes, entity sprites
│   ├── ProceduralTileTextures.js  Per-tile texture generation
│   ├── PressureLens.js    Supply-chain heat overlay
│   ├── FogOverlay.js      Fog-of-war visibility shader
│   └── AtmosphereProfile.js  Day/night lighting profiles
│
└── ui/                    HUD and panel rendering (DOM, no framework)
    ├── hud/
    │   ├── HUDController.js     Top status bar, resource counters, food rate breakdown
    │   └── GameStateOverlay.js  Start/end/pause screen
    ├── panels/
    │   ├── InspectorPanel.js    Selected-tile details
    │   ├── AIDecisionPanel.js   LLM decision log
    │   ├── EntityFocusPanel.js  Per-entity stats (worker needs, traits, memory)
    │   ├── PerformancePanel.js  FPS, system timings, benchmark controls
    │   └── DeveloperPanel.js    Telemetry, AI traces, grid stats
    └── tools/
        └── BuildToolbar.js      Build tool palette, map regen, snapshot controls
```

---

## Entry Points

### `index.html`

A single-file HTML document (~2500 lines) that embeds all CSS, defines the DOM structure (canvas `#c`, HUD elements, sidebar panels), and ends with:

```html
<script type="module" src="/src/main.js"></script>
```

Vite serves this file in dev mode (`npx vite`) and bundles it for production. No separate Vite config file — defaults are used.

### `src/main.js`

The ES module entry point. Guards against non-browser environments (Node test runs import utilities from here safely because `document` is undefined and the boot block is skipped):

```js
if (canvas) {
  app = new GameApp(canvas);
  app.start();
  window.__utopiaLongRun = { … }; // benchmark / debug API
}
```

`window.__utopiaLongRun` exposes `getTelemetry`, `placeToolAt`, `regenerate`, `startRun`, `saveSnapshot`, `loadSnapshot` — used by the long-run benchmark harness and automated tests.

### `src/app/GameApp.js`

The root class. Construction sequence:

1. `createInitialGameState()` — builds the full state tree from `EntityFactory`
2. `createServices(mapSeed)` — creates `pathCache`, `rng`, `llmClient`, etc.
3. Instantiates all UI panels (`HUDController`, `InspectorPanel`, …)
4. `createSystems()` — instantiates all 23 declared systems plus `WildlifePopulationSystem` in order, runs `assertSystemOrder`
5. `new GameLoop(update, render, { maxFps: 60 })` — wires the rAF driver
6. `app.start()` (called from `main.js`) — begins the loop; session stays in `"menu"` phase until the player presses Start

### Simulation bootstrapping

`createInitialGameState()` in `EntityFactory.js`:
1. `createInitialGrid({ templateId, seed, … })` — generates the 96×72 `Uint8Array` tile map using the selected map template generator
2. `seedResourceNodes(grid, nodeRng)` — stamps FOREST/STONE/HERB node flags onto eligible GRASS tiles
3. `buildScenarioBundle(grid)` — attaches scenario-specific objectives, wildlife zones, scenario anchors
4. Spawns initial workers, visitors, herbivores, predators at valid tile positions using a seeded RNG
5. Returns the complete initial state tree (all fields described in the section above)

---

## Worker AI Pipeline

As of v0.10.0 the worker pipeline is a **flat priority FSM** dispatched by `WorkerFSM` (a thin facade over the generic `PriorityFSM` extracted in HW7 R1 wave-2). The legacy three-layer pipeline (`chooseWorkerIntent` → `StatePlanner.planEntityDesiredState` → `StateGraph.transitionEntityState`) was retired in v0.10.0 and the v0.9.x utility-scoring `JobScheduler` was retired with it. See `docs/systems/03-worker-ai.md` for the full per-state inventory.

```
StrategicDirector         (meta — every N seconds, async)
  → sets state.gameplay.primaryGoal, strategy fields

NPCBrainSystem            (per group, per policy interval)
  → requests LLM or offline fallback policy
  → writes state.ai.groupPolicies.get("workers").data
  → fans out into entity.policy + entity.blackboard.aiTargetState

WorkerAISystem.update()   (per worker, per tick)
  → this._workerFSM.tickWorker(worker, state, services, dt)
       ├─ walk STATE_TRANSITIONS[fsm.state] in priority order; first
       │  when() returning true wins; fire onExit / onEnter
       ├─ tick STATE_BEHAVIOR[fsm.state] (the new state if it changed)
       └─ write worker.stateLabel = DISPLAY_LABEL[fsm.state]
  → mutates state.resources, worker.carry, worker.hunger, tileState
```

`VisitorAISystem` (as of HW7 R3 wave-3.5) shares the same `PriorityFSM` dispatcher via `fsm/VisitorFSM.js`. `AnimalAISystem` still routes through the legacy `StatePlanner` / `StateGraph` and is the wave-4 migration target (deferred to HW8).

Fallback mode (no LLM API key or network unavailable): `buildPolicyFallback()` in `PromptBuilder.js` returns a deterministic rule-based policy. `ColonyPlanner.js` provides the fallback build/assignment plans used by `AgentDirectorSystem` when the AI autopilot is disabled.

---

## Tile System

The grid is a flat `Uint8Array` of length `width × height` (96 × 72 = 6 912 cells). Tile type integer IDs:

```js
TILE = {
  GRASS: 0,  ROAD: 1,   FARM: 2,    LUMBER: 3,
  WAREHOUSE: 4,  WALL: 5,  RUINS: 6,  WATER: 7,
  QUARRY: 8,  HERB_GARDEN: 9,  KITCHEN: 10,
  SMITHY: 11, CLINIC: 12, BRIDGE: 13,
}
```

Each tile has an associated `TILE_INFO` entry (`passable`, `baseCost`, `height`, `color`). Parallel arrays on `grid` augment each cell:

- `grid.tileState[idx]` — `{ fertility, moisture, salinity, fallowTicks, yieldPool, … }` (lazy-initialised by `TileStateSystem`)
- `grid.nodeFlags[idx]` — `Uint8Array` bitmask: `NODE_FLAGS.FOREST | STONE | HERB`
- `grid.fogState[idx]` — `Uint8Array`: `FOG_STATE.HIDDEN | EXPLORED | VISIBLE`
- `grid.elevation[idx]`, `grid.moisture[idx]` — `Float32Array` terrain attributes

Tile coordinate convention: index `= ix + iz * width`. World position `= tileToWorld(ix, iz, grid)`. Path adjacency uses **Manhattan distance** (4-directional movement).

---

## Determinism and Testing

- All in-game randomness flows through `SeededRng` (a linear congruential generator with snapshot/restore). The seed is derived from `mapSeed` via `deriveRngSeed`.
- The benchmark harness passes `{ deterministic: true }` to `createServices`, which sets `pathBudget.maxMs = Infinity`, removing wall-clock variance from path decisions.
- Tests use Node.js built-in runner: `node --test test/*.test.js`. No browser, no Vite — systems are instantiated directly and fed minimal mock state objects. `src/main.js` skips the `GameApp` boot block when `document` is undefined.
- 1784 tests across the suite as of HW7 hotfix iter4 baseline (5 pre-existing failures, 3 skips); see `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` for the per-round trajectory.
