# Project Utopia System Design (Current Implementation)

Updated: 2026-03-02

## 1. Runtime Architecture

Project Utopia is a deterministic simulation-first architecture with a renderer and UI projection layer.

- `src/entities/*`: initial state creation and entity factories
- `src/app/*`: app orchestration, fixed-step scheduling, loop, services
- `src/simulation/*`: gameplay systems (AI, navigation, movement, economy, meta)
- `src/world/*`: grid generation, weather, world event rules
- `src/render/*`: Three.js scene, picking, overlays, texture/icon/sprite pipelines
- `src/ui/*`: toolbar, HUD, inspector, telemetry panels
- `server/ai-proxy.js`: local AI proxy and fallback contract

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
- `metrics`: frame/sim timing, benchmark status, warnings
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
11. `BoidsSystem`
12. `ResourceSystem`

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
- bottom telemetry dock for global stats, A*/Boids, AI trace, system timings, event logs

## 7. AI Pipeline

- `EnvironmentDirectorSystem`: environment directives
- `NPCBrainSystem`: group policy updates
- `LLMClient`: transport + schema enforcement + fallback contract
- `server/ai-proxy.js`: local endpoint for environment/policy requests

Resilience:
- strict schema validation
- guardrails clamping
- deterministic fallback when API is unavailable/invalid

## 8. Performance Notes

Current optimizations include:
- grid tile query caching by `grid.version`
- reduced expensive per-frame query frequency in AI/NPC flows
- optimized boids spatial hash and neighbor handling
- render quality adaptation under high entity load
- throttled UI panel refresh cadence

## 9. Test and Build Status

Current baseline checks:
- `node --test` passes
- `npm run build` passes

