# Project Utopia — Academic Benchmark for LLM Long-Horizon Planning

A **headless, deterministic, multi-resource simulation harness** for evaluating large language models on long-horizon planning and resource-allocation tasks. Forked from a real-time colony-simulation game (v0.10.0) and stripped of its rendering, audio, and player-facing surface across a 7-phase refactor (~78 k LOC removed). The remaining substrate exposes **four LLM decision channels** above an A* / Boids / seeded-RNG core, scored by **five academic dimension plugins**.

> Companion docs: [`docs/ai-research/benchmark_proposal.md`](docs/ai-research/benchmark_proposal.md) (research framing), [`docs/ai-research/refactor-plan.md`](docs/ai-research/refactor-plan.md) (cut list + phase log), [`docs/ai-research/determinism-report.md`](docs/ai-research/determinism-report.md) (S0 audit).

## Why this benchmark

Existing LLM-agent benchmarks are mostly single-agent web/coding tasks (AgentBench, GAIA, WebArena) or flat MARL grids (MeltingPot, SMAC). Neither captures the **hierarchical, low-rank, schema-validated directive surface** that real production agent systems actually emit. Project-Utopia operates the LLM strictly above a deterministic substrate at three nested cadences (~5–90 s), with token cost decoupled from world size. After the academic-benchmark refactor it adds:

- A 4-channel `AgentAdapter` plumbing seam (any local or remote LLM)
- Token / first-token-latency / KV-cache telemetry
- 5 dimension plugins (Resource-Allocation Efficiency, Group Dynamics, Memory Degradation, Decision Token Efficiency, Hierarchical Coordination)
- Bayesian Beta-Binomial scoring engine
- Seeded determinism (verified — same seed × fallback mode → identical state hash)

## Quick start

```bash
git clone https://github.com/DaizeDong/Project-Utopia.git
cd Project-Utopia
git checkout refactor/academic-benchmark      # or tag refactor/academic-benchmark-v0.11.0-rc1
npm test                                       # 684 tests / ~18 s, no deps required
```

The repo declares **zero npm dependencies** in `package.json` — Node ≥ 20 with the built-in test runner is enough.

### Reproducibility check

```bash
npm run audit:rng                              # Greps src/ for Math.random() leaks
npm run audit:determinism                      # Same seed × 60 ticks × 2 runs → equal state hash
npm run bench:dimensions                       # Runs the 5 dimension plugins on a short scenario
```

### Long-horizon paper run (deferred — see refactor-plan.md S7)

```bash
npm run bench:long:smoke                       # 90-day smoke (90 s sim time)
npm run bench:long:matrix                      # multi-seed × multi-scenario sweep
```

### Optional: live LLM through the AI proxy

```bash
cp .env.example .env                           # set OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL
npm run ai-proxy                               # node:http server on :8787, OpenAI-compatible
```

The AI proxy speaks the OpenAI completions API, so vLLM / llama.cpp-server / Ollama / TGI / Anthropic-via-bridge all work as drop-in agent backends — set `OPENAI_BASE_URL` accordingly.

## Architecture (one screen)

```
                   ┌─────────────── 4 LLM decision channels ───────────────┐
                   │                                                       │
   environment-director ── npc-policy ── strategic-plan ── colony-agent
        (weather/        (group intent  (long-horizon    (Perceive→Plan→
         events)          weights +      goals)           Ground→Execute→
                          targets)                        Evaluate→Reflect)
                   │                                                       │
                   └────────── AgentAdapter (schema + guardrails) ─────────┘
                                            │
                                  ┌─────────┴──────────┐
                                  │  PromptPayload      │  observation envelope
                                  │  ResponseSchema.js  │  contract
                                  │  Guardrails.js      │  weight clamps
                                  └─────────┬──────────┘
                                            │
                                ┌───────────┴────────────┐
                                │  Deterministic substrate │
                                │  rng.js (seeded PRNG)    │
                                │  Grid (96×72 Uint8Array) │
                                │  A* + PathCache + Faction│
                                │  BoidsSystem + Spatial   │
                                │  Worker priority FSM     │
                                └─────────────────────────┘
                                            │
                                ┌───────────┴────────────────┐
                                │  src/benchmark/            │
                                │   framework/ (Sim Harness, │
                                │     ScoringEngine,         │
                                │     ProbeCollector,        │
                                │     DecisionTracer)        │
                                │   dimensions/ (5 plugins)  │
                                └────────────────────────────┘
```

## Refactor highlights (vs upstream v0.10.0)

| Surface | Status |
|---|---|
| Three.js renderer, HUD, audio, save/load, replay, leaderboard, devmode, browser bootstrap | **Removed** (~30 k LOC, S1) |
| Pre-refactor test surface (UI, balance regressions, hotfixes, achievements) | **Removed** (~17.7 k LOC, S2; 1646 → 684 tests, 84 s → 18 s) |
| Multi-tier processing chain (meals/medicine/tools), wildlife (predators/herbivores/biomes), traders, progression/achievements | **Removed** (~13.8 k LOC, S3) |
| `balance.js` (1346 LOC) | Header-banner neutralized, values frozen to preserve test contracts |
| `AgentAdapter` 4-channel interface, token telemetry on `aiRuntimeStats` | **Added** (S5 minimal) |
| 5 dimension plugins + 8-test smoke suite | **Added** (S6 minimal) |

See `docs/ai-research/refactor-plan.md` for the complete phase log + decision matrix.

## Layout

```
src/
├── app/                 SimulationClock, rng, runOutcome, longRunTelemetry, aiRuntimeStats, warnings, math
├── benchmark/
│   ├── framework/       SimHarness, ScoringEngine (Bayesian), ProbeCollector, DecisionTracer, ScenarioSampler, CrisisInjector
│   └── dimensions/      RAE, GroupDynamics, MemoryDegradation, DTE, HierarchicalCoordination
├── config/              constants (SYSTEM_ORDER), balance.js (neutralized), aiConfig.js, longRunProfile.js
├── data/prompts/        4 LLM channel prompt files (the action-space contract)
├── entities/            EntityFactory (initial state)
├── simulation/
│   ├── ai/{brains,colony,director,strategic,memory,llm}/
│   ├── construction/    ConstructionSystem, BuildSystem, BuildAdvisor
│   ├── economy/         ResourceSystem, LogisticsSystem, WarehouseQueue, TileStateSystem
│   ├── lifecycle/       MortalitySystem, TileMutationHooks
│   ├── meta/            ColonyDirectorSystem, DevIndexSystem, GameEventBus, RaidEscalatorSystem, EventDirectorSystem
│   ├── movement/        BoidsSystem, SpatialHash
│   ├── navigation/      AStar, Navigation, PathCache, PathWorkerPool, RoadNetwork, Faction
│   ├── npc/             WorkerAISystem, VisitorAISystem, fsm/* (priority FSM)
│   ├── population/      PopulationGrowthSystem, RoleAssignmentSystem
│   ├── services/        ReachabilityCache, PathFailBlacklist
│   ├── telemetry/       EconomyTelemetry
│   └── world/           VisibilitySystem
└── world/
    ├── grid/            Grid (6 templates), pickBootSeed
    ├── scenarios/       ScenarioFactory (runtime helpers; story bundles deferred-deletable)
    ├── weather/         WeatherSystem
    └── events/          WorldEventSystem

tools/audit/             rng-coverage-report.js, determinism-check.js
scripts/                 bench-perf, logic-baseline, long-horizon-{bench,helpers,matrix}, env-loader
server/                  ai-proxy.js (OpenAI-compatible)
test/                    89 files, ~684 tests
docs/ai-research/        benchmark_proposal.md, refactor-plan.md, determinism-report.md
```

## License

See repository root.
