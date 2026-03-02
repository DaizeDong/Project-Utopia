# Project Utopia

A real-time interactive crowd simulation built with Three.js. Users edit a tile-based map (roads, walls, buildings) and observe how NPCs reroute, redistribute resources, and adapt to the new environment. An LLM-based AI agent layer drives high-level NPC role decisions and world events on top of deterministic A* pathfinding and Boids local steering.

## Tech Stack

- **Renderer:** Three.js + Vite
- **Language:** JavaScript
- **AI:** LLM API (OpenAI/Gemini) with deterministic fallback

## Quick Start

```bash
npm ci
npm run dev
```

```bash
npm test        # run regression tests
npm run build   # production build
```

## Current Status

For a concise implementation snapshot, read:

- `docs/implementation-summary.md`

## Visual Preset (Bright WorldSim)

Default runtime preset is `flat_worldsim`:

- Bright top-down orthographic camera (no tilt rotation)
- High-contrast textured tiles for every tile type (no color-only fallback as default)
- Tile borders + hover/build preview
- WorldSim icon overlays for buildable tile semantics
- Sprite-first unit rendering with model fallback
- Developer telemetry dock for AI trace, A* / Boids, and system timings

Reference captures:
- `docs/assignment3/screenshots/worldsim-full-ui.png`
- `docs/assignment3/screenshots/worldsim-viewport.png`
- `docs/assignment3/screenshots/worldsim-devdock.png`

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
- `Map Template`
- `Map seed`
- terrain tuning sliders/selects (`water`, `river`, `mountain`, `island`, `ocean`, `road`, `settlement`, `wall mode`)
- `Reset Tuning` (restore selected preset defaults)
- `Regenerate Map`
- `Population Targets` for workers/visitors/herbivores/predators
- `Apply Population` to spawn/despawn all creature categories

## Developer Telemetry

Bottom dock contains live diagnostics for development and grading demos:

- `Global & Gameplay`: map seed/template, sim state, doctrine, prosperity/threat, objective progress
- `A* + Boids`: pathfinding request/cache/success metrics and boid crowd stats
- `AI Trace`: environment/policy request/result timeline with source and error
- `System Timings`: per-system `last/avg/peak` ms
- `Objective / Event Log`: objective completions, active events, warning stream

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
- UI update throttling:
  - heavy HUD/Inspector/Telemetry DOM writes now run at ~15Hz instead of every render frame.
- Adaptive render detail:
  - high entity counts automatically switch to fast instanced rendering.
  - detail mode restores automatically when entity count drops.

Inspector panel now shows both:
- selected tile internals (type, cost, passability, neighbors, grid version)
- selected unit internals (state, role, policy, blackboard, memory, full path nodes)

## Run With AI Proxy

Copy `.env.example` and configure your key:

```bash
cp .env.example .env
# set OPENAI_API_KEY=...
```

Start both services:

```bash
npm run dev:full
```

Or start them separately:

```bash
npm run ai-proxy
npm run dev
```

## NPM Scripts

- `npm run dev`: start Vite dev server
- `npm run dev:full`: start both AI proxy and Vite dev server
- `npm run ai-proxy`: start local AI proxy (`/api/ai/environment`, `/api/ai/policy`)
- `npm run test`: run unit tests
- `npm run build`: build `dist/`
- `npm run a3:evidence:ai`: capture live-AI evidence JSON for Assignment 3
- `npm run verify:a3`: run Assignment 3 verification (tests/build/docs/build zip/proxy contract)

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
