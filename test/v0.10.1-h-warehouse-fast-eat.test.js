// v0.10.1-h (P4) — at-warehouse fast-eat tests.
// Verifies that workers physically at the warehouse eat food and recover
// hunger via warehouseFastEat, and workers on carry-eat path recover via
// carryEatStep, replacing the v0.10.0-c consumeEmergencyRation no-op.

import test from "node:test";
import assert from "node:assert/strict";

import { BALANCE } from "../src/config/balance.js";
import { warehouseFastEat, carryEatStep } from "../src/simulation/npc/WorkerAISystem.js";
import { hungerRecovered } from "../src/simulation/npc/fsm/WorkerConditions.js";

const DT = 1 / 30;

function makeWorker(hunger = 0.10, carryFood = 0) {
  return {
    type: "WORKER",
    id: "w_test",
    hunger,
    carry: { food: carryFood, wood: 0, stone: 0, herbs: 0 },
    fsm: { state: "EATING", enteredAtSec: 0, target: { ix: 5, iz: 5 } },
    blackboard: {},
    debug: {},
  };
}

function makeState(foodAmt = 100, timeSec = 0) {
  return {
    resources: { food: foodAmt },
    metrics: { timeSec },
    _warehouseEatBudgetThisTick: Number(BALANCE.warehouseEatCapPerSecond ?? 4) * DT,
    grid: null,
  };
}

// ─── warehouseFastEat ────────────────────────────────────────────────────────

test("warehouseFastEat: worker eats food and hunger rises each tick", () => {
  const worker = makeWorker(0.10);
  const state = makeState(100);
  const hungerBefore = worker.hunger;
  const foodBefore = state.resources.food;

  warehouseFastEat(worker, state, DT, null);

  assert.ok(worker.hunger > hungerBefore, "hunger should increase after fast-eat");
  assert.ok(state.resources.food < foodBefore, "food stockpile should decrease");
});

test("warehouseFastEat: stops eating at workerEatRecoveryTarget", () => {
  const recoveryTarget = Number(BALANCE.workerEatRecoveryTarget ?? 0.70);
  const worker = makeWorker(recoveryTarget); // already at target
  const state = makeState(100);
  const foodBefore = state.resources.food;

  warehouseFastEat(worker, state, DT, null);

  assert.equal(state.resources.food, foodBefore, "no food consumed when already at recovery target");
});

test("warehouseFastEat: respects global per-tick budget", () => {
  // Set a tiny budget that covers only 1 worker's eating.
  const perWorkerAmt = Number(BALANCE.warehouseEatRatePerWorkerPerSecond ?? 0.30) * DT;
  const state = makeState(100);
  state._warehouseEatBudgetThisTick = perWorkerAmt * 0.5; // half a worker's portion

  const w1 = makeWorker(0.10);
  const w2 = makeWorker(0.10);
  const food0 = state.resources.food;

  warehouseFastEat(w1, state, DT, null); // eats (partial)
  const foodAfterW1 = state.resources.food;
  assert.ok(foodAfterW1 < food0, "first worker should eat from budget");

  warehouseFastEat(w2, state, DT, null); // budget exhausted → falls to carryEatStep
  // carryEatStep also eats from stockpile, so food still decreases
  assert.ok(state.resources.food <= foodAfterW1, "second worker falls back to carryEatStep");
  // Budget should be at or below 0 after w1
  assert.ok(
    state._warehouseEatBudgetThisTick <= 0,
    "budget should be exhausted after w1",
  );
});

test("warehouseFastEat: full recovery in ~25 seconds or less", () => {
  const recoveryTarget = Number(BALANCE.workerEatRecoveryTarget ?? 0.70);
  const worker = makeWorker(0.05); // very low hunger
  const BUDGET_PER_TICK = Number(BALANCE.warehouseEatCapPerSecond ?? 4) * DT;
  const state = makeState(1000);

  let ticks = 0;
  const MAX_TICKS = Math.round(25 / DT);
  while (worker.hunger < recoveryTarget && ticks < MAX_TICKS) {
    state._warehouseEatBudgetThisTick = BUDGET_PER_TICK;
    warehouseFastEat(worker, state, DT, null);
    ticks++;
  }

  assert.ok(
    worker.hunger >= recoveryTarget,
    `worker should recover to ${recoveryTarget} within 25 s; got ${worker.hunger.toFixed(3)} after ${(ticks / 30).toFixed(1)}s`,
  );
});

// ─── carryEatStep ────────────────────────────────────────────────────────────

test("carryEatStep: eat from warehouse stockpile when carry food empty", () => {
  const worker = makeWorker(0.05, 0); // no carry food
  const state = makeState(100);
  const foodBefore = state.resources.food;
  const hungerBefore = worker.hunger;

  carryEatStep(worker, state, DT);

  assert.ok(worker.hunger > hungerBefore, "hunger should rise from stockpile eat");
  assert.ok(state.resources.food < foodBefore, "stockpile should decrease");
});

test("carryEatStep: prefers carry food over stockpile", () => {
  const worker = makeWorker(0.05, 2.0); // has carry food
  const state = makeState(100);
  const carryBefore = worker.carry.food;
  const stockBefore = state.resources.food;

  carryEatStep(worker, state, DT);

  assert.ok(worker.carry.food < carryBefore, "carry food should be consumed first");
  assert.equal(state.resources.food, stockBefore, "stockpile should be untouched when carry food available");
});

test("carryEatStep: returns early when no food available anywhere", () => {
  const worker = makeWorker(0.05, 0);
  const state = makeState(0); // no stockpile food
  const hungerBefore = worker.hunger;

  carryEatStep(worker, state, DT);

  assert.equal(worker.hunger, hungerBefore, "hunger unchanged when no food available");
});

test("carryEatStep: returns early when already at recovery target", () => {
  const recoveryTarget = Number(BALANCE.workerEatRecoveryTarget ?? 0.70);
  const worker = makeWorker(recoveryTarget, 1.0);
  const state = makeState(100);
  const foodBefore = state.resources.food;

  carryEatStep(worker, state, DT);

  assert.equal(state.resources.food, foodBefore, "no eating when already at recovery target");
});

// ─── hungerRecovered ─────────────────────────────────────────────────────────

test("hungerRecovered: at-warehouse exits when hunger >= recoveryTarget", () => {
  const recoveryTarget = Number(BALANCE.workerEatRecoveryTarget ?? 0.70);
  const worker = makeWorker(recoveryTarget); // hunger = recoveryTarget
  // at-warehouse: target has no meta.carryEat
  worker.fsm.target = { ix: 5, iz: 5 };
  const state = { metrics: { timeSec: 0 } };

  assert.equal(hungerRecovered(worker, state, null), true, "should exit at recovery target");
});

test("hungerRecovered: at-warehouse does NOT exit at seek threshold (0.18)", () => {
  const worker = makeWorker(0.18); // at seek threshold, not recovery target
  worker.fsm.target = { ix: 5, iz: 5 }; // at warehouse
  worker.fsm.enteredAtSec = 0;
  const state = { metrics: { timeSec: 1.0 } }; // only 1s in state

  assert.equal(hungerRecovered(worker, state, null), false, "should NOT exit at seek threshold (at-warehouse path waits for full recovery)");
});

test("hungerRecovered: at-warehouse safety cap fires at 25s", () => {
  const worker = makeWorker(0.05); // very low hunger, won't recover
  worker.fsm.target = { ix: 5, iz: 5 };
  worker.fsm.enteredAtSec = 0;
  const state = { metrics: { timeSec: 25.1 } }; // past safety cap

  assert.equal(hungerRecovered(worker, state, null), true, "25s safety cap should fire");
});

test("hungerRecovered: carry-eat exits when hunger >= recoveryTarget", () => {
  const recoveryTarget = Number(BALANCE.workerEatRecoveryTarget ?? 0.70);
  const worker = makeWorker(recoveryTarget);
  worker.fsm.target = { ix: 3, iz: 3, meta: { carryEat: true } };
  worker.fsm.enteredAtSec = 0;
  const state = { metrics: { timeSec: 1.0 } };

  assert.equal(hungerRecovered(worker, state, null), true, "carry-eat should exit at recovery target");
});

test("hungerRecovered: carry-eat safety cap fires at 40s", () => {
  const worker = makeWorker(0.01); // hunger won't recover (no food)
  worker.fsm.target = { ix: 3, iz: 3, meta: { carryEat: true } };
  worker.fsm.enteredAtSec = 0;
  const state = { metrics: { timeSec: 40.1 } };

  assert.equal(hungerRecovered(worker, state, null), true, "40s carry-eat safety cap should fire");
});

test("hungerRecovered: carry-eat does NOT exit at 3s (old v0.10.0-c behaviour removed)", () => {
  const worker = makeWorker(0.10); // hungry but not at recovery target
  worker.fsm.target = { ix: 3, iz: 3, meta: { carryEat: true } };
  worker.fsm.enteredAtSec = 0;
  const state = { metrics: { timeSec: 3.1 } }; // 3.1s in state (v0.10.0-c would have exited)

  assert.equal(hungerRecovered(worker, state, null), false, "carry-eat should NOT force-exit at 3s anymore");
});
