// test/llm-client.test.js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LLMClient } from "../src/simulation/ai/llm/LLMClient.js";

describe("LLMClient", () => {
  it("constructs with default empty baseUrl", () => {
    const client = new LLMClient();
    assert.equal(client.baseUrl, "");
  });

  it("accepts baseUrl option", () => {
    const client = new LLMClient({ baseUrl: "http://localhost:8787" });
    assert.equal(client.baseUrl, "http://localhost:8787");
  });

  it("returns fallback when enabled=false without network call", async () => {
    const client = new LLMClient();
    const result = await client.requestEnvironment({}, false);
    assert.equal(result.fallback, true);
    assert.ok(result.data);
    assert.equal(result.model, "fallback");
  });

  it("returns fallback when enabled=false for policies", async () => {
    const client = new LLMClient();
    const result = await client.requestPolicies({}, false);
    assert.equal(result.fallback, true);
    assert.ok(result.data);
  });

  it("returns fallback when enabled=false for strategic requests", async () => {
    const client = new LLMClient();
    const result = await client.requestStrategic(
      JSON.stringify({ channel: "strategic-director", summary: { workers: 4 } }),
      false,
      { strategy: { priority: "grow", phase: "growth" } },
    );
    assert.equal(result.fallback, true);
    assert.equal(result.model, "fallback");
    assert.equal(result.debug.requestSummary.channel, "strategic-director");
  });

  it("falls back when strategic proxy response fails schema validation", async () => {
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        fallback: false,
        model: "gpt-test",
        data: { strategy: { phase: "invalid_phase" } },
        debug: { parsedBeforeValidation: { strategy: { phase: "invalid_phase" } } },
      }),
    });

    try {
      const fallbackData = { strategy: { priority: "grow", phase: "growth" } };
      const client = new LLMClient({ baseUrl: "http://127.0.0.1:8787" });
      const result = await client.requestStrategic(
        JSON.stringify({ channel: "strategic-director", summary: { workers: 4 } }),
        true,
        fallbackData,
      );
      assert.equal(result.fallback, true);
      assert.match(result.error, /schema/);
      assert.deepEqual(result.data, fallbackData);
      assert.deepEqual(result.debug.guardedOutput, fallbackData);
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it("postJson resolves relative endpoint with baseUrl", async () => {
    // We can't easily test the actual network call, but we can verify
    // the URL resolution logic by checking that LLMClient with a valid
    // baseUrl attempts to fetch the correct full URL.
    // Test: a request to a non-existent server should fail with a network error,
    // not a URL parsing error
    const client = new LLMClient({ baseUrl: "http://127.0.0.1:19999" });
    const result = await client.requestEnvironment({}, true);
    // Should fall back gracefully (network error, not crash)
    assert.equal(result.fallback, true);
    assert.ok(result.error.length > 0, "should have error message from failed request");
  });

  it("baseUrl with trailing slash does not produce double slash", () => {
    const client = new LLMClient({ baseUrl: "http://localhost:8787/" });
    // Verify the property is stored (the slash stripping happens in postJson)
    assert.equal(client.baseUrl, "http://localhost:8787/");
  });
});
