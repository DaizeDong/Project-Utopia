import test from "node:test";
import assert from "node:assert/strict";

import { computeSimulationStepPlan } from "../src/app/simStepper.js";

// v0.8.2 Round-0 02c-speedrunner — sim-stepper clamp widened 3.0 → 4.0 to
// match the HUD Fast-Forward button's new x4 target. The ceiling is 4.0
// (x8 was rejected by orchestrator arbitration). Determinism safeguards
// (accumulatorSec ≤ 0.5, capSteps loop bound) must still hold.

test("computeSimulationStepPlan honours timeScale up to the x4 ceiling", () => {
  const baseParams = {
    frameDt: 0.05,
    accumulatorSec: 0,
    isPaused: false,
    stepFramesPending: 0,
    fixedStepSec: 1 / 30,
    maxSteps: 20,
  };
  const planAt2 = computeSimulationStepPlan({ ...baseParams, timeScale: 2 });
  const planAt4 = computeSimulationStepPlan({ ...baseParams, timeScale: 4 });

  // x4 must advance strictly more accumulator than x2 under identical wall-time.
  assert.ok(
    planAt4.nextAccumulatorSec + planAt4.steps * baseParams.fixedStepSec
      > planAt2.nextAccumulatorSec + planAt2.steps * baseParams.fixedStepSec,
    "x4 must consume more sim-time per frame than x2",
  );
});

test("computeSimulationStepPlan clamps timeScale above x4 to the x4 ceiling", () => {
  const baseParams = {
    frameDt: 0.05,
    accumulatorSec: 0,
    isPaused: false,
    stepFramesPending: 0,
    fixedStepSec: 1 / 30,
    maxSteps: 20,
  };
  const planAt4 = computeSimulationStepPlan({ ...baseParams, timeScale: 4 });
  const planAt99 = computeSimulationStepPlan({ ...baseParams, timeScale: 99 });

  // Both plans must step the same number of ticks because the clamp flattens
  // timeScale to 4.0 before accumulation. Identity is stronger than "<=".
  assert.equal(planAt99.steps, planAt4.steps, "timeScale=99 must clamp down to x4");
  assert.equal(
    planAt99.nextAccumulatorSec.toFixed(6),
    planAt4.nextAccumulatorSec.toFixed(6),
    "timeScale=99 must produce the same accumulator as timeScale=4",
  );
});

test("computeSimulationStepPlan keeps accumulatorSec bounded at 0.5 at x4", () => {
  // Determinism guard: even at the new x4 ceiling, the accumulator must still
  // be clipped at 0.5s so a long GC pause / alt-tab cannot trigger the classic
  // spiral-of-death. The Phase 10 long-horizon hardening depends on this.
  const plan = computeSimulationStepPlan({
    frameDt: 10, // simulate a 10-second browser stall
    accumulatorSec: 0,
    isPaused: false,
    stepFramesPending: 0,
    fixedStepSec: 1 / 30,
    timeScale: 4,
    maxSteps: 20,
  });

  assert.ok(plan.nextAccumulatorSec <= 0.5 + 1e-9, `accumulator must be clipped at 0.5s, got ${plan.nextAccumulatorSec}`);
  assert.ok(plan.steps <= 20, "steps must still respect the capSteps loop bound");
});

test("computeSimulationStepPlan still respects timeScale=1 after the clamp change", () => {
  const plan = computeSimulationStepPlan({
    frameDt: 1 / 30,
    accumulatorSec: 0,
    isPaused: false,
    stepFramesPending: 0,
    fixedStepSec: 1 / 30,
    timeScale: 1,
    maxSteps: 10,
  });

  // At real-time scale with a single fixed-step frame budget, we should see
  // exactly one tick — proving the clamp change didn't regress normal play.
  assert.equal(plan.steps, 1);
});
