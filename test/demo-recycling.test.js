import test from "node:test";
import assert from "node:assert/strict";

import { BuildSystem } from "../src/simulation/construction/BuildSystem.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { TILE } from "../src/config/constants.js";
import { BALANCE, BUILD_COST } from "../src/config/balance.js";
import { EVENT_TYPES, getEventLog } from "../src/simulation/meta/GameEventBus.js";

// Locate the first valid build target for a given tool. Returns { ix, iz }
// or null — callers should always assert truthy before use.
function findFirstValid(state, buildSystem, tool) {
  for (let iz = 0; iz < state.grid.height; iz += 1) {
    for (let ix = 0; ix < state.grid.width; ix += 1) {
      if (buildSystem.previewToolAt(state, tool, ix, iz).ok) return { ix, iz };
    }
  }
  return null;
}

// Clear the event log so assertions only see events from the action under test.
function resetEvents(state) {
  if (state.events?.log) state.events.log.length = 0;
}

test("M1c-A: demolishing a FARM refunds demoStoneRecovery × stoneCost and demoWoodRecovery × woodCost", () => {
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();

  // Ensure the farm can be paid for regardless of terrain cost adjustments.
  state.resources.wood = 999;
  state.resources.stone = 999;

  const target = findFirstValid(state, buildSystem, "farm");
  assert.ok(target, "expected at least one valid farm placement on the seed map");

  const placed = buildSystem.placeToolAt(state, "farm", target.ix, target.iz);
  assert.equal(placed.ok, true);

  const woodBefore = state.resources.wood;
  const stoneBefore = state.resources.stone;

  const erased = buildSystem.placeToolAt(state, "erase", target.ix, target.iz);
  assert.equal(erased.ok, true);

  const expectedWood = Math.floor((BUILD_COST.farm.wood ?? 0) * BALANCE.demoWoodRecovery);
  const expectedStone = Math.floor((BUILD_COST.farm.stone ?? 0) * BALANCE.demoStoneRecovery);

  assert.equal(erased.refund.wood, expectedWood, "farm wood refund mismatch");
  assert.equal(erased.refund.stone, expectedStone, "farm stone refund mismatch");
  assert.equal(state.resources.wood, woodBefore + expectedWood, "wood stockpile must increase by refund");
  assert.equal(state.resources.stone, stoneBefore + expectedStone, "stone stockpile must increase by refund");
  // Tile is back to GRASS AFTER the refund landed.
  assert.equal(state.grid.tiles[target.ix + target.iz * state.grid.width], TILE.GRASS);
});

test("M1c-B: demolishing a WAREHOUSE refunds proportionally to its build cost", () => {
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();
  state.resources.wood = 999;
  state.resources.stone = 999;

  const target = findFirstValid(state, buildSystem, "warehouse");
  assert.ok(target, "expected at least one valid warehouse placement");

  buildSystem.placeToolAt(state, "warehouse", target.ix, target.iz);

  const woodBefore = state.resources.wood;
  const stoneBefore = state.resources.stone;

  const erased = buildSystem.placeToolAt(state, "erase", target.ix, target.iz);
  assert.equal(erased.ok, true);

  const expectedWood = Math.floor((BUILD_COST.warehouse.wood ?? 0) * BALANCE.demoWoodRecovery);
  const expectedStone = Math.floor((BUILD_COST.warehouse.stone ?? 0) * BALANCE.demoStoneRecovery);

  assert.equal(erased.refund.wood, expectedWood, "warehouse wood refund mismatch");
  assert.equal(erased.refund.stone, expectedStone, "warehouse stone refund mismatch");
  assert.equal(state.resources.wood, woodBefore + expectedWood);
  assert.equal(state.resources.stone, stoneBefore + expectedStone);
  // Sanity: warehouse has wood:10 so floor(10 × 0.25) = 2 with default balance.
  assert.ok(expectedWood >= 1, "warehouse wood refund should be non-zero under default tuning");
});

test("M1c-C: food and herbs refund is always zero under default M1c tuning", () => {
  // Defaults: demoFoodRecovery = 0, demoHerbsRecovery = 0. The sentinel values
  // live in BALANCE; we assert the actual behavior rather than the constant so
  // a future tuning that adds a non-zero food/herbs recovery will fail here
  // and force an explicit test update.
  assert.equal(BALANCE.demoFoodRecovery, 0, "demoFoodRecovery should be 0 by default");
  assert.equal(BALANCE.demoHerbsRecovery, 0, "demoHerbsRecovery should be 0 by default");

  const state = createInitialGameState();
  const buildSystem = new BuildSystem();
  state.resources.wood = 999;
  state.resources.stone = 999;
  state.resources.herbs = 999;

  // Clinic has herbs:4 in its build cost — the perfect witness for herbs=0.
  const target = findFirstValid(state, buildSystem, "clinic");
  assert.ok(target, "expected at least one valid clinic placement");

  buildSystem.placeToolAt(state, "clinic", target.ix, target.iz);

  const foodBefore = state.resources.food;
  const herbsBefore = state.resources.herbs;

  const erased = buildSystem.placeToolAt(state, "erase", target.ix, target.iz);
  assert.equal(erased.ok, true);
  assert.equal(erased.refund.food, 0, "food refund must be zero (biodegradable)");
  assert.equal(erased.refund.herbs, 0, "herbs refund must be zero (biodegradable)");
  assert.equal(state.resources.food, foodBefore, "food stockpile unchanged on demo");
  assert.equal(state.resources.herbs, herbsBefore, "herbs stockpile unchanged on demo");
});

test("M1c-D: DEMOLITION_RECYCLED event emits with { ix, iz, refund: { wood, stone } } payload", () => {
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();
  state.resources.wood = 999;
  state.resources.stone = 999;

  const target = findFirstValid(state, buildSystem, "warehouse");
  assert.ok(target);
  buildSystem.placeToolAt(state, "warehouse", target.ix, target.iz);

  resetEvents(state);
  buildSystem.placeToolAt(state, "erase", target.ix, target.iz);

  const log = getEventLog(state);
  const recycled = log.find((e) => e.type === EVENT_TYPES.DEMOLITION_RECYCLED);
  assert.ok(recycled, "expected a DEMOLITION_RECYCLED event in the log");
  assert.equal(recycled.detail.ix, target.ix, "event ix must match demolished tile");
  assert.equal(recycled.detail.iz, target.iz, "event iz must match demolished tile");
  assert.ok(recycled.detail.refund, "event must carry a refund object");
  assert.equal(
    recycled.detail.refund.wood,
    Math.floor((BUILD_COST.warehouse.wood ?? 0) * BALANCE.demoWoodRecovery),
    "event refund.wood must equal computed M1c wood recovery",
  );
  assert.equal(
    recycled.detail.refund.stone,
    Math.floor((BUILD_COST.warehouse.stone ?? 0) * BALANCE.demoStoneRecovery),
    "event refund.stone must equal computed M1c stone recovery",
  );
});
