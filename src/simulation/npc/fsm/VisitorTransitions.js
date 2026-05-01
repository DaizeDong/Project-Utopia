// v0.10.1 HW7 Final-Polish-Loop Round 2 wave-3 (C1-code-architect) —
// Visitor FSM priority-ordered transition table (skeleton-only PoC).
//
// Per the dispatcher contract, each `STATE_TRANSITIONS[state]` is a
// pre-sorted array of `{ priority, to, when }` rows. The dispatcher
// walks it on every tick, first match wins, fires onExit/onEnter, then
// ticks the (possibly new) state body.
//
// In this wave only the IDLE → WANDERING bootstrap-departure transition
// is enabled. Once `FEATURE_FLAGS.USE_VISITOR_FSM` flips on a fresh
// visitor enters IDLE on tick 1 then immediately advances to WANDERING
// on tick 2 (proving the dispatcher kernel works on a second entity
// type). The remaining 8 states ship with empty arrays — round-3
// wave-3.5 will wire trade / saboteur / eat / evade transitions when
// the corresponding STATE_BEHAVIOR.tick bodies land.
//
// Until the flag flips, production code routes through the StatePlanner
// path and never consults this table.

export const STATE_TRANSITIONS = Object.freeze({
  IDLE: Object.freeze([
    // Bootstrap-out: every visitor leaves IDLE on the first dispatcher
    // pass. Round-3 wave-3.5 will replace this with hunger / trade-goal
    // / sabotage-goal priority-ordered checks that produce the right
    // target state per visitor kind.
    Object.freeze({ priority: 1, to: "WANDERING", when: () => true }),
  ]),
  WANDERING: Object.freeze([]),
  SEEK_TRADE: Object.freeze([]),
  TRADE: Object.freeze([]),
  SEEK_FOOD: Object.freeze([]),
  EAT: Object.freeze([]),
  SCOUT: Object.freeze([]),
  SABOTAGE: Object.freeze([]),
  EVADE: Object.freeze([]),
});
