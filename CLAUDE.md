# CLAUDE.md — Project Utopia

## Project Overview

Three.js colony simulation game with tile-based grid (96x72 Uint8Array). Players manage workers, build infrastructure, and survive through 3 objectives. RimWorld-inspired resource chain economy.

## Architecture

- **ECS-like system architecture** — 15 systems in fixed update order defined in `SYSTEM_ORDER` (src/config/constants.js)
- **Tile types** — Integer IDs 0-12 (GRASS through CLINIC), defined in `TILE` constant
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

## Current State (as of v0.5.5)

- **Phase 1 complete** — Resource chains with 5 new buildings, 5 new resources, 5 new roles, full UI integration
- **Phase 2-5 planned** — Defense, wildlife expansion, terrain variety, colonist depth (see `docs/superpowers/plans/2026-04-07-game-richness-expansion.md`)
- **Tile types** — 14 types (GRASS through BRIDGE, IDs 0-13)
- **335 tests passing** across 60+ test files
- **15 benchmark presets** across terrain/economy/pressure categories
- **AI system** — Hierarchical (StrategicDirector → Tactical) with memory stream, fallback policies
