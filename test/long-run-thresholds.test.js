import test from "node:test";
import assert from "node:assert/strict";

import {
  createLongRunEvaluationState,
  evaluateLongRunSample,
  finalizeLongRunSamples,
} from "../src/longrun/thresholdEvaluator.js";

function createSample(overrides = {}) {
  return {
    phase: "active",
    tick: 10,
    simTimeSec: 12,
    nonFiniteMetrics: [],
    warnings: { errorCount: 0 },
    gameplay: { threat: 30 },
    logistics: {
      summary: "Logistics: healthy",
      avgDepotDistance: 4,
      isolatedWorksites: 0,
      stretchedWorksites: 0,
      strandedCarryWorkers: 0,
    },
    world: {
      frontier: { connectedRoutes: 1, readyDepots: 1 },
      weather: { hazardFrontCount: 0 },
      spatialPressure: {
        activeEventCount: 0,
        weatherPressure: 0.2,
        eventPressure: 0.3,
        contestedZones: 0,
      },
    },
    ecology: { maxFarmPressure: 0.3 },
    performance: { fps: 58, frameMs: 16.5 },
    ai: {
      coverageTarget: "fallback",
      requestCount: 0,
      fallbackCount: 0,
      timeoutCount: 0,
      consecutiveFallbackResponses: 0,
      maxUnrecoveredFallbackSec: 0,
    },
    ...overrides,
  };
}

test("threshold evaluator flags an early phase end", () => {
  const result = evaluateLongRunSample({
    currentSample: createSample({ phase: "end" }),
    evaluationState: createLongRunEvaluationState(),
    elapsedWallSec: 120,
    runKind: "idle",
  });
  assert.equal(result.failures.some((failure) => failure.kind === "phase_end"), true);
});

test("threshold evaluator flags live AI outage churn", () => {
  const result = evaluateLongRunSample({
    currentSample: createSample({
      ai: {
        coverageTarget: "llm",
        requestCount: 10,
        fallbackCount: 6,
        timeoutCount: 9,
        consecutiveFallbackResponses: 4,
        maxUnrecoveredFallbackSec: 120,
      },
    }),
    evaluationState: createLongRunEvaluationState(),
    elapsedWallSec: 180,
    runKind: "idle",
  });
  assert.equal(result.failures.some((failure) => failure.kind === "ai_outage"), true);
});

test("threshold evaluator respects idle logistics grace before hard failures", () => {
  const early = evaluateLongRunSample({
    currentSample: createSample({
      logistics: {
        summary: "Logistics: stressed",
        avgDepotDistance: 24,
        isolatedWorksites: 4,
        stretchedWorksites: 5,
        strandedCarryWorkers: 12,
      },
    }),
    evaluationState: createLongRunEvaluationState(),
    elapsedWallSec: 45,
    runKind: "idle",
  });
  assert.equal(early.failures.some((failure) => failure.kind === "logistics"), false);

  const late = evaluateLongRunSample({
    currentSample: createSample({
      logistics: {
        summary: "Logistics: stressed",
        avgDepotDistance: 24,
        isolatedWorksites: 4,
        stretchedWorksites: 5,
        strandedCarryWorkers: 12,
      },
    }),
    evaluationState: createLongRunEvaluationState(),
    elapsedWallSec: 240,
    runKind: "idle",
  });
  assert.equal(late.failures.some((failure) => failure.kind === "logistics"), true);
});

test("threshold evaluator resets operator logistics grace after the scenario changes", () => {
  const initialState = createLongRunEvaluationState();
  const temperate = createSample({
    world: {
      templateId: "temperate_plains",
      frontier: { connectedRoutes: 1, readyDepots: 1 },
      weather: { hazardFrontCount: 0 },
      spatialPressure: {
        activeEventCount: 0,
        weatherPressure: 0.2,
        eventPressure: 0.3,
        contestedZones: 0,
      },
    },
    logistics: {
      summary: "Logistics: stressed",
      avgDepotDistance: 12,
      isolatedWorksites: 0,
      stretchedWorksites: 0,
      strandedCarryWorkers: 0,
    },
  });
  const first = evaluateLongRunSample({
    currentSample: temperate,
    evaluationState: initialState,
    elapsedWallSec: 300,
    runKind: "operator",
  });

  const archipelago = createSample({
    tick: 12,
    simTimeSec: 14,
    world: {
      templateId: "archipelago_isles",
      frontier: { connectedRoutes: 0, readyDepots: 0 },
      weather: { hazardFrontCount: 0 },
      spatialPressure: {
        activeEventCount: 0,
        weatherPressure: 0.2,
        eventPressure: 0.3,
        contestedZones: 0,
      },
    },
    logistics: {
      summary: "Logistics: stressed",
      avgDepotDistance: 24,
      isolatedWorksites: 4,
      stretchedWorksites: 5,
      strandedCarryWorkers: 12,
    },
  });
  const second = evaluateLongRunSample({
    currentSample: archipelago,
    previousSample: temperate,
    evaluationState: first.evaluationState,
    elapsedWallSec: 121,
    runKind: "operator",
  });

  assert.equal(second.failures.some((failure) => failure.kind === "logistics"), false);
});

test("finalizeLongRunSamples computes average and p5 fps", () => {
  const summary = finalizeLongRunSamples([
    createSample({ performance: { fps: 60, frameMs: 16.2 } }),
    createSample({ performance: { fps: 56, frameMs: 17.3 } }),
    createSample({ performance: { fps: 42, frameMs: 23.8 } }),
  ]);

  assert.equal(summary.sampleCount, 3);
  assert.equal(summary.avgFps > 50, true);
  assert.equal(summary.p5Fps, 42);
  assert.equal(summary.minFps, 42);
});
