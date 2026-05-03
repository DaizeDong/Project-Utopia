// v0.8.2 Round-6 Wave-1 01b-playability (Step 8 + Step 9) coverage.
//
// Plan 01b §4 Step 8 envisaged a *new* `SurvivalScoreSystem.js` file. The
// repository already ships the equivalent contract via
// `updateSurvivalScore` exported from `ProgressionSystem.js` (introduced in
// v0.8.0 Phase 4). Step 8 is therefore DONE-by-existing-code; this test
// exercises that existing contract end-to-end so a future regression on
// per-second accrual / per-birth bonus / per-death penalty is caught.
//
// Per plan §6 acceptance:
//   - 60 simSec → score is monotonically increasing
//   - simulating a birth (metrics.birthsTotal += 1) → +BALANCE.survivalScorePerBirth
//   - simulating a death (metrics.deathsTotal += 1) → -BALANCE.survivalScorePenaltyPerDeath
//   - deaths alone do not drive the score below the realistic floor (0)
//     when accrual covers the same window

import test from "node:test";
import assert from "node:assert/strict";

import { updateSurvivalScore } from "../src/simulation/meta/ProgressionSystem.js";
import { BALANCE } from "../src/config/balance.js";

function freshState() {
  return {
    metrics: {
      survivalScore: 0,
      timeSec: 0,
      birthsTotal: 0,
      deathsTotal: 0,
      survivalLastBirthsSeen: 0,
      survivalLastDeathsSeen: 0,
      // PS-late-game-stall (R8): workerScale clamps perSec accrual by
      // min(workers/4, 1). Tests of full per-second accrual keep workers >= 4
      // to exercise the unscaled (workerScale=1) path; a separate test in
      // ps-r8-late-game-stall.test.js asserts the workers=0 zero-accrual path.
      populationStats: { workers: 4 },
    },
  };
}

test("60 simSec of pure survival accrues +60 × perSec, monotone", () => {
  const state = freshState();
  let prev = state.metrics.survivalScore;
  for (let i = 0; i < 60; i += 1) {
    updateSurvivalScore(state, 1);
    assert.ok(
      state.metrics.survivalScore >= prev,
      `score must be monotone — went ${prev}→${state.metrics.survivalScore} at tick ${i}`,
    );
    prev = state.metrics.survivalScore;
  }
  const expected = BALANCE.survivalScorePerSecond * 60;
  assert.equal(state.metrics.survivalScore, expected);
});

test("birth diff applies +BALANCE.survivalScorePerBirth exactly once", () => {
  const state = freshState();
  state.metrics.birthsTotal = 1;
  updateSurvivalScore(state, 0);
  assert.equal(state.metrics.survivalScore, BALANCE.survivalScorePerBirth);
  // Second invocation with no further births must not double-pay.
  updateSurvivalScore(state, 0);
  assert.equal(state.metrics.survivalScore, BALANCE.survivalScorePerBirth);
});

test("death diff applies -BALANCE.survivalScorePenaltyPerDeath exactly once", () => {
  const state = freshState();
  // Pre-roll some accrual so we can verify the score drops by the penalty.
  updateSurvivalScore(state, 30);
  const baseline = state.metrics.survivalScore;
  state.metrics.deathsTotal = 1;
  updateSurvivalScore(state, 0);
  assert.equal(
    state.metrics.survivalScore,
    baseline - BALANCE.survivalScorePenaltyPerDeath,
  );
  // Idempotent on a stable deathsTotal.
  updateSurvivalScore(state, 0);
  assert.equal(
    state.metrics.survivalScore,
    baseline - BALANCE.survivalScorePenaltyPerDeath,
  );
});

test("deaths do not arithmetically pin the score below realistic floor when accrual matches", () => {
  const state = freshState();
  // 30 sec accrual, then 1 death — net should remain non-negative for default balance.
  updateSurvivalScore(state, 30);
  state.metrics.deathsTotal = 1;
  updateSurvivalScore(state, 0);
  // perSec=1, perDeath=10, so 30 - 10 = 20 (default balance). Just a smoke
  // check that long survival outpaces a single death.
  assert.ok(
    state.metrics.survivalScore >= 0,
    `expected non-negative score, got ${state.metrics.survivalScore}`,
  );
});
