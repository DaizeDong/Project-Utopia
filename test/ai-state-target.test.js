import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { GROUP_IDS } from "../src/config/aiConfig.js";
import { NPCBrainSystem } from "../src/simulation/ai/brains/NPCBrainSystem.js";

function makePolicy(groupId) {
  return {
    groupId,
    intentWeights: { wander: 1, eat: 0.8 },
    riskTolerance: 0.5,
    targetPriorities: { warehouse: 1.1 },
    ttlSec: 20,
  };
}

test("NPCBrainSystem stores and expires group state targets", () => {
  const state = createInitialGameState();
  state.ai.lastPolicyDecisionSec = state.metrics.timeSec;

  const system = new NPCBrainSystem();
  const worker = state.agents.find((a) => a.groupId === GROUP_IDS.WORKERS);
  assert.ok(worker);
  worker.carry.food = 3;

  system.pendingResult = {
    fallback: false,
    data: {
      policies: [
        makePolicy(GROUP_IDS.WORKERS),
        makePolicy(GROUP_IDS.TRADERS),
        makePolicy(GROUP_IDS.SABOTEURS),
        makePolicy(GROUP_IDS.HERBIVORES),
        makePolicy(GROUP_IDS.PREDATORS),
      ],
      stateTargets: [
        {
          groupId: GROUP_IDS.WORKERS,
          targetState: "deliver",
          priority: 0.8,
          ttlSec: 4,
          reason: "logistics pressure",
        },
      ],
    },
    error: "",
    model: "test-model",
    latencyMs: 12,
    debug: {},
  };

  system.update(1 / 30, state, {
    llmClient: { lastStatus: "up", lastModel: "test-model", requestPolicies: async () => ({ fallback: true, data: { policies: [] } }) },
    fallbackPolicies: () => ({ policies: [] }),
  });

  assert.equal(state.ai.groupStateTargets instanceof Map, true);
  assert.equal(state.ai.groupStateTargets.has(GROUP_IDS.WORKERS), true);
  assert.ok(state.ai.lastStateTargetBatch.length >= 1);

  assert.equal(worker.blackboard.aiTargetState, "deliver");
  const workerNoCarry = state.agents.find((a) => a.groupId === GROUP_IDS.WORKERS && a.id !== worker.id);
  if (workerNoCarry) {
    assert.equal(workerNoCarry.blackboard.aiTargetState, null);
  }

  state.metrics.timeSec += 10;
  system.update(1 / 30, state, {
    llmClient: { lastStatus: "up", lastModel: "test-model", requestPolicies: async () => ({ fallback: true, data: { policies: [] } }) },
    fallbackPolicies: () => ({ policies: [] }),
  });

  assert.equal(state.ai.groupStateTargets.has(GROUP_IDS.WORKERS), false);
});
