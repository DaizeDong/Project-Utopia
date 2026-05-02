// v0.10.1 HW7 Final-Polish-Loop Round 3 wave-3.5 (C1-code-architect) —
// Visitor FSM priority-ordered transition table. Wave-3 shipped 8/9
// empty arrays and 1 bootstrap row; this wave wires every state to a
// planner-driven router so the FSM advances in lockstep with the legacy
// `planEntityDesiredState` → `transitionEntityState` chain.
//
// Design: a single `PLANNER_DRIVEN` transition row sits at priority 1 in
// every state's array. It re-runs `planEntityDesiredState`, maps the
// result through `mapStateNodeToFsm`, and fires only when the mapped FSM
// state differs from the current one. This is the trace-parity guarantee
// — the new path's STATE_TRANSITIONS table picks the same target state
// per tick as the legacy StateGraph dispatcher (the planner / policy /
// AI-target / feasibility merge logic is unchanged; we just route the
// output through PriorityFSM instead of GROUP_STATE_GRAPH BFS).
//
// The dispatcher walks the array in order; first matching `when` wins.
// Only one row per state — the planner output is authoritative. Tighter
// priority-rows (e.g. survival preempt) would be redundant: the planner
// already implements them via `deriveTraderDesiredState` /
// `deriveSaboteurDesiredState` hunger checks.
//
// Until the flag flips, production code routes through the StatePlanner
// path and never consults this table.

import {
  mapStateNodeToFsm,
  resolveVisitorStateNode,
} from "./VisitorHelpers.js";
import { STATE } from "./VisitorStates.js";

// Cache the planner result on the visitor so the transition row + the
// state body don't double-pay the cost. Stamp with the dispatcher tick
// so stale entries from previous frames are rejected.
function plannerTransitionFor(targetState) {
  return (visitor, state, _services) => {
    const tick = Number(state?.metrics?.tick ?? 0);
    let cached = visitor._fsmPlannerCache;
    if (!cached || cached.tick !== tick) {
      const { stateNode } = resolveVisitorStateNode(visitor, state);
      cached = { tick, stateNode, fsmState: mapStateNodeToFsm(stateNode) };
      visitor._fsmPlannerCache = cached;
    }
    return cached.fsmState === targetState && visitor.fsm?.state !== targetState;
  };
}

const TO_IDLE = Object.freeze({ priority: 9, to: STATE.IDLE, when: plannerTransitionFor(STATE.IDLE) });
const TO_WANDERING = Object.freeze({ priority: 8, to: STATE.WANDERING, when: plannerTransitionFor(STATE.WANDERING) });
const TO_SEEK_TRADE = Object.freeze({ priority: 4, to: STATE.SEEK_TRADE, when: plannerTransitionFor(STATE.SEEK_TRADE) });
const TO_TRADE = Object.freeze({ priority: 3, to: STATE.TRADE, when: plannerTransitionFor(STATE.TRADE) });
const TO_SEEK_FOOD = Object.freeze({ priority: 1, to: STATE.SEEK_FOOD, when: plannerTransitionFor(STATE.SEEK_FOOD) });
const TO_EAT = Object.freeze({ priority: 1, to: STATE.EAT, when: plannerTransitionFor(STATE.EAT) });
const TO_SCOUT = Object.freeze({ priority: 5, to: STATE.SCOUT, when: plannerTransitionFor(STATE.SCOUT) });
const TO_SABOTAGE = Object.freeze({ priority: 4, to: STATE.SABOTAGE, when: plannerTransitionFor(STATE.SABOTAGE) });
const TO_EVADE = Object.freeze({ priority: 6, to: STATE.EVADE, when: plannerTransitionFor(STATE.EVADE) });

// Per-state arrays: every state can transition to every other state when
// the planner says so. Priority ordering is informational — the
// dispatcher honours array order, and the `plannerTransitionFor`
// predicate is mutually exclusive (only the FSM state matching the
// planner's choice fires) so order between rows is observationally
// irrelevant.
const ALL_TRANSITIONS_FROM = (excludeState) => Object.freeze(
  [TO_SEEK_FOOD, TO_EAT, TO_TRADE, TO_SEEK_TRADE, TO_SABOTAGE, TO_SCOUT, TO_EVADE, TO_WANDERING, TO_IDLE]
    .filter((row) => row.to !== excludeState),
);

export const STATE_TRANSITIONS = Object.freeze({
  IDLE: ALL_TRANSITIONS_FROM(STATE.IDLE),
  WANDERING: ALL_TRANSITIONS_FROM(STATE.WANDERING),
  SEEK_TRADE: ALL_TRANSITIONS_FROM(STATE.SEEK_TRADE),
  TRADE: ALL_TRANSITIONS_FROM(STATE.TRADE),
  SEEK_FOOD: ALL_TRANSITIONS_FROM(STATE.SEEK_FOOD),
  EAT: ALL_TRANSITIONS_FROM(STATE.EAT),
  SCOUT: ALL_TRANSITIONS_FROM(STATE.SCOUT),
  SABOTAGE: ALL_TRANSITIONS_FROM(STATE.SABOTAGE),
  EVADE: ALL_TRANSITIONS_FROM(STATE.EVADE),
});
