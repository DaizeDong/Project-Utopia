---
reviewer_id: C1-code-architect
plan_source: assignments/homework7/Final-Polish-Loop/Round1/Plans/C1-code-architect.md
round: 1
date: 2026-05-01
parent_commit: f385318
head_commit: 439b120
status: DONE
track: code
freeze_check: PASS
track_check: PASS
steps_done: 7/7
tests_passed: 1678/1682 (4 pre-existing fails confirmed unrelated; 6 new tests added)
tests_new: test/priority-fsm-generic.test.js
---

## Steps executed
- [x] Step 1: `src/simulation/npc/PriorityFSM.js` — created generic dispatcher (~125 LOC). Constructor takes `{ behavior, transitions, displayLabel, defaultState }`, exposes `tick(entity, state, services, dt)` + `getStats()` + private `_enterState`. Behaviour byte-equivalent to the v0.10.0-e WorkerFSM kernel (lifecycle hook ordering, `target`+`payload` reset, single-write `stateLabel`, self-transition no-op).
- [x] Step 2: `src/simulation/npc/fsm/WorkerFSM.js` — collapsed 124 LOC dispatcher to a ~55 LOC thin facade. Constructs an internal `PriorityFSM` with worker-specific behaviour/transitions/displayLabel injected. `tickWorker(worker, state, services, dt)` and `getStats()` delegate to `this._fsm.tick(...)` and `this._fsm.getStats()` respectively. Class name + method signatures preserved 100%; `WorkerAISystem.js:1653` (the only caller) is unchanged.
- [x] Step 3: `src/dev/forceSpawn.js` — created new module containing the relocated `__devForceSpawnWorkers` helper (with original JSDoc). Behaviour, signature, return shape (`{ spawned, total, fallbackTilesUsed }`), `infraCap` honouring, fallback-tile path, `devStressSpawnTotal` counter, and `isStressWorker` tag all match the previous implementation byte-for-byte. Imports `TILE` / `createWorker` / `listTilesByType` / `randomPassableTile` / `tileToWorld` from their canonical locations (relative paths adjusted for the new module location).
- [x] Step 4: `src/simulation/population/PopulationGrowthSystem.js` — deleted the ~90 LOC inline `__devForceSpawnWorkers` implementation. Replaced with a single named re-export line `export { __devForceSpawnWorkers } from "../../dev/forceSpawn.js"` so callers (`src/app/GameApp.js:21`, `test/long-run-api-shim.test.js:269/288`) require zero changes. Also dropped the now-unused `randomPassableTile` import (the `RecruitmentSystem` itself does not use it; only the dev helper did).
- [x] Step 5: `test/priority-fsm-generic.test.js` — added 6 lock tests covering: (a) bootstrap onEnter + enteredAtSec stamping; (b) priority-walk first-match-wins with onExit→fsm-reset→onEnter→tick(new) ordering on the same dispatcher pass; (c) `entity.stateLabel` clobbered back to `displayLabel[fsm.state]` even when state body tries to overwrite it; (d) `_enterState` resets `target` + `payload` on every transition; (e) self-transition (oldName === newName) is a no-op (no hook fires, no transitionCount bump); (f) empty constructor `new PriorityFSM()` is safe and bootstraps to fallback default state without crashing. Independent of WorkerStates / WorkerTransitions — uses synthetic stub maps.
- [x] Step 6: `src/simulation/npc/fsm/WorkerStates.js` — comment-only updates (3 occurrences). Updated 2 docstring mentions of `WorkerFSM.tickWorker` to note the dispatcher is now a facade over `PriorityFSM.tick`, and one comment near `BUILDING.onEnter` to point at `PriorityFSM._enterState` (still invoked through the WorkerFSM facade) for the rationale on `fsm.target` reset.
- [x] Step 7: `src/entities/EntityFactory.js` — comment-only update (1 occurrence). Notes that `worker.fsm` is allocated lazily by `WorkerFSM.tickWorker` which delegates to `PriorityFSM.tick`.

## Tests
- pre-existing skips: 3 (preserved baseline)
- pre-existing failures (4, all confirmed unrelated to this plan; verified by re-running with the C1 changes stashed):
  - `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires` — `test/food-rate-breakdown.test.js:55` — economy/spoilage assertion drift, not FSM-related.
  - `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role` — `test/phase1-resource-chains.test.js` — role-assignment tuning, not FSM-related.
  - `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)` — defense balance, not FSM-related.
  - `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)` — defense, not FSM-related.
- new tests added: `test/priority-fsm-generic.test.js` (6 tests covering generic dispatcher contract — all pass).
- failures resolved during iteration: none (clean first run).

Targeted test runs verifying invariants:
- `node --test test/v0.10.0-a-fsm-foundation.test.js test/v0.10.0-b-fsm-states.test.js test/v0.10.0-c-fsm-trace-parity.test.js test/worker-fsm-doc-contract.test.js test/priority-fsm-generic.test.js test/long-run-api-shim.test.js` → 55 / 55 pass.

## Deviations from plan
- LOC delta: actual is +469 / -190 = +279 LOC (vs plan estimate +340 / -181 = +159). The PriorityFSM module came in at ~125 LOC and the WorkerFSM facade at ~55 LOC (vs plan estimates of 95 and 30) because preserving the JSDoc + the v0.10.0-e contract docstring (the `worker.stateLabel` single-write rationale) made the new files larger than the bare minimum. Still well under the 400 LOC budget cap.
- The `PriorityFSM` constructor accepts `{ behavior, transitions, displayLabel, defaultState }` as a single options object (vs plan-implied positional). This matches the typical JS injection pattern and is more extensible; tests demonstrate the expected behaviour.
- Step 4 also dropped the unused `randomPassableTile` import in `PopulationGrowthSystem.js` (the `RecruitmentSystem` body does not reference it; only the now-relocated dev helper did). This is the "如该文件中其余 RecruitmentSystem 代码不再用到这些 import" cleanup the plan called out.

## Freeze / Track check 结果
- freeze_check: PASS — no new tile / building / role / mood / mechanic / audio asset / UI panel introduced. Constants in `src/config/constants.js` untouched. `SYSTEM_ORDER` untouched.
- track_check: PASS — only `src/**` and `test/**` files modified. No CHANGELOG.md / README*.md / docs/** / assignments/Plans/Feedbacks edits in this commit.

## Handoff to Validator
- Validator focus 1: facade equivalence — the v0.10.0-e dispatcher contract (single-write `worker.stateLabel`, `worker.fsm` shape + reset semantics on transition, lifecycle hook ordering) is now split between `WorkerFSM` (facade) and `PriorityFSM` (generic kernel). Test/`worker-fsm-doc-contract.test.js` continues to pass; `test/priority-fsm-generic.test.js` locks the generic kernel directly.
- Validator focus 2: re-export shim — `src/app/GameApp.js:21` and `test/long-run-api-shim.test.js:269/288` import `__devForceSpawnWorkers` from `src/simulation/population/PopulationGrowthSystem.js`; the shim there re-exports from `src/dev/forceSpawn.js`. Both shim tests still pass (long-run-api-shim suite green).
- system_order_safe: true verified — `git diff f385318..HEAD -- src/config/constants.js` is empty; `WorkerAISystem.update()` and `WorkerAISystem.js:1653` are untouched.
- 4 pre-existing failures (food-rate-breakdown / phase1-resource-chains quarry / raid-escalator / raid-fallback-scheduler) carried in from parent f385318 and are NOT introduced by this plan; verified by stash-and-rerun.
- FPS / prod-build smoke: not run by this Implementer (Step 8 of plan §6 is optional and budget-bound). Validator may want to spot-check `npx vite build` and a Playwright `__utopiaLongRun.devStressSpawn(50)` from `?dev=1` to confirm the re-export shim resolves at runtime.
