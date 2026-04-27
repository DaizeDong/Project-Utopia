import test from "node:test";
import assert from "node:assert/strict";

import { NODE_FLAGS } from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { classifyPlacementTiles } from "../src/render/PressureLens.js";
import { NODE_GATED_TOOLS } from "../src/simulation/construction/BuildAdvisor.js";
import { setTileField } from "../src/world/grid/Grid.js";

test("placement lens classifies legal node tiles for gated tools", () => {
  const state = createInitialGameState({ seed: 701 });
  const target = { ix: 9, iz: 9 };
  setTileField(state.grid, target.ix, target.iz, "nodeFlags", NODE_FLAGS.STONE);

  const classified = classifyPlacementTiles(state, "quarry");

  assert.equal(NODE_GATED_TOOLS.quarry, NODE_FLAGS.STONE);
  assert.equal(classified.requiredFlag, NODE_FLAGS.STONE);
  assert.ok(classified.legal.some((tile) => tile.ix === target.ix && tile.iz === target.iz));
  assert.equal(classified.illegal.some((tile) => tile.ix === target.ix && tile.iz === target.iz), false);
});

test("placement lens stays empty for non node-gated tools", () => {
  const state = createInitialGameState({ seed: 702 });

  const classified = classifyPlacementTiles(state, "select");

  assert.deepEqual(classified.legal, []);
  assert.deepEqual(classified.illegal, []);
  assert.equal(classified.requiredFlag, 0);
});
