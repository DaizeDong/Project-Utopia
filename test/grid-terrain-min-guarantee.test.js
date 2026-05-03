import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGrid } from "../src/world/grid/Grid.js";
import { TILE } from "../src/config/constants.js";

// v0.10.2 PL-terrain-min-guarantee R7: opening-stall P0.
// PL feedback (Round7/Feedbacks/PL-opening-stall.md) reported temperate_plains
// shipping with 0 FARM / 0 LUMBER / 0 QUARRY across three independent seeds,
// causing total starvation by sim t<=4:20. This suite locks in a hard floor of
// farms>=2, lumbers>=2, quarries>=1 for all 6 templates across multiple seeds
// so a future per-template painter regression cannot reintroduce the void-map.

const TEMPLATES = [
  "temperate_plains",
  "archipelago_isles",
  "coastal_ocean",
  "fertile_riverlands",
  "fortified_basin",
  "rugged_highlands",
];

const SEEDS = [42, 1337, 1213082125];

function countResources(grid) {
  let farms = 0, lumbers = 0, quarries = 0;
  for (const t of grid.tiles) {
    if (t === TILE.FARM) farms += 1;
    else if (t === TILE.LUMBER) lumbers += 1;
    else if (t === TILE.QUARRY) quarries += 1;
  }
  return { farms, lumbers, quarries };
}

for (const templateId of TEMPLATES) {
  for (const seed of SEEDS) {
    test(`terrain min-guarantee: ${templateId} seed=${seed} ships farms>=2, lumbers>=2, quarries>=1`, () => {
      const grid = createInitialGrid({ templateId, seed });
      const { farms, lumbers, quarries } = countResources(grid);
      assert.ok(farms >= 2, `${templateId} seed=${seed} farms=${farms} (need >=2)`);
      assert.ok(lumbers >= 2, `${templateId} seed=${seed} lumbers=${lumbers} (need >=2)`);
      assert.ok(quarries >= 1, `${templateId} seed=${seed} quarries=${quarries} (need >=1)`);
    });
  }
}
