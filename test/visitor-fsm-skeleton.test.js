// v0.10.1 HW7 Final-Polish-Loop Round 3 wave-3.5 (C1-code-architect) —
// Skeleton lock test for the Visitor FSM facade. Wave-3.5 dropped the
// USE_VISITOR_FSM flag (FSM is now the only path), so the flag-flip
// subtests from wave-3 are gone. Coverage:
//   (a) `new VisitorFSM()` is constructible without args
//   (b) lazy-init: VisitorAISystem._fsm is null pre-update()
//   (c) post-update: a fresh trader (no warehouse in minimal state)
//       plans `wander` → FSM advances IDLE → WANDERING by tick 1
//   (d) `visitor.stateLabel` is single-written from DISPLAY_LABEL by
//       the dispatcher (matches the WorkerFSM contract)

import test from "node:test";
import assert from "node:assert/strict";
import { VisitorFSM } from "../src/simulation/npc/fsm/VisitorFSM.js";
import { DISPLAY_LABEL } from "../src/simulation/npc/fsm/VisitorStates.js";
import { VisitorAISystem } from "../src/simulation/npc/VisitorAISystem.js";
import { VISITOR_KIND } from "../src/config/constants.js";

function makeMinimalState({ timeSec = 0, agents = [] } = {}) {
  return {
    metrics: { timeSec, tick: 0 },
    controls: { timeScale: 1 },
    agents,
    animals: [],
    grid: { width: 8, height: 8, tiles: new Uint8Array(64), version: 1 },
    debug: {},
    ai: { runtimeProfile: "default", groupPolicies: new Map(), groupStateTargets: new Map() },
    resources: { food: 0, wood: 0, stone: 0, herbs: 0 },
    buildings: { warehouses: 0, farms: 0, lumbers: 0 },
    gameplay: {},
    weather: { moveCostMultiplier: 1, current: "clear" },
    environment: {},
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
    hunger: 1,
  };
}

test("VisitorFSM: constructs without args + getStats fresh", () => {
  const fsm = new VisitorFSM();
  assert.equal(typeof fsm.tickVisitor, "function");
  assert.deepEqual(fsm.getStats(), { transitionCount: 0, tickCount: 0 });
});

test("VisitorAISystem: lazy-init leaves _fsm null on construction", () => {
  const sys = new VisitorAISystem();
  assert.equal(sys._fsm, null);
});

test("VisitorAISystem: update() lazy-constructs FSM + advances visitor", () => {
  const sys = new VisitorAISystem();
  const visitor = makeVisitor();
  const state = makeMinimalState({ agents: [visitor] });
  sys.update(0.016, state, { rng: { next: () => 0.5 }, pathCache: { get: () => null, set: () => {} } });
  assert.ok(sys._fsm instanceof VisitorFSM);
  // No warehouse → planner returns `wander` → FSM enters WANDERING.
  assert.equal(visitor.fsm.state, "WANDERING");
  assert.equal(visitor.stateLabel, DISPLAY_LABEL.WANDERING);
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
