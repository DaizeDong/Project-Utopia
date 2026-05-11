# Changelog

> Pre-Python-era entries (v0.7 – v0.10, JS source) are archived in
> [`docs/_archive/CHANGELOG-pre-python.md`](docs/_archive/CHANGELOG-pre-python.md).
> This file tracks Python-era and academic-benchmark refactor entries only.


## [Unreleased] — refactor/academic-benchmark — Round 5 simplification

### Round 5 simplification (2026-05-10)

**Audit-first round.** Performed an end-to-end audit of the animal / visitor / event subsystems (Cuts 1–3) before touching code. Audit findings:

- **Cut 1 (animals) — AUDITED, NOT CUT.** `create_predator` / `create_herbivore` / `Animal` dataclass have **zero production callers** — SimHarness, ScenarioFactory and all 4 LLM channel systems never construct animals. `state["animals"]` is always an empty list at runtime. However, the IDs `HERBIVORE` / `PREDATOR` are emitted by `ScriptedOraclePolicy` (rugged_highlands → `EVENT_TYPE["ANIMAL_MIGRATION"]`), read by `GroupDynamicsPlugin.HOSTILE_GROUPS = {"predators", "saboteurs"}`, and validated by `response_schema.EVENT_TYPE_VALUES`. The **substrate is dead but the LLM contract surface is alive** — the paper benchmark depends on these IDs round-tripping through guardrails + dimensions. Deleting the dataclasses would break ~6 isolated tests for no runtime benefit. Verdict: **SEMI-ALIVE — keep as-is** to preserve the paper's contract artifact.
- **Cut 2 (events) — AUDITED, NOT CUT.** `BANDIT_RAID`, `ANIMAL_MIGRATION`, `TRADE_CARAVAN` are emitted by oracle blueprints (`fortified_basin` raid, `rugged_highlands` migration) and locked in `response_schema.EVENT_TYPE_VALUES`. `WorldEventSystem` is not ticked by SimHarness but has 16 stand-alone tests asserting its behaviour. Verdict: **ALIVE at the schema/contract layer — keep as-is.**
- **Cut 3 (visitors) — AUDITED, NOT CUT.** Same pattern as Cut 1: `create_trader` / `create_saboteur` / `Visitor` only constructed by tests, but `SABOTEUR` is emitted as `GROUP_IDS["SABOTEURS"]` in the `fortified_basin` policy blueprint and HOSTILE_GROUPS counts saboteurs in `faction_responsiveness`. Verdict: **SEMI-ALIVE — keep as-is.**
- **Cut 4 — dead `_ = is_recovery_essential` line removed.** In `project_utopia/simulation/lifecycle/mortality_system.py`, the trailing `_ = is_recovery_essential` no-op (and its 4-line explanatory comment) plus the `is_recovery_essential` import were deleted. The import was an artefact of an earlier migration brief ("touch a no-op reference so the import is preserved"). `MortalitySystem` never used the symbol. `ColonyDirectorSystem` remains the sole live caller of `is_recovery_essential` (`colony_director_system.py:123` — filters `needs` to `RECOVERY_ESSENTIAL_TYPES = {farm, lumber, warehouse, road}`). Round 4's audit conclusion was incomplete; the no-op was redundant, not load-bearing.
- **Cut 5 — `CHANGELOG.md` split.** Pre-Python-era content (v0.7 – v0.10, lines 210–7095 of the pre-Round-5 file) moved to `docs/_archive/CHANGELOG-pre-python.md` (~6886 lines preserved). New root `CHANGELOG.md` retains the Python-era + academic-benchmark refactor section only (~210 lines including this entry) plus an archive pointer at the top.

### Verified
- `pytest tests/ -q` — **615 pass / 0 fail** (unchanged from Round 4).
- `python -m project_utopia.tools.audit.determinism_check --tier 1 --ticks 30 --seed 0xC0FFEE` — Tier 1 hash `be19781c…` PASS (unchanged).
- `python -m project_utopia.cli.benchmark_paper run --experiment E1 --scenarios temperate_plains --seeds 0xC0FFEE --cells FB --duration-sec 5 --out /tmp/r5-smoke.ndjson` — clean run, NDJSON written.
- No paper updates needed — all documented hashes preserved.

### Fixed-point declaration
With Cuts 1–3 audited and rejected on substantive grounds (live LLM contract surface), and Cuts 4–5 reduced to a one-line cleanup + a doc split, **the academic-benchmark refactor has reached a structural fixed point**. Further simplification rounds cannot meaningfully shrink the surface without breaking the paper contract or the benchmark's regression coverage. See the agent's audit report for the per-subsystem alive/dead verdicts.


## [Unreleased] — refactor/academic-benchmark — Round 4 simplification

### Round 4 simplification (2026-05-10)
- **Cut 1 — `BUILD_COST_ESCALATOR` deleted**: removed the 5-building escalator mirror (warehouse/wall/farm/lumber/quarry × softTarget/perExtra/cap/perExtraBeyondCap) plus the `_esc` helper from `project_utopia/config/balance.py` (+ `__all__` entry). Audit showed zero readers in `project_utopia/` or `tests/`; only `CHANGELOG.md` historical mentions and the doc itself. Pure doc-mirror with no runtime path.
- **Cut 2 — `CONSTRUCTION_BALANCE` deleted**: removed the whole 4-key dict (`salvageRefundRatio`, `worksiteAccessRadius`, `warehouseRoadRadius`, `warehouseSpacingRadius`) from `project_utopia/config/balance.py` (+ `__all__` entry). Zero non-doc readers; the corresponding runtime logic in `simulation/construction/*` uses inline literals or doesn't exist in the Python port.
- **Cut 3 — `WORKER_DEFAULTS` deleted**: removed the 4-key default mapping (`carryCapacity`, `moveSpeed`, `hungerStart`, `maxHp`) from `project_utopia/config/constants.py` (+ `__all__` entry). Audit confirmed `EntityFactory.create_worker` does not read it — `Worker` dataclass uses inline field defaults (`max_hp: float = 100.0`, etc.). The single test reference (parametrize case in `tests/config/test_constants.py::TestEnumTables::test_is_mapping_proxy`) was dropped (615 tests; was 616).
- **Cut 4 — local `SYSTEM_ORDER` in `sim_harness.py` deleted**: the 16-string documentation-only tuple (divergent from the canonical 13-entry tuple in `project_utopia/config/constants.py`) was removed along with the `SYSTEM_ORDER` re-export from `project_utopia/benchmark/framework/__init__.py` and the entry in `sim_harness.__all__`. SimHarness wires systems through `SystemRegistry`, not by reading the tuple. No tests imported `SYSTEM_ORDER` from `benchmark.framework`.
- **Cut 5 — docs archive**: moved `docs/superpowers/plans/2026-04-30-fsm-rewrite-retrospective.md` and `docs/superpowers/plans/2026-04-30-worker-fsm-rewrite-plan.md` to `docs/_archive/superpowers/` (preserving history via `git mv`). Both are v0.10 JS-era FSM rewrite plans referring to `src/...` paths that no longer exist; they retain historical value but are not part of the Python architecture. The now-empty `docs/superpowers/plans/` + `docs/superpowers/` directories were removed. `docs/benchmarks/` does not exist in this tree (CLAUDE.md note was stale).
- **Cut 6 — `progression_helper.py` audit (no change)**: confirmed `is_recovery_essential` has 2 live callers (`simulation/meta/colony_director_system.py:123`, `simulation/lifecycle/mortality_system.py:188`). File retained as-is.
- **Cut 7 — `docs/systems/` audit (no change)**: all 6 system docs mix references to live systems (Worker FSM, economy, grid, mortality, boids, logistics) with deleted ones (Visibility, Wildlife, Processing, Progression). Per scope: leave alone — semantic cleanup of intra-doc references is out of round 4.
- **Cut 8 — LLM prompts final scan (no change)**: re-ran the regex hunt for removed enum/state/role/tile names across `project_utopia/data/prompts/*.txt`. Only matches were `IDLE` (still a live `WorkerState`), `HAUL` (still a live ROLE), `STONE/FARM/WOOD/GUARD/BUILD` (live ROLE set), and `construction`/`extraction` (legitimate strategy vocabulary). No residue.

### Verified
- `pytest tests/ -q` — **615 pass / 0 fail** (was 616; one parametrized `WORKER_DEFAULTS` case removed per Cut 3).
- `python -m project_utopia.tools.audit.determinism_check --tier 1 --ticks 30 --seed 0xC0FFEE` — Tier 1 hash `be19781c…` PASS (unchanged).
- Default-ticks tiers: Tier 1 `4f5d4d22…`, Tier 2 `f7a099a4…`, Tier 3 `43cb6aec…` — all PASS, all bit-identical to pre-Round-4 baseline.
- `python -m project_utopia.cli.benchmark_paper run --experiment E1 --scenarios temperate_plains --seeds 0xC0FFEE --cells FB --duration-sec 5 --out /tmp/r4-smoke.ndjson` — clean run, NDJSON written.
- No paper updates needed — all documented hashes preserved.

## [Unreleased] — refactor/academic-benchmark — Round 3 simplification

### Round 3 simplification (2026-05-10)
- **Cut 1 — `FOG_STATE` deleted**: dropped the `HIDDEN/EXPLORED/VISIBLE` mapping from `project_utopia/config/constants.py` (+ `__all__` entry, + parametrize case in `tests/config/test_constants.py`). `VisibilitySystem` was already removed in Round 2, leaving the enum with zero live consumers.
- **Cut 2 — `POLICY_TEXT_LIMITS` deleted**: removed the redundant `summary/focus/note/maxNotes` mapping from `project_utopia/config/ai_config.py`. The four limits live as plain Python constants in `simulation/ai/llm/guardrails.py` (`MAX_SUMMARY_LEN=140`, `MAX_FOCUS_LEN=72`, `MAX_NOTE_LEN=120`, `MAX_STEERING_NOTES=4`); zero readers depended on the mapping form.
- **Cut 3 — `balance.BUILD_COST` deleted**: removed the divergent mirror from `project_utopia/config/balance.py` (+ `__all__` entry). The canonical per-tool table lives in `simulation/construction/build_advisor.py`. The dead `_ = BUILD_COST` suppress-unused-import line + the import itself were also dropped from `build_system.py`. Test `tests/config/test_constants.py::TestBalance::test_imports_cleanly` updated to drop the now-stale `isinstance(B.BUILD_COST, …)` assert.
- **Cut 4 — `SYSTEM_ORDER` placeholder-only systems**: dropped 5 string-only entries with no Python implementation from `project_utopia/config/constants.py`: `DevIndexSystem`, `RaidEscalatorSystem`, `AgentDirectorSystem`, `NPCBrainSystem`, `VisitorAISystem`. The 13 entries that remain all have backing classes (`SimulationClock`, `EventDirectorSystem`, `RoleAssignmentSystem`, `PopulationGrowthSystem`, `EnvironmentDirectorSystem`, `WeatherSystem`, `WorldEventSystem`, `TileStateSystem`, `WorkerAISystem`, `ConstructionSystem`, `MortalitySystem`, `BoidsSystem`, `ResourceSystem`). The `removed` set in `test_no_removed_systems` was extended to cover the 5 dropped names. Audit finding: `constants.SYSTEM_ORDER` is documentation-only — nothing iterates it; the runtime path uses `SystemRegistry` registration order through `SimHarness._build_default_systems`. The local `SYSTEM_ORDER` in `sim_harness.py` is also documentary and was left untouched (it gates nothing).
- **Cut 5 — `AI_CONFIG` + `STRATEGY_CONFIG` deleted**: every field in both mappings had zero readers in `project_utopia/` and `tests/`. `AI_CONFIG` (10 fields: `environmentEndpoint`, `policyEndpoint`, `planEndpoint`, `requestTimeoutMs`, `maxDirectiveDurationSec`, `maxPolicyTtlSec`, `minDecisionIntervalSec`, `enableByDefault`, `retryAfterFailureSec`, `maxLLMCallsPerHour`) and `STRATEGY_CONFIG` (4 fields: `heartbeatSec`, `cooldownSec`, `maxObservations`, `maxReflections`) both removed wholesale from `project_utopia/config/ai_config.py` (+ `__all__` entries, + module docstring updated). The clamp values those configs were meant to gate already live in `simulation/ai/llm/guardrails.py` as plain Python constants (e.g. `MAX_DIRECTIVE_DURATION_SEC`, `MAX_POLICY_TTL_SEC`). Test `tests/config/test_constants.py::TestAiConfig::test_imports_cleanly` updated to drop the `isinstance(AC.AI_CONFIG, …)` assert.

### Verified
- `pytest tests/ -q` — **616 pass / 0 fail** (was 617; one parametrized `FOG_STATE` case removed).
- `python -m project_utopia.tools.audit.determinism_check --tier 1 --ticks 30 --seed 0xC0FFEE` — Tier 1 hash `be19781c…` PASS (unchanged).
- Default-ticks tiers: Tier 1 `4f5d4d22…`, Tier 2 `f7a099a4…`, Tier 3 `43cb6aec…` — all PASS, all bit-identical to pre-Round-3 baseline.
- No paper updates needed — all documented hashes preserved.

## [Unreleased] — refactor/academic-benchmark — Round 2 simplification

### Round 2 simplification (2026-05-10)
- **Cut 1 — `POLICY_INTENT_TO_STATE` 13 → 6**: dropped aliases `idle, seek_rest, guard_engage, gather, haul, seek_construct, construct` in `project_utopia/simulation/npc/worker_states.py`. Canonical 6 intents retained: `wander, rest, fight, harvest, deliver, build`. `npc_policy.txt` prompt vocabulary updated. Guardrails verified dynamic (no hardcoded alias list).
- **Cut 2 — `ANIMAL_SPECIES` deleted**: removed the `DEER/WOLF/BEAR` mapping from `project_utopia/config/constants.py` (zero users — the Python EntityFactory never ported it; only the test parametrize-table referenced it).
- **Cut 3 — `WarehouseQueueSystem` removed**: dropped from `SYSTEM_ORDER` in `project_utopia/config/constants.py` and from the placeholder list in `project_utopia/benchmark/framework/sim_harness.py`. Stale comment in `simulation/economy/__init__.py` cleaned up.
- **Cut 4 — `LEGACY_GROUP_IDS` deleted**: removed the `VISITORS:"visitors"` mapping and the corresponding `LEGACY_GROUP_IDS["VISITORS"]` contract from `GROUP_POLICY_CONTRACTS` in `project_utopia/config/ai_config.py`. `canonicalize_ai_group_id` no longer recognises `"visitor(s)"` (specific TRADERS / SABOTEURS contracts cover the use case).
- **Cut 5 — `BUILD_COST["erase"]` deleted**: removed the no-op `{"wood": 0}` entry from `project_utopia/config/balance.py`. Erase logic in `build_advisor.py` / `build_system.py` already uses an inline `{"wood": 1.0}` and never reads `BUILD_COST["erase"]`.
- **Cut 6 — `VisibilitySystem` removed**: audit confirmed it was a string-only placeholder in `SYSTEM_ORDER` with no Python implementation, no consumers, no tests. Dropped from `SYSTEM_ORDER` in `project_utopia/config/constants.py`. `FOG_STATE` enum retained (not in cut list).

### Verified
- `pytest tests/ -q` — **617 pass / 0 fail** (was 618; one parametrized `ANIMAL_SPECIES` case removed).
- `python -m project_utopia.tools.audit.determinism_check --tier 1 --ticks 30 --seed 0xC0FFEE` — Tier 1 hash `be19781c…` PASS (unchanged).
- Tier 2 hash `f7a099a4…` PASS (unchanged).
- Tier 3 hash `43cb6aec…` PASS (unchanged).
- No paper updates needed — all three documented Python tier hashes preserved bit-identically.

## [Unreleased prior] — refactor/academic-benchmark — RC3 design audit

### Audit-driven P0 fixes (2026-05-10)
- **B1 critical bug**: `SeedMatrix.js:124` was reading `state?.ai?.runtime` (path doesn't exist). All DTE/E6 cells were silently returning 0 for aiRuntime telemetry. Fixed to read `state.metrics.aiRuntime`, remap field names (`requestCount→totalCalls`, `fallbackResponseCount→fallbackCalls`, `errorCount→schemaErrors`), and pass through 7 S5 token-telemetry fields. New test: `test/seed-matrix-aiRuntime-passthrough.test.js`.
- **G1 D5 runMode gate**: ColonyDirectorSystem was ticking even with LLM in the loop, polluting E1/E3 ablations. Added `state.ai.runMode = "fallback" | "llm"`, SimHarness option `runMode`, gate at top of update(). New test: `test/run-mode-gate.test.js` (8 cases). Default behavior preserved.
- **G2 HELM Mean Win Rate**: paper §4.4b had no implementation. Added `ScoringEngine.computeHelmMwr(perAgentDimensionScores)` with strict-`>` ties + per-pair joint-dim handling. New test: `test/scoring-engine-helm-mwr.test.js` (7 cases).
- **G3 dimension wiring**: 4 of 5 placeholder dimension keys now compute from existing telemetry — `coalition_coupling` (Pearson over targetPriorities), `state_target_obedience` (pooled Σ in-target / Σ all), `faction_responsiveness` (Pearson factionTension vs hostile-group count), `plan_policy_alignment` (token overlap strategic plan ↔ workers directive). `rae_path_overhead` deferred (T1 — needs PathCache instrumentation).
- **B2-B8 nondeterminism**: 7 `Math.random()` fallback paths replaced with constant `0.5` or seeded RNG; `navigator.hardwareConcurrency` short-circuited in deterministic mode. `npm run audit:rng` now clean. Tier 1/2 hashes preserved bit-identically.

### Decisions documented
- New: `docs/ai-research/design-audit-decisions.md` — Round 1+2+3 findings consolidated, KEEP/REMOVE/REFACTOR markings, follow-up tickets T1-T7.
- CLAUDE.md "Refactor State" table updated: D5 runMode gate `DEFERRED → DONE`.

### Verified
- `node --test test/*.test.js` — **815 pass / 0 fail / 1 skipped** (no regressions; 7 new test cases added)
- `npm run audit:determinism` — Tier 1 `e360b76…` PASS, Tier 2 `473d1b9…` PASS (bit-identical to RC2)
- `npm run audit:rng` — OK, no leaks

## [Unreleased prior] — refactor/academic-benchmark — W2 batch X (V3.1 + V6.1)

### V3.1 — DimensionNormalizer transform layer
- Why: Round-1 reviewer flagged that the 5 dimension plugins (RAE / GroupDynamics / Memory / DTE / Hierarchical) emit on incompatible scales — some [0,1] benefit-form, some cost-form, some symmetric in [-1,1], some unbounded ms / token-rates. ScoringEngine.bayesianScore + sandwichNormalize + HELM MWR all assume comparable [0,1] benefit-form inputs. Without a transform layer, raw scores were silently fed to scoring → garbage out.
- New file: `src/benchmark/framework/DimensionNormalizer.js` (~245 LOC)
  - `DIMENSION_NORMALIZERS` — frozen registry covering all 19 dim keys emitted by the 5 plugins (verified by reflective test against `ACADEMIC_BENCHMARK_DIMENSIONS`)
  - 6 transforms: identity / invert / reciprocal / clipScale / rescaleSymmetric / exponentialDecay (with `fromZero` flag for benefit-form unbounded)
  - `normalizeDimension(dimKey, value)` — single-key normalisation; NaN/Infinity → 0 with warn; unknown key → NaN with warn
  - `normalizeRow(scores)` — bulk; preserves unknown keys verbatim (no row-shape corruption)
  - `gatherDimensionAcrossCells(cells, dimKey)` — pulls (seed,scenario,value) triples from SeedMatrix cells
  - `buildSandwichTriple(agentCells, fallbackCells, oracleCells, dimKey)` — paired-by-(seed,scenario) alignment for sandwichNormalize; throws on misalignment instead of silent garbage
- New test `test/benchmark-dimension-normalizer.test.js` (~190 LOC, 14 cases) — every transform branch + NaN/Infinity + unknown-key + reflective coverage check + buildSandwichTriple alignment + misalignment-throws.

### V6.1 — paper-run entrypoint
- Why: paper-framework.md lists 13 figures + 3 tables but had no script to drive the NDJSON pipeline. E1/E3/E5/E6 had no driver — the figures were aspirational only.
- New file: `scripts/benchmark-paper.mjs` (~290 LOC) — CLI driver
  - 3 experiment presets: `E1` (hierarchical vs flat), `E3` (9-cell cross-vendor), `E6` (schema failure)
  - Wires fallback (NoopAgentAdapter) + oracle (ScriptedOraclePolicy) reference cells + per-cell agent cells
  - Per-dim normalize + sandwichNormalize + bayesianScore → emits one NDJSON row per (cellId, scenario, seed, dim)
  - `parseDriverArgs` (uses `node:util.parseArgs`) supports custom seeds (decimal / 0x-hex), scenarios, cells, duration, output path, concurrency
  - Validates cell labels against `DEFAULT_AGENT_ROUTING` so typos fail fast
- New file: `src/benchmark/baselines/MultiBackendAdapter.js` (~95 LOC) — cross-vendor channel router; wraps `Map<channel, AgentAdapter>` so a SeedMatrix sees one adapter while requests dispatch by channel string. Tags response.debug.multiBackend with sub-adapter name; never throws on unknown channel (returns synthetic fallback DecisionResponse + bumps `unknownChannelCount`).
- New test `test/benchmark-paper-driver.test.js` (~115 LOC, 7 cases) — parseSeedToken / parseDriverArgs (defaults, custom, validation, unknown-cell rejection) + buildAgentConfigForCell + E1 smoke run on FB cell × 1 seed × 1 scenario × 4-sec duration verifying every registered dim emits a row, NDJSON round-trip works, all rows have `experiment / cellId / scenario / seed / dim / raw / normalized / sandwichNorm / bayesianMean / bayesianCi95 / agentId`.
- New `package.json` scripts: `bench:paper` (generic) + `bench:paper:E1` (smoke).

### Verified
- `node --test test/benchmark-dimension-normalizer.test.js test/benchmark-paper-driver.test.js` — **21/21 pass** (smoke run ~27 s)
- `node --test test/benchmark-flat-baseline.test.js test/benchmark-seed-matrix.test.js test/benchmark-dimensions.test.js test/benchmark-dimension-normalizer.test.js` — **31/31 pass** (no regression)

### LOC delta
- New: 245 (DimensionNormalizer) + 95 (MultiBackendAdapter) + 290 (benchmark-paper.mjs) + 190 + 115 (2 tests) = **935 LOC across 5 new files**
- Modified: 2 lines in `package.json` (added `bench:paper` + `bench:paper:E1` scripts).

### Surprises / notes
- Plugin dim-key audit confirmed every key matches its source-of-truth string in the plugin files exactly (no aliasing): RAE emits `rae_composite / rae_sufficiency / rae_distribution_gini / rae_idle_capacity / rae_path_overhead`, GroupDynamics emits `intent_entropy / coalition_coupling / state_target_obedience / faction_responsiveness`, Memory emits `anchored_fact_recall / action_grounded_recall / behavioral_drift / performance_at_t`, DTE emits `dte_per_completion_token / dte_per_decision / first_token_latency_p50`, Hierarchical emits `plan_policy_alignment / env_threat_responsiveness / colony_cadence_health`. The reflective coverage test in the normalizer suite locks this against future drift.
- `intent_entropy` cap chosen as `log2(20) ≈ 4.32` rather than the strict `log2(5) ≈ 2.32` from the canonical 5-intent set, because plugins commonly broaden to ≥10 intents in practice (see ScriptedOraclePolicy's WORKERS policy with 10+ intent weights).
- Driver intentionally handles oracle == fallback (range==0) and oracle < fallback (range<0) by short-circuiting to ScoringEngine's `sandwichNormalize` semantics — that function already returns the binary above-baseline branch / NaN respectively. The driver does NOT mask either case; downstream NDJSON consumers can detect both via `sandwichNorm` value.
- `MultiBackendAdapter` adapterClass factory stores the channel map in a closure to dodge SeedMatrix's `new adapterClass(adapterOpts)` instantiation contract — building the channel map once per cell rather than once per cell × dim plugin.

---

## [Unreleased] — refactor/academic-benchmark — P0 reviewer-blocker fixes

### P0 fix — wire AgentAdapter through SimHarness (Critical Bug 1)
- Why: 3 reviewer reports converged on the same finding — `SeedMatrix.runOneCell` was setting `harness.state.ai.adapter = adapter`, but no sim system reads that field. The 4-channel decision sites (`StrategicDirector`, `EnvironmentDirectorSystem`, `NPCBrainSystem`, `AgentDirectorSystem`) all call `services.llmClient.requestXxx(...)` directly. Net effect: every alternate adapter (`FlatBaselineAdapter`, `ScriptedOraclePolicy`, `HTTPAgentClient`, `LayerCastAdapter`, `NoopAgentAdapter`) was dead code; the entire P0 P-batch was a dead seam.
- New file: `src/simulation/ai/llm/AdapterToLLMClient.js` — drop-in LLMClient shim wrapping any `AgentAdapter` (`requestEnvironment` / `requestPolicies` / `requestStrategic` / `requestPlan` + `lastStatus` / `lastModel` / `lastLatencyMs` / `lastError`). Validates + guards adapter responses through the same `validateEnvironmentDirective` / `validateGroupPolicy` / `validatePlanResponse` + `guardEnvironmentDirective` / `guardGroupPolicies` paths LLMClient uses on proxy responses.
- Modified `src/app/createServices.js` — accepts `options.agentAdapter`; precedence is `agentAdapter` → `offlineAiFallback` → raw `LLMClient`. Default browser/game path unchanged.
- Modified `src/benchmark/framework/SimHarness.js` — accepts `opts.agentAdapter` and forwards it to `createServices`.
- Modified `src/benchmark/framework/SeedMatrix.js` — `runOneCell` now passes the adapter at SimHarness construction time instead of the old `harness.state.ai.adapter = adapter` post-hoc mutation.
- New test `test/seed-matrix-adapter-integration.test.js` — three-cell e2e: `NoopAgentAdapter` (sanity), `ScriptedOraclePolicy` (real directives), `FlatBaselineAdapter` w/ stubbed inner `LLMClient` (verifies the fused-call path is actually invoked). Includes a `CountingAdapter` wrapper that asserts non-zero per-channel call counts.

### P0 fix — MemoryDegradation extractActionTokens Map vs Object (Critical Bug 2)
- Why: `state.ai.groupPolicies` is a `Map` (NPCBrainSystem uses `.set()`), with each entry shaped `{ expiresAtSec, data: <policyObject> }`. `Object.values(policies)` returns `[]` on a Map, and even with object input never unwrapped `.data`. Result: `action_grounded_recall` was identically zero on every benchmark run — H5e couldn't distinguish verbal vs action-grounded recall.
- Modified `src/benchmark/dimensions/MemoryDegradation.js` `extractActionTokens` to handle both `Map` and plain-object inputs and to unwrap `.data` (live shape) or accept a flat policy (test-fixture shape). Added a comment noting that `samples._meta` is non-enumerable on `JSON.stringify` (arrays drop ad-hoc properties); callers should pull `_meta` off in-process or read via `selfScore` ctx.
- New test `test/benchmark-memory-action-recall.test.js` — 4 cases: Map-with-data wrap, plain-object-with-data wrap, flat policy without wrap, zero-weight exclusion.

### P0 fix — Anchor Injection Protocol (Critical Bug 3)
- Why: `MemoryDegradation.collectSamples` accepts `opts.anchors` and `selfScore` accepts `ctx.anchors`, but no plumbing wrote those tokens into `harness.memoryStore`. Every E5 (anchor decay) experiment ran on an empty memoryStore.
- New file: `src/benchmark/anchors/AnchorInjector.js` — `injectAnchors(harness, anchors, opts)` writes through `MemoryStore.addObservation(timeSec, text, category, importance)` with category `"anchor"` and importance 5; falls back to direct `observations.push` if the API ever changes; returns `{ injected, skipped }` counts.
- New test `test/benchmark-anchor-injector.test.js` — 6 cases incl. empty/string-form anchor handling, formatForPrompt round-trip, fallback push path, no-memoryStore graceful skip, anchored_fact_recall ≥ 0 after injection.

### Verified
- `node --test test/benchmark-memory-action-recall.test.js test/benchmark-anchor-injector.test.js` — 10/10 pass
- `node --test test/seed-matrix-adapter-integration.test.js` — 3/3 pass (~30 s)
- `node --test test/*.test.js` (full suite) — **754 tests / 753 pass / 0 fail / 1 skip** (pre-existing skip preserved)

### LOC delta
- New: 298 (AdapterToLLMClient) + 95 (AnchorInjector) + 185 + 132 + 100 (3 tests) = **810 LOC across 5 new files**
- Modified: ~65 lines net across 4 files (createServices, SimHarness, SeedMatrix, MemoryDegradation)

---

## [0.11.0-rc1] — 2026-05-09 — Academic-benchmark refactor

Branch: `refactor/academic-benchmark` (from baseline tag `pre-academic-refactor-v0.10.0` = commit `16a593d`).
Tag: `refactor/academic-benchmark-v0.11.0-rc1`.

Cumulative delta vs v0.10.0: **~78 k LOC removed across 370+ files, 2064 tests / 1 fail → 684 tests / 0 fail, full-suite 84 s → 18 s**.

### S0 — baseline + determinism audit
- Established baseline 2064 / 2059 pass / 1 fail / 4 skip on `pre-academic-refactor-v0.10.0`
- Added `tools/audit/{rng-coverage-report,determinism-check}.js` — RNG-leak grep + same-seed × fallback hash equality verifier
- Output `docs/ai-research/determinism-report.md` answering Appendix-B Q1–Q4

### S1 — browser shell removal (~30 k LOC, 119 test files)
- CUT `src/render/`, `src/ui/`, `src/audio/`, `src/dev/`, `index.html`, `src/main.js`, `vite.config.js`, `desktop/`
- CUT `src/app/{GameApp,GameLoop,snapshotService,leaderboardService,devModeGate,shortcutResolver,replayService,perfCapHonest,simStepper,uiProfileState}.js`
- CUT 14 browser/desktop/release scripts in `scripts/`
- Patched 3 reverse imports (`MortalitySystem` audio, `PopulationGrowthSystem` dev re-export, `EntityFactory` uiProfile/display)
- Slimmed `createServices.js`, dropped `electron`/`vite`/`playwright`/`three` deps from `package.json`

### S2 — test bucket cleanup (~17.7 k LOC, 127 test files)
- Buckets per refactor-plan §3.3: ui-hud-render, progression-score, building-economy regressions, worker-npc balance/hotfix, ai-llm tone/balance-tune, navigation road-*, wildlife, scenarios
- KEEP ~89 contract tests: ai-llm core (26), worker minimal contract (10), navigation core (8), benchmark/harness/long-run (20), build-system + build-proposer (4), schema/run-outcome/rng-determ

### S3 — decision points (~13.8 k LOC)
- **D2** ProcessingSystem CUT (`economy/ProcessingSystem.js` + `proposers/ProcessingProposer.js` + WAVE_2_BUILD_PROPOSERS membership + SimHarness/long-horizon-helpers wiring)
- **D4** Wildlife + Trader CUT (`ecology/WildlifePopulationSystem`, `npc/AnimalAISystem`; raider path inside VisitorAISystem retained)
- **D8** ProgressionSystem disabled (file kept as `isRecoveryEssential` library, removed from system tick)
- **D1** SkillLibrary DEFERRED — too tightly coupled to ColonyPlanner / PlanExecutor / AgentDirectorSystem; tag `feature/skill-library-archive` reserved for v0.11.1
- **D9 / D10** templates 6→2 + ScenarioFactory story content DEFERRED — many simulation modules still need the runtime helpers

### S4 — `balance.js` neutralize header
- Add policy banner at top of `src/config/balance.js` documenting neutralize-don't-delete strategy (preserves 50+ inbound reads)
- No value changes (would risk breaking behavioural contracts)

### S5 — AgentAdapter skeleton + token telemetry
- New `src/simulation/ai/llm/AgentAdapter.js` — 4-channel interface (CHANNELS, AgentAdapter base class, NoopAgentAdapter, SCHEMA_VERSION="1.0")
- Extend `src/app/aiRuntimeStats.js` with token fields (promptTokens, completionTokens, cachedTokens, firstTokenLatencyMs, tokensPerSec, kvCacheHits, prefixHits)
- AI proxy / LLMClient / PromptBuilder slimming **deferred** to wave-2 (would risk breaking the existing test surface)

### S6 — 5 dimension plugins
- New `src/benchmark/dimensions/{ResourceAllocationEfficiency,GroupDynamics,MemoryDegradation,DecisionTokenEfficiency,HierarchicalCoordination,index}.js`
- Each conforms to `DimensionPlugin.js` protocol; output documented as `[0,1]` for sufficiency / drift / recall, raw scalar for cadence-stddev + latency-p50 (consumers normalize before bayesianScore)
- New `test/benchmark-dimensions.test.js` — 8 tests cover protocol + per-plugin smoke run

### Review rounds
- Round 1 (orphans): deleted dead `src/app/controlSanitizers.js` (96 LOC, 0 inbound), `SURNAME_BANK + pickSurname` in `EntityFactory.js`, dead SYSTEM_ORDER strings (`AnimalAISystem`, `ProcessingSystem`, `ProgressionSystem`)
- Round 2 (docs): full rewrite of `CLAUDE.md` for academic-benchmark architecture, full rewrite of `README.md`, refactor-plan §4.11 Decision Matrix status filled in
- Round 3 (closeout): identified ScoringEngine ↔ plugin scale mismatch (deferred normalization layer to wave-2), removed broken Playwright-tied `scripts/long-run-{support,report}.mjs`

### Verified
- `npm test` — 684 / 683 pass / 0 fail / 1 skip / 18.4 s
- `npm run audit:rng` — 3 leaks remain (was 12 pre-S0; the 9 in deleted files self-resolved)
- `npm run audit:determinism --ticks 60 --scenario temperate_plains` — same hash on two runs (fallback mode)
- `npm run bench:dimensions` — 8/8 dimension-plugin smoke tests green

### Deferred (see `docs/ai-research/refactor-plan.md` §4.11 + §5)
- **D1** SkillLibrary cut + caller refactor
- **D5** runMode gate (`state.ai.runMode = "llm" | "algorithmic" | "hybrid"`)
- **D9** scenario template allowlist (6→2+1)
- **D10** ScenarioFactory story-content deletion
- **S5 wave-2** ai-proxy / LLMClient / PromptBuilder slimming + HTTPAgentClient + agent-bridge
- **S6 wave-2** ScoringEngine normalization layer; populate placeholder dimensions (coalition_coupling, state_target_obedience, plan_policy_alignment, behavioral_drift)
- **S7** long-horizon memory harness (30 m → 2 h × 5 seed × 3 repeat → 8 h → 24 h)

---

