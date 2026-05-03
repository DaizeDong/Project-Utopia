// v0.10.1 R6 PK-perf-and-warehouse — sub-fix (b) test:
// WarehouseNeedProposer covers the "no warehouse access point" wipe pattern
// that EmergencyShortageProposer misses (its food-logistics rule guards on
// `warehouseCount > 0`, so a 0-warehouse + critical-hunger map gets no
// warehouse build need from the wave-1 family).

import test from "node:test";
import assert from "node:assert/strict";

import { WarehouseNeedProposer } from "../src/simulation/ai/colony/proposers/WarehouseNeedProposer.js";

function makeCtx({
  workers = 5,
  food = 100,
  wood = 30,
  warehouses = 1,
  farms = 2,
  lumbers = 1,
  quarries = 0,
} = {}) {
  return {
    workers,
    food,
    wood,
    buildings: { farms, lumbers, warehouses, quarries, herbGardens: 0 },
    resources: { food, wood, stone: 0, herbs: 0 },
    timeSec: 60,
  };
}

function makeStateWithHunger({ aliveWorkers = 5, criticalCount = 0 } = {}) {
  const agents = [];
  for (let i = 0; i < aliveWorkers; i++) {
    agents.push({
      type: "WORKER",
      alive: true,
      hunger: i < criticalCount ? 0.10 : 0.80,
    });
  }
  return { agents };
}

// -----------------------------------------------------------------------------
// Trigger conditions — fires when route is broken AND there's hunger pressure
// -----------------------------------------------------------------------------

test("WarehouseNeed fires when warehouses=0 AND food<60 (cold hunger crisis)", () => {
  const state = makeStateWithHunger();
  const out = WarehouseNeedProposer.evaluate(state, makeCtx({
    warehouses: 0, food: 20,
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "warehouse");
  assert.equal(out[0].priority, 90);
  assert.match(out[0].reason, /no warehouse access point/);
});

test("WarehouseNeed fires when warehouses=0 AND criticalHungerRatio>0.5", () => {
  // 5 workers, 4 critical → ratio = 0.8 > 0.5; food can be high.
  const state = makeStateWithHunger({ aliveWorkers: 5, criticalCount: 4 });
  const out = WarehouseNeedProposer.evaluate(state, makeCtx({
    warehouses: 0, food: 200,
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "warehouse");
});

test("WarehouseNeed fires when existing warehouses are over-saturated", () => {
  // 1 warehouse, capacity≈200, food=200 → ratio 1.0 ≥ 0.95 → saturated.
  const state = makeStateWithHunger();
  const out = WarehouseNeedProposer.evaluate(state, makeCtx({
    warehouses: 1, food: 200,
  }));
  // food=200 > 60 so hungerCrisis must come from criticalRatio. Default state
  // has 0 critical → ratio 0; need to bump.
  assert.deepEqual(out, [], "saturated alone is not enough — needs hunger");
  const stateHungry = makeStateWithHunger({ aliveWorkers: 5, criticalCount: 4 });
  const out2 = WarehouseNeedProposer.evaluate(stateHungry, makeCtx({
    warehouses: 1, food: 200,
  }));
  assert.equal(out2.length, 1);
  assert.match(out2[0].reason, /saturated/);
});

// -----------------------------------------------------------------------------
// Silent paths — warehouse exists with headroom OR no hunger crisis
// -----------------------------------------------------------------------------

test("WarehouseNeed silent when warehouse exists with headroom AND food OK", () => {
  // warehouses=1, food=10, cap=200 → ratio 0.05; food=10<60 hungerCrisis=true,
  // but noAccess=false AND not saturated → silent.
  const state = makeStateWithHunger();
  const out = WarehouseNeedProposer.evaluate(state, makeCtx({
    warehouses: 1, food: 10,
  }));
  assert.deepEqual(out, []);
});

test("WarehouseNeed silent when food is healthy and no hunger crisis", () => {
  // warehouses=0 → noAccess=true; food=100 > 60; criticalRatio=0 → silent.
  const state = makeStateWithHunger();
  const out = WarehouseNeedProposer.evaluate(state, makeCtx({
    warehouses: 0, food: 100,
  }));
  assert.deepEqual(out, []);
});

test("WarehouseNeed silent on empty agents list", () => {
  // No agents at all — criticalRatio defaults to 0; food=100 → no crisis.
  const out = WarehouseNeedProposer.evaluate({ agents: [] }, makeCtx({
    warehouses: 0, food: 100,
  }));
  assert.deepEqual(out, []);
});

test("WarehouseNeed exposes name + evaluate (proposer interface compliance)", () => {
  assert.equal(WarehouseNeedProposer.name, "warehouseNeed");
  assert.equal(typeof WarehouseNeedProposer.evaluate, "function");
});
