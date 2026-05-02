// v0.10.1 HW7 Final-Polish-Loop Round 3 wave-3.5 (C1-code-architect) —
// Visitor FSM movement + behaviour primitives. Mirrors the WorkerHelpers
// shape from v0.10.0-d. The legacy VisitorAISystem.js helpers
// (`runEatBehavior`, `traderTick`, `saboteurTick`, `runWander`,
// `setIdleDesired`, plan-derived state mapping) are re-exported here so
// `VisitorStates.js` can consume them without circular-importing
// VisitorAISystem.
//
// Behaviour bodies are byte-for-byte ports of the v0.10.1-R2 inline
// helpers in VisitorAISystem.js — no semantic drift. Trace-parity is the
// hard gate for this wave (test/visitor-fsm-trace-parity.test.js).

import { VISITOR_KIND } from "../../../config/constants.js";
import {
  __visitorBehaviorBodies,
  setIdleDesired as _setIdleDesired,
} from "../VisitorAISystem.js";
import { planEntityDesiredState } from "../state/StatePlanner.js";

/**
 * Resolve the legacy `stateNode` string ("seek_food" / "trade" / "scout"
 * / etc.) for a visitor by running the planner. Used by FSM transitions
 * to drive the priority-FSM in lockstep with the legacy planner output
 * — guarantees trace-parity by construction.
 *
 * @returns {{ stateNode: string, groupId: string }}
 */
export function resolveVisitorStateNode(visitor, state) {
  const groupId = visitor.kind === VISITOR_KIND.TRADER ? "traders" : "saboteurs";
  // Re-bind the planner's groupId on the entity (matches the legacy
  // dispatch path that did `visitor.groupId = "traders"` etc.).
  visitor.groupId = groupId;
  const plan = planEntityDesiredState(visitor, state);
  return { stateNode: String(plan.desiredState), groupId };
}

/**
 * Map a planner-derived `stateNode` to an FSM STATE name. Mirrors the
 * v0.10.1-R2 dispatch table in VisitorAISystem.update() so the FSM
 * branch picks identical behaviour per stateNode.
 */
export function mapStateNodeToFsm(stateNode) {
  switch (stateNode) {
    case "seek_food": return "SEEK_FOOD";
    case "eat": return "EAT";
    case "seek_trade": return "SEEK_TRADE";
    case "trade": return "TRADE";
    case "scout": return "SCOUT";
    case "sabotage": return "SABOTAGE";
    case "evade": return "EVADE";
    case "wander": return "WANDERING";
    case "idle":
    default:
      return "IDLE";
  }
}

// Re-export the four behaviour entry-points lifted out of
// VisitorAISystem.js. Internally these still close over the module-scope
// helpers there (pickTraderTarget / pickSabotageTarget / applySabotage /
// etc.) — they were lifted to a named exports map (`__visitorBehaviorBodies`)
// rather than re-implemented to keep the wave-3.5 LOC delta inside budget.
export const runEatBehavior = (visitor, state, dt, services) =>
  __visitorBehaviorBodies.runEatBehavior(visitor, state, dt, services);
export const traderTick = (visitor, state, dt, services) =>
  __visitorBehaviorBodies.traderTick(visitor, state, dt, services);
export const saboteurTick = (visitor, state, dt, services, stateNode) =>
  __visitorBehaviorBodies.saboteurTick(visitor, state, dt, services, stateNode);
export const runWanderStep = (visitor, state, dt, services) =>
  __visitorBehaviorBodies.runWander(visitor, state, dt, services);
export const setIdleDesired = (visitor) => _setIdleDesired(visitor);
