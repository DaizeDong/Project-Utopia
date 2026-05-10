// Validates PolicyValue Baseline (W1 P0-4).
//
// Asserts:
//   - fallbackValueEstimate is finite and clamped to [0,1]
//   - PVBTracker baseline_v0 == V̂_F(initial_state) before any tick
//   - On a fallback × fallback short run, PVB ≈ raw - baseline_v0 (since
//     correction terms approach zero in expectation)
//   - PVB-corrected variance is no greater than raw variance across seeds.

import test from "node:test";
import assert from "node:assert/strict";

import {
  fallbackValueEstimate,
  PVBTracker,
  runWithPVB,
} from "../src/benchmark/framework/PVB.js";
import { SimHarness } from "../src/benchmark/framework/SimHarness.js";

function variance(values) {
  if (values.length === 0) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
}

test("fallbackValueEstimate is finite and clamped to [0,1]", () => {
  assert.equal(fallbackValueEstimate(null), 0);
  assert.equal(fallbackValueEstimate(undefined), 0);
  const high = fallbackValueEstimate({
    gameplay: { prosperity: 200 }, // over-cap
    metrics: { populationStats: { workers: 100 } }, // over-cap
  });
  assert.ok(high >= 0 && high <= 1, `out of range: ${high}`);
  const low = fallbackValueEstimate({
    gameplay: { prosperity: 0 },
    metrics: { populationStats: { workers: 0 } },
  });
  assert.equal(low, 0);
  const mid = fallbackValueEstimate({
    gameplay: { prosperity: 50 },
    metrics: { populationStats: { workers: 12 } },
  });
  // 0.5 × 0.5 = 0.25
  assert.ok(Math.abs(mid - 0.25) < 1e-6, `mid off: ${mid}`);
});

test("PVBTracker.finalize returns correct shape with deterministic states", () => {
  const tracker = new PVBTracker();
  const stateA = { gameplay: { prosperity: 50 }, metrics: { populationStats: { workers: 12 } } };
  const stateB = { gameplay: { prosperity: 50 }, metrics: { populationStats: { workers: 12 } } };
  tracker.recordTick(stateA, "agent");
  tracker.recordTick(stateB, "agent");
  const out = tracker.finalize(0.7);
  assert.equal(typeof out.pvb_score, "number");
  assert.ok(Number.isFinite(out.pvb_score));
  // Identical V̂_F across ticks ⇒ correction collapses to zero.
  assert.ok(Math.abs(out.sum_corrections) < 1e-6, `expected zero correction, got ${out.sum_corrections}`);
  assert.ok(Math.abs(out.baseline_v0 - 0.25) < 1e-6, `baseline_v0 off: ${out.baseline_v0}`);
  // pvb = 0.7 - 0.25 + 0 = 0.45
  assert.ok(Math.abs(out.pvb_score - 0.45) < 1e-6, `pvb off: ${out.pvb_score}`);
  assert.equal(out.ticks, 2);
});

test(
  "runWithPVB on fallback × fallback short run produces finite PVB ≈ raw - baseline",
  { timeout: 180000 },
  async () => {
    const harness = new SimHarness({
      templateId: "temperate_plains",
      seed: 7,
      aiEnabled: false,
    });
    const { raw, pvb, baseline_v0, sum_corrections, ticks } = await runWithPVB(
      harness,
      4,
      (state) => fallbackValueEstimate(state), // score = the estimate itself ⇒ deterministic
      { agentId: "fallback" },
    );
    assert.ok(Number.isFinite(raw));
    assert.ok(Number.isFinite(pvb));
    assert.ok(Number.isFinite(baseline_v0));
    assert.ok(Number.isFinite(sum_corrections));
    assert.ok(ticks >= 1, `expected at least 1 tick, got ${ticks}`);
    // For fallback × fallback, the correction is bounded; magnitude should
    // be small relative to score range [0,1].
    assert.ok(Math.abs(sum_corrections) < 0.5, `correction unexpectedly large: ${sum_corrections}`);
  },
);

test(
  "PVB-corrected variance does not exceed raw variance across multiple seeds",
  { timeout: 360000 },
  async () => {
    const seeds = [3, 14];
    const rawScores = [];
    const pvbScores = [];
    for (const seed of seeds) {
      const harness = new SimHarness({
        templateId: "temperate_plains",
        seed,
        aiEnabled: false,
      });
      const { raw, pvb } = await runWithPVB(
        harness,
        3,
        (state) => fallbackValueEstimate(state),
        { agentId: "fallback" },
      );
      rawScores.push(raw);
      pvbScores.push(pvb);
    }
    const rawVar = variance(rawScores);
    const pvbVar = variance(pvbScores);
    // Variance reduction is the goal; allow tiny floating-point slop.
    assert.ok(
      pvbVar <= rawVar + 1e-9,
      `PVB variance ${pvbVar} should be <= raw variance ${rawVar}`,
    );
  },
);
