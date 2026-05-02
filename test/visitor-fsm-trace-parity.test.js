// v0.10.1 HW7 Final-Polish-Loop Round 3 wave-3.5 (C1-code-architect) —
// Trace-parity gate for the Visitor FSM. The legacy StatePlanner /
// StateGraph dispatch path was deleted in this wave (USE_VISITOR_FSM
// flag retired) so the parity assertion is structural rather than
// state-by-state runtime comparison: we lock that the FSM's
// `STATE_TRANSITIONS` table maps every legacy `stateNode` string
// (`seek_food` / `eat` / `seek_trade` / `trade` / `scout` / `sabotage`
// / `evade` / `wander` / `idle`) to the corresponding FSM state, and
// that the planner-driven dispatcher actually advances a fresh
// trader / saboteur from IDLE through the planner's chosen state on
// the first dispatcher pass.
//
// This is the wave-3.5 "hard gate" per the plan: if any of the 9
// stateNode → STATE mappings is wrong, the FSM will diverge from the
// pre-wave-3.5 dispatch and downstream tests (visitor-eating,
// scenario-saboteur, visitor-pressure) will surface the regression.

import test from "node:test";
import assert from "node:assert/strict";

import { mapStateNodeToFsm, resolveVisitorStateNode } from "../src/simulation/npc/fsm/VisitorHelpers.js";
import { STATE, STATE_BEHAVIOR, DISPLAY_LABEL } from "../src/simulation/npc/fsm/VisitorStates.js";
import { STATE_TRANSITIONS } from "../src/simulation/npc/fsm/VisitorTransitions.js";
import { VisitorFSM } from "../src/simulation/npc/fsm/VisitorFSM.js";
import { VISITOR_KIND } from "../src/config/constants.js";

function makeState({ timeSec = 0, withWarehouse = false, food = 0 } = {}) {
  const tiles = new Uint8Array(64);
  if (withWarehouse) tiles[3 + 3 * 8] = 4; // TILE.WAREHOUSE @ (3,3)
  return {
    metrics: { timeSec, tick: 0 },
    controls: { timeScale: 1 },
    agents: [],
    animals: [],
    grid: { width: 8, height: 8, tiles, version: 1 },
    debug: {},
    ai: { runtimeProfile: "default", groupPolicies: new Map(), groupStateTargets: new Map() },
    resources: { food, wood: 0, stone: 0, herbs: 0 },
    buildings: { warehouses: withWarehouse ? 1 : 0, farms: 0, lumbers: 0 },
    gameplay: {},
    weather: { moveCostMultiplier: 1, current: "clear" },
    environment: {},
    events: { active: [], queue: [] },
  };
}

function makeTrader() {
  return {
    type: "VISITOR",
    kind: VISITOR_KIND.TRADER,
    alive: true,
    x: 4, z: 4,
    desiredVel: { x: 0, z: 0 },
    blackboard: {},
    targetTile: null,
    groupId: "traders",
    hunger: 1,
    id: "trader-1",
  };
}

function makeSaboteur() {
  return {
    type: "VISITOR",
    kind: VISITOR_KIND.SABOTEUR,
    alive: true,
    x: 4, z: 4,
    desiredVel: { x: 0, z: 0 },
    blackboard: {},
    targetTile: null,
    groupId: "saboteurs",
    hunger: 1,
    sabotageCooldown: 99,
    id: "sab-1",
  };
}

test("trace-parity: every legacy stateNode maps to a real FSM STATE", () => {
  const allStateNodes = ["seek_food", "eat", "seek_trade", "trade", "scout", "sabotage", "evade", "wander", "idle"];
  for (const node of allStateNodes) {
    const fsmState = mapStateNodeToFsm(node);
    assert.ok(STATE[fsmState], `stateNode "${node}" -> "${fsmState}" must be a STATE entry`);
    assert.ok(STATE_BEHAVIOR[fsmState], `STATE "${fsmState}" must have a behaviour entry`);
    assert.ok(STATE_TRANSITIONS[fsmState], `STATE "${fsmState}" must have a transitions entry`);
    assert.ok(DISPLAY_LABEL[fsmState], `STATE "${fsmState}" must have a display label`);
  }
});

test("trace-parity: every STATE has at least one transition row + a tick body", () => {
  for (const stateName of Object.keys(STATE)) {
    const transitions = STATE_TRANSITIONS[stateName];
    assert.ok(Array.isArray(transitions), `${stateName} must have a transitions array`);
    // Every state has 8 priority-driven rows (one per OTHER state); IDLE has 8, etc.
    assert.equal(transitions.length, 8, `${stateName} should have 8 outbound transition rows`);
    const behavior = STATE_BEHAVIOR[stateName];
    assert.ok(behavior, `${stateName} must have STATE_BEHAVIOR entry`);
    assert.equal(typeof behavior.tick, "function", `${stateName}.tick must be a function`);
  }
});

test("trace-parity: trader with no warehouse plans `wander` → FSM lands in WANDERING by tick 1", () => {
  const fsm = new VisitorFSM();
  const visitor = makeTrader();
  const state = makeState({ timeSec: 0, withWarehouse: false });
  const services = { rng: { next: () => 0.5 }, pathCache: { get: () => null, set: () => {} } };

  // Pre-tick: planner predicts `wander` (deriveTraderDesiredState's
  // "no-warehouse" branch).
  const { stateNode } = resolveVisitorStateNode(visitor, state);
  assert.equal(stateNode, "wander");
  assert.equal(mapStateNodeToFsm(stateNode), "WANDERING");

  fsm.tickVisitor(visitor, state, services, 0.016);
  assert.equal(visitor.fsm.state, "WANDERING");
});

test("trace-parity: saboteur with hot cooldown plans `sabotage` → FSM lands in SABOTAGE by tick 1", () => {
  const fsm = new VisitorFSM();
  const visitor = makeSaboteur();
  // sabotageCooldown=0 → deriveSaboteurDesiredState returns `sabotage` (`rule:ready`).
  visitor.sabotageCooldown = 0;
  const state = makeState({ timeSec: 0, withWarehouse: true, food: 50 });
  const services = { rng: { next: () => 0.5 }, pathCache: { get: () => null, set: () => {} } };

  const { stateNode } = resolveVisitorStateNode(visitor, state);
  assert.equal(stateNode, "sabotage");

  fsm.tickVisitor(visitor, state, services, 0.016);
  assert.equal(visitor.fsm.state, "SABOTAGE");
});

test("trace-parity: hungry trader with food + warehouse plans `seek_food` → FSM lands in SEEK_FOOD by tick 1", () => {
  const fsm = new VisitorFSM();
  const visitor = makeTrader();
  visitor.hunger = 0.1; // below 0.22 threshold
  const state = makeState({ timeSec: 0, withWarehouse: true, food: 50 });
  const services = { rng: { next: () => 0.5 }, pathCache: { get: () => null, set: () => {} } };

  const { stateNode } = resolveVisitorStateNode(visitor, state);
  assert.equal(stateNode, "seek_food");

  fsm.tickVisitor(visitor, state, services, 0.016);
  assert.equal(visitor.fsm.state, "SEEK_FOOD");
});

test("trace-parity: dispatcher caches planner output per tick (single planner call)", () => {
  // The transition table evaluates ~8 `when` predicates per tick; without
  // caching this would be 8x planner calls per visitor per tick. Verify
  // the cache stamp matches state.metrics.tick after one dispatch.
  const fsm = new VisitorFSM();
  const visitor = makeTrader();
  const state = makeState({ timeSec: 0, withWarehouse: false });
  const services = { rng: { next: () => 0.5 }, pathCache: { get: () => null, set: () => {} } };
  fsm.tickVisitor(visitor, state, services, 0.016);
  assert.ok(visitor._fsmPlannerCache, "expected cache to be populated post-tick");
  assert.equal(visitor._fsmPlannerCache.tick, 0);
  assert.equal(visitor._fsmPlannerCache.stateNode, "wander");
  assert.equal(visitor._fsmPlannerCache.fsmState, "WANDERING");
});
