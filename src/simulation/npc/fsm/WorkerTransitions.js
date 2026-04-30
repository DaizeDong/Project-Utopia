// v0.10.0-a — Worker FSM priority-ordered transition table. Phase 1 of
// 5 in the Priority-FSM rewrite per
// docs/superpowers/plans/2026-04-30-worker-fsm-rewrite-plan.md §3.1.
//
// Each state maps to a list of `{ priority, to, when }` entries. The
// dispatcher walks the list in order and takes the first match, so the
// list MUST be sorted by ascending `priority` (lower number = higher
// urgency). `priority` is informational metadata for tooling/tests; the
// runtime only honours array order.
//
// Phase a — every list is empty. With FEATURE_FLAGS.USE_FSM=false this
// table is never consulted in production. With the flag flipped ON in a
// test, an empty transitions list keeps every worker pinned in IDLE
// forever (the dispatcher falls through to the no-op IDLE.tick). Phase
// 0.10.0-b populates the lists per the §3.5 state-transition diagram.

import { STATE } from "./WorkerStates.js";

/**
 * @typedef {Object} Transition
 * @property {number} priority — Sort key; lower wins. Dispatcher honours
 *   the list order, so callers MUST insert pre-sorted.
 * @property {string} to — Destination state name from STATE.
 * @property {(worker: any, state: any, services: any) => boolean} when
 *   — Pure deterministic predicate. Same inputs ⇒ same answer.
 */

/**
 * Phase-a STATE_TRANSITIONS map. Every state's list is a frozen empty
 * array. Phase 0.10.0-b populates these per
 * docs/superpowers/plans/2026-04-30-worker-fsm-rewrite-plan.md §3.5
 * (state-transition diagram) and the example IDLE/HARVESTING/SEEKING_*
 * lists in §3.1.
 *
 * @type {Readonly<Record<string, ReadonlyArray<Transition>>>}
 */
export const STATE_TRANSITIONS = Object.freeze({
  [STATE.IDLE]: Object.freeze([]),
  [STATE.SEEKING_FOOD]: Object.freeze([]),
  [STATE.EATING]: Object.freeze([]),
  [STATE.SEEKING_REST]: Object.freeze([]),
  [STATE.RESTING]: Object.freeze([]),
  [STATE.FIGHTING]: Object.freeze([]),
  [STATE.SEEKING_HARVEST]: Object.freeze([]),
  [STATE.HARVESTING]: Object.freeze([]),
  [STATE.DELIVERING]: Object.freeze([]),
  [STATE.DEPOSITING]: Object.freeze([]),
  [STATE.SEEKING_BUILD]: Object.freeze([]),
  [STATE.BUILDING]: Object.freeze([]),
  [STATE.SEEKING_PROCESS]: Object.freeze([]),
  [STATE.PROCESSING]: Object.freeze([]),
});
