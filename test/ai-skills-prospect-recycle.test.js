/**
 * SkillLibrary Phase 5 skills (patches 14, 17, 18, Living World v0.8.0).
 *
 * Covers:
 *   - prospect_fog_frontier (patch 17): triggers when all discovered nodes
 *     of a type have yieldPool < 120; targets nearest fog-boundary tile.
 *   - recycle_abandoned_worksite (patch 18): suggests demolish when a
 *     producer sits on yieldPool<=0 without adjacent live nodes.
 *   - relocate_depleted_producer (patch 14): flags road-connected producers
 *     with yieldPool<30 and proposes a 4-6 tile relocation on the road net.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  suggestProspectFogFrontier,
  suggestRecycleAbandonedWorksite,
  suggestRelocateDepletedProducer,
} from "../src/simulation/ai/colony/SkillLibrary.js";
import { FOG_STATE, NODE_FLAGS, TILE } from "../src/config/constants.js";
import { createTileStateEntry } from "../src/world/grid/Grid.js";

function makeGrid(w = 16, h = 16) {
  return {
    width: w, height: h,
    tiles: new Uint8Array(w * h),
    moisture: new Float32Array(w * h).fill(0.5),
    elevation: new Float32Array(w * h).fill(0.4),
    tileState: new Map(),
  };
}
function setTile(grid, ix, iz, type) { grid.tiles[iz * grid.width + ix] = type; }
function setTS(grid, ix, iz, entry) {
  grid.tileState.set(iz * grid.width + ix, createTileStateEntry(entry));
}

function makeFog(grid, hiddenTiles = []) {
  const vis = new Uint8Array(grid.width * grid.height);
  vis.fill(FOG_STATE.EXPLORED);
  for (const [ix, iz] of hiddenTiles) {
    vis[iz * grid.width + ix] = FOG_STATE.HIDDEN;
  }
  return { visibility: vis, version: 1 };
}

// ── Patch 17 — prospect_fog_frontier ─────────────────────────────────
describe("SkillLibrary / prospect_fog_frontier (patch 17)", () => {
  it("emits an explore_fog assignment when all LUMBER nodes are depleted", () => {
    const grid = makeGrid(20, 20);
    setTile(grid, 5, 5, TILE.LUMBER);
    setTile(grid, 6, 5, TILE.LUMBER);
    setTS(grid, 5, 5, { yieldPool: 20, nodeFlags: NODE_FLAGS.FOREST });
    setTS(grid, 6, 5, { yieldPool: 15, nodeFlags: NODE_FLAGS.FOREST });

    const fog = makeFog(grid, [[15, 15], [0, 0]]);
    const state = { grid, fog };
    const out = suggestProspectFogFrontier(state);
    const lumberSuggestion = out.find((s) => s.resource === "wood");
    assert.ok(lumberSuggestion, "expected a wood prospect suggestion");
    assert.equal(lumberSuggestion.skill, "prospect_fog_frontier");
    assert.equal(lumberSuggestion.assignments[0].intent, "explore_fog");
    assert.ok(Number.isFinite(lumberSuggestion.target.ix));
  });

  it("does NOT trigger when any node still has a healthy pool", () => {
    const grid = makeGrid(20, 20);
    setTile(grid, 5, 5, TILE.LUMBER);
    setTile(grid, 6, 5, TILE.LUMBER);
    setTS(grid, 5, 5, { yieldPool: 20, nodeFlags: NODE_FLAGS.FOREST });
    setTS(grid, 6, 5, { yieldPool: 200, nodeFlags: NODE_FLAGS.FOREST });

    const fog = makeFog(grid, [[10, 10]]);
    const out = suggestProspectFogFrontier({ grid, fog });
    assert.equal(out.find((s) => s.resource === "wood"), undefined);
  });

  it("no-ops when fog is disabled / no hidden tiles remain", () => {
    const grid = makeGrid(16, 16);
    setTile(grid, 5, 5, TILE.QUARRY);
    setTS(grid, 5, 5, { yieldPool: 5, nodeFlags: NODE_FLAGS.STONE });
    // Fog with no HIDDEN tiles.
    const fog = { visibility: new Uint8Array(grid.width * grid.height).fill(FOG_STATE.EXPLORED), version: 1 };
    const out = suggestProspectFogFrontier({ grid, fog });
    assert.equal(out.length, 0);
  });
});

// ── Patch 18 — recycle_abandoned_worksite ────────────────────────────
describe("SkillLibrary / recycle_abandoned_worksite (patch 18)", () => {
  it("suggests demolish when a quarry is fully depleted with no live neighbour", () => {
    const grid = makeGrid(16, 16);
    setTile(grid, 5, 5, TILE.QUARRY);
    setTS(grid, 5, 5, { yieldPool: 0, nodeFlags: NODE_FLAGS.STONE });
    const out = suggestRecycleAbandonedWorksite({ grid });
    assert.equal(out.length, 1);
    assert.equal(out[0].skill, "recycle_abandoned_worksite");
    assert.equal(out[0].action, "demolish");
    assert.deepEqual(out[0].target, { ix: 5, iz: 5 });
    assert.equal(out[0].assignments[0].intent, "demolish");
  });

  it("does NOT suggest demolish when an adjacent live node exists", () => {
    const grid = makeGrid(16, 16);
    setTile(grid, 5, 5, TILE.QUARRY);
    setTS(grid, 5, 5, { yieldPool: 0, nodeFlags: NODE_FLAGS.STONE });
    // Adjacent tile carries a live stone node (pool > 0) — skill should skip.
    setTS(grid, 6, 5, { yieldPool: 90, nodeFlags: NODE_FLAGS.STONE });
    const out = suggestRecycleAbandonedWorksite({ grid });
    assert.equal(out.length, 0);
  });

  it("ignores producers with a non-zero yieldPool", () => {
    const grid = makeGrid(16, 16);
    setTile(grid, 5, 5, TILE.LUMBER);
    setTS(grid, 5, 5, { yieldPool: 20, nodeFlags: NODE_FLAGS.FOREST });
    const out = suggestRecycleAbandonedWorksite({ grid });
    assert.equal(out.length, 0);
  });
});

// ── Patch 14 — relocate_depleted_producer ────────────────────────────
describe("SkillLibrary / relocate_depleted_producer (patch 14)", () => {
  it("suggests demolish + rebuild on a road-connected anchor", () => {
    const grid = makeGrid(24, 24);
    setTile(grid, 5, 5, TILE.QUARRY);
    setTS(grid, 5, 5, { yieldPool: 10, nodeFlags: NODE_FLAGS.STONE });
    // Road adjacent to the depleted producer.
    setTile(grid, 5, 6, TILE.ROAD);
    // Road-connected GRASS anchor 5 tiles away with a live STONE node flag.
    setTile(grid, 10, 5, TILE.GRASS);
    setTile(grid, 10, 6, TILE.ROAD);
    setTS(grid, 10, 5, { yieldPool: 0, nodeFlags: NODE_FLAGS.STONE });

    const out = suggestRelocateDepletedProducer({ grid });
    assert.equal(out.length, 1);
    assert.equal(out[0].skill, "relocate_depleted_producer");
    assert.equal(out[0].producer, "quarry");
    assert.deepEqual(out[0].from, { ix: 5, iz: 5 });
    assert.ok(out[0].to);
    assert.equal(out[0].steps[0].action, "demolish");
    assert.equal(out[0].steps[1].action, "build");
  });

  it("skips producers that are NOT road-connected", () => {
    const grid = makeGrid(24, 24);
    setTile(grid, 5, 5, TILE.LUMBER);
    setTS(grid, 5, 5, { yieldPool: 5, nodeFlags: NODE_FLAGS.FOREST });
    // No adjacent roads anywhere.
    const out = suggestRelocateDepletedProducer({ grid });
    assert.equal(out.length, 0);
  });

  it("emits suggestion with to=null when no viable anchor exists nearby", () => {
    const grid = makeGrid(24, 24);
    setTile(grid, 5, 5, TILE.LUMBER);
    setTile(grid, 5, 6, TILE.ROAD);
    setTS(grid, 5, 5, { yieldPool: 5, nodeFlags: NODE_FLAGS.FOREST });
    // No other GRASS+FOREST+road tiles nearby.
    const out = suggestRelocateDepletedProducer({ grid });
    assert.equal(out.length, 1);
    assert.equal(out[0].to, null);
    // Still has the demolish step.
    assert.equal(out[0].steps.length, 1);
    assert.equal(out[0].steps[0].action, "demolish");
  });
});
