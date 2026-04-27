import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_STRATEGY,
  guardStrategy,
  StrategicDirector,
} from "../src/simulation/ai/strategic/StrategicDirector.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";

function makeState({
  timeSec = 0,
  workers = 12,
  food = 80,
  wood = 70,
  threat = 50,
  prosperity = 40,
  deaths = 0,
  objIdx = 0,
  phase = "active",
  aiEnabled = false,
  doctrine = "balanced",
  weather = "clear",
} = {}) {
  return {
    session: { phase },
    metrics: { timeSec, deathsTotal: deaths, populationStats: { workers } },
    resources: { food, wood },
    gameplay: {
      prosperity,
      threat,
      objectiveIndex: objIdx,
      objectives: [{ title: "Test" }],
      scenario: { family: "test" },
      doctrine,
    },
    weather: { current: weather },
    ai: { enabled: aiEnabled },
    controls: {},
  };
}

// --- guardStrategy tests ---

test("guardStrategy clamps out-of-range riskTolerance", () => {
  const result = guardStrategy({
    reasoning: "test",
    strategy: { ...DEFAULT_STRATEGY, riskTolerance: 2.5 },
    observations: [],
    summary: "ok",
  });
  assert.equal(result.strategy.riskTolerance, 1);

  const result2 = guardStrategy({
    reasoning: "test",
    strategy: { ...DEFAULT_STRATEGY, riskTolerance: -0.5 },
    observations: [],
    summary: "ok",
  });
  assert.equal(result2.strategy.riskTolerance, 0);
});

test("guardStrategy falls back to defaults for missing fields", () => {
  const result = guardStrategy({ reasoning: "test", strategy: {}, observations: [], summary: "ok" });
  assert.equal(result.strategy.priority, DEFAULT_STRATEGY.priority);
  assert.equal(result.strategy.resourceFocus, DEFAULT_STRATEGY.resourceFocus);
  assert.equal(result.strategy.defensePosture, DEFAULT_STRATEGY.defensePosture);
  assert.equal(result.strategy.riskTolerance, DEFAULT_STRATEGY.riskTolerance);
  assert.equal(result.strategy.expansionDirection, DEFAULT_STRATEGY.expansionDirection);
  assert.equal(result.strategy.workerFocus, DEFAULT_STRATEGY.workerFocus);
  assert.equal(result.strategy.environmentPreference, DEFAULT_STRATEGY.environmentPreference);
});

test("guardStrategy rejects invalid enum values", () => {
  const result = guardStrategy({
    reasoning: "test",
    strategy: { priority: "attack", resourceFocus: "gold", defensePosture: "panic" },
    observations: [],
    summary: "ok",
  });
  assert.equal(result.strategy.priority, DEFAULT_STRATEGY.priority);
  assert.equal(result.strategy.resourceFocus, DEFAULT_STRATEGY.resourceFocus);
  assert.equal(result.strategy.defensePosture, DEFAULT_STRATEGY.defensePosture);
});

test("guardStrategy clamps reasoning and summary length", () => {
  const longReasoning = "x".repeat(600);
  const longSummary = "y".repeat(120);
  const result = guardStrategy({
    reasoning: longReasoning,
    strategy: DEFAULT_STRATEGY,
    observations: [],
    summary: longSummary,
  });
  assert.ok(result.reasoning.length <= 500);
  assert.ok(result.summary.length <= 80);
});

test("guardStrategy handles null/undefined input without throwing", () => {
  const r1 = guardStrategy(null);
  assert.equal(r1.strategy.priority, DEFAULT_STRATEGY.priority);
  assert.ok(typeof r1.reasoning === "string");

  const r2 = guardStrategy(undefined);
  assert.equal(r2.strategy.priority, DEFAULT_STRATEGY.priority);

  const r3 = guardStrategy({});
  assert.equal(r3.strategy.priority, DEFAULT_STRATEGY.priority);
});

test("guardStrategy clamps observations to max 3 items of 200 chars each", () => {
  const result = guardStrategy({
    reasoning: "test",
    strategy: DEFAULT_STRATEGY,
    observations: ["a".repeat(300), "b", "c", "d", "e"],
    summary: "ok",
  });
  assert.ok(result.observations.length <= 3);
  assert.ok(result.observations[0].length <= 200);
});

// --- buildFallbackStrategy tests ---

test("buildFallbackStrategy returns survive when food < 15", () => {
  const mem = new MemoryStore();
  const director = new StrategicDirector(mem);
  const state = makeState({ food: 10 });
  const strat = director.buildFallbackStrategy(state);
  assert.equal(strat.priority, "survive");
  assert.equal(strat.resourceFocus, "food");
  assert.ok(strat.riskTolerance <= 0.3);
});

test("buildFallbackStrategy returns survive when workers <= 3", () => {
  const mem = new MemoryStore();
  const director = new StrategicDirector(mem);
  const state = makeState({ workers: 2 });
  const strat = director.buildFallbackStrategy(state);
  assert.equal(strat.priority, "survive");
});

test("buildFallbackStrategy returns defend when threat > 75", () => {
  const mem = new MemoryStore();
  const director = new StrategicDirector(mem);
  const state = makeState({ threat: 80 });
  const strat = director.buildFallbackStrategy(state);
  assert.equal(strat.priority, "defend");
  assert.equal(strat.defensePosture, "defensive");
  assert.ok(strat.riskTolerance <= 0.3);
});

test("buildFallbackStrategy returns grow for normal state", () => {
  const mem = new MemoryStore();
  const director = new StrategicDirector(mem);
  const state = makeState();
  const strat = director.buildFallbackStrategy(state);
  assert.equal(strat.priority, "grow");
  assert.equal(strat.resourceFocus, "balanced");
});

test("buildFallbackStrategy returns complete_objective near end with good stats", () => {
  const mem = new MemoryStore();
  const director = new StrategicDirector(mem);
  const state = makeState({ prosperity: 85, threat: 10 });
  // Set near final objective
  state.gameplay.objectiveIndex = state.gameplay.objectives.length - 1;
  const strat = director.buildFallbackStrategy(state);
  assert.equal(strat.priority, "complete_objective");
});

test("buildFallbackStrategy returns wood focus when wood < 15", () => {
  const mem = new MemoryStore();
  const director = new StrategicDirector(mem);
  const state = makeState({ wood: 10 });
  const strat = director.buildFallbackStrategy(state);
  assert.equal(strat.resourceFocus, "wood");
});

test("buildFallbackStrategy returns food focus when food < 30", () => {
  const mem = new MemoryStore();
  const director = new StrategicDirector(mem);
  const state = makeState({ food: 25 });
  const strat = director.buildFallbackStrategy(state);
  assert.equal(strat.resourceFocus, "food");
});

// --- update() tests ---

test("update() in fallback mode sets state.ai.strategy", () => {
  const mem = new MemoryStore();
  const director = new StrategicDirector(mem);
  const state = makeState({ aiEnabled: false });
  const services = {};

  // First call: scheduler triggers, AI disabled -> synchronous fallback
  director.update(0, state, services);

  assert.ok(state.ai.strategy);
  assert.equal(state.ai.strategy.priority, "grow");
  assert.equal(state.ai.lastStrategySource, "fallback");
  assert.equal(state.ai.strategyDecisionCount, 1);
});

test("update() initializes state.ai.strategy if missing", () => {
  const mem = new MemoryStore();
  const director = new StrategicDirector(mem);
  const state = makeState();
  delete state.ai.strategy;
  const services = {};

  director.update(0, state, services);

  assert.ok(state.ai.strategy);
  assert.equal(typeof state.ai.strategy.priority, "string");
});

test("update() honors forceStrategicDecision after autopilot is enabled", async () => {
  const mem = new MemoryStore();
  const director = new StrategicDirector(mem);
  const state = makeState({ aiEnabled: false, timeSec: 0 });

  director.update(0, state, {});
  assert.equal(state.ai.lastStrategySource, "fallback");

  let requestCount = 0;
  state.ai.enabled = true;
  state.ai.forceStrategicDecision = true;
  state.metrics.timeSec = 1;
  const services = {
    llmClient: {
      requestStrategic: async () => {
        requestCount += 1;
        return {
          fallback: false,
          data: {
            strategy: {
              priority: "defend",
              resourceFocus: "stone",
              defensePosture: "defensive",
              expansionDirection: "none",
              workerFocus: "wood",
              environmentPreference: "pressure",
              phase: "fortify",
              riskTolerance: 0.4,
              primaryGoal: "Force strategic replan",
            },
          },
          model: "gpt-test",
          debug: {
            endpoint: "/api/ai/environment",
            promptSystem: "strategic system",
            promptUser: "{}",
            requestPayload: { channel: "strategic-director" },
            parsedBeforeValidation: { strategy: { priority: "defend" } },
            guardedOutput: { strategy: { priority: "defend" } },
          },
        };
      },
    },
  };

  director.update(0, state, services);
  assert.equal(requestCount, 1);
  assert.equal(state.ai.forceStrategicDecision, false);

  await director.pendingPromise;
  director.update(0, state, services);

  assert.equal(state.ai.lastStrategySource, "llm");
  assert.equal(state.ai.strategy.primaryGoal, "Force strategic replan");
  assert.ok(state.ai.lastStrategicExchange);
});
