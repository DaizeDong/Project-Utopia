import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { TILE } from "../src/config/constants.js";

function isNetworkTile(tileType) {
  return tileType === TILE.ROAD || tileType === TILE.WAREHOUSE || tileType === TILE.LUMBER;
}

function hasConnection(grid, start, goal) {
  const queue = [start];
  const visited = new Set([`${start.ix},${start.iz}`]);
  const neighbors = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.ix === goal.ix && current.iz === goal.iz) return true;
    for (const neighbor of neighbors) {
      const ix = current.ix + neighbor.x;
      const iz = current.iz + neighbor.z;
      if (ix < 0 || iz < 0 || ix >= grid.width || iz >= grid.height) continue;
      const key = `${ix},${iz}`;
      if (visited.has(key)) continue;
      const tile = grid.tiles[ix + iz * grid.width];
      if (!isNetworkTile(tile)) continue;
      visited.add(key);
      queue.push({ ix, iz });
    }
  }

  return false;
}

function hasWarehouseNear(grid, anchor, radius = 2) {
  for (let iz = anchor.iz - radius; iz <= anchor.iz + radius; iz += 1) {
    for (let ix = anchor.ix - radius; ix <= anchor.ix + radius; ix += 1) {
      if (ix < 0 || iz < 0 || ix >= grid.width || iz >= grid.height) continue;
      if (Math.abs(ix - anchor.ix) + Math.abs(iz - anchor.iz) > radius) continue;
      if (grid.tiles[ix + iz * grid.width] === TILE.WAREHOUSE) return true;
    }
  }
  return false;
}

test("alpha scenario starts with sparse infrastructure and a build-first objective", () => {
  const state = createInitialGameState({ seed: 1337 });
  const scenario = state.gameplay.scenario;
  const westRoute = scenario.routeLinks[0];

  // v0.8.0 Phase 4 — Survival Mode. Objectives are retired; the survival
  // score tracks progression instead. Scenario family / anchors / resources
  // still describe the starting configuration.
  assert.equal(Array.isArray(state.gameplay.objectives), true);
  assert.equal(state.gameplay.objectives.length, 0);
  assert.equal(scenario.family, "frontier_repair");
  assert.equal(state.buildings.warehouses, 1);
  assert.ok(state.buildings.farms >= 4, `expected >= 4 farms, got ${state.buildings.farms}`);
  assert.ok(state.buildings.lumbers >= 2, `expected >= 2 lumbers, got ${state.buildings.lumbers}`);
  assert.ok((state.debug.roadCount ?? 0) < 20);
  assert.ok(state.resources.food >= 60, `expected food >= 60, got ${state.resources.food}`);
  assert.ok(state.resources.wood >= 30, `expected wood >= 30, got ${state.resources.wood}`);
  assert.equal(
    hasConnection(state.grid, scenario.anchors.coreWarehouse, scenario.anchors.westLumberOutpost),
    false,
  );
  assert.equal(hasWarehouseNear(state.grid, scenario.anchors.eastDepot, 2), false);
  assert.ok(Array.isArray(westRoute.gapTiles));
  assert.ok(westRoute.gapTiles.length >= 2);
});
