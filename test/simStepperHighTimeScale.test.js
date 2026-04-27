// test/simStepperHighTimeScale.test.js
// v0.8.2 Round-5b (02c-speedrunner Step 6c)
// Validates that maxSteps=12 and accumulator cap work under high timeScale.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeSimulationStepPlan } from "../src/app/simStepper.js";

describe("simStepper with maxSteps=12 (02a+02c)", () => {
  it("timeScale=4 / normal frame pumps at least 1 step", () => {
    const plan = computeSimulationStepPlan({
      frameDt: 0.016,
      accumulatorSec: 0,
      isPaused: false,
      stepFramesPending: 0,
      fixedStepSec: 1 / 30,
      timeScale: 4,
      maxSteps: 12,
    });
    assert.ok(plan.steps >= 1, "at least 1 step at 4×");
    assert.ok(plan.steps <= 12, "never exceeds maxSteps=12 cap");
  });

  it("accumulator does not grow unboundedly (hard cap enforced)", () => {
    // After many frames, accumulator should stabilize ≤ soft cap
    let acc = 0;
    for (let i = 0; i < 100; i++) {
      const plan = computeSimulationStepPlan({
        frameDt: 0.5, // slow frame
        accumulatorSec: acc,
        isPaused: false,
        stepFramesPending: 0,
        fixedStepSec: 1 / 30,
        timeScale: 4,
        maxSteps: 12,
      });
      acc = plan.nextAccumulatorSec;
    }
    assert.ok(acc <= 3.0, `accumulator stayed bounded (got ${acc.toFixed(3)})`);
  });

  it("timeScaleActual metric can be computed from plan output", () => {
    const plan = computeSimulationStepPlan({
      frameDt: 0.016,
      accumulatorSec: 0,
      isPaused: false,
      stepFramesPending: 0,
      fixedStepSec: 1 / 30,
      timeScale: 4,
      maxSteps: 12,
    });
    const frameDt = 0.016;
    const actualScale = frameDt > 0 ? plan.simDt / frameDt : 0;
    assert.ok(actualScale >= 0, "actualScale non-negative");
    assert.ok(Number.isFinite(actualScale), "actualScale is finite");
  });
});
