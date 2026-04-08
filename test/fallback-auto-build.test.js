import test from "node:test";
import assert from "node:assert/strict";
import { adjustWorkerPolicyExported } from "../src/simulation/ai/llm/PromptBuilder.js";

function makePolicy() {
  return {
    intentWeights: { farm: 1, wood: 1, eat: 0.5, deliver: 0.5, wander: 0.3 },
    targetPriorities: {},
    riskTolerance: 0.5,
    ttlSec: 30,
  };
}

function makeSummary(overrides = {}) {
  const world = {
    resources: { food: 15, wood: 45, stone: 0, herbs: 0 },
    buildings: { warehouses: 2, farms: 2, lumbers: 2, roads: 5, walls: 0, quarries: 0, herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0 },
    population: { workers: 8, predators: 0 },
    spatialPressure: {},
    events: [],
    ...overrides,
  };
  return {
    world,
    objective: { id: "logistics-1" },
    frontier: { brokenRoutes: [], unreadyDepots: [], readyDepots: [] },
    logistics: { isolatedWorksites: 0, overloadedWarehouses: 0, strandedCarryWorkers: 0 },
    gameplay: { threat: 30, prosperity: 40, recovery: { collapseRisk: 10 } },
  };
}

test("adjustWorkerPolicy adds buildQueue when food is low and wood is high", () => {
  const policy = makePolicy();
  const context = { count: 8, dominantState: "harvest", avgHunger: 0.6, carrying: 2 };
  const summary = makeSummary();
  adjustWorkerPolicyExported(policy, context, summary);
  assert.ok(Array.isArray(policy.buildQueue), "Should have buildQueue");
  assert.ok(policy.buildQueue.length > 0, "Should queue builds");
  assert.ok(policy.buildQueue.some((b) => b.type === "farm"), "Should queue farm when food<30");
});

test("adjustWorkerPolicy does NOT add buildQueue when wood is too low", () => {
  const policy = makePolicy();
  const context = { count: 8, dominantState: "harvest", avgHunger: 0.6, carrying: 2 };
  const summary = makeSummary({ resources: { food: 50, wood: 2, stone: 0, herbs: 0 } });
  adjustWorkerPolicyExported(policy, context, summary);
  assert.ok(!policy.buildQueue || policy.buildQueue.length === 0, "Should NOT queue builds with wood=2");
});

test("adjustWorkerPolicy queues wall for stability-1 objective", () => {
  const policy = makePolicy();
  const context = { count: 8, dominantState: "harvest", avgHunger: 0.6, carrying: 2 };
  const summary = makeSummary();
  summary.world.objective = { id: "stability-1" };
  adjustWorkerPolicyExported(policy, context, summary);
  assert.ok(policy.buildQueue?.some((b) => b.type === "wall"), "Should queue wall for stability-1");
});
