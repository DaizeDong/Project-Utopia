import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateBuildPreview,
  summarizeBuildPreview,
} from "../src/simulation/construction/BuildAdvisor.js";
import { TILE } from "../src/config/constants.js";

function makeState(width = 24, height = 24) {
  const size = width * height;
  return {
    grid: {
      width,
      height,
      tileSize: 1,
      version: 1,
      tiles: new Uint8Array(size).fill(TILE.GRASS),
      tileState: new Map(),
      elevation: new Float32Array(size).fill(0.5),
      moisture: new Float32Array(size).fill(0.5),
    },
    resources: { food: 200, wood: 200, stone: 200, herbs: 200 },
    gameplay: { scenario: {} },
    weather: { hazardTiles: [] },
  };
}

function setTile(state, ix, iz, tile) {
  state.grid.tiles[ix + iz * state.grid.width] = tile;
  state.grid.version += 1;
}

test("build preview tells producer players the short-haul warehouse distance", () => {
  const state = makeState();
  setTile(state, 5, 5, TILE.WAREHOUSE);

  const preview = evaluateBuildPreview(state, "farm", 7, 5);
  assert.equal(preview.ok, true);
  assert.ok(
    preview.effects.some((line) => /Short haul to nearest warehouse \(2 tiles\)/.test(line)),
    `expected short-haul effect, got ${preview.effects.join(" | ")}`,
  );
  assert.match(summarizeBuildPreview(preview), /\(7,5\)/);
  assert.match(summarizeBuildPreview(preview), /Short haul to nearest warehouse \(2 tiles\)/);
});

test("build preview warns before placing an isolated producer", () => {
  const state = makeState();
  setTile(state, 2, 2, TILE.WAREHOUSE);

  const preview = evaluateBuildPreview(state, "farm", 21, 21);
  assert.equal(preview.ok, true);
  assert.ok(
    preview.warnings.some((line) => /Nearest warehouse is 38 tiles away; build a road or depot first\./.test(line)),
    `expected isolated warning, got ${preview.warnings.join(" | ")}`,
  );
  assert.match(summarizeBuildPreview(preview), /\(21,21\)/);
  assert.match(summarizeBuildPreview(preview), /Warning: Nearest warehouse is 38 tiles away/);
});

test("build preview explains that warehouses extend depot coverage", () => {
  const state = makeState();
  setTile(state, 5, 6, TILE.WAREHOUSE);
  setTile(state, 12, 5, TILE.ROAD);
  state.gameplay.scenario.anchors = {
    eastDepot: { ix: 12, iz: 6 },
  };
  state.gameplay.scenario.depotZones = [{
    id: "east-depot",
    label: "east ruined depot",
    anchor: "eastDepot",
    radius: 1,
  }];

  const preview = evaluateBuildPreview(state, "warehouse", 12, 6);
  assert.equal(preview.ok, true);
  assert.ok(
    preview.effects.some((line) => /Extends depot coverage; nearest warehouse is 7 tiles away\./.test(line)),
    `expected depot coverage effect, got ${preview.effects.join(" | ")}`,
  );
  assert.match(summarizeBuildPreview(preview), /Warehouse at \(12,6\) reopens east ruined depot/);
  assert.match(summarizeBuildPreview(preview), /Extends depot coverage; nearest warehouse is 7 tiles away\./);
});
