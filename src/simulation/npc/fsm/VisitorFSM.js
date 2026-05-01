// v0.10.1 HW7 Final-Polish-Loop Round 2 wave-3 (C1-code-architect) —
// Visitor FSM facade. Mirrors the WorkerFSM facade shape (61 LOC) and
// delegates dispatcher mechanics to the generic
// `src/simulation/npc/PriorityFSM.js` extracted in Round 1 wave-2. This
// is the second consumer of the generic dispatcher; wave-4 (Animal AI)
// will follow the same pattern.
//
// Default state is "IDLE". The skeleton ships behaviour bodies for IDLE
// + WANDERING only and stubs the remaining 7 states (TRADE / SCOUT /
// SABOTAGE / EVADE / SEEK_TRADE / SEEK_FOOD / EAT) — see
// `VisitorStates.js`. The flag `FEATURE_FLAGS.USE_VISITOR_FSM` defaults
// to false so VisitorAISystem keeps routing through the legacy
// StatePlanner / StateGraph path; this facade exists so trace-parity
// tests (round-3 wave-3.5) can flip the flag and validate the new path
// against the legacy one before retiring StatePlanner's visitor branch.

import { PriorityFSM } from "../PriorityFSM.js";
import { DISPLAY_LABEL, STATE_BEHAVIOR } from "./VisitorStates.js";
import { STATE_TRANSITIONS } from "./VisitorTransitions.js";

const DEFAULT_STATE = "IDLE";

export class VisitorFSM {
  /**
   * @param {Readonly<Record<string, {onEnter?: Function, tick?: Function, onExit?: Function}>>} [stateBehavior]
   *   — defaults to the production STATE_BEHAVIOR map. Tests inject
   *   custom maps to spy on lifecycle hook firing.
   * @param {Readonly<Record<string, ReadonlyArray<{priority: number, to: string, when: Function}>>>} [stateTransitions]
   *   — defaults to the production STATE_TRANSITIONS table. Tests
   *   inject custom tables to drive deterministic state changes.
   */
  constructor(stateBehavior = STATE_BEHAVIOR, stateTransitions = STATE_TRANSITIONS) {
    this._fsm = new PriorityFSM({
      behavior: stateBehavior,
      transitions: stateTransitions,
      displayLabel: DISPLAY_LABEL,
      defaultState: DEFAULT_STATE,
    });
  }

  /**
   * One dispatcher pass for a single visitor. Delegates to the generic
   * `PriorityFSM.tick`. The `visitor` parameter name is preserved (vs
   * the generic `entity`) for self-documenting code at the call site.
   *
   * @param {any} visitor
   * @param {any} state
   * @param {any} services
   * @param {number} dt
   */
  tickVisitor(visitor, state, services, dt) {
    this._fsm.tick(visitor, state, services, dt);
  }

  /**
   * Snapshot of internal counters. Returns a fresh `{ transitionCount,
   * tickCount }` object — see PriorityFSM.getStats.
   */
  getStats() {
    return this._fsm.getStats();
  }
}
