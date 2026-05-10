# Design Audit Decisions — RC2 → RC3 (2026-05-10)

Single-doc summary of the three-round design audit and the
KEEP / REMOVE / REFACTOR decisions applied between
`refactor/academic-benchmark-v0.11.0-rc2` and
`refactor/academic-benchmark-v0.11.0-rc3`.

Audit goal (per user instruction 2026-05-10):
> "实验数据也要跑。不过要首先确认游戏设计，确保里面每个元素都是可单独
> verify、对文章某一个section或者结论具有明确价值、能够支撑文章核心
> 贡献的"

Every retained element must be (a) independently verifiable,
(b) have explicit value for some paper section/conclusion,
(c) support a core contribution claim (C1–C4 in
`paper-framework.md` §1.2).

## Scope

| Round | Subagents | Coverage |
|---|---|---|
| R1 | 7 parallel | ai/{brains,colony,director,strategic,memory,llm}, simulation/{construction,economy,lifecycle,meta,movement,navigation,npc,population,services,telemetry}, world/, config/, entities/, app/, benchmark/ |
| R2 | gap detection | adjacent system boundaries, paper §3 description gaps, dimension-key inventory |
| R3 | marking validation | re-checked highest-stakes findings against actual code; applied P0 fixes |

## Findings — by category

### A. Critical bugs (FIXED in RC3)

| ID | File:line | Bug | Fix | Test |
|---|---|---|---|---|
| B1 | `src/benchmark/framework/SeedMatrix.js:122-131` | Reads `harness.state?.ai?.runtime` (path doesn't exist) — **all DTE/E6 cells return 0** | Read `state.metrics.aiRuntime`, remap field names (`requestCount→totalCalls` etc.), add S5 token-telemetry passthrough (7 new fields) | `test/seed-matrix-aiRuntime-passthrough.test.js` |
| B2 | `src/world/grid/Grid.js:71` | `Math.random()` literal in `pickBootSeed` default param tripped audit | Module-level captured PRNG, audit-clean | `npm run audit:rng` |
| B3 | `src/simulation/npc/WorkerAISystem.js:1263` | `Math.random()` fallback in `pickFogEdgeTileNear` | Constant `0.5` (matches WorkerStates pattern) | regression |
| B4 | `src/simulation/population/PopulationGrowthSystem.js:160` | bare `Math.random` reference fallback | `() => 0.5` | regression |
| B5 | `src/simulation/economy/TileStateSystem.js:62` | bare `Math.random` reference fallback | `() => 0.5` | regression |
| B6 | `src/simulation/meta/EventDirectorSystem.js:155` | bare `Math.random` reference fallback | `() => 0.5` | regression |
| B7 | `src/benchmark/BenchmarkPresets.js:343` | bare `Math.random` reference fallback | `() => 0.5` | regression |
| B8 | `src/simulation/navigation/PathWorkerPool.js:11` | `navigator.hardwareConcurrency` host-dependent | Explicit `deterministic` short-circuit, fixed 4 workers | regression |

**Net result**: `npm run audit:rng` was `FOUND 3 leak(s)` → `OK — no Math.random() outside rng.js`. Tier 1/2 hashes preserved bit-identically.

### B. Missing implementation (ADDED in RC3)

| ID | Gap | Implementation | Test |
|---|---|---|---|
| G1 | D5 `runMode` gate (CLAUDE.md DEFERRED) — `ColonyDirectorSystem` ticked even when LLM channel was active, polluting E1/E3 ablations | Added `state.ai.runMode = "fallback" \| "llm"`, SimHarness option `runMode`, gate at top of ColonyDirectorSystem.update | `test/run-mode-gate.test.js` (8 cases) |
| G2 | HELM Mean Win Rate (paper §4.4b) had no code | `ScoringEngine.computeHelmMwr(perAgentDimensionScores)` implements pairwise win-rate definition, strict `>` for ties, joint-dim handling | `test/scoring-engine-helm-mwr.test.js` (7 cases) |
| G3 | 4 of 5 placeholder dimension keys returned 0 | Wired with existing telemetry: `coalition_coupling` (Pearson over targetPriorities), `state_target_obedience` (pooled Σ in-target / Σ all), `faction_responsiveness` (Pearson factionTension vs hostile-group count), `plan_policy_alignment` (token overlap strategic plan ↔ workers directive) | `test/benchmark-dimensions.test.js` (extended) |

### C. Known TODOs (deferred to v0.11.1)

| ID | Item | Why deferred |
|---|---|---|
| T1 | `rae_path_overhead` (RAE plugin) | Needs `mean(actual_path_len / manhattan_dist)`; PathCache emits hit/miss but not path-length stats. Would require extending `PathCache.recordResult()` or new ProbeCollector hook. Returns 1.0 (optimal) so DimensionNormalizer maps to neutral. |
| T2 | N6 — insertion-ordered Sets/Maps | Not currently observed as nondeterminism source (Tier 1/2 still bit-identical twice in a row). |
| T3 | Map templates 6→2+1 (refactor-plan D9) | Defer to v0.11.1; current 6 templates all have ScriptedOraclePolicy + idempotency tests. |
| T4 | ScenarioFactory story bundles (D10) | Defer — RC3 paper draft does not depend on story-mode framing. |
| T5 | SkillLibrary / LearnedSkillLibrary (D1) | Defer to v0.11.1 — not on the C1–C4 critical path. |
| T6 | ProgressionSystem.js dead code (~910 LOC) | KEEP-AS-LIBRARY (only `isRecoveryEssential` is referenced); deletion is a follow-up cleanup, not paper-critical. |
| T7 | WarehouseQueueSystem (~400 LOC) | Documented as REMOVABLE in audit but not yet excised; system is in SYSTEM_ORDER with no real drivers. Follow-up. |

### D. KEEP — load-bearing for paper claims

| Component | Paper anchor | Why retained |
|---|---|---|
| 4-channel LLM action surface | C1, §3 | THE paper's architectural claim. |
| AgentAdapter contract + AdapterToLLMClient | C1, §3.2 | Pluggable interface; cited verbatim in §A2. |
| ResponseSchema + Guardrails | C1, §3.4, §A2 | Hard-rule enforcement; cited as anti-contamination safeguard (§8). |
| MemoryStore (importance-aware eviction) | C3, §5.5 (E5) | Anchor durability is the headline E5 result. |
| 5 Dimension plugins | C2, §4.1 | The 4-layer metric stack. |
| ScoringEngine (sandwich + Bayesian + HELM MWR) | C2, §4.4 | Combines normalization, posterior, model comparison. |
| ScriptedOraclePolicy (6 scenarios) | C2, §4.2, §A3 | Sandwich-norm upper bound; idempotent through Guardrails. |
| LayerCastAdapter + RecordReplayCache | C1, §8 (Tier 2) | Repro Tier 2 path. |
| MultiBackendAdapter + agent-bridge.js (9-cell) | C3, §5.3 (E3) | Cross-vendor matrix routing. |
| FlatBaselineAdapter | C3, §5.1 (E1) | Hierarchical-vs-flat control. |
| PolicyValueBaseline (PVB, AIVAT-style) | C2, §4.3 | Variance reduction; cited in §4.3 derivation. |
| 6 scenarios + 3 difficulty tiers | C3, multiple | Test matrix dimension. |
| determinism-check.js (3 tiers) + RNG audit | C1, §8 | Tier-1 reproducibility claim's verification. |

### E. REFACTOR (not yet — follow-up tickets)

| Component | Issue | Proposed change |
|---|---|---|
| `ProgressionSystem.js` | 920 LOC, only `isRecoveryEssential` is live | Extract the live function to a small helper module, delete the rest. Defer. |
| `WorkerAISystem.js` | ~400 LOC of unreached branches (player-game flavor) | Trim. Defer. |
| `EntityFactory.js` | ~600 LOC of cosmetic name pools | Trim. Defer. |
| Paper §3 description gaps | NPC role-allocation handoff, FSM state set, RAE source code path, faction-aware path helpers | Update LaTeX (small). Defer to next RC. |

## Element-paper claim mapping (high-level)

| Element | C1 (arch) | C2 (method) | C3 (empirical) | C4 (position) |
|---|---|---|---|---|
| 4 LLM channels | ✓ | | | ✓ |
| AgentAdapter contract | ✓ | | | ✓ |
| ResponseSchema/Guardrails | ✓ | | E6 | ✓ |
| MemoryStore | | | E5 | |
| 5 Dimension plugins | | ✓ | E1, E2, E3, E4, E5, E6, E7 | |
| ScoringEngine + HELM MWR | | ✓ | all | |
| ScriptedOraclePolicy | | ✓ (sandwich UB) | all | |
| FlatBaselineAdapter | | | E1 | |
| MultiBackendAdapter | | | E3 | |
| PVB | | ✓ | E1, E3 | |
| 3-tier determinism | ✓ | | E9 | ✓ |
| 6 scenarios | | | all | |

## Validation status (post-RC3 fixes)

```
node --test test/*.test.js
→ 815 pass / 0 fail / 1 skipped (pre-existing skip)

npm run audit:determinism
→ Tier 1: e360b76… PASS (bit-identical)
→ Tier 2: 473d1b9… PASS (bit-identical)

npm run audit:rng
→ OK — no Math.random() outside rng.js
```

## Companion artifacts produced this round

- `test/seed-matrix-aiRuntime-passthrough.test.js`
- `test/scoring-engine-helm-mwr.test.js`
- `test/run-mode-gate.test.js`
- `test/benchmark-dimensions.test.js` — extended with 4 wired-key assertions
- `output/paper/E1.ndjson` — first end-to-end paper experiment output (in progress at time of doc commit)

## Open follow-ups (post-rc3)

1. T1 `rae_path_overhead` wiring (needs PathCache instrumentation).
2. T6 ProgressionSystem dead-code excision (~910 LOC).
3. T7 WarehouseQueueSystem removal.
4. Paper §3 LaTeX description gaps (small text-only updates).
5. Re-run determinism audit Tier 3 cross-OS once test-matrix machines available.
