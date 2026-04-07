// test/fallback-policy-strategy.test.js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPolicyFallback } from "../src/simulation/ai/llm/PromptBuilder.js";

function makePolicySummary(strategyOverride = {}) {
  const world = {
    simTimeSec: 60,
    resources: { food: 40, wood: 40 },
    population: { workers: 12, visitors: 4, herbivores: 3, predators: 1 },
    buildings: { warehouses: 1, farms: 4, lumbers: 2, roads: 15, walls: 7 },
    gameplay: { prosperity: 40, threat: 30, recovery: { collapseRisk: 10 } },
    frontier: { brokenRouteCount: 1 },
    traffic: { congestion: 0.3 },
    logistics: { overloadedWarehouses: 0 },
    objective: { id: "logistics-1" },
    _strategyContext: {
      priority: "grow",
      resourceFocus: "balanced",
      defensePosture: "neutral",
      workerFocus: "balanced",
      riskTolerance: 0.5,
      ...strategyOverride,
    },
  };
  return {
    world,
    groups: {
      workers: { count: 12, avgHunger: 0.7, carrying: 2, states: { seek_task: 8, deliver: 3, eat: 1 }, dominantState: "seek_task" },
      traders: { count: 2, avgHunger: 0.8, carrying: 0, states: { seek_trade: 2 }, dominantState: "seek_trade" },
      saboteurs: { count: 2, avgHunger: 0.7, carrying: 0, states: { scout: 2 }, dominantState: "scout" },
      herbivores: { count: 3, avgHunger: 0, carrying: 0, states: { graze: 3 }, dominantState: "graze" },
      predators: { count: 1, avgHunger: 0, carrying: 0, states: { stalk: 1 }, dominantState: "stalk" },
    },
    stateTransitions: {
      groups: {
        workers: { count: 12, avgHunger: 0.7, carrying: 2, states: {}, dominantState: "seek_task", stateNodes: [], transitions: [], preferredPaths: [] },
        traders: { count: 2, avgHunger: 0.8, carrying: 0, states: {}, dominantState: "seek_trade", stateNodes: [], transitions: [], preferredPaths: [] },
        saboteurs: { count: 2, avgHunger: 0.7, carrying: 0, states: {}, dominantState: "scout", stateNodes: [], transitions: [], preferredPaths: [] },
        herbivores: { count: 3, avgHunger: 0, carrying: 0, states: {}, dominantState: "graze", stateNodes: [], transitions: [], preferredPaths: [] },
        predators: { count: 1, avgHunger: 0, carrying: 0, states: {}, dominantState: "stalk", stateNodes: [], transitions: [], preferredPaths: [] },
      },
    },
  };
}

describe("buildPolicyFallback strategy awareness", () => {
  it("boosts farm intent when strategy says food focus", () => {
    const summary = makePolicySummary({ resourceFocus: "food", workerFocus: "farm" });
    const result = buildPolicyFallback(summary);
    const workerPolicy = result.policies.find((p) => p.groupId === "workers");
    assert.ok(workerPolicy.intentWeights.farm > workerPolicy.intentWeights.wood, "farm should outweigh wood when food focus");
  });

  it("boosts wood intent when strategy says wood focus", () => {
    const summary = makePolicySummary({ resourceFocus: "wood", workerFocus: "wood" });
    const result = buildPolicyFallback(summary);
    const workerPolicy = result.policies.find((p) => p.groupId === "workers");
    assert.ok(workerPolicy.intentWeights.wood > workerPolicy.intentWeights.farm, "wood should outweigh farm when wood focus");
  });

  it("lowers risk tolerance when strategy says survive", () => {
    const summary = makePolicySummary({ priority: "survive", riskTolerance: 0.2 });
    const result = buildPolicyFallback(summary);
    const workerPolicy = result.policies.find((p) => p.groupId === "workers");
    assert.ok(workerPolicy.riskTolerance <= 0.25, "risk should be <= 0.25 in survive mode");
    assert.ok(workerPolicy.intentWeights.eat >= 1.8, "eat intent should be >= 1.8 in survive mode");
  });

  it("does not modify non-worker policies", () => {
    const baseline = buildPolicyFallback(makePolicySummary());
    const withSurvive = buildPolicyFallback(makePolicySummary({ priority: "survive" }));
    const baseTrader = baseline.policies.find((p) => p.groupId === "traders");
    const surviveTrader = withSurvive.policies.find((p) => p.groupId === "traders");
    assert.ok(baseTrader, "baseline trader policy should exist");
    assert.equal(surviveTrader.riskTolerance, baseTrader.riskTolerance, "trader risk should not change");
    assert.deepStrictEqual(surviveTrader.intentWeights, baseTrader.intentWeights, "trader intents should not change");
  });

  it("works without strategy context", () => {
    const summary = makePolicySummary();
    delete summary.world._strategyContext;
    const result = buildPolicyFallback(summary);
    assert.ok(result.policies.length > 0, "should produce policies without strategy");
    assert.ok(result.stateTargets, "should produce state targets");
  });

  it("boosts farm intent when food is low (not critical)", () => {
    const summary = makePolicySummary();
    summary.world.resources = { food: 18, wood: 40 };
    summary.stateTransitions.groups.workers.avgHunger = 0.6;
    const result = buildPolicyFallback(summary);
    const workerPolicy = result.policies.find((p) => p.groupId === "workers");
    assert.ok(workerPolicy.intentWeights.farm > 1.0, "farm intent should be boosted when food is low");
  });

  it("reduces risk tolerance when predators are numerous", () => {
    const summary = makePolicySummary();
    summary.world.population = { workers: 12, predators: 4 };
    const result = buildPolicyFallback(summary);
    const workerPolicy = result.policies.find((p) => p.groupId === "workers");
    assert.ok(workerPolicy.riskTolerance < 0.35, "risk should be lower with many predators");
  });

  it("makes skeleton crew prioritize food production", () => {
    const summary = makePolicySummary();
    summary.stateTransitions.groups.workers.count = 4;
    const result = buildPolicyFallback(summary);
    const workerPolicy = result.policies.find((p) => p.groupId === "workers");
    assert.ok(workerPolicy.intentWeights.farm > 1.0, "small crew should boost farm intent");
  });
});
