// test/buildCostEscalatorHardCap.test.js
// v0.8.2 Round-5b (02c-speedrunner Step 6a)
// Tests escalator hardCap + perExtraBeyondCap + isBuildKindHardCapped.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeEscalatedBuildCost, isBuildKindHardCapped } from "../src/config/balance.js";

describe("computeEscalatedBuildCost beyond-cap linear extension", () => {
  it("warehouse at softTarget+1 is above base but below cap plateau", () => {
    // softTarget=2, perExtra=0.2, existingCount=3 → over=1 → rawMult=1.2 < cap=2.5
    const cost = computeEscalatedBuildCost("warehouse", 3);
    assert.ok(cost.wood > 10, "wood > base 10");
    assert.ok(cost.wood < 25, "wood < cap cost (25)");
  });

  it("warehouse at count=5 is at the cap plateau (v0.8.5 perExtra=0.30)", () => {
    // v0.8.5 Tier 3: warehouse perExtra 0.20 → 0.30. count=5: over=3,
    // rawMult=1+0.3*3=1.9 < cap=2.5 → standard branch, wood=ceil(10*1.9)=19.
    // count=7: over=5, rawMult=1+0.3*5=2.5 == cap, wood=ceil(10*2.5)=25.
    const cost = computeEscalatedBuildCost("warehouse", 5);
    assert.ok(cost.wood >= 16 && cost.wood <= 25, `wood=${cost.wood} expected 16-25`);
  });

  it("warehouse beyond cap continues growing (no cheese plateau) — v0.8.5 perExtraBeyondCap=0.25", () => {
    // v0.8.5 Tier 3: perExtraBeyondCap 0.08 → 0.25. count=14 sits past
    // the new hardCap=15 boundary; we use a count comfortably past cap
    // for the comparison.
    const costAtCap = computeEscalatedBuildCost("warehouse", 5);
    const costBeyond = computeEscalatedBuildCost("warehouse", 14);
    assert.ok(costBeyond.wood > costAtCap.wood, "beyond-cap is more expensive than at-cap");
  });

  it("farm beyond cap also grows (perExtraBeyondCap=0.05)", () => {
    const costAtCap = computeEscalatedBuildCost("farm", 20); // far past cap
    const costMore = computeEscalatedBuildCost("farm", 30);
    assert.ok(costMore.wood >= costAtCap.wood, "farm beyond-cap is at least as expensive");
  });
});

describe("isBuildKindHardCapped", () => {
  it("warehouse at 14 is not capped (v0.8.5 hardCap=15)", () => {
    // v0.8.5 Tier 3: warehouse hardCap 20 → 15.
    const r = isBuildKindHardCapped("warehouse", 14);
    assert.strictEqual(r.capped, false);
    assert.strictEqual(r.hardCap, 15);
  });

  it("warehouse at 15 is capped (v0.8.5 hardCap=15)", () => {
    const r = isBuildKindHardCapped("warehouse", 15);
    assert.strictEqual(r.capped, true);
    assert.strictEqual(r.hardCap, 15);
  });

  it("warehouse at 25 is also capped (≥ hardCap)", () => {
    const r = isBuildKindHardCapped("warehouse", 25);
    assert.strictEqual(r.capped, true);
  });

  it("farm has no hardCap → never capped", () => {
    const r = isBuildKindHardCapped("farm", 999);
    assert.strictEqual(r.capped, false);
    assert.strictEqual(r.hardCap, null);
  });

  it("road is not in escalator → never capped", () => {
    const r = isBuildKindHardCapped("road", 999);
    assert.strictEqual(r.capped, false);
    assert.strictEqual(r.hardCap, null);
  });

  it("kitchen hardCap=6: count=5 not capped, count=6 capped", () => {
    assert.strictEqual(isBuildKindHardCapped("kitchen", 5).capped, false);
    assert.strictEqual(isBuildKindHardCapped("kitchen", 6).capped, true);
  });
});
