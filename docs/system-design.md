# Project Utopia System Design (Current Implementation)

Updated: 2026-05-01 (post-HW7 R3 + hotfix iter5)

## 1. Runtime Architecture

Project Utopia follows a deterministic simulation-first architecture with renderer/UI projection layers.

- `src/entities/*`: initial state creation and entity factories
- `src/app/*`: app orchestration, fixed-step scheduling, loop, services
- `src/simulation/*`: gameplay systems (AI, navigation, movement, economy, npc, meta, lifecycle, population, construction, telemetry)
- `src/world/*`: grid generation, weather, world event rules, scenarios, pathfinding
- `src/render/*`: Three.js scene, picking, overlays, texture/icon/sprite pipelines
- `src/ui/*`: toolbar, HUD, inspector, telemetry panels
- `src/dev/*`: dev-only helpers (e.g. `forceSpawn.js` for the `__utopiaLongRun.devStressSpawn` shim, relocated out of production simulation code in HW7 R1)
- `server/ai-proxy.js`: local AI proxy and fallback contract
- `scripts/env-loader.mjs`: shared Node-side `.env` loader (proxy/dev/preview)

## 2. State Model

Main state shape is defined in `src/app/types.js`.

Key branches:
- `grid`: dimensions, tile array, version, template/seed metadata
- `world`: current template display metadata
- `resources`: global resources (food, wood, stone, herbs, meals, tools, medicine)
- `agents` and `animals`: worker/visitor/animal entities
- `buildings`: aggregate building counts
- `weather` and `events`: dynamic world pressure
- `ai`: request counters, source mode, policy cache, errors, `agentDirector` live status, `coverageTarget` ("llm" | "fallback")
- `metrics`: frame/sim timing, benchmark status, warnings, proxy health/model metadata, death counters, `populationInfraCap`, `devStressSpawnTotal`
- `debug`: A*/Boids/render/system diagnostics, trace streams
- `gameplay`: doctrine, prosperity/threat, objective progress, `strategicGoal`
- `controls`: tool state, sim time controls, map regeneration controls, population targets (`recruitTarget` defaults to 500 since hotfix iter4 batch E — was 16)

## 3. Simulation Scheduling

`GameApp.update` uses fixed-step simulation with render decoupling.

- target fixed step: `fixedStepSec` (default `1/30`)
- supports `isPaused`, `stepFramesPending`, `timeScale`
- all systems consume simulation `dt` from the same step plan

System order (24 systems, ground truth: `SYSTEM_ORDER` in `src/config/constants.js`):
1. `SimulationClock`
2. `VisibilitySystem`
3. `ProgressionSystem` (heavy work gated to a 0.25s sim-time cadence — HW7 R1 A2)
4. `DevIndexSystem`
5. `RaidEscalatorSystem`
6. `EventDirectorSystem`
7. `AgentDirectorSystem` (LLM Colony Planner host; wraps `ColonyDirectorSystem` as `_fallback`. Heavy work gated to a 0.5s sim-time cadence — HW7 R1 A2)
8. `RoleAssignmentSystem`
9. `PopulationGrowthSystem`
10. `EnvironmentDirectorSystem`
11. `WeatherSystem`
12. `WorldEventSystem`
13. `TileStateSystem`
14. `NPCBrainSystem`
15. `WarehouseQueueSystem`
16. `WorkerAISystem`
17. `ConstructionSystem`
18. `VisitorAISystem`
19. `AnimalAISystem`
20. `MortalitySystem`
21. `BoidsSystem`
22. `ResourceSystem`
23. `ProcessingSystem`

## 4. Map Generation Design

Implemented in `src/world/grid/Grid.js` with deterministic output for `(templateId, seed)`.

Map size defaults:
- `96 x 72`

Algorithm layers:
- domain-warped fBm field for elevation/moisture
- internal empty-base sentinel layer with post-pass normalization/counting
- template-tuned water thresholding
- meandering river carving
- bridge corridor carving
- road hubs + biased random-walk road linking
- district blob painting for farm/lumber/ruins
- template wall strategy: `border` / `spokes` / `fortress` / `none`
- infrastructure safeguard pass (minimum roads/farms/lumbers/warehouse)
- road overflow trimming pass to avoid unrealistic over-paving in water-heavy presets
- runtime tuning override merge (`sanitizeTerrainTuning` + `deriveProfile`)

Templates:
- `temperate_plains`
- `rugged_highlands`
- `archipelago_isles`
- `coastal_ocean`
- `fertile_riverlands`
- `fortified_basin`

Validation (`validateGeneratedGrid`) checks:
- dimensions and tile buffer integrity
- minimum road/farm/lumber/warehouse coverage
- water ratio bounds
- passable ratio bounds
- wall/ruin density sanity
- unknown tile detection

## 5. Rendering and Visual Pipeline

`SceneRenderer` default visual preset is `flat_worldsim`.

- top-down orthographic camera (rotation disabled)
- bright sky/fog + daylight setup
- per-tile instanced mesh rendering with texture mapping for all 15 tile types (GRASS through GATE)
- icon layer on top of tiles for semantic readability
- hover/preview/selection overlays
- sprite-first unit rendering with model fallback
- path line rendering for selected entities
- Heat Lens (`src/render/PressureLens.js`) supplies live tooltip + 4-bullet Help section with context-sensitive labels (R3 A7: "supply surplus" flips to "queued (delivery blocked)" when an alive worker has hunger < 0.35)

Asset load sources:
- `public/assets/worldsim/asset-manifest.json`
- tile textures + tile icons + unit sprites

## 6. UI and Developer Observability

Sidebar:
- build tools
- map template + seed + regenerate
- terrain tuning controls (water/river/mountain/island/ocean/road/settlement/wall mode/ocean side + reset)
- doctrine switch
- AI toggle
- population target controls for workers/visitors/herbivores/predators
- always-open Population card with manual recruit button + auto-recruit toggle (hotfix iter4 batch E — surfaced from the buried Settings > Dev Tools sub-panel)
- stress and benchmark controls
- pause/resume/step controls

Inspector and telemetry:
- selected tile internals
- selected entity internals + path nodes
- right-top `Entity Focus` panel includes full AI exchange blocks with copyable request/response payloads
- bottom `#devDock` (Developer Telemetry, six cards) is force-hidden via `display: none !important` in `index.html` (hotfix iter4 batch F — production-deploy parity, even when `?dev=1` toggles `body.dev-mode`). Render code paths and persistence keys (`utopiaDevDockPanels:v1`) are preserved for one-line revert.
- remaining dev surfaces: right-edge Debug sidebar tab (population controls, Stress Test with the Entity Inject sub-panel from hotfix iter2 batchC #5, dev tools, AI exchange + decision traces), `dev-only` Settings sub-panels, AI Decision / AI Exchange / AI Policy floating panels, "Why no WHISPER?" status badge

## 7. AI Pipeline and Health Bootstrap

Core runtime chain:
- `EnvironmentDirectorSystem`: periodic environment directives
- `StrategicDirector`: 90s heartbeat goal-chain selection, publishes `state.gameplay.strategicGoal`
- `NPCBrainSystem`: periodic group policy updates
- `AgentDirectorSystem` + `ColonyPlanner`: LLM-driven build planning; algorithmic `ColonyDirectorSystem` is wrapped as the `_fallback` slot
- `LLMClient`: transport + schema enforcement + fallback contract
- `server/ai-proxy.js`: local endpoint for environment/policy/plan requests

Proxy endpoints:
- `POST /api/ai/environment`
- `POST /api/ai/policy`
- `POST /api/ai/plan`
- `GET /health`

Policy groups (runtime):
- `workers`
- `traders`
- `saboteurs`
- `herbivores`
- `predators`

`/health` returns:
- `hasApiKey`, `model`, `port`
- `envLoaded`, `modelSource`, `apiKeySource`

Startup sequence:
1. Node scripts (`dev:full`, `preview:full`, `ai-proxy`) load `.env` via `env-loader`.
2. Frontend boot probes `/health` asynchronously.
3. If `hasApiKey=true`, AI is auto-enabled once.
4. If key is missing or proxy unreachable, runtime remains in deterministic fallback mode.

Resilience:
- strict schema validation
- guardrails clamping
- deterministic fallback when API is unavailable/invalid
- model mismatch tolerance in proxy: one-shot retry with default `gpt-4.1-mini`
- proxy retry on 429/timeout via `OPENAI_REQUEST_ATTEMPT_TIMEOUT_MS` / `OPENAI_MAX_RETRIES` / `OPENAI_RETRY_BASE_DELAY_MS` env vars (debug payload exposes `attemptsUsed`)
- policy backward compatibility: legacy `visitors` policy is split to `traders + saboteurs`

AI exchange observability:
- proxy returns a `debug` envelope for both success and fallback:
  - `requestedAtIso`, `endpoint`, `requestSummary`, `rawModelContent`, `parsedBeforeValidation`, `guardedOutput`, `error`
- game state stores latest per-group exchanges and ring buffers for demo/debug views
- Live AgentDirector status (mode, active plan goal/source, plan stats, plan history) is published to `state.ai.agentDirector` for the AI Exchange and AI Automation panels.

State target steering:
- policy payload supports optional `stateTargets[]`
- each target: `groupId`, `targetState`, `priority`, `ttlSec`, `reason`
- runtime chain: `ResponseSchema` -> `Guardrails` -> `NPCBrainSystem` cache (`groupStateTargets`)
- per-group steering merges with the consumer's local desire (soft override, TTL-expiring)
- invalid state targets are dropped safely
- runtime applies an extra feasibility gate before using policy/AI states for the legacy planner consumers (animals): `StateFeasibility -> StatePlanner -> transitionEntityState -> state handlers`. Workers and visitors no longer route through this chain (see §8).

## 8. NPC Behaviour Architecture

The NPC layer underwent a major rewrite in v0.10.0–v0.10.1. Workers and visitors now run on a generic priority-FSM dispatcher; only animals retain the legacy planner.

Generic dispatcher (`src/simulation/npc/PriorityFSM.js`, ~132 LOC, extracted in HW7 R1 wave-2):
- single source of truth for behaviour: `entity.fsm = { state, enteredAtSec, target, payload }`
- per-tick contract: walk `transitions[currentState]` in priority order, first `when()` returning true fires `onExit(old)` → `onEnter(new)` → ticks the (possibly new) state body, then writes `entity.stateLabel = displayLabel[fsm.state]` (single-write semantics).
- behaviour table, transitions table, display-label map, and default state are all injected via the constructor so the same dispatcher can drive Worker, Visitor, and Animal AI.

Worker FSM (HW7 R1 wave-2 facade):
- `src/simulation/npc/fsm/WorkerFSM.js` — 61-LOC facade that wires the worker-specific `STATE_BEHAVIOR`, `STATE_TRANSITIONS`, and `DISPLAY_LABEL` maps into the generic dispatcher.
- 14 named states, ~30 LOC dispatcher, priority-ordered transition table.
- v0.9.x `chooseWorkerIntent` + `JobScheduler` + `JobRegistry` + 13 Job classes + `JobHelpers` + sticky-bonus hysteresis (~3500 LOC) are deleted; the FSM's discrete priority transitions subsume the entire utility-scoring layer. Survival preempt is `priority: 1` in `HARVESTING`'s transition list, naturally beating `DELIVERING`'s `priority: 5` — no separate `isSurvivalCritical` bypass.
- Plan: `docs/superpowers/plans/2026-04-30-worker-fsm-rewrite-plan.md`. Retrospective: `docs/superpowers/plans/2026-04-30-fsm-rewrite-retrospective.md`.

Visitor FSM (HW7 R3 wave-3.5 — shipped):
- `src/simulation/npc/fsm/VisitorFSM.js` — 62-LOC facade following the same pattern as WorkerFSM.
- 9 states (IDLE / WANDERING / TRADE / SCOUT / SABOTAGE / EVADE / SEEK_TRADE / SEEK_FOOD / EAT) defined in `VisitorStates.js` + 8 `STATE_TRANSITIONS` entries in `VisitorTransitions.js`.
- The HW7 R2 staging flag `FEATURE_FLAGS.USE_VISITOR_FSM` is retired; `VisitorAISystem` unconditionally lazy-instantiates a `VisitorFSM` and calls `tickVisitor`. The legacy `StatePlanner`/`StateGraph` dispatch in `VisitorAISystem.update()` is deleted.

Animal AI (intentional carry-over):
- `src/simulation/npc/AnimalAISystem.js` still imports `transitionEntityState` from `state/StateGraph.js` and `planEntityDesiredState` from `state/StatePlanner.js`. The dispatcher migration (wave-4) is deferred; the legacy planner remains the source of truth for animals.

State graph + feasibility (legacy, animals only):
- `src/simulation/npc/state/StateGraph.js` defines legal nodes/edges.
- `src/simulation/npc/state/StatePlanner.js` computes `desiredState + reason`.
- `src/simulation/npc/state/StateFeasibility.js` enforces runtime preconditions.

Feature flags (`src/config/constants.js`):
- `FEATURE_FLAGS.USE_FSM` defaults to `true`. Flag is queryable so trace-parity tests can self-compare, but no production code path depends on `false` (the v0.9.x JobScheduler `false` previously routed to has been deleted).

Consistency metrics (still emitted, exposed in Dev Dock `Logic Consistency` panel):
- `invalidTransitionCount`
- `goalFlipCount`
- `avgGoalFlipPerEntity`
- `pathRecalcPerEntityPerMin`
- `deliverWithoutCarryCount`
- `feasibilityRejectCountByGroup`
- `starvationRiskCount`
- `idleWithoutReasonSec` by group
- `deathByReasonAndReachability`

## 8.1 Feasibility Gate and Mortality Coupling

Feasibility gate (`src/simulation/npc/state/StateFeasibility.js`) — applies to animals (workers/visitors no longer route through it):
- predators `hunt/feed` requires live herbivores
- herbivores `flee` requires threat within enter radius

Mortality uses mixed nutrition reachability:
- carry food
- reachable warehouse food
- nearby farm supply (path length bounded)
- HW7 R1 A5 reconnected per-entity `entity.hunger` decay (was a dead chain since v0.10.1-l). `BALANCE.workerFoodConsumptionPerSecond = 0.038` is the fixed global drain; `INITIAL_RESOURCES.food = 320` (HW7 R0 A5: 200 → 320 to extend opening runway from ~3:11 to ~6:30); carry-grace tunable via `BALANCE.workerCarryFoodGraceSec` (HW7 R0 A5: 0.5s → 1.5s).

Death context records nutrition reachability/source and last feasibility rejection for postmortem debugging.

## 9. Performance Notes

Current optimizations include:
- grid tile query caching by `grid.version`
- reduced expensive per-frame query frequency in AI/NPC flows
- AgentDirector heavy work gated to a 0.5s sim-time cadence (HW7 R1 A2); ProgressionSystem heavy paths gated to 0.25s
- optimized boids spatial hash and neighbor handling (hotfix iter1 batch A: path-dampening for late-game crowd stability)
- per-frame allocation shaves in `SceneRenderer` (HW7 R1 A2)
- render quality adaptation under high entity load
- throttled UI panel refresh cadence

## 10. Test and Build Status

Current baseline checks:
- `node --test test/*.test.js` — 1784 pass / 5 fail / 3 skip (5 fails are pre-existing, documented in CHANGELOG hotfix iter4 batch E).
- `npm run build` passes
