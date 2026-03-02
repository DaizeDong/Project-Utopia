# Project Utopia

A real-time interactive crowd simulation built with Three.js. Users edit a tile-based map (roads, walls, buildings) and observe how NPCs reroute, redistribute resources, and adapt to the new environment. An LLM-based AI agent layer drives high-level NPC role decisions and world events on top of deterministic A* pathfinding and Boids local steering.

## Tech Stack

- **Renderer:** Three.js + Vite
- **Language:** JavaScript
- **AI:** LLM API (OpenAI/Gemini) with deterministic fallback

## Quick Start

```bash
npm ci
```

Optional AI setup:

```bash
cp .env.example .env
# set OPENAI_API_KEY=...
```

```bash
npm run dev:full       # recommended (Vite + AI proxy)
npm run start:prod     # production-like (build + preview + AI proxy)
npm run dev            # frontend only
npm run verify:full    # full verification
npm run test           # unit tests
```

If port `8787` is occupied, stop that process or set `AI_PROXY_PORT` in `.env`.

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
