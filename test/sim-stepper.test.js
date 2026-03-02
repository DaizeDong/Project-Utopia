import test from "node:test";
import assert from "node:assert/strict";

import { computeSimulationStepPlan } from "../src/app/simStepper.js";

test("computeSimulationStepPlan does not advance while paused without queued steps", () => {
  const plan = computeSimulationStepPlan({
    frameDt: 0.05,
    accumulatorSec: 0.2,
    isPaused: true,
    stepFramesPending: 0,
    fixedStepSec: 1 / 30,
    timeScale: 1,
    maxSteps: 10,
  });

  assert.equal(plan.steps, 0);
  assert.equal(plan.consumedStepFrames, 0);
  assert.equal(plan.simDt, 0);
});

test("computeSimulationStepPlan consumes queued step frames while paused", () => {
  const plan = computeSimulationStepPlan({
    frameDt: 0.05,
    accumulatorSec: 0,
    isPaused: true,
    stepFramesPending: 5,
    fixedStepSec: 1 / 30,
    timeScale: 1,
    maxSteps: 10,
  });

  assert.equal(plan.steps, 5);
  assert.equal(plan.consumedStepFrames, 5);
  assert.ok(plan.simDt > 0);
});

test("computeSimulationStepPlan advances fixed steps while running", () => {
  const plan = computeSimulationStepPlan({
    frameDt: 0.05,
    accumulatorSec: 0,
    isPaused: false,
    stepFramesPending: 0,
    fixedStepSec: 1 / 30,
    timeScale: 1,
    maxSteps: 10,
  });

  assert.ok(plan.steps >= 1);
  assert.ok(plan.nextAccumulatorSec >= 0);
  assert.ok(plan.nextAccumulatorSec < 1 / 30);
});

test("computeSimulationStepPlan reflects changed fixedStepSec", () => {
  const slowTick = computeSimulationStepPlan({
    frameDt: 0.1,
    accumulatorSec: 0,
    isPaused: false,
    stepFramesPending: 0,
    fixedStepSec: 1 / 10,
    timeScale: 1,
    maxSteps: 10,
  });

  const fastTick = computeSimulationStepPlan({
    frameDt: 0.1,
    accumulatorSec: 0,
    isPaused: false,
    stepFramesPending: 0,
    fixedStepSec: 1 / 60,
    timeScale: 1,
    maxSteps: 10,
  });

  assert.ok(fastTick.steps > slowTick.steps);
  assert.ok(fastTick.simDt > 0);
  assert.ok(slowTick.simDt > 0);
});
