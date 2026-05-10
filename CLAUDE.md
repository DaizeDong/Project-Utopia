# CLAUDE.md — Project Utopia (Academic Benchmark)

## Project Overview

Academic benchmark for **LLM long-horizon planning + multi-resource allocation**. Headless deterministic harness with 4 LLM decision channels operating above an A* / Boids / seeded-RNG substrate. Forked from the v0.10.0 colony-sim game; ~78k LOC of player-facing surface (Three.js, HUD, audio, leaderboards, snapshot/replay) was stripped across S1–S6 of the academic refactor (branch `refactor/academic-benchmark`).

Tag baseline: `pre-academic-refactor-v0.10.0` (commit `16a593d`) → current branch.

Companion docs: `docs/ai-research/benchmark_proposal.md` (research framing), `docs/ai-research/refactor-plan.md` (cut-list with phase log), `docs/ai-research/determinism-report.md` (S0 audit).

## Architecture

- **4 LLM decision channels** (the action surface the paper evaluates):
  1. `environment-director` — weather / events / faction tension (`src/simulation/ai/director/`)
  2. `npc-policy` — group intent weights + target priorities (`src/simulation/ai/brains/`)
  3. `strategic-plan` — colony long-horizon goals (`src/simulation/ai/strategic/`)
  4. `colony-agent` — Perceive→Plan→Ground→Execute→Evaluate→Reflect (`src/simulation/ai/colony/`)
- **AgentAdapter contract** (`src/simulation/ai/llm/AgentAdapter.js`): pluggable 4-channel adapter; concrete impls today are `LLMClient` (OpenAI proxy) and `NoopAgentAdapter`. Future `HTTPAgentClient` + `agent-bridge.js` route to per-channel agent IDs (multi-LLM ablation).
- **Schema + Guardrails**: `ResponseSchema.js` validates LLM directives, `Guardrails.js` clamps numeric ranges (weights ∈ [0,3], risk ∈ [0,1], TTL ∈ [8h,24h]); `PromptPayload.js` is the observation envelope.
- **Determinism layer**: `src/app/rng.js` (seeded PRNG), `src/world/grid/Grid.js` (versioned tile grid), `src/simulation/navigation/{AStar, PathCache, PathWorkerPool}.js`, `src/simulation/movement/BoidsSystem.js`. `createServices(seed, { deterministic: true })` disables wall-clock budgets.
- **Memory store**: `src/simulation/ai/memory/MemoryStore.js` — 200-entry ring + `formatForPrompt(limit=30)` token-bounded serialization.
- **5 Dimension plugins** (`src/benchmark/dimensions/`): Resource-Allocation Efficiency, Group Dynamics, Memory Degradation, Decision Token Efficiency, Hierarchical Coordination. Each conforms to `DimensionPlugin.js` protocol.
- **Bayesian scoring**: `src/benchmark/framework/ScoringEngine.js` — Beta-Binomial posterior + baseline/ceiling + consistency penalty.
- **Token telemetry**: `src/app/aiRuntimeStats.js` extended with `promptTokens / completionTokens / cachedTokens / firstTokenLatencyMs / tokensPerSec / kvCacheHits / prefixHits` (S5).

## Key Directories

- `src/simulation/ai/{brains,colony,director,strategic,memory,llm}/` — 4-channel decision sites
- `src/simulation/{economy,construction,lifecycle,movement,navigation,npc,population,services,telemetry,world}/` — deterministic substrate
- `src/benchmark/framework/` — SimHarness, ScoringEngine, ProbeCollector, DecisionTracer, ScenarioSampler, CrisisInjector
- `src/benchmark/dimensions/` — 5 dimension plugins (S6)
- `src/world/{grid,scenarios,weather,events}/` — world model + 6 map templates
- `src/data/prompts/` — 4 prompt files (one per channel) — these are the LLM contract surface
- `src/config/` — `constants.js`, `balance.js` (neutralized header in S4), `aiConfig.js`
- `scripts/` — `bench-perf.mjs`, `logic-baseline.mjs`, `long-horizon-{bench,helpers,matrix}.mjs`, `env-loader.mjs`
- `tools/audit/` — `rng-coverage-report.js`, `determinism-check.js`
- `test/` — 89 test files, ~684 tests
- `docs/ai-research/` — paper proposal + refactor plan + determinism report
- `server/` — `ai-proxy.js` (Node `http` server, OpenAI-compatible)

## Refactor State

| Surface | Status |
|---|---|
| Browser shell (`src/render`, `src/ui`, `src/audio`, `src/dev`, `index.html`, `main.js`, `vite.config.js`) | **CUT** (~30k LOC) |
| `src/app/` player services (GameApp, snapshot, leaderboard, devMode, shortcut, replay, perfCap, simStepper, GameLoop, uiProfileState, controlSanitizers) | **CUT** (~5k LOC) |
| `src/simulation/economy/ProcessingSystem` (D2) | **CUT** |
| `src/simulation/ecology/`, `src/simulation/npc/AnimalAISystem` (D4) | **CUT** |
| `src/simulation/meta/ProgressionSystem` system tick (D8) | **DISABLED**; file kept as utility |
| `src/simulation/ai/colony/{SkillLibrary, LearnedSkillLibrary}` (D1) | **DEFERRED** to v0.11.1 (tag `feature/skill-library-archive` standby) |
| Map templates 6→2+1 (D9) | **DEFERRED** (Grid.js 6 generators preserved, runtime gate not yet wired) |
| `ScenarioFactory.js` story bundles (D10) | **DEFERRED** (file kept; 11 simulation modules still need its runtime helpers) |
| balance.js neutralize | **MINIMAL** (header banner; values unchanged to preserve test contracts) |
| AgentAdapter abstraction (S5) | **MINIMAL** (interface + token telemetry; ai-proxy/LLMClient slimming deferred) |
| 5 Dimension plugins (S6) | **DONE** (skeletons; advanced metrics like coalition_coupling marked deferred) |
| `runMode` gate, multi-LLM agent-bridge, long-horizon harness (S7) | **DEFERRED** |

## Development

- **Test runner**: `node --test test/*.test.js` (89 files, 684 tests, ~18s)
- **Bench scripts**: `npm run bench:perf | bench:logic | bench:long | bench:long:matrix`
- **Audit scripts**: `npm run audit:rng | audit:determinism`
- **No browser, no Vite, no Three.js** — pure ES modules on Node
- **AI proxy**: `npm run ai-proxy` boots `server/ai-proxy.js` (OpenAI-compatible)

## Conventions

- Frozen config objects (`Object.freeze`) for constants and clamp ranges
- Deterministic RNG via seeded PRNG (12 `Math.random()` leaks pre-S0; 3 retained for cleanup, see `tools/audit/rng-coverage-report.js`)
- Manhattan distance for tile adjacency
- Worker carry: `{ food, wood, stone, herbs }` (4-tuple resource space)
- Schema versioning: `SCHEMA_VERSION = "1.0"` in `AgentAdapter.js`
- Every commit pairs with `CHANGELOG.md` entry under the current refactor section

## Known Quirks (post-refactor)

- `src/config/constants.js:SYSTEM_ORDER` is the canonical tick order; comments throughout the codebase still reference deleted systems (Animal, Wildlife, Processing, Progression). Comments only — runtime is clean.
- `src/simulation/meta/ProgressionSystem.js` exists as a library (provides `isRecoveryEssential`) but is no longer ticked by SimHarness. Achievement / milestone code in the file is dead.
- `docs/superpowers/plans/` are pre-refactor plans (v0.8 – v0.10); useful as historical archive but do not describe the current academic-benchmark architecture.
- `docs/benchmarks/baseline-v0.7.0.*` is a pre-refactor balance baseline; superseded by future paper-side baselines.
