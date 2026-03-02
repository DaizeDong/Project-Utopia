import test from "node:test";
import assert from "node:assert/strict";
import {
  MAP_TEMPLATES,
  DEFAULT_MAP_TEMPLATE_ID,
  createInitialGrid,
  validateGeneratedGrid,
} from "../src/world/grid/Grid.js";
import { TILE_INFO } from "../src/config/constants.js";

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
