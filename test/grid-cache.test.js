import test from "node:test";
import assert from "node:assert/strict";
import {
  createInitialGrid,
  listTilesByType,
  findNearestTileOfTypes,
  setTile,
  getTile,
} from "../src/world/grid/Grid.js";
import { TILE } from "../src/config/constants.js";

test("listTilesByType cache invalidates on grid version change", () => {
  const grid = createInitialGrid({ seed: 42 });
  const before = listTilesByType(grid, [TILE.WAREHOUSE]);
  const target = before[0];
  assert.ok(target, "warehouse should exist in initial map");

  const changed = setTile(grid, target.ix, target.iz, TILE.GRASS);
  assert.equal(changed, true);
  assert.equal(getTile(grid, target.ix, target.iz), TILE.GRASS);

  const after = listTilesByType(grid, [TILE.WAREHOUSE]);
  assert.equal(after.some((t) => t.ix === target.ix && t.iz === target.iz), false);
});

test("findNearestTileOfTypes returns a matching tile", () => {
  const grid = createInitialGrid({ seed: 1337 });
  const nearest = findNearestTileOfTypes(grid, { x: 0, z: 0 }, [TILE.WAREHOUSE]);
  assert.ok(nearest, "nearest tile should exist");
  const tile = getTile(grid, nearest.ix, nearest.iz);
  assert.equal(tile, TILE.WAREHOUSE);
});
