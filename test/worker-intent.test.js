import test from "node:test";
import assert from "node:assert/strict";

import { chooseWorkerIntent } from "../src/simulation/npc/WorkerAISystem.js";

function baseState() {
  return {
    resources: { food: 50, wood: 50 },
    buildings: { warehouses: 1, farms: 1, lumbers: 1, walls: 0 },
  };
}

test("Worker intent priority is Eat > Deliver > Role Work", () => {
  const state = baseState();
  const worker = {
    hunger: 0.2,
    carry: { food: 2, wood: 0 },
    role: "WOOD",
  };

  assert.equal(chooseWorkerIntent(worker, state), "eat");

  worker.hunger = 0.7;
  assert.equal(chooseWorkerIntent(worker, state), "deliver");

  worker.carry = { food: 0, wood: 0 };
  assert.equal(chooseWorkerIntent(worker, state), "lumber");

  worker.role = "FARM";
  assert.equal(chooseWorkerIntent(worker, state), "farm");
});
