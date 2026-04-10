import test from "node:test";
import assert from "node:assert/strict";

import { ROLE } from "../src/config/constants.js";
import { BALANCE } from "../src/config/balance.js";
import { deriveWorkerDesiredStateExported } from "../src/simulation/npc/state/StatePlanner.js";

function makeState(overrides = {}) {
  return {
    metrics: { timeSec: 10, goalFlipCount: 0 },
    resources: { food: 100, wood: 100 },
    buildings: { warehouses: 1, farms: 2, lumbers: 2, walls: 0 },
    grid: { version: 1, width: 8, height: 8, tiles: new Uint8Array(64).fill(0) },
    ai: { groupStateTargets: new Map(), groupPolicies: new Map() },
    debug: { logic: { lastGoalsByEntity: {}, goalFlipCount: 0 } },
    ...overrides,
  };
}

function makeWorker(overrides = {}) {
  return {
    id: "worker_test",
    groupId: "workers",
    role: ROLE.FARM,
    hunger: 0.8,
    carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
    x: 0,
    z: 0,
    targetTile: null,
    path: null,
    pathIndex: 0,
    pathGridVersion: -1,
    blackboard: {},
    debug: {},
    ...overrides,
  };
}

// --- Deliver hysteresis tests ---

test("BALANCE has workerDeliverLowThreshold of 1.0", () => {
  assert.equal(BALANCE.workerDeliverLowThreshold, 1.0);
});

test("BALANCE has workerHungerRecoverThreshold of 0.35", () => {
  assert.equal(BALANCE.workerHungerRecoverThreshold, 0.35);
});

test("BALANCE has workerIntentCooldownSec of 1.5", () => {
  assert.equal(BALANCE.workerIntentCooldownSec, 1.5);
});

test("Worker in 'deliver' state with carry=2.3 (below 2.4 entry threshold) stays in deliver", () => {
  // carry=2.3 is below the normal 2.4 threshold but above the hysteresis 1.2 threshold
  // If the worker is already in deliver state, they should stay there
  const worker = makeWorker({
    hunger: 0.8,
    carry: { food: 2.3, wood: 0, stone: 0, herbs: 0 },
    blackboard: { fsm: { state: "deliver" } },
  });
  const state = makeState();

  const result = deriveWorkerDesiredStateExported(worker, state);
  assert.equal(result.desiredState, "deliver",
    `Expected deliver but got ${result.desiredState} (reason: ${result.reason})`);
});

test("Worker NOT in 'deliver' state with carry=1.7 seeks task (no hysteresis)", () => {
  // Without being in deliver state, carry=1.7 is below the 1.8 threshold, so no deliver
  const worker = makeWorker({
    hunger: 0.8,
    carry: { food: 1.7, wood: 0, stone: 0, herbs: 0 },
    blackboard: { fsm: { state: "seek_task" } },
  });
  const state = makeState();

  const result = deriveWorkerDesiredStateExported(worker, state);
  assert.notEqual(result.desiredState, "deliver",
    `Expected NOT deliver but got deliver (reason: ${result.reason})`);
});

test("Worker in 'deliver' state with carry=1.1 (above low threshold 1.0) stays in deliver", () => {
  const worker = makeWorker({
    hunger: 0.8,
    carry: { food: 1.1, wood: 0, stone: 0, herbs: 0 },
    blackboard: { fsm: { state: "deliver" } },
  });
  const state = makeState();

  const result = deriveWorkerDesiredStateExported(worker, state);
  assert.equal(result.desiredState, "deliver",
    `Expected deliver but got ${result.desiredState} (reason: ${result.reason})`);
});

test("Worker in 'deliver' state with carry=0.9 (below low threshold 1.0) leaves deliver", () => {
  // carry=0.9 is below even the hysteresis threshold, so worker should leave deliver
  const worker = makeWorker({
    hunger: 0.8,
    carry: { food: 0.9, wood: 0, stone: 0, herbs: 0 },
    blackboard: { fsm: { state: "deliver" } },
  });
  const state = makeState();

  const result = deriveWorkerDesiredStateExported(worker, state);
  assert.notEqual(result.desiredState, "deliver",
    `Expected NOT deliver but got deliver (reason: ${result.reason})`);
});

// --- Eat hysteresis tests ---

test("Worker in 'eat' state with hunger=0.15 (just above 0.14 entry) stays in eat", () => {
  // hunger=0.15 is above the entry threshold (0.14), so normal check wouldn't trigger eat
  // But since we're already in eat and hunger < recover threshold (0.35), hysteresis keeps us eating
  const worker = makeWorker({
    hunger: 0.15,
    carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
    blackboard: { fsm: { state: "eat" } },
  });
  const state = makeState();

  const result = deriveWorkerDesiredStateExported(worker, state);
  assert.ok(
    result.desiredState === "eat" || result.desiredState === "seek_food",
    `Expected eat or seek_food but got ${result.desiredState} (reason: ${result.reason})`
  );
});

test("Worker in 'seek_food' state with hunger=0.15 (just above 0.14 entry) stays in seek_food/eat", () => {
  const worker = makeWorker({
    hunger: 0.15,
    carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
    blackboard: { fsm: { state: "seek_food" } },
  });
  const state = makeState();

  const result = deriveWorkerDesiredStateExported(worker, state);
  assert.ok(
    result.desiredState === "eat" || result.desiredState === "seek_food",
    `Expected eat or seek_food but got ${result.desiredState} (reason: ${result.reason})`
  );
});

test("Worker in 'eat' state with hunger=0.36 (above recover threshold 0.35) leaves eat state", () => {
  // hunger=0.36 is above both entry threshold AND recover threshold, so hysteresis does not apply
  const worker = makeWorker({
    hunger: 0.36,
    carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
    blackboard: { fsm: { state: "eat" } },
  });
  const state = makeState();

  const result = deriveWorkerDesiredStateExported(worker, state);
  assert.notEqual(result.desiredState, "eat",
    `Expected NOT eat but got eat (reason: ${result.reason})`);
  assert.notEqual(result.desiredState, "seek_food",
    `Expected NOT seek_food but got seek_food (reason: ${result.reason})`);
});

test("Worker NOT in eat/seek_food state with hunger=0.15 does NOT trigger eat (no hysteresis)", () => {
  // hunger=0.15 is just above 0.14 threshold; without hysteresis a fresh worker would NOT eat
  // Since 0.15 > 0.14 (threshold), the normal rule does NOT trigger
  const worker = makeWorker({
    hunger: 0.15,
    carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
    blackboard: { fsm: { state: "seek_task" } },
  });
  const state = makeState();

  const result = deriveWorkerDesiredStateExported(worker, state);
  // 0.15 > 0.14 so no hunger trigger without hysteresis
  assert.notEqual(result.desiredState, "eat",
    `Expected NOT eat for worker not in eat state with hunger 0.15`);
  assert.notEqual(result.desiredState, "seek_food",
    `Expected NOT seek_food for worker not in eat state with hunger 0.15`);
});

test("Worker in deliver state with carry=0 should NOT stay in deliver", () => {
  // Even with hysteresis, a worker in deliver with nothing to carry should leave
  const worker = makeWorker({
    hunger: 0.8,
    carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
    blackboard: { fsm: { state: "deliver" } },
  });
  const state = makeState();

  const result = deriveWorkerDesiredStateExported(worker, state);
  assert.notEqual(result.desiredState, "deliver",
    `Worker with empty carry should not stay in deliver, got: ${result.desiredState}`);
});

test("TASK_LOCK_STATES includes seek_task, harvest, deliver, eat, process", async () => {
  const { TASK_LOCK_STATES } = await import("../src/simulation/npc/WorkerAISystem.js");
  assert.ok(TASK_LOCK_STATES.has("seek_task"), "seek_task should be in TASK_LOCK_STATES");
  assert.ok(TASK_LOCK_STATES.has("harvest"), "harvest should be in TASK_LOCK_STATES");
  assert.ok(TASK_LOCK_STATES.has("deliver"), "deliver should be in TASK_LOCK_STATES");
  assert.ok(TASK_LOCK_STATES.has("eat"), "eat should be in TASK_LOCK_STATES");
  assert.ok(TASK_LOCK_STATES.has("process"), "process should be in TASK_LOCK_STATES");
});

test("Worker in eat state with no food available does not stay in eat via hysteresis", () => {
  // If there's no food, hysteresis should not force eat state
  const worker = makeWorker({
    hunger: 0.15,
    carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
    blackboard: { fsm: { state: "eat" } },
  });
  const state = makeState({ resources: { food: 0, wood: 100 } });

  const result = deriveWorkerDesiredStateExported(worker, state);
  assert.notEqual(result.desiredState, "eat",
    `Worker should not seek eat when food=0, got: ${result.desiredState} (${result.reason})`);
  assert.notEqual(result.desiredState, "seek_food",
    `Worker should not seek food when food=0, got: ${result.desiredState} (${result.reason})`);
});
