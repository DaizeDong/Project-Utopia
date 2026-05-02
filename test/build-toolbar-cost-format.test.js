// v0.10.1-A4 (R4 V5 #1) — describeBuildToolCostBlock cost-format unit test.
//
// Reviewer reported the disabled-tool tooltip rendering raw float values:
//   "Need 5 wood (have 0.7707197997152266)"
// instead of the truthful integer floor:
//   "Need 5 wood (have 0)"
//
// This test pins the Math.floor wrap so a future regression that strips
// it (or reverts to raw `${have}`) fails CI immediately. Mirrors the
// `Math.floor(food)` style used in BuildToolbar's recruit-status display.

import test from "node:test";
import assert from "node:assert/strict";

import { describeBuildToolCostBlock } from "../src/ui/tools/BuildToolbar.js";

test("describeBuildToolCostBlock: fractional wood resource displays as integer floor", () => {
  // warehouse costs 10 wood — see src/config/balance.js BUILD_COST.
  const out = describeBuildToolCostBlock("warehouse", {
    wood: 0.7707197997152266,
    food: 0,
    herbs: 0,
    stone: 0,
  });
  // Must NOT leak the raw float.
  assert.equal(
    out.includes("0.7707197997152266"),
    false,
    `tooltip leaked raw float: ${out}`,
  );
  // Must include the floored "(have 0)" segment.
  assert.equal(
    out.includes("(have 0)"),
    true,
    `tooltip missing floored "(have 0)": ${out}`,
  );
});

test("describeBuildToolCostBlock: integer wood resource is unaffected by floor", () => {
  // warehouse costs 10 wood; with 4 wood we have a deficit.
  const out = describeBuildToolCostBlock("warehouse", {
    wood: 4,
    food: 0,
    herbs: 0,
    stone: 0,
  });
  assert.equal(out.includes("(have 4)"), true, `expected "(have 4)" in: ${out}`);
});

test("describeBuildToolCostBlock: 0.99 wood (just under integer) floors to 0", () => {
  // Edge case: player has 0.99 wood (one tick short of a whole unit).
  // Truthful floor — they cannot place a 1-wood-cost build.
  const out = describeBuildToolCostBlock("road", {
    wood: 0.99,
    food: 0,
    herbs: 0,
    stone: 0,
  });
  assert.equal(out.includes("(have 0)"), true, `expected "(have 0)" in: ${out}`);
  assert.equal(out.includes("0.99"), false, `tooltip leaked 0.99: ${out}`);
});

test("describeBuildToolCostBlock: multi-axis shortfall shows floored values per axis", () => {
  // smithy needs 6 wood + 5 stone — see BUILD_COST.
  const out = describeBuildToolCostBlock("smithy", {
    wood: 1.234,
    stone: 0.567,
    food: 0,
    herbs: 0,
  });
  assert.equal(out.includes("(have 1)"), true, `expected wood "(have 1)" in: ${out}`);
  assert.equal(out.includes("(have 0)"), true, `expected stone "(have 0)" in: ${out}`);
  assert.equal(out.includes("1.234"), false, `tooltip leaked 1.234: ${out}`);
  assert.equal(out.includes("0.567"), false, `tooltip leaked 0.567: ${out}`);
});
