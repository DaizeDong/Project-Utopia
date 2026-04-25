// test/kitchen-gate-wall-scenario.test.js
// v0.8.2 Round-5b (02a-rimworld-veteran Step 2.3)
// Validates Kitchen gate is wall-scenario-aware via kitchenStoneGate calc.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Kitchen gate wall-scenario stone budget", () => {
  function computeKitchenStoneGate(wallTargetTotal, wallBuilt, stone) {
    const remainingWalls = Math.max(0, wallTargetTotal - wallBuilt);
    const reservedStoneForWalls = (wallTargetTotal >= 7 && wallBuilt < wallTargetTotal * 0.5)
      ? Math.min(remainingWalls, Math.max(0, stone - 2))
      : 0;
    return 2 + reservedStoneForWalls;
  }

  it("plains (no wall target) → gate stays at 2", () => {
    const gate = computeKitchenStoneGate(0, 0, 4);
    assert.strictEqual(gate, 2);
  });

  it("Highlands: walls 7/10 target, built 3/10 (<half), stone=9 → gate accounts for remaining", () => {
    const gate = computeKitchenStoneGate(10, 3, 9);
    // remaining=7, reserved=min(7, max(0,9-2))=min(7,7)=7, gate=2+7=9
    assert.strictEqual(gate, 9);
  });

  it("walls 7/10 target, built 3/10, stone=2 → gate=2 (stone-2=0 reserved)", () => {
    const gate = computeKitchenStoneGate(10, 3, 2);
    // remaining=7, reserved=min(7, max(0,2-2))=0, gate=2
    assert.strictEqual(gate, 2);
  });

  it("walls 7/10 target, built 6/10 (≥half) → reserved=0, gate=2", () => {
    const gate = computeKitchenStoneGate(10, 6, 9);
    // wallBuilt >= wallTargetTotal*0.5 → reservedStoneForWalls=0
    assert.strictEqual(gate, 2);
  });

  it("walls target < 7 → reserved=0 regardless", () => {
    const gate = computeKitchenStoneGate(6, 0, 10);
    assert.strictEqual(gate, 2);
  });
});
