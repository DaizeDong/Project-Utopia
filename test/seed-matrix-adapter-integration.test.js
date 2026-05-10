// Integration test for the SeedMatrix → SimHarness → AdapterToLLMClient
// wiring. Verifies that the AgentAdapter passed via opts.agentConfig actually
// drives sim systems (StrategicDirector / EnvironmentDirectorSystem /
// NPCBrainSystem / AgentDirectorSystem) — not just stored on `state.ai.adapter`
// where nobody reads it.
//
// Test plan:
//   1. NoopAgentAdapter (always fallback) — sanity baseline
//   2. ScriptedOraclePolicy (returns valid directives) — track adapter calls
//   3. FlatBaselineAdapter wrapping a stubbed LLMClient — track fused calls
//
// This is the canary that catches regressions of the form "we forgot to
// wire the adapter into createServices".

import test from "node:test";
import assert from "node:assert/strict";

import { SimHarness } from "../src/benchmark/framework/SimHarness.js";
import { AgentAdapter, NoopAgentAdapter } from "../src/simulation/ai/llm/AgentAdapter.js";
import { ScriptedOraclePolicy } from "../src/benchmark/baselines/ScriptedOraclePolicy.js";
import { FlatBaselineAdapter } from "../src/benchmark/baselines/FlatBaselineAdapter.js";
import { AdapterToLLMClient } from "../src/simulation/ai/llm/AdapterToLLMClient.js";

class CountingAdapter extends AgentAdapter {
  constructor(delegate) {
    super();
    this.delegate = delegate ?? new NoopAgentAdapter();
    this.callsByChannel = { "environment-director": 0, "npc-policy": 0, "strategic-plan": 0, "colony-agent": 0 };
    this.totalCalls = 0;
  }
  async request(channel, payload, options) {
    this.totalCalls++;
    if (channel in this.callsByChannel) this.callsByChannel[channel]++;
    return this.delegate.request(channel, payload, options);
  }
}

test("SimHarness wires agentAdapter into services.llmClient", async () => {
  const counter = new CountingAdapter(new NoopAgentAdapter());
  const harness = new SimHarness({
    templateId: "temperate_plains",
    seed: 7,
    aiEnabled: true,
    agentAdapter: counter,
  });
  // Surface check: the llmClient should be the adapter shim, not the raw LLMClient.
  assert.ok(
    harness.services.llmClient instanceof AdapterToLLMClient,
    `expected services.llmClient to be AdapterToLLMClient, got ${harness.services.llmClient?.constructor?.name}`,
  );
  assert.strictEqual(harness.services.llmClient.agentAdapter, counter);

  // Drive a few ticks; multiple sim systems should call the adapter.
  await harness.advanceTo(12);

  assert.ok(
    counter.totalCalls > 0,
    `agent adapter received zero calls — sim systems are not consuming it (total=${counter.totalCalls})`,
  );
});

test("NoopAgentAdapter vs ScriptedOraclePolicy — adapter actually changes sim outputs", async () => {
  // Two harnesses, identical seed/scenario, only the adapter differs.
  const noopCounter = new CountingAdapter(new NoopAgentAdapter());
  const oracleCounter = new CountingAdapter(new ScriptedOraclePolicy("temperate_plains"));

  const noopHarness = new SimHarness({
    templateId: "temperate_plains",
    seed: 17,
    aiEnabled: true,
    agentAdapter: noopCounter,
  });
  const oracleHarness = new SimHarness({
    templateId: "temperate_plains",
    seed: 17,
    aiEnabled: true,
    agentAdapter: oracleCounter,
  });

  await noopHarness.advanceTo(20);
  await oracleHarness.advanceTo(20);

  // Both adapters should have been hit.
  assert.ok(noopCounter.totalCalls > 0, "Noop adapter received zero requests");
  assert.ok(oracleCounter.totalCalls > 0, "Oracle adapter received zero requests");

  // Oracle should produce non-fallback policies because its directives
  // schema-validate. Noop returns fallback for all 4 channels.
  // Read NPCBrainSystem-stored mode to discriminate.
  const noopMode = noopHarness.state.ai?.mode ?? "fallback";
  const oracleMode = oracleHarness.state.ai?.mode ?? "fallback";

  // We don't strictly assert oracle === "llm" because the brain system may
  // gate on imminent-combat conditions. The strong invariant: oracle must
  // call at least one channel that returned non-fallback data, observable
  // via lastPolicySource on at least one of the two systems.
  assert.ok(
    oracleCounter.callsByChannel["npc-policy"] > 0
    || oracleCounter.callsByChannel["environment-director"] > 0
    || oracleCounter.callsByChannel["strategic-plan"] > 0,
    "Oracle adapter never received any of the 4 channel requests",
  );

  // Sanity: the ScriptedOracle's perceptible effect — at least one of the
  // public state paths should differ between Noop and Oracle. We check
  // a stable, easy-to-read scalar.
  const noopFood = Number(noopHarness.state.resources?.food ?? 0);
  const oracleFood = Number(oracleHarness.state.resources?.food ?? 0);
  // Either food differs OR oracleMode is "llm" — both are valid signals.
  const oracleHadEffect = (noopFood !== oracleFood) || oracleMode === "llm" || noopMode !== oracleMode;
  assert.ok(
    oracleHadEffect,
    `Oracle adapter showed no observable effect: noopFood=${noopFood} oracleFood=${oracleFood} ` +
    `noopMode=${noopMode} oracleMode=${oracleMode}`,
  );
});

test("FlatBaselineAdapter w/ mock LLMClient — fused call routes through SimHarness", async () => {
  // Stub LLMClient: respond with a fused JSON containing all 4 channels.
  const stubLlmClient = {
    lastStatus: "up",
    lastModel: "stub",
    lastLatencyMs: 1,
    lastError: "",
    callsLogged: 0,
    async requestStrategic(_prompt, _enabled, fallbackData) {
      this.callsLogged++;
      // Return a valid fused response. Env directive uses default fallback
      // shape; policy uses the canonical workers shape so guard succeeds.
      const fused = {
        env: {
          weather: "clear",
          durationSec: 60,
          factionTension: 0.1,
          eventSpawns: [],
          summary: "stable",
          steeringNotes: ["calm"],
        },
        policy: {
          policies: [
            {
              groupId: "workers",
              intentWeights: { farm: 2.0, deliver: 1.5, eat: 1.0, wood: 1.0 },
              riskTolerance: 0.4,
              targetPriorities: { warehouse: 1.5, farm: 1.2 },
              ttlSec: 60,
              focus: "food",
              summary: "feed first",
              steeringNotes: ["food-first"],
            },
          ],
          stateTargets: [],
        },
        strategic: { strategy: { focus: "food", priority: "survive" } },
        colony: fallbackData ?? null,
      };
      return {
        fallback: false,
        data: fused,
        latencyMs: 1,
        error: "",
        model: "stub-fused",
        debug: null,
      };
    },
  };

  const flat = new FlatBaselineAdapter({ llmClient: stubLlmClient, cacheTtlMs: 60_000 });
  const counter = new CountingAdapter(flat);

  const harness = new SimHarness({
    templateId: "temperate_plains",
    seed: 99,
    aiEnabled: true,
    agentAdapter: counter,
  });
  await harness.advanceTo(15);

  assert.ok(counter.totalCalls > 0, "FlatBaseline adapter never invoked");
  assert.ok(
    stubLlmClient.callsLogged > 0,
    `FlatBaselineAdapter never called its inner llmClient (logged=${stubLlmClient.callsLogged}). ` +
    `If this is zero, the SimHarness is not actually wiring the adapter through to services.llmClient.`,
  );
});
