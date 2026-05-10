// Idempotency tests for ScriptedOraclePolicy (reviewer Round-1 O-1 P1 fix).
//
// Asserts that for every supported scenario × every LLM-facing channel:
//   - validate{Environment,GroupPolicy} accepts the oracle-produced data
//   - guard{Environment,GroupPolicies} returns deeply-equal output (no clamp drift)
//
// Strategic-plan + colony-agent channels are free-form (no schema/guard pair),
// so they're not exercised here — they only need to round-trip through
// JSON.stringify / parse, which is covered by the base oracle test.
//
// A failing case demonstrates the test's value: an out-of-range intent weight
// (e.g. 5 > clamp ceiling 3) MUST be detectable by deepEqual against the guard
// output, otherwise the test would not catch a regression in blueprint values.

import test from "node:test";
import assert from "node:assert/strict";

import { ScriptedOraclePolicy } from "../src/benchmark/baselines/ScriptedOraclePolicy.js";
import {
  guardEnvironmentDirective,
  guardGroupPolicies,
} from "../src/simulation/ai/llm/Guardrails.js";
import {
  validateEnvironmentDirective,
  validateGroupPolicy,
} from "../src/simulation/ai/llm/ResponseSchema.js";

const GUARDABLE_CHANNELS = [
  {
    channel: "environment-director",
    validate: validateEnvironmentDirective,
    guard: guardEnvironmentDirective,
  },
  {
    channel: "npc-policy",
    validate: validateGroupPolicy,
    guard: guardGroupPolicies,
  },
];

test("oracle output is schema-valid and idempotent under guardrails for every supported scenario", async () => {
  for (const scenario of ScriptedOraclePolicy.supportedScenarios) {
    const oracle = new ScriptedOraclePolicy(scenario);
    for (const { channel, validate, guard } of GUARDABLE_CHANNELS) {
      const res = await oracle.request(channel, {});
      assert.equal(res.fallback, false, `${scenario}/${channel}: unexpected fallback`);
      assert.ok(res.data, `${scenario}/${channel}: data missing`);

      const schemaResult = validate(res.data);
      assert.equal(
        schemaResult.ok,
        true,
        `${scenario}/${channel}: schema fail — ${schemaResult.error}`,
      );

      // Idempotency: guard(data) must be deep-equal to data.
      // Snapshot first because guard may clone; we want to compare *values*.
      const snapshot = JSON.parse(JSON.stringify(res.data));
      const guarded = guard(res.data);
      assert.deepEqual(
        guarded,
        snapshot,
        `${scenario}/${channel}: guard output drifted from blueprint — sandwich normalization not idempotent`,
      );

      // Second-pass idempotency: guard(guard(data)) must also equal guard(data).
      const twice = guard(guarded);
      assert.deepEqual(
        twice,
        guarded,
        `${scenario}/${channel}: guard is not a fixed point under repeated application`,
      );
    }
  }
});

test("idempotency test would catch a clamp regression (regression sentinel)", () => {
  // Hand-rolled bad payload: intent weight 5 exceeds the [0,3] clamp.
  const badPolicy = {
    policies: [
      {
        groupId: "workers",
        intentWeights: {
          farm: 5, // > 3, will be clamped to 3
          wood: 1,
          deliver: 1,
          eat: 1,
          wander: 0.2,
          quarry: 1,
          gather_herbs: 1,
          cook: 1,
          smith: 1,
          heal: 1,
        },
        riskTolerance: 0.4,
        targetPriorities: {
          warehouse: 1.5,
          farm: 1.0,
          lumber: 1.0,
          road: 1.05,
          depot: 1.2,
          frontier: 0.9,
          safety: 1.2,
          quarry: 0.9,
          herb_garden: 0.9,
          kitchen: 0.9,
          smithy: 0.9,
          clinic: 0.9,
          bridge: 0.7,
        },
        ttlSec: 60,
        focus: "regression sentinel",
        summary: "Bad payload to verify idempotency check fires.",
        steeringNotes: [],
      },
    ],
    stateTargets: [],
  };
  const guarded = guardGroupPolicies(badPolicy);
  assert.notDeepEqual(
    guarded,
    badPolicy,
    "expected clamp to mutate intentWeights.farm 5 → 3, proving the deepEqual check would fail on regression",
  );
  // And confirm the fixed-point property still holds for the *guarded* output.
  const twice = guardGroupPolicies(guarded);
  assert.deepEqual(twice, guarded, "guard should be idempotent on already-clamped payloads");
});
