// v0.8.2 Round-6 Wave-1 01b-playability (Step 1 + Step 3) test coverage.
//
// Validates two heat-lens behaviours promised by plan 01b:
//   1. Halo markers (id starting with "halo:") carry an empty-string label.
//      The coloured ring conveys the "neighbouring tile" meaning visually;
//      the dev placeholder string is no longer leaked to the player. (Step 1)
//   2. Each tile-key is occupied by AT MOST one primary heat marker. The
//      tile-keyed dedup runs ahead of the kind-prefixed `seen` set, so even
//      when both RED (heat_surplus) and BLUE (heat_starved) categories
//      apply to the same square only the higher-priority marker stays.
//      (Step 3)
//
// Together these two guarantees keep the heat-lens overlay readable on the
// 96×72 grid: ≤ MAX_HEAT_MARKERS_HALO=64 silent halos + at most one labelled
// primary marker per tile.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildHeatLens } from "../src/render/PressureLens.js";
import { TILE } from "../src/config/constants.js";

function makeState({ kitchenPositions = [], food = 0 } = {}) {
  const W = 20;
  const H = 20;
  const tiles = new Uint8Array(W * H).fill(TILE.GRASS);
  for (const [ix, iz] of kitchenPositions) {
    tiles[ix + iz * W] = TILE.KITCHEN;
  }
  return {
    grid: { width: W, height: H, tiles, tileSize: 1 },
    resources: { food, meals: 0, wood: 0, stone: 0, herbs: 0, tools: 0, medicine: 0 },
    metrics: { warehouseDensity: null },
    agents: [],
    buildings: {},
  };
}

describe("heat-lens halo silent labels (01b Step 1)", () => {
  it("every halo: marker carries label === ''", () => {
    const state = makeState({ kitchenPositions: [[10, 10]], food: 0 });
    const markers = buildHeatLens(state);
    const halos = markers.filter((m) => String(m.id).startsWith("halo:"));
    assert.ok(halos.length > 0, "expected at least one halo marker");
    for (const halo of halos) {
      assert.equal(
        halo.label,
        "",
        `halo marker id=${halo.id} leaked label="${halo.label}"`,
      );
    }
  });

  it("MAX_HEAT_MARKERS_HALO=64 cap respected even with grid full of starved kitchens", () => {
    const W = 20;
    const H = 20;
    const positions = [];
    for (let iz = 0; iz < H; iz += 2) {
      for (let ix = 0; ix < W; ix += 2) {
        positions.push([ix, iz]);
      }
    }
    const state = makeState({ kitchenPositions: positions, food: 0 });
    const markers = buildHeatLens(state);
    assert.ok(
      markers.length <= 64,
      `01b Step 1 lowered halo cap to 64 — got ${markers.length}`,
    );
  });
});

describe("heat-lens primary marker dedup by tileKey (01b Step 3)", () => {
  it("at most one primary (non-halo) marker per (ix,iz) tile-key", () => {
    const W = 20;
    const H = 20;
    const tiles = new Uint8Array(W * H).fill(TILE.GRASS);
    // Stacked starved kitchens cluster: ensures the late stone-empty
    // fallback path also competes for tile (5,5).
    tiles[5 + 5 * W] = TILE.KITCHEN;
    tiles[6 + 5 * W] = TILE.SMITHY;
    tiles[7 + 5 * W] = TILE.QUARRY;
    tiles[8 + 5 * W] = TILE.CLINIC;
    const state = {
      grid: { width: W, height: H, tiles, tileSize: 1 },
      resources: { food: 0, meals: 0, wood: 0, stone: 0, herbs: 0, tools: 0, medicine: 0 },
      metrics: { warehouseDensity: null },
      agents: [],
      buildings: {},
    };
    const markers = buildHeatLens(state);
    const primaryByKey = new Map();
    for (const m of markers) {
      if (String(m.id).startsWith("halo:")) continue;
      const k = `${m.ix},${m.iz}`;
      const prev = primaryByKey.get(k);
      assert.equal(
        prev,
        undefined,
        `tile ${k} hosts multiple primary markers: previous="${prev}" new="${m.id}"`,
      );
      primaryByKey.set(k, m.id);
    }
    assert.ok(primaryByKey.size > 0, "expected at least one primary marker");
  });
});
