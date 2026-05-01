# Project Utopia

A real-time interactive crowd simulation built with Three.js. Users edit a tile-based map (roads, walls, buildings) and observe how NPCs reroute, redistribute resources, and adapt to the new environment. An LLM-based AI layer drives high-level NPC role decisions and world events on top of deterministic A* pathfinding and Boids steering.

## Highlights — Two Pillars

<!-- AUTHOR: Pillar names below MUST match the wording committed in
     assignments/homework2/a2.md and assignments/homework2/Assignment 2_ Project Approval & Specs.md.
     Do not let an LLM rename them. The two-three-sentence summaries below are
     placeholders — rewrite each in your own voice before submitting. -->

### Pillar A — _\<copy exact pillar name from A2\>_

Two-to-three sentence technical summary: what the pillar is, the system(s)
under `src/` that implement it, and the one-line "you can see this in 30
seconds of play" pitch. (Long form: see [Post-Mortem](assignments/homework7/Post-Mortem.md) §1 Pillar A.)

### Pillar B — _\<copy exact pillar name from A2\>_

Same shape — two-to-three sentence summary anchored to a real subsystem and a
visible runtime artefact. (Long form: see [Post-Mortem](assignments/homework7/Post-Mortem.md) §1 Pillar B.)

> See [Post-Mortem](assignments/homework7/Post-Mortem.md) for the full technical retrospective, playtest resolution, pivots from the A2 MVP, and AI tool evaluation.

## Tech Stack

- Renderer: Three.js + Vite
- Language: JavaScript (ESM)
- AI: OpenAI-compatible proxy with schema validation + deterministic fallback

## Quick Start

> **For graders / first-time runners**: This project runs fully without an LLM API key — the AI fallback policy provides complete gameplay. Set `OPENAI_API_KEY` only to enable live LLM-driven decisions (optional enhancement).

```bash
npm ci
cp .env.example .env
# set OPENAI_API_KEY and optional OPENAI_MODEL / OPENAI_REQUEST_TIMEOUT_MS / AI_PROXY_PORT
```

Supported launch paths:

```bash
npm start             # same as dev:full; latest source + ai-proxy
npm run dev:full      # Vite source server + ai-proxy
npm run start:prod    # rebuild dist, then preview + ai-proxy
```

Then open <http://localhost:5173> in your browser (Vite auto-launches in most setups).

On Windows, double-click `Project Utopia.cmd` to rebuild `dist` from the source checkout and open the current app in Edge/Chrome app mode.

Validation and release commands:

```bash
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

- `dev:full`, `preview:full`, `start:prod`, and `ai-proxy` now auto-load root `.env`.
- `preview`, `preview:full`, `start:prod`, and the Windows launcher rebuild before serving `dist`, so they do not open stale generated assets.
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

## Demo Video & Post-Mortem

- **Demo Video**: pending — see [Demo-Video-Plan.md](assignments/homework7/Demo-Video-Plan.md) for the recording plan, shot list, and post-upload checklist. The video URL will replace this line once the recording is published.
- **Post-Mortem**: [assignments/homework7/Post-Mortem.md](assignments/homework7/Post-Mortem.md) — pillars overview (anchored to the A2 spec), playtest resolution table, technical post-mortem on architectural challenges and pivots from the A2 MVP, and an AI tool evaluation in the author's own voice.

## Submission / Release Flow

The authoritative submission artifact is the local production build, *for daily verification gates during development*. For HW7 final submission, see § "How to Grade This Submission" below.

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

### How to Grade This Submission

The HW7 submission can be graded against either a fresh `git clone` of the repo
or a zip of the repo root. Either way, the steps are the same:

1. `git clone <repo-url>` (or unzip the submitted archive into a clean directory)
2. `npm ci`
3. `npm run build`
4. `npx vite preview` and open the URL it prints — Vite **preview** defaults to <http://localhost:4173>; the Vite **dev server** (`npx vite` / `npm start`) instead uses <http://localhost:5173>. For grading, `vite preview` (`:4173`) serves the production build from `dist/`
5. Click _Start Colony_ and let one in-game day cycle elapse — that exercises both pillars (live map editing & reroute, plus AI-driven decisions visible in the Developer Telemetry panel)
6. For the deeper retrospective, read `assignments/homework7/Post-Mortem.md` (linked above)

No `OPENAI_API_KEY` is required — the deterministic fallback policy keeps the
simulation fully playable. Setting a key only enables live LLM decisions as an
optional enhancement.

> If submitting as zip: run `npm run build` first, then zip the repo root **excluding** `node_modules/`, `.env`, `output/`, and `dist/` is optional (a fresh `npm run build` will regenerate it). Reviewer runs `npm ci && npx vite preview` from the unzipped root.

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
