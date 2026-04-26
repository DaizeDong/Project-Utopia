import test from "node:test";
import assert from "node:assert/strict";

import { computeSimulationStepPlan } from "../src/app/simStepper.js";

// v0.8.2 Round-0 02c-speedrunner — sim-stepper clamp widened 3.0 → 4.0 to
// match the HUD Fast-Forward button's new x4 target.
//
// v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 7b) — ceiling raised 4 → 8.
// Round-5b 02a already widened the accumulator soft cap from 0.5 → 2.0 to
// survive tab-visibility throttling. The capSteps loop bound (12 in
// production, parameterised in this test) is the per-frame hard ceiling —
// at frameDt=1/60 with capSteps=12, the loop yields exactly 4 steps under
// timeScale=8 (8 * 1/60 = 0.1333s ≈ 4 * (1/30)).

test("computeSimulationStepPlan honours timeScale up to the x8 ceiling", () => {
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
  const planAt8 = computeSimulationStepPlan({ ...baseParams, timeScale: 8 });

  // Higher tier consumes strictly more sim-time per frame.
  assert.ok(
    planAt4.nextAccumulatorSec + planAt4.steps * baseParams.fixedStepSec
      > planAt2.nextAccumulatorSec + planAt2.steps * baseParams.fixedStepSec,
    "x4 must consume more sim-time per frame than x2",
  );
  assert.ok(
    planAt8.nextAccumulatorSec + planAt8.steps * baseParams.fixedStepSec
      > planAt4.nextAccumulatorSec + planAt4.steps * baseParams.fixedStepSec,
    "x8 must consume more sim-time per frame than x4",
  );
});

test("computeSimulationStepPlan clamps timeScale above x8 to the x8 ceiling", () => {
  const baseParams = {
    frameDt: 0.05,
    accumulatorSec: 0,
    isPaused: false,
    stepFramesPending: 0,
    fixedStepSec: 1 / 30,
    maxSteps: 20,
  };
  const planAt8 = computeSimulationStepPlan({ ...baseParams, timeScale: 8 });
  const planAt99 = computeSimulationStepPlan({ ...baseParams, timeScale: 99 });

  // Both plans must step the same number of ticks because the clamp flattens
  // timeScale to 8.0 before accumulation. Identity is stronger than "<=".
  assert.equal(planAt99.steps, planAt8.steps, "timeScale=99 must clamp down to x8");
  assert.equal(
    planAt99.nextAccumulatorSec.toFixed(6),
    planAt8.nextAccumulatorSec.toFixed(6),
    "timeScale=99 must produce the same accumulator as timeScale=8",
  );
});

test("computeSimulationStepPlan keeps accumulatorSec bounded at 2.0 at x8", () => {
  // Determinism guard: even at the new x8 ceiling, the accumulator must still
  // be clipped at the Round-5b 02a soft cap (2.0s) so a long GC pause /
  // alt-tab cannot trigger the classic spiral-of-death. The Phase 10
  // long-horizon hardening depends on this.
  const plan = computeSimulationStepPlan({
    frameDt: 10, // simulate a 10-second browser stall
    accumulatorSec: 0,
    isPaused: false,
    stepFramesPending: 0,
    fixedStepSec: 1 / 30,
    timeScale: 8,
    maxSteps: 20,
  });

  assert.ok(plan.nextAccumulatorSec <= 2.0 + 1e-9, `accumulator must be clipped at 2.0s, got ${plan.nextAccumulatorSec}`);
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

// v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 7b) — three additional cases
// pinning the new x8 ceiling, low-end clamp, and a frame-budget step count.

test("timeScale=8 with frameDt=1/60 + capSteps=12 yields ≥3 steps", () => {
  // Frame budget: 1/60s @ x8 = 0.1333s of sim time. With fixed step 1/30s,
  // we expect floor(0.1333 / (1/30)) ≈ 4 steps. Loop bound 12 is generous.
  const plan = computeSimulationStepPlan({
    frameDt: 1 / 60,
    accumulatorSec: 0,
    isPaused: false,
    stepFramesPending: 0,
    fixedStepSec: 1 / 30,
    timeScale: 8,
    maxSteps: 12,
  });
  assert.ok(plan.steps >= 3, `expected ≥3 sim steps at x8/60fps, got ${plan.steps}`);
  assert.ok(plan.steps <= 12, "steps must respect the capSteps loop bound");
  assert.ok(plan.nextAccumulatorSec <= 2.0 + 1e-9, "accumulator soft cap honoured");
});

test("negative timeScale clamps up to the 0.1 floor (no zero-step lock)", () => {
  // The simStepper documents `Math.max(0.1, …)` as the lower clamp so the
  // sim never freezes from a stale negative slider value. timeScale=0 is
  // treated as a falsy default and falls through to 1 via `timeScale || 1`
  // (legacy behaviour, intentional — a literal 0 would freeze the sim
  // entirely). Negative values, however, ARE clamped to 0.1.
  const planAtMinus = computeSimulationStepPlan({
    frameDt: 0.5,
    accumulatorSec: 0,
    isPaused: false,
    stepFramesPending: 0,
    fixedStepSec: 1 / 30,
    timeScale: -2,
    maxSteps: 20,
  });
  const planAtPoint1 = computeSimulationStepPlan({
    frameDt: 0.5,
    accumulatorSec: 0,
    isPaused: false,
    stepFramesPending: 0,
    fixedStepSec: 1 / 30,
    timeScale: 0.1,
    maxSteps: 20,
  });
  // timeScale=-2 should behave identically to timeScale=0.1 (the floor).
  assert.equal(planAtMinus.steps, planAtPoint1.steps, "negative timeScale must clamp up to 0.1");
});

test("timeScale=8 plan stays deterministic across repeated calls", () => {
  // Pure-function contract: identical inputs produce identical outputs.
  // Determinism is critical for long-horizon-bench reproducibility.
  const params = {
    frameDt: 0.1,
    accumulatorSec: 0.05,
    isPaused: false,
    stepFramesPending: 0,
    fixedStepSec: 1 / 30,
    timeScale: 8,
    maxSteps: 12,
  };
  const a = computeSimulationStepPlan(params);
  const b = computeSimulationStepPlan(params);
  assert.deepEqual(a, b, "computeSimulationStepPlan must be pure");
});
