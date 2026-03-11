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
npm run verify:full
npm run verify:long:fallback
npm run verify:long
npm run release:check
npm run submit:local
npm run submit:strict
```

Notes:

- `dev:full`, `preview:full`, and `ai-proxy` now auto-load root `.env`.
- Existing shell env variables still override `.env` values.

## Long-Run Validation

`verify:full` stays short and is still the daily gate. Long browser soaks are separate and run against `npm run preview:full`.

```bash
npm run verify:long:fallback
npm run verify:long:llm
npm run verify:long
```

Notes:

- `verify:long:fallback` runs the browser idle suite plus the scripted operator suite in deterministic fallback mode.
- `verify:long:llm` runs the same suites with live LLM coverage and fails fast if `OPENAI_API_KEY` is missing, the local `ai-proxy /health` payload is not valid, or a live environment/policy probe falls back before the soak starts.
- `verify:long` always runs the fallback suite first, then requires the live-LLM gate.
- Long-run metrics are written to `docs/assignment4/metrics/`.
- Browser screenshots and failure captures are written to `output/playwright/`.

## Submission / Release Flow

The authoritative submission artifact is the local production build, not an unverified hosted URL.

Use this command for the full local submission gate:

```bash
npm run submit:local
```

That runs:

- `npm run verify:full`
- `npm run release:check`

If you want the final gate to fail on any remaining non-ignored local changes, run:

```bash
npm run release:strict
```

`release:strict` now requires both:

- a clean non-ignored worktree
- a non-stale production build relative to the checked frontend inputs
- fresh local verification artifacts relative to the current build

Or run the full verification chain plus the strict clean-worktree gate together:

```bash
npm run submit:strict
```

Generated verification artifacts are written to:

- `docs/assignment4/metrics/`
- `docs/assignment4/release-manifest.json`
- `docs/assignment3/verification-summary.json`

Optional local screenshot evidence can be captured under:

- `output/playwright/release-*.png`

These artifacts are intentionally ignored by git so repeated local verification does not dirty the worktree.
That includes `output/playwright/`, which is treated as a local evidence/debug directory rather than a tracked source folder.
The repo also ignores common local-only files such as `.env` and `.idea/` so release status stays focused on source changes.

`release-manifest.json` now records:

- the final HW04 report path and stage coverage
- the current `HEAD` commit and a recent commit history snapshot
- the current git branch / `git describe` / upstream reference for release provenance
- the local release status summary, including whether `release:strict` would currently pass
- the current `release:strict` blocker preview, including the first non-ignored dirty paths
- whether strict mode is also requiring a fresh build at check time
- whether strict mode is also requiring fresh local verification artifacts
- the toolchain snapshot used for the release pass (`node`, `npm`, `vite`)
- the exact release-script chain from `package.json`
- per-artifact `sha256` hashes for the build, proofs, metrics, and optional screenshots
- portable `relativePath` fields alongside the local absolute paths
- a build-freshness summary showing whether `dist` is older than the checked frontend build inputs
- a verification-freshness summary showing whether the local Stage 12/13 verification artifacts are older than the current build
- the built `dist` asset inventory and bundle summary
- the stored HW03 proof files
- the generated local metrics and optional screenshot evidence
- the current non-ignored git worktree status at release-check time

## Optional Live-AI Proof Refresh

If `OPENAI_API_KEY` is configured and you want to refresh the stored live-AI evidence instead of relying on the existing HW03 proof files, run:

```bash
npm run a3:evidence:ai
```

Without a valid key, the app remains in deterministic fallback mode by design.

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

## Fallback Diagnostics

| Symptom                     | Root Cause                              | Fix                                                                                     |
|-----------------------------|-----------------------------------------|-----------------------------------------------------------------------------------------|
| `OPENAI_API_KEY missing`    | key not loaded into proxy process       | set key in `.env`, restart `dev:full`                                                   |
| `request timeout`           | upstream call exceeded timeout          | increase `OPENAI_REQUEST_TIMEOUT_MS` (for example `20000`) and verify network stability |
| `OpenAI HTTP ... model ...` | invalid model name                      | set valid `OPENAI_MODEL` or remove to use default `gpt-4.1-mini`                        |
| `proxy unreachable` in HUD  | proxy process not running/port conflict | free `AI_PROXY_PORT` and rerun `dev:full`                                               |

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
