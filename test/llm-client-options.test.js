// test/llm-client-options.test.js
// P1 reviewer-fix L-1: LLMClient.requestXxx must accept a 4th `options` arg
// (LayerCast metadata: inference_config / headers / model / temperature / top_p)
// and forward it through fetch — not silently drop it.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LLMClient } from "../src/simulation/ai/llm/LLMClient.js";

function makeFetchSpy(response) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      json: async () => response,
      text: async () => "",
    };
  };
  fn.calls = calls;
  return fn;
}

const VALID_ENV_DIRECTIVE = {
  weather: "clear",
  durationSec: 20,
  factionTension: 0.4,
  eventSpawns: [],
};


describe("LLMClient options bridge (LayerCast metadata pass-through)", () => {
  it("requestStrategic forwards options.headers + options.inference_config to fetch", async () => {
    const prevFetch = globalThis.fetch;
    const spy = makeFetchSpy({
      fallback: false,
      model: "qwen-test",
      data: { strategy: { phase: "growth", priority: "grow" } },
      debug: null,
    });
    globalThis.fetch = spy;

    try {
      const client = new LLMClient({ baseUrl: "http://127.0.0.1:8787" });
      const result = await client.requestStrategic(
        JSON.stringify({ channel: "strategic-director", summary: { workers: 4 } }),
        true,
        null,
        {
          headers: {
            "X-LayerCast-Weights": "bf16",
            "X-LayerCast-Compute": "fp32",
            "X-LayerCast-Deterministic": "true",
          },
          inference_config: { weights: "bf16", compute: "fp32", deterministic: true },
          model: "qwen-2.5-7b-layercast",
          temperature: 0,
          top_p: 1,
        },
      );

      assert.equal(result.fallback, false, "should not fall back when proxy returns valid data");
      assert.equal(spy.calls.length, 1, "fetch was called exactly once");
      const init = spy.calls[0].init;

      // Headers preserved
      assert.equal(init.headers["X-LayerCast-Weights"], "bf16");
      assert.equal(init.headers["X-LayerCast-Compute"], "fp32");
      assert.equal(init.headers["X-LayerCast-Deterministic"], "true");
      // Default JSON content-type still present
      assert.equal(init.headers["Content-Type"], "application/json");

      // Body merged
      const body = JSON.parse(init.body);
      assert.deepEqual(body.inference_config, { weights: "bf16", compute: "fp32", deterministic: true });
      assert.equal(body.model, "qwen-2.5-7b-layercast");
      assert.equal(body.temperature, 0);
      assert.equal(body.top_p, 1);
      // Existing summary still present
      assert.ok(body.summary, "request body still carries the original summary field");
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it("requestEnvironment accepts options and forwards model override into body", async () => {
    const prevFetch = globalThis.fetch;
    const spy = makeFetchSpy({
      fallback: false,
      model: "gpt-5-mini",
      directive: VALID_ENV_DIRECTIVE,
    });
    globalThis.fetch = spy;

    try {
      const client = new LLMClient({ baseUrl: "http://127.0.0.1:8787" });
      const result = await client.requestEnvironment(
        { worldSummary: "smoke" },
        true,
        { model: "gpt-5-mini", temperature: 0.2 },
      );
      assert.equal(result.fallback, false);
      assert.equal(spy.calls.length, 1);
      const body = JSON.parse(spy.calls[0].init.body);
      assert.equal(body.model, "gpt-5-mini");
      assert.equal(body.temperature, 0.2);
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it("requestPolicies forwards options.headers + inference_config to fetch", async () => {
    const prevFetch = globalThis.fetch;
    // Return a payload that fails policy schema validation; that's fine —
    // this test only cares that headers + body reached fetch BEFORE the
    // schema check decided to fall back.
    const spy = makeFetchSpy({
      fallback: false,
      model: "stub",
      policies: [],
    });
    globalThis.fetch = spy;

    try {
      const client = new LLMClient({ baseUrl: "http://127.0.0.1:8787" });
      await client.requestPolicies(
        { groups: [] },
        true,
        {
          headers: { "X-LayerCast-Weights": "bf16" },
          inference_config: { weights: "bf16", deterministic: true },
        },
      );
      // We don't assert on result.fallback (schema validation may force it
      // to true). What we DO assert is that the LayerCast metadata reached
      // the wire — which is the entire point of the L-1 fix.
      assert.equal(spy.calls.length, 1);
      assert.equal(spy.calls[0].init.headers["X-LayerCast-Weights"], "bf16");
      const body = JSON.parse(spy.calls[0].init.body);
      assert.deepEqual(body.inference_config, { weights: "bf16", deterministic: true });
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it("requestPlan forwards inference_config + headers (LayerCast metadata)", async () => {
    const prevFetch = globalThis.fetch;
    const spy = makeFetchSpy({
      fallback: true, // skip plan-schema validation by signaling proxy fallback
      model: "qwen-test",
      error: "no api key",
      debug: null,
    });
    globalThis.fetch = spy;

    try {
      const client = new LLMClient({ baseUrl: "http://127.0.0.1:8787" });
      const result = await client.requestPlan(
        "system prompt",
        "user prompt",
        {
          headers: { "X-LayerCast-Deterministic": "true" },
          inference_config: { weights: "bf16", compute: "fp32", deterministic: true },
          model: "qwen-2.5-7b-layercast",
          temperature: 0,
        },
      );

      assert.equal(result.ok, false);
      assert.equal(result.source, "proxy-fallback");
      assert.equal(spy.calls.length, 1);

      // Headers reached fetch
      assert.equal(spy.calls[0].init.headers["X-LayerCast-Deterministic"], "true");

      // Body carries inference_config (merged via mergeRequestOptions) +
      // legacy spread (model lands at top level too).
      const body = JSON.parse(spy.calls[0].init.body);
      assert.deepEqual(body.inference_config, { weights: "bf16", compute: "fp32", deterministic: true });
      assert.equal(body.model, "qwen-2.5-7b-layercast");
      assert.equal(body.systemPrompt, "system prompt");
      assert.equal(body.userPrompt, "user prompt");
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it("requestStrategic without options keeps default fetch headers (back-compat)", async () => {
    const prevFetch = globalThis.fetch;
    const spy = makeFetchSpy({
      fallback: false,
      model: "stub",
      data: { strategy: { phase: "growth", priority: "grow" } },
      debug: null,
    });
    globalThis.fetch = spy;

    try {
      const client = new LLMClient({ baseUrl: "http://127.0.0.1:8787" });
      const result = await client.requestStrategic(
        JSON.stringify({ channel: "strategic-director", summary: {} }),
        true,
        null,
        // No options arg — should not throw, should not introduce extra headers.
      );
      assert.equal(result.fallback, false);
      assert.equal(spy.calls.length, 1);
      const headers = spy.calls[0].init.headers;
      // Only Content-Type when caller did not supply options
      assert.equal(headers["Content-Type"], "application/json");
      assert.equal(Object.keys(headers).length, 1, `expected exactly 1 header, got: ${Object.keys(headers).join(",")}`);
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it("ignores non-finite temperature/top_p in options without crashing", async () => {
    const prevFetch = globalThis.fetch;
    const spy = makeFetchSpy({
      fallback: false,
      model: "stub",
      data: { strategy: { phase: "growth" } },
      debug: null,
    });
    globalThis.fetch = spy;

    try {
      const client = new LLMClient({ baseUrl: "http://127.0.0.1:8787" });
      await client.requestStrategic(
        JSON.stringify({ channel: "strategic-director", summary: {} }),
        true,
        null,
        { temperature: NaN, top_p: undefined, model: "" },
      );
      const body = JSON.parse(spy.calls[0].init.body);
      assert.equal(body.temperature, undefined, "NaN temperature is ignored");
      assert.equal(body.top_p, undefined, "undefined top_p is ignored");
      assert.equal(body.model, undefined, "empty model string is ignored");
    } finally {
      globalThis.fetch = prevFetch;
    }
  });
});
