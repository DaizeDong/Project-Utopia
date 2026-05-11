# Python Migration — Shared Conventions

All subagents working on `js → python` migration MUST follow these
conventions. They are non-negotiable because they determine
cross-module interop. If a convention is ambiguous, prefer
`from __future__ import annotations` + pydantic v2 + numpy.

## Project layout

```
project_utopia/                ← installable package (src/ layout)
  __init__.py
  app/                         ← src/app/* equivalents
    __init__.py
    rng.py                     ← SeededRng on numpy.random.Generator(PCG64)
    math_utils.py              ← clamp, lerp, etc.
    types.py                   ← TypedDicts / pydantic models for common state shapes
    ai_runtime_stats.py        ← ensureAiRuntimeStats / createDefault…
    sim_clock.py               ← SimulationClock
    services.py                ← createServices(seed, *, deterministic=True)
    run_outcome.py             ← evaluateRunOutcomeState
  world/
    __init__.py
    grid.py                    ← Grid class (versioned tile grid)
    scenarios.py               ← ScenarioFactory + 6 blueprints
    weather.py
    events.py
  simulation/
    __init__.py
    ai/
      __init__.py
      llm/
        __init__.py
        agent_adapter.py       ← pydantic models; abstract base + Noop
        response_schema.py     ← pydantic models for ResponseSchema
        guardrails.py          ← guard_environment_directive, guard_group_policies
        prompt_payload.py
        llm_client.py          ← litellm wrapper
        adapter_to_llm_client.py
        layer_cast_adapter.py
        record_replay_cache.py
        http_agent_client.py
      memory/
        __init__.py
        memory_store.py        ← importance-aware ring buffer eviction
        memory_observer.py
        world_summary.py
      director/                ← environment-director channel
      brains/                  ← npc-policy channel
      strategic/               ← strategic-plan channel
      colony/                  ← colony-agent channel
    navigation/
      a_star.py                ← MinHeap + Manhattan + dynamic costs
      path_cache.py
      faction.py
      road_network.py
      navigation_system.py
    movement/
      boids_system.py
      spatial_hash.py
    npc/
      worker_states.py         ← FSM definitions
      worker_ai_system.py
      role_assignment_system.py
    population/
    economy/
    lifecycle/
    construction/
    meta/
    services/
    telemetry/
  entities/
    entity_factory.py
  benchmark/
    framework/
      sim_harness.py
      seed_matrix.py
      scoring_engine.py        ← scipy.stats.beta for Bayesian; pure-py for HELM MWR
      dimension_normalizer.py
      dimension_plugin.py
      pvb.py
      probe_collector.py
      decision_tracer.py
      scenario_sampler.py
      crisis_injector.py
      cli.py
    dimensions/
      resource_allocation_efficiency.py
      group_dynamics.py
      memory_degradation.py
      decision_token_efficiency.py
      hierarchical_coordination.py
    baselines/
      flat_baseline_adapter.py
      multi_backend_adapter.py
      scripted_oracle_policy.py
    anchors/
      anchor_injector.py
  config/
    constants.py               ← SYSTEM_ORDER, frozen dicts via MappingProxyType
    balance.py
    ai_config.py
  data/
    prompts/
      environment_director.txt ← VERBATIM port of JS prompts
      npc_policy.txt
      strategic_plan.txt
      colony_agent.txt
  cli/
    benchmark_paper.py         ← `python -m project_utopia.cli.benchmark_paper`
tests/                          ← pytest, 1-to-1 port of node:test
  test_rng.py
  test_a_star.py
  ...
tools/
  audit/
    determinism_check.py
    rng_coverage_report.py
pyproject.toml
README.md
```

## Naming

- **Files**: `snake_case.py` (was `camelCase.js` in JS).
- **Classes**: `PascalCase` (same as JS).
- **Functions / variables**: `snake_case` (was `camelCase`).
- **Constants**: `UPPER_SNAKE_CASE` (was `UPPER_SNAKE_CASE` already in JS).
- **Module-internal**: prefix with `_` (e.g. `_clamp`).

JS→Py rename map for hot identifiers:

| JS | Python |
|---|---|
| `aiRuntime` (state path) | `ai_runtime` |
| `intentWeights` | `intent_weights` |
| `targetPriorities` | `target_priorities` |
| `riskTolerance` | `risk_tolerance` |
| `ttlSec` | `ttl_sec` |
| `factionTension` | `faction_tension` |
| `eventSpawns` | `event_spawns` |
| `primaryGoal` | `primary_goal` |
| `resourceBudget` | `resource_budget` |
| `requestEnvironment` | `request_environment` |
| `state.metrics.aiRuntime` | `state.metrics["ai_runtime"]` (dict key)

Wire-format (NDJSON / JSON) field names: **keep camelCase** so existing
NDJSON consumers still work. Internal Python field names: snake_case.
Use pydantic v2 `populate_by_name=True` + `Field(alias=...)` to bridge.

## Determinism contract

Cross-language bit-identical hashes are NOT a goal. We replace the
"same SHA-256 across runs/OS" claim with a weaker but achievable
**Tier 1' contract**:
- Same seed × same scenario × same scenario-template hash →
  same trajectory under `numpy.random.Generator(np.random.PCG64(seed))`,
  bit-identical for the **logical state hash** computed from a
  sanctioned `state_to_canonical_dict()` function (the same function
  used to compute hashes from Python).
- We accept that this hash is NOT equal to the JS hash (`e360b76...`)
  because the underlying RNG (PCG64 vs mulberry32) differs.
- The JS Tier 1/2/3 hashes remain in the repo as the JS-build
  reproducibility artifact, separately documented.

Practical rules:
- Use `numpy.random.Generator(np.random.PCG64(seed))` everywhere.
  Never `random.random()` or `np.random.rand()` (legacy global RNG).
- No `dict` insertion-order reliance for hashing — sort keys.
- No `time.time()` / `time.perf_counter()` flowing into hashed state
  (gate with `if not deterministic`).
- Tier-1 audit: `python -m tools.audit.determinism_check --tier 1`
  runs the harness twice and compares the canonical state hash.

## Dependencies (pyproject.toml)

```toml
[project]
name = "project-utopia"
version = "0.11.0-py-rc1"
requires-python = ">=3.11"
dependencies = [
  "numpy>=2.0",
  "scipy>=1.13",
  "pydantic>=2.7",
  "litellm>=1.40",
  "typer>=0.12",      # CLI
  "rich>=13.7",       # CLI logs (not used in hashed paths)
  "pandas>=2.2",      # NDJSON post-processing
]

[project.optional-dependencies]
dev = [
  "pytest>=8",
  "pytest-asyncio>=0.23",
  "pytest-xdist>=3",
  "hypothesis>=6",
  "mypy>=1.10",
  "ruff>=0.5",
]

[project.scripts]
project-utopia = "project_utopia.cli.benchmark_paper:app"

[build-system]
requires = ["hatchling>=1.20"]
build-backend = "hatchling.build"
```

## Async vs sync

- `AgentAdapter.request()` is `async def` in JS; keep async in Python
  (litellm + httpx async). Tests use `pytest.mark.asyncio`.
- Simulation tick loop (SimHarness) is sync — async only at LLM-call
  boundaries.

## Validation strategy

- Replace JS hand-rolled `ResponseSchema` + `Guardrails` with:
  - Pydantic v2 `BaseModel` per channel response (validates types,
    NaN, enums)
  - Separate `guard_*` functions for *clamping* (NOT validation —
    clamping always succeeds; validation throws)
- Pydantic `model_validator` for cross-field rules
  (e.g. `event_spawns` ≤ 3, each `intensity ≥ 0.4`).

## Frozen objects

JS: `Object.freeze({...})`.
Py: prefer:
- `@dataclasses.dataclass(frozen=True, slots=True)` for value types.
- `types.MappingProxyType(dict(...))` for read-only mappings exposed
  to user code.
- Tuples for read-only sequences.

## Testing

- One pytest file per Node `test/*.test.js` file. Same test name
  where reasonable (`test_seed_matrix_aiRuntime_passthrough.py`).
- 1 test class per JS `describe` block.
- Asserts via `assert` (not unittest).
- Use `hypothesis` for property tests where the JS version was
  parametric.

## Numerical methods replacements

| JS (hand-rolled) | Python |
|---|---|
| `lnGamma` (Lanczos) | `scipy.special.gammaln` |
| `betaIncomplete` | `scipy.special.betainc` |
| `betaQuantile` (Newton-Raphson) | `scipy.stats.beta.ppf` |
| `bayesianScore` (Beta(2,2) posterior) | `scipy.stats.beta` + manual α/β |
| `helmMwr` | pure-python (already simple) |
| `geometricMean` | `scipy.stats.gmean` |
| `cohenD` | pure-python |
| `bayesFactor` | pure-python (Beta ratio) |

Numerical results MUST match JS to ≥ 4 decimal places on the
existing test fixtures.

## Skipping out-of-scope work

- Do NOT migrate `src/render/`, `src/audio/`, `src/dev/`, `src/ui/`
  — these are already cut from the academic-benchmark branch.
- Do NOT migrate `src/simulation/meta/ProgressionSystem.js` — it is
  dead code (only `isRecoveryEssential` is live; port that one
  function only).
- Do NOT migrate `src/simulation/economy/WarehouseQueueSystem.js`
  — also dead.
- Skip `src/world/biome*.js` legacy generators if any.

## Commit policy

Each subagent commits its own scope:
- Branch: `python-migration` (one shared branch — coordinate
  through git rebase after merge points).
- One commit per logical module: `feat(py): port world/grid (≈600 LOC)`.
- After Phase 1 merge, dispatch Phase 2.
