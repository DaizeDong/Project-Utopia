# Project Utopia

A real-time interactive crowd simulation built with Three.js. Users edit a tile-based map (roads, walls, buildings) and observe how NPCs reroute, redistribute resources, and adapt to the new environment. An LLM-based AI layer drives high-level NPC role decisions and world events on top of deterministic A* pathfinding and Boids steering.

## Tech Stack

- Renderer: Three.js + Vite
- Language: JavaScript (ESM)
- AI: OpenAI-compatible proxy with schema validation + deterministic fallback

## Quick Start

```bash
npm ci
cp .env.example .env
# set OPENAI_API_KEY and optional OPENAI_MODEL / AI_PROXY_PORT
```

```bash
npm run dev:full      # recommended: Vite + ai-proxy
npm run start:prod    # build + preview + ai-proxy
npm run test
npm run build
```

Notes:
- `dev:full`, `preview:full`, and `ai-proxy` now auto-load root `.env`.
- Existing shell env variables still override `.env` values.

## AI Runtime Self-Check

1. Start:
```bash
npm run dev:full
```
2. Health check:
```bash
curl http://localhost:8787/health
```
Expected fields:
- `hasApiKey: true`
- `model: ...`
- `envLoaded: true`
- `apiKeySource: env|process`
- `modelSource: env|default`

3. In browser telemetry:
- `World State -> AI Mode` should become `on / llm (...)` when key is available.
- `Developer Telemetry -> AI Trace` should show lines like:
  - `policy-request llm fallback=false ...`
  - `policy llm fallback=false ...`

If key is missing/unreachable, app stays in fallback mode by design.

## Demo Focus: Full AI Exchange on Selected Entity

1. Click any movable entity in viewport.
2. Open top-right `Entity Focus` panel.
3. Expand `Last AI Exchange (Full)`:
   - `Policy Exchange for <group>`
   - `Environment Exchange (Global)`
4. For each exchange you can inspect and copy:
   - request time and sim time
   - source / fallback / model / error
   - full `requestSummary`
   - full raw model content
   - parsed payload and guardrailed output

This is the recommended demo evidence path for showing that AI decisions are both live and explainable.

## Behavior and Lifecycle Updates

- AI group strategy now runs with 5 groups:
  - `workers`, `traders`, `saboteurs`, `herbivores`, `predators`
- `VISITOR` entities are split by kind:
  - `TRADER -> traders`
  - `SABOTEUR -> saboteurs`
- Mortality is enabled with permanent removal (no auto-respawn):
  - starvation deaths for humans/animals
  - predation deaths for herbivores
- Boids steering now uses per-group profiles:
  - animals: stronger cohesion/alignment (more flocking)
  - humans: lower cohesion/higher separation (less flocking)

## Fallback Diagnostics

| Symptom | Root Cause | Fix |
|---|---|---|
| `OPENAI_API_KEY missing` | key not loaded into proxy process | set key in `.env`, restart `dev:full` |
| `request timeout` | proxy can’t reach model endpoint | check network and API provider status |
| `OpenAI HTTP ... model ...` | invalid model name | set valid `OPENAI_MODEL` or remove to use default `gpt-4.1-mini` |
| `proxy unreachable` in HUD | proxy process not running/port conflict | free `AI_PROXY_PORT` and rerun `dev:full` |

## Project Structure

```text
src/
  app/          # loop, simulation clock, orchestration
  world/        # grid generation, weather, events
  entities/     # initial state and entity factory
  simulation/   # AI, navigation, movement, economy, meta systems
  render/       # Three.js renderer and overlays
  ui/           # toolbar, HUD, inspector, developer panels
server/
  ai-proxy.js   # /api/ai/environment, /api/ai/policy, /health
scripts/
  dev-full.mjs
  preview-full.mjs
  env-loader.mjs
```
