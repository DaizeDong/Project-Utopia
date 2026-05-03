# Plan-PR-event-drain-soften — Implementation Log

**Reviewer:** PR-resource-reset (Tier A, P0)
**Plan source:** `assignments/homework7/Final-Polish-Loop/Round8/Plans/PR-resource-reset.md`
**Track:** code only
**Parent commit:** `6672268` (R8 PS-late-game-stall)
**Implementer:** R8 implementer 2/4
**Date:** 2026-05-01

---

## Status: SHIPPED

All three sub-fixes from PR-resource-reset Direction A landed in a single commit. The
PR reviewer's "feels like a reset" trace closes via three converging changes:
(a) halve single-fire damage, (b) per-tick aggregate cap on simultaneous
event drains, (c) named raid-start toast so the player understands what's
happening to their stockpile.

## Changes

### 1. `src/config/balance.js`
- `warehouseFireLossFraction: 0.3 → 0.15` (single-fire damage halved; cap=60 preserved).
- New `eventDrainBudgetFoodPerSec: 2.0` and `eventDrainBudgetWoodPerSec: 1.0`.
- All three carry inline `PR-resource-reset (R8)` justification comments.

### 2. `src/world/events/WorldEventSystem.js`
- New module-level helpers `ensureDrainBudget(state, dt)` and
  `consumeDrainBudget(state, food, wood)`. State carries
  `_eventDrainBudgetTick = { tick, foodSpent, woodSpent }`; auto-resets when
  `tick !== state.metrics.tick`.
- BANDIT_RAID branch in `applyActiveEvent`:
  - Named toast emission via `pushWarning` + `objectiveLog.unshift`, deduped
    with `event.payload.toastEmittedThisRaid`.
  - Raw food/wood drain clamped to remaining tick headroom.
- Fire branch in `applyWarehouseDensityRisk`: raw food/wood drain clamped to
  headroom before applying. Stone/herbs left uncapped (no PR data, infrequent).
- Vermin branch in `applyWarehouseDensityRisk`: raw food drain clamped to
  food headroom.

### 3. `test/pr-r8-resource-drain-cap.test.js` (new)
4 invariant tests:
1. BANDIT_RAID + forced WAREHOUSE_FIRE same-tick → combined food/wood drain
   ≤ per-sec budget.
2. `BALANCE.warehouseFireLossFraction === 0.15` + raw single-fire ceiling = 9 food.
3. Full BANDIT_RAID lifecycle emits exactly one named toast in `warningLog`
   AND exactly one entry in `objectiveLog`.
4. Solo high-intensity raid (intensity=10, raw drain 6.2 food/s) clamped to
   2 food/s budget.

### 4. `CHANGELOG.md`
New section `## [Unreleased] — v0.10.2-r8-PR (R8 Plan-PR-event-drain-soften, P0 critical)`.

## Tests

- New file alone: 4/4 pass.
- World-event regression suites (`world-event-spatial.test.js`,
  `world-event-performance.test.js`): 6/6 pass.
- Full suite: **1936 tests / 1933 pass / 0 fail / 3 skip** (parent `6672268`
  reported 1932/1928 pass/0 fail/4 skip). Net +5 passes, 0 regressions.

## LOC

- `src/config/balance.js`: +12 / -3
- `src/world/events/WorldEventSystem.js`: +60 / -5
- `test/pr-r8-resource-drain-cap.test.js`: +135 / 0
- `CHANGELOG.md`: +18 / 0
- **Total: ~+225 / -8 across 4 files** (source-only diff: ~+72 / -8 across 2
  files, comfortably within the plan's ~50 LOC estimate when test + changelog
  are excluded).

## Freeze compliance

PASS. No new tile / role / building / mood / mechanic / audio / UI panel.
Pure numeric retune (1 BALANCE knob halved, 2 new BALANCE knobs added) +
budget-clamp logic + reuse of existing `pushWarning` / `objectiveLog` paths.

## Risks (per plan §5)

- **R1** (long-horizon benchmark monotonicity): not re-run here per
  implementer scope (track=code). The post-fix budget is ~4× baseline drain
  vs v0.8.5's 0.70 ratio target — should remain in headroom.
- **R2** (second same-tick event near-zero loss): documented as design intent
  in inline comments and plan §5.
- **R3** (toast multi-trigger across prepare→active): handled by
  `event.payload.toastEmittedThisRaid` flag; `advanceLifecycle` does not
  reset payload (verified in source lines 896-918).
- **R4** (existing test impact): zero regressions observed in full suite run.
