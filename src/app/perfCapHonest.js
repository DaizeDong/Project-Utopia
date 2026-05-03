// v0.10.2 PK-followup-deeper-perf R7 — pure helper that derives the HUD-only
// "honestCapped" boolean from the underlying perf-cap signals. The HUD reads
// `cap.honestCapped` instead of `cap.active` so the "(capped)" suffix only
// fires when the throttle genuinely bites the player. Sub-step-budget
// tightening alone (effectiveMaxSteps < maxSimulationStepsPerFrame) is hidden
// from the HUD while wall-clock is still hitting >=85% of target — `cap.active`
// remains the broader signal that benchmarks consume via `cappedSamples`.
//
// Inputs:
//   capActive                    — broad signal (any of: diverged, sub-step
//                                  budget tightened, currentFramePressure)
//   effectiveMaxSteps            — actual steps allowed this frame
//   maxSimulationStepsPerFrame   — configured ceiling
//   diverged                     — wall-clock < 0.85 * target at >=4x request
//   currentFramePressure         — workFrameMs/simCpuFrameMs/renderCpuMs spike
//
// Returns: boolean — true when the HUD should keep the "(capped)" suffix.
export function computeHonestCapped({
  capActive,
  effectiveMaxSteps,
  maxSimulationStepsPerFrame,
  diverged,
  currentFramePressure,
}) {
  if (!capActive) return false;
  const subStepOnly = effectiveMaxSteps < maxSimulationStepsPerFrame
    && !diverged
    && !currentFramePressure;
  return !subStepOnly;
}
