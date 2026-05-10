// RecordReplayCache — VCR-cassette LLM cache for the academic benchmark.
//
// Modes:
//   - "record"  — every get() returns null; the caller is expected to run
//                 the real adapter and then call put(req, response). The
//                 cache writes (key, request_summary, response, timestamp)
//                 to an NDJSON cassette on flush().
//   - "replay"  — every get() looks the request up in the cassette and
//                 returns the cached response, OR throws
//                 RecordReplayCacheMiss on miss. put() is a no-op.
//   - "auto"    — replay first; on miss, behaves like record (returns
//                 null from get(), accepts put()). Useful for dev runs
//                 where you want to top up the cassette without nuking
//                 it.
//
// Cassette format: NDJSON, one JSON object per line:
//   { "key": "<sha256>", "request_summary": {...}, "response": {...},
//     "timestamp": "<ISO>" }
//
// Cache key canonicalization:
//   sha256(JSON.stringify({channel, model, prompt, temperature, top_p}))
// with keys serialized in a fixed order. This guarantees the same
// (channel,model,prompt,temp,top_p) tuple always hashes identically
// regardless of object property order.
//
// Adapter wrap helper: `wrapAdapterWithCache(adapter, cache)` returns an
// AgentAdapter that consults the cache before delegating, and records
// adapter responses to the cache on miss.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { AgentAdapter } from "./AgentAdapter.js";
import {
  buildEnvironmentPromptUserContent,
  buildPolicyPromptUserContent,
} from "./PromptPayload.js";

export class RecordReplayCacheMiss extends Error {
  constructor(key, summary) {
    super(`record-replay miss: key=${key}`);
    this.name = "RecordReplayCacheMiss";
    this.key = key;
    this.summary = summary;
  }
}

const VALID_MODES = new Set(["record", "replay", "auto"]);

// Property order matters for sha256 stability — we hand-serialize.
function canonicalizeRequest(req) {
  return {
    channel: String(req?.channel ?? ""),
    model: String(req?.model ?? ""),
    prompt: typeof req?.prompt === "string" ? req.prompt : JSON.stringify(req?.prompt ?? null),
    temperature: Number.isFinite(Number(req?.temperature)) ? Number(req.temperature) : null,
    top_p: Number.isFinite(Number(req?.top_p)) ? Number(req.top_p) : null,
  };
}

function canonicalKeyJson(req) {
  const c = canonicalizeRequest(req);
  // Hand-built JSON to fix property order across engines.
  return `{"channel":${JSON.stringify(c.channel)},`
       + `"model":${JSON.stringify(c.model)},`
       + `"prompt":${JSON.stringify(c.prompt)},`
       + `"temperature":${JSON.stringify(c.temperature)},`
       + `"top_p":${JSON.stringify(c.top_p)}}`;
}

function summarizeRequest(req) {
  const c = canonicalizeRequest(req);
  return {
    channel: c.channel,
    model: c.model,
    promptLength: c.prompt.length,
    temperature: c.temperature,
    top_p: c.top_p,
  };
}

export class RecordReplayCache {
  /**
   * @param {string} cassettePath — file path for NDJSON cassette
   * @param {"record"|"replay"|"auto"} [mode="replay"]
   */
  constructor(cassettePath, mode = "replay") {
    if (!cassettePath || typeof cassettePath !== "string") {
      throw new Error("RecordReplayCache: cassettePath required");
    }
    if (!VALID_MODES.has(mode)) {
      throw new Error(`RecordReplayCache: invalid mode "${mode}"; expected one of ${[...VALID_MODES].join(", ")}`);
    }
    this.cassettePath = cassettePath;
    this.mode = mode;
    /** @type {Map<string, {request_summary:object, response:object, timestamp:string}>} */
    this._entries = new Map();
    this._loaded = false;
    this._dirty = false;
    this._stats = { hits: 0, misses: 0, total: 0 };
  }

  /** sha256 hex digest of canonicalized request. */
  computeKey(req) {
    const json = canonicalKeyJson(req);
    return createHash("sha256").update(json).digest("hex");
  }

  async _ensureLoaded() {
    if (this._loaded) return;
    this._loaded = true;
    try {
      const txt = await fs.readFile(this.cassettePath, "utf8");
      const lines = txt.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const entry = JSON.parse(trimmed);
          if (entry && typeof entry.key === "string" && entry.response !== undefined) {
            this._entries.set(entry.key, {
              request_summary: entry.request_summary ?? null,
              response: entry.response,
              timestamp: entry.timestamp ?? "",
            });
          }
        } catch {
          // skip malformed line
        }
      }
    } catch (err) {
      if (err && err.code === "ENOENT") {
        // Fresh cassette — no entries yet.
        return;
      }
      throw err;
    }
  }

  /**
   * @param {object} req
   * @returns {Promise<object|null>} cached DecisionResponse or null on miss
   */
  async get(req) {
    await this._ensureLoaded();
    const key = this.computeKey(req);
    this._stats.total += 1;
    const entry = this._entries.get(key);

    if (this.mode === "record") {
      // Record mode never returns cached entries — caller will record
      // after running the adapter.
      this._stats.misses += 1;
      return null;
    }

    if (entry) {
      this._stats.hits += 1;
      // Defensive copy so callers can mutate freely.
      return JSON.parse(JSON.stringify(entry.response));
    }

    this._stats.misses += 1;

    if (this.mode === "replay") {
      throw new RecordReplayCacheMiss(key, summarizeRequest(req));
    }
    // auto: miss falls through to record-on-put.
    return null;
  }

  /**
   * @param {object} req
   * @param {object} response
   */
  async put(req, response) {
    if (this.mode === "replay") {
      // Strict replay never records.
      return;
    }
    await this._ensureLoaded();
    const key = this.computeKey(req);
    this._entries.set(key, {
      request_summary: summarizeRequest(req),
      response: JSON.parse(JSON.stringify(response ?? null)),
      timestamp: new Date().toISOString(),
    });
    this._dirty = true;
  }

  async flush() {
    if (this.mode === "replay") return;
    if (!this._dirty && this._entries.size === 0) {
      // Still ensure the file exists so downstream replay can find it.
      try { await fs.mkdir(path.dirname(this.cassettePath), { recursive: true }); } catch { /* noop */ }
      try { await fs.writeFile(this.cassettePath, "", "utf8"); } catch { /* noop */ }
      return;
    }
    const lines = [];
    for (const [key, entry] of this._entries) {
      lines.push(JSON.stringify({
        key,
        request_summary: entry.request_summary,
        response: entry.response,
        timestamp: entry.timestamp,
      }));
    }
    try {
      await fs.mkdir(path.dirname(this.cassettePath), { recursive: true });
    } catch { /* noop */ }
    await fs.writeFile(this.cassettePath, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
    this._dirty = false;
  }

  stats() {
    const { hits, misses, total } = this._stats;
    return {
      hits,
      misses,
      total,
      hitRate: total > 0 ? hits / total : 0,
    };
  }
}

// ----- adapter wrap helper -----

function inferRequestKey(channel, payload, options) {
  const promptStr = (() => {
    if (channel === "environment-director") return buildEnvironmentPromptUserContent(payload);
    if (channel === "npc-policy") return buildPolicyPromptUserContent(payload);
    if (typeof payload === "string") return payload;
    try { return JSON.stringify(payload); } catch { return String(payload); }
  })();
  return {
    channel,
    model: String(options?.model ?? ""),
    prompt: promptStr,
    temperature: Number.isFinite(Number(options?.temperature)) ? Number(options.temperature) : null,
    top_p: Number.isFinite(Number(options?.top_p)) ? Number(options.top_p) : null,
  };
}

class CachedAdapter extends AgentAdapter {
  constructor(adapter, cache) {
    super();
    this._adapter = adapter;
    this._cache = cache;
  }

  async request(channel, payload, options = {}) {
    const cacheReq = inferRequestKey(channel, payload, options);
    let cached = null;
    try {
      cached = await this._cache.get(cacheReq);
    } catch (err) {
      if (err instanceof RecordReplayCacheMiss) {
        // Strict replay mode and miss — surface the miss.
        throw err;
      }
      throw err;
    }
    if (cached) return cached;

    const response = await this._adapter.request(channel, payload, options);
    try {
      await this._cache.put(cacheReq, response);
    } catch {
      // best-effort
    }
    return response;
  }
}

/**
 * @param {AgentAdapter} adapter
 * @param {RecordReplayCache} cache
 * @returns {AgentAdapter}
 */
export function wrapAdapterWithCache(adapter, cache) {
  if (!adapter || typeof adapter.request !== "function") {
    throw new Error("wrapAdapterWithCache: adapter.request required");
  }
  if (!(cache instanceof RecordReplayCache)) {
    throw new Error("wrapAdapterWithCache: cache must be a RecordReplayCache instance");
  }
  return new CachedAdapter(adapter, cache);
}

export default RecordReplayCache;
