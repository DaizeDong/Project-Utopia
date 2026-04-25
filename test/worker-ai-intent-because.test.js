// test/worker-ai-intent-because.test.js
// v0.8.2 Round-5b (02d Step 6d)
// Verifies that chooseWorkerIntent writes lastIntentReason for each branch.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chooseWorkerIntent } from "../src/simulation/npc/WorkerAISystem.js";
import { ROLE } from "../src/config/constants.js";

function makeWorker(overrides = {}) {
  return {
    id: "w-test",
    type: "WORKER",
    alive: true,
    hunger: 0.9,
    role: ROLE.FARM,
    carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
    blackboard: { carryAgeSec: 0 },
    debug: {},
    x: 5,
    z: 5,
    ...overrides,
  };
}

function makeState(overrides = {}) {
  return {
    buildings: { farms: 3, lumbers: 2, warehouses: 1, kitchens: 0, smithies: 0, clinics: 0, quarries: 0, herbGardens: 0 },
    resources: { food: 50, wood: 30, stone: 10, herbs: 5 },
    grid: { tiles: new Uint8Array(10 * 10), width: 10, height: 10, version: 0 },
    fog: { visibility: new Uint8Array(10 * 10).fill(255) },
    agents: [],
    ...overrides,
  };
}

describe("chooseWorkerIntent sets lastIntentReason", () => {
  it("eat branch: writes hunger gate values", () => {
    const worker = makeWorker({ hunger: 0.05 }); // very hungry
    const state = makeState({ resources: { food: 10, wood: 10, stone: 5, herbs: 2 } });
    const intent = chooseWorkerIntent(worker, state);
    assert.strictEqual(intent, "eat");
    assert.ok(typeof worker.debug.lastIntentReason === "string", "lastIntentReason is string");
    assert.ok(worker.debug.lastIntentReason.includes("hunger="), "reason includes hunger value");
    assert.ok(worker.debug.lastIntentReason.includes("threshold="), "reason includes threshold value");
  });

  it("deliver branch: writes carry trigger reason", () => {
    const worker = makeWorker({
      carry: { food: 3, wood: 0, stone: 0, herbs: 0 }, // carryTotal=3 >= threshold ~2.4
    });
    const state = makeState();
    const intent = chooseWorkerIntent(worker, state);
    assert.strictEqual(intent, "deliver");
    assert.ok(typeof worker.debug.lastIntentReason === "string", "lastIntentReason is string");
    assert.ok(worker.debug.lastIntentReason.length > 0, "reason is non-empty");
  });

  it("farm branch: writes role and farm count", () => {
    const worker = makeWorker({ role: ROLE.FARM });
    const state = makeState({ buildings: { farms: 5, lumbers: 1, warehouses: 1, kitchens: 0, smithies: 0, clinics: 0, quarries: 0, herbGardens: 0 } });
    const intent = chooseWorkerIntent(worker, state);
    assert.strictEqual(intent, "farm");
    assert.ok(worker.debug.lastIntentReason.includes("FARM"), "reason includes FARM");
    assert.ok(worker.debug.lastIntentReason.includes("5"), "reason includes farm count");
  });

  it("wander branch: writes no worksite reason", () => {
    const worker = makeWorker({ role: ROLE.FARM });
    const state = makeState({
      buildings: { farms: 0, lumbers: 0, warehouses: 0, kitchens: 0, smithies: 0, clinics: 0, quarries: 0, herbGardens: 0 },
      fog: { visibility: new Uint8Array(10 * 10).fill(255) }, // all visible → no frontier
    });
    const intent = chooseWorkerIntent(worker, state);
    assert.ok(["wander", "explore_fog"].includes(intent), `intent=${intent} should be wander or explore_fog`);
    assert.ok(typeof worker.debug.lastIntentReason === "string", "lastIntentReason is string");
    assert.ok(worker.debug.lastIntentReason.includes("role="), "reason mentions role");
  });
});
