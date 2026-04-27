import test from "node:test";
import assert from "node:assert/strict";

import { BALANCE } from "../src/config/balance.js";
import { TILE } from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { buildHeatLens } from "../src/render/PressureLens.js";

test("heat lens marks processors starved before resources hit zero", () => {
  const state = createInitialGameState({ seed: 606 });
  const ix = 12;
  const iz = 12;
  state.grid.tiles[ix + iz * state.grid.width] = TILE.KITCHEN;
  state.grid.version += 1;
  state.resources.food = Math.max(0, Number(BALANCE.heatLensStarveThreshold.food ?? 10) - 1);

  const markers = buildHeatLens(state);

  assert.ok(markers.some((marker) => (
    marker.kind === "heat_starved"
    && marker.ix === ix
    && marker.iz === iz
    && /input starved/i.test(marker.label)
  )));
});

test("heat lens fallback marks a smithy when stone is empty and a quarry exists", () => {
  const state = createInitialGameState({ seed: 607 });
  const smithy = { ix: 18, iz: 18 };
  const quarry = { ix: 20, iz: 18 };
  state.grid.tiles[smithy.ix + smithy.iz * state.grid.width] = TILE.SMITHY;
  state.grid.tiles[quarry.ix + quarry.iz * state.grid.width] = TILE.QUARRY;
  state.grid.version += 1;
  state.resources.food = 999;
  state.resources.wood = 999;
  state.resources.stone = 0;
  state.resources.herbs = 999;

  const markers = buildHeatLens(state);

  assert.ok(markers.some((marker) => (
    marker.kind === "heat_starved"
    && marker.ix === smithy.ix
    && marker.iz === smithy.iz
  )));
});
