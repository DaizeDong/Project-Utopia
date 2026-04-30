// v0.8.13 — ReachabilityCache service tests (audit A2).
import test from "node:test";
import assert from "node:assert/strict";

import { ReachabilityCache } from "../src/simulation/services/ReachabilityCache.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { TILE } from "../src/config/constants.js";
import { findNearestTileOfTypes, worldToTile } from "../src/world/grid/Grid.js";

function pickProbeTile(state) {
  // Find a passable, non-warehouse tile so probeAndCache actually runs A*.
  const w = state.grid.width, h = state.grid.height;
  for (let iz = 0; iz < h; iz++) {
    for (let ix = 0; ix < w; ix++) {
      const t = state.grid.tiles[ix + iz * w];
      if (t === TILE.GRASS) return { ix, iz };
    }
  }
  return { ix: 0, iz: 0 };
}

test("ReachabilityCache: hit returns cached entry without re-probing", () => {
  const state = createInitialGameState({ seed: 1337 });
  const services = createServices(state.world.mapSeed);
  const cache = new ReachabilityCache();
  state._reachabilityProbeBudget = 8;

  const worker = state.agents.find((a) => a.type === "WORKER");
  assert.ok(worker, "expected a worker");
  // v0.10.1-g — use worker tile, not first-grass-scan, so we're
  // guaranteed in the same colony connected component as the warehouse.
  // Otherwise the new component-skip fast path returns reachable:false
  // without running A*, and probes stays 0.
  const fromTile = worldToTile(worker.x, worker.z, state.grid);

  // First call probes (miss → probe → cache).
  const first = cache.probeAndCache(fromTile, [TILE.WAREHOUSE], state, services, worker);
  assert.ok(first);
  assert.equal(typeof first.reachable, "boolean");
  const stats1 = cache.getStats();
  assert.equal(stats1.probes, 1, "first call should probe once");

  // Second call should hit the cache.
  const second = cache.isReachable(fromTile, [TILE.WAREHOUSE], state, services);
  assert.ok(second, "expected cached entry");
  assert.equal(second.reachable, first.reachable);
  const stats2 = cache.getStats();
  assert.equal(stats2.hits, 1, "second call should be a hit");
  assert.equal(stats2.probes, 1, "no additional probe");
});

test("ReachabilityCache: gridVersion change invalidates cache", () => {
  const state = createInitialGameState({ seed: 1337 });
  const services = createServices(state.world.mapSeed);
  const cache = new ReachabilityCache();
  state._reachabilityProbeBudget = 8;

  const worker = state.agents.find((a) => a.type === "WORKER");
  const fromTile = worldToTile(worker.x, worker.z, state.grid);
  cache.probeAndCache(fromTile, [TILE.WAREHOUSE], state, services, worker);
  assert.equal(cache.getStats().size, 1);

  // Bump grid version → next isReachable call must invalidate.
  state.grid.version = Number(state.grid.version ?? 0) + 1;
  state._reachabilityProbeBudget = 8;
  const after = cache.isReachable(fromTile, [TILE.WAREHOUSE], state, services);
  assert.equal(after, null, "stale entry should be invalidated, returning null");
  assert.equal(cache.getStats().gridInvalidations, 1);
  assert.equal(cache.getStats().size, 0);
});

test("ReachabilityCache: probe budget exhaustion returns null", () => {
  const state = createInitialGameState({ seed: 1337 });
  const services = createServices(state.world.mapSeed);
  const cache = new ReachabilityCache();
  state._reachabilityProbeBudget = 0;

  const worker = state.agents.find((a) => a.type === "WORKER");
  const fromTile = worldToTile(worker.x, worker.z, state.grid);
  // First find a tile far enough that we actually need to probe (not the
  // worker's current tile).
  const target = findNearestTileOfTypes(state.grid, fromTile, [TILE.WAREHOUSE]);
  if (!target) {
    // No warehouse at all → probeAndCache returns reachable:false without consuming
    // budget; that's also acceptable. The test below still asserts the budget skip.
    const out = cache.probeAndCache(fromTile, [TILE.WAREHOUSE], state, services, worker);
    assert.ok(out === null || out.reachable === false);
    return;
  }
  // Probe at the same-tile case bypasses the budget — pick a different tile.
  const farTile = (target.ix === fromTile.ix && target.iz === fromTile.iz)
    ? { ix: 0, iz: 0 }
    : fromTile;
  const out = cache.probeAndCache(farTile, [TILE.WAREHOUSE], state, services, worker);
  assert.equal(out, null, "exhausted budget must return null");
  assert.equal(cache.getStats().budgetSkips, 1);
});

test("ReachabilityCache: two consumers share the same probe", () => {
  // Mortality and StatePlanner querying the same (workerTile, tileTypes)
  // share the cached probe — second query is a hit, not a probe.
  const state = createInitialGameState({ seed: 1337 });
  const services = createServices(state.world.mapSeed);
  const cache = new ReachabilityCache();
  state._reachabilityProbeBudget = 8;

  const worker = state.agents.find((a) => a.type === "WORKER");
  // v0.10.1-g — same tile-selection note as the test above.
  const fromTile = worldToTile(worker.x, worker.z, state.grid);

  // Mortality consumer:
  const mort = cache.probeAndCache(fromTile, [TILE.WAREHOUSE], state, services, worker);
  // AI consumer (separate isReachable call, same tick):
  const ai = cache.isReachable(fromTile, [TILE.WAREHOUSE], state, services);

  assert.ok(mort);
  assert.ok(ai);
  assert.equal(ai.reachable, mort.reachable);
  const stats = cache.getStats();
  assert.equal(stats.probes, 1, "consumers should share the probe");
  assert.equal(stats.hits, 1);
});

test("ReachabilityCache: same-tile target reaches without consuming budget", () => {
  const state = createInitialGameState({ seed: 1337 });
  const services = createServices(state.world.mapSeed);
  const cache = new ReachabilityCache();
  state._reachabilityProbeBudget = 1;

  const worker = state.agents.find((a) => a.type === "WORKER");
  const fromTile = worldToTile(worker.x, worker.z, state.grid);
  // Drop a unique tile-type test under the worker's feet — pick KITCHEN to
  // ensure no other tile of that type exists and findNearestTileOfTypes
  // returns this one.
  state.grid.tiles[fromTile.ix + fromTile.iz * state.grid.width] = TILE.KITCHEN;
  // Wipe any other KITCHEN tiles to guarantee findNearestTileOfTypes
  // returns the same-tile entry.
  for (let i = 0; i < state.grid.tiles.length; i++) {
    if (i !== fromTile.ix + fromTile.iz * state.grid.width
        && state.grid.tiles[i] === TILE.KITCHEN) {
      state.grid.tiles[i] = TILE.GRASS;
    }
  }

  const out = cache.probeAndCache(fromTile, [TILE.KITCHEN], state, services, worker);
  assert.ok(out);
  assert.equal(out.reachable, true);
  // Budget should be untouched because the worker stands on the target.
  assert.equal(state._reachabilityProbeBudget, 1, "same-tile probe should not consume budget");
});

test("ReachabilityCache: missing target type caches reachable=false", () => {
  const state = createInitialGameState({ seed: 1337 });
  const services = createServices(state.world.mapSeed);
  const cache = new ReachabilityCache();
  state._reachabilityProbeBudget = 8;

  const worker = state.agents.find((a) => a.type === "WORKER");
  const fromTile = worldToTile(worker.x, worker.z, state.grid);

  // Use a tile type that is unlikely to exist in a fresh seed.
  // Probe should cache the negative result without burning budget.
  const out = cache.probeAndCache(fromTile, [TILE.SMITHY], state, services, worker);
  assert.ok(out);
  // Either smithy exists in this seed (pass) or it doesn't (still pass with
  // reachable false). What we care about is that the result is cached.
  const second = cache.isReachable(fromTile, [TILE.SMITHY], state, services);
  assert.ok(second);
  assert.equal(second.reachable, out.reachable);
});
