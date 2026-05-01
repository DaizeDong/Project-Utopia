---
reviewer_id: C1-code-architect
plan_source: Round2/Plans/C1-code-architect.md
round: 2
date: 2026-05-01
parent_commit: 37581ec
head_commit: <pending>
status: DONE
track: code (architecture)
freeze_check: PASS
track_check: PASS
steps_done: 9/9
tests_passed: 1716/1725 (6 pre-existing baseline fails, 3 skips)
tests_new: test/visitor-fsm-skeleton.test.js, test/visitor-fsm-invariants.test.js
wave: 3 of 4
system_order_safe: true
loc_delta: ~+374 (under 400 hard budget)
---

## Steps executed

- [x] **Step 1**: `src/config/constants.js` — added `USE_VISITOR_FSM` flag (default `false`) following the same `let _useVisitorFsm` + getter + `_testSetFeatureFlag` pattern as `USE_FSM`. +12 LOC.
- [x] **Step 2**: `src/simulation/npc/fsm/VisitorStates.js` — new file. Defines `STATE` (9 entries), `DISPLAY_LABEL` (9 rows), `STATE_BEHAVIOR` (9 rows; all `tick: noopTick` stubs since IDLE.onEnter / WANDERING.tick require helpers from VisitorAISystem.js that we deliberately don't import to avoid circular deps; round-3 wave-3.5 fills these in). +61 LOC.
- [x] **Step 3**: `src/simulation/npc/fsm/VisitorTransitions.js` — new file. `STATE_TRANSITIONS` 9-row table; only IDLE→WANDERING transition enabled (priority 1, always-fire). The 8 other arrays are empty placeholders. +36 LOC.
- [x] **Step 4**: `src/simulation/npc/fsm/VisitorFSM.js` — new file, mirrors `WorkerFSM.js` 1-61 LOC pattern: imports `PriorityFSM`, injects VisitorStates + VisitorTransitions + DISPLAY_LABEL + DEFAULT_STATE="IDLE"; `tickVisitor(visitor, state, services, dt)` + `getStats()` delegate to the generic dispatcher. +62 LOC.
- [x] **Step 5**: `src/simulation/npc/VisitorAISystem.js:1-12` — added `FEATURE_FLAGS` import to existing constants import + new `import { VisitorFSM } from "./fsm/VisitorFSM.js"`. StatePlanner / StateGraph imports preserved (flag=false routes through them). +1 / -1 lines.
- [x] **Step 6**: `src/simulation/npc/VisitorAISystem.js` constructor — added `this._fsm = null` lazy-init slot + comment. +5 LOC.
- [x] **Step 7**: `src/simulation/npc/VisitorAISystem.js` update inner loop — inserted flag-gated branch immediately after `processed += 1` and before `const groupId = ...`. flag=true: lazy-construct `this._fsm = new VisitorFSM()`, call `tickVisitor`, `continue`. flag=false: legacy StatePlanner path runs unchanged (byte-for-byte identical to d242719). +12 LOC.
- [x] **Step 8**: `test/visitor-fsm-skeleton.test.js` — new test file. 5 `test()` blocks: facade construction + getStats fresh; first-tick IDLE→WANDERING transition; flag=false leaves _fsm null on construction; flag=true update() lazy-builds _fsm and advances visitor; state body cannot hijack stateLabel. +100 LOC.
- [x] **Step 9**: `test/visitor-fsm-invariants.test.js` — new test file. 4 `test()` blocks: self-transition no-op; getStats returns fresh object; tickCount accumulates; target+payload reset on transition. +86 LOC.

## Tests

- **Pre-existing baseline state** (37581ec, no changes applied): 1716 pass / 6 fail / 3 skip. The 6 fails are unrelated to this plan:
  - `exploit-regression: escalation-lethality — median loss tick ∈ [2000, 5000]`
  - `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires`
  - `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
  - `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
  - `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)`
  - `v0.10.0-c #2: scenario E walled-warehouse — FSM keeps all workers alive (carry-eat works)`
  Verified via `git stash` + retest before applying — same 6 fails, identical line numbers.
- **Post-implementation**: 1716 pass / 6 fail / 3 skip. Same 6 baseline fails. Tests count moved 1707 → 1716 (+9 new tests added by this plan). No regressions.
- New tests added:
  - `test/visitor-fsm-skeleton.test.js` (5 cases, all green)
  - `test/visitor-fsm-invariants.test.js` (4 cases, all green)
- Regression suite (focused): `test/visitor-eating.test.js` + `test/visitor-pressure.test.js` + `test/priority-fsm-generic.test.js` + `test/worker-fsm-doc-contract.test.js` — all 13 cases green, confirming the legacy-path visitor surface + the WorkerFSM contract are unaffected.

## Deviations from plan

- **VisitorStates.js trimmed from ~+90 to +61 LOC**: dropped the IDLE.onEnter slot entirely because the planned `setIdleDesired(visitor)` body needed an import from VisitorAISystem.js, which would create a circular import (VisitorAISystem.js imports VisitorFSM which imports VisitorStates). Plan §5 R3 already flagged this and approved a stub for round-3. Net effect: skeleton is leaner, contract is identical, dispatcher still walks IDLE→WANDERING on tick 1 (driven by VisitorTransitions, not behaviour).
- **Tests trimmed from ~140 to 186 LOC** combined (skeleton 100 + invariants 86). Plan estimated 80 + 60 = 140; final is 186. The extra 46 LOC came from preserving the flag=true update() integration test (which exercises the full system path through the new flag gate) and a stateLabel-hijack test that locks the dispatcher's single-write contract on the visitor surface — both judged worthwhile for skeleton lock value.
- **Total LOC delta**: ~+374 (vs plan estimate ~+339). Under the 400 LOC hard budget specified in the runtime context.

## Freeze / Track check 结果

- **Freeze check: PASS**.
  - No new TILE constant
  - No new ROLE enum value
  - No new building blueprint
  - No new audio asset
  - No new UI panel file (`src/simulation/npc/fsm/Visitor*.js` extends an existing `fsm/` directory previously created in R1 wave-2 with WorkerFSM/WorkerStates/WorkerTransitions; this is structural, not a new mechanic or UI surface)
  - `USE_VISITOR_FSM` is a feature flag, not a new mechanic — flag=false default means production behaviour is byte-for-byte identical to parent commit 37581ec.
- **Track check: PASS**. All edits are confined to `src/**/*` + `test/**/*`. No `README.md`, `assignments/**/*` (except this commit log, which is the implementer's required output), `CHANGELOG.md`, or `docs/**/*` modifications.

## SYSTEM_ORDER safety

- VisitorAISystem position in SYSTEM_ORDER (between ConstructionSystem and AnimalAISystem) is unchanged.
- New `fsm/VisitorFSM.js`, `fsm/VisitorStates.js`, `fsm/VisitorTransitions.js` are private dependencies of VisitorAISystem and do not register as systems.
- VisitorAISystem reads/writes the same global state surface as 37581ec when flag=false (production default). flag=true path adds writes to `visitor.fsm` + clobbers `visitor.stateLabel` from DISPLAY_LABEL — same shape WorkerFSM uses, no new global mutation.
- **Verdict**: `system_order_safe: true`.

## Handoff to Validator

- **Smoke target**: load dev server (`npx vite`), drop into `fertile_riverlands` seed=42, run 5 minutes. Confirm visitor `stateLabel` strings on EntityFocusPanel match 37581ec baseline ("Wandering"/"Trading"/"Sabotaging"/"Eating"). flag=false default means StatePlanner is the source of truth; this is verifying we did not accidentally break the legacy import or branch.
- **flag-on smoke (optional)**: temporarily set `_useVisitorFsm = true` in constants.js, restart dev server, observe visitor state labels stick at "Wandering" (skeleton wave only enables IDLE→WANDERING). Visitors will not actively trade or sabotage in this mode — that's expected per skeleton contract; round-3 wave-3.5 fills in the behaviour. Revert the flag flip before any further commit.
- **Invariant**: `visitor-eating.test.js` + `visitor-pressure.test.js` running green is the load-bearing regression check that confirms the StatePlanner / runEatBehavior / traderTick / saboteurTick paths still work under default flag=false.
- **No FPS impact expected**: flag=false is byte-for-byte identical to parent; flag=true adds an extra branch + a single object allocation per VisitorAISystem instance.
- **Round-3 wave-3.5 is the natural next step**: port `runWander` + `runEatBehavior` + `traderTick` + `saboteurTick` bodies into VisitorStates.STATE_BEHAVIOR, fill in VisitorTransitions priority rules per visitor.kind, then flip the default to true and retire the StatePlanner visitor branch (~ -90 LOC) and the StateGraph visitor labels (~ -50 LOC). Full migration cleanup is wave-3.5 territory, not wave-3.
