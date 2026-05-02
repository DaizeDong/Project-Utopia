// v0.10.1 HW7 Final-Polish-Loop Round 3 wave-3.5 (C1-code-architect) —
// Visitor FSM state-behavior map. Wave-3 shipped a 9-state skeleton with
// noop ticks; this wave fills every tick with a real body sourced from
// the legacy VisitorAISystem.js helpers (now re-exported via
// VisitorHelpers.js).
//
// Trace-parity vs the legacy StatePlanner / StateGraph dispatch is the
// hard gate (test/visitor-fsm-trace-parity.test.js). The dispatcher
// drives state transitions via `resolveVisitorStateNode` (planner) +
// `mapStateNodeToFsm` (string→STATE) inside VisitorTransitions.js — this
// keeps the per-tick desired state derivation byte-identical to the
// legacy `planEntityDesiredState` → `transitionEntityState` chain.
//
// Hook signatures: onEnter(visitor, state, services),
// tick(visitor, state, services, dt), onExit(visitor, state, services).

import {
  runEatBehavior,
  runWanderStep,
  saboteurTick,
  setIdleDesired,
  traderTick,
} from "./VisitorHelpers.js";

/**
 * @typedef {("IDLE"|"WANDERING"|"SEEK_TRADE"|"TRADE"|"SEEK_FOOD"|"EAT"|"SCOUT"|"SABOTAGE"|"EVADE")} VisitorStateName
 */
export const STATE = Object.freeze({
  IDLE: "IDLE",
  WANDERING: "WANDERING",
  SEEK_TRADE: "SEEK_TRADE",
  TRADE: "TRADE",
  SEEK_FOOD: "SEEK_FOOD",
  EAT: "EAT",
  SCOUT: "SCOUT",
  SABOTAGE: "SABOTAGE",
  EVADE: "EVADE",
});

// State -> human-readable label. Single-written by the dispatcher to
// `visitor.stateLabel` post-tick (see PriorityFSM contract). Matches the
// legacy `LABELS.traders` / `LABELS.saboteurs` strings in StateGraph.js.
export const DISPLAY_LABEL = Object.freeze({
  IDLE: "Idle",
  WANDERING: "Wander",
  SEEK_TRADE: "Seek Trade",
  TRADE: "Trade",
  SEEK_FOOD: "Seek Food",
  EAT: "Eat",
  SCOUT: "Scout",
  SABOTAGE: "Sabotage",
  EVADE: "Evade",
});

// Per-state behaviour. Each tick body delegates to a helper from
// VisitorHelpers.js — these are byte-for-byte ports of the legacy
// VisitorAISystem.js inline helpers. setIdleDesired clamps desiredVel to
// zero so the physics integrator doesn't drift the visitor when the FSM
// has nothing to do.

const IDLE = Object.freeze({
  onEnter(visitor, _state, _services) {
    setIdleDesired(visitor);
  },
  tick(visitor, _state, _services, _dt) {
    setIdleDesired(visitor);
  },
});

const WANDERING = Object.freeze({
  tick(visitor, state, services, dt) {
    runWanderStep(visitor, state, dt, services);
  },
});

// Trader path: SEEK_TRADE walks toward the chosen warehouse, TRADE
// executes the at-warehouse goods exchange. Both delegate to the same
// `traderTick` body that the legacy dispatcher used — the body itself
// branches on `isAtTargetTile` so re-entering it from either FSM state
// is safe.

const SEEK_TRADE = Object.freeze({
  tick(visitor, state, services, dt) {
    traderTick(visitor, state, dt, services);
  },
});

const TRADE = Object.freeze({
  tick(visitor, state, services, dt) {
    traderTick(visitor, state, dt, services);
  },
});

// Food-seeking path (shared by traders + saboteurs). runEatBehavior
// auto-routes to the nearest warehouse and consumes a ration on arrival.

const SEEK_FOOD = Object.freeze({
  tick(visitor, state, services, dt) {
    runEatBehavior(visitor, state, dt, services);
  },
});

const EAT = Object.freeze({
  tick(visitor, state, services, dt) {
    runEatBehavior(visitor, state, dt, services);
  },
});

// Saboteur trio: SCOUT (path-active reconnaissance), SABOTAGE (apply
// damage on arrival), EVADE (cooldown wander). All three delegate to
// `saboteurTick` with the legacy stateNode string so the body's
// scout/evade fallback branch fires correctly.

const SCOUT = Object.freeze({
  tick(visitor, state, services, dt) {
    saboteurTick(visitor, state, dt, services, "scout");
  },
});

const SABOTAGE = Object.freeze({
  tick(visitor, state, services, dt) {
    saboteurTick(visitor, state, dt, services, "sabotage");
  },
});

const EVADE = Object.freeze({
  tick(visitor, state, services, dt) {
    saboteurTick(visitor, state, dt, services, "evade");
  },
});

export const STATE_BEHAVIOR = Object.freeze({
  IDLE,
  WANDERING,
  SEEK_TRADE,
  TRADE,
  SEEK_FOOD,
  EAT,
  SCOUT,
  SABOTAGE,
  EVADE,
});
