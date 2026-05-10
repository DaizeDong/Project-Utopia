// Validates ScriptedOraclePolicy (W1 P0-6).
//
// Asserts:
//   - Oracle instantiates without throwing for known scenarios
//   - request() for all 4 channels returns valid DecisionResponse shape
//   - Environment + npc-policy directives pass Guardrails clamping
//   - Unsupported scenarios soft-degrade (warn + fall back)

import test from "node:test";
import assert from "node:assert/strict";

import {
  ScriptedOraclePolicy,
  buildOraclePolicy,
} from "../src/benchmark/baselines/ScriptedOraclePolicy.js";
import {
  CHANNELS,
  AgentAdapter,
} from "../src/simulation/ai/llm/AgentAdapter.js";
import {
  guardEnvironmentDirective,
  guardGroupPolicies,
} from "../src/simulation/ai/llm/Guardrails.js";
import {
  validateEnvironmentDirective,
  validateGroupPolicy,
} from "../src/simulation/ai/llm/ResponseSchema.js";

test("ScriptedOraclePolicy instantiates without throwing for supported scenarios", () => {
  for (const id of ScriptedOraclePolicy.supportedScenarios) {
    assert.doesNotThrow(() => new ScriptedOraclePolicy(id));
  }
  const inst = new ScriptedOraclePolicy("temperate_plains");
  assert.ok(inst instanceof AgentAdapter, "should extend AgentAdapter");
});

test("buildOraclePolicy factory returns ScriptedOraclePolicy", () => {
  const oracle = buildOraclePolicy("temperate_plains");
  assert.ok(oracle instanceof ScriptedOraclePolicy);
  assert.equal(oracle.scenarioId, "temperate_plains");
});

test("oracle.request returns valid DecisionResponse for every channel", async () => {
  const oracle = new ScriptedOraclePolicy("temperate_plains");
  for (const channel of CHANNELS) {
    const res = await oracle.request(channel, { example: "payload" });
    assert.equal(typeof res, "object", `null response on ${channel}`);
    assert.equal(res.fallback, false, `${channel}: expected fallback=false`);
    assert.equal(typeof res.usage, "object", `${channel}: usage missing`);
    assert.ok(res.data, `${channel}: data missing`);
    assert.equal(typeof res.latencyMs, "number");
    assert.ok(typeof res.model === "string" && res.model.length > 0);
  }
});

test("environment-director directive passes ResponseSchema and Guardrails", async () => {
  const oracle = new ScriptedOraclePolicy("temperate_plains");
  const res = await oracle.request("environment-director", {});
  const schemaResult = validateEnvironmentDirective(res.data);
  assert.equal(schemaResult.ok, true, `schema fail: ${schemaResult.error}`);
  // guardEnvironmentDirective MUST not throw and must return a clamped object.
  const guarded = guardEnvironmentDirective(res.data);
  assert.equal(typeof guarded, "object");
  assert.ok(typeof guarded.weather === "string");
  assert.ok(Number.isFinite(guarded.durationSec));
  assert.ok(guarded.factionTension >= 0 && guarded.factionTension <= 1);
  assert.ok(Array.isArray(guarded.eventSpawns));
});

test("npc-policy directive passes ResponseSchema and Guardrails", async () => {
  const oracle = new ScriptedOraclePolicy("temperate_plains");
  const res = await oracle.request("npc-policy", {});
  const schemaResult = validateGroupPolicy(res.data);
  assert.equal(schemaResult.ok, true, `schema fail: ${schemaResult.error}`);
  const guarded = guardGroupPolicies(res.data);
  assert.equal(typeof guarded, "object");
  assert.ok(Array.isArray(guarded.policies));
  assert.ok(guarded.policies.length >= 1, "expected at least one policy");
  for (const p of guarded.policies) {
    assert.ok(typeof p.groupId === "string" && p.groupId.length > 0);
    assert.ok(p.riskTolerance >= 0 && p.riskTolerance <= 1);
    assert.ok(Number.isFinite(p.ttlSec));
  }
});

test("fortified_basin oracle returns combat-tilted directives", async () => {
  const oracle = new ScriptedOraclePolicy("fortified_basin");
  const env = await oracle.request("environment-director", {});
  assert.ok(env.data.factionTension >= 0.5, "fortified_basin should tense factions");
  const policy = await oracle.request("npc-policy", {});
  const guarded = guardGroupPolicies(policy.data);
  // At least one of WORKERS smith/quarry weights should be elevated.
  const workers = guarded.policies.find((p) => p.groupId === "workers");
  assert.ok(workers, "workers policy missing");
  const smithWeight = workers.intentWeights?.smith ?? 0;
  assert.ok(smithWeight >= 1.0, `expected smith weight >= 1.0 in fortified_basin, got ${smithWeight}`);
});

test("oracle soft-degrades for unsupported scenarios", async () => {
  // suppress console.warn for this test; oracle warns once per unknown id
  const origWarn = console.warn;
  let warned = false;
  console.warn = () => { warned = true; };
  try {
    const oracle = new ScriptedOraclePolicy("nonexistent_scenario_xyz");
    const res = await oracle.request("environment-director", {});
    assert.equal(res.fallback, false, "expected fallback to a real blueprint, not error path");
    assert.ok(res.data, "data should be present from fallback blueprint");
  } finally {
    console.warn = origWarn;
  }
  assert.ok(warned, "expected a console.warn for unknown scenario");
});

test("unsupported channel returns fallback response without throwing", async () => {
  const oracle = new ScriptedOraclePolicy("temperate_plains");
  const res = await oracle.request("not-a-channel", {});
  assert.equal(res.fallback, true);
  assert.equal(res.data, null);
  assert.ok(res.error.length > 0);
});
