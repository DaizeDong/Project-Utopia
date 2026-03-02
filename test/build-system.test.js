import test from "node:test";
import assert from "node:assert/strict";

import { BuildSystem } from "../src/simulation/construction/BuildSystem.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { TILE } from "../src/config/constants.js";

test("BuildSystem enforces cost and never drives resources below zero", () => {
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();

  state.resources.wood = 3;
  const noMoney = buildSystem.placeToolAt(state, "warehouse", 10, 10);
  assert.equal(noMoney.ok, false);
  assert.equal(noMoney.reason, "insufficientResource");
  assert.equal(state.resources.wood, 3);

  const okRoad = buildSystem.placeToolAt(state, "road", 10, 10);
  assert.equal(okRoad.ok, true);
  assert.equal(state.resources.wood, 2);
  assert.equal(state.grid.tiles[10 + 10 * state.grid.width], TILE.ROAD);

  state.resources.wood = 0;
  const failWall = buildSystem.placeToolAt(state, "wall", 11, 10);
  assert.equal(failWall.ok, false);
  assert.equal(failWall.reason, "insufficientResource");
  assert.ok(state.resources.wood >= 0);
});

test("BuildSystem preview reports water blocked placement", () => {
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();

  state.grid.tiles[12 + 12 * state.grid.width] = TILE.WATER;
  const preview = buildSystem.previewToolAt(state, "farm", 12, 12);
  assert.equal(preview.ok, false);
  assert.equal(preview.reason, "waterBlocked");
});

test("BuildSystem undo/redo restores tiles and resources", () => {
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();
  const ix = 9;
  const iz = 9;
  const idx = ix + iz * state.grid.width;
  const beforeTile = state.grid.tiles[idx];
  const beforeWood = state.resources.wood;

  const placed = buildSystem.placeToolAt(state, "road", ix, iz);
  assert.equal(placed.ok, true);
  assert.equal(state.grid.tiles[idx], TILE.ROAD);
  assert.equal(state.resources.wood, beforeWood - (placed.cost.wood ?? 0));

  const undo = buildSystem.undo(state);
  assert.equal(undo.ok, true);
  assert.equal(state.grid.tiles[idx], beforeTile);
  assert.equal(state.resources.wood, beforeWood);

  const redo = buildSystem.redo(state);
  assert.equal(redo.ok, true);
  assert.equal(state.grid.tiles[idx], TILE.ROAD);
});
