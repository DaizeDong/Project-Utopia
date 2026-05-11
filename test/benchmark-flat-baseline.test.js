import test from "node:test";
import assert from "node:assert/strict";

import { FlatBaselineAdapter } from "../src/benchmark/baselines/FlatBaselineAdapter.js";
import { CHANNELS } from "../src/simulation/ai/llm/AgentAdapter.js";

function makeStubLLMClient(fixedResponse) {
  let callCount = 0;
  return {
    callCount: () => callCount,
    requestStrategic: async () => {
      callCount += 1;
      return fixedResponse;
    },
  };
}

function fakeFusedResponse() {
  // Note: env field is intentionally minimal so it fails the env schema
  // (eventSpawns missing) — adapter should still not throw, just mark
  // env channel fallback while leaving the others usable.
  return {
    fallback: false,
    data: {
      env: {
        weather: "clear",
        durationSec: 20,
        factionTension: 0.4,
        eventSpawns: [],
      },
      policy: {
        policies: [
          {
            groupId: "workers",
            intentWeights: { farm: 1, deliver: 1 },
            riskTolerance: 0.5,
            targetPriorities: { warehouse: 1.1 },
            ttlSec: 18,
          },
        ],
      },
      strategic: { strategy: { priority: "survive" } },
      colony: { plan: { actions: [] } },
    },
    latencyMs: 12,
    error: "",
    model: "stub-flat",
    debug: null,
  };
}

test("FlatBaselineAdapter: first request triggers exactly one fused LLM call", async () => {
  const stub = makeStubLLMClient(fakeFusedResponse());
  const adapter = new FlatBaselineAdapter({ llmClient: stub, cacheTtlMs: 30_000 });

  assert.equal(stub.callCount(), 0);

  const resp = await adapter.request("environment-director", { world: { scenario: { title: "T" } } });

  assert.equal(stub.callCount(), 1, "should hit LLM once on first call");
  assert.equal(adapter.llmCallCount, 1);
  assert.ok(resp);
  // env passed schema -> non-null data
  assert.ok(resp.data, "env directive should be populated");
  assert.equal(resp.fallback, false);
  // Token-budget alignment: per-channel = fused / 4, so at least 1 prompt
  // token reported.
  assert.ok(resp.usage.promptTokens > 0);
});

test("FlatBaselineAdapter: 4 calls within TTL window reuse the same fused response", async () => {
  const stub = makeStubLLMClient(fakeFusedResponse());
  const adapter = new FlatBaselineAdapter({ llmClient: stub, cacheTtlMs: 30_000 });

  await adapter.request("environment-director", { world: {} });
  await adapter.request("npc-policy", { world: {} });
  await adapter.request("strategic-plan", { something: 1 });
  await adapter.request("colony-agent", { something: 2 });

  assert.equal(stub.callCount(), 1, "all 4 channels share the same fused LLM call");
  assert.equal(adapter.llmCallCount, 1);
  assert.equal(adapter.cacheHitCount, 3, "3 of 4 channels hit cache");

  for (const ch of CHANNELS) {
    // sanity: requesting again still hits cache
    const r = await adapter.request(ch, { world: {} });
    assert.ok(r);
  }
  assert.equal(stub.callCount(), 1);
});

test("FlatBaselineAdapter: cache TTL expiry triggers a fresh LLM call", async () => {
  const stub = makeStubLLMClient(fakeFusedResponse());
  const adapter = new FlatBaselineAdapter({ llmClient: stub, cacheTtlMs: 1 });

  await adapter.request("environment-director", { world: {} });
  assert.equal(stub.callCount(), 1);

  // Wait long enough for TTL to expire.
  await new Promise((r) => setTimeout(r, 5));

  await adapter.request("environment-director", { world: {} });
  assert.equal(stub.callCount(), 2, "post-TTL request triggers a fresh fused call");
});

test("FlatBaselineAdapter: malformed fused response yields per-channel fallback", async () => {
  const stub = makeStubLLMClient({
    fallback: false,
    data: "not a json object {{{",
    latencyMs: 0,
    error: "",
    model: "stub-flat",
    debug: null,
  });
  const adapter = new FlatBaselineAdapter({ llmClient: stub });

  const r = await adapter.request("environment-director", { world: {} });
  assert.equal(r.fallback, true);
  assert.equal(r.data, null);
});
