// v0.8.4 Phase 11 (Agent D) — Recruitment system test coverage.
//
// Validates the design contract for the Recruitment rework:
//   1. Default state.controls.recruit* fields seeded by EntityFactory
//   2. Cooldown ticks each frame
//   3. Auto-recruit fills queue toward target when food >= minBuffer
//   4. Auto-recruit refuses below recruitMinFoodBuffer
//   5. Spawn drains queue when cooldown elapsed and food >= recruitFoodCost
//   6. Cooldown gates further spawns until elapsed
//   7. LLM `recruit` plan action increments queue (PlanExecutor path)
//   8. Fallback planner emits a recruit step when food surplus + below target
//
// Test fixture pattern: drives RecruitmentSystem directly with a deterministic
// rng services object so spawn placement is stable. EntityFactory's default
// recruitTarget=16 + autoRecruit=true is exercised.

import test from "node:test";
import assert from "node:assert/strict";

import { TILE } from "../src/config/constants.js";
import { BALANCE } from "../src/config/balance.js";
import {
  RecruitmentSystem,
  PopulationGrowthSystem,
} from "../src/simulation/population/PopulationGrowthSystem.js";
import { createInitialGameState, createWorker } from "../src/entities/EntityFactory.js";
import { tileToWorld } from "../src/world/grid/Grid.js";
import { executeNextSteps, groundPlanStep } from "../src/simulation/ai/colony/PlanExecutor.js";
import { generateFallbackPlan, validatePlanResponse } from "../src/simulation/ai/colony/ColonyPlanner.js";

const RECRUIT_FOOD_COST = Number(BALANCE.recruitFoodCost ?? 25);
const RECRUIT_COOLDOWN_SEC = Number(BALANCE.recruitCooldownSec ?? 30);
const RECRUIT_MAX_QUEUE = Number(BALANCE.recruitMaxQueueSize ?? 12);
const RECRUIT_MIN_BUFFER = Number(BALANCE.recruitMinFoodBuffer ?? 80);

function findWarehouseTile(state) {
  const { grid } = state;
  for (let iz = 0; iz < grid.height; iz += 1) {
    for (let ix = 0; ix < grid.width; ix += 1) {
      if (grid.tiles[ix + iz * grid.width] === TILE.WAREHOUSE) return { ix, iz };
    }
  }
  return null;
}

function deterministicServices() {
  return { rng: { next: () => 0.5 } };
}

test("EntityFactory seeds recruit controls with sane defaults", () => {
  const state = createInitialGameState();
  assert.equal(state.controls.recruitTarget, 16, "default recruitTarget=16");
  assert.equal(state.controls.recruitQueue, 0, "default recruitQueue=0");
  assert.equal(state.controls.autoRecruit, true, "default autoRecruit=true");
  assert.equal(state.controls.recruitCooldownSec, 0, "default cooldown=0");
});

test("RecruitmentSystem class is reachable under both names (rename alias)", () => {
  // The file keeps `PopulationGrowthSystem` as a backwards-compat export so
  // GameApp/SimHarness imports keep working without churning unrelated files.
  assert.equal(PopulationGrowthSystem, RecruitmentSystem,
    "PopulationGrowthSystem must alias RecruitmentSystem");
  const sys = new RecruitmentSystem();
  assert.equal(sys.name, "RecruitmentSystem");
});

test("cooldown ticks down each frame regardless of 1Hz check cadence", () => {
  const state = createInitialGameState();
  state.controls.recruitCooldownSec = 5;
  const sys = new RecruitmentSystem();
  // dt < 1s should still subtract from cooldown even though the 1Hz
  // recruit-check timer has not fired yet.
  sys.update(0.5, state, deterministicServices());
  assert.ok(state.controls.recruitCooldownSec < 5,
    `cooldown should decay; got ${state.controls.recruitCooldownSec}`);
  assert.ok(state.controls.recruitCooldownSec >= 4.0,
    `cooldown should not over-decay; got ${state.controls.recruitCooldownSec}`);
});

test("food < recruitMinFoodBuffer blocks auto-recruit enqueue", () => {
  const state = createInitialGameState();
  state.resources.food = RECRUIT_MIN_BUFFER - 5; // below buffer
  state.controls.recruitQueue = 0;
  state.controls.recruitTarget = 32;
  state.controls.autoRecruit = true;
  state.controls.recruitCooldownSec = 0;
  const initialQueue = state.controls.recruitQueue;
  const initialAgents = state.agents.length;

  const sys = new RecruitmentSystem();
  sys._timer = 0;
  sys.update(1, state, deterministicServices());

  assert.equal(state.controls.recruitQueue, initialQueue,
    "auto-recruit must not enqueue when food below minFoodBuffer");
  assert.equal(state.agents.length, initialAgents,
    "no spawn should happen with food below minFoodBuffer");
});

test("auto-recruit increments queue toward recruitTarget when food sufficient", () => {
  const state = createInitialGameState();
  // Strip workers so room is large; replace with one anchor worker so the
  // perceiver/listTilesByType still has a context.
  const wh = findWarehouseTile(state);
  const pos = tileToWorld(wh.ix, wh.iz, state.grid);
  state.agents = [createWorker(pos.x, pos.z, () => 0.2)];
  state.resources.food = 500;          // well above min buffer
  state.controls.recruitTarget = 8;
  state.controls.recruitQueue = 0;
  state.controls.autoRecruit = true;
  // Make cooldown high so we observe the enqueue without an immediate spawn.
  state.controls.recruitCooldownSec = 1000;

  const sys = new RecruitmentSystem();
  sys._timer = 0;
  sys.update(1, state, deterministicServices());
  assert.ok(state.controls.recruitQueue >= 1,
    `auto-recruit should enqueue at least 1 toward target; queue=${state.controls.recruitQueue}`);
});

test("queue=1 + cooldown=0 + food>=cost spawns a worker, deducts food, sets cooldown", () => {
  const state = createInitialGameState();
  const wh = findWarehouseTile(state);
  const pos = tileToWorld(wh.ix, wh.iz, state.grid);
  state.agents = [createWorker(pos.x, pos.z, () => 0.2)];
  state.resources.food = 200;
  state.controls.recruitQueue = 1;
  state.controls.recruitCooldownSec = 0;
  state.controls.autoRecruit = false;
  state.controls.recruitTarget = 0; // disable auto-fill

  const initialAgents = state.agents.length;
  const sys = new RecruitmentSystem();
  sys._timer = 0;
  sys.update(0, state, deterministicServices());

  assert.equal(state.agents.length, initialAgents + 1,
    "expected exactly one new worker spawned");
  assert.equal(state.resources.food, 200 - RECRUIT_FOOD_COST,
    "food must be reduced by recruitFoodCost");
  assert.equal(state.controls.recruitQueue, 0, "queue decremented to 0");
  assert.equal(state.controls.recruitCooldownSec, RECRUIT_COOLDOWN_SEC,
    "cooldown reset to recruitCooldownSec after spawn");
  assert.equal(state.metrics.birthsTotal, 1,
    "birthsTotal incremented (survival-score compatibility)");
  assert.equal(state.metrics.recruitTotal, 1,
    "recruitTotal incremented (Phase 11 metric)");
});

test("cooldown > 0 blocks spawn even when queue and food are ready", () => {
  const state = createInitialGameState();
  const wh = findWarehouseTile(state);
  const pos = tileToWorld(wh.ix, wh.iz, state.grid);
  state.agents = [createWorker(pos.x, pos.z, () => 0.2)];
  state.resources.food = 200;
  state.controls.recruitQueue = 1;
  state.controls.recruitCooldownSec = 15; // mid-cooldown
  state.controls.autoRecruit = false;
  state.controls.recruitTarget = 0;

  const initialAgents = state.agents.length;
  const sys = new RecruitmentSystem();
  sys._timer = 0;
  sys.update(0, state, deterministicServices());

  assert.equal(state.agents.length, initialAgents,
    "cooldown > 0 must block spawn");
  assert.equal(state.resources.food, 200, "food must remain untouched");
  assert.equal(state.controls.recruitQueue, 1, "queue must not decrement");
});

test("queue cap clamps queue at recruitMaxQueueSize", () => {
  const state = createInitialGameState();
  state.resources.food = 9999;
  state.controls.recruitTarget = 200; // huge so auto-recruit drives toward cap
  state.controls.recruitQueue = RECRUIT_MAX_QUEUE; // already at cap
  state.controls.autoRecruit = true;
  state.controls.recruitCooldownSec = 1000; // prevent spawn from draining

  const sys = new RecruitmentSystem();
  sys._timer = 0;
  sys.update(1, state, deterministicServices());

  assert.ok(state.controls.recruitQueue <= RECRUIT_MAX_QUEUE,
    `queue must not exceed cap; got ${state.controls.recruitQueue}`);
});

test("LLM recruit action: PlanExecutor enqueues count via state.controls.recruitQueue", () => {
  const state = createInitialGameState();
  state.controls.recruitQueue = 0;
  state.ai ??= {};

  // Build a minimal grounded plan with a recruit step (count=3).
  const recruitStep = {
    id: 1,
    thought: "test plan recruit",
    action: { type: "recruit", count: 3 },
    predicted_effect: {},
    priority: "medium",
    depends_on: [],
    status: "pending",
  };
  // Ground first (validates the recruit branch in groundPlanStep).
  const grounded = groundPlanStep(recruitStep, state, /* buildSystem */ {}, new Map());
  assert.equal(grounded.feasible, true, "recruit step grounds as trivially feasible");
  assert.equal(grounded.affordanceScore, 1, "recruit affordance is 1 (no cost)");

  const plan = { goal: "test", horizon_sec: 60, reasoning: "", steps: [grounded] };
  executeNextSteps(plan, state, /* buildSystem */ {}, /* services */ null);

  assert.equal(state.controls.recruitQueue, 3,
    "PlanExecutor should increment recruitQueue by the action count");
  assert.equal(plan.steps[0].status, "completed",
    "recruit step marked completed after execution");
});

test("LLM recruit action: count is clamped to 1..10 by validatePlanResponse", () => {
  // Valid count=2 — accepted.
  const ok = validatePlanResponse({
    goal: "x",
    horizon_sec: 60,
    reasoning: "",
    steps: [{
      id: 1,
      thought: "",
      action: { type: "recruit", count: 2 },
      priority: "medium",
      depends_on: [],
    }],
  });
  assert.equal(ok.ok, true, "count=2 plan should validate");
  assert.equal(ok.plan.steps[0].action.count, 2, "count=2 is preserved");

  // Out-of-range count=99 — clamped to 10.
  const clamped = validatePlanResponse({
    goal: "x",
    horizon_sec: 60,
    reasoning: "",
    steps: [{
      id: 1,
      thought: "",
      action: { type: "recruit", count: 99 },
      priority: "medium",
      depends_on: [],
    }],
  });
  assert.equal(clamped.ok, true, "count=99 plan should validate (after clamp)");
  assert.equal(clamped.plan.steps[0].action.count, 10, "count must clamp to 10");

  // Missing/zero count — rejected.
  const bad = validatePlanResponse({
    goal: "x",
    horizon_sec: 60,
    reasoning: "",
    steps: [{
      id: 1,
      thought: "",
      action: { type: "recruit", count: 0 },
      priority: "medium",
      depends_on: [],
    }],
  });
  assert.equal(bad.ok, false, "count=0 plan must be rejected");
});

test("PlanExecutor clamps cumulative recruit queue to BALANCE.recruitMaxQueueSize", () => {
  const state = createInitialGameState();
  state.controls.recruitQueue = RECRUIT_MAX_QUEUE - 2;

  const recruitStep = {
    id: 1,
    thought: "test cap",
    action: { type: "recruit", count: 10 },
    predicted_effect: {},
    priority: "medium",
    depends_on: [],
    status: "pending",
  };
  const grounded = groundPlanStep(recruitStep, state, {}, new Map());
  const plan = { goal: "t", horizon_sec: 60, reasoning: "", steps: [grounded] };
  executeNextSteps(plan, state, {}, null);

  assert.equal(state.controls.recruitQueue, RECRUIT_MAX_QUEUE,
    "executor clamps queue to BALANCE.recruitMaxQueueSize");
});

test("Fallback planner emits a recruit step when food surplus + pop below target", () => {
  const state = createInitialGameState();
  state.resources.food = RECRUIT_MIN_BUFFER + 100; // generous surplus
  state.resources.wood = 5;                          // limit other priorities
  state.controls.recruitTarget = 32;
  state.controls.recruitQueue = 0;
  state.controls.autoRecruit = false;
  state.ai ??= {};
  state.ai.foodRecoveryMode = false;

  // Build a minimal observation that the fallback planner reads.
  const observation = {
    economy: {
      food: { rate: 0.5, stock: state.resources.food },
      wood: { rate: 0.1, stock: state.resources.wood },
    },
    topology: { clusters: [{ id: "c0", center: { ix: 10, iz: 10 } }], coveragePercent: 100, expansionFrontiers: [] },
    workforce: { total: state.agents.filter((a) => a.type === "WORKER").length },
    defense: { threat: 0 },
    affordable: {},
  };

  const plan = generateFallbackPlan(observation, state);
  const recruitStep = plan.steps.find((s) => s.action?.type === "recruit");
  assert.ok(recruitStep, "fallback plan should contain a recruit step on food surplus");
  assert.ok(recruitStep.action.count >= 1 && recruitStep.action.count <= 10,
    `recruit count should be in [1,10]; got ${recruitStep.action.count}`);
});

test("Fallback planner does NOT recruit when in foodRecoveryMode", () => {
  const state = createInitialGameState();
  state.resources.food = RECRUIT_MIN_BUFFER + 200;
  state.controls.recruitTarget = 32;
  state.controls.recruitQueue = 0;
  state.ai ??= {};
  state.ai.foodRecoveryMode = true; // panic flag — block recruit

  const observation = {
    economy: {
      food: { rate: 0.5, stock: state.resources.food },
      wood: { rate: 0.1, stock: state.resources.wood ?? 0 },
    },
    topology: { clusters: [], coveragePercent: 100, expansionFrontiers: [] },
    workforce: { total: 1 },
    defense: { threat: 0 },
    affordable: {},
  };

  const plan = generateFallbackPlan(observation, state);
  const recruitStep = plan.steps.find((s) => s.action?.type === "recruit");
  assert.equal(recruitStep, undefined,
    "fallback must not recruit while foodRecoveryMode is active");
});
