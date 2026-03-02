# Project Utopia

A real-time interactive crowd simulation built with Three.js. Users edit a tile-based map (roads, walls, buildings) and observe how NPCs reroute, redistribute resources, and adapt to the new environment. An LLM-based AI agent layer drives high-level NPC role decisions and world events on top of deterministic A* pathfinding and Boids local steering.

## Tech Stack

- **Renderer:** Three.js + Vite
- **Language:** JavaScript
- **AI:** LLM API (OpenAI/Gemini) with deterministic fallback

## Quick Start

Install dependencies:

```bash
npm ci
```

Optional AI setup:

```bash
cp .env.example .env
# set OPENAI_API_KEY=...
```

Choose one startup mode:

```bash
npm run dev:full
```

- `npm run dev:full`: recommended daily development (Vite + AI proxy)
- `npm run start:prod`: production-like run (build + preview + AI proxy)
- `npm run dev`: frontend only (no AI proxy)

Verification:

```bash
npm run verify:full
```

If port `8787` is occupied, stop that process or set `AI_PROXY_PORT` in `.env`.

If the page appears stuck and Developer Dock stays on `loading...`, open browser DevTools and check for:
- `Error creating WebGL context`

Recent runtime now surfaces this startup failure on-screen (`Startup failed: ...`) instead of silently stalling.

## Current Status

For a concise implementation snapshot, read:

- `docs/implementation-summary.md`
- `docs/optimization-progress.md` (rolling execution tracker for full optimization plan)

## Visual Preset (Bright WorldSim)

Default runtime preset is `flat_worldsim`:

- Bright top-down orthographic camera (no tilt rotation)
- High-contrast textured tiles for every tile type (no color-only fallback as default)
- Tile borders + hover/build preview
- WorldSim icon overlays for buildable tile semantics
- Sprite-first unit rendering with model fallback
- Developer telemetry dock for AI trace, A* / Boids, and system timings

Reference captures:
- baseline capture set is tracked in assignment artifacts; current refresh run is pending in `docs/optimization-progress.md`.

## Core Gameplay Pillars

The current playable prototype is organized around 3 pillars:

1. **Settlement Logistics Loop**  
Build roads and production tiles, assign workers, and maintain food/wood flow.
2. **Governance Doctrine Loop**  
Switch doctrine (`Balanced`, `Agrarian`, `Industry`, `Fortress`, `Trade`) to bias yields, risk, and role allocation.
3. **Pressure & Adaptation Loop**  
Handle weather, sabotage, visitors, predators, and AI directives while progressing objectives.

`ProgressionSystem` computes prosperity/threat and objective progression each simulation step.

## Map Templates

Initialization now uses deterministic template + seed terrain generation (`src/world/grid/Grid.js`) with validation checks and runtime tuning overrides.

Current default map size:
- `96 x 72`

Generation characteristics:
- domain-warped fBm terrain field (elevation/moisture)
- meandering river carving + bridge corridors
- organic road network via biased random-walk links between hubs
- district blob placement for farm/lumber/ruins
- template-specific wall strategy (`border`, `spokes`, `fortress`, `none`)
- post-generation infrastructure guarantee for playability
- empty-base detection pass (uncovered sentinel tiles are counted and normalized)

- `temperate_plains`: broad balanced plains
- `rugged_highlands`: mountainous rugged terrain
- `archipelago_isles`: island-fragmented terrain
- `coastal_ocean`: strong oceanic coastline
- `fertile_riverlands`: fertile river-fed lowlands
- `fortified_basin`: defended basin with chokepoints

Validation includes:
- minimum road/farm/lumber/warehouse coverage
- passable ratio bounds
- water ratio bounds
- wall/ruin density sanity bounds
- unknown/empty tile safety checks

Use **Management** panel in UI:
- grouped sub-panels: `Map & Doctrine`, `Terrain Tuning`, `Population`, `Save / Replay`
- advanced runtime controls: `Tile Icons`, `Unit Sprites`, `Simulation Tick (Hz)`, `Camera Min/Max Zoom`, `Detail Threshold`
- template/seed/doctrine tuning and regenerate
- terrain sliders/selects (`water`, `river`, `mountain`, `island`, `ocean`, `road`, `settlement`, `wall mode`)
- population targets and apply for workers/visitors/herbivores/predators
- undo/redo + snapshot save/load + preset compare + replay export

## Developer Telemetry

Bottom dock contains live diagnostics for development and grading demos:

- `Global & Gameplay`: map seed/template, sim state, doctrine, prosperity/threat, objective progress
- `A* + Boids`: pathfinding request/cache/success metrics and boid crowd stats
- `AI Trace`: environment/policy request/result timeline with source and error
- `System Timings`: per-system `last/avg/peak` ms plus UI/render CPU cost
- `Objective / Event Log`: objective completions, active events, warning stream

Layout controls:
- top-right `Hide Sidebar` / `Hide Dev Dock` buttons collapse large UI regions for better viewport focus
- sidebar panel controls: `Collapse All` / `Expand Core` / `Expand All`
- each top-level sidebar panel persists open/closed state in local storage
- each Developer Dock card can be collapsed independently

## Performance Optimizations (2026-03)

Recent runtime optimizations focused on CPU and render bottlenecks under stress load:

- Tile query cache in `Grid.js`:
  - `listTilesByType` now caches per `grid.version`.
  - nearest-tile queries reuse cached candidate lists instead of rescanning entire grid.
- NPC target refresh throttling:
  - workers and traders avoid per-tick nearest-target recomputation.
  - intent targets refresh on interval/intention change/grid change only.
- Boids hot path optimization:
  - reduced temporary allocations with reusable buffers.
  - switched spatial hash keys from string hashing to numeric nested maps.
  - capped neighbor samples per agent to keep high-density costs bounded.
  - adaptive lower-frequency update under very high entity counts while preserving simulation speed.
- Render loop hot path optimization:
  - fixed high-DPI resize check that could trigger `renderer.setSize` every frame.
  - reduced per-frame allocations in instanced matrix updates and selected-path rendering.
  - stopped recreating fog object each frame.
  - adaptive pixel ratio (`detailed` vs `fast` render mode).
  - lazy-load 3D model templates only when visual settings actually require models.
  - entity mesh synchronization now tracks simulation tick/config signature instead of forcing full rebuild every render frame.
- UI update throttling:
  - heavy HUD/Inspector/Telemetry DOM writes now run at ~15Hz instead of every render frame.
  - UI refresh now auto-throttles under very high entity counts.
- Adaptive render detail:
  - high entity counts automatically switch to fast instanced rendering.
  - detail mode restores automatically when entity count drops.

Inspector panel now shows both:
- selected tile internals (type, cost, passability, neighbors, grid version)
- selected unit internals (state, role, policy, blackboard, memory, full path nodes)

## Common Commands

- `npm run dev:full`: main development entry (UI + AI proxy)
- `npm run start:prod`: build and run production preview (recommended for demo)
- `npm run verify:full`: one-command full verification
- `npm run test`: unit tests
- `npm run build`: production build

## Project Structure

```
src/
  app/          # game loop, simulation clock
  world/        # grid, tiles, map loading, events
  entities/     # entity and component data models
  simulation/   # economy, navigation, AI agent, NPC behavior
  render/       # Three.js scene, instanced rendering, debug overlays
  ui/           # HUD, build toolbar, inspector panel
  data/         # map JSON, balance configs, LLM prompts
```

## Docs

- [Implementation Summary](docs/implementation-summary.md) - current implemented features and boundaries
- [System Design](docs/system-design.md) - full system breakdown (Chinese)
- [Assignment 2](assignments/homework2/a2.md) - PRD and technical spec
- [Model Attribution](public/assets/models/ATTRIBUTION.md)
- [WorldSim Asset Attribution](public/assets/worldsim/ATTRIBUTION.md)
- [Assignment 3 Demo Script](docs/assignment3/demo-video-script.md)
- [Assignment 3 Midterm Report](docs/assignment3/A3-report-final.md)
- [Assignment 3 Submission Checklist](docs/assignment3/submission-checklist.md)
- [Assignment 3 Submission Links](docs/assignment3/A3-submission-links.md)
- [Assignment 3 Live AI Evidence Notes](docs/assignment3/live-ai-evidence.md)
- [Gameplay & Map Strategy](docs/gameplay-design.md)
