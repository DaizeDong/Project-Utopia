import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildHeatLens } from "../src/render/PressureLens.js";
import { TILE } from "../src/config/constants.js";

// Build a minimal state with a 20×20 grid for heat lens testing.
function makeHeatState({ kitchenPositions = [], food = 0 } = {}) {
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

describe("heat-lens halo expansion", () => {
  it("a: total marker count > 20 with 5 starved kitchens + grass neighbours", () => {
    const positions = [[5, 5], [9, 5], [13, 5], [5, 9], [9, 9]];
    const state = makeHeatState({ kitchenPositions: positions, food: 0 });
    const markers = buildHeatLens(state);
    assert.ok(markers.length > 20, `expected >20 markers, got ${markers.length}`);
  });

  it("b: halo markers exist around at least one kitchen", () => {
    const state = makeHeatState({ kitchenPositions: [[10, 10]], food: 0 });
    const markers = buildHeatLens(state);
    const halos = markers.filter((m) => String(m.id).startsWith("halo:"));
    assert.ok(halos.length > 0, "no halo markers emitted");
  });

  it("c: marker count does not exceed MAX_HEAT_MARKERS_HALO (160)", () => {
    // Fill the whole grid with kitchens to stress the cap.
    const W = 20;
    const H = 20;
    const positions = [];
    for (let iz = 0; iz < H; iz += 2) {
      for (let ix = 0; ix < W; ix += 2) {
        positions.push([ix, iz]);
      }
    }
    const state = makeHeatState({ kitchenPositions: positions, food: 0 });
    const markers = buildHeatLens(state);
    assert.ok(markers.length <= 160, `expected ≤160 markers, got ${markers.length}`);
  });
});
