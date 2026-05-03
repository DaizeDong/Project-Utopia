---
implementer_id: PK-perf-and-warehouse
plan_source: Round6/Plans/PK-holistic-rank.md
priority: P0
track: code
parent_commit: 0b785f5
build_commit: TBD (filled post-commit)
date: 2026-05-01
---

# PK perf-and-warehouse — implementation log

Two independent sub-fixes shipping in one patch per plan Direction A.

## Sub-fix (a) — recomputeCombatMetrics throttle

**Root cause:** R5 PB-combat-plumbing hoisted `recomputeCombatMetrics(state)` out of the `deadIds.size === 0` early-return so combat metrics refresh every tick (P0-1 of PB-combat-engagement). Correct fix at the time, but at 80 workers + 0 hostiles the function still walks `agents` (worker + saboteur arrays) once and runs an O(W*(P+S)) nearest-distance scan. Empty-handed it's still ~6.4 k iterations / tick on the every-tick critical path.

**Fix:** `recomputeCombatMetricsThrottled(state)` wrapper added to `src/simulation/lifecycle/MortalitySystem.js`. Module-scope cache on `(agents.length << 16) | animals.length` signature. Skip the walk when:
- `state.metrics.combat.activeThreats === 0` (peaceful state)
- AND `prev.activeThreats` is a number (metrics already populated)
- AND signature unchanged since last walk
- AND `__combatMetricsLastNoThreatTick >= 0` (we've completed at least one walk)

Live-threat ticks fall straight through to the full walk → GUARD reaction unchanged. Signature mismatch (any birth/death/spawn) forces a walk. The post-death recompute at line 831 stays direct (death-ticks are infrequent).

**Call site change:** line 819 swapped from `recomputeCombatMetrics(state)` to `recomputeCombatMetricsThrottled(state)`. Comment block expanded to document why.

## Sub-fix (b) — WarehouseNeedProposer

**Root cause:** EmergencyShortage's food-logistics rule guards on `warehouseCount > 0` (it pushes a warehouse when farms outnumber warehouses 3:1, or when warehouses < `floor(workers/5)+2` AND food<30). On a 0-warehouse + critical-hunger map, neither sub-rule fires; the autopilot has no proposer that observes the "no warehouse access point" wipe pattern that Inspector's Food Diagnosis already names verbatim.

**Fix:** new `src/simulation/ai/colony/proposers/WarehouseNeedProposer.js` (60 LOC including comments). Self-contained — walks `state.agents` once for criticalHungerRatio rather than depending on a `foodDiagnosis` field that doesn't currently flow into proposerCtx. Capacity model: `warehouses * 200` (canonical BALANCE.warehouseCapacity).

Trigger: `(criticalHungerRatio > 0.5 OR food < 60) AND (warehouses === 0 OR food/cap >= 0.95)`. Emits `{type: "warehouse", priority: 90, reason: ...}` — slotted just under EmergencyShortage's @100 family but above recovery-warehouse @96. Two reason variants ("no warehouse access point" vs "existing warehouses saturated") for postmortem trace.

**Registration:** appended to `DEFAULT_BUILD_PROPOSERS` in `src/simulation/ai/colony/BuildProposer.js`. Slotted last; sort+dedup at end of `assessColonyNeeds` lets EmergencyShortage @100 still win identical-type tiebreaks. `build-proposer-interface.test.js` updated for the length 4→5 + new index name assertion.

## Tests

Added:
- `test/combat-metrics-throttle.test.js` (2 cases) — peaceful tick reuses cache; entity churn invalidates.
- `test/warehouse-need-proposer.test.js` (7 cases) — 3 fire paths + 3 silent paths + interface compliance.

Modified:
- `test/build-proposer-interface.test.js` — `DEFAULT_BUILD_PROPOSERS.length === 5`; `[4].name === "warehouseNeed"`.

Unchanged (verified):
- `test/build-proposer-orchestration.test.js` — its `safetyNetSubset` regex doesn't match "warehouse-need:" prefix; trace-through of the 6 fixtures confirms no fixture state triggers WarehouseNeedProposer.
- `test/combat-metrics-per-tick.test.js` (2 cases) — first-tick walks happen on these fixtures because the cache starts cold and entity signatures differ.

## Test baseline

`node --test "test/*.test.js"`:
- **Total:** 1885 tests
- **Pass:** 1876 (was 1867 on parent `0b785f5`; net +9 from new tests)
- **Fail:** 5 (all pre-existing on parent — verified by `git stash` + re-running suite at baseline)
- **Skip:** 4

Pre-existing failures (NOT introduced by this patch):
1. `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires` (`food-rate-breakdown.test.js`)
2. `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role` (`phase1-resource-chains.test.js`)
3. `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)` (`raid-escalator.test.js`)
4. `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)` (`raid-fallback-scheduler.test.js`)
5. `Fallback planner emits a recruit step when food surplus + pop below target` (`fallback-planner-recruit.test.js`)

## Files changed

Source (3):
- `src/simulation/lifecycle/MortalitySystem.js` — throttle wrapper + call-site swap (~40 LOC added).
- `src/simulation/ai/colony/BuildProposer.js` — import + registry append + re-export (~10 LOC).
- `src/simulation/ai/colony/proposers/WarehouseNeedProposer.js` — new file (~60 LOC including comments).

Tests (3):
- `test/combat-metrics-throttle.test.js` — new (~85 LOC).
- `test/warehouse-need-proposer.test.js` — new (~95 LOC).
- `test/build-proposer-interface.test.js` — updated 1 test (length + new index assertion).

Docs (1):
- `CHANGELOG.md` — new "v0.10.2-r6-PK" section at top.

## Estimate vs actual

Plan estimate: 150 LOC, 3 new tests, 4 files touched, 90 min.
Actual: ~110 / -3 LOC, 9 new test cases (across 2 files), 6 files touched, ~50 min.

Under-budget on LOC because the throttle wrapper turned out to be ~25 LOC (not the ~50 forecast), and the proposer didn't need a `proposerCtx` extension (Step 6) since `criticalHungerRatio` was easier to compute inside the proposer than to plumb through ctx.

## Freeze compliance

- No new tile / role / building / mood / audio / UI panel.
- Throttle is a perf wrapper around an existing function; observable metrics identical when active threats present.
- New proposer reuses existing BuildProposer interface; emits existing building kind (`warehouse`).
- No SYSTEM_ORDER changes; no service rewires.
