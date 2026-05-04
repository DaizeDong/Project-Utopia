---
plan: Plan-Eat-Pipeline
reviewer: PW-scale-stability
round: 9
priority: P0
track: code
parent_commit: abb0f94
head_commit: d2a83b5
date: 2026-05-01
status: COMMITTED
---

## Status

**COMMITTED** — both prongs of Plan-Eat-Pipeline landed cleanly on top of Plan-Recovery-Director, no test regressions.

## Parent → Head

- parent: `abb0f94` (Plan-Recovery-Director)
- head:   `d2a83b5` (Plan-Eat-Pipeline)
- `git log --oneline -2` confirmed below.

## Files Changed

- `src/simulation/npc/WorkerAISystem.js` (+22/-1) — survival bypass + restored missing `WORKER_EMERGENCY_RATION_HUNGER_THRESHOLD = 0.18` constant.
- `src/simulation/ai/colony/proposers/WarehouseNeedProposer.js` (+33/-1) — contention sensor sibling branch (slot 88, sits next to R9 PZ diagnostic branch @90).
- `test/r9-eat-pipeline.test.js` (+146 LOC, new) — 5 invariants.
- `CHANGELOG.md` (+16 LOC) — v0.10.2-r9-eat-pipeline section.

Total: +225/-1 across 4 files (commit stat).

## Key Changes

**Step 1 — survival bypass (WorkerAISystem.js:584-606)**

Replaced unconditional `if (reachable !== false) return` with:
```
const survivalCritical = hungerNow < WORKER_SURVIVAL_CRITICAL_HUNGER && carryFood > 0;
if (reachable !== false && !survivalCritical) return;
```

Defensively restored `WORKER_EMERGENCY_RATION_HUNGER_THRESHOLD = 0.18` (lost in v0.10.1-l, would have caused `ReferenceError` if the FSM ever called `consumeEmergencyRation` again — invisible because hot path bypassed it).

**Step 2 — contention sensor (WarehouseNeedProposer.js)**

Added sibling branch after the diagnostic-dwell branch and before the legacy hunger-crisis early-return:
```
if (warehouses > 0 && workerCount > 0) {
  const contention = workerCount / warehouses;
  if (contention > 12) return [{ type: "warehouse", priority: 88, reason: ... }];
}
```

`warehouses === 0` short-circuit preserves noAccess @90 preemption.

## Tests

**New test file:** `test/r9-eat-pipeline.test.js` — 5/5 pass:
1. survival-critical (hunger=0.10, carry>0, reachable wh): carry-eat fires
2. non-survival (hunger=0.30): v0.8.8 D1 contract preserved
3. 50:1 contention: emits @priority=88 with contention reason
4. 10:1 ratio: silent
5. warehouses=0 + 50 critical workers: noAccess @90 wins

**Full suite:** 1967 tests / 1963 pass / 0 fail / 4 skip (pre-existing skips, no new failures introduced).

**Targeted regression suites (41/41 pass):** `warehouse-need-proposer` (8/8), `r9-recovery-director` (6/6), `r9-eat-pipeline` (5/5), `worker-ai-v0812` (1 + 1 pre-existing skip), `build-proposer-interface` (22/22).

## Confirmation: `git log --oneline -2`

```
d2a83b5 fix(eat-pipeline r9): Plan-Eat-Pipeline — survival-bypass on carry-eat + warehouse contention sensor
abb0f94 fix(director r9): Plan-Recovery-Director — release foodRecoveryMode latch + diagnostic-driven WarehouseNeed + ScoutRoad cap + GUARD floor under defend
```

## Hard-Freeze Compliance

No new tile / role / building / mood / mechanic. Pure predicate refinement on `_emergencyRationStep` + sibling branch on `WarehouseNeedProposer.evaluate()`. Coordination with Plan-Recovery-Director honored — that plan's diagnostic-driven trigger landed first at `abb0f94`; this plan's contention sensor is a sibling branch in the same `evaluate()` body, both inserted before the legacy `!noAccess && !overSaturated` early-return.
