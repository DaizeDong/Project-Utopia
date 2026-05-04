# C1 — Code Architect — Round 10 (light static, NO browser)

Persona: Code Architect. R8 ship 5be7536, R9 base e7fb158, head d2a83b5. 4 commits, +2045/-11 LOC across 22 files (mostly plan/test/changelog; production delta ~+250 LOC across 9 src files).

## Grade distribution Δ vs R9

R9 baseline: 7A / 14B / 4C / 2D, 0 delta carries +1 R7 forward.
R10 standing: **7A / 16B / 3C / 2D** (net 1C → 2B; D unchanged).

- Plan-Honor-Reservation (PX B1+B3): **B**. WorkerStates.js soft-claim race honoured cleanly — `tryReserve` now consumed as a boolean at both onEnter sites (SEEKING_HARVEST + HARVESTING), null target is the existing dispatcher signal so no new transition needed. RoleAssignmentSystem builder-quota swap (`sitesUnclaimed`-driven `Math.max(2, ceil(*0.4))`) is a clean predicate replacement, not a new branch.
- Plan-Cascade-Mitigation (PV): **B**. `runOutcome.js#maybeRecordFamineChronicle` is a clean factor — pure helper, idempotent via "Famine —" head-prefix check, try/catch swallow, mutates only `state.gameplay.objectiveLog` capped at 24. Single call site in GameApp end-phase. Not a new patch path: extends the existing pure-function pattern (`evaluateRunOutcomeState`, `deriveDevTier`) in the same module. HUD chip pushed onto existing `chips[]` array w/ new optional `severity` attribute (legacy contract preserved). MortalitySystem phase-seed uses `entity._starvationPhaseSeeded` gate + `entity.id`-hashed offset (deterministic, no RNG state mutation). ProgressionSystem toast suppression is a single `if (!cascadeArming)` wrap.
- Plan-Recovery-Director (PY/PZ): **B**. WarehouseNeedProposer composes cleanly with R6 PK — diagnostic branch fires FIRST at @90, contention branch is a sibling `if (warehouses > 0 && workerCount > 0)` check at @88, legacy noAccess/saturation branch unchanged at @90 below. Three branches share no state and have explicit priority ordering documented. GameApp release-gate broadening keeps the four-way AND as `stableHealth` and adds an OR'd `escapeHatch` — the gate is more permissive without changing existing exit semantics. ScoutRoadProposer hard cap is a 3-line early-return.
- Plan-Eat-Pipeline (PW): **B**. Restored `WORKER_EMERGENCY_RATION_HUNGER_THRESHOLD = 0.18` constant fixes the latent ReferenceError (v0.10.1-l drop). New `WORKER_SURVIVAL_CRITICAL_HUNGER = 0.15` is one constant, used once, in a one-line override of the v0.8.8 D1 reachable-food guard. Comment block explicitly documents the carry-munching exploit window trade-off.

## Top-3 debt

1. **`state.ai.warehouseDiagnosticSinceSec` and `entity._starvationPhaseSeeded` are two new hidden underscored/loose fields** (PY, PV). Same risk class as R9's `_eventDrainBudgetTick` / `_zombieSinceSec` — undocumented contract, not in any state-shape doc, not reset on scenario reload. The starvation-phase one is at least gated by a sibling boolean reset on the success path; the warehouse one persists indefinitely once cleared because it's set to `null` not `undefined` (subtle: `typeof state.ai.warehouseDiagnosticSinceSec === "number"` correctly handles this, but a future reader will trip on it).
2. **`computeNoAccessRatio` and `computeCriticalHungerRatio` are twin O(workers) walks in WarehouseNeedProposer.evaluate** — both walk `state.agents` once per evaluation, in two passes. With three branches now (diagnostic/contention/legacy hunger-crisis), the proposer can do up to 2 full agent walks per tick. Trivial today (<200 agents) but worth folding into a single walk with both counters before the count crosses 500.
3. **GameApp recovery release-gate has 7 free variables in scope** (`food/produced/consumed/risk/startedAt/farmsTarget/farms/warehouses/headroomSec/dwellOk/escapeHatch/stableHealth`). The block reads cleanly because of the 12-line comment block, but the comment is now load-bearing — extract to `#shouldReleaseFoodRecovery(state, ai, nowSec)` returning `{release, reason}` next pass. Mirrors the R9 `#writeBuilderTelemetry` recommendation (still open from R9 item 3, also not yet extracted in R10).

## New debt from R9 commits

- Two new hidden state fields (item 1) — running tally of underscored/loose hidden state fields added across R8+R9: `_eventDrainBudgetTick`, `_zombieSinceSec`, `warehouseDiagnosticSinceSec`, `_starvationPhaseSeeded`, `_starvationPhaseSeeded` reset path. Five fields in two rounds — pattern needs a state-shape doc owner before R11.
- The R9 R8-carryover (`#writeBuilderTelemetry` extraction) is still not done; PX B3 modified the early-return branch (line 369-380) but did not deduplicate the telemetry write at :453-454 / :790-791. Carryover continues into R10.
- `entity.id`-hashed phase offset in MortalitySystem assumes worker.id is a string — `String(entity.id ?? "")` coerces safely, but visitors / animals will hash to 0 (`""` → h=0 → offset=`(0 % 21) - 10 = -10`), giving them a uniform −10s phase shift. Acceptable (only WORKER agents enter starvationSec accumulator per shouldStarve gating), but a comment-asserted invariant rather than a structural one.
- ScoutRoadProposer cap of 30 is hardcoded; comment references `PROCESSING_TARGETS.roads = 30` but the proposer doesn't import that constant. Drift risk if PROCESSING_TARGETS changes.

No regressions to existing debt. No new globals, no new circular imports, no new direct DOM access in simulation, no new BALANCE knob proliferation (R9 added zero new BALANCE.* keys — all magic numbers are module-scope `const`s with comments explaining derivation).

## D-tier status

**2D unchanged.** Both pre-existing D items (ColonyPlanner ~2200-LOC monolith + ColonyPerceiver tile-walk-per-tick) untouched in R9 — neither was in scope for any of the 4 plans. The four R9 commits all hit B-tier on first review; PV's `runOutcome.js#maybeRecordFamineChronicle` is the strongest piece of the round (clean factor, pure, idempotent, single call site). The weakest is the proliferating hidden-underscore-field pattern (top-3 debt item 1), which is contained but trending. Recommend R10 implementer touch the R9-carryover (`#writeBuilderTelemetry` extract) + fold the WarehouseNeedProposer twin walk into one pass — both are mechanical refactors with no behaviour change.
