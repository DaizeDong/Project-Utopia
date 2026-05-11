// agent-bridge.js — standalone HTTP server that bridges the simulation's
// HTTPAgentClient calls onto a registry of pluggable backend adapters
// (LLMClient, NoopAgentAdapter, FallbackAdapter, vLLM-shaped, etc).
//
// This server is independent from `server/ai-proxy.js`. ai-proxy is the
// OpenAI-compatible JSON shim used by the production single-vendor path;
// agent-bridge is the channel-aware fan-out used by the academic benchmark
// (E3 cross-vendor matrix) where each of the four channels can be routed to
// a different vendor / adapter / fallback.
//
// Endpoints (all JSON, all CORS-permissive):
//   GET  /health
//     → { ok, service, port, agentCount, now }
//   POST /api/agent/register
//     body  { agentId, mode?: "pull"|"push", channels?: string[], pushUrl?: string,
//             cellId?: string }   ← `cellId` instantiates DEFAULT_AGENT_ROUTING[cellId]
//     reply { ok, agentId, channels, mode }
//   GET  /api/agent/:agentId/poll
//     → { ok, agentId, lastSeen, channels }
//   POST /api/agent/:agentId/decision
//     body  { channel, payload, schemaVersion, options? }
//     reply { data, fallback, usage, latencyMs, model, error, debug }
//   GET  /api/agent/:agentId/health
//     → { healthy, lastSeen, channels, agentId }
//
// Run standalone:  `node server/agent-bridge.js`  (port via $AGENT_BRIDGE_PORT)
// Programmatic:    `import { createAgentBridgeServer } from "./agent-bridge.js"`
//                  for in-process tests with a custom registry.

import http from "node:http";
import process from "node:process";

import { CHANNELS, NoopAgentAdapter, SCHEMA_VERSION } from "../src/simulation/ai/llm/AgentAdapter.js";
import {
  DEFAULT_AGENT_ROUTING,
  buildBackendsForCell,
  instantiateAdapterForBackend,
} from "./config/agent-routing.js";

const DEFAULT_PORT = Number(process.env.AGENT_BRIDGE_PORT ?? 8788) || 8788;

// Defaults for AgentRegistry stale-eviction (P1 reviewer-fix B-1).
// Tunable via AgentRegistry constructor opts in tests.
export const DEFAULT_MAX_IDLE_MS = 60 * 60 * 1000; // 1 hour
export const DEFAULT_MAX_AGENTS = 256;

function sendJson(res, code, payload) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 512 * 1024) {
        reject(new Error("payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (err) { reject(err); }
    });
    req.on("error", reject);
  });
}

function compactError(err) {
  const raw = String(err?.message ?? err ?? "unknown error")
    .replace(/\s+/g, " ")
    .trim();
  return raw ? raw.slice(0, 200) : "unknown error";
}

/**
 * Build a channel→adapter map from a cell label. Returns `null` and logs
 * if the cell is unknown so the caller can fall back to a Noop registry.
 */
function adaptersForCell(cellId) {
  if (!cellId || !DEFAULT_AGENT_ROUTING[cellId]) return null;
  const backends = buildBackendsForCell(cellId);
  const out = new Map();
  for (const [channel, backendCfg] of backends.entries()) {
    out.set(channel, instantiateAdapterForBackend(backendCfg));
  }
  return out;
}

function makeNoopChannelMap() {
  const out = new Map();
  const noop = new NoopAgentAdapter();
  for (const ch of CHANNELS) out.set(ch, noop);
  return out;
}

/**
 * @typedef {object} AgentEntry
 * @property {string} agentId
 * @property {"pull"|"push"} mode
 * @property {string[]} channels
 * @property {string|null} pushUrl
 * @property {string} cellId
 * @property {Map<string, import("../src/simulation/ai/llm/AgentAdapter.js").AgentAdapter>} adapters
 * @property {number} lastSeen
 */

class AgentRegistry {
  /**
   * @param {object} [opts]
   * @param {number} [opts.maxIdleMs] — eviction window for `evictStale()`. Default 1h.
   * @param {number} [opts.maxAgents] — hard cap; `register` throws RegistryFullError beyond it. Default 256.
   */
  constructor(opts = {}) {
    /** @type {Map<string, AgentEntry>} */
    this.agents = new Map();
    this.maxIdleMs = Number.isFinite(opts.maxIdleMs) ? Number(opts.maxIdleMs) : DEFAULT_MAX_IDLE_MS;
    this.maxAgents = Number.isFinite(opts.maxAgents) ? Number(opts.maxAgents) : DEFAULT_MAX_AGENTS;
  }

  register({ agentId, mode = "push", channels = null, pushUrl = null, cellId = "FB", adapters = null }) {
    if (!agentId || typeof agentId !== "string") throw new Error("agentId required");
    // Opportunistic eviction on every register. O(N) walk, N << maxAgents in
    // practice. Keeps the registry from growing unbounded across long
    // benchmark runs (B-1 fix).
    this.evictStale();
    if (!this.agents.has(agentId) && this.agents.size >= this.maxAgents) {
      const err = new Error(`agent registry full (cap=${this.maxAgents})`);
      err.code = "REGISTRY_FULL";
      throw err;
    }
    const channelMap = adapters instanceof Map
      ? adapters
      : (adaptersForCell(cellId) ?? makeNoopChannelMap());
    const channelList = Array.isArray(channels) && channels.length > 0
      ? channels.filter((c) => CHANNELS.includes(c))
      : Array.from(channelMap.keys());
    const entry = {
      agentId,
      mode: mode === "pull" ? "pull" : "push",
      channels: channelList,
      pushUrl: pushUrl ? String(pushUrl) : null,
      cellId: String(cellId ?? "FB"),
      adapters: channelMap,
      lastSeen: Date.now(),
    };
    this.agents.set(agentId, entry);
    return entry;
  }

  get(agentId) {
    return this.agents.get(agentId) ?? null;
  }

  touch(agentId) {
    const entry = this.agents.get(agentId);
    if (entry) entry.lastSeen = Date.now();
    return entry ?? null;
  }

  /**
   * Remove the named agent. Returns `true` if an entry was removed.
   * @param {string} agentId
   * @returns {boolean}
   */
  unregister(agentId) {
    if (!agentId || typeof agentId !== "string") return false;
    return this.agents.delete(agentId);
  }

  /**
   * Drop entries whose `lastSeen` is older than `maxIdleMs` (default
   * `this.maxIdleMs`). Returns the count of removed agents. Cheap O(N) walk
   * — invoked opportunistically by `register` and `decision` handlers so the
   * map self-prunes without a background timer.
   *
   * @param {number} [maxIdleMs]
   * @returns {number}
   */
  evictStale(maxIdleMs) {
    const cutoff = Date.now() - (Number.isFinite(maxIdleMs) ? Number(maxIdleMs) : this.maxIdleMs);
    let removed = 0;
    for (const [id, entry] of this.agents) {
      if (!entry || !Number.isFinite(entry.lastSeen) || entry.lastSeen < cutoff) {
        this.agents.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  size() { return this.agents.size; }
}

async function handleDecision(entry, body) {
  const channel = String(body?.channel ?? "");
  if (!CHANNELS.includes(channel)) {
    return {
      data: null, fallback: true,
      usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
      latencyMs: 0, model: "fallback",
      error: `unknown channel: ${channel}`,
      debug: { source: "agent-bridge", reason: "unknown-channel" },
    };
  }
  const schemaVersion = String(body?.schemaVersion ?? "");
  if (schemaVersion && schemaVersion !== SCHEMA_VERSION) {
    return {
      data: null, fallback: true,
      usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
      latencyMs: 0, model: "fallback",
      error: `schemaVersion mismatch: client=${schemaVersion} server=${SCHEMA_VERSION}`,
      debug: { source: "agent-bridge", reason: "schema-version-mismatch" },
    };
  }
  const adapter = entry.adapters.get(channel);
  if (!adapter) {
    return {
      data: null, fallback: true,
      usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
      latencyMs: 0, model: "fallback",
      error: `no backend registered for channel ${channel}`,
      debug: { source: "agent-bridge", reason: "no-backend" },
    };
  }
  const payload = body?.payload ?? {};
  const options = body?.options ?? {};
  const started = Date.now();
  try {
    const result = await adapter.request(channel, payload, options);
    const latencyMs = Number.isFinite(result?.latencyMs) ? result.latencyMs : (Date.now() - started);
    return {
      data: result?.data ?? null,
      fallback: Boolean(result?.fallback),
      usage: result?.usage ?? { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
      latencyMs,
      model: String(result?.model ?? ""),
      error: String(result?.error ?? ""),
      debug: result?.debug ?? null,
    };
  } catch (err) {
    return {
      data: null, fallback: true,
      usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
      latencyMs: Date.now() - started,
      model: "fallback",
      error: compactError(err),
      debug: { source: "agent-bridge", reason: "adapter-threw" },
    };
  }
}

function matchAgentRoute(url, method) {
  // /api/agent/register          POST
  // /api/agent/:id/poll          GET
  // /api/agent/:id/decision      POST
  // /api/agent/:id/health        GET
  // /api/agent/:id/unregister    DELETE | POST  (B-1 fix)
  if (!url.startsWith("/api/agent/")) return null;
  const tail = url.slice("/api/agent/".length);
  if (tail === "register" && method === "POST") return { kind: "register" };
  const slash = tail.indexOf("/");
  if (slash < 0) return null;
  const id = decodeURIComponent(tail.slice(0, slash));
  const sub = tail.slice(slash + 1);
  if (!id) return null;
  if (sub === "poll" && method === "GET") return { kind: "poll", agentId: id };
  if (sub === "decision" && method === "POST") return { kind: "decision", agentId: id };
  if (sub === "health" && method === "GET") return { kind: "health", agentId: id };
  if (sub === "unregister" && (method === "DELETE" || method === "POST")) {
    return { kind: "unregister", agentId: id };
  }
  return null;
}

/**
 * Build (but do not start) an http.Server backed by an AgentRegistry.
 * Exported for in-process tests; the standalone CLI path below uses this
 * and then calls `.listen()` on the returned server.
 *
 * @param {object} [opts]
 * @param {AgentRegistry} [opts.registry]
 * @returns {{ server: http.Server, registry: AgentRegistry }}
 */
export function createAgentBridgeServer(opts = {}) {
  const registry = opts.registry ?? new AgentRegistry();

  const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      sendJson(res, 200, { ok: true });
      return;
    }

    const url = req.url ?? "/";

    if (req.method === "GET" && url === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "agent-bridge",
        agentCount: registry.size(),
        schemaVersion: SCHEMA_VERSION,
        now: new Date().toISOString(),
      });
      return;
    }

    const route = matchAgentRoute(url, req.method ?? "");
    if (!route) {
      sendJson(res, 404, { ok: false, error: "not found" });
      return;
    }

    try {
      if (route.kind === "register") {
        const body = await readBody(req);
        let entry;
        try {
          entry = registry.register({
            agentId: String(body?.agentId ?? ""),
            mode: body?.mode,
            channels: body?.channels,
            pushUrl: body?.pushUrl,
            cellId: body?.cellId,
          });
        } catch (err) {
          if (err && err.code === "REGISTRY_FULL") {
            sendJson(res, 503, {
              ok: false,
              error: compactError(err),
              code: "REGISTRY_FULL",
              agentCount: registry.size(),
              maxAgents: registry.maxAgents,
            });
            return;
          }
          throw err;
        }
        sendJson(res, 200, {
          ok: true,
          agentId: entry.agentId,
          channels: entry.channels,
          mode: entry.mode,
          cellId: entry.cellId,
        });
        return;
      }

      if (route.kind === "unregister") {
        const removed = registry.unregister(route.agentId);
        if (!removed) {
          sendJson(res, 404, { ok: false, error: `agent not registered: ${route.agentId}` });
          return;
        }
        sendJson(res, 200, { ok: true, agentId: route.agentId, removed: true });
        return;
      }

      const entry = registry.get(route.agentId);
      if (!entry) {
        sendJson(res, 404, { ok: false, error: `agent not registered: ${route.agentId}` });
        return;
      }
      registry.touch(route.agentId);

      if (route.kind === "poll") {
        sendJson(res, 200, {
          ok: true,
          agentId: entry.agentId,
          lastSeen: entry.lastSeen,
          channels: entry.channels,
          mode: entry.mode,
        });
        return;
      }

      if (route.kind === "health") {
        sendJson(res, 200, {
          healthy: true,
          ok: true,
          agentId: entry.agentId,
          lastSeen: entry.lastSeen,
          channels: entry.channels,
          cellId: entry.cellId,
        });
        return;
      }

      if (route.kind === "decision") {
        const body = await readBody(req);
        const payload = await handleDecision(entry, body);
        // Opportunistic stale-eviction. Cheap O(N) walk; keeps long
        // benchmark runs from leaking dead-agent entries.
        registry.evictStale();
        sendJson(res, 200, payload);
        return;
      }

      sendJson(res, 404, { ok: false, error: "not found" });
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        fallback: true,
        error: compactError(err),
        data: null,
      });
    }
  });

  return { server, registry };
}

export { AgentRegistry };

// Standalone CLI: only runs when invoked directly (not when imported by tests).
const isDirectRun = (() => {
  try {
    const mainArg = process.argv?.[1] ?? "";
    return mainArg.endsWith("agent-bridge.js");
  } catch { return false; }
})();

if (isDirectRun) {
  const { server, registry } = createAgentBridgeServer();
  server.listen(DEFAULT_PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[agent-bridge] listening on http://localhost:${DEFAULT_PORT}  (registry=${registry.size()} agents)`);
  });
  server.on("error", (err) => {
    if (err?.code === "EADDRINUSE") {
      console.error(`[agent-bridge] port ${DEFAULT_PORT} in use. Set AGENT_BRIDGE_PORT.`);
      process.exit(1);
      return;
    }
    console.error(`[agent-bridge] server error: ${compactError(err)}`);
    process.exit(1);
  });
}
