// v0.8.9 Terrain rewrite — diversity guarantees.
//
// Verifies that the major-terrain rewrite delivers on three contracts:
//   1. NO BRIDGE tiles in pre-generated output (player can still build them).
//   2. Same template + different seeds produce visibly different tile arrays
//      (>=5% pairwise difference between any two seeds).
//   3. The grids are still "interesting" (water in bounds, farms+lumber present).
//
// These complement test/map-generation.test.js which validates each grid's
// internal consistency on a single seed.

import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGrid, MAP_TEMPLATES, BIOME, BIOME_NAMES } from "../src/world/grid/Grid.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { TILE } from "../src/config/constants.js";

const DIVERSITY_SEEDS = [1, 7, 42, 1337, 2025];

function diffPct(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) diff += 1;
  }
  return diff / a.length;
}

test("temperate_plains: 5 seeds yield pairwise-distinct grids (>=5% tile diff)", () => {
  const grids = DIVERSITY_SEEDS.map((seed) => createInitialGrid({ templateId: "temperate_plains", seed }));
  // Sanity: deterministic given same seed.
  const dup = createInitialGrid({ templateId: "temperate_plains", seed: 1 });
  assert.equal(diffPct(grids[0].tiles, dup.tiles), 0, "same seed must produce identical tiles");

  for (let i = 0; i < grids.length; i += 1) {
    for (let j = i + 1; j < grids.length; j += 1) {
      const d = diffPct(grids[i].tiles, grids[j].tiles);
      assert.ok(
        d >= 0.05,
        `seeds ${DIVERSITY_SEEDS[i]} vs ${DIVERSITY_SEEDS[j]} differ by only ${(d * 100).toFixed(2)}% — expected >=5%`,
      );
    }
  }
});

test("temperate_plains: no BRIDGE tile is ever pre-generated", () => {
  for (const seed of DIVERSITY_SEEDS) {
    const grid = createInitialGrid({ templateId: "temperate_plains", seed });
    const idx = grid.tiles.indexOf(TILE.BRIDGE);
    assert.equal(idx, -1, `seed ${seed}: BRIDGE present at index ${idx} — generator must not emit BRIDGE`);
  }
});

test("ALL templates: no BRIDGE tile is ever pre-generated across diversity seeds", () => {
  for (const tpl of MAP_TEMPLATES) {
    for (const seed of DIVERSITY_SEEDS) {
      const grid = createInitialGrid({ templateId: tpl.id, seed });
      const idx = grid.tiles.indexOf(TILE.BRIDGE);
      assert.equal(idx, -1, `${tpl.id} seed ${seed}: BRIDGE present at index ${idx}`);
    }
  }
});

test("temperate_plains: every seed is 'interesting' (water bounds, farm+lumber present)", () => {
  for (const seed of DIVERSITY_SEEDS) {
    const grid = createInitialGrid({ templateId: "temperate_plains", seed });
    let water = 0, farm = 0, lumber = 0;
    for (let i = 0; i < grid.tiles.length; i += 1) {
      if (grid.tiles[i] === TILE.WATER) water += 1;
      else if (grid.tiles[i] === TILE.FARM) farm += 1;
      else if (grid.tiles[i] === TILE.LUMBER) lumber += 1;
    }
    const area = grid.tiles.length;
    const waterPct = water / area;
    assert.ok(waterPct > 0.01, `seed ${seed}: water ${(waterPct * 100).toFixed(2)}% too low`);
    assert.ok(waterPct < 0.40, `seed ${seed}: water ${(waterPct * 100).toFixed(2)}% too high for plains`);
    assert.ok(farm >= 2, `seed ${seed}: only ${farm} farm tiles`);
    assert.ok(lumber >= 2, `seed ${seed}: only ${lumber} lumber tiles`);
  }
});

test("rugged_highlands and fertile_riverlands also exhibit seed diversity", () => {
  for (const templateId of ["rugged_highlands", "fertile_riverlands"]) {
    const grids = DIVERSITY_SEEDS.map((seed) => createInitialGrid({ templateId, seed }));
    let minDiff = 1;
    for (let i = 0; i < grids.length; i += 1) {
      for (let j = i + 1; j < grids.length; j += 1) {
        const d = diffPct(grids[i].tiles, grids[j].tiles);
        if (d < minDiff) minDiff = d;
      }
    }
    assert.ok(
      minDiff >= 0.05,
      `${templateId}: minimum pairwise diff ${(minDiff * 100).toFixed(2)}% — expected >=5%`,
    );
  }
});

// v0.8.9 Phase B — biome diversity. Different seeds should yield visibly
// different biome distributions, not just shuffled tile arrays. We measure
// per-biome tile percentage across 5 seeds and require at least 2 biomes
// to vary by more than 5 percentage points (max-min) seed to seed.
test("temperate_plains: different seeds get different biome distributions", () => {
  const grids = DIVERSITY_SEEDS.map((seed) => createInitialGrid({ templateId: "temperate_plains", seed }));
  const biomeCount = BIOME_NAMES.length;
  const perSeedPct = grids.map((g) => {
    assert.ok(g.biomes instanceof Uint8Array, "grid.biomes must be a Uint8Array");
    assert.equal(g.biomes.length, g.tiles.length, "biomes must match tile count");
    const counts = new Array(biomeCount).fill(0);
    for (let i = 0; i < g.biomes.length; i += 1) counts[g.biomes[i]] += 1;
    return counts.map((c) => c / g.biomes.length);
  });
  let biomesWithSpread = 0;
  for (let b = 0; b < biomeCount; b += 1) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const pct of perSeedPct) {
      if (pct[b] < lo) lo = pct[b];
      if (pct[b] > hi) hi = pct[b];
    }
    if (hi - lo > 0.05) biomesWithSpread += 1;
  }
  assert.ok(
    biomesWithSpread >= 2,
    `expected >=2 biomes with >5% spread across seeds, got ${biomesWithSpread}`,
  );
});

// v0.8.9 Phase B — quirks fire deterministically. The quirk RNG is keyed off
// the seed; running the same template+seed twice must produce byte-identical
// tile arrays (including any quirk-affected tiles).
test("quirks fire deterministically: same seed -> same quirk-affected tiles", () => {
  for (const tpl of ["temperate_plains", "rugged_highlands", "fertile_riverlands"]) {
    for (const seed of [1, 1337, 99]) {
      const a = createInitialGrid({ templateId: tpl, seed });
      const b = createInitialGrid({ templateId: tpl, seed });
      assert.equal(diffPct(a.tiles, b.tiles), 0, `${tpl} seed ${seed}: non-deterministic generation`);
      // Biome map should also be deterministic.
      let biomeDiff = 0;
      for (let i = 0; i < a.biomes.length; i += 1) {
        if (a.biomes[i] !== b.biomes[i]) biomeDiff += 1;
      }
      assert.equal(biomeDiff, 0, `${tpl} seed ${seed}: biomes diverged`);
    }
  }
});

// v0.8.10 — bare-initial-map. createInitialGameState must produce a grid with
// zero player-buildable tiles (warehouse / farm / lumber / quarry / herb /
// kitchen / smithy / clinic / wall / gate / road / bridge). Terrain features
// (water, ruins, grass) and resource hints (FOREST/STONE/HERB nodeFlags +
// yieldPool on tileState) must remain intact so the player builds from zero
// without losing the world's identity.
test("bare-initial-map: createInitialGameState produces zero buildings across templates", () => {
  const buildingTiles = [
    TILE.WAREHOUSE, TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN,
    TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC, TILE.WALL, TILE.GATE,
    TILE.ROAD, TILE.BRIDGE,
  ];
  for (const tpl of MAP_TEMPLATES) {
    for (const seed of [1, 1337, 42]) {
      const state = createInitialGameState({ templateId: tpl.id, seed, bareInitial: true });
      const counts = {};
      for (let i = 0; i < state.grid.tiles.length; i += 1) {
        const t = state.grid.tiles[i];
        if (buildingTiles.includes(t)) {
          counts[t] = (counts[t] ?? 0) + 1;
        }
      }
      const total = Object.values(counts).reduce((s, n) => s + n, 0);
      assert.equal(
        total, 0,
        `${tpl.id} seed=${seed}: expected 0 buildings, got ${JSON.stringify(counts)}`,
      );
      // state.buildings reflects the same zero counts.
      assert.equal(state.buildings.farms, 0);
      assert.equal(state.buildings.warehouses, 0);
      assert.equal(state.buildings.lumbers, 0);
      assert.equal(state.buildings.roads, 0);
    }
  }
});

test("bare-initial-map: resource hints (FOREST/STONE/HERB nodeFlags) survive the strip", () => {
  // Resource hints persist on tileState so the player can still see where
  // forests / stone deposits / herb beds are when they decide where to build
  // LUMBER / QUARRY / HERB_GARDEN. nodeFlags bitmask: FOREST=1, STONE=2, HERB=4.
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 1337, bareInitial: true });
  let forestNodes = 0;
  let stoneNodes = 0;
  let herbNodes = 0;
  for (const entry of state.grid.tileState.values()) {
    const flags = Number(entry?.nodeFlags ?? 0);
    if (flags & 1) forestNodes += 1;
    if (flags & 2) stoneNodes += 1;
    if (flags & 4) herbNodes += 1;
  }
  assert.ok(forestNodes >= 5, `expected at least 5 FOREST hints, got ${forestNodes}`);
  assert.ok(stoneNodes >= 3, `expected at least 3 STONE hints, got ${stoneNodes}`);
  assert.ok(herbNodes >= 1, `expected at least 1 HERB hint, got ${herbNodes}`);
});

// Sanity: BIOME constants are exported and consistent.
test("BIOME enum: ids 0..6 correspond to BIOME_NAMES", () => {
  assert.equal(BIOME.OPEN_PLAINS, 0);
  assert.equal(BIOME.LUSH_VALLEY, 1);
  assert.equal(BIOME.WOODLAND, 2);
  assert.equal(BIOME.ROCKY_HILL, 3);
  assert.equal(BIOME.MOUNTAIN, 4);
  assert.equal(BIOME.WETLAND, 5);
  assert.equal(BIOME.SCRUB, 6);
  assert.equal(BIOME_NAMES.length, 7);
});
