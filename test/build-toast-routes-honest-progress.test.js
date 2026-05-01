import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateBuildPreview,
  summarizeBuildPreview,
} from "../src/simulation/construction/BuildAdvisor.js";
import { TILE } from "../src/config/constants.js";

// v0.10.1-n A3 — F3 fix: road-placement toast must report the connectivity
// progress (anchors-on-network counter) instead of the misleading
// "extends the first network line" copy. The HUD chip shows
// `routes connectedRoutes/routes.length`; the toast should agree.
//
// These tests assert the new copy on a synthetic 16×16 grid with two
// scenario anchors, mirroring the reviewer's first-impression repro.

function makeState(width = 16, height = 16) {
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

function attachTwoAnchorScenario(state) {
  state.gameplay.scenario = {
    anchors: {
      lumberCamp: { ix: 2, iz: 2 },
      ruinedDepot: { ix: 14, iz: 14 },
    },
    routeLinks: [
      {
        id: "west-lumber-route",
        label: "west lumber route",
        from: "lumberCamp",
        to: "ruinedDepot",
        gapTiles: [],
      },
    ],
  };
}

test("road placed mid-map without touching anchor reports anchors-linked counter, not the misleading 'extends the first network line'", () => {
  const state = makeState();
  attachTwoAnchorScenario(state);

  const preview = evaluateBuildPreview(state, "road", 8, 8);
  assert.equal(preview.ok, true);
  // The deprecated honest-toast violation must not appear anywhere in the
  // user-visible summary.
  assert.doesNotMatch(preview.summary, /extends the first network line/);
  // The new copy reports the counter; both endpoints are off-network.
  assert.match(preview.summary, /0\/2 route anchors linked/);
});

test("road placed on a route anchor counts that endpoint as linked", () => {
  const state = makeState();
  attachTwoAnchorScenario(state);
  // Place the player's first road tile directly on the ruinedDepot anchor;
  // BuildSystem rejects placing on an existing road, so we instead simulate
  // a previous segment by writing the tile and asking the toast to evaluate
  // a new road one tile away (which still doesn't touch the lumberCamp side).
  setTile(state, 14, 14, TILE.ROAD);

  const preview = evaluateBuildPreview(state, "road", 12, 14);
  assert.equal(preview.ok, true);
  assert.match(preview.summary, /1\/2 route anchors linked/);
  assert.doesNotMatch(preview.summary, /extends the first network line/);
});

test("road placed in a scenario with no route anchors falls back to a no-anchor message", () => {
  const state = makeState();
  // No scenario anchors at all — the toast should still be honest, not
  // claim a non-existent network was extended.
  const preview = evaluateBuildPreview(state, "road", 8, 8);
  assert.equal(preview.ok, true);
  assert.doesNotMatch(preview.summary, /extends the first network line/);
  assert.match(preview.summary, /1 segment placed/);
});

test("road that touches an existing road still says it connects directly", () => {
  const state = makeState();
  attachTwoAnchorScenario(state);
  setTile(state, 8, 7, TILE.ROAD);

  const preview = evaluateBuildPreview(state, "road", 8, 8);
  assert.equal(preview.ok, true);
  assert.match(preview.summary, /connects directly into the current network/);
});

test("summarizeBuildPreview surfaces the anchors-linked counter to UI consumers", () => {
  const state = makeState();
  attachTwoAnchorScenario(state);

  const preview = evaluateBuildPreview(state, "road", 8, 8);
  const summary = summarizeBuildPreview(preview);
  assert.match(summary, /0\/2 route anchors linked/);
});
