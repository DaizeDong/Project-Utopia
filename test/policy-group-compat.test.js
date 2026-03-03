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
