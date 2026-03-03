import test from "node:test";
import assert from "node:assert/strict";

import { ROLE } from "../src/config/constants.js";
import { planEntityDesiredState } from "../src/simulation/npc/state/StatePlanner.js";

function makeState() {
  return {
    metrics: { timeSec: 10, goalFlipCount: 0 },
    resources: { food: 100, wood: 100 },
    buildings: { warehouses: 1, farms: 2, lumbers: 2, walls: 0 },
    grid: { version: 1, width: 8, height: 8, tiles: new Uint8Array(64).fill(0) },
    ai: { groupStateTargets: new Map(), groupPolicies: new Map() },
    debug: { logic: { lastGoalsByEntity: {}, goalFlipCount: 0 } },
  };
}

test("StatePlanner applies strong policy intent when local state is not critical", () => {
  const state = makeState();
  const worker = {
    id: "worker_1",
    groupId: "workers",
    role: ROLE.FARM,
    hunger: 0.8,
    carry: { food: 0, wood: 0 },
    x: 0,
    z: 0,
    targetTile: null,
    path: null,
    pathIndex: 0,
    pathGridVersion: -1,
    blackboard: {},
    debug: {},
    policy: {
      intentWeights: { deliver: 1.8, farm: 0.3, wood: 0.2 },
    },
  };

  const result = planEntityDesiredState(worker, state);
  assert.equal(result.desiredState, "deliver");
  assert.equal(Boolean(worker.debug.policyApplied), true);
  assert.equal(worker.debug.policyTopIntent, "deliver");
});

test("StatePlanner keeps critical hunger local state unless policy signal is very strong", () => {
  const state = makeState();
  state.resources.food = 50;

  const worker = {
    id: "worker_2",
    groupId: "workers",
    role: ROLE.FARM,
    hunger: 0.1,
    carry: { food: 0, wood: 0 },
    x: 0,
    z: 0,
    targetTile: null,
    path: null,
    pathIndex: 0,
    pathGridVersion: -1,
    blackboard: {},
    debug: {},
    policy: {
      intentWeights: { deliver: 1.0, farm: 0.6, eat: 0.4 },
    },
  };

  const result = planEntityDesiredState(worker, state);
  assert.equal(result.desiredState, "seek_food");
  assert.equal(Boolean(worker.debug.policyApplied), false);
});

test("StatePlanner does not force food-seeking from policy when worker is already satiated", () => {
  const state = makeState();
  const worker = {
    id: "worker_3",
    groupId: "workers",
    role: ROLE.FARM,
    hunger: 0.92,
    carry: { food: 0, wood: 0 },
    x: 0,
    z: 0,
    targetTile: null,
    path: null,
    pathIndex: 0,
    pathGridVersion: -1,
    blackboard: {},
    debug: {},
    policy: {
      intentWeights: { eat: 2.0, deliver: 0.4, farm: 0.3 },
    },
  };

  const result = planEntityDesiredState(worker, state);
  assert.equal(result.desiredState, "seek_task");
  assert.equal(Boolean(worker.debug.policyApplied), false);
});

test("StatePlanner ignores AI food target for humans when hunger is high", () => {
  const state = makeState();
  state.ai.groupStateTargets.set("workers", {
    targetState: "seek_food",
    expiresAtSec: 60,
    priority: 0.95,
    source: "llm",
    reason: "test-force-food",
  });

  const worker = {
    id: "worker_4",
    groupId: "workers",
    role: ROLE.WOOD,
    hunger: 0.9,
    carry: { food: 0, wood: 0 },
    x: 0,
    z: 0,
    targetTile: null,
    path: null,
    pathIndex: 0,
    pathGridVersion: -1,
    blackboard: {},
    debug: {},
    policy: {
      intentWeights: { wood: 1.2, deliver: 0.4 },
    },
  };

  const result = planEntityDesiredState(worker, state);
  assert.equal(result.desiredState, "seek_task");
  assert.equal(Boolean(worker.debug.aiTargetApplied), false);
});
