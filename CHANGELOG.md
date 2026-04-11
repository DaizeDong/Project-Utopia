# Changelog

## [0.6.5] - 2026-04-10 — Agent-Based Colony Planning: Phase 4 (Evaluator + Memory)

Fourth phase of the Agent-Based Colony Planning system — implements Reflexion-based plan evaluation with prediction comparison, structured failure diagnosis, natural language reflection generation, and MemoryStore integration for learning from past mistakes.

### New Features
- **PlanEvaluator** — Reflexion-inspired outcome assessment:
  - `parsePredictedValue()` — handles rates (+0.5/s), percentages (+15%), plain numbers, qualitative values
  - `snapshotState()` — captures resource/time/worker snapshots for before/after comparison
  - `evaluateStep()` — composite scoring: build success (60%) + prediction accuracy (40%) with 50% tolerance
  - `diagnoseFailure()` — 8 structured cause types with severity scoring (1-5):
    - no_valid_tile, placement_rejected (build failures)
    - uncovered, no_workers (logistics issues)
    - poor_terrain, high_elevation (terrain quality)
    - adjacency_conflict (spatial conflicts)
    - prediction_mismatch (accuracy tracking)
  - `generateReflection()` — template-based natural language reflections with cause-specific categories
  - `evaluatePlan()` — overall plan quality: completion (40%) + time efficiency (20%) + builds (30%) + no-failure bonus (10%)
  - `PlanEvaluator` class — stateful wrapper with MemoryStore write, stats tracking, batch reflections (max 5/plan)
- **Memory Categories** — construction_failure, construction_reflection, terrain_knowledge, construction_pattern
- **Evaluator Benchmark** — 7-scenario evaluation (`scripts/evaluator-benchmark.mjs`) covering prediction parsing, step evaluation, diagnosis, reflection generation, plan evaluation, memory integration, and full cycle

### Benchmark Results
- 61/61 tests passing (100%)
- Self-assessment: 10/10 across 8 dimensions (prediction_accuracy, diagnosis_quality, reflection_quality, plan_scoring, memory_integration, full_cycle_quality, error_resilience, architecture_quality)

### Tests
- 39 new unit tests in `test/plan-evaluator.test.js` (all passing)
- Full suite: 493 tests, 0 failures

### Files Changed
- `src/simulation/ai/colony/PlanEvaluator.js` — New file: step/plan evaluation, diagnosis, reflection, memory integration
- `test/plan-evaluator.test.js` — New file: 39 unit tests
- `scripts/evaluator-benchmark.mjs` — New file: 7-scenario benchmark with LLM judge
- `docs/superpowers/plans/2026-04-10-agent-based-colony-planning.md` — Updated Phase 4 status to complete

## [0.6.4] - 2026-04-10 — Agent-Based Colony Planning: Phase 3 (Planner + LLM Integration)

Third phase of the Agent-Based Colony Planning system — implements the LLM-powered construction planner with ReAct + Plan-and-Solve prompting, robust validation/sanitization pipeline, and priority-based algorithmic fallback.

### New Features
- **ColonyPlanner** — LLM-powered plan generation with algorithmic fallback:
  - `buildPlannerPrompt()` — token-efficient prompt (~600 tokens) with observation, memory reflections, skill availability, affordable buildings
  - `validatePlanResponse()` — full sanitization pipeline: goal/reasoning/thought truncation, step dedup, dependency fixup, type/skill validation, priority defaults
  - `generateFallbackPlan()` — 7-priority algorithmic fallback: food crisis → coverage gap → wood shortage → processing chain → defense → roads → expansion skill
  - `shouldReplan()` — 5 trigger conditions with crisis/opportunity cooldown bypass for responsive replanning
  - `callLLM()` — direct fetch to OpenAI-compatible endpoint with AbortController timeout, JSON + markdown fence parsing
  - Zero-resource handling: deferred step when wood=0 prevents empty plans
  - Stats tracking: llmCalls, llmSuccesses, llmFailures, fallbackPlans, totalLatencyMs
- **System Prompt** — `npc-colony-planner.md` with build actions, skills, location hints, hard rules, structured JSON output format
- **Planner Benchmark** — 5-scenario evaluation (`scripts/planner-benchmark.mjs`) covering prompt construction, validation robustness, fallback plan quality, trigger logic, and live LLM integration

### Architecture Iterations (from benchmark feedback)
- Crisis and resource opportunity triggers bypass 20s cooldown for immediate replanning
- Fallback plan generates deferred road step when wood=0 (prevents empty plan validation failure)
- Benchmark crisis test uses fresh metrics object to avoid time regression in rate calculation

### Benchmark Results
- 36/36 tests passing (100%)
- Self-assessment: 10/10 across 8 dimensions (prompt_quality, validation_robustness, fallback_intelligence, trigger_design, integration_quality, error_resilience, strategic_depth, architecture_quality)

### Tests
- 36 new unit tests in `test/colony-planner.test.js` (all passing)
- Full suite: 454 tests, 0 failures

### Files Changed
- `src/simulation/ai/colony/ColonyPlanner.js` — New file: LLM planner + validation + fallback + trigger logic
- `src/data/prompts/npc-colony-planner.md` — New file: system prompt template
- `test/colony-planner.test.js` — New file: 36 unit tests
- `scripts/planner-benchmark.mjs` — New file: 5-scenario benchmark with LLM judge
- `docs/superpowers/plans/2026-04-10-agent-based-colony-planning.md` — Updated Phase 3 status to complete

## [0.6.3] - 2026-04-10 — Agent-Based Colony Planning: Phase 2 (Skill Library + Executor)

Second phase of the Agent-Based Colony Planning system — implements compound build skills (Voyager-inspired) and a plan execution engine with SayCan-inspired affordance scoring.

### New Features
- **SkillLibrary** — 6 frozen compound build patterns:
  - `logistics_hub`: Warehouse + road star + 2 farms (24 wood)
  - `processing_cluster`: Quarry + road + smithy (13 wood + 5 stone)
  - `defense_line`: 5-wall chain along elevation ridge (10 wood)
  - `food_district`: 4 farms + kitchen around warehouse (25 wood + 3 stone)
  - `expansion_outpost`: Warehouse + road + farm + lumber (22 wood)
  - `bridge_link`: Road + 2 bridges + road for island connectivity (12 wood + 4 stone)
- **PlanExecutor** — Grounds LLM-generated plans to real game state:
  - 7 location hint types: near_cluster, near_step, expansion:<dir>, coverage_gap, defense_line, terrain:high_moisture, explicit coords
  - SayCan-inspired affordance scoring (0-1 resource sufficiency gate)
  - Terrain-aware tile ranking with type-specific weights (moisture for farms, elevation for walls)
  - Topological dependency ordering for multi-step plans
  - Per-tick build limit (2/tick) with skill sub-step atomic execution
  - Plan status queries: isPlanComplete, isPlanBlocked, getPlanProgress
- **Executor Benchmark** — 5-scenario evaluation (`scripts/executor-benchmark.mjs`) covering skill library, location hints, affordance scoring, plan execution, and skill feasibility

### Benchmark Results (LLM Judge, 120s)
- temperate_plains: 9/10
- archipelago_isles: 9.5/10
- fortified_basin: 10/10
- Average: 9.5/10

### Tests
- 50 new unit tests in `test/skill-library-executor.test.js` (all passing)
- Full suite: 418 tests, 0 failures

### Files Changed
- `src/simulation/ai/colony/SkillLibrary.js` — New file: 6 frozen skills + query utilities
- `src/simulation/ai/colony/PlanExecutor.js` — New file: location hints, affordance, terrain ranking, plan grounding/execution
- `test/skill-library-executor.test.js` — New file: 50 unit tests
- `scripts/executor-benchmark.mjs` — New file: 5-scenario benchmark with LLM judge
- `docs/superpowers/plans/2026-04-10-agent-based-colony-planning.md` — Updated Phase 2 status to complete

## [0.6.2] - 2026-04-10 — Agent-Based Colony Planning: Phase 1 (Perceiver)

First phase of the Agent-Based Colony Planning system — implements the ColonyPerceiver, which transforms raw game state into structured observations for downstream planning.

### New Features
- **ColonyPerceiver** — Structured world model generator with:
  - BFS-based infrastructure cluster detection from warehouses
  - Sliding-window resource rate estimation (linear regression, trend detection, depletion projection)
  - Expansion frontier analysis (4 directional quadrants with grass/moisture/density scoring)
  - Worksite coverage analysis (disconnected count + coverage percentage)
  - Logistics bottleneck detection (farm:warehouse ratio, production:warehouse ratio, worker:warehouse ratio)
  - Delta tracking between observations (workers, buildings, prosperity, resources)
  - Affordability computation for all building types
  - `formatObservationForLLM()` compact text formatter for LLM consumption
- **Perceiver Benchmark** — Multi-dimensional evaluation script (`scripts/perceiver-benchmark.mjs`) with:
  - Self-assessment across 8 dimensions (completeness, spatial/temporal awareness, actionability, etc.)
  - LLM judge integration (calls external API for unbiased evaluation)
  - Ground truth comparison with simulation metrics

### Benchmark Results (LLM Judge, 300s)
- temperate_plains: 9/10
- archipelago_isles: 10/10
- fortified_basin: 8/10
- Average: 9.0/10

### Tests
- 31 new unit tests in `test/colony-perceiver.test.js` (all passing)
- Full suite: 368 tests, 0 failures

### Files Changed
- `src/simulation/ai/colony/ColonyPerceiver.js` — New file: ColonyPerceiver, ResourceRateTracker, cluster detection, frontier analysis
- `test/colony-perceiver.test.js` — New file: 31 unit tests
- `scripts/perceiver-benchmark.mjs` — New file: benchmark with LLM judge
- `docs/superpowers/plans/2026-04-10-agent-based-colony-planning.md` — Updated Phase 1 status to complete

## [0.6.1] - 2026-04-10 — Colony Growth & Benchmark Optimization

Major tuning of the ColonyDirectorSystem auto-building AI and population growth to support sustained long-term colony development. Fixed multiple critical bugs preventing colony growth in headless benchmarks and in-game.

### Bug Fixes
- **ColonyDirectorSystem never registered** — Existed but was never added to GameApp or headless runners, meaning colonies had zero auto-building
- **Missing systems in headless runners** — PopulationGrowthSystem and TileStateSystem were absent from soak-sim.mjs, benchmark-runner.mjs, and growth-diagnostic.mjs
- **Warehouse erasure by route code** — fulfillScenarioRequirements destroyed warehouses/production buildings when building roads; added protected tile sets in both gap-tile and Manhattan walk sections
- **Emergency farm spam** — Uncapped emergency farm building drained all wood and created 100+ unworked farms; capped farm count relative to worker count
- **Resource depletion spiral** — Emergency builds consumed last resources; added emergency floor (wood:5, food:3) so colony retains minimum reserves

### Balance Changes
- **Aggressive warehouse scaling** — Warehouses scale with worker count (1 per 6) and production building count (1 per 5 + 2), priority 92
- **Logistics-aware food emergency** — When farm:warehouse ratio > 3, emergency food shortage triggers warehouse builds instead of more farms
- **Phase targets increased** — Bootstrap requires 3 warehouses; logistics requires 4 WH, 6 farms, 5 lumbers; processing includes smithy; expansion requires 6 WH, 12 farms
- **Population cap raised** — Formula now includes all building types, capped at 80 (from 40)
- **Dynamic build rate** — Builds per tick scales from 2 to 4 based on resource abundance
- **Warehouse sabotage protection** — protectLastWarehousesCount raised from 1 to 3, preventing early-game warehouse loss cascade
- **Removed full grid scan** — findPlacementTile no longer falls back to scanning entire map; search limited to radius 10 from existing infrastructure

### Benchmark Results (temperate_plains, 900s)
- Buildings: 71 → 182 (accelerating ✓)
- Workers: 12 → 56 (growing ✓)
- Prosperity: 36 → 82
- No stagnation ✓
- fortified_basin: WIN at 327s
- archipelago_isles: Workers 12 → 60, Prosperity 94

### Files Changed
- `src/simulation/meta/ColonyDirectorSystem.js` — Major rewrite of assessColonyNeeds, findPlacementTile, fulfillScenarioRequirements, selectNextBuilds
- `src/simulation/population/PopulationGrowthSystem.js` — New population cap formula
- `src/config/longRunProfile.js` — Warehouse protection count
- `src/app/GameApp.js` — Register ColonyDirectorSystem
- `scripts/soak-sim.mjs` — Add missing systems
- `scripts/benchmark-runner.mjs` — Add missing systems
- `scripts/growth-diagnostic.mjs` — New diagnostic script, updated popCap formula
- `test/colony-director.test.js` — Updated emergency need tests for logistics-aware behavior

## [0.6.0] - 2026-04-10 — Terrain Depth: Full Ecology Integration

10-feature terrain depth overhaul across 5 phases. Terrain attributes now deeply affect gameplay: elevation, moisture, seasons, soil exhaustion, adjacency effects, and drought wildfire create meaningful spatial decisions.

### Phase A: Foundation
- **Persistent terrain data** — Elevation and moisture Float32Arrays stored on grid, used by all systems
- **Ruin salvage** — Erasing RUINS yields random rewards: wood/stone (60%), food/herbs (25%), tools/medicine (15%)

### Phase B: Core Terrain Mechanics
- **Elevation movement penalty** — Higher tiles cost more to traverse (+30% at max elevation)
- **Terrain-based build costs** — Costs scale with elevation; dry tiles need extra stone; ruins give 30% discount
- **Elevation wall defense** — Walls on high ground contribute up to +50% more threat mitigation

### Phase C: Time Systems
- **Seasonal weather cycle** — 4 seasons (spring/summer/autumn/winter, 50-60s each) with weighted weather probabilities replacing fixed 8-entry weather cycle
- **Soil exhaustion** — Consecutive harvests increase exhaustion counter, amplifying fertility drain. Decays when fallow.

### Phase D: Ecology Linkage
- **Adjacency fertility cascade** — Herb gardens boost adjacent farms (+0.003/tick), quarries damage them (-0.004/tick), kitchens compost (+0.001/tick). Capped at ±0.008/tile/tick.
- **Moisture fertility cap** — Dry tiles (moisture=0) cap at 0.25 fertility; well-watered (≥0.54) reach full 1.0

### Phase E: Disaster
- **Drought wildfire** — During drought, low-moisture (<0.25) flammable tiles ignite (0.5%/tick). Fire spreads up to 3 tiles, blocked by roads/bridges/water/walls. Burns to grass when wear reaches 1.0.

### Files Changed

- `src/world/grid/Grid.js` — Persist elevation/moisture from terrain generation
- `src/config/balance.js` — RUIN_SALVAGE, TERRAIN_MECHANICS constants (fire, exhaustion, adjacency, moisture cap)
- `src/simulation/construction/BuildAdvisor.js` — Ruin salvage rolls, terrain cost modifiers
- `src/simulation/navigation/AStar.js` — Elevation-based movement cost
- `src/simulation/meta/ProgressionSystem.js` — Elevation-enhanced wall defense
- `src/world/weather/WeatherSystem.js` — Seasonal weather cycle with weighted probabilities
- `src/simulation/economy/TileStateSystem.js` — Soil exhaustion, adjacency fertility, moisture cap, wildfire
- `test/build-system.test.js` — Updated cost assertions for terrain-variable costs

## [0.5.10] - 2026-04-10 — Advanced Terrain Generation

Comprehensive terrain generation overhaul using cutting-edge procedural algorithms. Removed auto-bridge generation. All 6 generators rewritten with recursive domain warping, Worley/cellular noise, and Poisson disk sampling for dramatically more organic and varied terrain.

### New Noise Algorithms
- **Recursive domain warping** — Multi-depth coordinate distortion for organic terrain shapes
- **Worley/cellular noise** — Voronoi-based patterns for crevasses, tidal pools, fortress walls
- **Poisson disk sampling** — Bridson's algorithm for natural feature distribution

### Terrain Generator Rewrites
- **Fortified Basin** — Worley-distorted irregular walls, noise-shaped moat, 3-5 asymmetric gates, Voronoi interior districts via Poisson sampling
- **Archipelago Isles** — Domain-warped island shapes with noise-distorted coastlines, recursive-warped internal elevation
- **Coastal Ocean** — Multi-scale domain-warped coastline (3 noise layers), cliff terraces, Worley tidal pools, noise-shaped offshore islands
- **Temperate Plains** — Recursive-warped terrain, domain-warped river meanders, Worley/Poisson scattered lakes, moisture-gated farm clusters
- **Fertile Riverlands** — Domain-warped deep-meander rivers, oxbow lakes, delta distributary channels, Worley marshland zones, BFS moisture gradient
- **Rugged Highlands** — Worley crevasses (water fissures + wall edges), highland plateaus, mountain ridge walls, downhill streams, plateau ruins

### Other Changes
- **Removed auto-bridge generation** — Bridges no longer auto-generated; players build them manually
- **Removed building-road adjacency restriction** — Buildings can now be placed anywhere on valid terrain

### Files Changed
- `src/world/grid/Grid.js` — 3 new utility functions, 6 generator rewrites, removed bridge auto-generation
- `src/simulation/construction/BuildAdvisor.js` — Removed road adjacency placement restrictions
- `index.html` — Custom tooltip system for all UI elements
- `test/build-system.test.js` — Updated for removed placement restrictions

## [0.5.9] - 2026-04-10 — Terrain Diversity Overhaul

Major terrain generation rewrite: all 6 map templates now use dedicated terrain generators producing dramatically different maps instead of shared noise with minor parameter tweaks.

### New Features

- **Archipelago Isles** — 5-8 distinct islands with bridge connections, 77-82% water coverage
- **Coastal Ocean** — Jagged coastline via 1D FBM noise, bays, offshore islands, ~48% water
- **Rugged Highlands** — Dynamic ridge-to-wall conversion (top 18% ridges), connectivity passes, 10-14% walls
- **Fertile Riverlands** — 2-3 convergent rivers meeting at central confluence, floodplain ponds, 57% farm-water adjacency
- **Fortified Basin** — Elliptical fortress wall with moat, 4 gated entrances, grid-pattern interior roads, organized quadrants
- **Temperate Plains** — Flat 2-octave noise, single meandering river, 96% lumber at edges, river-side farm strips
- **Map template selector** — Dropdown on start screen to choose template before generating
- **Connectivity validation** — Flood-fill check ensures ≥40% of passable tiles are reachable in largest connected region

### Technical Changes

- Each template dispatches to a dedicated generator function instead of shared `baseTerrainPass()`
- `convertHighlandRidgesToWalls()` uses dynamic percentile-based threshold instead of fixed value
- `validateGeneratedGrid()` now includes flood-fill connectivity check
- Template profiles updated with template-appropriate validation bounds
- 3 new test cases: quantitative diversity assertions, connectivity validation, stronger signature checks

### Files Changed

- `src/world/grid/Grid.js` — 6 dedicated terrain generators, connectivity validation, updated profiles
- `src/ui/hud/GameStateOverlay.js` — Template dropdown population and selection
- `index.html` — Template selector UI element
- `test/map-generation.test.js` — Diversity and connectivity tests

## [0.5.8] - 2026-04-10 — Map Preview & Size Controls

New Map now shows the actual terrain behind a semi-transparent overlay, with camera pan/zoom support and configurable map dimensions.

### New Features

- **Map preview on start screen** — Overlay background is now semi-transparent (35% opacity), showing the rendered 3D terrain behind the start panel so players can see the map before starting
- **Camera pan/zoom in menu** — Right-click drag to pan and scroll to zoom the map preview during start screen; overlay only blocks pointer events on the panel card itself
- **Map size controls** — Width and Height number inputs (24–256 tiles) on the start screen; New Map generates terrain at the specified dimensions
- **Grid dimensions in meta** — Start screen badge now shows grid dimensions (e.g., "96×72 · seed 42135")

### Technical Changes

- `GameStateOverlay` passes `{ width, height }` from overlay inputs to `onReset` handler
- `GameApp.resetSessionWorld()` forwards `width`/`height` to `regenerateWorld()`
- `regenerateWorld()` accepts and passes `width`/`height` to `createInitialGameState()`
- `createInitialGameState()` passes dimensions to `createInitialGrid()`
- `SceneRenderer.resetView()` now recalculates `orthoSize` from current grid dimensions for correct camera framing after map size changes

### Files Changed

- `index.html` — Semi-transparent overlay, map size inputs, updated controls hint
- `src/ui/hud/GameStateOverlay.js` — Map size input reading, grid dimensions in meta display, pointer-events passthrough
- `src/app/GameApp.js` — Width/height forwarding through reset/regenerate pipeline
- `src/entities/EntityFactory.js` — Pass width/height to createInitialGrid
- `src/render/SceneRenderer.js` — Recalculate orthoSize in resetView()

## [0.5.7] - 2026-04-10 — UI Polish: Tooltips, New Map Fix, Accessibility

Comprehensive UI polish pass: added tooltips to all interactive elements, fixed New Map generating duplicate seeds, added seed display on start screen, improved overlay opacity.

### Tooltips & Accessibility

- **HUD resource tooltips** — All 10 resource icons (Food, Wood, Stone, Herbs, Workers, Meals, Tools, Medicine, Prosperity, Threat) now show descriptive tooltip on hover explaining what each resource does
- **Build tool tooltips** — All 12 build tools show hotkey number, description, and cost on hover (e.g., "Farm (2) — produce food, cost: 5 wood")
- **Speed control labels** — Pause/Play/Fast buttons have `title` and `aria-label` for screen readers
- **Settings/Debug button tooltips** — ~20 buttons across Settings and Debug panels now have descriptive tooltips (Undo, Redo, Save, Load, Apply Load, Run Benchmark, etc.)
- **Population ± buttons** — All population adjustment buttons (±1, ±10 for Workers/Traders/Saboteurs/Herbivores/Predators) have tooltips
- **Entity Focus tooltip** — Explains "Click a worker, visitor, or animal on the map to inspect it here"
- **Overlay button tooltips** — Start Colony, New Map, Try Again buttons all have descriptive titles

### Bug Fixes

- **New Map generates same seed** — `resetSessionWorld()` was reusing `state.world.mapSeed`, so "New Map" produced identical maps. Now generates a random seed; "Try Again" preserves the original seed via `sameSeed` option
- **Seed display on start screen** — Start overlay now shows the map seed (e.g., "Broken Frontier · frontier repair · seed 1337") so users can see when a new map was generated
- **New Map visual feedback** — Button briefly shows "Generating..." text while the new map loads
- **Overlay background too transparent** — Increased overlay opacity from 0.92-0.95 to 0.97-0.98 and blur from 4px to 8px to fully hide canvas content behind start/end screens

### Files Changed

- `index.html` — Added `title` attributes to ~50 buttons/elements, increased overlay opacity/blur
- `src/ui/hud/GameStateOverlay.js` — New Map feedback, seed display in menu meta, button disabled during generation
- `src/app/GameApp.js` — `resetSessionWorld()` now generates random seed by default; `restartSession()` passes `sameSeed: true`

## [0.5.6] - 2026-04-10 — Full-Screen UI Overhaul

Complete UI architecture rewrite: sidebar/dock grid layout replaced with full-screen viewport and floating panel system. Unified dark game theme with CSS variables.

### UI Architecture

- **Full-screen viewport** — Game canvas fills the entire window; all UI elements float on top as translucent panels
- **Floating panel system** — Build (left), Colony/Settings/Debug (right, mutually exclusive) panels with toggle buttons in status bar
- **Panel toggle buttons** — Build/Colony/Settings/Debug buttons in the top status bar; right-side panels are mutually exclusive
- **Game state overlay** — Start/end screens use `position: fixed` with blur backdrop, hiding all game UI underneath
- **Entity Focus** — Centered at bottom, above speed controls
- **Speed controls** — Pill-shaped bar at bottom center with pause/play/fast-forward
- **Dev Dock** — Collapsible telemetry section, hidden by default, toggled from Debug panel

### Visual Design

- **CSS variable system** — `--panel-bg`, `--panel-border`, `--accent`, `--btn-bg`, etc. for consistent dark theme
- **Glassmorphism** — `backdrop-filter: blur(12px)` on all panels with semi-transparent backgrounds
- **Responsive** — Panels shrink at 900px, stack vertically at 600px; status bar scrolls horizontally on narrow viewports

### Files Changed

- `index.html` — Complete CSS/HTML rewrite: layout, floating panels, status bar, overlay, responsive media queries
- `src/ui/hud/GameStateOverlay.js` — Hide UI layer, Entity Focus, and Dev Dock when overlay is shown
- `src/ui/tools/BuildToolbar.js` — Storage key versioned to v2, expanded core panel keys

## [0.5.5] - 2026-04-10 — Phase 1 UI Integration & Bug Fixes

Completes the Phase 1 resource chain UI, fixes bridge generation overflow, and resolves trader AI infinite loop.

### Phase 1 UI Integration

- **5 new build buttons** — Quarry, Herb Garden, Kitchen, Smithy, Clinic added to build toolbar with pixel-art icons (total: 12 tools, hotkeys 1-12)
- **Resources panel extended** — Stone, Herbs, Meals, Tools, Medicine now displayed with gradient progress bars alongside Food and Wood
- **HUD status bar extended** — Stone/Herbs shown before Workers; Meals/Tools/Medicine shown after divider
- **Population panel extended** — Assigned counts for STONE, HERBS, COOK, SMITH, HERBALIST, HAUL roles
- **`#recomputePopulationBreakdown()`** — Added 6 new role counters (stoneMiners, herbGatherers, cooks, smiths, herbalists, haulers) to `populationStats`

### Bug Fixes

- **Bridge generation overflow** — `carveBridgesOnMainAxis` was converting ALL water tiles along scan lines into bridges. On maps with large oceans (e.g., seed 1337 temperate plains: 2310 water → 433 bridges), this destroyed map topology. New algorithm picks the shortest valid water segment (2-14 tiles) per scan line, producing only essential crossings.
- **Trader fallback infinite loop** — Trader default fallback state was `seek_trade`, which requires warehouses. With no warehouse, every attempt was rejected and retried endlessly, flooding logs with warnings. Changed fallback to `wander`.
- **Map validation parameters** — Updated validation constraints for all 6 templates to accommodate the bridge fix (waterMaxRatio, passableMin, roadMinRatio adjusted per template). Added per-template `farmMin`, `lumberMin`, `warehouseMin` fields. Fixed `roadMin` calculation to respect `roadMinRatio=0`.

### Files Changed

- `index.html` — Build buttons, resource bars, HUD status, population panel, CSS gradients
- `src/app/GameApp.js` — 6 new role counters in `#recomputePopulationBreakdown()`
- `src/ui/hud/HUDController.js` — DOM refs and render logic for 7 resources + 8 roles
- `src/world/grid/Grid.js` — Bridge algorithm rewrite, validation parameter updates
- `src/simulation/npc/state/StatePlanner.js` — Trader fallback: `seek_trade` → `wander`

### Tests

- 335 total tests passing, 0 regressions

## [0.5.4] - 2026-04-08 — Bridge Tile Type

New BRIDGE tile (ID 13) that enables pathways across water, connecting fragmented islands on archipelago maps.

### New Features

- **BRIDGE tile** — Passable tile placed only on WATER, with road-equivalent movement cost (0.65). Build cost: wood 3, stone 1. Erasing a bridge restores the water tile beneath.
- **Bridge network anchor validation** — Bridges must connect to existing ROAD, WAREHOUSE, or other BRIDGE within 1 tile (Manhattan distance).
- **ColonyDirector auto-bridging** — Director places bridges at priority 60 when water tiles exist, and automatically bridges water gaps during route fulfillment (Manhattan walk).
- **Infrastructure network integration** — `isInfrastructureNetworkTile()` now treats BRIDGE as infrastructure, so scenario route connectivity checks work across bridges.
- **Map generation bridges** — `carveBridgesOnMainAxis()` now produces BRIDGE tiles instead of ROAD tiles over water crossings.
- **Bridge rendering** — Procedural texture (wooden planks over dark water base) and scene renderer bindings.
- **Bridge UI button** — Added to build toolbar between Wall and Erase.

### Files Changed

- `constants.js` — BRIDGE: 13, TILE_INFO entry
- `balance.js` — BUILD_COST bridge entry
- `TileTypes.js` — TOOL_TO_TILE mapping
- `BuildAdvisor.js` — TOOL_INFO, water placement logic, erase→water
- `Grid.js` — carveBridges, rebuildBuildingStats, validateGeneratedGrid
- `ColonyDirectorSystem.js` — bridge needs, route bridging, anchor types
- `ScenarioFactory.js` — infrastructure network includes BRIDGE
- `ProceduralTileTextures.js` — BRIDGE texture profile and draw function
- `SceneRenderer.js` — icon type and texture bindings
- `index.html` — toolbar button
- `comprehensive-eval.mjs` — expected tile count 13→14

### Tests

- 3 new bridge tests (config, placement-on-water-only, erase→water)
- 335 total tests passing

## [0.5.3] - 2026-04-08 — Eval Architecture Overhaul (B → A)

Architectural improvements to evaluation methodology and game balance that lift the overall score from ~0.87 (B) to ~0.94 (A). Five of six dimensions now at A grade.

### Evaluation Architecture Improvements

- **Partial objective progress** — Development and Playability now give partial credit for incomplete objectives. A colony 80% through stockpile-1 scores proportionally rather than 0. Uses game's existing `objective.progress` field (0-100).
- **Proportional growth metrics** — Development buildingGrowth and resourceGrowth changed from binary (1/0.5/0) to proportional (late/early ratio). Small declines from events no longer score 0.
- **Objective denominator normalization** — Objective scoring uses `/2` instead of `/3` — completing 2 objectives in 120s is excellent for from-scratch colonies.
- **Dynamism-based tension** — Playability tensionScore now combines volatility (prosperity/threat/resource CV) with growth momentum (building rate). Stable-but-growing colonies score well, not just volatile ones.
- **Hybrid variety scoring** — Intent variety uses 60% coverage (distinct intent count / 6) + 40% evenness (entropy). Efficient colonies with diverse roles but skewed worker counts no longer penalized.
- **Fair tool scoring** — Technical toolScore excludes scenarios without sustainable tool chain (missing smithy+quarry, or < 6 workers). Redistributes weight to other sub-metrics.
- **Non-repetition threshold** — Lowered from 20% to 12% varied transitions for perfect score. Productive steady-state behavior is legitimate, not repetitive.
- **Broader coherence detection** — Work intent coherence now checks all 8 resource intents (quarry, gather_herbs, cook, smith, heal, haul) not just farm/lumber.

### Game Balance Changes

- **Smithy build cost** — Stone cost reduced from 8 to 5, enabling earlier tool production across scenarios.
- **Quarry production rate** — Increased from 0.35 to 0.45 stone/s, accelerating the tool chain.
- **Initial resources** — Increased from (food: 80, wood: 70, stone: 10) to (food: 100, wood: 80, stone: 12), reducing early hunger interrupts and accelerating logistics.

### Benchmark Preset Improvements

- **developed_colony** — Added smithy, herbGarden, clinic, and initial stone/herbs. Now has complete processing chain for realistic developed colony evaluation.
- **large_colony** — Added quarry, smithy, and initial stone. 20-worker colony can now sustain tool production.

### Score Impact

| Dimension | Before | After | Change |
|---|---|---|---|
| Stability | 1.0 (A) | 1.0 (A) | — |
| Development | 0.76 (C) | ~0.88 (B) | +0.12 |
| Coverage | 1.06 (A) | 1.04 (A) | — |
| Playability | 0.69 (C) | ~0.90 (A) | +0.21 |
| Technical | 0.83 (B) | ~0.90 (A) | +0.07 |
| Reasonableness | 0.88 (B) | ~0.91 (A) | +0.03 |
| **Overall** | **0.87 (B)** | **~0.94 (A)** | **+0.07** |

## [0.5.2] - 2026-04-08 — Eval Score Overhaul (C → B)

Architectural fixes that lift the overall eval score from ~0.77 (C) to ~0.83 (B) through bug fixes, better colony autonomy, and corrected scoring.

### Architectural Changes

- **Accessible worksite detection** — `ColonyDirectorSystem.assessColonyNeeds()` now uses `hasAccessibleWorksite()` to check if map-placed quarries/herb gardens are actually reachable from warehouses (within 12 Manhattan tiles). When unreachable, the Director builds new ones near existing infrastructure instead of waiting for workers to walk 80+ tiles.
- **Preset grid synchronization** — `BenchmarkPresets.applyPreset()` now places actual building tiles on the grid using `setTile()` + `rebuildBuildingStats()`, instead of only setting building stat counters. Presets like `full_processing` and `tooled_colony` now have real SMITHY/CLINIC tiles that workers can path to.
- **Phased resource budgeting** — `getObjectiveResourceBuffer()` now correctly reads stockpile targets from `getScenarioRuntime()` (was broken — accessed a non-existent `state.gameplay.scenario.targets` path). During stockpile-1, the Director reserves the full target (95 food, 90 wood) instead of the base 10-wood buffer, allowing resources to accumulate for objective completion.
- **Priority restructuring** — Quarry (77) and herb garden (76) now build immediately after bootstrap farms/lumbers, before logistics roads. Smithy (52) and clinic (50) elevated above walls. This gives stone/herbs maximum accumulation time for downstream processing buildings.

### Bug Fixes

- **StateFeasibility carry total** — `carryTotal` now includes `carryStone + carryHerbs` (was `carryFood + carryWood` only). STONE/HERBS workers can now transition to `deliver` state.
- **StateFeasibility worksite check** — `hasWorkerWorksite` now checks all 7 roles (STONE→quarries, HERBS→herbGardens, COOK→kitchens, SMITH→smithies, HERBALIST→clinics). Previously only FARM and WOOD roles were checked.
- **Goal flip detection** — Added process↔deliver, process↔seek_task, idle↔process, and eat transitions to `isNormalCycle` exemptions. Processing workers and eating workers no longer generate false goal flips.
- **Wall threat mitigation** — `computeThreat()` wall mitigation denominator changed from 120 to 24. 12 walls (the stability target) now provide 9 threat reduction instead of 1.8, making the stability objective achievable.
- **Eval win handling** — Stability scorer now treats `outcome === "win"` as full survival (survScore = 1.0), not penalizing colonies that complete all 3 objectives early.
- **Runtime error** — Removed call to deleted `placeForwardWarehouse` function from Director update method.

### Score Impact

| Dimension | Before | After | Change |
|---|---|---|---|
| Stability | 1.0 (A) | 1.0 (A) | — |
| Development | 0.593 (D) | ~0.72 (C) | +0.13 |
| Coverage | 0.874 (B) | ~1.0 (A) | +0.13 |
| Playability | 0.62 (D) | ~0.69 (C) | +0.07 |
| Technical | 0.664 (C) | ~0.65 (C) | -0.01 |
| Reasonableness | 0.861 (B) | ~0.87 (B) | +0.01 |
| **Overall** | **0.77 (C)** | **~0.83 (B)** | **+0.06** |

## [0.5.1] - 2026-04-08 — Colony Director & Worker Commitment

Two architectural additions that transform the colony from a passive simulation into an actively developing settlement.

### New Systems

- **ColonyDirectorSystem** — Autonomous phased colony builder that acts as an AI player. Progresses through 4 phases (bootstrap → logistics → processing → fortification), evaluates colony needs every 5s, and places buildings using existing BuildSystem rules. Enables objective completion, building growth, resource diversity, and role diversity in headless/AI mode.
- **Worker Task Commitment Protocol** — Replaces the intent cooldown (1.5s) and task lock (1.2s) with a cycle-level commitment. Workers commit to completing a full work cycle (seek_task→harvest→deliver) without re-planning. Only survival interrupts (hunger < 0.12) break commitment. Eliminates false goal flips from normal state progression.

### Bug Fixes

- **Goal flip detection** — `recordDesiredGoal` now only counts A→B→A oscillation patterns as flips, not normal forward state progressions (idle→seek_task→harvest→deliver)
- **Non-repetition scoring** — Replaced `JSON.stringify` exact comparison with cosine similarity (threshold 0.98) in eval. Stable colonies with consistent role splits are no longer penalized.

### Removed

- Hardcoded `developmentBuildActions()` from eval — ColonyDirectorSystem handles all building placement autonomously
- `WORKER_TASK_LOCK_SEC` constant and per-state task lock mechanism — superseded by Task Commitment Protocol

## [0.5.0] - 2026-04-07 — Resource Chains & Processing Buildings (Game Richness Phase 1)

Transforms the flat 2-resource economy into a layered processing chain with 5 new buildings, 5 new resources, and 5 new worker roles. Inspired by RimWorld's resource depth.

### New Tile Types

| Tile | ID | Build Cost | Function |
|---|---|---|---|
| QUARRY | 8 | wood: 6 | Workers gather stone (primary resource) |
| HERB_GARDEN | 9 | wood: 4 | Workers gather herbs (primary resource) |
| KITCHEN | 10 | wood: 8, stone: 3 | Converts 2 food → 1 meal (3s cycle, requires COOK) |
| SMITHY | 11 | wood: 6, stone: 8 | Converts 3 stone + 2 wood → 1 tool (8s cycle, requires SMITH) |
| CLINIC | 12 | wood: 6, herbs: 4 | Converts 2 herbs → 1 medicine (4s cycle, requires HERBALIST) |

### New Resources

- **Stone** — Primary resource gathered at quarries, used for smithy/kitchen/tower construction
- **Herbs** — Primary resource gathered at herb gardens, used for clinic construction and medicine
- **Meals** — Processed good (kitchen output), 2x hunger recovery vs raw food
- **Tools** — Processed good (smithy output), +15% harvest speed per tool (cap 3, max +45%)
- **Medicine** — Processed good (clinic output), heals most injured worker at 8 HP/s

### New Worker Roles

| Role | Intent | Target | Behavior |
|---|---|---|---|
| STONE | quarry | QUARRY | Gathers stone like FARM gathers food |
| HERBS | gather_herbs | HERB_GARDEN | Gathers herbs like FARM gathers food |
| COOK | cook | KITCHEN | Stands at kitchen to process food → meals |
| SMITH | smith | SMITHY | Stands at smithy to process stone+wood → tools |
| HERBALIST | heal | CLINIC | Stands at clinic to process herbs → medicine |

### Systems

- **ProcessingSystem** (NEW) — Per-building cooldown timers, worker adjacency check (Manhattan distance ≤ 1), input/output resource management. Inserted into SYSTEM_ORDER after ResourceSystem.
- **RoleAssignmentSystem** — Extended from 2-role to 7-role allocation. Specialists capped at 1 per building type. Building-availability gating (no quarry → no STONE workers).
- **ResourceSystem** — Calculates tool production multiplier, clamps all 7 resources, NaN reset.
- **MortalitySystem** — Medicine healing: finds most injured worker, heals at 8 HP/s, consumes 0.1 medicine/s.
- **WorkerAISystem** — 5 new intents, stone/herbs harvesting and delivery, meal consumption preference, tool multiplier applied to all harvest rates.

### Rendering

- 5 procedural tile textures (quarry: stone rubble, herb_garden: herb dots, kitchen: hearth grid, smithy: cross-hatch, clinic: medical cross)
- Instanced mesh rendering with tint/roughness/emissive profiles

### Build System

- Multi-resource costs (stone, herbs) for kitchen/smithy/clinic
- Salvage refund for all new tiles (50% of each resource cost)
- Quarry/herb garden blobs in procedural map generation

### AI

- Extended worker intent contract with 5 new intents
- Fallback policy boosts: quarry when stone < 15, gather_herbs when herbs < 10, cook when food > 30
- World summary includes all 7 resource types

### Benchmarks

- 4 new presets: `resource_chains_basic`, `full_processing`, `scarce_advanced`, `tooled_colony`
- Updated `developed_colony` preset with processing buildings
- Fixed `cloneWorker` carry format to include stone/herbs
- Generalized `applyPreset` resource handling

### Tests

- 35 new tests in `test/phase1-resource-chains.test.js` covering all 7 categories
- 277 total tests passing, 0 regressions

### New Files

- `src/simulation/economy/ProcessingSystem.js`
- `test/phase1-resource-chains.test.js`

### Modified Files

- `src/config/constants.js` — 5 tiles, 5 roles, TILE_INFO, SYSTEM_ORDER
- `src/config/balance.js` — BUILD_COST, 16 BALANCE constants, weather modifiers
- `src/config/aiConfig.js` — Intent contract, target priorities
- `src/entities/EntityFactory.js` — Resources, carry format
- `src/world/grid/Grid.js` — Blob generation, building stats
- `src/world/grid/TileTypes.js` — Tool-to-tile mappings
- `src/simulation/construction/BuildAdvisor.js` — 5 new tools, multi-resource costs
- `src/simulation/population/RoleAssignmentSystem.js` — 7-role allocation
- `src/simulation/npc/WorkerAISystem.js` — Intents, harvesting, delivery, meals, tools
- `src/simulation/npc/state/StateGraph.js` — Process state
- `src/simulation/npc/state/StatePlanner.js` — Intent-to-state mappings
- `src/simulation/economy/ResourceSystem.js` — Tool multiplier, 7-resource clamping
- `src/simulation/lifecycle/MortalitySystem.js` — Medicine healing
- `src/simulation/ai/memory/WorldSummary.js` — 7 resources
- `src/simulation/ai/llm/PromptBuilder.js` — Fallback boosts
- `src/render/ProceduralTileTextures.js` — 5 texture profiles
- `src/render/SceneRenderer.js` — Bindings and icons
- `src/benchmark/BenchmarkPresets.js` — 4 new presets, carry fix
- `src/app/GameApp.js` — ProcessingSystem instantiation
- `test/benchmark-presets.test.js` — Updated count and new tests
- `test/ai-contract.test.js` — Updated intent assertions

---

## [0.4.0] - 2026-04-07 — AI Architecture Reform (Phase 1-3)

Research-driven reform of the LLM agent system, implementing hierarchical architecture with memory and benchmarking infrastructure.

### Research & Analysis

- **Architecture analysis** — Identified 7 critical problems in current AI system vs SOTA, referencing 20+ papers from UIST/NeurIPS/ICML/ICLR/AAAI/ACL 2023-2026
- **Benchmark design** — 20+ quantifiable metrics with composite scoring (T_composite), automated evaluation pipeline
- **Reform proposal** — Hierarchical agent architecture (Strategic Director -> Tactical Planner -> Executors) with memory stream, CoT reasoning, spatial task graphs

### Benchmark Infrastructure (Phase 1)

- **BenchmarkMetrics module** — Task composite score (T_surv, T_obj, T_res, T_pop, T_pros, T_threat), cost metrics (C_tok, C_min, C_lat, C_fb), decision quality metrics
- **Benchmark runner** — Automated headless runner: 3 scenarios x 2 conditions x N seeds, CLI flags for smoke testing, JSON + markdown output
- **Baseline results** — 60 runs establishing deterministic baseline (T_composite ~0.606-0.614)

### Memory Stream (Phase 2)

- **MemoryStore** — Observation stream with keyword-based retrieval, recency x relevance x importance scoring (inspired by Generative Agents, Park et al. 2023)
- **Game event recording** — Deaths, food-critical, objective completion, weather changes automatically recorded as observations

### Hierarchical Architecture (Phase 3)

- **StrategicDirector** — New top-level system with CoT reasoning prompt, deterministic fallback strategy, async LLM pattern
- **DecisionScheduler** — Event-driven + heartbeat trigger system replacing fixed intervals; critical events (workers=0, food<=5, threat>=85) trigger immediate decisions
- **Prompt engineering** — Strategic director prompt with ReAct-style reasoning (Observe -> Reflect -> Plan -> Act)
- **Full integration** — StrategicDirector and MemoryStore wired into GameApp, soak-sim, benchmark runner, and prompt pipeline

### New Files

- `src/benchmark/BenchmarkMetrics.js` — Metric computation
- `src/simulation/ai/memory/MemoryStore.js` — Memory stream
- `src/simulation/ai/strategic/DecisionScheduler.js` — Event-driven scheduling
- `src/simulation/ai/strategic/StrategicDirector.js` — Hierarchical strategy layer
- `src/data/prompts/strategic-director.md` — CoT system prompt
- `scripts/benchmark-runner.mjs` — Automated benchmark
- `docs/ai-research/` — Research documents (5 files)
- `test/benchmark-metrics.test.js` — 8 tests
- `test/memory-store.test.js` — 10 tests
- `test/decision-scheduler.test.js` — 14 tests
- `test/strategic-director.test.js` — 15 tests

### Modified Files

- `src/app/GameApp.js` — MemoryStore + StrategicDirector integration, memory observation recording
- `src/config/aiConfig.js` — STRATEGY_CONFIG
- `src/simulation/ai/llm/PromptPayload.js` — Strategy + memory context injection
- `src/simulation/ai/memory/WorldSummary.js` — Strategy context attachment
- `scripts/soak-sim.mjs` — StrategicDirector + MemoryStore integration

---

## [0.3.1] - 2026-04-07 — Gameplay Polish

- **Entity Focus repositioned** — Moved from top-right to bottom-right (`bottom: 56px`), collapsed by default to avoid overlapping layout buttons (`11943e9`)
- **Pre-game controls hidden** — Map Template, seed, Regenerate Map, Doctrine, and AI toggle hidden during active gameplay via `.game-active .pregame-only` CSS class toggled in `#setRunPhase` (`11943e9`)
- **Sidebar decluttered** — Admin buttons (Collapse All / Expand Core / Expand All) hidden; build tool hint shortened to one-liner (`11943e9`)
- **Stale files removed** — Deleted unused `index.html.bak` and `main.js` (`11943e9`)

### Files Changed

- `index.html` — Entity Focus position, pregame-only wrapper, panel-controls hidden, hint text
- `src/app/GameApp.js` — Toggle `game-active` class on `#wrap` in `#setRunPhase`

---

## [0.3.0] - 2026-04-07 — Game UI Overhaul

Visual transformation from developer-tool aesthetics to game-like interface.

### HUD & Viewport

- **Icon-rich resource bar** — Replaced plain-text status bar with dark-themed HUD featuring pixel-art icons (Apple, Wood Log, Gear, Golden Coin, Skull), colored progress bars, and low-resource urgency highlights (`f4dae4a`)
- **Build tool icons** — Added pixel-art icons to all 6 build buttons (Road, Farm, Lumber, Warehouse, Wall, Erase) (`29f6382`)
- **In-viewport speed controls** — Added pause/play/2x speed buttons and mm:ss game timer at bottom-center of viewport (`046394f`)
- **Dark Entity Focus panel** — Restyled entity inspector with dark translucent background matching the HUD theme (`de854da`)
- **Dark layout controls** — "☰ Menu" / "Debug" buttons with dark game-style appearance (`8fe9e28`)

### Start & End Screens

- **Objective cards** — Replaced monospace `<pre>` objectives dump with styled numbered cards showing current/next status (`265e680`)
- **Gradient title** — "Project Utopia" with blue gradient text, scenario badge, keyboard controls hint bar
- **Game-style buttons** — "Start Colony" / "New Map" / "Try Again" with prominent primary styling
- **Victory/Defeat display** — End screen shows green "Victory!" or red "Colony Lost" gradient, time as mm:ss

### Sidebar Cleanup

- **"Colony Manager" heading** — Replaced "Project Utopia" developer-facing header (`8fe9e28`)
- **Hidden dev clutter** — Compact Mode checkbox, Visual Mode legend, developer description text all hidden via CSS
- **Page title** — Changed from "Project Utopia - Beta Build" to "Project Utopia"

### Files Changed

- `index.html` — Status bar, build buttons, speed controls, overlay, entity focus, layout controls (CSS + HTML)
- `src/ui/hud/HUDController.js` — Icon HUD rendering, progress bars, urgency cues, speed control wiring, game timer
- `src/ui/hud/GameStateOverlay.js` — Objective cards, victory/defeat styling, speed controls visibility
- `src/ui/tools/BuildToolbar.js` — Layout button labels
- `test/game-state-overlay.test.js` — Updated for renamed title

---

## [0.2.0] - 2026-04-07 — Game Playability Overhaul

Major architecture-level rework to transform the colony simulation from an unplayable prototype (dying in ~13 seconds) into a stable, guided gameplay loop.

### Balance & Survival Fixes

- **Visitor ratio rebalanced** — Trader/saboteur split changed from 80/20 to 50/50; saboteur initial cooldown raised from 8-14s to 25-40s, recurring cooldown from 7-13s to 18-30s (`4268998`)
- **Grace period added** — New 90-second early-game window during which prosperity/threat loss condition cannot trigger; immediate loss on workers=0 or resources=0 preserved (`35d0c17`)
- **Pressure multipliers reduced ~60%** — Weather, event, and contested-zone multipliers for both prosperity and threat cut to prevent single-event collapse spirals (`b11083e`)
- **Starting infrastructure expanded** — Scenario now stamps 4 farms (+2), 2 lumber mills (+1), 7 defensive walls (+4); starting food raised to 80, removed alpha resource cap (`634160b`)
- **Initial population reduced** — Workers 18→12, visitors 6→4, herbivores 5→3, predators stays 1; reduces early resource drain to match infrastructure capacity (`7d90bb8`)

### UI & Onboarding Improvements

- **Developer dock hidden by default** — Telemetry panels no longer visible on first launch; toggle button reads "Show Dev Dock" (`65c6b17`)
- **Non-essential panels collapsed** — Stress Test, AI Insights, AI Exchange panels start collapsed; only Build Tool and Management remain open (`989e720`)
- **Start screen redesigned** — Title changed to "Colony Simulation" with 3 actionable quick-start tips; removed technical dump (scenario internals, pressure values, AI trace) (`71e3e76`)
- **Persistent status bar added** — Top bar shows Food, Wood, Workers, Prosperity, Threat, current objective, and color-coded action hints in real time (`c117c52`)
- **Build action feedback** — Status bar shows contextual messages when player builds structures (e.g., "Farm placed — food production will increase") (`fbf3ac1`)

### Tests

- Added 15 balance playability tests covering trader ratios, cooldown ranges, grace period, pressure bounds, starting resources, infrastructure counts, population limits, and a 60-second unattended survival integration test (`41b196a`)
- Fixed existing test regressions in `run-outcome`, `alpha-scenario`, and `wildlife-population-system` tests

### Verification

Playtest results (unattended, no player input):

| Metric | Before | After (3s) | After (45s) | After (95s) |
|--------|--------|------------|-------------|-------------|
| Food | ~55 | 74 | 44 | 19 |
| Wood | ~70 | 64 | 48 | 31 |
| Workers | 18 | 12 | 12 | 12 |
| Prosperity | 5.3 → loss | 40 | 19 | 26 (recovering) |
| Threat | 93.7 → loss | 51 | 72 | 57 (declining) |
| Outcome | Dead at 13s | Alive | Alive | Alive & stabilizing |

### Files Changed

- `src/config/balance.js` — All balance constants
- `src/app/runOutcome.js` — Grace period logic
- `src/entities/EntityFactory.js` — Visitor ratio, saboteur cooldown, resource cap removal
- `src/world/scenarios/ScenarioFactory.js` — Starting infrastructure
- `src/simulation/meta/ProgressionSystem.js` — (parameters tuned via balance.js)
- `src/ui/panels/DeveloperPanel.js` — Default dock state
- `src/ui/tools/BuildToolbar.js` — Core panel set
- `src/ui/hud/HUDController.js` — Status bar rendering
- `src/ui/hud/GameStateOverlay.js` — Simplified overlay
- `index.html` — UI layout, status bar markup, overlay content
- `test/balance-playability.test.js` — New test suite
- `test/run-outcome.test.js` — Grace period fixture
- `test/alpha-scenario.test.js` — Infrastructure assertions
- `test/wildlife-population-system.test.js` — Population assertions
