// v0.8.2 Round-5 Wave-2 (01c-ui Step 6): HUDController appends
// `weakest: <dim> <value>` to #statusObjectiveDev textContent when the
// lowest dev dimension trails the overall score by > 8 points. In
// casual-mode the suffix is suppressed to preserve the "friendly
// HUD" contract (Dev 49/100 only).
//
// Plan: assignments/homework6/Agent-Feedback-Loop/Round5/Plans/01c-ui.md

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = fs.readFileSync("src/ui/hud/HUDController.js", "utf8");

test("HUDController weakest-dim logic reads devIndexDims", () => {
  assert.match(SRC, /devIndexDims/, "expected HUDController to inspect state.gameplay.devIndexDims");
  assert.match(SRC, /weakest:/, "expected weakest: badge string in source");
});

test("HUDController weakest-dim guard uses devScore - 8 threshold", () => {
  assert.match(
    SRC,
    /weakestValue\s*<\s*devScore\s*-\s*8/,
    "expected threshold `weakestValue < devScore - 8`",
  );
});

test("HUDController weakest-dim is suppressed in casual mode", () => {
  // The weakest-dim branch should be gated on !casualMode.
  assert.match(
    SRC,
    /!casualMode\s*&&\s*inActive\s*&&\s*devTicks\s*>\s*0/,
    "expected the weakest-dim branch to require !casualMode",
  );
});

test("computeWeakestDim guard rejects infinite/non-finite values", () => {
  // Imitate the HUDController logic literally to sanity-check behavior
  // across a spread of dim shapes.
  function computeSuffix(dims, devScore) {
    let weakestKey = null;
    let weakestValue = Number.POSITIVE_INFINITY;
    for (const [key, rawValue] of Object.entries(dims)) {
      const v = Number(rawValue);
      if (!Number.isFinite(v)) continue;
      if (v < weakestValue) {
        weakestValue = v;
        weakestKey = key;
      }
    }
    if (weakestKey && Number.isFinite(weakestValue) && weakestValue < devScore - 8) {
      return `Dev ${devScore}/100 · weakest: ${weakestKey} ${Math.round(weakestValue)}`;
    }
    return `Dev ${devScore}/100`;
  }

  const dims = {
    population: 80,
    economy: 70,
    infrastructure: 30,
    production: 75,
    defense: 18,
    resilience: 60,
  };
  assert.equal(
    computeSuffix(dims, 49),
    "Dev 49/100 · weakest: defense 18",
  );

  const flatDims = { a: 50, b: 55, c: 52 };
  // All dims within 8 of 55 → no suffix.
  assert.equal(computeSuffix(flatDims, 55), "Dev 55/100");

  const weirdDims = { a: NaN, b: 40, c: Infinity };
  // Only finite dim is 40; devScore 55 → 55-8=47, 40<47 → suffix.
  assert.equal(computeSuffix(weirdDims, 55), "Dev 55/100 · weakest: b 40");

  // Empty dims → no suffix.
  assert.equal(computeSuffix({}, 55), "Dev 55/100");
});

test("foodRateBreakdown empty branch shows '(sampling…)' not blank", () => {
  assert.match(
    SRC,
    /"\(sampling…\)"/,
    "expected '(sampling…)' placeholder for empty foodRateBreakdown",
  );
});

test("glossary pair list includes foodRateBreakdown", () => {
  assert.match(
    SRC,
    /this\.foodRateBreakdown,\s*"foodRateBreakdown"/,
    "expected #applyGlossaryTooltips pairs to include foodRateBreakdown",
  );
});
