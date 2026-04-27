// v0.8.2 Round-6 Wave-2 (02a-rimworld-veteran Step 4) — halo label semantics.
//
// Per Stage B summary §2 D1, Wave-1 has locked the on-screen halo label="" to
// keep the overlay quiet. This file verifies the WAVE-2 add-only contract:
//   (a) halo markers MUST NOT carry the literal "halo" label (Wave-1 floor)
//   (b) halo markers MUST keep the "halo:" id prefix so existing
//       test/heat-lens-coverage.test.js dedup logic still works
//   (c) halo markers expose a `hoverTooltip` derived from parent.label
//       ("near supply surplus" / "near input starved" / etc.) so the
//       SceneRenderer can wire it on pointer-enter without rewriting :409.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildHeatLens } from "../src/render/PressureLens.js";
import { TILE } from "../src/config/constants.js";

function makeStarvedKitchenState() {
  const W = 20;
  const H = 20;
  const tiles = new Uint8Array(W * H).fill(TILE.GRASS);
  tiles[10 + 10 * W] = TILE.KITCHEN;
  return {
    grid: { width: W, height: H, tiles, tileSize: 1 },
    resources: { food: 0, meals: 0, wood: 0, stone: 0, herbs: 0, tools: 0, medicine: 0 },
    metrics: { warehouseDensity: null },
    agents: [],
    buildings: {},
  };
}

describe("heat-lens halo label (02a Step 4)", () => {
  it("a: halo markers do not carry the literal 'halo' label", () => {
    const markers = buildHeatLens(makeStarvedKitchenState());
    const halos = markers.filter((m) => String(m.id).startsWith("halo:"));
    assert.ok(halos.length > 0, "expected at least one halo marker");
    for (const halo of halos) {
      assert.notStrictEqual(
        halo.label,
        "halo",
        `halo marker ${halo.id} still uses the dev placeholder "halo" label`,
      );
    }
  });

  it("b: halo marker ids retain the 'halo:' prefix (regression guard for heat-lens-coverage)", () => {
    const markers = buildHeatLens(makeStarvedKitchenState());
    const halos = markers.filter((m) => String(m.id).startsWith("halo:"));
    assert.ok(halos.length > 0, "expected at least one halo marker");
    for (const halo of halos) {
      assert.match(halo.id, /^halo:/,
        `halo marker id ${halo.id} must keep the halo: prefix`);
    }
  });

  it("c: halo markers expose hoverTooltip derived from parent label", () => {
    const markers = buildHeatLens(makeStarvedKitchenState());
    const halos = markers.filter((m) => String(m.id).startsWith("halo:"));
    assert.ok(halos.length > 0, "expected at least one halo marker");
    for (const halo of halos) {
      assert.ok(
        typeof halo.hoverTooltip === "string",
        `halo marker ${halo.id} must carry a hoverTooltip field`,
      );
      assert.ok(
        halo.hoverTooltip.startsWith("near "),
        `halo marker ${halo.id} hoverTooltip must start with "near " (got "${halo.hoverTooltip}")`,
      );
    }
  });
});
