import test from "node:test";
import assert from "node:assert/strict";

import { LLMClient } from "../src/simulation/ai/llm/LLMClient.js";
import { guardEnvironmentDirective, guardGroupPolicies } from "../src/simulation/ai/llm/Guardrails.js";
import { validateEnvironmentDirective, validateGroupPolicy } from "../src/simulation/ai/llm/ResponseSchema.js";

test("Guardrails clamp unsafe environment values", () => {
  const guarded = guardEnvironmentDirective({
    weather: "clear",
    durationSec: 9999,
    factionTension: 5,
    eventSpawns: [{ type: "banditRaid", intensity: 99, durationSec: 999 }],
  });

  assert.ok(guarded.durationSec <= 180);
  assert.ok(guarded.factionTension <= 1);
  assert.ok(guarded.eventSpawns[0].intensity <= 3);
  assert.ok(guarded.eventSpawns[0].durationSec <= 60);
});

test("Schema validator rejects malformed environment payload", () => {
  const validation = validateEnvironmentDirective({ weather: "clear" });
  assert.equal(validation.ok, false);
});

test("Policy schema accepts optional stateTargets", () => {
  const validation = validateGroupPolicy({
    policies: [
      {
        groupId: "workers",
        intentWeights: { farm: 1 },
        riskTolerance: 0.4,
        targetPriorities: { warehouse: 1.2 },
        ttlSec: 20,
        focus: "depot throughput",
        summary: "Keep workers close to warehouses while routes recover.",
        steeringNotes: ["Delivery must stay feasible."],
      },
    ],
    stateTargets: [
      {
        groupId: "workers",
        targetState: "seek_task",
        priority: 0.65,
        ttlSec: 16,
        reason: "throughput",
      },
    ],
  });
  assert.equal(validation.ok, true);
});

test("Guardrails drop invalid stateTargets", () => {
  const guarded = guardGroupPolicies({
    policies: [
      {
        groupId: "WORKERS",
        intentWeights: { farm: 1, invalid: 2.4, deliver: 1.1 },
        riskTolerance: 0.4,
        targetPriorities: { warehouse: 1.2, invalid: 2.2, road: 1.4 },
        ttlSec: 20,
        focus: "frontier cargo",
        summary: "Workers should hold the frontier.",
        steeringNotes: ["Prefer roads.", "Ignore invalid keys."],
      },
    ],
    stateTargets: [
      { groupId: "workers", targetState: "seek_task", priority: 0.7, ttlSec: 20, reason: "valid" },
      { groupId: "workers", targetState: "INVALID", priority: 0.7, ttlSec: 20, reason: "invalid" },
      { groupId: "unknown", targetState: "seek_task", priority: 0.7, ttlSec: 20, reason: "invalid-group" },
    ],
  });

  assert.equal(Array.isArray(guarded.stateTargets), true);
  assert.equal(guarded.stateTargets.length, 1);
  assert.equal(guarded.stateTargets[0].groupId, "workers");
  assert.equal(guarded.stateTargets[0].targetState, "seek_task");
  assert.deepEqual(Object.keys(guarded.policies[0].intentWeights).sort(), ["deliver", "farm", "wood", "eat", "wander", "quarry", "gather_herbs", "cook", "smith", "heal"].sort());
  assert.equal(Object.prototype.hasOwnProperty.call(guarded.policies[0].intentWeights, "invalid"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(guarded.policies[0].targetPriorities, "invalid"), false);
  assert.equal(guarded.policies[0].focus, "frontier cargo");
  assert.equal(guarded.policies[0].summary, "Workers should hold the frontier.");
  assert.equal(Array.isArray(guarded.policies[0].steeringNotes), true);
});

test("LLMClient returns fallback contract when disabled", async () => {
  const client = new LLMClient();
  const summary = { resources: { food: 10, wood: 20 }, traffic: { congestion: 0.2 } };
  const result = await client.requestEnvironment(summary, false);

  assert.equal(result.fallback, true);
  assert.ok(result.data);
});
