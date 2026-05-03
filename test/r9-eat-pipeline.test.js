// R9 PW Plan-Eat-Pipeline (v0.10.2) — invariants for the two-prong
// eat-pipeline unblock:
//   1. WorkerAISystem._emergencyRationStep (via consumeEmergencyRation)
//      now bypasses the v0.8.8 D1 "warehouse-reachable → skip carry-eat"
//      guard when hunger<0.15 AND carry.food>0. Workers stuck behind a
//      30-deep warehouse queue at hunger=0.10 eat from carry instead of
//      starving while waiting in line.
//   2. WarehouseNeedProposer fires a warehouse build need at priority 88
//      when the workers/warehouse ratio exceeds 12, slot one notch under
//      the R6 PK / R9 PZ noAccess @90 cases so noAccess preempts.
//
// PW reference: PW Test C (50 workers, 1 warehouse, 49/50 critical hunger
// while food=3879 sat in stockpile).

import test from "node:test";
import assert from "node:assert/strict";

import { consumeEmergencyRation } from "../src/simulation/npc/WorkerAISystem.js";
import { WarehouseNeedProposer } from "../src/simulation/ai/colony/proposers/WarehouseNeedProposer.js";

// ---------------------------------------------------------------------------
// Step 1 — survival-bypass invariants on _emergencyRationStep
// ---------------------------------------------------------------------------
//
// Test scaffold: build the minimal worker + state to drive
// consumeEmergencyRation through the warehouse-reachable branch. The
// reachability cache is intentionally absent (services=null) so the
// branch falls back to `worker.debug?.reachableFood`, which we set to
// `true` to simulate "warehouse globally reachable but queue-blocked".

function makeWorker({ hunger = 0.10, carryFood = 2 } = {}) {
  return {
    hunger,
    carry: { food: carryFood, wood: 0, stone: 0, herbs: 0 },
    blackboard: {},
    debug: { reachableFood: true },
    x: 0,
    z: 0,
  };
}

function makeState({ stockpileFood = 100 } = {}) {
  return {
    resources: { food: stockpileFood, wood: 0, stone: 0, herbs: 0 },
    buildings: { warehouses: 1 },
    metrics: { timeSec: 60, tick: 0 },
  };
}

test("R9 eat-pipeline #1 — survival-critical (hunger<0.15, carry.food>0): carry-eat fires despite reachable warehouse", () => {
  const worker = makeWorker({ hunger: 0.10, carryFood: 2 });
  const state = makeState({ stockpileFood: 100 });
  const initialHunger = worker.hunger;
  const initialStockpile = state.resources.food;
  const initialCarry = worker.carry.food;

  consumeEmergencyRation(worker, state, 0.5, /* services */ null);

  // Hunger should have increased (hunger goes UP toward 1.0 = "satiated" in
  // this codebase's convention — `worker.hunger += eat * recoveryPerFood`).
  assert.ok(
    worker.hunger > initialHunger,
    `survival-bypass should fire — hunger unchanged (initial=${initialHunger} final=${worker.hunger}).`,
  );
  // Either stockpile or carry must have decreased; the function prefers
  // stockpile food when available.
  const ateFromStockpile = state.resources.food < initialStockpile;
  const ateFromCarry = worker.carry.food < initialCarry;
  assert.ok(
    ateFromStockpile || ateFromCarry,
    "survival-bypass should consume from stockpile or carry.",
  );
});

test("R9 eat-pipeline #2 — non-survival (hunger=0.30, carry.food>0): v0.8.8 D1 contract preserved (carry-eat blocked)", () => {
  const worker = makeWorker({ hunger: 0.30, carryFood: 2 });
  const state = makeState({ stockpileFood: 100 });
  const initialHunger = worker.hunger;
  const initialStockpile = state.resources.food;
  const initialCarry = worker.carry.food;

  consumeEmergencyRation(worker, state, 0.5, /* services */ null);

  assert.equal(
    worker.hunger,
    initialHunger,
    "non-survival hunger should not trigger carry-eat (v0.8.8 D1 deposit-first contract).",
  );
  assert.equal(state.resources.food, initialStockpile, "stockpile should be untouched at hunger=0.30.");
  assert.equal(worker.carry.food, initialCarry, "carry should be untouched at hunger=0.30.");
});

// ---------------------------------------------------------------------------
// Step 2 — WarehouseNeedProposer contention sensor invariants
// ---------------------------------------------------------------------------

function makeCtx({ workers = 50, warehouses = 1, food = 200, wood = 30 } = {}) {
  return {
    workers,
    food,
    wood,
    buildings: { farms: 4, lumbers: 1, quarries: 0, warehouses, herbGardens: 0 },
    resources: { food, wood, stone: 0, herbs: 0 },
    timeSec: 60,
  };
}

function makeStateWithAgents(workers = 0) {
  // Fully-fed agents — keeps the R6 PK hunger-crisis branch and the R9 PZ
  // diagnostic branch silent so we isolate the contention sensor.
  const agents = [];
  for (let i = 0; i < workers; i++) {
    agents.push({ type: "WORKER", alive: true, hunger: 0.85, debug: {} });
  }
  return { agents, ai: {} };
}

test("R9 eat-pipeline #3 — contention sensor fires at 50:1 with priority 88", () => {
  const state = makeStateWithAgents(50);
  const out = WarehouseNeedProposer.evaluate(state, makeCtx({
    workers: 50, warehouses: 1, food: 200,
  }));
  assert.equal(out.length, 1, "expected one warehouse build need from contention sensor");
  assert.equal(out[0].type, "warehouse");
  assert.equal(out[0].priority, 88, "contention priority must be 88 (one notch under noAccess @90)");
  assert.match(out[0].reason, /contention/, `expected contention reason, got: ${out[0].reason}`);
});

test("R9 eat-pipeline #4 — contention sensor silent at 10:1 (under threshold)", () => {
  const state = makeStateWithAgents(10);
  const out = WarehouseNeedProposer.evaluate(state, makeCtx({
    workers: 10, warehouses: 1, food: 200,
  }));
  assert.deepEqual(out, [], "10 workers / 1 warehouse should NOT trigger contention sensor");
});

test("R9 eat-pipeline #5 — noAccess (warehouses=0) preempts contention via @90 hunger-crisis branch", () => {
  // 50 critically-hungry workers, 0 warehouses → R6 PK noAccess+hungerCrisis
  // branch fires at @90, beating the @88 contention path even though the
  // ratio is technically infinite.
  const agents = [];
  for (let i = 0; i < 50; i++) {
    agents.push({ type: "WORKER", alive: true, hunger: 0.10, debug: {} });
  }
  const state = { agents, ai: {} };
  const out = WarehouseNeedProposer.evaluate(state, makeCtx({
    workers: 50, warehouses: 0, food: 20,
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].priority, 90, "noAccess+hungerCrisis must beat contention via @90");
  assert.match(out[0].reason, /no warehouse access point/);
});
