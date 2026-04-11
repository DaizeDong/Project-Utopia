import { describe, it, test } from "node:test";
import assert from "node:assert/strict";

// ── ScenarioSampler tests ─────────────────────────────────────────

import {
  generateScenarios,
  computeDifficulty,
  scenarioToPreset,
  EDGE_CASES,
} from "../src/benchmark/framework/ScenarioSampler.js";

describe("ScenarioSampler", () => {
  it("generateScenarios returns at least requested count", () => {
    const scenarios = generateScenarios(10, 42);
    assert.ok(scenarios.length >= 10, `expected >= 10, got ${scenarios.length}`);
  });

  it("generateScenarios covers all difficulty bins", () => {
    const scenarios = generateScenarios(25, 42);
    const bins = new Set(scenarios.map((s) => s.bin));
    assert.ok(bins.has("trivial"), "should have trivial bin");
    assert.ok(bins.has("easy"), "should have easy bin");
    assert.ok(bins.has("medium"), "should have medium bin");
    assert.ok(bins.has("hard"), "should have hard bin");
    assert.ok(bins.has("extreme"), "should have extreme bin");
  });

  it("generateScenarios is deterministic with same seed", () => {
    const a = generateScenarios(5, 999);
    const b = generateScenarios(5, 999);
    assert.equal(a.length, b.length);
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      assert.equal(a[i].difficulty, b[i].difficulty);
      assert.equal(a[i].bin, b[i].bin);
    }
  });

  it("generateScenarios produces different results with different seeds", () => {
    const a = generateScenarios(5, 100);
    const b = generateScenarios(5, 200);
    const diffs = a.filter((_, i) => a[i].difficulty !== b[i].difficulty);
    assert.ok(diffs.length > 0, "different seeds should produce different scenarios");
  });

  it("computeDifficulty returns value in [0,1]", () => {
    const easy = { food: 150, wood: 100, threat: 0, workerDelta: 5, weather: "clear" };
    const hard = { food: 5, wood: 3, threat: 90, workerDelta: -8, weather: "storm" };
    const dEasy = computeDifficulty(easy);
    const dHard = computeDifficulty(hard);
    assert.ok(dEasy >= 0 && dEasy <= 1);
    assert.ok(dHard >= 0 && dHard <= 1);
    assert.ok(dHard > dEasy, "hard scenario should have higher difficulty");
  });

  it("scenarioToPreset produces valid preset object", () => {
    const scenario = {
      templateId: "temperate_plains",
      seed: 42,
      food: 50,
      wood: 40,
      stone: 10,
      herbs: 5,
      workerDelta: 3,
      threat: 30,
      predators: 2,
      weather: "storm",
      weatherDuration: 20,
    };
    const preset = scenarioToPreset(scenario);
    assert.equal(preset.templateId, "temperate_plains");
    assert.equal(preset.resources.food, 50);
    assert.equal(preset.extraWorkers, 3);
    assert.equal(preset.extraPredators, 2);
    assert.equal(preset.weather, "storm");
    assert.equal(preset.threat, 30);
  });

  it("scenarioToPreset handles negative workerDelta as removeWorkers", () => {
    const scenario = { food: 50, wood: 40, stone: 0, herbs: 0, workerDelta: -5, threat: 0, weather: "clear" };
    const preset = scenarioToPreset(scenario);
    assert.equal(preset.removeWorkers, 5);
    assert.equal(preset.extraWorkers, undefined);
  });

  it("EDGE_CASES has 5 entries with required fields", () => {
    assert.equal(EDGE_CASES.length, 5);
    for (const e of EDGE_CASES) {
      assert.ok(e.id);
      assert.ok(e.templateId);
      assert.ok(e.resources);
    }
  });
});

// ── ScoringEngine tests ───────────────────────────────────────────

import {
  bayesianScore,
  relativeScore,
  consistencyAdjustedScore,
  cohenD,
  bayesFactor,
  compareGroups,
} from "../src/benchmark/framework/ScoringEngine.js";

describe("ScoringEngine", () => {
  it("bayesianScore returns valid stats for sample scores", () => {
    const scores = [0.7, 0.8, 0.75, 0.85, 0.9];
    const result = bayesianScore(scores);
    assert.ok(result.mean > 0.5 && result.mean < 1.0);
    assert.ok(result.std > 0 && result.std < 0.5);
    assert.ok(result.ci95[0] < result.mean);
    assert.ok(result.ci95[1] > result.mean);
    assert.ok(result.p5 < result.p95);
    assert.ok(result.posterior.alpha > 2);
  });

  it("bayesianScore handles empty array", () => {
    const result = bayesianScore([]);
    assert.equal(result.mean, 0.5);
    assert.equal(result.posterior.alpha, 2);
    assert.equal(result.posterior.beta, 2);
  });

  it("bayesianScore with all-1.0 scores has high mean", () => {
    const result = bayesianScore([1, 1, 1, 1, 1]);
    // Beta(2+5, 2+0) = Beta(7,2), mean = 7/9 ≈ 0.778
    assert.ok(result.mean > 0.7, `expected mean > 0.7, got ${result.mean}`);
    assert.ok(result.ci95[0] > 0.4);
  });

  it("relativeScore returns 0 for baseline-level agent", () => {
    assert.equal(relativeScore(0.3, 0.3, 0.9), 0);
  });

  it("relativeScore returns 1 for ceiling-level agent", () => {
    assert.equal(relativeScore(0.9, 0.3, 0.9), 1);
  });

  it("relativeScore clamps to [0,1]", () => {
    assert.equal(relativeScore(0.1, 0.3, 0.9), 0);
    assert.equal(relativeScore(1.5, 0.3, 0.9), 1);
  });

  it("consistencyAdjustedScore penalizes high variance", () => {
    const consistent = [0.8, 0.82, 0.78, 0.81];
    const inconsistent = [0.2, 0.9, 0.3, 1.0];
    const cScore = consistencyAdjustedScore(consistent);
    const iScore = consistencyAdjustedScore(inconsistent);
    assert.ok(cScore > iScore, "consistent scores should rank higher");
  });

  it("cohenD returns positive when A > B", () => {
    const a = [0.8, 0.85, 0.9];
    const b = [0.3, 0.35, 0.4];
    assert.ok(cohenD(a, b) > 0);
  });

  it("cohenD returns 0 for identical groups", () => {
    const a = [0.5, 0.5, 0.5];
    assert.equal(cohenD(a, a), 0);
  });

  it("compareGroups returns CONFIRMED_IMPROVEMENT for large effect", () => {
    const treatment = [0.9, 0.85, 0.88, 0.92, 0.87, 0.91, 0.89, 0.86];
    const control = [0.3, 0.35, 0.32, 0.28, 0.31, 0.33, 0.29, 0.34];
    const result = compareGroups(treatment, control);
    assert.ok(result.deltaMean > 0.4);
    assert.ok(result.cohenD > 1.0);
    assert.equal(result.verdict, "CONFIRMED_IMPROVEMENT");
  });

  it("compareGroups returns NO_EFFECT or AMBIGUOUS for similar groups", () => {
    const a = [0.5, 0.52, 0.48, 0.51, 0.49];
    const b = [0.5, 0.48, 0.52, 0.49, 0.51];
    const result = compareGroups(a, b);
    assert.ok(result.verdict === "NO_EFFECT" || result.verdict === "AMBIGUOUS");
  });
});

// ── DecisionTracer tests ──────────────────────────────────────────

import { DecisionTracer } from "../src/benchmark/framework/DecisionTracer.js";

describe("DecisionTracer", () => {
  it("records traces and counts events", () => {
    const tracer = new DecisionTracer();
    tracer.record(10, "perceiver", { state: "ok" }, { economy: { food: { stock: 50 } } });
    tracer.record(10, "planner", { obs: {} }, { steps: [{ type: "farm" }] });
    tracer.recordNegativeEvent(20, "resource_depletion", {});
    const analysis = tracer.analyzeAll();
    assert.equal(analysis.totalEvents, 1);
  });

  it("attributes to perceiver when signal is missing", () => {
    const tracer = new DecisionTracer();
    tracer.record(5, "perceiver", {}, { economy: { food: { stock: 100 } } });
    tracer.record(5, "planner", {}, { steps: [] });
    tracer.recordNegativeEvent(10, "resource_depletion", {});
    const analysis = tracer.analyzeAll();
    assert.equal(analysis.attributions[0].attribution.attributedPhase, "perceiver");
  });

  it("attributes to planner when signal exists but plan ignores it", () => {
    const tracer = new DecisionTracer();
    tracer.record(5, "perceiver", {}, { economy: { food: { stock: 3, projectedZeroSec: 10 } } });
    tracer.record(5, "planner", {}, { steps: [{ type: "road" }] }); // builds road instead of farm
    tracer.recordNegativeEvent(10, "resource_depletion", {});
    const analysis = tracer.analyzeAll();
    assert.equal(analysis.attributions[0].attribution.attributedPhase, "planner");
  });

  it("reset clears all state", () => {
    const tracer = new DecisionTracer();
    tracer.record(1, "perceiver", {}, {});
    tracer.recordNegativeEvent(2, "population_decline", {});
    tracer.reset();
    const analysis = tracer.analyzeAll();
    assert.equal(analysis.totalEvents, 0);
  });

  it("faultDistribution sums to ~100", () => {
    const tracer = new DecisionTracer();
    tracer.record(1, "perceiver", {}, { economy: { food: { stock: 100 } } });
    tracer.record(1, "planner", {}, { steps: [] });
    tracer.recordNegativeEvent(5, "resource_depletion", {});
    tracer.recordNegativeEvent(10, "population_decline", {});
    const analysis = tracer.analyzeAll();
    const total = Object.values(analysis.faultDistribution).reduce((a, b) => a + b, 0);
    assert.ok(total >= 95 && total <= 105, `fault distribution should sum to ~100, got ${total}`);
  });

  it("analyzeAll is idempotent (no double-counting on repeated calls)", () => {
    const tracer = new DecisionTracer();
    tracer.record(1, "perceiver", {}, { economy: { food: { stock: 100 } } });
    tracer.record(1, "planner", {}, { steps: [] });
    tracer.recordNegativeEvent(5, "resource_depletion", {});
    const first = tracer.analyzeAll();
    const second = tracer.analyzeAll();
    assert.deepEqual(first.faultDistribution, second.faultDistribution, "repeated analyzeAll should return identical fault distribution");
    assert.equal(first.attributions.length, second.attributions.length);
  });
});

// ── CrisisInjector tests ──────────────────────────────────────────

import { CrisisInjector, CRISIS_TYPES } from "../src/benchmark/framework/CrisisInjector.js";

describe("CrisisInjector", () => {
  it("CRISIS_TYPES has 4 crisis types", () => {
    assert.equal(Object.keys(CRISIS_TYPES).length, 4);
    assert.ok(CRISIS_TYPES.drought);
    assert.ok(CRISIS_TYPES.predator_surge);
    assert.ok(CRISIS_TYPES.resource_crash);
    assert.ok(CRISIS_TYPES.epidemic);
  });

  it("scoreInjection returns scores in [0,1]", () => {
    const injector = new CrisisInjector();
    const injection = {
      type: "drought",
      injectedAtTick: 100,
      baseline: { composite: 0.7 },
      detected: true,
      detectionLag: 5,
      recoveryTicks: 50,
      minHealth: 0.4,
    };
    const scores = injector.scoreInjection(injection);
    assert.ok(scores.detectionScore >= 0 && scores.detectionScore <= 1);
    assert.ok(scores.recoveryScore >= 0 && scores.recoveryScore <= 1);
    assert.ok(scores.resilienceScore >= 0 && scores.resilienceScore <= 1);
    assert.ok(scores.composite >= 0 && scores.composite <= 1);
  });

  it("scoreInjection rewards fast detection", () => {
    const injector = new CrisisInjector();
    const fast = injector.scoreInjection({ detectionLag: 2, recoveryTicks: 100, baseline: { composite: 0.7 }, minHealth: 0.5 });
    const slow = injector.scoreInjection({ detectionLag: 80, recoveryTicks: 100, baseline: { composite: 0.7 }, minHealth: 0.5 });
    assert.ok(fast.detectionScore > slow.detectionScore);
  });

  it("resource_crash crisis sets food and wood to 10%", () => {
    const state = { resources: { food: 100, wood: 80 } };
    CRISIS_TYPES.resource_crash.apply(state);
    assert.ok(state.resources.food <= 10);
    assert.ok(state.resources.wood <= 8);
  });

  it("drought crisis sets weather", () => {
    const state = { weather: { current: "clear", timeLeftSec: 0 } };
    CRISIS_TYPES.drought.apply(state);
    assert.equal(state.weather.current, "drought");
    assert.equal(state.weather.timeLeftSec, 60);
  });
});

// ── DimensionPlugin tests ─────────────────────────────────────────

import { validatePlugin } from "../src/benchmark/framework/DimensionPlugin.js";

describe("DimensionPlugin", () => {
  it("validates a correct plugin", () => {
    const plugin = {
      id: "test",
      label: "Test Plugin",
      scoreDimensions: ["quality"],
      collectSamples: () => [],
      selfScore: () => ({ quality: 8 }),
    };
    assert.doesNotThrow(() => validatePlugin(plugin));
  });

  it("rejects plugin missing id", () => {
    const plugin = { label: "X", scoreDimensions: ["a"], collectSamples: () => [], selfScore: () => ({}) };
    assert.throws(() => validatePlugin(plugin), /missing required field: id/);
  });

  it("rejects plugin with empty scoreDimensions", () => {
    const plugin = { id: "x", label: "X", scoreDimensions: [], collectSamples: () => [], selfScore: () => ({}) };
    assert.throws(() => validatePlugin(plugin), /non-empty array/);
  });

  it("rejects plugin with non-function collectSamples", () => {
    const plugin = { id: "x", label: "X", scoreDimensions: ["a"], collectSamples: "not a fn", selfScore: () => ({}) };
    assert.throws(() => validatePlugin(plugin), /must be a function/);
  });
});

// ── BenchmarkMetrics T_composite weight fix ───────────────────────

import { computeTaskScore } from "../src/benchmark/BenchmarkMetrics.js";

test("T_composite weights sum to 1.0 (no duplicate T_surv)", () => {
  // With perfect scores, T_composite should equal 1.0
  const samples = [
    { t: 0, food: 50, wood: 50, workers: 10, prosperity: 100, threat: 0 },
    { t: 10, food: 50, wood: 50, workers: 10, prosperity: 100, threat: 0 },
  ];
  const config = {
    totalObjectives: 3,
    completedObjectives: 3,
    survivalSec: 300,
    maxSurvivalSec: 300,
    initialWorkers: 10,
    deathsTotal: 0,
  };
  const result = computeTaskScore(samples, config);
  // T_surv=1, T_obj=1, T_res=1 (no variation), T_pop=1, T_pros=1, T_threat=1
  // 0.20*1 + 0.25*1 + 0.15*1 + 0.15*1 + 0.15*1 + 0.10*1 = 1.00
  assert.ok(
    Math.abs(result.T_composite - 1.0) < 0.01,
    `T_composite should be ~1.0 with perfect scores, got ${result.T_composite}`,
  );
});
