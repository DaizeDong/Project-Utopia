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
import { createInitialGrid, MAP_TEMPLATES } from "../src/world/grid/Grid.js";
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
