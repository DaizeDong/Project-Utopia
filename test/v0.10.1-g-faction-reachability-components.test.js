// v0.10.1-g (P3) — faction-aware reachability component pre-filter.
//
// Validates: (1) component labelling correctly partitions an island map
// where a wall row separates two halves; (2) ReachabilityCache short-
// circuits cross-component probes without burning the probe budget;
// (3) same-component probes still run A* and cache the result.

import { test } from "node:test";
import assert from "node:assert";

import { TILE } from "../src/config/constants.js";
import {
  ReachabilityCache,
  _testBuildColonyComponents,
  _testComponentAt,
} from "../src/simulation/services/ReachabilityCache.js";

function makeIslandGrid() {
  // 8×4 grid:
  //   row 0: GRASS×8
  //   row 1: WALL×8 (full barrier)
  //   row 2: GRASS×8 (with a single LUMBER at (3,2) on the south side)
  //   row 3: GRASS×8
  const w = 8;
  const h = 4;
  const tiles = new Uint8Array(w * h);
  for (let i = 0; i < tiles.length; i += 1) tiles[i] = TILE.GRASS;
  for (let x = 0; x < w; x += 1) tiles[x + 1 * w] = TILE.WALL;
  tiles[3 + 2 * w] = TILE.LUMBER;
  return { width: w, height: h, tiles, version: 1 };
}

test("v0.10.1-g — colony components separate islands across an impassable wall row", () => {
  const grid = makeIslandGrid();
  const comps = _testBuildColonyComponents(grid);
  assert.equal(comps.count, 2, "expected exactly 2 colony components on the test grid");

  const northRow0 = _testComponentAt(comps, 3, 0);
  const southRow2 = _testComponentAt(comps, 3, 2);
  const southRow3 = _testComponentAt(comps, 3, 3);
  const wallRow1 = _testComponentAt(comps, 3, 1);

  assert.equal(northRow0, southRow0orThrow(comps, 0), "north row tiles share a component");
  assert.notEqual(northRow0, southRow2, "north and south components must differ");
  assert.equal(southRow2, southRow3, "south rows share a component");
  assert.equal(wallRow1, -1, "wall tile labelled -1");
});

function southRow0orThrow(comps, ix) {
  const c = _testComponentAt(comps, ix, 0);
  if (c < 0) throw new Error(`tile (${ix},0) should be passable`);
  return c;
}

test("v0.10.1-g — ReachabilityCache short-circuits cross-component LUMBER probe", () => {
  const grid = makeIslandGrid();
  const state = {
    grid,
    metrics: { tick: 0, timeSec: 0 },
    _reachabilityProbeBudget: 8,
  };
  const cache = new ReachabilityCache();

  // Worker on north island (row 0), querying nearest LUMBER (only at (3,2)
  // on south island). Should short-circuit via component mismatch — no
  // probe burn.
  const result = cache.probeAndCache(
    { ix: 3, iz: 0 },
    [TILE.LUMBER],
    state,
    {},
    null, // null entity → faction defaults to "colony"
  );

  assert.deepEqual(
    result,
    { reachable: false, sourceTile: null },
    "cross-component query must report unreachable",
  );

  const stats = cache.getStats();
  assert.equal(stats.componentSkips, 1, "expected 1 component skip");
  assert.equal(stats.probes, 0, "expected 0 actual A* probes (short-circuit)");
  assert.equal(state._reachabilityProbeBudget, 8, "probe budget untouched");
});

test("v0.10.1-g — same-component LUMBER probe still runs A* and caches reachable=true", () => {
  const grid = makeIslandGrid();
  const state = {
    grid,
    metrics: { tick: 0, timeSec: 0 },
    _reachabilityProbeBudget: 8,
    weather: {},
  };
  const cache = new ReachabilityCache();

  // Worker on south island, querying nearest LUMBER (which is on south).
  const result = cache.probeAndCache(
    { ix: 0, iz: 2 },
    [TILE.LUMBER],
    state,
    {},
    null,
  );

  assert.equal(result.reachable, true, "same-component LUMBER must be reachable");
  const stats = cache.getStats();
  assert.equal(stats.componentSkips, 0);
  assert.equal(stats.probes, 1, "expected exactly 1 A* probe");
  assert.equal(state._reachabilityProbeBudget, 7, "probe budget decremented");
});
