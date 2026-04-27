# CLAUDE.md — Project Utopia

## Project Overview

Three.js colony simulation game with tile-based grid (96x72 Uint8Array). Players manage workers, build infrastructure, and survive indefinitely in endless survival mode (v0.8.0+). RimWorld-inspired resource chain economy.

## Architecture

- **ECS-like system architecture** — 15 systems in fixed update order defined in `SYSTEM_ORDER` (src/config/constants.js)
- **Tile types** — Integer IDs 0-13 (GRASS through BRIDGE), defined in `TILE` constant
- **Worker AI pipeline** — Intent (chooseWorkerIntent) → State (StatePlanner/StateGraph) → Action (WorkerAISystem)
- **AI fallback** — State-adaptive policy fallback when LLM is unavailable; PromptBuilder constructs LLM prompts
- **Processing chain** — Raw resources (food/wood/stone/herbs) → Processing buildings → Refined goods (meals/tools/medicine)

## Key Directories

- `src/config/` — Constants, balance values, AI config
- `src/simulation/` — All game systems (economy, npc, ai, lifecycle, population, construction, meta)
- `src/world/` — Grid, scenarios, pathfinding
- `src/render/` — Three.js rendering, procedural textures
- `src/ui/` — HUD, panels, tools
- `src/benchmark/` — Benchmark presets and metrics
- `test/` — Node.js built-in test runner (`node --test test/*.test.js`)
- `docs/superpowers/plans/` — Architecture plans for future phases

## Development

- **Test runner:** `node --test test/*.test.js` (Node.js built-in)
- **Dev server:** `npx vite` (Vite)
- **No TypeScript** — Pure ES modules (.js), JSDoc for type hints where needed
- **No bundler config** — Vite handles everything

## Conventions

- Frozen config objects (`Object.freeze`) for constants and balance values
- Deterministic RNG via seeded PRNG (for reproducible maps and tests)
- Manhattan distance for tile adjacency checks
- Worker carry includes 4 resource types: `{ food, wood, stone, herbs }`
- Processed goods (meals, medicine, tools) are colony-wide, stored in `state.resources`, not carried
- **Changelog** — Every commit must include a corresponding update to `CHANGELOG.md`. Add entries under the current unreleased version section describing what changed and why. Group entries by category (New Features, Bug Fixes, Files Changed, etc.).

## Current State (as of v0.8.1)

- **v0.8.1 "Phase 8 Survival Hardening" complete** — Partial fix for day-365 starvation spiral: yieldPool lazy-init bug in farm harvest (WorkerAISystem), missing kitchen tier in fallback planner (ColonyPlanner), salinization tuning (0.02→0.012 per-harvest, 1800→1200 fallow ticks), fog initial radius 4→6, demand-side growth throttle (FOOD_COST 6→10, pop-cap tightening). DevIndex 39→44 (+12%), deaths 512→454 (-11%). Remaining gap to target 70 traced to structural carry/deposit policy (workers eat from carry directly, bypassing warehouse) — punted to Phase 9. Plus ~259 LOC dead objective-code cleanup across 6 files.
- **v0.8.0 "Living World" complete** — 7-phase balance overhaul: soil/nodes/fog/recycling (M1), warehouse queue/density (M2), fatigue/spoilage/grace (M3), road compounding (M4), survival mode + DevIndex, raid escalator, 18-patch AI adaptation, long-horizon benchmark harness, PressureLens heat mode, deliverWithoutCarry bug fix + 7 exploit regression tests.
- **Phase 1 complete** — Resource chains with 5 new buildings, 5 new resources, 5 new roles, full UI integration
- **Terrain diversity complete** — All 6 map templates have dedicated terrain generators with dramatically different profiles
- **Terrain depth complete** — 10-feature overhaul: persistent elevation/moisture, ruin salvage, elevation movement/build/defense costs, seasonal weather, soil exhaustion, adjacency fertility, moisture cap, drought wildfire
- **Worker intelligence** — Job reservation, occupancy-aware scoring, role-based spreading, phase-jittered retargeting
- **Road infrastructure** — Union-Find road network, speed bonus, logistics efficiency, algorithmic road planner, wear mechanics
- **Phase 2-5 planned** — Defense, wildlife expansion, colonist depth (see `docs/superpowers/plans/2026-04-07-game-richness-expansion.md`)
- **Tile types** — 14 types (GRASS through BRIDGE, IDs 0-13)
- **865 tests passing** across 109 test files (867 total: 2 pre-existing skips)
- **15 benchmark presets** across terrain/economy/pressure categories
- **AI system** — Hierarchical (StrategicDirector → Tactical) with memory stream, fallback policies, evaluation feedback loop
- **Map templates** — 6 templates: temperate_plains, rugged_highlands, archipelago_isles, coastal_ocean, fertile_riverlands, fortified_basin
