import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { TILE } from "../src/config/constants.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";

function setTile(state, ix, iz, tileType) {
  state.grid.tiles[ix + iz * state.grid.width] = tileType;
}

function rebuildFrontierLogistics(state, options = {}) {
  const scenario = state.gameplay.scenario;
  const anchors = scenario.anchors;
  const extraWarehouses = Number(options.extraWarehouses ?? 0);

  for (let ix = anchors.westLumberOutpost.ix + 2; ix <= anchors.coreWarehouse.ix - 4; ix += 1) {
    setTile(state, ix, anchors.westLumberOutpost.iz, TILE.ROAD);
  }
  for (let iz = anchors.westLumberOutpost.iz; iz <= anchors.coreWarehouse.iz - 1; iz += 1) {
    setTile(state, anchors.coreWarehouse.ix - 4, iz, TILE.ROAD);
  }
  for (const gap of scenario.routeLinks[0].gapTiles) {
    setTile(state, gap.ix, gap.iz, TILE.ROAD);
  }
  setTile(state, anchors.eastDepot.ix, anchors.eastDepot.iz, TILE.WAREHOUSE);
  setTile(state, anchors.coreWarehouse.ix + 1, anchors.coreWarehouse.iz + 1, TILE.FARM);
  setTile(state, anchors.coreWarehouse.ix + 2, anchors.coreWarehouse.iz + 1, TILE.FARM);
  setTile(state, anchors.coreWarehouse.ix - 1, anchors.coreWarehouse.iz + 2, TILE.LUMBER);
  setTile(state, anchors.coreWarehouse.ix - 2, anchors.coreWarehouse.iz + 2, TILE.LUMBER);
  for (let i = 0; i < 20; i += 1) {
    state.grid.tiles[i] = TILE.ROAD;
  }
  for (let i = 0; i < extraWarehouses; i += 1) {
    setTile(state, anchors.coreWarehouse.ix + 3 + i, anchors.coreWarehouse.iz - 1, TILE.WAREHOUSE);
  }
}

function fortifyFrontierForStability(state) {
  const baseIx = state.grid.width - 8;
  const baseIz = state.grid.height - 6;
  for (let dz = 0; dz < 3; dz += 1) {
    for (let dx = 0; dx < 4; dx += 1) {
      setTile(state, baseIx + dx, baseIz + dz, TILE.WALL);
    }
  }
}

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

  rebuildFrontierLogistics(state);
  system.update(0.2, state);

  const logistics = state.gameplay.objectives.find((o) => o.id === "logistics-1");
  assert.ok(logistics?.completed, "logistics objective should complete");
  assert.equal(state.gameplay.objectiveIndex, 1);
  assert.ok(state.resources.food >= 60, "food reward should be applied");
  assert.ok(state.resources.wood >= 50, "wood reward should be applied");
  assert.equal(state.gameplay.recovery?.charges, 2, "logistics reward should refill one recovery charge");
});

test("ProgressionSystem keeps stockpile objective blocked until prosperity and network are both stable", () => {
  const state = createInitialGameState();
  const system = new ProgressionSystem();

  rebuildFrontierLogistics(state);
  system.update(0.2, state);

  state.resources.food = 160;
  state.resources.wood = 160;
  state.gameplay.prosperity = 20;
  system.update(0.2, state);
  assert.equal(state.gameplay.objectiveIndex, 1, "stockpile should not complete under low prosperity");
  assert.match(state.gameplay.objectiveHint, /prosperity/i);

  const { eastDepot } = state.gameplay.scenario.anchors;
  setTile(state, eastDepot.ix, eastDepot.iz, TILE.GRASS);
  state.gameplay.prosperity = 60;
  system.update(0.2, state);
  assert.equal(state.gameplay.objectiveIndex, 1, "stockpile should not complete while a frontier route is broken");
  assert.match(state.gameplay.objectiveHint, /blocked|reclaimed|depot/i);

  setTile(state, eastDepot.ix, eastDepot.iz, TILE.WAREHOUSE);
  system.update(0.2, state);
  assert.equal(state.gameplay.objectiveIndex, 2, "stockpile should complete once network and prosperity are both recovered");
});

test("ProgressionSystem only triggers emergency recovery after meaningful frontier support exists", () => {
  const state = createInitialGameState();
  const system = new ProgressionSystem();
  const { eastDepot } = state.gameplay.scenario.anchors;

  state.resources.food = 1;
  state.resources.wood = 2;
  state.gameplay.prosperity = 18;
  state.gameplay.threat = 78;
  state.metrics.timeSec = 30;

  system.update(0.2, state);
  assert.equal(state.gameplay.recovery.activeBoostSec, 0, "recovery should stay locked before the map is repaired");
  assert.equal(state.gameplay.recovery.charges, 1);

  setTile(state, eastDepot.ix, eastDepot.iz, TILE.WAREHOUSE);
  state.metrics.timeSec = 90;
  system.update(0.2, state);

  assert.ok(state.gameplay.recovery.activeBoostSec > 0, "recovery should trigger after a depot is reclaimed");
  assert.equal(state.gameplay.recovery.charges, 0, "recovery charge should be consumed");
  assert.ok(state.resources.food > 1);
  assert.ok(state.resources.wood > 2);
  assert.match(state.controls.actionMessage, /Emergency relief/i);
});

test("ProgressionSystem persists doctrine mastery after final stability objective", () => {
  const state = createInitialGameState();
  const system = new ProgressionSystem();

  state.controls.doctrine = "trade";
  system.update(0.2, state);
  const baseTradeYield = state.gameplay.modifiers.tradeYield;
  const baseThreatDamp = state.gameplay.modifiers.threatDamp;

  rebuildFrontierLogistics(state, { extraWarehouses: 1 });
  system.update(0.2, state);
  state.resources.food = 180;
  state.resources.wood = 180;
  state.gameplay.prosperity = 70;
  system.update(0.2, state);

  fortifyFrontierForStability(state);
  state.gameplay.prosperity = 70;
  state.gameplay.threat = 24;
  state.gameplay.objectiveHoldSec = 999;
  system.update(0.2, state);
  assert.equal(state.gameplay.objectiveIndex, 3, "final stability objective should complete");
  assert.equal(state.gameplay.doctrineMastery, 1.08, "final reward should persist as doctrine mastery");

  system.update(0.2, state);
  assert.ok(state.gameplay.modifiers.tradeYield > baseTradeYield, "mastery should strengthen doctrine yields after completion");
  assert.ok(state.gameplay.modifiers.threatDamp < baseThreatDamp, "mastery should improve doctrine threat damping");
});
