import test from "node:test";
import assert from "node:assert/strict";

import { computeSimulationStepPlan } from "../src/app/simStepper.js";

function runFrames({ frameCount, frameDt, maxSteps = 6 }) {
  let accumulatorSec = 0;
  let totalSimDt = 0;
  for (let i = 0; i < frameCount; i += 1) {
    const plan = computeSimulationStepPlan({
      frameDt,
      accumulatorSec,
      isPaused: false,
      stepFramesPending: 0,
      fixedStepSec: 1 / 30,
      timeScale: 4,
      maxSteps,
    });
    accumulatorSec = plan.nextAccumulatorSec;
    totalSimDt += plan.simDt;
  }
  return { totalSimDt, finalAccumulator: accumulatorSec };
}

test("x4 timeScale reaches near-4x simDt over 60 frames at 60fps", () => {
  const { totalSimDt } = runFrames({ frameCount: 60, frameDt: 1 / 60 });
  assert.ok(
    totalSimDt >= 3.9,
    `60fps x4 should advance >= 3.9s of sim time, got ${totalSimDt.toFixed(3)}s`,
  );
});

test("x4 timeScale reaches near-4x simDt over 30 frames at 30fps", () => {
  const { totalSimDt } = runFrames({ frameCount: 30, frameDt: 1 / 30 });
  assert.ok(
    totalSimDt >= 3.9,
    `30fps x4 should advance >= 3.9s of sim time, got ${totalSimDt.toFixed(3)}s`,
  );
});

test("x4 timeScale cap=6 preserves more sim-time after a long frame than cap=5", () => {
  const oldCap = runFrames({ frameCount: 10, frameDt: 0.1, maxSteps: 5 }).totalSimDt;
  const newCap = runFrames({ frameCount: 10, frameDt: 0.1, maxSteps: 6 }).totalSimDt;

  assert.ok(
    newCap > oldCap,
    `cap=6 should advance more sim-time than cap=5 after long frames (${newCap.toFixed(3)} vs ${oldCap.toFixed(3)})`,
  );
});
