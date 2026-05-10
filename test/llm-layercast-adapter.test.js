import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  LayerCastAdapter,
  LAYERCAST_HEADERS,
} from "../src/simulation/ai/llm/LayerCastAdapter.js";
import { RecordReplayCache } from "../src/simulation/ai/llm/RecordReplayCache.js";

function makeStubLLMClient({ responder, supportedAck = true }) {
  const calls = [];
  return {
    calls,
    requestStrategic: async (promptStr, enabled, fallbackData, options = {}) => {
      calls.push({ promptStr, options });
      if (typeof responder === "function") return responder(promptStr, options);
      return {
        fallback: false,
        data: {
          weather: "clear",
          durationSec: 20,
          factionTension: 0.4,
          eventSpawns: [],
        },
        latencyMs: 5,
        error: "",
        // Use a neutral model name; the adapter's heuristic also matches
        // /layercast/i in the model field, so we keep the stub model
        // generic to isolate the explicit acknowledgement signal.
        model: "stub-model",
        debug: null,
        // adapter checks this flag to decide deterministic mode is on
        ...(supportedAck ? { inference_config_acknowledged: true } : {}),
      };
    },
  };
}

test("LayerCastAdapter: instantiation does not throw", () => {
  const adapter = new LayerCastAdapter({ baseUrl: "http://example", model: "test-model" });
  assert.ok(adapter);
  assert.equal(adapter.isDeterministicModeActive(), false, "not yet probed");
});

test("LayerCastAdapter: request body carries LayerCast headers + inference_config", async () => {
  const stub = makeStubLLMClient({});
  const adapter = new LayerCastAdapter({ llmClient: stub, model: "qwen-test", temperature: 0, topP: 1 });
  await adapter.request("environment-director", { world: { scenario: { title: "x" } } });

  assert.equal(stub.calls.length, 1);
  const opts = stub.calls[0].options;
  assert.deepEqual(opts.inference_config, { weights: "bf16", compute: "fp32", deterministic: true });
  assert.deepEqual(opts.headers, { ...LAYERCAST_HEADERS });
  assert.equal(opts.model, "qwen-test");
  assert.equal(opts.temperature, 0);
  assert.equal(opts.top_p, 1);

  // After successful ack, deterministic mode reports active.
  assert.equal(adapter.isDeterministicModeActive(), true);
});

test("LayerCastAdapter: unsupported response triggers record-replay degrade path", async () => {
  // Use a temp cassette file so put() works.
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "layercast-cassette-"));
  const cassettePath = path.join(tmpDir, "cassette.ndjson");

  const cache = new RecordReplayCache(cassettePath, "auto");
  const stub = makeStubLLMClient({ supportedAck: false });
  const adapter = new LayerCastAdapter({
    llmClient: stub,
    model: "qwen-test",
    recordReplayCache: cache,
  });

  // First call: probes + records into cache (auto mode).
  const r1 = await adapter.request("environment-director", { world: {} });
  assert.equal(adapter.isDeterministicModeActive(), false);
  assert.ok(r1);

  // Second call: still goes through llmClient because isDeterministicModeActive
  // is only false after probe — but we coded the adapter to skip straight to
  // replay if it knows _supported is false AND a cache exists. The first
  // call already populated the cache during the same channel/payload, so
  // call #2 with the same payload should be served from replay.
  const r2 = await adapter.request("environment-director", { world: {} });
  assert.ok(r2);
  // r2 should be served by record-replay since adapter knows it's unsupported.
  assert.equal(r2?.debug?.source, "record-replay");

  await cache.flush();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("LayerCastAdapter: isDeterministicModeActive flips after first ack", async () => {
  const stub = makeStubLLMClient({ supportedAck: true });
  const adapter = new LayerCastAdapter({ llmClient: stub, model: "test" });
  assert.equal(adapter.isDeterministicModeActive(), false, "pre-probe -> false");
  await adapter.request("environment-director", { world: {} });
  assert.equal(adapter.isDeterministicModeActive(), true);
});
