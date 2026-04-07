import { describe, it, test } from "node:test";
import assert from "node:assert/strict";
import {
  computeTaskScore,
  computeCostMetrics,
  computeDecisionQuality,
} from "../src/benchmark/BenchmarkMetrics.js";

describe("computeTaskScore", () => {
  it("returns all fields as numbers in [0,1] with realistic colony data", () => {
    const samples = [
      { t: 0, food: 100, wood: 80, workers: 10, prosperity: 60, threat: 20 },
      { t: 10, food: 120, wood: 90, workers: 12, prosperity: 65, threat: 15 },
      { t: 20, food: 110, wood: 85, workers: 11, prosperity: 70, threat: 10 },
      { t: 30, food: 130, wood: 95, workers: 13, prosperity: 75, threat: 5 },
      { t: 40, food: 140, wood: 100, workers: 14, prosperity: 80, threat: 8 },
    ];
    const config = {
      totalObjectives: 10,
      completedObjectives: 7,
      survivalSec: 300,
      maxSurvivalSec: 600,
      initialWorkers: 10,
      deathsTotal: 2,
    };

    const result = computeTaskScore(samples, config);

    const fields = [
      "T_surv",
      "T_obj",
      "T_res",
      "T_pop",
      "T_pros",
      "T_threat",
      "T_composite",
    ];
    for (const f of fields) {
      assert.equal(typeof result[f], "number", `${f} should be a number`);
      assert.ok(result[f] >= 0 && result[f] <= 1, `${f}=${result[f]} should be in [0,1]`);
    }

    // Verify T_obj = completedObjectives / totalObjectives
    assert.equal(result.T_obj, 7 / 10);
  });

  it("does not throw on empty samples array", () => {
    const samples = [];
    const config = {
      totalObjectives: 5,
      completedObjectives: 3,
      survivalSec: 100,
      maxSurvivalSec: 200,
      initialWorkers: 10,
      deathsTotal: 1,
    };

    // Should not throw
    const result = computeTaskScore(samples, config);

    assert.equal(typeof result.T_surv, "number");
    assert.equal(typeof result.T_composite, "number");
  });

  it("handles zero maxSurvivalSec and zero initialWorkers without dividing by zero", () => {
    const samples = [
      { t: 0, food: 50, wood: 50, workers: 5, prosperity: 50, threat: 50 },
    ];
    const config = {
      totalObjectives: 0,
      completedObjectives: 0,
      survivalSec: 0,
      maxSurvivalSec: 0,
      initialWorkers: 0,
      deathsTotal: 0,
    };

    // Should not throw
    const result = computeTaskScore(samples, config);

    assert.equal(typeof result.T_surv, "number");
    assert.ok(Number.isFinite(result.T_surv), "T_surv must be finite");
    assert.ok(Number.isFinite(result.T_pop), "T_pop must be finite");
    assert.ok(Number.isFinite(result.T_obj), "T_obj must be finite");
    assert.ok(Number.isFinite(result.T_composite), "T_composite must be finite");
  });
});

describe("computeCostMetrics", () => {
  it("correctly computes counts and ratios with mixed llm/fallback decisions", () => {
    const decisions = [
      { t: 0, source: "llm", tokens: 500, latencyMs: 1200 },
      { t: 5, source: "llm", tokens: 600, latencyMs: 1500 },
      { t: 10, source: "fallback", tokens: 0, latencyMs: 50 },
      { t: 15, source: "llm", tokens: 450, latencyMs: 1100 },
      { t: 20, source: "fallback", tokens: 0, latencyMs: 30 },
    ];
    const gameDurationMin = 10;
    const costPerToken = 0.00003;

    const result = computeCostMetrics(decisions, gameDurationMin, costPerToken);

    assert.equal(result.totalDecisions, 5);
    assert.equal(result.llmDecisions, 3);
    assert.equal(result.fallbackDecisions, 2);
    assert.equal(result.totalTokens, 1550);
    // C_tok = totalTokens / llmDecisions = 1550 / 3
    assert.ok(Math.abs(result.C_tok - 1550 / 3) < 1e-9);
    // C_min = (totalTokens * costPerToken) / gameDurationMin = (1550 * 0.00003) / 10
    assert.ok(Math.abs(result.C_min - (1550 * 0.00003) / 10) < 1e-9);
    // C_lat = avgLatency / 20000; avgLatency = (1200+1500+50+1100+30)/5 = 776
    assert.ok(Math.abs(result.C_lat - 776 / 20000) < 1e-9);
    // C_fb = fallbackDecisions / totalDecisions = 2/5
    assert.equal(result.C_fb, 2 / 5);
  });
});

test("computeCostMetrics handles empty decisions array", () => {
  const result = computeCostMetrics([], 5, 0.00001);
  assert.equal(result.totalDecisions, 0);
  assert.equal(result.llmDecisions, 0);
  assert.equal(result.C_tok, 0);
  assert.equal(result.C_min, 0);
  assert.equal(result.C_fb, 0);
});

test("computeCostMetrics handles all-fallback decisions", () => {
  const decisions = [
    { t: 18, source: "fallback", tokens: 0, latencyMs: 0 },
    { t: 36, source: "fallback", tokens: 0, latencyMs: 0 },
  ];
  const result = computeCostMetrics(decisions, 1, 0.00001);
  assert.equal(result.totalDecisions, 2);
  assert.equal(result.llmDecisions, 0);
  assert.equal(result.fallbackDecisions, 2);
  assert.equal(result.C_tok, 0);
  assert.equal(result.C_fb, 1);
});

describe("computeDecisionQuality", () => {
  it("computes D_hall and D_adapt correctly from guardrail log", () => {
    const guardrailLog = [
      { totalValues: 10, clampedValues: 2 },
      { totalValues: 20, clampedValues: 5 },
      { totalValues: 15, clampedValues: 0 },
    ];
    const crisisEvents = 4;
    const crisisResponses = 3;

    const result = computeDecisionQuality(guardrailLog, crisisEvents, crisisResponses);

    // D_hall = sum(clampedValues) / sum(totalValues) = 7 / 45
    assert.ok(Math.abs(result.D_hall - 7 / 45) < 1e-9);
    // D_adapt = crisisResponses / crisisEvents = 3 / 4
    assert.equal(result.D_adapt, 3 / 4);
  });

  it("returns D_adapt=1 when there are no crisis events", () => {
    const guardrailLog = [
      { totalValues: 10, clampedValues: 1 },
    ];

    const result = computeDecisionQuality(guardrailLog, 0, 0);

    assert.equal(result.D_adapt, 1);
  });
});
