// v0.10.0-a — Worker FSM state-behavior map. Phase 1 of 5 in the
// Priority-FSM rewrite per
// docs/superpowers/plans/2026-04-30-worker-fsm-rewrite-plan.md §3.1.
//
// Every state is a no-op stub in phase a. Phase 0.10.0-b populates
// onEnter/tick/onExit per state. The FEATURE_FLAGS.USE_FSM flag is OFF
// by default, so this map is never consulted in production until phase
// 0.10.0-d. The 14 STATE names are exported as a frozen const so tests
// and the transition table can reference them by symbolic name.

/**
 * Frozen 14-entry STATE enum. Mirrors the §3.1 state list in the plan
 * and the state-transition diagram in §3.5. Do not extend without
 * amending the plan + adding an entry to STATE_BEHAVIOR + STATE_TRANSITIONS.
 *
 * @typedef {("IDLE"|"SEEKING_FOOD"|"EATING"|"SEEKING_REST"|"RESTING"|"FIGHTING"|"SEEKING_HARVEST"|"HARVESTING"|"DELIVERING"|"DEPOSITING"|"SEEKING_BUILD"|"BUILDING"|"SEEKING_PROCESS"|"PROCESSING")} WorkerStateName
 */
export const STATE = Object.freeze({
  IDLE: "IDLE",
  SEEKING_FOOD: "SEEKING_FOOD",
  EATING: "EATING",
  SEEKING_REST: "SEEKING_REST",
  RESTING: "RESTING",
  FIGHTING: "FIGHTING",
  SEEKING_HARVEST: "SEEKING_HARVEST",
  HARVESTING: "HARVESTING",
  DELIVERING: "DELIVERING",
  DEPOSITING: "DEPOSITING",
  SEEKING_BUILD: "SEEKING_BUILD",
  BUILDING: "BUILDING",
  SEEKING_PROCESS: "SEEKING_PROCESS",
  PROCESSING: "PROCESSING",
});

/**
 * Phase-a no-op behavior. Each state is a frozen object with three
 * lifecycle hooks. The dispatcher invokes onEnter on transition into a
 * state, tick on every dispatcher pass, and onExit on transition out.
 *
 * Stubs are pure no-ops in phase a; the dispatcher's optional-chaining
 * (`behavior?.tick?.(...)`) means even fully-omitted hooks are safe, but
 * we install explicit empty functions here so the shape of the contract
 * is documented for phase b implementers.
 */
const noOpBehavior = Object.freeze({
  onEnter: () => {},
  tick: () => {},
  onExit: () => {},
});

/**
 * Phase-a STATE_BEHAVIOR map. Every state stubs to a frozen no-op.
 * Phase 0.10.0-b replaces these with real onEnter/tick/onExit triplets
 * that consume `worker`, `state`, `services`, `dt`. Until then the
 * dispatcher is harmless: it only mutates `worker.fsm.state` /
 * `worker.fsm.enteredAtSec` and bumps internal stats counters.
 *
 * @type {Readonly<Record<string, {onEnter: Function, tick: Function, onExit: Function}>>}
 */
export const STATE_BEHAVIOR = Object.freeze({
  [STATE.IDLE]: noOpBehavior,
  [STATE.SEEKING_FOOD]: noOpBehavior,
  [STATE.EATING]: noOpBehavior,
  [STATE.SEEKING_REST]: noOpBehavior,
  [STATE.RESTING]: noOpBehavior,
  [STATE.FIGHTING]: noOpBehavior,
  [STATE.SEEKING_HARVEST]: noOpBehavior,
  [STATE.HARVESTING]: noOpBehavior,
  [STATE.DELIVERING]: noOpBehavior,
  [STATE.DEPOSITING]: noOpBehavior,
  [STATE.SEEKING_BUILD]: noOpBehavior,
  [STATE.BUILDING]: noOpBehavior,
  [STATE.SEEKING_PROCESS]: noOpBehavior,
  [STATE.PROCESSING]: noOpBehavior,
});
