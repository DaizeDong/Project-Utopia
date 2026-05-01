// v0.10.1 HW7 Final-Polish-Loop Round 1 wave-2 (C1-code-architect) —
// Generic priority-FSM dispatcher extracted from
// `src/simulation/npc/fsm/WorkerFSM.js`. The behaviour table, transitions
// table, display-label map, and default state are all injected via the
// constructor so the same dispatcher can drive Worker, Visitor, and Animal
// AI in subsequent waves (currently only Worker uses it via the thin
// facade in `fsm/WorkerFSM.js`).
//
// Contract (preserved verbatim from the v0.10.0-e dispatcher):
//   1. `entity.fsm = { state, enteredAtSec, target, payload }` is the
//      unique behaviour field. The dispatcher also writes
//      `entity.stateLabel` post-tick from `displayLabel[fsm.state]`
//      (single source of truth for display).
//   2. Each tick: walk the current state's priority-ordered transition
//      list. First `when()` returning true wins; the dispatcher fires
//      `_enterState()` and stops walking. Then it ticks the (possibly
//      new) current state. Finally writes `entity.stateLabel`.
//   3. `_enterState()` fires `onExit` on the previous state, resets
//      `target` + `payload`, then fires `onEnter` on the new state.
//      Self-transitions (oldName === newName) are no-ops and do NOT bump
//      `transitionCount`.
//
// The dispatcher is intentionally tiny so behaviour lives entirely in
// the injected `behavior` / `transitions` tables — adding a new state is
// a 3-method object + a row in the transitions table.

const FALLBACK_DEFAULT_STATE = "IDLE";

export class PriorityFSM {
  /**
   * @param {Object} cfg
   * @param {Readonly<Record<string, {onEnter?: Function, tick?: Function, onExit?: Function}>>} cfg.behavior
   *   — per-state lifecycle hooks. Required.
   * @param {Readonly<Record<string, ReadonlyArray<{priority: number, to: string, when: Function}>>>} cfg.transitions
   *   — per-state priority-ordered transition arrays. Required (use `{}`
   *   for none).
   * @param {Readonly<Record<string, string>>} [cfg.displayLabel]
   *   — optional state→label map. When present the dispatcher writes
   *   `entity.stateLabel = displayLabel[fsm.state]` post-tick.
   * @param {string} [cfg.defaultState]
   *   — initial state for freshly-bootstrapped entities. Defaults to
   *   `"IDLE"` to match the legacy WorkerFSM behaviour.
   */
  constructor({ behavior, transitions, displayLabel, defaultState } = {}) {
    this._behavior = behavior ?? {};
    this._transitions = transitions ?? {};
    this._displayLabel = displayLabel ?? null;
    this._defaultState = typeof defaultState === "string" && defaultState.length > 0
      ? defaultState
      : FALLBACK_DEFAULT_STATE;
    this._stats = { transitionCount: 0, tickCount: 0 };
  }

  /**
   * One dispatcher pass for a single entity. Mutates `entity.fsm` and
   * bumps internal counters. See class docstring for the contract.
   *
   * @param {any} entity — must accept ad-hoc `.fsm` and `.stateLabel`.
   * @param {any} state — global game state; reads `metrics.timeSec` for
   *   `enteredAtSec` stamping.
   * @param {any} services
   * @param {number} dt — frame delta seconds.
   */
  tick(entity, state, services, dt) {
    if (!entity.fsm) {
      entity.fsm = {
        state: this._defaultState,
        enteredAtSec: Number(state?.metrics?.timeSec ?? 0),
        target: null,
        payload: undefined,
      };
      this._behavior[this._defaultState]?.onEnter?.(entity, state, services);
    }

    // Priority-ordered transition check. First match wins, dispatcher
    // honours array order — callers must insert pre-sorted.
    const transitions = this._transitions[entity.fsm.state] ?? [];
    for (const t of transitions) {
      if (t.when(entity, state, services)) {
        this._enterState(entity, state, services, t.to);
        break;
      }
    }

    // Tick the (possibly new) current state.
    const behavior = this._behavior[entity.fsm.state];
    behavior?.tick?.(entity, state, services, dt);
    this._stats.tickCount += 1;

    // Single-write of `entity.stateLabel`. State bodies must not write
    // this field; the dispatcher derives it from `entity.fsm.state` so
    // the label is unambiguously sourced from the FSM. Falls back to the
    // previous label if the state is somehow not in displayLabel
    // (defensive — every STATE entry should have a row).
    if (this._displayLabel) {
      const label = this._displayLabel[entity.fsm.state];
      if (label !== undefined) entity.stateLabel = label;
    }
  }

  /**
   * Internal: transition `entity.fsm.state` from its current value to
   * `newName`, firing onExit (old) → onEnter (new). Self-transitions
   * (oldName === newName) are no-ops and do NOT bump transitionCount.
   *
   * `target` is cleared on every transition; the new state's onEnter
   * rewrites it via `entity.fsm.target = ...` when the state needs a
   * target tile. The `payload` field is also reset so per-state scratch
   * doesn't leak across states.
   */
  _enterState(entity, state, services, newName) {
    const oldName = entity.fsm.state;
    if (oldName === newName) return;
    this._behavior[oldName]?.onExit?.(entity, state, services);
    entity.fsm = {
      state: newName,
      enteredAtSec: Number(state?.metrics?.timeSec ?? 0),
      target: null,
      payload: undefined,
    };
    this._behavior[newName]?.onEnter?.(entity, state, services);
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
