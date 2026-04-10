import test from "node:test";
import assert from "node:assert/strict";
import {
  MAP_TEMPLATES,
  DEFAULT_MAP_TEMPLATE_ID,
  createInitialGrid,
  validateGeneratedGrid,
} from "../src/world/grid/Grid.js";
import { TILE, TILE_INFO } from "../src/config/constants.js";

function gridSignature(grid) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < grid.tiles.length; i += 1) {
    h ^= grid.tiles[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

test("all map templates validate across representative seeds", () => {
  const seeds = [7, 11, 23, 97, 1337, 2026];
  for (const tpl of MAP_TEMPLATES) {
    for (const seed of seeds) {
      const grid = createInitialGrid({ templateId: tpl.id, seed });
      const result = validateGeneratedGrid(grid);
      assert.equal(result.ok, true, `template=${tpl.id} seed=${seed} failed: ${result.issues.join(", ")}`);
      assert.equal(grid.width > 0, true);
      assert.equal(grid.height > 0, true);
    }
  }
});

test("map generation is deterministic for same template and seed", () => {
  for (const tpl of MAP_TEMPLATES) {
    const a = createInitialGrid({ templateId: tpl.id, seed: 4242 });
    const b = createInitialGrid({ templateId: tpl.id, seed: 4242 });
    assert.equal(gridSignature(a), gridSignature(b), `template ${tpl.id} deterministic mismatch`);
  }
});

test("unknown template falls back to default template", () => {
  const grid = createInitialGrid({ templateId: "unknown-template", seed: 99 });
  assert.equal(grid.templateId, DEFAULT_MAP_TEMPLATE_ID);
});

test("different templates produce different topology signatures", () => {
  const seed = 5151;
  const signatures = new Set(
    MAP_TEMPLATES.map((tpl) => {
      const grid = createInitialGrid({ templateId: tpl.id, seed });
      return gridSignature(grid);
    }),
  );

  assert.ok(signatures.size >= 3, "at least 3 distinct template signatures expected");
});

test("templates exhibit quantitatively distinct terrain profiles", () => {
  const seed = 42;
  const stats = {};
  for (const tpl of MAP_TEMPLATES) {
    const grid = createInitialGrid({ templateId: tpl.id, seed });
    const total = grid.width * grid.height;
    let water = 0, wall = 0, farm = 0;
    for (let i = 0; i < grid.tiles.length; i += 1) {
      if (grid.tiles[i] === TILE.WATER) water += 1;
      if (grid.tiles[i] === TILE.WALL) wall += 1;
      if (grid.tiles[i] === TILE.FARM) farm += 1;
    }
    stats[tpl.id] = { waterPct: water / total, wallPct: wall / total };
  }

  // Archipelago should have dramatically more water than plains
  assert.ok(stats.archipelago_isles.waterPct > 0.5, "archipelago should have >50% water");
  assert.ok(stats.temperate_plains.waterPct < 0.15, "plains should have <15% water");

  // Coastal should have moderate water
  assert.ok(stats.coastal_ocean.waterPct > 0.3, "coastal should have >30% water");

  // Highlands should have walls
  assert.ok(stats.rugged_highlands.wallPct > 0.05, "highlands should have >5% walls");

  // Plains and riverlands should have no walls
  assert.ok(stats.temperate_plains.wallPct < 0.01, "plains should have <1% walls");
  assert.ok(stats.fertile_riverlands.wallPct < 0.01, "riverlands should have <1% walls");

  // Fortified basin should have walls (fortress)
  assert.ok(stats.fortified_basin.wallPct > 0.03, "fortified basin should have >3% walls");
});

test("all templates maintain passable connectivity above 40%", () => {
  const passableTypes = new Set(
    Object.entries(TILE_INFO).filter(([, info]) => info.passable).map(([id]) => Number(id)),
  );

  for (const tpl of MAP_TEMPLATES) {
    const grid = createInitialGrid({ templateId: tpl.id, seed: 42 });
    const area = grid.width * grid.height;
    let passable = 0;
    for (let i = 0; i < area; i += 1) {
      if (passableTypes.has(grid.tiles[i])) passable += 1;
    }

    const visited = new Uint8Array(area);
    let largest = 0;
    for (let start = 0; start < area; start += 1) {
      if (visited[start] || !passableTypes.has(grid.tiles[start])) continue;
      let size = 0;
      const stack = [start];
      visited[start] = 1;
      while (stack.length > 0) {
        const cur = stack.pop();
        size += 1;
        const ci = cur % grid.width;
        const cj = Math.floor(cur / grid.width);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = ci + dx;
          const nj = cj + dz;
          if (ni < 0 || nj < 0 || ni >= grid.width || nj >= grid.height) continue;
          const nIdx = ni + nj * grid.width;
          if (visited[nIdx] || !passableTypes.has(grid.tiles[nIdx])) continue;
          visited[nIdx] = 1;
          stack.push(nIdx);
        }
      }
      if (size > largest) largest = size;
    }

    const ratio = largest / Math.max(1, passable);
    assert.ok(ratio >= 0.4, `${tpl.id} connectivity too low: ${(ratio * 100).toFixed(1)}%`);
  }
});

test("generated grids contain only known tile ids and track empty-base normalization", () => {
  const seeds = [5, 19, 88, 2026];
  for (const tpl of MAP_TEMPLATES) {
    for (const seed of seeds) {
      const grid = createInitialGrid({ templateId: tpl.id, seed });
      assert.equal(Number.isInteger(grid.emptyBaseTiles), true, `missing emptyBaseTiles for ${tpl.id}/${seed}`);
      assert.ok(grid.emptyBaseTiles >= 0, `invalid emptyBaseTiles for ${tpl.id}/${seed}`);

      let unknown = 0;
      for (let i = 0; i < grid.tiles.length; i += 1) {
        if (TILE_INFO[grid.tiles[i]] === undefined) unknown += 1;
      }
      assert.equal(unknown, 0, `unknown tile ids found for ${tpl.id}/${seed}`);
    }
  }
});
