// v0.10.1 HW7 Final-Polish-Loop Round 2 wave-3 (C1-code-architect) —
// Visitor FSM state-behavior map (skeleton-only PoC).
//
// Stages the Priority-FSM migration of VisitorAISystem from the legacy
// StatePlanner / StateGraph path. Defines the full 9-state surface
// (DISPLAY_LABEL coverage) so UI labels are stable once the flag flips,
// but only IDLE / WANDERING ship working tick bodies in this wave; the
// other 7 states (SEEK_TRADE / TRADE / SEEK_FOOD / EAT / SCOUT /
// SABOTAGE / EVADE) ship as `tick: noopTick` stubs. Round-3 wave-3.5
// ports the trader / saboteur / eat behaviours from
// `VisitorAISystem.js`. Hook signatures mirror WorkerStates: onEnter /
// tick / onExit (visitor, state, services[, dt]).

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
// `visitor.stateLabel` post-tick (see PriorityFSM contract).
export const DISPLAY_LABEL = Object.freeze({
  IDLE: "Idle",
  WANDERING: "Wandering",
  SEEK_TRADE: "Seeking Trade",
  TRADE: "Trading",
  SEEK_FOOD: "Seeking Food",
  EAT: "Eating",
  SCOUT: "Scouting",
  SABOTAGE: "Sabotaging",
  EVADE: "Evading",
});

// Skeleton stub for the 7 non-active states. Explicit no-op (instead of
// `undefined`) documents that round-3 will port real behaviour here.
const noopTick = () => {};

// IDLE.onEnter / WANDERING.tick are intentionally empty in the skeleton
// to avoid a circular import on VisitorAISystem.js (which currently
// owns setIdleDesired / runWander helpers). flag=false default routes
// production through the legacy StatePlanner path so these never run.
export const STATE_BEHAVIOR = Object.freeze({
  IDLE: Object.freeze({ tick: noopTick }),
  WANDERING: Object.freeze({ tick: noopTick }),
  SEEK_TRADE: Object.freeze({ tick: noopTick }),
  TRADE: Object.freeze({ tick: noopTick }),
  SEEK_FOOD: Object.freeze({ tick: noopTick }),
  EAT: Object.freeze({ tick: noopTick }),
  SCOUT: Object.freeze({ tick: noopTick }),
  SABOTAGE: Object.freeze({ tick: noopTick }),
  EVADE: Object.freeze({ tick: noopTick }),
});
