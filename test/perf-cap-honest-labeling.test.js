// v0.10.2 PK-followup-deeper-perf R7 — invariant tests for the HUD-only
// `honestCapped` flag. PO R7 (4.5/10) flagged the "(capped)" HUD suffix as
// "more demoralising than hidden" when it fires on transient sub-step-budget
// frames where wall-clock is still hitting target. The honest flag suppresses
// the label in that benign case while still keeping `cap.active` (benchmark
// `cappedSamples` consumer) intact.
//
// Three cases mirror the three signals that feed `capActive`:
//   1. Sub-step budget tightened, but no divergence and no frame pressure.
//      → cap.active === true, cap.honestCapped === false (HUD stays quiet)
//   2. Wall-clock divergence (PO scenario: actual ×3.4 of requested ×8).
//      → cap.active === true, cap.honestCapped === true  (HUD shows "(capped)")
//   3. Current frame pressure (workFrameMs > 45).
//      → cap.active === true, cap.honestCapped === true  (HUD shows "(capped)")

import test from "node:test";
import assert from "node:assert/strict";

import { computeHonestCapped } from "../src/app/perfCapHonest.js";

test("honestCapped: sub-step budget alone with healthy wall-clock is hidden", () => {
  // PO complaint: maxSteps tightened from 12→6 because tick cost briefly
  // spiked, but the wall-clock smoothing still hits ×7.6 of the requested ×8
  // (>=85%). Player can't feel the throttle; HUD should NOT scream "(capped)".
  const honest = computeHonestCapped({
    capActive: true,
    effectiveMaxSteps: 6,
    maxSimulationStepsPerFrame: 12,
    diverged: false,
    currentFramePressure: false,
  });
  assert.equal(honest, false, "sub-step budget alone with healthy wall-clock must be hidden");
});

test("honestCapped: wall-clock divergence keeps the (capped) label", () => {
  // PO scenario: requested ×8, actual smoothed wall-clock ×3.2 — diverged is
  // true (3.2 < 0.85 * 8 = 6.8). Player feels the throttle; HUD must inform.
  const honest = computeHonestCapped({
    capActive: true,
    effectiveMaxSteps: 6,
    maxSimulationStepsPerFrame: 12,
    diverged: true,
    currentFramePressure: false,
  });
  assert.equal(honest, true, "wall-clock divergence must surface (capped) on the HUD");
});

test("honestCapped: current frame pressure keeps the (capped) label", () => {
  // workFrameMs > 45 (or simCpuFrameMs > 22, or renderCpuMs > 24) — the
  // current frame visibly stuttered. HUD should reflect that.
  const honest = computeHonestCapped({
    capActive: true,
    effectiveMaxSteps: 12,
    maxSimulationStepsPerFrame: 12,
    diverged: false,
    currentFramePressure: true,
  });
  assert.equal(honest, true, "current frame pressure must surface (capped) on the HUD");
});

test("honestCapped: capActive false short-circuits to false", () => {
  // Sanity: when the broad signal is off, honest is also off regardless of
  // the other inputs. Defends against a future refactor that forgets the
  // capActive guard.
  const honest = computeHonestCapped({
    capActive: false,
    effectiveMaxSteps: 6,
    maxSimulationStepsPerFrame: 12,
    diverged: true,
    currentFramePressure: true,
  });
  assert.equal(honest, false, "honest must be false when capActive is false");
});
