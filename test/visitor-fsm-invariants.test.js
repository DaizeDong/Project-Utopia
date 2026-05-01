// v0.10.1 HW7 Final-Polish-Loop Round 2 wave-3 (C1-code-architect) —
// Invariant lock for the Visitor FSM facade. Coverage:
//   (a) self-transition (`when` → current state) is no-op + does NOT
//       bump transitionCount
//   (b) `getStats()` returns a fresh object — mutating it cannot poison
//       subsequent calls
//   (c) repeated ticks accumulate tickCount monotonically
//   (d) on transition the dispatcher resets `visitor.fsm.target` and
//       `visitor.fsm.payload`

import test from "node:test";
import assert from "node:assert/strict";
import { VisitorFSM } from "../src/simulation/npc/fsm/VisitorFSM.js";
import { VISITOR_KIND } from "../src/config/constants.js";

function makeState(timeSec = 0) { return { metrics: { timeSec } }; }

function makeVisitor() {
  return {
    type: "VISITOR",
    kind: VISITOR_KIND.TRADER,
    alive: true,
    x: 4, z: 4,
    desiredVel: { x: 0, z: 0 },
    blackboard: {},
    targetTile: null,
    groupId: "traders",
  };
}

const EMPTY_BEHAVIOR = Object.freeze({
  IDLE: Object.freeze({}), WANDERING: Object.freeze({}),
  SEEK_TRADE: Object.freeze({}), TRADE: Object.freeze({}),
  SEEK_FOOD: Object.freeze({}), EAT: Object.freeze({}),
  SCOUT: Object.freeze({}), SABOTAGE: Object.freeze({}), EVADE: Object.freeze({}),
});

const EMPTY_TRANSITIONS = Object.freeze({
  IDLE: Object.freeze([]), WANDERING: Object.freeze([]),
  SEEK_TRADE: Object.freeze([]), TRADE: Object.freeze([]),
  SEEK_FOOD: Object.freeze([]), EAT: Object.freeze([]),
  SCOUT: Object.freeze([]), SABOTAGE: Object.freeze([]), EVADE: Object.freeze([]),
});

test("VisitorFSM invariants: self-transition is no-op (transitionCount stays 0)", () => {
  const transitions = { ...EMPTY_TRANSITIONS, IDLE: Object.freeze([
    Object.freeze({ priority: 1, to: "IDLE", when: () => true }),
  ]) };
  const fsm = new VisitorFSM(EMPTY_BEHAVIOR, Object.freeze(transitions));
  const visitor = makeVisitor();
  for (let i = 0; i < 3; i += 1) fsm.tickVisitor(visitor, makeState(i), {}, 0.016);
  assert.equal(visitor.fsm.state, "IDLE");
  assert.equal(fsm.getStats().transitionCount, 0);
});

test("VisitorFSM invariants: getStats() returns a fresh object on each call", () => {
  const fsm = new VisitorFSM();
  const a = fsm.getStats();
  a.transitionCount = 999; a.tickCount = 999;
  const b = fsm.getStats();
  assert.notEqual(a, b);
  assert.equal(b.transitionCount, 0);
  assert.equal(b.tickCount, 0);
});

test("VisitorFSM invariants: tickCount accumulates monotonically across ticks", () => {
  const fsm = new VisitorFSM();
  const visitor = makeVisitor();
  for (let i = 0; i < 5; i += 1) fsm.tickVisitor(visitor, makeState(i), {}, 0.016);
  assert.equal(fsm.getStats().tickCount, 5);
});

test("VisitorFSM invariants: target and payload are reset on every transition", () => {
  const stateBehavior = { ...EMPTY_BEHAVIOR, IDLE: Object.freeze({
    onEnter: (v) => { v.fsm.target = { ix: 7, iz: 9 }; v.fsm.payload = { stash: "x" }; },
  }) };
  const transitions = { ...EMPTY_TRANSITIONS, IDLE: Object.freeze([
    Object.freeze({ priority: 1, to: "WANDERING", when: () => true }),
  ]) };
  const fsm = new VisitorFSM(Object.freeze(stateBehavior), Object.freeze(transitions));
  const visitor = makeVisitor();
  fsm.tickVisitor(visitor, makeState(0), {}, 0.016);
  assert.equal(visitor.fsm.state, "WANDERING");
  assert.equal(visitor.fsm.target, null);
  assert.equal(visitor.fsm.payload, undefined);
});
