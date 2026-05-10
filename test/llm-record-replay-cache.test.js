import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  RecordReplayCache,
  RecordReplayCacheMiss,
  wrapAdapterWithCache,
} from "../src/simulation/ai/llm/RecordReplayCache.js";
import { AgentAdapter } from "../src/simulation/ai/llm/AgentAdapter.js";

async function tmpCassette() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vcr-"));
  return { dir, file: path.join(dir, "cassette.ndjson") };
}

const SAMPLE_REQ = {
  channel: "environment-director",
  model: "qwen-test",
  prompt: "hello world",
  temperature: 0,
  top_p: 1,
};

const SAMPLE_RESP = {
  data: { weather: "clear", durationSec: 20, factionTension: 0.4, eventSpawns: [] },
  fallback: false,
  usage: { promptTokens: 5, completionTokens: 7, cachedTokens: 0 },
  latencyMs: 12,
  model: "qwen-test",
  error: "",
  debug: { stub: true },
};

test("RecordReplayCache: record mode put + flush writes NDJSON", async () => {
  const { dir, file } = await tmpCassette();
  try {
    const cache = new RecordReplayCache(file, "record");

    // get() in record mode always returns null
    const miss = await cache.get(SAMPLE_REQ);
    assert.equal(miss, null);

    await cache.put(SAMPLE_REQ, SAMPLE_RESP);
    await cache.flush();

    const txt = await fs.readFile(file, "utf8");
    assert.match(txt, /"key":"[a-f0-9]{64}"/);
    assert.match(txt, /"channel":"environment-director"/);
    assert.match(txt, /"weather":"clear"/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("RecordReplayCache: replay mode hits identical request", async () => {
  const { dir, file } = await tmpCassette();
  try {
    const recCache = new RecordReplayCache(file, "record");
    await recCache.put(SAMPLE_REQ, SAMPLE_RESP);
    await recCache.flush();

    const replayCache = new RecordReplayCache(file, "replay");
    const got = await replayCache.get(SAMPLE_REQ);
    assert.ok(got);
    assert.equal(got.data.weather, "clear");
    const stats = replayCache.stats();
    assert.equal(stats.hits, 1);
    assert.equal(stats.misses, 0);
    assert.equal(stats.hitRate, 1);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("RecordReplayCache: replay mode throws on miss", async () => {
  const { dir, file } = await tmpCassette();
  try {
    const recCache = new RecordReplayCache(file, "record");
    await recCache.put(SAMPLE_REQ, SAMPLE_RESP);
    await recCache.flush();

    const replayCache = new RecordReplayCache(file, "replay");
    await assert.rejects(
      () => replayCache.get({ ...SAMPLE_REQ, prompt: "different" }),
      (err) => err instanceof RecordReplayCacheMiss,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("RecordReplayCache: auto mode records on miss, replays on hit", async () => {
  const { dir, file } = await tmpCassette();
  try {
    const cache = new RecordReplayCache(file, "auto");

    // first miss
    const first = await cache.get(SAMPLE_REQ);
    assert.equal(first, null);
    await cache.put(SAMPLE_REQ, SAMPLE_RESP);

    // second hit
    const second = await cache.get(SAMPLE_REQ);
    assert.ok(second);
    assert.equal(second.data.weather, "clear");

    const stats = cache.stats();
    assert.equal(stats.hits, 1);
    assert.equal(stats.misses, 1);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("RecordReplayCache: wrapAdapterWithCache integration", async () => {
  const { dir, file } = await tmpCassette();
  try {
    let adapterCallCount = 0;
    class StubAdapter extends AgentAdapter {
      async request(channel, _payload, _options) {
        adapterCallCount += 1;
        return {
          data: { weather: "clear", durationSec: 18, factionTension: 0.5, eventSpawns: [] },
          fallback: false,
          usage: { promptTokens: 1, completionTokens: 1, cachedTokens: 0 },
          latencyMs: 1,
          model: "stub-adapter",
          error: "",
          debug: { channel },
        };
      }
    }

    const cache = new RecordReplayCache(file, "auto");
    const wrapped = wrapAdapterWithCache(new StubAdapter(), cache);

    const payload = { world: { scenario: { title: "T" } } };
    const opts = { model: "stub-adapter", temperature: 0, top_p: 1 };

    // First call: cache miss -> hits adapter, records to cache.
    const r1 = await wrapped.request("environment-director", payload, opts);
    assert.ok(r1);
    assert.equal(adapterCallCount, 1);

    // Second call (identical): cache hit -> adapter NOT called again.
    const r2 = await wrapped.request("environment-director", payload, opts);
    assert.ok(r2);
    assert.equal(adapterCallCount, 1, "second identical request must come from cache");

    const stats = cache.stats();
    assert.equal(stats.hits, 1);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
