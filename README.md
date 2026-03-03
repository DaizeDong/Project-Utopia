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
# set OPENAI_API_KEY and optional OPENAI_MODEL / OPENAI_REQUEST_TIMEOUT_MS / AI_PROXY_PORT
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

## Behavior/FSM Debug Highlights

- Entity behavior now follows a unified `StatePlanner -> StateGraph transition -> state handler` chain.
- AI policy can optionally include group-level `stateTargets` (`workers/traders/saboteurs/herbivores/predators`), with runtime TTL and guardrails.
- `Developer Telemetry -> Logic Consistency` shows:
  - invalid transitions
  - rapid goal flips
  - path recalcs per entity per minute
  - death reason + food-reachability context
- Human starvation rule is now reachability-based: global food stock alone is not enough; warehouse food must be reachable.

## Fallback Diagnostics

| Symptom | Root Cause | Fix |
|---|---|---|
| `OPENAI_API_KEY missing` | key not loaded into proxy process | set key in `.env`, restart `dev:full` |
| `request timeout` | upstream call exceeded timeout | increase `OPENAI_REQUEST_TIMEOUT_MS` (for example `20000`) and verify network stability |
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
