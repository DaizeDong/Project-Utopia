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
      objective: { id: "logistics-1", title: "Reconnect the Frontier", progress: 28, hint: "Repair the west route." },
      frontier: {
        brokenRouteCount: 1,
        brokenRoutes: ["west lumber route"],
        unreadyDepotCount: 1,
        unreadyDepots: ["east ruined depot"],
      },
      logistics: {
        isolatedWorksites: 1,
        overloadedWarehouses: 1,
        strandedCarryWorkers: 2,
      },
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
  assert.ok(Number(workers.targetPriorities.road ?? 0) > Number(DEFAULT_GROUP_POLICIES.workers.targetPriorities.road ?? 0));
  assert.ok(Number(workers.targetPriorities.depot ?? 0) > Number(DEFAULT_GROUP_POLICIES.workers.targetPriorities.depot ?? 0));
  assert.match(String(workers.focus ?? ""), /supply lane|cargo|larder/i);
  assert.ok(String(workers.summary ?? "").length > 10);
  assert.ok(Array.isArray(workers.steeringNotes) && workers.steeringNotes.length > 0);
});
