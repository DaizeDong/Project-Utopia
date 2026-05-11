// HELM Mean Win Rate — paper §4.4b (Layer 4b), per ScoringEngine.computeHelmMwr.
//
// Coverage:
//   1. 2-agent symmetric: A wins all dims → A.mwr = 1, B.mwr = 0.
//   2. 3-agent asymmetric: rock-paper-scissor structure, all three MWR == 0.5.
//   3. Missing-dimension handling: pair-joint dims only; absent dims skipped.
//   4. Tie handling: strict `>` means equal scores contribute 0 to winner.
//   5. Single-agent and empty inputs degrade gracefully.

import test from "node:test";
import assert from "node:assert/strict";

import { computeHelmMwr } from "../src/benchmark/framework/ScoringEngine.js";

test("HELM MWR — 2-agent symmetric: dominant agent has MWR 1, dominated 0", () => {
  const scores = {
    alpha: { rae: 0.9, mem: 0.8, dte: 0.7 },
    beta:  { rae: 0.4, mem: 0.3, dte: 0.2 },
  };
  const mwr = computeHelmMwr(scores);
  // alpha beats beta on all 3 dims → win rate 3/3 = 1; one opponent → MWR 1.
  assert.equal(mwr.alpha, 1);
  // beta beats alpha on 0/3 dims → win rate 0; one opponent → MWR 0.
  assert.equal(mwr.beta, 0);
});

test("HELM MWR — 3-agent rock-paper-scissor: all three MWR == 0.5", () => {
  // A beats B on dim1; B beats C on dim2; C beats A on dim3.
  // A beats C on dim1+dim2 (only one needed?), but to keep it strict RPS:
  // Construct so every pair: each agent wins exactly half the dims.
  // Setup: 2 dims per pair, one win each, so per-pair win rate = 0.5 → MWR 0.5.
  const scores = {
    A: { d1: 1.0, d2: 0.0, d3: 1.0, d4: 0.0, d5: 0.0, d6: 1.0 },
    B: { d1: 0.0, d2: 1.0, d3: 0.0, d4: 1.0, d5: 1.0, d6: 0.0 },
    C: { d1: 0.5, d2: 0.5, d3: 0.5, d4: 0.5, d5: 0.5, d6: 0.5 },
  };
  // A vs B: A wins d1,d3,d6; B wins d2,d4,d5 → 3/6 = 0.5
  // A vs C: A wins d1,d3,d6 (1.0>0.5); C wins d2,d4,d5 (0.5>0.0) → 3/6 = 0.5
  // B vs C: B wins d2,d4,d5 (1.0>0.5); C wins d1,d3,d6 (0.5>0.0) → 3/6 = 0.5
  // Expected MWR for each: mean of two 0.5 pair win rates = 0.5.
  const mwr = computeHelmMwr(scores);
  assert.equal(mwr.A, 0.5);
  assert.equal(mwr.B, 0.5);
  assert.equal(mwr.C, 0.5);
});

test("HELM MWR — missing dim only counted on pairs that share it", () => {
  // alpha and beta share rae+mem; alpha has dte but beta doesn't.
  // gamma has only rae.
  const scores = {
    alpha: { rae: 0.9, mem: 0.8, dte: 0.5 },
    beta:  { rae: 0.4, mem: 0.7 },          // missing dte
    gamma: { rae: 0.5 },                     // only rae
  };
  const mwr = computeHelmMwr(scores);
  // alpha vs beta: joint = {rae,mem}; alpha wins both → 2/2 = 1
  // alpha vs gamma: joint = {rae}; alpha wins → 1/1 = 1
  // alpha MWR = mean(1, 1) = 1
  assert.equal(mwr.alpha, 1);
  // beta vs alpha: joint = {rae,mem}; beta wins 0/2 = 0
  // beta vs gamma: joint = {rae}; beta(0.4) < gamma(0.5) → 0/1 = 0
  // beta MWR = 0
  assert.equal(mwr.beta, 0);
  // gamma vs alpha: joint = {rae}; gamma(0.5)<alpha(0.9) → 0/1 = 0
  // gamma vs beta: joint = {rae}; gamma(0.5)>beta(0.4) → 1/1 = 1
  // gamma MWR = mean(0, 1) = 0.5
  assert.equal(mwr.gamma, 0.5);
});

test("HELM MWR — strict `>` means ties don't count as wins for either side", () => {
  const scores = {
    alpha: { d1: 0.5, d2: 0.5 },
    beta:  { d1: 0.5, d2: 0.5 },
  };
  const mwr = computeHelmMwr(scores);
  // No strict wins on either side → both 0.
  assert.equal(mwr.alpha, 0);
  assert.equal(mwr.beta, 0);
});

test("HELM MWR — single agent returns 0 (no opponents)", () => {
  const mwr = computeHelmMwr({ alpha: { rae: 0.9 } });
  assert.equal(mwr.alpha, 0);
});

test("HELM MWR — empty input returns empty object", () => {
  assert.deepEqual(computeHelmMwr({}), {});
  assert.deepEqual(computeHelmMwr(null), {});
  assert.deepEqual(computeHelmMwr(undefined), {});
});

test("HELM MWR — pair with zero shared dims contributes 0 (does not crash)", () => {
  const scores = {
    alpha: { d1: 0.9 },
    beta:  { d2: 0.9 },                       // no shared dim with alpha
    gamma: { d1: 0.5, d2: 0.5 },              // shares with both
  };
  const mwr = computeHelmMwr(scores);
  // alpha vs beta: 0 shared → contributes 0
  // alpha vs gamma: shares d1; alpha(0.9)>gamma(0.5) → 1
  // alpha MWR = mean(0, 1) = 0.5
  assert.equal(mwr.alpha, 0.5);
  // beta vs alpha: 0 shared → 0
  // beta vs gamma: shares d2; beta(0.9)>gamma(0.5) → 1
  // beta MWR = mean(0, 1) = 0.5
  assert.equal(mwr.beta, 0.5);
  // gamma vs alpha: shares d1; gamma(0.5)<alpha(0.9) → 0
  // gamma vs beta: shares d2; gamma(0.5)<beta(0.9) → 0
  // gamma MWR = 0
  assert.equal(mwr.gamma, 0);
});
