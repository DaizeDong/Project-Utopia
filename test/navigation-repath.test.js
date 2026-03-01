import test from "node:test";
import assert from "node:assert/strict";

import { TILE } from "../src/config/constants.js";
import { setTargetAndPath } from "../src/simulation/navigation/Navigation.js";
import { PathCache } from "../src/simulation/navigation/PathCache.js";

function createGrid(width, height, fill = TILE.GRASS) {
  const tiles = new Uint8Array(width * height);
  tiles.fill(fill);
  return { width, height, tileSize: 1, tiles, version: 1 };
}

test("setTargetAndPath recomputes when grid version changes", () => {
  const grid = createGrid(5, 5, TILE.GRASS);
  const state = { grid, weather: { moveCostMultiplier: 1 } };
  const services = { pathCache: new PathCache(8) };

  const worker = {
    x: -2,
    z: 0,
    targetTile: null,
    path: null,
    pathIndex: 0,
    pathGridVersion: -1,
  };
  const target = { ix: 4, iz: 2 };

  const ok = setTargetAndPath(worker, target, state, services);
  assert.equal(ok, true);
  assert.equal(worker.pathGridVersion, 1);

  const firstLen = worker.path.length;
  assert.ok(firstLen > 0);

  grid.tiles[2 + 2 * grid.width] = TILE.WALL;
  grid.version = 2;
  worker.pathIndex = 0;

  const changed = setTargetAndPath(worker, target, state, services);
  assert.equal(changed, true);
  assert.equal(worker.pathGridVersion, 2);
  assert.ok(worker.path.length >= firstLen);
  assert.equal(worker.path.some((n) => n.ix === 2 && n.iz === 2), false);
});
