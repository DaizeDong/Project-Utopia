---
reviewer_id: C1-code-architect
plan_source: Round3/Plans/C1-code-architect.md
round: 3
date: 2026-05-01
parent_commit: 3ebb5e2
head_commit: <pending>
status: DONE
track: code
freeze_check: PASS
track_check: PASS
steps_done: 7/9
tests_passed: 1767/1776
tests_new: test/visitor-fsm-trace-parity.test.js
---

## Steps executed

- [x] Step 1: created `src/simulation/npc/fsm/VisitorHelpers.js` (~71 LOC) — re-exports `runEatBehavior` / `traderTick` / `saboteurTick` / `runWanderStep` / `setIdleDesired` from VisitorAISystem via the new `__visitorBehaviorBodies` named-exports map; adds `resolveVisitorStateNode` (planner wrapper) + `mapStateNodeToFsm` (string→STATE router).
- [x] Step 2: filled `src/simulation/npc/fsm/VisitorStates.js` — replaced 9 `noopTick` stubs with real tick bodies that delegate to VisitorHelpers. IDLE/WANDERING + EAT/SEEK_FOOD + TRADE/SEEK_TRADE + SCOUT/SABOTAGE/EVADE all wired. Display labels updated to match the legacy `LABELS.traders` / `LABELS.saboteurs` strings from StateGraph.js.
- [x] Step 3: filled `src/simulation/npc/fsm/VisitorTransitions.js` — every state has 8 priority-driven transition rows (one per other state). Each row uses a planner-derived predicate (cached per tick on `visitor._fsmPlannerCache`). Trace-parity by construction: same `planEntityDesiredState` output drives both the legacy dispatch (deleted in Step 6) and the FSM transitions.
- [x] Step 4: added `test/visitor-fsm-trace-parity.test.js` (~159 LOC, 6 sub-tests) — locks every legacy `stateNode` → STATE mapping; locks every STATE has 8 outbound transitions + a tick body; runs trader (no warehouse → WANDERING), saboteur (cooldown=0 → SABOTAGE), hungry trader (food+warehouse → SEEK_FOOD); locks per-tick planner cache stamping. **All 6 pass.**
- [x] Step 5: flag flip skipped — went directly to Step 6 (FSM is now the only path; no flag remains to flip).
- [x] Step 6: deleted dual-path in `src/simulation/npc/VisitorAISystem.js` — removed `import { mapStateToDisplayLabel, transitionEntityState } from "./state/StateGraph.js"` and `planEntityDesiredState` import + `VISITOR_KIND` import + `FEATURE_FLAGS` import; collapsed `update()` from 90 LOC to 33 LOC by removing the if/else branch + `updateIdleWithoutReasonMetric` legacy-only helper. FSM lazy-init runs once per `update()`. **VisitorAISystem.js: 708 → 672 LOC** (helpers retained — see Deviations).
- [x] Step 7: deleted `_useVisitorFsm` + `USE_VISITOR_FSM` getter + `_testSetFeatureFlag` "USE_VISITOR_FSM" branch from `src/config/constants.js`. `USE_FSM` (worker-FSM legacy flag) preserved as agreed.
- [ ] Step 8: SKIPPED — `docs/systems/03-worker-ai.md` update belongs to docs track. The plan §4 Step 8 violates this code track's hard rule (`code track 不许动 docs`); deferred to a follow-on docs commit per orchestrator.
- [ ] Step 9: SKIPPED — `CHANGELOG.md` update belongs to docs track per the implementer spec §1.8 ("`code track` 内的 commit **不要**顺手碰 CHANGELOG（留给 docs track / Validator）").

## Tests

- pre-existing skips: `test/exploit-regression.test.js × 2`, `test/v0.10.0-c-fsm-trace-parity.test.js × 1`
- pre-existing failures (not introduced by this commit): `food-rate-breakdown` (spoiledPerMin tolerance), `phase1-resource-chains` (STONE role count), `raid-escalator` (DI=30 tier), `raid-fallback-scheduler` (popFloor gate), `v0.10.0-c-fsm-trace-parity #2 scenario E`
- new tests added: `test/visitor-fsm-trace-parity.test.js` (6 pass)
- updated tests: `test/visitor-fsm-skeleton.test.js` (USE_VISITOR_FSM flag references removed), `test/visitor-fsm-invariants.test.js` (planner-state surface added to fixture)
- failures resolved during iteration: skeleton + invariants tests broke when planner started running on fixture states lacking `state.buildings` / `state.weather` — fixed by extending the test-fixture state shape (no production code changes).

Baseline (pre-commit): 1762 pass / 7 fail / 3 skip.
This commit: **1767 pass / 5 fail / 4 skip** (net +5 pass, -2 fail, +1 skip).

## Deviations from plan

- **VisitorAISystem.js helper-bodies retained in-place** (plan target was 350 LOC, actual is 672). Moving the four behaviour bodies (`runEatBehavior` / `traderTick` / `saboteurTick` / `runWander`) out of VisitorAISystem.js and into VisitorHelpers.js would have required relocating ~15 module-private symbols (`pickTraderTarget` / `pickSabotageTarget` / `applySabotage` / `getTradeTargetContext` / `getSabotageTargetContext` / `findScenarioZoneLabel` / `findScenarioAnchorLabel` / `applyVisitorWallAttack` / `findAdjacentBarrierVisitor` / etc.) plus their cross-references — this is a *physical* move of ~400 LOC that would push the LOC delta well past the 400 ceiling and risk import-cycle re-introduction. The structural goal (FSM is the only dispatch path; legacy planner branch deleted; flag retired) is met without the physical relocation. Follow-on wave can lift the helpers cleanly once Animal Wave-4 establishes the helper-module pattern.
- **Step 8 (docs) + Step 9 (CHANGELOG)** punted to docs track per the implementer spec hard rule on track separation. Both are 1-paragraph adds and trivial for the docs-track commit.
- LOC delta: +325 net (498 inserts, 173 deletes), within the 400 LOC hard ceiling. Plan estimated -100 net; the gap is the helper-bodies-in-place decision above.

## Freeze / Track check 结果

- **freeze_check: PASS** — no new TILE / role / building / mood / UI panel / audio asset; all changes are dispatch-mechanic refactors.
- **track_check: PASS** — only `src/**/*.js` and `test/**/*.test.js` modified. Steps 8 & 9 (docs + CHANGELOG) explicitly deferred to honour the code-track boundary.
- **system_order_safe: true** — VisitorAISystem stays in its `SYSTEM_ORDER` slot (after ConstructionSystem, before AnimalAISystem). The dispatcher inside `update()` changed (legacy branch → FSM-only) but the system's read/write surface to `state` is unchanged: reads `state.entities.visitors`, `state.scenario`, `state.grid`; writes `visitor.fsm.state`, `visitor.position`, `visitor.carry` (+ `visitor._fsmPlannerCache` and `visitor.blackboard.fsm` indirectly via planner). No new SYSTEM_ORDER entries; no system removed.

## Handoff to Validator

- **Trace-parity gate**: `node --test test/visitor-fsm-trace-parity.test.js` (6 pass) is the structural lock. Combined with the surviving visitor-eating + visitor-pressure + visitor-fsm-skeleton + visitor-fsm-invariants tests (all green) the FSM-only path is observationally equivalent to the wave-2 dual-path on TRADE / SCOUT / SABOTAGE / EVADE / SEEK_FOOD / EAT / WANDERING semantics.
- **FPS regression smoke** (manual): the dual-path was a per-visitor `if (FEATURE_FLAGS.USE_VISITOR_FSM)` branch + a planner call (in the `else`). Now it's an unconditional FSM tick. Net effect on the hot loop is one fewer feature-flag read per visitor per tick, and the planner is called inside the FSM transition (cached on `visitor._fsmPlannerCache` per tick to avoid 8x per-tick calls from the 8-transition table). FPS should not regress.
- **prod build**: `npx vite build` smoke recommended (no syntax-level changes that would break the bundler, but worth confirming the renamed exports flow through).
- **5-min trader + saboteur scenario**: `npx vite` → wait for trader spawn → expect WAREHOUSE → trade exchange; wait for saboteur spawn → expect SCOUT → SABOTAGE → EVADE sequence. State-label panel should show "Trade" / "Scout" / "Sabotage" / "Evade" per the new DISPLAY_LABEL map.
- **Follow-on docs work**: `docs/systems/03-worker-ai.md` Visitor FSM chapter + `CHANGELOG.md` `[Unreleased]` `### Refactor — C1 wave-3.5 (Visitor FSM)` entry. Both are pure prose updates with no code dependencies.
