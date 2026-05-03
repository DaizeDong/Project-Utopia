// v0.10.1 R5 wave-1 (C1-build-proposer refactor):
// Interface contract test for `src/simulation/ai/colony/BuildProposer.js`
// and the four default proposers
// (ZeroFarm, ZeroLumber, ZeroQuarry, EmergencyShortage).
//
// Locks:
//   1. `runProposers([])` returns `[]`.
//   2. `runProposers(null)` and `runProposers(undefined)` return `[]`
//      (defensive — wave-2 will allow nullable registries).
//   3. Each default proposer exposes `name: string` and
//      `evaluate(state, ctx): BuildNeed[]`.
//   4. Each default proposer matches the legacy if-block output for
//      canonical pre/post conditions.
//   5. `runProposers` concatenates outputs in registration order.

import test from "node:test";
import assert from "node:assert/strict";

import {
  runProposers,
  DEFAULT_BUILD_PROPOSERS,
  ZeroFarmProposer,
  ZeroLumberProposer,
  ZeroQuarryProposer,
  EmergencyShortageProposer,
} from "../src/simulation/ai/colony/BuildProposer.js";

function makeCtx({
  workers = 5,
  food = 100,
  wood = 30,
  farms = 2,
  lumbers = 1,
  warehouses = 1,
  quarries = 0,
  herbGardens = 0,
  stone = 20,
  timeSec = 60,
} = {}) {
  return {
    workers,
    food,
    wood,
    buildings: { farms, lumbers, warehouses, quarries, herbGardens },
    resources: { food, wood, stone, herbs: 0, meals: 0, medicine: 0, tools: 0 },
    timeSec,
  };
}

// -----------------------------------------------------------------------------
// 1. runProposers — orchestrator contract
// -----------------------------------------------------------------------------

test("runProposers([], state, ctx) returns []", () => {
  const out = runProposers([], {}, makeCtx());
  assert.deepEqual(out, []);
});

test("runProposers(null, state, ctx) returns [] (defensive)", () => {
  assert.deepEqual(runProposers(null, {}, makeCtx()), []);
  assert.deepEqual(runProposers(undefined, {}, makeCtx()), []);
});

test("runProposers concatenates in registration order", () => {
  const A = { name: "A", evaluate: () => [{ type: "a", priority: 10, reason: "A" }] };
  const B = { name: "B", evaluate: () => [{ type: "b", priority: 20, reason: "B" }] };
  const C = { name: "C", evaluate: () => [{ type: "c", priority: 30, reason: "C" }] };
  const out = runProposers([A, B, C], {}, makeCtx());
  assert.deepEqual(out.map((n) => n.type), ["a", "b", "c"]);
});

test("runProposers skips proposers without evaluate()", () => {
  const A = { name: "A", evaluate: () => [{ type: "a", priority: 10, reason: "A" }] };
  const broken = { name: "broken" };
  const out = runProposers([A, broken, null, undefined, A], {}, makeCtx());
  assert.equal(out.length, 2);
  assert.equal(out[0].type, "a");
  assert.equal(out[1].type, "a");
});

test("runProposers tolerates proposer returning null/undefined", () => {
  const nullish = { name: "nullish", evaluate: () => null };
  const empty = { name: "empty", evaluate: () => [] };
  const out = runProposers([nullish, empty], {}, makeCtx());
  assert.deepEqual(out, []);
});

// -----------------------------------------------------------------------------
// 2. Default proposer interface shape
// -----------------------------------------------------------------------------

test("DEFAULT_BUILD_PROPOSERS has the 4 wave-1 proposers + R6 warehouseNeed in order", () => {
  // v0.10.1 R6 PK-perf-and-warehouse: WarehouseNeedProposer appended after
  // the original 4 to cover the "no warehouse access point" wipe pattern.
  assert.equal(DEFAULT_BUILD_PROPOSERS.length, 5);
  assert.equal(DEFAULT_BUILD_PROPOSERS[0].name, "zeroFarm");
  assert.equal(DEFAULT_BUILD_PROPOSERS[1].name, "zeroLumber");
  assert.equal(DEFAULT_BUILD_PROPOSERS[2].name, "zeroQuarry");
  assert.equal(DEFAULT_BUILD_PROPOSERS[3].name, "emergencyShortage");
  assert.equal(DEFAULT_BUILD_PROPOSERS[4].name, "warehouseNeed");
});

for (const proposer of [
  ZeroFarmProposer, ZeroLumberProposer, ZeroQuarryProposer, EmergencyShortageProposer,
]) {
  test(`${proposer?.name ?? "?"} proposer exposes name + evaluate`, () => {
    assert.equal(typeof proposer.name, "string");
    assert.ok(proposer.name.length > 0);
    assert.equal(typeof proposer.evaluate, "function");
    // Must not throw on a minimal ctx.
    const out = proposer.evaluate({}, makeCtx());
    assert.ok(Array.isArray(out));
  });
}

// -----------------------------------------------------------------------------
// 3. ZeroFarmProposer behaviour
// -----------------------------------------------------------------------------

test("ZeroFarmProposer fires farm@99 at t<180 when farms===0", () => {
  const out = ZeroFarmProposer.evaluate({}, makeCtx({ farms: 0, timeSec: 10 }));
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "farm");
  assert.equal(out[0].priority, 99);
});

test("ZeroFarmProposer silent when at least one farm exists", () => {
  const out = ZeroFarmProposer.evaluate({}, makeCtx({ farms: 1, timeSec: 10 }));
  assert.deepEqual(out, []);
});

test("ZeroFarmProposer silent after t>=180", () => {
  const out = ZeroFarmProposer.evaluate({}, makeCtx({ farms: 0, timeSec: 200 }));
  assert.deepEqual(out, []);
});

// -----------------------------------------------------------------------------
// 4. ZeroLumberProposer behaviour
// -----------------------------------------------------------------------------

test("ZeroLumberProposer fires lumber@95 at t<240 when lumbers===0", () => {
  const out = ZeroLumberProposer.evaluate({}, makeCtx({ lumbers: 0, timeSec: 10 }));
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "lumber");
  assert.equal(out[0].priority, 95);
});

test("ZeroLumberProposer silent when lumbers>=1", () => {
  const out = ZeroLumberProposer.evaluate({}, makeCtx({ lumbers: 1, timeSec: 10 }));
  assert.deepEqual(out, []);
});

test("ZeroLumberProposer silent after t>=240", () => {
  const out = ZeroLumberProposer.evaluate({}, makeCtx({ lumbers: 0, timeSec: 250 }));
  assert.deepEqual(out, []);
});

// -----------------------------------------------------------------------------
// 5. ZeroQuarryProposer behaviour
// -----------------------------------------------------------------------------

test("ZeroQuarryProposer fires quarry@95 when quarries===0 AND stone<15", () => {
  const out = ZeroQuarryProposer.evaluate({}, makeCtx({ quarries: 0, stone: 10 }));
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "quarry");
  assert.equal(out[0].priority, 95);
});

test("ZeroQuarryProposer fires quarry@95 when stone<5 even with quarries", () => {
  const out = ZeroQuarryProposer.evaluate({}, makeCtx({ quarries: 3, stone: 2 }));
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "quarry");
});

test("ZeroQuarryProposer silent when quarries>=1 AND stone>=15", () => {
  const out = ZeroQuarryProposer.evaluate({}, makeCtx({ quarries: 1, stone: 20 }));
  assert.deepEqual(out, []);
});

test("ZeroQuarryProposer boundary: stone===5 with quarries===1 silent", () => {
  // Original: `(currentQuarries === 0 && stoneStock < 15) || stoneStock < 5`
  // With quarries=1 and stone=5, neither sub-condition fires.
  const out = ZeroQuarryProposer.evaluate({}, makeCtx({ quarries: 1, stone: 5 }));
  assert.deepEqual(out, []);
});

// -----------------------------------------------------------------------------
// 6. EmergencyShortageProposer behaviour (4 sub-rules)
// -----------------------------------------------------------------------------

test("EmergencyShortage food-bottleneck: warehouse@100 when farms/warehouse > 3", () => {
  const out = EmergencyShortageProposer.evaluate({}, makeCtx({
    food: 20, farms: 7, warehouses: 2, workers: 5,
  }));
  // 7 farms / 2 warehouses = 3.5 > 3 → bottleneck rule fires.
  const wh = out.find((n) => n.type === "warehouse" && n.priority === 100);
  assert.ok(wh, "expected warehouse@100 food-bottleneck");
  assert.match(wh.reason, /bottleneck/i);
});

test("EmergencyShortage food-shortage: farm@100 when food<30 AND no bottleneck", () => {
  // farms 2, warehouse 2 → 2/2=1 ≤ 3 → bottleneck rule does NOT fire.
  // workers=5, maxFarmsEmergency=max(5,5)=5; farms 2 < 5 → farm@100 fires.
  const out = EmergencyShortageProposer.evaluate({}, makeCtx({
    food: 20, farms: 2, warehouses: 2, workers: 5,
  }));
  const farm = out.find((n) => n.type === "farm" && n.priority === 100);
  assert.ok(farm, "expected farm@100 food-shortage");
});

test("EmergencyShortage food-logistics: warehouse@100 when farms maxed", () => {
  // workers=5 → maxFarmsEmergency=5; farms=5 → not < 5, so farm@100 does NOT fire.
  // floor(5/5)+2 = 3, warehouses=2 < 3 → warehouse@100 logistics fires.
  // farms/warehouses = 5/2 = 2.5 ≤ 3 → bottleneck rule does NOT fire.
  const out = EmergencyShortageProposer.evaluate({}, makeCtx({
    food: 20, farms: 5, warehouses: 2, workers: 5,
  }));
  const wh = out.find((n) => n.type === "warehouse" && n.priority === 100);
  assert.ok(wh, "expected warehouse@100 food-logistics");
  assert.match(wh.reason, /need more warehouses/i);
});

test("EmergencyShortage wood-shortage: lumber@95 fires when wood<15 AND lumbers<6", () => {
  const out = EmergencyShortageProposer.evaluate({}, makeCtx({
    food: 100, wood: 5, lumbers: 2,
  }));
  const lumber = out.find((n) => n.type === "lumber" && n.priority === 95);
  assert.ok(lumber, "expected lumber@95 wood-shortage");
});

test("EmergencyShortage wood-shortage silent when lumbers>=6", () => {
  const out = EmergencyShortageProposer.evaluate({}, makeCtx({
    food: 100, wood: 5, lumbers: 6,
  }));
  const lumber = out.find((n) => n.type === "lumber" && n.priority === 95);
  assert.equal(lumber, undefined);
});

test("EmergencyShortage emits no needs when food OK and wood OK", () => {
  const out = EmergencyShortageProposer.evaluate({}, makeCtx({
    food: 100, wood: 50, farms: 5, warehouses: 3, lumbers: 4,
  }));
  assert.deepEqual(out, []);
});

test("EmergencyShortage food + wood can fire together", () => {
  // food<30 + wood<15 + lumbers<6 + warehouse logistics gap.
  // farms=2, workers=5, maxFarmsEmergency=5, farms<5 → farm@100 fires.
  // wood<15 + lumbers<6 → lumber@95 also fires.
  const out = EmergencyShortageProposer.evaluate({}, makeCtx({
    food: 10, wood: 5, farms: 2, warehouses: 1, lumbers: 1, workers: 5,
  }));
  assert.ok(out.find((n) => n.type === "farm" && n.priority === 100));
  assert.ok(out.find((n) => n.type === "lumber" && n.priority === 95));
});
