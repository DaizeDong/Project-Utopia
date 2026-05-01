// v0.10.0-b — Worker FSM priority-ordered transition table. Phase 2 of 5
// in the Priority-FSM rewrite per
// docs/superpowers/plans/2026-04-30-worker-fsm-rewrite-plan.md §3.5.
//
// Each state maps to a list of `{ priority, to, when }` entries. The
// dispatcher walks the list in order and takes the first match, so the list
// MUST be sorted by ascending `priority` (lower number = higher urgency).
// `priority` is informational metadata for tooling/tests; the runtime only
// honours array order.
//
// Phase b populates per the §3.5 state-transition diagram. To avoid the §9
// "transition group bloat" risk, four reusable rows
// (COMBAT_PREEMPT / SURVIVAL_REST / PATH_FAIL_FALLBACK)
// are defined once here and spread into per-state lists. Per-state-specific
// transitions (e.g. HARVESTING → DELIVERING when carry full) are inlined.
//
// Net layout: ~12 states × avg 4 transitions ≈ 48 entries; helper rows
// mean ~25 unique conditions across all of them.

import {
  arrivedAtFsmTarget,
  buildAvailableForRole,
  carryEmpty,
  carryFull,
  fsmTargetGone,
  fsmTargetNull,
  harvestAvailableForRole,
  hostileInAggroRadiusForGuard,
  noHostileInRange,
  pathFailedRecently,
  processAvailableForRole,
  processInputDepleted,
  restRecovered,
  shouldDeliverCarry,
  tooTired,
  yieldPoolDriedUp,
} from "./WorkerConditions.js";
import { STATE } from "./WorkerStates.js";

/**
 * @typedef {Object} Transition
 * @property {number} priority — Sort key; lower wins. Dispatcher honours the
 *   list order, so callers MUST insert pre-sorted.
 * @property {string} to — Destination state name from STATE.
 * @property {(worker: any, state: any, services: any) => boolean} when
 *   — Pure deterministic predicate. Same inputs ⇒ same answer.
 */

// Reusable transition rows. Spread these into per-state lists below.

const COMBAT_PREEMPT = Object.freeze({
  priority: 0, to: STATE.FIGHTING, when: hostileInAggroRadiusForGuard,
});
const SURVIVAL_REST = Object.freeze({
  priority: 2, to: STATE.SEEKING_REST, when: tooTired,
});
const PATH_FAIL_FALLBACK = Object.freeze({
  priority: 9, to: STATE.IDLE, when: pathFailedRecently,
});

// Exported so tests can assert priority-0 entries.
export const _TRANSITION_ROWS = Object.freeze({
  COMBAT_PREEMPT, SURVIVAL_REST, PATH_FAIL_FALLBACK,
});

// Per-state transitions

const IDLE_TRANSITIONS = Object.freeze([
  COMBAT_PREEMPT,
  SURVIVAL_REST,
  // Carry haul: if we have stuff to deliver, do that first.
  { priority: 3, to: STATE.DELIVERING, when: shouldDeliverCarry },
  // Construction.
  { priority: 4, to: STATE.SEEKING_BUILD, when: buildAvailableForRole },
  // Processing (cook/smith/herbalist with raw inputs available).
  { priority: 5, to: STATE.SEEKING_PROCESS, when: processAvailableForRole },
  // Harvest as the default economy choice.
  { priority: 6, to: STATE.SEEKING_HARVEST, when: harvestAvailableForRole },
]);

const SEEKING_REST_TRANSITIONS = Object.freeze([
  COMBAT_PREEMPT,
  { priority: 3, to: STATE.RESTING, when: arrivedAtFsmTarget },
]);

const RESTING_TRANSITIONS = Object.freeze([
  COMBAT_PREEMPT,
  { priority: 2, to: STATE.IDLE, when: restRecovered },
]);

const FIGHTING_TRANSITIONS = Object.freeze([
  // No more hostile → drop back to IDLE.
  { priority: 0, to: STATE.IDLE, when: noHostileInRange },
]);

const SEEKING_HARVEST_TRANSITIONS = Object.freeze([
  COMBAT_PREEMPT,
  SURVIVAL_REST,
  { priority: 3, to: STATE.HARVESTING, when: arrivedAtFsmTarget },
  // v0.10.0-c — onEnter may set target=null when chooseWorkerTarget can't
  // find an eligible tile. Drop back to IDLE.
  { priority: 7, to: STATE.IDLE, when: fsmTargetNull },
  { priority: 8, to: STATE.IDLE, when: yieldPoolDriedUp },
  PATH_FAIL_FALLBACK,
]);

const HARVESTING_TRANSITIONS = Object.freeze([
  COMBAT_PREEMPT,
  SURVIVAL_REST,
  { priority: 5, to: STATE.DELIVERING, when: carryFull },
  // Yield-pool dried up + carry empty → reset to IDLE.
  { priority: 8, to: STATE.IDLE, when: (worker, state, services) => {
    if (!yieldPoolDriedUp(worker, state, services)) return false;
    return carryEmpty(worker, state, services);
  } },
]);

const DELIVERING_TRANSITIONS = Object.freeze([
  COMBAT_PREEMPT,
  { priority: 3, to: STATE.DEPOSITING, when: arrivedAtFsmTarget },
  // v0.10.0-c — onEnter may set target=null (no warehouse). Bail to IDLE.
  { priority: 7, to: STATE.IDLE, when: fsmTargetNull },
  PATH_FAIL_FALLBACK,
]);

const DEPOSITING_TRANSITIONS = Object.freeze([
  COMBAT_PREEMPT,
  { priority: 1, to: STATE.IDLE, when: carryEmpty },
]);

const SEEKING_BUILD_TRANSITIONS = Object.freeze([
  COMBAT_PREEMPT,
  SURVIVAL_REST,
  { priority: 3, to: STATE.BUILDING, when: arrivedAtFsmTarget },
  // v0.10.0-c — onEnter may set target=null (no eligible site). Bail to IDLE.
  { priority: 7, to: STATE.IDLE, when: fsmTargetNull },
  { priority: 8, to: STATE.IDLE, when: fsmTargetGone },
  PATH_FAIL_FALLBACK,
]);

const BUILDING_TRANSITIONS = Object.freeze([
  COMBAT_PREEMPT,
  // Construction site finished or removed.
  { priority: 5, to: STATE.IDLE, when: fsmTargetGone },
]);

const SEEKING_PROCESS_TRANSITIONS = Object.freeze([
  COMBAT_PREEMPT,
  SURVIVAL_REST,
  { priority: 3, to: STATE.PROCESSING, when: arrivedAtFsmTarget },
  // v0.10.0-c — onEnter may set target=null (no eligible processing tile).
  { priority: 7, to: STATE.IDLE, when: fsmTargetNull },
  PATH_FAIL_FALLBACK,
]);

const PROCESSING_TRANSITIONS = Object.freeze([
  COMBAT_PREEMPT,
  // Raw inputs depleted → ProcessingSystem can't run. Fall back to IDLE.
  { priority: 5, to: STATE.IDLE, when: processInputDepleted },
]);

// STATE_TRANSITIONS map

/**
 * Phase-b STATE_TRANSITIONS map. Each list is sorted by ascending priority;
 * the dispatcher walks each list in order on every dispatcher pass and takes
 * the first match.
 *
 * @type {Readonly<Record<string, ReadonlyArray<Transition>>>}
 */
export const STATE_TRANSITIONS = Object.freeze({
  [STATE.IDLE]: IDLE_TRANSITIONS,
  [STATE.SEEKING_REST]: SEEKING_REST_TRANSITIONS,
  [STATE.RESTING]: RESTING_TRANSITIONS,
  [STATE.FIGHTING]: FIGHTING_TRANSITIONS,
  [STATE.SEEKING_HARVEST]: SEEKING_HARVEST_TRANSITIONS,
  [STATE.HARVESTING]: HARVESTING_TRANSITIONS,
  [STATE.DELIVERING]: DELIVERING_TRANSITIONS,
  [STATE.DEPOSITING]: DEPOSITING_TRANSITIONS,
  [STATE.SEEKING_BUILD]: SEEKING_BUILD_TRANSITIONS,
  [STATE.BUILDING]: BUILDING_TRANSITIONS,
  [STATE.SEEKING_PROCESS]: SEEKING_PROCESS_TRANSITIONS,
  [STATE.PROCESSING]: PROCESSING_TRANSITIONS,
});
