// v0.10.0-a — Worker FSM dispatcher. Phase 1 of 5 in the Priority-FSM
// rewrite per docs/superpowers/plans/2026-04-30-worker-fsm-rewrite-plan.md
// §3.2.
//
// v0.10.1 HW7 Final-Polish-Loop Round 1 wave-2 (C1-code-architect) —
// the dispatcher kernel was extracted to `src/simulation/npc/PriorityFSM.js`
// as a generic, behaviour-table-driven class so Visitor / Animal AI can
// adopt the same machinery in subsequent waves. This file is now a thin
// facade: it injects the worker-specific STATE_BEHAVIOR, STATE_TRANSITIONS,
// and DISPLAY_LABEL maps, and delegates `tickWorker` / `getStats` to the
// generic dispatcher. The class name + method signatures + `worker.fsm`
// shape + `worker.stateLabel` single-write semantics + `getStats()`
// returned shape are 100% preserved (locked by the existing worker-fsm-*
// tests + the new test/priority-fsm-generic.test.js suite).

import { PriorityFSM } from "../PriorityFSM.js";
import { DISPLAY_LABEL, STATE_BEHAVIOR } from "./WorkerStates.js";
import { STATE_TRANSITIONS } from "./WorkerTransitions.js";

const DEFAULT_STATE = "IDLE";

export class WorkerFSM {
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
   * One dispatcher pass for a single worker. Delegates to the generic
   * `PriorityFSM.tick`. The `worker` parameter name is preserved (vs the
   * generic `entity`) for self-documenting code at the call site.
   *
   * @param {any} worker
   * @param {any} state
   * @param {any} services
   * @param {number} dt
   */
  tickWorker(worker, state, services, dt) {
    this._fsm.tick(worker, state, services, dt);
  }

  /**
   * Snapshot of internal counters. Returns a fresh `{ transitionCount,
   * tickCount }` object — see PriorityFSM.getStats.
   */
  getStats() {
    return this._fsm.getStats();
  }
}
