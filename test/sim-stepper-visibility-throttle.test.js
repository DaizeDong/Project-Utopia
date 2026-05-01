// test/sim-stepper-visibility-throttle.test.js
// v0.8.2 Round-5b (02a-rimworld-veteran Step 1.4 + Step 5.3)
// Validates fastForwardScheduler balance config + simStepper accumulator cap.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BALANCE } from "../src/config/balance.js";
import { computeSimulationStepPlan } from "../src/app/simStepper.js";

describe("fastForwardScheduler balance config", () => {
  it("maxStepsPerFrame = 12", () => {
    assert.strictEqual(Number(BALANCE.fastForwardScheduler?.maxStepsPerFrame), 12);
  });

  it("accumulatorSoftCapSec = 2.0", () => {
    assert.strictEqual(Number(BALANCE.fastForwardScheduler?.accumulatorSoftCapSec), 2.0);
  });

  it("hiddenTabCatchupHz = 60", () => {
    assert.strictEqual(Number(BALANCE.fastForwardScheduler?.hiddenTabCatchupHz), 60);
  });
});

describe("simStepper accumulator cap", () => {
  it("accumulator caps at 2.0 s (not 0.5 s)", () => {
    // Pre-fill accumulator to 1.5 s, add 4× scaled 0.1 s frame → 1.5+0.4=1.9 → 57 steps capped at 12
    const plan = computeSimulationStepPlan({
      frameDt: 0.1,
      accumulatorSec: 1.5,
      isPaused: false,
      stepFramesPending: 0,
      fixedStepSec: 1 / 30,
      timeScale: 4,
      maxSteps: 12,
    });
    assert.strictEqual(plan.steps, 12);
    assert.ok(plan.nextAccumulatorSec >= 0, "nextAccumulator non-negative");
  });

  it("timeScale=4 with normal frameDt steps correctly", () => {
    const plan = computeSimulationStepPlan({
      frameDt: 0.016,
      accumulatorSec: 0,
      isPaused: false,
      stepFramesPending: 0,
      fixedStepSec: 1 / 30,
      timeScale: 4,
      maxSteps: 12,
    });
    // safeScale=4, scaled = 0.016*4=0.064, steps ~ 1 (1/30=0.033, floor(0.064/0.033)=1)
    assert.ok(plan.steps >= 1, "at least 1 step at 4× with normal frameDt");
    assert.ok(plan.steps <= 12, "never exceeds maxSteps cap");
  });
});

describe("renderHitboxPixels balance config", () => {
  it("entityPickFallback = 24", () => {
    assert.strictEqual(Number(BALANCE.renderHitboxPixels?.entityPickFallback), 24);
  });

  // v0.10.1-A3 R2 (F1) — guard radius 36 → 14 px so the threshold matches
  // the worker sprite's ~12 px visual hitbox + 2 px slop instead of acting
  // as a perception buffer. Without this fix, almost any click on grass
  // near a wandering animal silently became an entity selection (P0
  // first-impression reviewer report).
  it("entityPickGuard = 14", () => {
    assert.strictEqual(Number(BALANCE.renderHitboxPixels?.entityPickGuard), 14);
  });

  it("rpgProfileBonusPx = 6", () => {
    assert.strictEqual(Number(BALANCE.renderHitboxPixels?.rpgProfileBonusPx), 6);
  });
});
