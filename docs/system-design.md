# Project Utopia System Design (Current Implementation)

Updated: 2026-03-03

## 1. Runtime Architecture

Project Utopia follows a deterministic simulation-first architecture with renderer/UI projection layers.

- `src/entities/*`: initial state creation and entity factories
- `src/app/*`: app orchestration, fixed-step scheduling, loop, services
- `src/simulation/*`: gameplay systems (AI, navigation, movement, economy, meta)
- `src/world/*`: grid generation, weather, world event rules
- `src/render/*`: Three.js scene, picking, overlays, texture/icon/sprite pipelines
- `src/ui/*`: toolbar, HUD, inspector, telemetry panels
- `server/ai-proxy.js`: local AI proxy and fallback contract
- `scripts/env-loader.mjs`: shared Node-side `.env` loader (proxy/dev/preview)

## 2. State Model

Main state shape is defined in `src/app/types.js`.

Key branches:
- `grid`: dimensions, tile array, version, template/seed metadata
- `world`: current template display metadata
- `resources`: global resources (food/wood)
- `agents` and `animals`: worker/visitor/animal entities
- `buildings`: aggregate building counts
- `weather` and `events`: dynamic world pressure
- `ai`: request counters, source mode, policy cache, errors
- `metrics`: frame/sim timing, benchmark status, warnings, proxy health/model metadata, death counters
- `debug`: A*/Boids/render/system diagnostics, trace streams
- `gameplay`: doctrine, prosperity/threat, objective progress
- `controls`: tool state, sim time controls, map regeneration controls, population targets

## 3. Simulation Scheduling

`GameApp.update` uses fixed-step simulation with render decoupling.

- target fixed step: `fixedStepSec` (default `1/30`)
- supports `isPaused`, `stepFramesPending`, `timeScale`
- all systems consume simulation `dt` from the same step plan

System order:
1. `SimulationClock`
2. `ProgressionSystem`
3. `RoleAssignmentSystem`
4. `EnvironmentDirectorSystem`
5. `WeatherSystem`
6. `WorldEventSystem`
7. `NPCBrainSystem`
8. `WorkerAISystem`
9. `VisitorAISystem`
10. `AnimalAISystem`
11. `MortalitySystem`
12. `BoidsSystem`
13. `ResourceSystem`

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
- per-tile instanced mesh rendering with texture mapping for all tile types
- icon layer on top of tiles for semantic readability
- hover/preview/selection overlays
- sprite-first unit rendering with model fallback
- path line rendering for selected entities

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
- stress and benchmark controls
- pause/resume/step controls

Inspector and telemetry:
- selected tile internals
- selected entity internals + path nodes
- bottom developer dock for global stats, A*/Boids, AI trace, system timings, event logs
- each dock card is independently scrollable and collapsible (`details` + local state persistence)
- dock state persistence key: `utopiaDevDockPanels:v1`
- right-top `Entity Focus` panel includes full AI exchange blocks with copyable request/response payloads

## 7. AI Pipeline and Health Bootstrap

Core runtime chain:
- `EnvironmentDirectorSystem`: periodic environment directives
- `NPCBrainSystem`: periodic group policy updates
- `LLMClient`: transport + schema enforcement + fallback contract
- `server/ai-proxy.js`: local endpoint for environment/policy requests

Proxy endpoints:
- `POST /api/ai/environment`
- `POST /api/ai/policy`
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
- policy backward compatibility: legacy `visitors` policy is split to `traders + saboteurs`

AI exchange observability:
- proxy returns a `debug` envelope for both success and fallback:
  - `requestedAtIso`, `endpoint`, `requestSummary`, `rawModelContent`, `parsedBeforeValidation`, `guardedOutput`, `error`
- game state stores latest per-group exchanges and ring buffers for demo/debug views

State target steering (new):
- policy payload supports optional `stateTargets[]`
- each target: `groupId`, `targetState`, `priority`, `ttlSec`, `reason`
- runtime chain: `ResponseSchema` -> `Guardrails` -> `NPCBrainSystem` cache (`groupStateTargets`)
- entity planning merges local desire with AI target (soft override, TTL-expiring)
- invalid state targets are dropped safely
- runtime now applies an extra feasibility gate before using policy/AI states:
  - `StateFeasibility -> StatePlanner -> transitionEntityState -> state handlers`
  - infeasible targets are rejected with per-group counters and reject reasons

## 8. NPC State-Machine Consistency

State truth source:
- `src/simulation/npc/state/StateGraph.js` defines legal nodes/edges for all 5 groups
- `transitionEntityState` is the only place that mutates FSM state

Planner layer:
- `src/simulation/npc/state/StatePlanner.js` computes `desiredState + reason`
- AI systems no longer free-mutate state labels in behavior handlers
- handlers execute effects only (navigation/work/eat/hunt), then UI labels are projected from FSM state

Consistency metrics:
- `invalidTransitionCount`
- `goalFlipCount`
- `avgGoalFlipPerEntity`
- `pathRecalcPerEntityPerMin`
- `deliverWithoutCarryCount`
- `feasibilityRejectCountByGroup`
- `starvationRiskCount`
- `idleWithoutReasonSec` by group
- `deathByReasonAndReachability`
- exposed in Dev Dock `Logic Consistency` panel

## 8.1 Feasibility Gate and Mortality Coupling

Feasibility gate (`src/simulation/npc/state/StateFeasibility.js`) enforces runtime preconditions before any desired state can be applied:
- workers `deliver` requires `carry>0` and warehouse
- workers `seek_task/harvest` requires role-compatible worksite
- traders `seek_trade/trade` requires warehouse
- saboteurs `sabotage` requires destroyable targets
- predators `hunt/feed` requires live herbivores
- herbivores `flee` requires threat within enter radius

Mortality uses mixed nutrition reachability:
- carry food
- reachable warehouse food
- nearby farm supply (path length bounded)

Death context now records nutrition reachability/source and last feasibility rejection for postmortem debugging.

## 9. Performance Notes

Current optimizations include:
- grid tile query caching by `grid.version`
- reduced expensive per-frame query frequency in AI/NPC flows
- optimized boids spatial hash and neighbor handling
- render quality adaptation under high entity load
- throttled UI panel refresh cadence

## 10. Test and Build Status

Current baseline checks:
- `node --test` passes
- `npm run build` passes
