import test from "node:test";
import assert from "node:assert/strict";

import { TILE } from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { buildHeatLens } from "../src/render/PressureLens.js";
import { HEAT_TILE_OVERLAY_VISUAL } from "../src/render/SceneRenderer.js";

test("heat lens tile overlay keeps red and blue channels visibly strong", () => {
  assert.ok(HEAT_TILE_OVERLAY_VISUAL.heat_surplus.opacity >= 0.4);
  assert.ok(HEAT_TILE_OVERLAY_VISUAL.heat_starved.opacity >= 0.4);
  assert.ok(HEAT_TILE_OVERLAY_VISUAL.pulseAmplitude >= 0.2);
});

test("buildHeatLens emits a heat surplus marker for producers beside hot warehouses", () => {
  const state = createInitialGameState({ seed: 608 });
  const farm = { ix: 12, iz: 12 };
  const warehouse = { ix: 13, iz: 12 };
  state.grid.tiles[farm.ix + farm.iz * state.grid.width] = TILE.FARM;
  state.grid.tiles[warehouse.ix + warehouse.iz * state.grid.width] = TILE.WAREHOUSE;
  state.grid.version += 1;
  const warehouseKey = `${warehouse.ix},${warehouse.iz}`;
  state.metrics.warehouseDensity = {
    threshold: 400,
    hotWarehouses: [warehouseKey],
    byKey: { [warehouseKey]: 500 },
  };

  const markers = buildHeatLens(state);
  const marker = markers.find((entry) => entry.kind === "heat_surplus");

  assert.ok(marker, "expected at least one heat_surplus marker");
  assert.equal(marker.ix, farm.ix);
  assert.equal(marker.iz, farm.iz);
  assert.ok(Number(marker.radius ?? 0) >= 0.9);
  assert.ok(Number(marker.weight ?? 0) >= 0.8);
});
