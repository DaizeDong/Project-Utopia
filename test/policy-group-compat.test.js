import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { NPCBrainSystem } from "../src/simulation/ai/brains/NPCBrainSystem.js";

test("NPCBrainSystem maps legacy visitors policy to traders and saboteurs", () => {
  const state = createInitialGameState();
  state.ai.lastPolicyDecisionSec = state.metrics.timeSec;

  const system = new NPCBrainSystem();
  system.pendingResult = {
    fallback: true,
    data: {
      policies: [
        {
          groupId: "visitors",
          intentWeights: { sabotage: 1.1, trade: 0.7, wander: 0.3 },
          riskTolerance: 0.6,
          targetPriorities: { warehouse: 1.2 },
          ttlSec: 20,
        },
      ],
    },
    error: "",
    model: "fallback",
    latencyMs: 0,
    debug: {},
  };

  system.update(1 / 30, state, {
    llmClient: { lastStatus: "up", lastModel: "fallback" },
    fallbackPolicies: () => ({ policies: [] }),
  });

  assert.equal(state.ai.groupPolicies.has("traders"), true);
  assert.equal(state.ai.groupPolicies.has("saboteurs"), true);
  assert.equal(state.ai.groupPolicies.has("workers"), true);
  assert.equal(state.ai.groupPolicies.has("herbivores"), true);
  assert.equal(state.ai.groupPolicies.has("predators"), true);
  assert.equal(Array.isArray(state.ai.lastPolicyBatch), true);
  assert.equal(state.ai.lastPolicyBatch.length, 5);
});

test("NPCBrainSystem normalizes group ids and derives state targets from policies", () => {
  const state = createInitialGameState();
  state.ai.lastPolicyDecisionSec = state.metrics.timeSec;
  const worker = state.agents.find((entity) => entity.type === "WORKER");
  if (worker) worker.carry.food = 3;

  const system = new NPCBrainSystem();
  system.pendingResult = {
    fallback: false,
    data: {
      policies: [
        {
          groupId: "WORKERS",
          intentWeights: { deliver: 1.8, farm: 0.3, wood: 0.2 },
          riskTolerance: 0.31,
          targetPriorities: { warehouse: 1.6 },
          ttlSec: 20,
        },
        {
          groupId: "Traders",
          intentWeights: { trade: 1.4, eat: 0.3 },
          riskTolerance: 0.45,
          targetPriorities: { warehouse: 1.7 },
          ttlSec: 20,
        },
      ],
    },
    error: "",
    model: "test-model",
    latencyMs: 0,
    debug: {},
  };

  system.update(1 / 30, state, {
    llmClient: { lastStatus: "up", lastModel: "test-model", requestPolicies: async () => ({ fallback: true, data: { policies: [] } }) },
    fallbackPolicies: () => ({ policies: [] }),
  });

  const workerPolicy = state.ai.groupPolicies.get("workers")?.data;
  assert.ok(workerPolicy);
  assert.equal(workerPolicy.riskTolerance, 0.31);

  const workerTarget = state.ai.groupStateTargets.get("workers");
  assert.ok(workerTarget);
  assert.equal(workerTarget.targetState, "deliver");
});
