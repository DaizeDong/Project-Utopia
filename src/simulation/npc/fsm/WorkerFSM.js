// v0.10.0-a — Worker FSM dispatcher. Phase 1 of 5 in the Priority-FSM
// rewrite per docs/superpowers/plans/2026-04-30-worker-fsm-rewrite-plan.md
// §3.2.
//
// Per-worker priority-ordered state-transition pipeline replacing the
// v0.9.0–v0.9.4 JobScheduler utility-scoring layer. Behind
// FEATURE_FLAGS.USE_FSM (default OFF in phase a; flipped ON in phase
// 0.10.0-d once states/transitions are populated and validated).
//
// Contract per §3.2:
//   1. `worker.fsm = { state, enteredAtSec }` is the unique behaviour
//      field. No `currentJob`, `stateLabel`, `blackboard.intent`, or
//      `debug.lastIntent` synchronisation.
//   2. Each tick: walk the current state's priority-ordered transition
//      list. First `when()` that returns true wins; we enterState() and
//      stop walking. Then we tick the (possibly new) current state.
//   3. enterState() fires onExit on the previous state and onEnter on
//      the new one. The dispatcher is the only writer to worker.fsm.
//
// The dispatcher is intentionally tiny (~30 LOC core) so behaviour
// lives entirely in STATE_BEHAVIOR / STATE_TRANSITIONS — adding a new
// state is a 3-method object + a row in the transitions table.

import { STATE_BEHAVIOR } from "./WorkerStates.js";
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
    this._behavior = stateBehavior;
    this._transitions = stateTransitions;
    this._stats = { transitionCount: 0, tickCount: 0 };
  }

  /**
   * One dispatcher pass for a single worker. See class docstring for
   * the contract. Mutates `worker.fsm` and bumps internal counters.
   *
   * @param {any} worker
   * @param {any} state — global game state; must expose `metrics.timeSec` for enteredAtSec stamping.
   * @param {any} services
   * @param {number} dt — frame delta seconds.
   */
  tickWorker(worker, state, services, dt) {
    if (!worker.fsm) {
      worker.fsm = {
        state: DEFAULT_STATE,
        enteredAtSec: Number(state?.metrics?.timeSec ?? 0),
        target: null,
        payload: undefined,
      };
      this._behavior[DEFAULT_STATE]?.onEnter?.(worker, state, services);
    }

    // Priority-ordered transition check. First match wins, dispatcher
    // honours array order — callers must insert pre-sorted.
    const transitions = this._transitions[worker.fsm.state] ?? [];
    for (const t of transitions) {
      if (t.when(worker, state, services)) {
        this._enterState(worker, state, services, t.to);
        break;
      }
    }

    // Tick the (possibly new) current state.
    const behavior = this._behavior[worker.fsm.state];
    behavior?.tick?.(worker, state, services, dt);
    this._stats.tickCount += 1;
  }

  /**
   * Internal: transition `worker.fsm.state` from its current value to
   * `newName`, firing onExit (old) → onEnter (new). Self-transitions
   * (oldName === newName) are no-ops and do NOT bump transitionCount.
   *
   * v0.10.0-b — `target` is cleared on every transition; the new state's
   * onEnter rewrites it via worker.fsm.target = ... when the state needs a
   * target tile. The `payload` field is also reset so per-state scratch
   * doesn't leak across states.
   */
  _enterState(worker, state, services, newName) {
    const oldName = worker.fsm.state;
    if (oldName === newName) return;
    this._behavior[oldName]?.onExit?.(worker, state, services);
    worker.fsm = {
      state: newName,
      enteredAtSec: Number(state?.metrics?.timeSec ?? 0),
      target: null,
      payload: undefined,
    };
    this._behavior[newName]?.onEnter?.(worker, state, services);
    this._stats.transitionCount += 1;
  }

  /**
   * Snapshot of internal counters. Returns a fresh object so callers
   * can't mutate dispatcher state.
   */
  getStats() {
    return { ...this._stats };
  }
}
