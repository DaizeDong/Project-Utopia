export function computeSimulationStepPlan({
  frameDt,
  accumulatorSec,
  isPaused,
  stepFramesPending,
  fixedStepSec,
  timeScale,
  maxSteps,
}) {
  const safeFrameDt = Math.min(0.1, Math.max(0, frameDt || 0));
  const safeFixed = Math.max(1 / 240, Math.min(0.25, fixedStepSec || 1 / 30));
  // v0.8.2 Round-0 02c-speedrunner — clamp upper bound 3.0 → 4.0 so the HUD's
  // x4 Fast-Forward button can reach the requested rate.
  //
  // v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 5a) — ceiling raised 4 → 8.
  // 8x is the *honest* upper bound: when simCost per step pushes past
  // ~8ms, the per-frame `maxStepsPerFrame=12` cap kicks in and the
  // observed `timeScaleActual` (HUDController.timeScaleActualLabel) clamps
  // back to 4-6 so the player sees an honest number. The new safeScale
  // ceiling here just permits the request; the loop bound + accumulator
  // soft cap (raised to 2.0 in Round-5b 02a) still guarantee long-horizon
  // determinism (Phase 10 hardening contract).
  const safeScale = Math.max(0.1, Math.min(8, timeScale || 1));
  const capSteps = Math.max(1, maxSteps | 0);
  const out = {
    steps: 0,
    consumedStepFrames: 0,
    nextAccumulatorSec: Math.max(0, accumulatorSec || 0),
    simDt: 0,
  };

  if (!isPaused) {
    // v0.8.2 Round-5b (02a-rimworld-veteran Step 1) — raise accumulator soft
    // cap from 0.5 → 2.0 to survive tab-visibility throttling. maxSteps=12
    // is the per-frame bound (Phase 10 hardening already validated this).
    out.nextAccumulatorSec = Math.min(2.0, out.nextAccumulatorSec + safeFrameDt * safeScale);
    while (out.nextAccumulatorSec >= safeFixed && out.steps < capSteps) {
      out.steps += 1;
      out.nextAccumulatorSec -= safeFixed;
    }
  } else if (stepFramesPending > 0) {
    const stepQuota = Math.min(stepFramesPending, capSteps);
    out.steps = stepQuota;
    out.consumedStepFrames = stepQuota;
  }

  out.simDt = out.steps * safeFixed;
  return out;
}
