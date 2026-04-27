// v0.8.2 Round-5 Wave-3 (02c Step 6) — BUILD_COST_ESCALATOR unit tests.
//
// Exercises `computeEscalatedBuildCost(kind, existingCount)` against the
// 6-case table in the plan: base / at-soft-target / mid / at-cap / not-in-
// table passthrough / multi-axis (kitchen with both wood + stone).

import test from "node:test";
import assert from "node:assert/strict";

import {
  BUILD_COST,
  BUILD_COST_ESCALATOR,
  computeEscalatedBuildCost,
  pluralBuildingKey,
} from "../src/config/balance.js";

test("computeEscalatedBuildCost: warehouse base cost at count=0", () => {
  // Base cost is 10 wood; count=0 < softTarget=2, so multiplier = 1.
  const cost = computeEscalatedBuildCost("warehouse", 0);
  assert.equal(cost.wood, 10);
});

test("computeEscalatedBuildCost: warehouse at soft target yields base cost (no escalation)", () => {
  // count=2 == softTarget=2, so over=0 and multiplier=1.
  const cost = computeEscalatedBuildCost("warehouse", 2);
  assert.equal(cost.wood, 10);
});

test("computeEscalatedBuildCost: warehouse mid-range scaling (count=5)", () => {
  // 3 over softTarget × perExtra 0.2 = +60%. 10 × 1.6 = 16.
  const cost = computeEscalatedBuildCost("warehouse", 5);
  assert.equal(cost.wood, 16);
});

test("computeEscalatedBuildCost: warehouse beyond cap (count=20) costs more than cap plateau", () => {
  // v0.8.2 Round-5b 02c: perExtraBeyondCap=0.08 means cost grows past cap plateau.
  // raw=4.6 > cap=2.5 → mult = 2.5 + (4.6-2.5)*0.08 = 2.668 → wood = ceil(26.68) = 27.
  const cost = computeEscalatedBuildCost("warehouse", 20);
  assert.ok(cost.wood > 25, `beyond-cap cost should exceed old cap plateau of 25 (got ${cost.wood})`);
});

test("computeEscalatedBuildCost: road (not in escalator table) → flat passthrough", () => {
  const cost = computeEscalatedBuildCost("road", 100);
  assert.deepEqual(cost, { ...BUILD_COST.road });
});

test("computeEscalatedBuildCost: bridge → flat passthrough even at very high count", () => {
  const cost = computeEscalatedBuildCost("bridge", 50);
  assert.deepEqual(cost, { ...BUILD_COST.bridge });
});

test("computeEscalatedBuildCost: kitchen at count=3 scales both wood AND stone", () => {
  // softTarget=1, perExtra=0.35, so count=3 → over=2 → mult = 1 + 0.35×2 = 1.7.
  // Base wood=8 → ceil(13.6) = 14. Base stone=3 → ceil(5.1) = 6.
  // The plan's hint "wood≈13, stone≈5" uses floor; we use ceil so callers
  // can't under-allocate a fractional cost. Assert the ceil values.
  const cost = computeEscalatedBuildCost("kitchen", 3);
  assert.equal(cost.wood, 14);
  assert.equal(cost.stone, 6);
});

test("computeEscalatedBuildCost: wall count=12 → cap=2.0 → 2 × 2.0 = 4 wood", () => {
  // 4 over × 0.1 = +40%. 2 × 1.4 = 2.8 → ceil(2.8) = 3.
  const cost = computeEscalatedBuildCost("wall", 12);
  assert.equal(cost.wood, 3);
});

test("computeEscalatedBuildCost: wall at massive count grows beyond cap=2.0", () => {
  // v0.8.2 Round-5b 02c: perExtraBeyondCap=0.05 means wall keeps growing past cap=2.0.
  // count=58: over=50, raw=6.0 > cap=2.0 → mult=2.0+(6.0-2.0)*0.05=2.2 → wood=ceil(4.4)=5.
  const cost = computeEscalatedBuildCost("wall", 58);
  assert.ok(cost.wood >= 4, `wall cost at count=58 should be ≥ old cap (${cost.wood})`);
});

test("computeEscalatedBuildCost: unknown kind → empty clone of empty base", () => {
  // Never throws; returns an empty object for kinds not in BUILD_COST.
  const cost = computeEscalatedBuildCost("bogus-tool", 5);
  assert.deepEqual(cost, {});
});

test("computeEscalatedBuildCost: BUILD_COST_ESCALATOR covers the 9 expected kinds", () => {
  // Sanity check on the table shape: each entry has softTarget/perExtra/cap.
  const expectedKinds = [
    "warehouse", "wall", "kitchen", "smithy", "clinic",
    "farm", "lumber", "quarry", "herb_garden",
  ];
  for (const k of expectedKinds) {
    const entry = BUILD_COST_ESCALATOR[k];
    assert.ok(entry, `missing escalator entry for ${k}`);
    assert.ok(Number.isFinite(entry.softTarget), `bad softTarget for ${k}`);
    assert.ok(Number.isFinite(entry.perExtra), `bad perExtra for ${k}`);
    assert.ok(Number.isFinite(entry.cap), `bad cap for ${k}`);
  }
});

test("pluralBuildingKey: maps 9 tool kinds to their buildings[...] slot", () => {
  assert.equal(pluralBuildingKey("warehouse"), "warehouses");
  assert.equal(pluralBuildingKey("wall"), "walls");
  assert.equal(pluralBuildingKey("kitchen"), "kitchens");
  assert.equal(pluralBuildingKey("smithy"), "smithies");
  assert.equal(pluralBuildingKey("clinic"), "clinics");
  assert.equal(pluralBuildingKey("farm"), "farms");
  assert.equal(pluralBuildingKey("lumber"), "lumbers");
  assert.equal(pluralBuildingKey("quarry"), "quarries");
  assert.equal(pluralBuildingKey("herb_garden"), "herbGardens");
  // Pass-through: unmapped keys return as-is.
  assert.equal(pluralBuildingKey("road"), "road");
});
