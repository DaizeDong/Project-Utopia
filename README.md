# Project Utopia — Academic Benchmark for LLM Long-Horizon Planning

A **headless, deterministic, multi-resource simulation harness** for evaluating large language models on long-horizon planning and resource-allocation tasks. The harness exposes **four LLM decision channels** that orchestrate a fixed deterministic tool surface (A\*, Boids, FSM intent applier, build planner), scored by **five academic dimension plugins** through a 4-layer metric stack (per-tick → DimensionNormalizer → MeltingPot sandwich + Crafter geometric mean → Bayesian Beta-Binomial + HELM Mean Win Rate).

> Companion docs:
> [`docs/ai-research/paper-framework.md`](docs/ai-research/paper-framework.md) (paper structure + C1-C4 claims) ·
> [`docs/ai-research/python-migration-conventions.md`](docs/ai-research/python-migration-conventions.md) (design rationale) ·
> [`docs/ai-research/design-audit-decisions.md`](docs/ai-research/design-audit-decisions.md) (RC3 audit findings)

## Why this benchmark

Existing LLM-agent benchmarks are mostly single-agent web/coding tasks (AgentBench, GAIA, WebArena, TheAgentCompany) or single-tool-choice agents (Toolformer, Gorilla, ToolLLM). Neither captures **multi-channel orchestration of a fixed tool surface under stale long-horizon context** — the failure mode of production agent systems. Project-Utopia operates the LLM strictly above a deterministic tool layer at three nested cadences (~5–90 s), with token cost decoupled from world size, schema-validated directives, and three-tier reproducibility.

Highlights:

- 4-channel `AgentAdapter` contract (any LLM via `litellm`)
- Schema-validated tool-grounded directives (pydantic v2 + idempotent Guardrails)
- Token / first-token-latency / KV-cache telemetry (S5)
- 5 dimension plugins → 19 score keys
- `scipy.stats.beta` Beta-Binomial scoring + sandwich normalization + HELM MWR
- Seeded determinism (verified bit-identical at 30 / 1800 / 7200 ticks)

## Quick start

```bash
pip install -e .[dev]
pytest tests/ -q                                 # 621 tests / ~5 s
```

### Reproducibility check

```bash
project-utopia-rng-audit                         # Asserts zero unmanaged RNG calls
project-utopia-determinism --tier 1              # Tier 1 (30 ticks, ~1 s)
project-utopia-determinism --tier 2              # Tier 2 (1800 ticks, ~2 s)
project-utopia-determinism --tier 3              # Tier 3 (7200 ticks, ~2 m)
```

Expected hashes (seed `0xC0FFEE`, scenario `temperate_plains`):
- Tier 1 → `e006ea96…`
- Tier 2 → `e99d4fcb…`
- Tier 3 → `87ecd82b…`

### Paper experiment runs

```bash
project-utopia run --experiment E1 \
  --scenarios temperate_plains,fortified_basin \
  --seeds 0xC0FFEE,0xBEEF \
  --duration-sec 30 \
  --out output/paper-py/E1.ndjson
```

Available experiments: `E1` (hierarchical vs flat baseline), `E3` (9-cell cross-vendor matrix), `E6` (schema failure profile). Output schema: one row per (experiment, cellId, scenario, seed, dim) with raw / normalized / sandwichNorm / bayesianMean / bayesianCi95.

### Optional: live LLM

Configure an LLM via `litellm` env vars (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) and wire the `LLMClient` adapter into the harness. See `project_utopia/simulation/ai/llm/llm_client.py` for the `litellm.acompletion` wrapper.

## Architecture (one screen)

```
                   ┌─────────────── 4 LLM decision channels ───────────────┐
                   │                                                       │
   environment-director ── npc-policy ── strategic-plan ── colony-agent
        (weather/        (group intent  (long-horizon    (Perceive→Plan→
         events)          weights +      goals)           Ground→Execute→
                          targets)                        Evaluate→Reflect)
                   │                                                       │
                   └────── AgentAdapter (pydantic schema + guardrails) ────┘
                                            │
                                  ┌─────────┴──────────┐
                                  │  PromptPayload      │  observation envelope
                                  │  ResponseSchema     │  pydantic v2 validate
                                  │  Guardrails         │  idempotent clamps
                                  └─────────┬──────────┘
                                            │
                                ┌───────────┴────────────┐
                                │  Deterministic tools     │
                                │  rng (PCG64)             │
                                │  Grid (96×72 uint8)      │
                                │  A* + PathCache + Faction│
                                │  Boids + SpatialHash     │
                                │  FSM intent applier      │
                                │  Build planner           │
                                └─────────────────────────┘
                                            │
                                ┌───────────┴────────────────┐
                                │  benchmark/                  │
                                │   framework/ (SimHarness,    │
                                │     ScoringEngine,           │
                                │     DimensionNormalizer,     │
                                │     SeedMatrix, PVB,         │
                                │     ProbeCollector, Tracer)  │
                                │   dimensions/ (5 plugins)    │
                                │   baselines/ (Flat / Multi / │
                                │     ScriptedOracle)          │
                                └────────────────────────────┘
```

## Layout

```
project_utopia/
├── app/                     rng (PCG64), math_utils, types, ai_runtime_stats, services, sim_clock, id, telemetry
├── world/                   grid (numpy uint8), scenarios (6 blueprints), weather, events
├── simulation/
│   ├── ai/
│   │   ├── director/        environment-director system
│   │   ├── brains/          npc-policy system
│   │   ├── strategic/       strategic-plan system + decision scheduler
│   │   ├── colony/          colony-agent system (Perceive→Plan→Ground→Execute→Evaluate→Reflect)
│   │   ├── llm/             AgentAdapter contract + 5 adapter impls + Guardrails + ResponseSchema + PromptPayload
│   │   └── memory/          MemoryStore (importance-aware eviction), MemoryObserver, WorldSummary
│   ├── navigation/          a_star, path_cache, faction, road_network, navigation_system, path_worker_pool
│   ├── movement/            boids_system, spatial_hash
│   ├── npc/                 worker_states (FSM), worker_ai_system, role_assignment_system
│   ├── economy/             resource_system, tile_state_system, logistics_system
│   ├── lifecycle/           mortality_system, tile_mutation_hooks
│   ├── meta/                colony_director_system (D5 gate), event_director_system, game_event_bus, progression_helper
│   ├── population/          population_growth_system, population_stats_system
│   ├── services/            path_fail_blacklist, reachability_cache, system_registry
│   ├── telemetry/           economy_telemetry
│   └── construction/        build_system, plan_executor, construction_system, construction_sites, build_advisor
├── entities/                entity_factory (Worker / Visitor / Animal dataclasses)
├── benchmark/
│   ├── framework/           SimHarness, SeedMatrix, ScoringEngine, DimensionNormalizer, PVB, ProbeCollector, DecisionTracer, ScenarioSampler, CrisisInjector
│   ├── dimensions/          5 plugins (RAE / GroupDynamics / MemoryDegradation / DTE / HierarchicalCoordination)
│   ├── baselines/           FlatBaselineAdapter, MultiBackendAdapter, ScriptedOraclePolicy (6 scenarios)
│   └── anchors/             AnchorInjector (E5)
├── config/                  constants (SYSTEM_ORDER), balance, ai_config, long_run_profile
├── data/prompts/            4 verbatim LLM channel prompts
├── cli/                     Typer CLI (project-utopia run)
└── tools/audit/             determinism_check, rng_coverage_report

tests/                       621 tests across 59 files, ~5 s wall (pytest)
tools/audit/                 generate_figures (matplotlib), validate_croissant, js_vs_py_correlation (historical)
metadata/                    croissant.json (NeurIPS D&B 1.0)
docs/ai-research/            paper source (LaTeX), framework, design-audit, conventions, surveys
```

## Citation

```
@misc{ProjectUtopia2026,
  title  = {Project-Utopia: A Tool-Grounded Multi-Channel Benchmark for LLM Hierarchical Decision-Making, Stale-Coherence Memory Failures, and Cross-Vendor Channel Routing},
  author = {Anonymous Authors},
  year   = {2026},
  note   = {NeurIPS 2026 Datasets and Benchmarks Track submission}
}
```

## License

Apache 2.0 / MIT. See `LICENSE`.
