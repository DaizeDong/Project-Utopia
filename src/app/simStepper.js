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
  const safeScale = Math.max(0.1, Math.min(3, timeScale || 1));
  const capSteps = Math.max(1, maxSteps | 0);
  const out = {
    steps: 0,
    consumedStepFrames: 0,
    nextAccumulatorSec: Math.max(0, accumulatorSec || 0),
    simDt: 0,
  };

  if (!isPaused) {
    out.nextAccumulatorSec = Math.min(0.5, out.nextAccumulatorSec + safeFrameDt * safeScale);
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
