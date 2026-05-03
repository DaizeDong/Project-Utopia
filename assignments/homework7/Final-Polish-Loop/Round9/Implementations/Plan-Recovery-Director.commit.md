---
plan: Plan-Recovery-Director
implementer: R9 implementer 3/4
priority: P0
track: code
parent_commit: 2f87413
status: COMPLETE — committed
---

## Status

All six steps from `Round9/Plans/Plan-Recovery-Director.md` shipped in a single commit. 1962/1958 pass / 0 fail / 4 skip on the full suite (`node --test test/*.test.js`, ~144s).

## Parent → Head

- Parent: `2f87413` (R9 Plan-Cascade-Mitigation, HUD chip + per-worker starvation phase)
- Head: see `git log --oneline -2` confirmation below

## Files Changed (4 source + 1 test + CHANGELOG)

1. `src/app/GameApp.js` — `#maybeAutopilotFoodPreCrisis` release gate broadened from `food≥24 ∧ produced≥consumed ∧ risk≤0 ∧ dwell≥20s` to `(stableHealth ∧ (escapeHatch ∨ produced≥consumed))` where `escapeHatch = farms≥ceil(workers/2) ∨ warehouses≥1 ∨ headroomSec>90`. ~22 added.
2. `src/simulation/ai/colony/proposers/WarehouseNeedProposer.js` — added `computeNoAccessRatio(state)` walking workers' `entity.debug.nutritionSourceType==="none"`; new diagnostic-driven branch fires at ratio≥0.30 with 10-sec dwell latched on `state.ai.warehouseDiagnosticSinceSec`. ~59 added.
3. `src/simulation/ai/colony/proposers/ScoutRoadProposer.js` — hard cap: bail when `state.buildings.roads >= 30` (matches PROCESSING_TARGETS.roads). ~8 added.
4. `src/simulation/population/RoleAssignmentSystem.js` — when `state.ai.strategy.priority==="defend"` AND `guards.length===0` AND `allWorkers.length≥4`, draft 1 non-BUILDER candidate as GUARD. ~15 added.
5. `test/r9-recovery-director.test.js` — NEW. 6 invariants (3 WarehouseNeed × dwell/latch/clear, 1 ScoutRoad cap, 2 GUARD-floor ± defend strategy). 151 LOC.
6. `CHANGELOG.md` — `[Unreleased] — v0.10.2-r9-recovery-director` block.

Total source LOC: ~+104/-5 across 4 files. Plan estimate: ~120 LOC. Hard-freeze compliant — no new tile / role / building / mood / mechanic.

## Tests

- New: `test/r9-recovery-director.test.js` 6/6 pass (~250ms).
- Targeted regression (touched-module suites): `warehouse-need-proposer` + `role-assignment-*` (5 files) + `build-proposer-orchestration` + `colony-director-behavior-lock` + `recovery-boost-food-floor` + `recovery-essential-whitelist` — 55/55 pass.
- Full suite: **1962 tests / 1958 pass / 0 fail / 4 skip** (118 suites, ~144s wall).

## Notes / Deviations from Plan

- Plan spec referenced `state.populationStats?.workers` and `state.gameplay?.strategy?.priority` — actual canonical paths are `state.metrics.populationStats.workers` and `state.ai.strategy.priority`. Used the canonical paths; kept `state.gameplay.strategy.priority` as a forward-compat fallback so any future migration doesn't break the GUARD floor. Verified with `grep` against StrategicDirector + RoleAssignmentSystem usage.
- Diagnostic-latch field name preserved as plan-specified (`state.ai.warehouseDiagnosticSinceSec`); reset to `null` (not `delete`) when the ratio drops below threshold, matching surrounding `state.ai` patterns.
- `WarehouseNeedProposer` diagnostic branch is checked BEFORE the noAccess/saturated branch — so a 1-warehouse colony with 30%+ no-access workers (e.g. warehouse on the wrong side of an unbridged river) still gets a fresh warehouse proposal, which closes the PZ verbatim case.
