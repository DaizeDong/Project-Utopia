import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isBuildToolCostBlocked } from "../src/ui/tools/BuildToolbar.js";
import { BUILD_COST } from "../src/config/balance.js";

// v0.10.1-A6 (R1 P0 #3 / D4) — when the colony has zero stockpile of
// every raw resource, every cost-bearing build tool must report
// "cost-blocked" so the corresponding button can render disabled +
// show the warning glyph. The two neutral tools (`select`, `erase`)
// must remain enabled regardless: `select` is the inspector;
// `erase` (Demolish) is gated by its own commission flow in
// BuildAdvisor, not by the BUILD_COST table here.
const ZERO_RESOURCES = Object.freeze({ food: 0, wood: 0, stone: 0, herbs: 0 });
const FLUSH_RESOURCES = Object.freeze({ food: 100, wood: 100, stone: 100, herbs: 100 });

describe("BuildToolbar — cost-blocked derive", () => {
  it("with zero stockpile, every cost-bearing tool is cost-blocked", () => {
    const blockedTools = [];
    for (const tool of Object.keys(BUILD_COST)) {
      const cost = BUILD_COST[tool];
      // `erase` cost is `{ wood: 0 }` — should never be blocked.
      const hasPositiveCost = Object.values(cost).some((v) => Number(v) > 0);
      const blocked = isBuildToolCostBlocked(tool, ZERO_RESOURCES);
      if (hasPositiveCost) {
        assert.equal(blocked, true, `${tool} should be cost-blocked at zero stockpile`);
        blockedTools.push(tool);
      } else {
        assert.equal(blocked, false, `${tool} has zero base cost so cannot be blocked`);
      }
    }
    // Sanity: at least the canonical 12 (farm, lumber, warehouse, wall,
    // quarry, herb_garden, kitchen, smithy, clinic, bridge, gate, road)
    // are all cost-bearing.
    assert.ok(blockedTools.length >= 10, `expected 10+ blocked, got ${blockedTools.length}`);
  });

  it("`select` and `erase` are never cost-blocked, even at zero stockpile", () => {
    assert.equal(isBuildToolCostBlocked("select", ZERO_RESOURCES), false);
    assert.equal(isBuildToolCostBlocked("erase", ZERO_RESOURCES), false);
    // Also robust to a missing resources object (initial bootstrap).
    assert.equal(isBuildToolCostBlocked("select", null), false);
    assert.equal(isBuildToolCostBlocked("erase", undefined), false);
  });

  it("with stockpile flush of every resource, no tool is cost-blocked", () => {
    for (const tool of Object.keys(BUILD_COST)) {
      assert.equal(
        isBuildToolCostBlocked(tool, FLUSH_RESOURCES),
        false,
        `${tool} should not be blocked when every axis is full`,
      );
    }
  });

  it("partial stockpile correctly gates tools whose cost includes the missing axis", () => {
    // wood-only resources unlocks all wood-only tools but kitchen
    // (wood + stone), smithy (wood + stone), clinic (wood + herbs),
    // bridge (wood + stone), gate (wood + stone) all stay blocked.
    const woodOnly = { food: 0, wood: 100, stone: 0, herbs: 0 };
    assert.equal(isBuildToolCostBlocked("farm", woodOnly), false, "farm only needs wood");
    assert.equal(isBuildToolCostBlocked("lumber", woodOnly), false, "lumber only needs wood");
    assert.equal(isBuildToolCostBlocked("warehouse", woodOnly), false, "warehouse only needs wood");
    assert.equal(isBuildToolCostBlocked("kitchen", woodOnly), true, "kitchen needs stone");
    assert.equal(isBuildToolCostBlocked("smithy", woodOnly), true, "smithy needs stone");
    assert.equal(isBuildToolCostBlocked("clinic", woodOnly), true, "clinic needs herbs");
    assert.equal(isBuildToolCostBlocked("bridge", woodOnly), true, "bridge needs stone");
    assert.equal(isBuildToolCostBlocked("gate", woodOnly), true, "gate needs stone");
  });

  it("unknown tool keys default to not-blocked (no false-positive disable)", () => {
    // A future tool that hasn't been registered in BUILD_COST yet
    // should not get a phantom disable. Tier-gate / scenario-gate
    // logic owns that case.
    assert.equal(isBuildToolCostBlocked("future_tool", ZERO_RESOURCES), false);
    assert.equal(isBuildToolCostBlocked("", ZERO_RESOURCES), false);
    assert.equal(isBuildToolCostBlocked(null, ZERO_RESOURCES), false);
  });
});
