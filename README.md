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

- [System Design](docs/system-design.md) — full system breakdown (Chinese)
- [Assignment 2](assignments/homework2/a2.md) — PRD and technical spec
