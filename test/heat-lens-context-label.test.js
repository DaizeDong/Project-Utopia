// v0.10.1-r3-A7 P0 — heat-lens context-sensitive "supply surplus" label.
//
// When the heat-lens fires a RED "supply surplus" marker on a producer beside
// a saturated warehouse but workers are starving (delivery isn't draining the
// queue), the literal label "supply surplus" contradicts the colony state.
// `buildHeatLens` swaps the label + tooltip to a delivery-blocked phrasing
// whenever ≥1 alive worker has hunger < 0.35 (the workerHungerSeekThreshold
// proxy — below it, the worker is actively food-seeking which the player
// experiences as "starving").
//
// This file pins:
//   (a) baseline — no hungry worker → label === "supply surplus"
//   (b) hungry worker present → label === "queued (delivery blocked)" and the
//       hoverTooltip carries the "Worker Focus" hint
//   (c) the marker kind / priority / id stay unchanged in both modes so the
//       overlay dedup + halo expansion logic remains undisturbed.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildHeatLens } from "../src/render/PressureLens.js";
import { TILE } from "../src/config/constants.js";

function makeSurplusState({ workerHunger = 1.0 } = {}) {
  // Layout: a single FARM at (10,10) adjacent to a WAREHOUSE at (11,10) which
  // we declare as a "hot" warehouse via state.metrics.warehouseDensity. This
  // is the minimal config that triggers the RED "supply surplus" marker in
  // PressureLens.buildHeatLens.
  const W = 20;
  const H = 20;
  const tiles = new Uint8Array(W * H).fill(TILE.GRASS);
  tiles[10 + 10 * W] = TILE.FARM;
  tiles[11 + 10 * W] = TILE.WAREHOUSE;
  const warehouseKey = "11,10";
  const agents = [];
  // Single WORKER agent. hunger = 1.0 (full) for baseline; lower to mark the
  // colony as "starving" for the context-label flip.
  agents.push({
    type: "WORKER",
    alive: true,
    hunger: workerHunger,
  });
  return {
    grid: { width: W, height: H, tiles, tileSize: 1 },
    resources: { food: 100, meals: 0, wood: 0, stone: 0, herbs: 0, tools: 0, medicine: 0 },
    metrics: {
      warehouseDensity: {
        hotWarehouses: [warehouseKey],
        byKey: { [warehouseKey]: 1000 },
        threshold: 400,
      },
    },
    agents,
    buildings: {},
  };
}

describe("heat-lens context-sensitive supply-surplus label (v0.10.1-r3-A7 P0)", () => {
  it("a: label === 'supply surplus' when no worker is hungry", () => {
    const markers = buildHeatLens(makeSurplusState({ workerHunger: 1.0 }));
    const red = markers.find((m) => m.kind === "heat_surplus");
    assert.ok(red, `expected at least one heat_surplus marker; got ${markers.length} total`);
    assert.strictEqual(red.label, "supply surplus");
    assert.strictEqual(red.hoverTooltip, "producer beside saturated warehouse");
  });

  it("b: label flips to 'queued (delivery blocked)' when a worker is starving", () => {
    const markers = buildHeatLens(makeSurplusState({ workerHunger: 0.10 }));
    const red = markers.find((m) => m.kind === "heat_surplus");
    assert.ok(red, "expected heat_surplus marker for the hungry-worker case");
    assert.strictEqual(red.label, "queued (delivery blocked)");
    assert.match(
      red.hoverTooltip,
      /Worker Focus/,
      "tooltip must redirect the player to Worker Focus when delivery is blocked",
    );
  });

  it("c: marker kind / priority / id are preserved across the label flip", () => {
    const baseline = buildHeatLens(makeSurplusState({ workerHunger: 1.0 }));
    const flipped = buildHeatLens(makeSurplusState({ workerHunger: 0.10 }));
    const baseRed = baseline.find((m) => m.kind === "heat_surplus");
    const flipRed = flipped.find((m) => m.kind === "heat_surplus");
    assert.ok(baseRed && flipRed);
    assert.strictEqual(flipRed.kind, baseRed.kind);
    assert.strictEqual(flipRed.id, baseRed.id);
    assert.strictEqual(flipRed.priority, baseRed.priority);
    assert.strictEqual(flipRed.labelPriority, baseRed.labelPriority);
    assert.strictEqual(flipRed.ix, baseRed.ix);
    assert.strictEqual(flipRed.iz, baseRed.iz);
  });

  it("d: hunger threshold gate at 0.35 — hunger=0.34 flips, hunger=0.50 does not", () => {
    const just_below = buildHeatLens(makeSurplusState({ workerHunger: 0.34 }));
    const above = buildHeatLens(makeSurplusState({ workerHunger: 0.50 }));
    const belowRed = just_below.find((m) => m.kind === "heat_surplus");
    const aboveRed = above.find((m) => m.kind === "heat_surplus");
    assert.strictEqual(belowRed.label, "queued (delivery blocked)");
    assert.strictEqual(aboveRed.label, "supply surplus");
  });
});
