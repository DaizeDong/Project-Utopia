// test/buildCostEscalatorHardCap.test.js
// v0.8.2 Round-5b (02c-speedrunner Step 6a)
// Tests escalator perExtraBeyondCap + isBuildKindHardCapped.
// v0.10.1-m: all hardCap properties removed from BUILD_COST_ESCALATOR so that
// no building type has a placement ceiling — isBuildKindHardCapped always
// returns { capped: false, hardCap: null }.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeEscalatedBuildCost, isBuildKindHardCapped } from "../src/config/balance.js";

describe("computeEscalatedBuildCost beyond-cap linear extension", () => {
  it("warehouse at softTarget+1 is above base but below cap plateau", () => {
    // softTarget=2, perExtra=0.3, existingCount=3 → over=1 → rawMult=1.3 < cap=2.5
    const cost = computeEscalatedBuildCost("warehouse", 3);
    assert.ok(cost.wood > 10, "wood > base 10");
    assert.ok(cost.wood < 25, "wood < cap cost (25)");
  });

  it("warehouse at count=5 is at the cap plateau (v0.8.5 perExtra=0.30)", () => {
    const cost = computeEscalatedBuildCost("warehouse", 5);
    assert.ok(cost.wood >= 16 && cost.wood <= 25, `wood=${cost.wood} expected 16-25`);
  });

  it("warehouse beyond cap continues growing (no cheese plateau) — v0.8.5 perExtraBeyondCap=0.25", () => {
    const costAtCap = computeEscalatedBuildCost("warehouse", 5);
    const costBeyond = computeEscalatedBuildCost("warehouse", 14);
    assert.ok(costBeyond.wood > costAtCap.wood, "beyond-cap is more expensive than at-cap");
  });

  it("farm beyond cap also grows (perExtraBeyondCap=0.05)", () => {
    const costAtCap = computeEscalatedBuildCost("farm", 20);
    const costMore = computeEscalatedBuildCost("farm", 30);
    assert.ok(costMore.wood >= costAtCap.wood, "farm beyond-cap is at least as expensive");
  });
});

describe("isBuildKindHardCapped", () => {
  it("warehouse is never placement-capped (hardCap removed in v0.10.1-m)", () => {
    // All hardCap properties were removed so no building has a placement ceiling.
    const r14 = isBuildKindHardCapped("warehouse", 14);
    assert.strictEqual(r14.capped, false);
    assert.strictEqual(r14.hardCap, null);

    const r15 = isBuildKindHardCapped("warehouse", 15);
    assert.strictEqual(r15.capped, false);
    assert.strictEqual(r15.hardCap, null);

    const r25 = isBuildKindHardCapped("warehouse", 25);
    assert.strictEqual(r25.capped, false);
    assert.strictEqual(r25.hardCap, null);
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

  it("kitchen has no hardCap (removed in v0.10.1-m) → never capped", () => {
    assert.strictEqual(isBuildKindHardCapped("kitchen", 5).capped, false);
    assert.strictEqual(isBuildKindHardCapped("kitchen", 6).capped, false);
    assert.strictEqual(isBuildKindHardCapped("kitchen", 100).capped, false);
  });
});
