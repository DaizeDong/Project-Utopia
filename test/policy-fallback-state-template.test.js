import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_GROUP_POLICIES } from "../src/config/aiConfig.js";
import { buildPolicyFallback } from "../src/simulation/ai/llm/PromptBuilder.js";

test("buildPolicyFallback adapts worker/trader intents from state transition context", () => {
  const summary = {
    world: {
      resources: { food: 9, wood: 80 },
      population: { workers: 16, visitors: 6, herbivores: 4, predators: 1 },
      events: [{ type: "bandit_raid" }],
    },
    stateTransitions: {
      groups: {
        workers: { dominantState: "seek_food", avgHunger: 0.22, count: 16, carrying: 2 },
        traders: { dominantState: "seek_food", avgHunger: 0.21, count: 2 },
        saboteurs: { dominantState: "evade", avgHunger: 0.5, count: 4 },
        herbivores: { dominantState: "flee", count: 4 },
        predators: { dominantState: "rest", count: 1 },
      },
    },
  };

  const payload = buildPolicyFallback(summary);
  const workers = payload.policies.find((p) => p.groupId === "workers");
  const traders = payload.policies.find((p) => p.groupId === "traders");
  const stateTargets = payload.stateTargets ?? [];

  assert.ok(workers);
  assert.ok(traders);
  assert.ok(Array.isArray(stateTargets));
  assert.ok(stateTargets.length >= 3);
  assert.ok(stateTargets.some((t) => t.groupId === "workers"));
  assert.ok(stateTargets.some((t) => t.groupId === "traders"));
  assert.ok(stateTargets.every((t) => !(t.groupId === "workers" && t.targetState === "harvest")));
  assert.ok(stateTargets.every((t) => !(t.groupId === "workers" && t.targetState === "seek_food")));
  assert.ok(stateTargets.every((t) => !(t.groupId === "workers" && t.targetState === "idle")));
  assert.ok(stateTargets.every((t) => !(t.groupId === "traders" && t.targetState === "trade")));
  assert.ok(stateTargets.every((t) => !(t.groupId === "traders" && t.targetState === "seek_food")));
  assert.ok(workers.intentWeights.eat > DEFAULT_GROUP_POLICIES.workers.intentWeights.eat);
  assert.ok(traders.intentWeights.eat > DEFAULT_GROUP_POLICIES.traders.intentWeights.eat);
});
