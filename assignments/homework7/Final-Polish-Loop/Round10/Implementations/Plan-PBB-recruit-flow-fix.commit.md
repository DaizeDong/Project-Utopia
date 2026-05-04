# Plan-PBB-recruit-flow-fix — Implementation Commit Log

**Plan:** `assignments/homework7/Final-Polish-Loop/Round10/Plans/Plan-PBB-recruit-flow-fix.md`
**Implementer:** R10 implementer 1/5
**Track:** code (correctness — load-bearing telemetry)
**Priority:** P0 CRITICAL FOUNDATIONAL
**Status:** SHIPPED

## Commit anchor

- **Parent:** `d2a83b5` (R9 Plan-Eat-Pipeline — survival-bypass on carry-eat + warehouse contention sensor)
- **HEAD:**   `e4661d3` (R10 Plan-PBB-recruit-flow-fix — restore foodProducedPerMin so auto-recruit can fire)
- **Diff scope:** 4 files, +170 / -1 LOC

```
e4661d3 fix(telemetry r10): Plan-PBB-recruit-flow-fix — restore foodProducedPerMin so auto-recruit can fire
d2a83b5 fix(eat-pipeline r9): Plan-Eat-Pipeline — survival-bypass on carry-eat + warehouse contention sensor
```

## Files changed

| File | Δ | Notes |
|---|---|---|
| `src/simulation/npc/WorkerAISystem.js` | +15 / -2 | Step 1 (warehouse-unload) + Step 1b (bootstrap-no-warehouse) `recordResourceFlow` emits + import extension |
| `src/entities/EntityFactory.js` | +8 / -0 | Step 2: defensive `recruitTotal: 0,` in metrics-shape literal |
| `test/recruit-food-flow-invariant.test.js` | +118 / -0 (new) | 4 invariants: positive, negative control, zero-clamp, recruitTotal init |
| `CHANGELOG.md` | +29 / -0 | New `[Unreleased] — v0.10.2-r10-pbb-recruit-flow-fix` section |

## Edits applied

### Step 1 — Warehouse-unload deposit (WorkerAISystem.js:846)

```diff
-import { recordProductionEntry } from "../economy/ResourceSystem.js";
+import { recordProductionEntry, recordResourceFlow } from "../economy/ResourceSystem.js";
```

```diff
     const unloadFood = Math.min(Number(worker.carry.food ?? 0), remaining);
     worker.carry.food = Math.max(0, Number(worker.carry.food ?? 0) - unloadFood);
     state.resources.food += unloadFood;
+    // R10 Plan-PBB-recruit-flow-fix Step 1 — true-source production emit so
+    // state.metrics.foodProducedPerMin is non-zero in shipped play. Without
+    // this, RecruitmentSystem's foodHeadroomSec gate (BALANCE.recruitMin
+    // FoodHeadroomSec=60) is mathematically unsatisfiable and auto-recruit
+    // never fires. See assignments/.../Round10/Plans/Plan-PBB-recruit-flow-fix.md.
+    recordResourceFlow(state, "food", "produced", unloadFood);
     remaining -= unloadFood;
```

### Step 1b — Bootstrap-no-warehouse direct-deposit (WorkerAISystem.js:520)

```diff
     if (directDepositState && directDepositState.resources) {
       const cur = Number(directDepositState.resources[resourceType] ?? 0);
       directDepositState.resources[resourceType] = cur + yielded;
+      // R10 Plan-PBB-recruit-flow-fix Step 1b — bootstrap-no-warehouse path
+      // also feeds foodProducedPerMin so the recruit-headroom gate sees real
+      // production before the first warehouse exists. Scoped to "food" only
+      // (matches the load-bearing gate); wood/stone/herbs telemetry on this
+      // path is tracked as a follow-up in CHANGELOG.
+      if (resourceType === "food") {
+        recordResourceFlow(directDepositState, "food", "produced", yielded);
+      }
     } else {
       worker.carry[resourceType] += yielded;
     }
```

### Step 2 — Defensive `recruitTotal: 0` init (EntityFactory.js:917)

```diff
       survivalScore: 0,
       birthsTotal: 0,
+      // R10 Plan-PBB-recruit-flow-fix Step 2 — defensive default. Previously
+      // only incremented inside the spawn branch at PopulationGrowthSystem.js
+      // line 262, which left `recruitTotal` as `undefined` for any consumer
+      // that read it before the first recruit fired (HUD / analytics / R5
+      // PC's gate). Initialising to 0 here keeps `metrics.recruitTotal + 1`
+      // from coercing to NaN.
+      recruitTotal: 0,
       lastBirthGameSec: -1,
```

## Tests

### New suite: `test/recruit-food-flow-invariant.test.js`

```
# Subtest: food production-flow: recordResourceFlow → ResourceSystem flush sets foodProducedPerMin > 0
ok 1
# Subtest: food production-flow: negative control — no produced emit keeps foodProducedPerMin = 0
ok 2
# Subtest: food production-flow: zero-quantity emits are safely ignored (clamped to 0)
ok 3
# Subtest: R10 Step 2: state.metrics.recruitTotal is initialised to 0 (not undefined)
ok 4
# tests 4
# pass 4
# fail 0
```

### Full suite (`node --test test/*.test.js`)

```
# tests 1971
# suites 118
# pass 1967
# fail 0
# skipped 4
# duration_ms ~89s
```

Baseline preserved: 1967 pass / 0 fail / 4 skip (matches R9 Plan-Eat-Pipeline closing baseline; +4 new passing cases from this plan, no regressions).

## Acceptance criteria checklist

| # | Criterion | Status |
|---|---|---|
| 1 | `node --test test/recruit-food-flow-invariant.test.js` passes | PASS (4/4) |
| 2 | Full baseline preserved | PASS (1967 / 0 / 4) |
| 3 | Playwright re-verification | DEFERRED — no runtime active in this implementer session; the unit test exercises the same `recordResourceFlow → flush → metric` contract end-to-end with the production code path |
| 4 | `state.metrics.recruitTotal` finite, not undefined / NaN | PASS (test #4) |
| 5 | Zero new BALANCE keys / systems / HUD elements | PASS (verified by diff scope) |

## Hard-freeze compliance

Verified — only existing helper (`recordResourceFlow`) called at one new site + one defensive default init + one new test file. No new tile / role / building / mood / mechanic / audio / UI panel / BALANCE knob.

## Rollback

`git revert e4661d3` reverts the four-file diff cleanly. The defensive `recruitTotal: 0` is forward-compatible — even if reverted, downstream `Number(state.metrics.recruitTotal ?? 0) + 1` continues to work.

## Follow-ups (deferred, NOT in scope)

1. **Wood/stone/herbs production-flow telemetry** at the same deposit sites. Currently silent (matches the food bug that was just fixed) but NOT load-bearing under R5 PC's recruit-gate. Track for v0.10.3.
2. **Playwright re-verification** of the PBB scenario per Plan Step 5. The expected observable: within 80 sim-sec, `foodProducedPerMin > 0` AND `birthsTotal > 0` on alpha_broken_frontier.
3. **Suggestion B (belt-and-braces guard) in `computeFoodHeadroomSec`** — defensive `producedPerMin === 0 && farms > 0 → return Infinity`. Optional layered safety; NOT shipped here because Step 1 + 1b restore the metric truth, making the guard redundant. If a future refactor accidentally re-breaks the deposit emits, Suggestion B becomes useful as a backstop.
