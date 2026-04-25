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

  it("warehouse at count=9 is below cap (rawMult=2.4)", () => {
    // over=7, rawMult=1+0.2*7≈2.4 < cap=2.5 → standard branch, wood=ceil(10*2.4)=25 (float epsilon)
    const cost = computeEscalatedBuildCost("warehouse", 9);
    assert.ok(cost.wood >= 24 && cost.wood <= 25, `wood=${cost.wood} expected 24-25`);
  });

  it("warehouse beyond cap continues growing (no cheese plateau)", () => {
    // count=20: over=18, rawMult=1+0.2*18=4.6 > cap=2.5
    // beyond = 4.6-2.5 = 2.1, multiplier = 2.5 + 2.1*0.08 = 2.668, wood = ceil(10*2.668)=27
    const costAtCap = computeEscalatedBuildCost("warehouse", 9);
    const costBeyond = computeEscalatedBuildCost("warehouse", 20);
    assert.ok(costBeyond.wood > costAtCap.wood, "beyond-cap is more expensive than at-cap");
  });

  it("farm beyond cap also grows (perExtraBeyondCap=0.05)", () => {
    const costAtCap = computeEscalatedBuildCost("farm", 20); // far past cap
    const costMore = computeEscalatedBuildCost("farm", 30);
    assert.ok(costMore.wood >= costAtCap.wood, "farm beyond-cap is at least as expensive");
  });
});

describe("isBuildKindHardCapped", () => {
  it("warehouse at 19 is not capped (hardCap=20)", () => {
    const r = isBuildKindHardCapped("warehouse", 19);
    assert.strictEqual(r.capped, false);
    assert.strictEqual(r.hardCap, 20);
  });

  it("warehouse at 20 is capped (hardCap=20)", () => {
    const r = isBuildKindHardCapped("warehouse", 20);
    assert.strictEqual(r.capped, true);
    assert.strictEqual(r.hardCap, 20);
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
