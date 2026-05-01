// v0.10.1 HW7 Final-Polish-Loop Round 2 wave-3 (C1-code-architect) —
// Skeleton lock test for the Visitor FSM facade introduced in this
// wave. Coverage:
//   (a) `new VisitorFSM()` is constructible without args
//   (b) flag=true ticks the FSM and a fresh visitor advances IDLE →
//       WANDERING by tick 1 (the only enabled transition in this wave)
//   (c) flag=false default leaves `VisitorAISystem._fsm` null
//   (d) `visitor.stateLabel` is single-written from DISPLAY_LABEL by
//       the dispatcher (matches the WorkerFSM contract)

import test from "node:test";
import assert from "node:assert/strict";
import { VisitorFSM } from "../src/simulation/npc/fsm/VisitorFSM.js";
import { DISPLAY_LABEL } from "../src/simulation/npc/fsm/VisitorStates.js";
import { VisitorAISystem } from "../src/simulation/npc/VisitorAISystem.js";
import { _testSetFeatureFlag, FEATURE_FLAGS, VISITOR_KIND } from "../src/config/constants.js";

function makeMinimalState({ timeSec = 0, agents = [] } = {}) {
  return {
    metrics: { timeSec, tick: 0 },
    controls: { timeScale: 1 },
    agents,
    animals: [],
    grid: { width: 8, height: 8, tiles: new Uint8Array(64) },
    debug: {},
    ai: { runtimeProfile: "default" },
  };
}

function makeVisitor() {
  return {
    type: "VISITOR",
    kind: VISITOR_KIND.TRADER,
    alive: true,
    x: 4,
    z: 4,
    desiredVel: { x: 0, z: 0 },
    blackboard: {},
    targetTile: null,
    groupId: "traders",
  };
}

test("VisitorFSM: constructs without args + getStats fresh", () => {
  const fsm = new VisitorFSM();
  assert.equal(typeof fsm.tickVisitor, "function");
  assert.deepEqual(fsm.getStats(), { transitionCount: 0, tickCount: 0 });
});

test("VisitorFSM: first tick bootstraps IDLE then transitions to WANDERING", () => {
  const fsm = new VisitorFSM();
  const visitor = makeVisitor();
  fsm.tickVisitor(visitor, makeMinimalState({ timeSec: 5 }), {}, 0.016);
  assert.equal(visitor.fsm.state, "WANDERING");
  assert.equal(visitor.stateLabel, DISPLAY_LABEL.WANDERING);
  assert.equal(fsm.getStats().transitionCount, 1);
});

test("VisitorAISystem: flag=false default leaves _fsm null on construction", () => {
  assert.equal(FEATURE_FLAGS.USE_VISITOR_FSM, false);
  const sys = new VisitorAISystem();
  assert.equal(sys._fsm, null);
});

test("VisitorAISystem: flag=true lazy-constructs FSM on update() + advances visitor", () => {
  _testSetFeatureFlag("USE_VISITOR_FSM", true);
  try {
    const sys = new VisitorAISystem();
    const visitor = makeVisitor();
    const state = makeMinimalState({ agents: [visitor] });
    sys.update(0.016, state, {});
    assert.ok(sys._fsm instanceof VisitorFSM);
    assert.equal(visitor.fsm.state, "WANDERING");
    assert.equal(visitor.stateLabel, DISPLAY_LABEL.WANDERING);
  } finally {
    _testSetFeatureFlag("USE_VISITOR_FSM", false);
  }
});

test("VisitorFSM: state body cannot hijack stateLabel (single-write by dispatcher)", () => {
  const stateBehavior = Object.freeze({
    IDLE: { tick: (v) => { v.stateLabel = "Hijacked"; } },
    WANDERING: { tick: () => {} }, SEEK_TRADE: { tick: () => {} },
    TRADE: { tick: () => {} }, SEEK_FOOD: { tick: () => {} },
    EAT: { tick: () => {} }, SCOUT: { tick: () => {} },
    SABOTAGE: { tick: () => {} }, EVADE: { tick: () => {} },
  });
  const stateTransitions = Object.freeze({
    IDLE: Object.freeze([]), WANDERING: Object.freeze([]),
    SEEK_TRADE: Object.freeze([]), TRADE: Object.freeze([]),
    SEEK_FOOD: Object.freeze([]), EAT: Object.freeze([]),
    SCOUT: Object.freeze([]), SABOTAGE: Object.freeze([]),
    EVADE: Object.freeze([]),
  });
  const fsm = new VisitorFSM(stateBehavior, stateTransitions);
  const visitor = makeVisitor();
  fsm.tickVisitor(visitor, makeMinimalState(), {}, 0.016);
  assert.equal(visitor.fsm.state, "IDLE");
  assert.equal(visitor.stateLabel, DISPLAY_LABEL.IDLE);
});
