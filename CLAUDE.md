# CLAUDE.md — Project Utopia (Academic Benchmark)

## Project Overview

Academic benchmark for **LLM long-horizon planning + multi-resource allocation**. Pure-Python deterministic harness with 4 LLM decision channels operating against a fixed tool surface (A* / Boids / seeded-RNG / build planner). Originally forked from a v0.10.0 colony-sim JS game; the Node.js implementation was removed in Phase 4 (2026-05-10) after the Python port reached parity. The repo is now **Python-only**.

Tag baseline: `refactor/academic-benchmark-py-rc1` (post-merge, main branch).

Companion docs:
- `docs/ai-research/benchmark_proposal.md` — research framing
- `docs/ai-research/paper-framework.md` — paper structure + C1-C4 claims
- `docs/ai-research/python-migration-conventions.md` — design rationale for the Python port
- `docs/ai-research/design-audit-decisions.md` — RC3 audit findings
- `docs/ai-research/js-vs-py-validation.md` — historical JS↔Py cross-validation report

## Architecture

- **4 LLM decision channels** (the action surface the paper evaluates):
  1. `environment-director` — weather / events / faction tension (`project_utopia/simulation/ai/director/`)
  2. `npc-policy` — group intent weights + target priorities (`project_utopia/simulation/ai/brains/`)
  3. `strategic-plan` — colony long-horizon goals (`project_utopia/simulation/ai/strategic/`)
  4. `colony-agent` — Perceive→Plan→Ground→Execute→Evaluate→Reflect (`project_utopia/simulation/ai/colony/`)
- **AgentAdapter contract** (`project_utopia/simulation/ai/llm/agent_adapter.py`): abstract async base; concrete impls: `NoopAgentAdapter`, `LLMClient` (litellm-backed), `HTTPAgentClient`, `LayerCastAdapter`, `RecordReplayCache`, `ScriptedOraclePolicy`.
- **Schema + Guardrails**: pydantic v2 models per channel (`response_schema.py`) validate LLM directives, NaN-reject, enum-allowlist; `guardrails.py` clamps numeric ranges (weights ∈ [0,3], risk ∈ [0,1], TTL ∈ [8h,24h]); idempotent fixed-point verified by tests. `prompt_payload.py` is the observation envelope.
- **Determinism layer**: `project_utopia/app/rng.py` (numpy.random.Generator(PCG64) + blake2b-derived sub-seeds), `project_utopia/world/grid.py` (numpy uint8 versioned tile grid), `project_utopia/simulation/navigation/{a_star, path_cache, path_worker_pool}.py`, `project_utopia/simulation/movement/boids_system.py`. `create_services(seed, deterministic=True)` disables wall-clock budgets.
- **Memory store**: `project_utopia/simulation/ai/memory/memory_store.py` — 200-entry ring + importance-aware eviction (RC3 W2 round-2 fix) + `format_for_prompt(limit=30)` token-bounded serialization.
- **5 Dimension plugins** (`project_utopia/benchmark/dimensions/`): Resource-Allocation Efficiency, Group Dynamics, Memory Degradation, Decision Token Efficiency, Hierarchical Coordination. Each conforms to `DimensionPlugin` abstract base. Re-exported as `ACADEMIC_BENCHMARK_DIMENSIONS` tuple for SeedMatrix auto-discovery.
- **Bayesian scoring**: `project_utopia/benchmark/framework/scoring_engine.py` — `scipy.stats.beta` Beta-Binomial posterior + sandwich normalization (MeltingPot) + Crafter geometric mean + HELM MWR + PolicyValueBaseline (Pluribus AIVAT-style).
- **Token telemetry**: `project_utopia/app/ai_runtime_stats.py` — 31 fields including `promptTokens / completionTokens / cachedTokens / firstTokenLatencyMs / tokensPerSec / kvCacheHits / prefixHits` (S5). Wire format is camelCase for NDJSON; internal Python access uses snake_case via pydantic aliases.

## Key Directories

- `project_utopia/simulation/ai/{brains,colony,director,strategic,memory,llm}/` — 4-channel decision sites + memory
- `project_utopia/simulation/{economy,construction,lifecycle,movement,navigation,npc,population,services,telemetry,meta}/` — deterministic substrate
- `project_utopia/benchmark/framework/` — SimHarness, SeedMatrix, ScoringEngine, DimensionNormalizer, PVB, ProbeCollector, DecisionTracer, ScenarioSampler, CrisisInjector
- `project_utopia/benchmark/dimensions/` — 5 dimension plugins
- `project_utopia/benchmark/baselines/` — FlatBaselineAdapter, MultiBackendAdapter, ScriptedOraclePolicy (6 scenarios)
- `project_utopia/benchmark/anchors/` — AnchorInjector (E5)
- `project_utopia/world/{grid,scenarios,weather,events}.py` — world model + 6 scenario blueprints
- `project_utopia/data/prompts/` — 4 prompt files (one per channel) — verbatim LLM contract surface
- `project_utopia/config/` — `constants.py`, `balance.py`, `ai_config.py`, `long_run_profile.py`
- `project_utopia/cli/benchmark_paper.py` — Typer CLI driver (`project-utopia run --experiment E1 ...`)
- `project_utopia/tools/audit/` — `determinism_check.py`, `rng_coverage_report.py`
- `tests/` — 621 tests across 59 files, ~5s wall (pytest)
- `tools/audit/` — non-Python audit helpers: `js_vs_py_correlation.py` (historical), `generate_figures.py`, `validate_croissant.py`
- `metadata/croissant.json` — Croissant 1.0 JSON-LD metadata (NeurIPS D&B requirement)
- `docs/ai-research/` — paper proposal + framework + experimental design + literature surveys
- `docs/ai-research/paper/` — LaTeX paper source (30 pages, anonymized for D&B)

## State (Phase 4 — Python-only, 2026-05-10)

| Surface | Status |
|---|---|
| Node.js implementation (`src/`, `server/`, `scripts/`, `test/`, `package.json`) | **REMOVED** (Phase 4) |
| Python port (`project_utopia/`) | **DONE** — 128 .py files, 621 tests passing |
| 4 LLM channels | **DONE** |
| AgentAdapter contract + 5 concrete adapters | **DONE** |
| Schema (pydantic) + Guardrails (idempotent) | **DONE** |
| MemoryStore + importance-aware eviction | **DONE** |
| 5 Dimension plugins (S6) | **DONE** — all 19 dim keys registered in DIMENSION_NORMALIZERS |
| ScoringEngine (Bayes + sandwich + HELM MWR + PVB) | **DONE** (numerical match vs reference ≥ 4 dp) |
| 6 ScriptedOraclePolicy scenarios | **DONE** — all idempotent through Guardrails |
| `runMode` gate (D5) | **DONE** — ColonyDirectorSystem skips when `state.ai.run_mode == "llm"` |
| Paper run entrypoint | **DONE** — `project-utopia run --experiment E1 ...` |
| 3-tier determinism | **DONE** — Tier 1 `e006ea96` / Tier 2 `e99d4fcb` / Tier 3 `87ecd82b` (bit-identical 2 runs) |
| Datasheet for Datasets (A4) | **DONE** (NeurIPS D&B requirement) |
| Croissant 1.0 metadata | **DONE** (`metadata/croissant.json` + validator) |
| Author anonymization for D&B blind review | **DONE** |
| Paper figures (5 PDFs from NDJSON) | **DONE** (fallback-only data; camera-ready will use real LLM) |
| Full SimHarness wiring economy/lifecycle/construction systems | **STUB** — minimal food-decay only; Phase 5 wires real systems |
| Cross-OS Python Tier 1 verification | **PENDING** — only Windows currently tested |
| Real LLM data for §5 figures | **PENDING** — no LLM proxy reachable at submission time |

## Development

- **Install**: `pip install -e .[dev]`
- **Test runner**: `pytest tests/ -q` (59 files, 621 tests, ~5s)
- **CLI**: `project-utopia run --experiment {E1,E3,E6} --scenarios temperate_plains,fortified_basin --seeds 0xC0FFEE,0xBEEF --duration-sec 30 --out output/paper-py/E1.ndjson`
- **Determinism audit**: `python -m project_utopia.tools.audit.determinism_check --tier {1,2,3}` or console script `project-utopia-determinism --tier 1`
- **RNG audit**: `python -m project_utopia.tools.audit.rng_coverage_report` or `project-utopia-rng-audit`
- **Croissant validation**: `python tools/audit/validate_croissant.py`
- **Figure regeneration**: `python tools/audit/generate_figures.py`
- **Paper PDF rebuild**: `cd docs/ai-research/paper && latexmk -pdf -interaction=nonstopmode main.tex`

## Conventions

- Python ≥ 3.11. Type annotations everywhere; `from __future__ import annotations` at the top of every module.
- Pydantic v2 for response schemas with `populate_by_name=True` + `Field(alias=...)` so NDJSON wire format stays camelCase while Python internal access stays snake_case.
- `numpy.random.Generator(PCG64)` for ALL RNG. No `random.random()` or `np.random.rand()` legacy global RNG.
- Frozen config: `dataclass(frozen=True, slots=True)` for value types; `types.MappingProxyType` for read-only mappings.
- Sorted dict iteration where order matters for hash/state.
- Manhattan distance for tile adjacency.
- Worker carry: `{ food, wood, stone, herbs }` (4-tuple resource space).
- Schema versioning: `SCHEMA_VERSION = "1.0"` in `agent_adapter.py`.
- Every commit pairs with a `CHANGELOG.md` entry under the current phase section.

## Known Quirks

- `project_utopia/benchmark/framework/sim_harness.py` has a minimal food-decay stub instead of running the full economy/lifecycle systems. Phase 5 wires the real `ResourceSystem` + `MortalitySystem` (already ported in `project_utopia/simulation/economy/`, `lifecycle/`); meanwhile, DTE / RAE produce ~−0.01 fallback values (vs real-LLM −0.03 range). Documented in code comments.
- `project_utopia/simulation/meta/progression_helper.py` — only `is_recovery_essential` is live; the JS-side `ProgressionSystem.js` (920 LOC) was dropped during the port.
- `tools/audit/js_vs_py_correlation.py` is historical — kept as evidence of the JS↔Py parity validation done before the JS removal. The `output/paper/*.ndjson` JS fixtures are gitignored; regenerate is no longer possible since the JS implementation is gone.
- `assignments/final-crit/` is a course-assignment slide deck unrelated to the benchmark.
