import test from "node:test";
import assert from "node:assert/strict";

import { aStar } from "../src/simulation/navigation/AStar.js";
import { TILE } from "../src/config/constants.js";

function createGrid(width, height, fill = TILE.GRASS) {
  const tiles = new Uint8Array(width * height);
  tiles.fill(fill);
  return { width, height, tileSize: 1, tiles, version: 1 };
}

test("A* reroutes when a wall blocks the direct path", () => {
  const grid = createGrid(5, 5, TILE.GRASS);

  const direct = aStar(grid, { ix: 0, iz: 2 }, { ix: 4, iz: 2 }, 1);
  assert.ok(direct);
  assert.equal(direct.length, 5);

  grid.tiles[2 + 2 * grid.width] = TILE.WALL;
  grid.version += 1;

  const rerouted = aStar(grid, { ix: 0, iz: 2 }, { ix: 4, iz: 2 }, 1);
  assert.ok(rerouted);
  assert.ok(rerouted.length > direct.length);

  const includesWall = rerouted.some((n) => n.ix === 2 && n.iz === 2);
  assert.equal(includesWall, false);
});

test("A* treats localized weather hazard tiles as high-cost frontier zones", () => {
  const grid = createGrid(5, 5, TILE.GRASS);
  for (let ix = 0; ix < 5; ix += 1) {
    grid.tiles[ix + 2 * grid.width] = TILE.ROAD;
  }

  const direct = aStar(grid, { ix: 0, iz: 2 }, { ix: 4, iz: 2 }, 1);
  assert.ok(direct);
  assert.equal(direct.some((node) => node.ix === 2 && node.iz === 2), true);

  const rerouted = aStar(
    grid,
    { ix: 0, iz: 2 },
    { ix: 4, iz: 2 },
    1,
    { tiles: new Set(["2,2"]), penaltyMultiplier: 8 },
  );
  assert.ok(rerouted);
  assert.equal(rerouted.some((node) => node.ix === 2 && node.iz === 2), false);
});

test("A* reroutes around congestion hotspot penalties", () => {
  const grid = createGrid(5, 5, TILE.GRASS);
  for (let ix = 0; ix < 5; ix += 1) {
    grid.tiles[ix + 2 * grid.width] = TILE.ROAD;
    grid.tiles[ix + 1 * grid.width] = TILE.ROAD;
  }

  const direct = aStar(grid, { ix: 0, iz: 2 }, { ix: 4, iz: 2 }, 1);
  assert.ok(direct);
  assert.equal(direct.some((node) => node.ix === 2 && node.iz === 2), true);

  const rerouted = aStar(
    grid,
    { ix: 0, iz: 2 },
    { ix: 4, iz: 2 },
    1,
    { traffic: { penaltyByKey: { "2,2": 8 } } },
  );
  assert.ok(rerouted);
  assert.equal(rerouted.some((node) => node.ix === 2 && node.iz === 2), false);
});
