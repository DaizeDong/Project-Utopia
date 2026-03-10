import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { TILE } from "../src/config/constants.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";

test("ProgressionSystem applies doctrine modifiers", () => {
  const state = createInitialGameState();
  const system = new ProgressionSystem();

  state.controls.doctrine = "agrarian";
  system.update(0.5, state);

  assert.equal(state.gameplay.doctrine, "agrarian");
  assert.ok(state.gameplay.modifiers.farmYield > 1);
  assert.ok(state.gameplay.modifiers.lumberYield < 1);
});

test("ProgressionSystem completes logistics objective and grants reward", () => {
  const state = createInitialGameState();
  const system = new ProgressionSystem();
  const scenario = state.gameplay.scenario;
  const anchors = scenario.anchors;

  for (let ix = anchors.westLumberOutpost.ix + 2; ix <= anchors.coreWarehouse.ix - 4; ix += 1) {
    state.grid.tiles[ix + anchors.westLumberOutpost.iz * state.grid.width] = TILE.ROAD;
  }
  for (let iz = anchors.westLumberOutpost.iz; iz <= anchors.coreWarehouse.iz - 1; iz += 1) {
    state.grid.tiles[(anchors.coreWarehouse.ix - 4) + iz * state.grid.width] = TILE.ROAD;
  }
  for (const gap of scenario.routeLinks[0].gapTiles) {
    state.grid.tiles[gap.ix + gap.iz * state.grid.width] = TILE.ROAD;
  }
  state.grid.tiles[anchors.eastDepot.ix + anchors.eastDepot.iz * state.grid.width] = TILE.WAREHOUSE;
  state.grid.tiles[(anchors.coreWarehouse.ix + 1) + (anchors.coreWarehouse.iz + 1) * state.grid.width] = TILE.FARM;
  state.grid.tiles[(anchors.coreWarehouse.ix + 2) + (anchors.coreWarehouse.iz + 1) * state.grid.width] = TILE.FARM;
  state.grid.tiles[(anchors.coreWarehouse.ix - 1) + (anchors.coreWarehouse.iz + 2) * state.grid.width] = TILE.LUMBER;
  state.grid.tiles[(anchors.coreWarehouse.ix - 2) + (anchors.coreWarehouse.iz + 2) * state.grid.width] = TILE.LUMBER;
  for (let i = 0; i < 20; i += 1) {
    state.grid.tiles[i] = TILE.ROAD;
  }

  system.update(0.2, state);

  const logistics = state.gameplay.objectives.find((o) => o.id === "logistics-1");
  assert.ok(logistics?.completed, "logistics objective should complete");
  assert.equal(state.gameplay.objectiveIndex, 1);
  assert.ok(state.resources.food >= 60, "food reward should be applied");
  assert.ok(state.resources.wood >= 50, "wood reward should be applied");
});
