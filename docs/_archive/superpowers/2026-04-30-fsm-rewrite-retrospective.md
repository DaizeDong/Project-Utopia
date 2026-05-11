# v0.10.0 Worker FSM Rewrite — Retrospective

_Date: 2026-04-30. Phase 5 of 5 (v0.10.0-e) is the final commit; this doc
locks the architectural shift in place._

## What the rewrite delivered

v0.10.0 replaced the v0.9.x Job-utility scheduler (utility scoring +
sticky-bonus hysteresis + 13 Job classes + JobRegistry) with a **flat
Priority FSM**: 14 named states, ~30 LOC dispatcher, one priority-ordered
transition table per state. The single source of truth is now
`worker.fsm = { state, enteredAtSec, target, payload }`. The dispatcher
walks `STATE_TRANSITIONS[currentState]` in array order, takes the first
`when()` that fires, calls onExit/onEnter to swap, then ticks the
(possibly new) state body.

The plan target was -1300 LOC; **shipped -2530 LOC** across `src/` +
`test/` (981 insertions, 3511 deletions, 35 files; commits
`ccef1ef..db99234` plus this phase). The over-delivery came from the
v0.9.x `jobs/` directory deleting wholesale (3300 LOC) and four Job-only
test files retiring (the test-side primitive harnesses had been duplicated
by `test/job-reservation.test.js`).

The five phases:

| Phase | Title | Key delta | Commit |
|---|---|---|---|
| **0.10.0-a** | FSM foundation | +200 LOC: dispatcher + STATE_BEHAVIOR + STATE_TRANSITIONS skeletons; FEATURE_FLAGS.USE_FSM default OFF | `ccef1ef` |
| **0.10.0-b** | State bodies + transitions | ~+400 LOC: 14 onEnter/tick/onExit triples, full transition table (still flag-OFF) | `e497d02` |
| **0.10.0-c** | Trace-parity validation | +322 LOC test, 3 iteration fixes in WorkerStates/WorkerConditions/WorkerTransitions; all 7 A-G scenarios pass against v0.9.4 baseline | `26e23c3` |
| **0.10.0-d** | Flag flip + Job retire | -3297 LOC net: USE_FSM default ON, USE_JOB_LAYER removed, `src/simulation/npc/jobs/` deleted, 3 onEnter target leaks shaken out (HARVESTING/BUILDING/DEPOSITING) | `db99234` |
| **0.10.0-e** | stateLabel collapse + audit | _this commit_ — dispatcher writes `worker.stateLabel` from DISPLAY_LABEL[fsm.state] (single-write); `currentJob` field dropped from EntityFactory; stale Job-layer comments swept; integration audit | _this commit_ |

## Bugs caught between phases

**Phase c iteration fixes (uncovered by trace-parity at flag-ON):**

1. **SEEKING_FOOD blacklist + path lifecycle (iter 1).** In scenario E
   (walled warehouse), 12 workers wedged because `SEEKING_FOOD.onEnter`
   unconditionally targeted the warehouse, ignoring reachability. Added
   `allWarehousesBlacklistedForFsm()` short-circuit to mirror
   v0.9.4 JobEat.canTake; carry-eat fallback when every warehouse is
   blacklisted for the worker.
2. **EATING latch on empty stockpile (iter 2).** When the colony food
   stockpile drained mid-meal, EATING latched (no transition fired) and
   workers never harvested again → famine in scenario F. Added
   `noFoodAvailable` transition: EATING → IDLE when colony is dry.
3. **`lastSuccessfulPathSec` stamping (iter 3).** The trace harness's
   path-fail-loops metric counts `pathLen=0 + stale lastSuccessfulPathSec`
   against the worker. Carry-eat targets are the worker's own tile, so
   pathLen is naturally 0. Without stamping `lastSuccessfulPathSec` on
   carry-eat ticks, healthy carry-eat looked like path failure. Added
   stamp in EATING.tick + SEEKING_FOOD.tick carry-eat branch.

**Phase d onEnter target leaks (uncovered by full suite at flag-ON
default):**

1. **`HARVESTING.onEnter` did not lift `worker.targetTile` into
   `worker.fsm.target`.** The dispatcher resets `fsm.target=null` on
   every transition (deliberate per WorkerFSM `_enterState`), so
   HARVESTING.tick's `if (!t) return;` early-exited every tick after
   `SEEKING_HARVEST → HARVESTING`. Yield was zero. Fix: HARVESTING.onEnter
   copies `worker.targetTile` into `worker.fsm.target` before reserving.
2. **`BUILDING.onEnter` did not refetch the builder site.** Same root
   cause; BUILDING.tick's `if (!t) return;` skipped
   `applyConstructionWork` indefinitely. Fix: idempotent
   `findOrReserveBuilderSite` call writes site coords into
   `worker.fsm.target`.
3. **`DEPOSITING.onEnter` left `fsm.target=null`.** `handleDeliver` reads
   `worker.targetTile` so unloads still happened, but the invariant
   "every state body can read its own fsm.target" was violated. Fix:
   lift `worker.targetTile` into `fsm.target` in DEPOSITING.onEnter.

The shared root cause — "the dispatcher resets fsm.target on every
transition; states that need a target after onEnter must re-set it" — is
documented in WorkerFSM `_enterState` and now consistently handled across
all six states that need a target.

## What worked well

- **Named transitions are readable.** `{ priority: 1, to: SEEKING_FOOD,
  when: hungryAndFoodAvailable }` reads as English. Compared to the
  v0.9.x JobScheduler's "score every Job, pick max with sticky bonus
  decay over 30 s," the FSM's "first matching predicate wins" is
  exhaustively traceable.
- **Single dispatcher, single source of truth.** `worker.fsm.state` is
  the only place behaviour lives. Debugging is `console.log(worker.fsm)`
  (not `console.log({ currentJob, blackboard.intent, stateLabel,
  debug.lastIntent })` cross-checked against four sub-systems).
- **Behaviour-equivalence guarded by trace harness.** Phase c's 5 hard
  gates (alive count, eat-commit p95, same-tile production, stuck>3s,
  path-fail-loops) caught the iter-1/2/3 bugs at flag-OFF before they
  reached production. The harness re-ran post-flip in phase d as a
  trivial self-comparison (still useful as a regression net).
- **Survival bypass became natural.** v0.9.4 `isSurvivalCritical` was a
  patch on top of hysteresis. In the FSM, SURVIVAL_FOOD has
  `priority: 1` in HARVESTING's transition list (above DELIVERING's
  `priority: 5`), and a hungry harvester just preempts. No bypass logic
  exists; it's the natural priority order.
- **Reusable transition rows.** COMBAT_PREEMPT, SURVIVAL_FOOD,
  SURVIVAL_REST, PATH_FAIL_FALLBACK are defined once and spread into
  per-state lists. Each state ends up with ~5 transitions (mostly
  shared); ~30 unique conditions cover all 14 states.

## Metric table

| Metric (per scenario) | v0.9.0-e | v0.10.0-c (FSM, flag-OFF) | v0.10.0-d (FSM, flag-ON) |
|---|---|---|---|
| A stuck>3s              | 0  | 0  | 0  |
| B stuck>3s              | 0  | 0  | 0  |
| C stuck>3s              | 1  | 1  | 1  |
| D stuck>3s              | 1  | 1  | 1  |
| E stuck>3s              | 5  | 0  | 0  |
| F stuck>3s              | 2  | 2  | 2  |
| G stuck>3s              | 1  | 1  | 1  |
| Deaths (D, 60s)         | 0  | 0  | 0  |
| eat-commit p95 (D)      | baseline | ≤ ×1.25 | ≤ ×1.25 |
| same-tile prod (C)      | 0  | ≤ 1 | ≤ 1 |

Scenario E (walled warehouse): FSM cuts stuck>3s from 5 → 0 because the
carry-eat fallback in SEEKING_FOOD.onEnter routes around an unreachable
warehouse instead of orbiting it.

## What deferred to v0.10.1+

- **At-warehouse fast-eat semantics.** EATING currently uses the
  cooldown-gated `consumeEmergencyRation` path for yield-equivalence
  with v0.9.4. Switching to a real "arrived at warehouse → fast-eat"
  body would either require tuning warehouse intake caps to prevent the
  scenario-F stampede regression (12 deaths when 16 workers piled into
  the warehouse and drained the stockpile in 200s) or accepting that
  regression as a balance change. Either way it's a v0.10.1+ design
  call, not a parity-blocking issue.
- **Legacy display FSM (StatePlanner + StateGraph) still ticks.** The
  display FSM at `src/simulation/npc/state/` runs in parallel with the
  Priority FSM, populating `entity.blackboard.fsm.state` for legacy UI
  consumers (WorldSummary, NPCBrainAnalytics, EntityFocusPanel's
  blackboard.fsm.path display). The work to cut UI consumers over to
  read `worker.fsm.state` directly was punted from phase e because
  Visitor and Animal AI also read from the legacy display FSM and would
  need their own migration.
- **`worker.debug.lastIntent` redundancy.** With the FSM single-writing
  `worker.stateLabel` and `worker.blackboard.intent`, the
  `worker.debug.lastIntent` field is now strictly redundant. Removing it
  cascades into every test that sets it as fixture; deferred to a focused
  cleanup phase.
- **`commitmentCycle` vestige in tests.** The string "commitmentCycle"
  still appears in 1 test comment (`worker-intent-stability.test.js:217`)
  as historical context. Pure documentation; behaviourally inert.
- **Faction-aware reachability.** Inherited from v0.9.0 retrospective
  forward pointers — still open. Today the `ReachabilityCache` is
  per-tile-type; a stranded WOOD worker on island #2 still probes every
  LUMBER tile on island #1 before giving up.

## Total LOC delta

Range `26e23c3^..HEAD` (this commit), `src/` + `test/`:

- **+981 insertions, -3511 deletions = net -2530 LOC**
- Plan target was -1300 LOC; **over-delivered by 2.0×**.

The over-delivery came from `src/simulation/npc/jobs/` deleting wholesale
(3300 LOC across 19 files) and four Job-only test files retiring
(`job-extended`, `job-harvest`, `job-layer-foundation`,
`v0.9.4-starvation`). The new FSM weighs in at ~700 LOC across 5 files
(`WorkerFSM.js`, `WorkerStates.js`, `WorkerTransitions.js`,
`WorkerConditions.js`, `WorkerHelpers.js`).

## Forward pointers

In priority order (deferred from v0.10.0 audit to v0.10.1+):

- **Cut UI consumers off `entity.blackboard.fsm.state`.** Migrate
  EntityFocusPanel, WorldSummary, NPCBrainAnalytics to read
  `worker.fsm.state` directly. Frees `src/simulation/npc/state/` to be
  scoped to Visitor + Animal AI only.
- **Drop `worker.debug.lastIntent`.** Pure redundancy now.
- **Faction-aware reachability cache.** Today's per-tile-type cache
  doesn't disambiguate islands; a stranded worker probes the wrong
  component repeatedly.
- **At-warehouse fast-eat.** Re-tune warehouse intake cap or accept the
  scenario-F balance shift; either way switch EATING from cooldown-gated
  to arrival-gated.
- **HFSM extension.** With 14 flat states the table is readable, but
  combat states could group ("guard parent state") to share transitions
  cleanly. Not urgent.
