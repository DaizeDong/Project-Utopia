// HTTPAgentClient — pluggable AgentAdapter implementation that talks to the
// agent-bridge HTTP server (`server/agent-bridge.js`) over the
// `/api/agent/:agentId/*` route family.
//
// Unlike LLMClient (which is locked to the OpenAI-compatible /api/ai/* shape
// served by `server/ai-proxy.js`), HTTPAgentClient is channel-aware: each of
// the 4 channels (`environment-director` / `npc-policy` / `strategic-plan` /
// `colony-agent`) flows through the same `request(channel, payload, options)`
// entry point. The agent-bridge routes the request internally to whichever
// backend (LLMClient instance, FallbackAdapter, NoopAgentAdapter, vLLM, …)
// has been registered for that channel. This is the seam used by the E3
// cross-vendor matrix to assign different LLM vendors to different channels.
//
// Wire format (JSON over POST):
//   POST /api/agent/:agentId/decision
//     body  { channel, payload, schemaVersion, options }
//     reply { data, fallback?, usage?, latencyMs?, model?, error?, debug? }
//
// Failure policy mirrors AgentAdapter contract: never throw; on network /
// timeout / malformed response, return a DecisionResponse with
// `fallback: true` and a populated `error` so the caller can route to the
// deterministic policy fallback.

import { AgentAdapter, CHANNELS, SCHEMA_VERSION } from "./AgentAdapter.js";

const DEFAULT_BRIDGE_URL = "http://localhost:8788";
const DEFAULT_AGENT_ID = "default";
const DEFAULT_TIMEOUT_MS = 30_000;

function compactClientError(err) {
  const raw = String(err?.message ?? err ?? "unknown error")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "unknown error";
  const lower = raw.toLowerCase();
  if (lower.includes("timeout") || lower.includes("aborted")) return "request timeout";
  if (lower.includes("fetch failed") || lower.includes("econnref")) return "agent-bridge unreachable";
  return raw.slice(0, 200);
}

function nowMs() {
  return (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();
}

function trimUrl(url) {
  return String(url ?? "").replace(/\/+$/, "");
}

function fallbackResponse(channel, error, latencyMs = 0, debug = null) {
  return {
    data: null,
    fallback: true,
    usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
    latencyMs,
    model: "fallback",
    error: String(error ?? ""),
    debug: debug ?? { channel, source: "http-agent-client" },
  };
}

function isShapedDecisionResponse(obj) {
  // Accept anything that's an object with at least `data` (may be null) or
  // an explicit `fallback` flag. Reject arrays / primitives / null bodies.
  return Boolean(obj) && typeof obj === "object" && !Array.isArray(obj)
    && (Object.prototype.hasOwnProperty.call(obj, "data")
      || Object.prototype.hasOwnProperty.call(obj, "fallback"));
}

export class HTTPAgentClient extends AgentAdapter {
  /**
   * @param {object} opts
   * @param {string} [opts.agentBridgeUrl="http://localhost:8788"]
   * @param {string} [opts.agentId="default"]
   * @param {number} [opts.timeoutMs=30000]
   * @param {Record<string,string>} [opts.headers] — extra request headers
   * @param {typeof fetch} [opts.fetchImpl] — DI seam for tests
   */
  constructor(opts = {}) {
    super();
    this.agentBridgeUrl = trimUrl(opts.agentBridgeUrl ?? DEFAULT_BRIDGE_URL);
    this.agentId = String(opts.agentId ?? DEFAULT_AGENT_ID);
    this.timeoutMs = Math.max(500, Number(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
    this.headers = { ...(opts.headers ?? {}) };
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.lastError = "";
    this.lastLatencyMs = 0;
    this.lastStatus = "unknown";
  }

  /**
   * @param {import("./AgentAdapter.js").Channel} channel
   * @param {object} payload
   * @param {object} [options] — { timeoutMs?, signal?, schemaVersion? }
   * @returns {Promise<import("./AgentAdapter.js").DecisionResponse>}
   */
  async request(channel, payload, options = {}) {
    if (!CHANNELS.includes(channel)) {
      return fallbackResponse(channel, `unknown channel: ${channel}`);
    }
    if (typeof this.fetchImpl !== "function") {
      return fallbackResponse(channel, "fetch unavailable in this runtime");
    }

    const url = `${this.agentBridgeUrl}/api/agent/${encodeURIComponent(this.agentId)}/decision`;
    const body = {
      channel,
      payload,
      schemaVersion: options.schemaVersion ?? SCHEMA_VERSION,
      options: {
        timeoutMs: options.timeoutMs ?? this.timeoutMs,
      },
    };

    const ctrl = new AbortController();
    const externalSignal = options.signal;
    if (externalSignal) {
      if (externalSignal.aborted) ctrl.abort(externalSignal.reason);
      else externalSignal.addEventListener("abort", () => ctrl.abort(externalSignal.reason), { once: true });
    }
    const timeoutMs = Math.max(100, Number(options.timeoutMs ?? this.timeoutMs) || this.timeoutMs);
    const timer = setTimeout(() => ctrl.abort("timeout"), timeoutMs);
    const started = nowMs();

    try {
      const resp = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.headers,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const latencyMs = nowMs() - started;
      this.lastLatencyMs = latencyMs;

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        const short = text ? text.replace(/\s+/g, " ").trim().slice(0, 140) : "";
        this.lastStatus = "down";
        this.lastError = short ? `HTTP ${resp.status}: ${short}` : `HTTP ${resp.status}`;
        return fallbackResponse(channel, this.lastError, latencyMs);
      }

      let parsed;
      try {
        parsed = await resp.json();
      } catch (err) {
        this.lastStatus = "down";
        this.lastError = `malformed JSON: ${compactClientError(err)}`;
        return fallbackResponse(channel, this.lastError, latencyMs);
      }

      if (!isShapedDecisionResponse(parsed)) {
        this.lastStatus = "down";
        this.lastError = "malformed agent-bridge response (missing data/fallback)";
        return fallbackResponse(channel, this.lastError, latencyMs);
      }

      this.lastStatus = "up";
      this.lastError = String(parsed.error ?? "");

      // Normalise into the DecisionResponse contract; preserve any
      // backend-supplied fields and only fill in defaults for missing keys.
      return {
        data: parsed.data ?? null,
        fallback: Boolean(parsed.fallback),
        usage: parsed.usage ?? { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
        latencyMs: Number.isFinite(parsed.latencyMs) ? parsed.latencyMs : latencyMs,
        model: String(parsed.model ?? ""),
        error: String(parsed.error ?? ""),
        debug: parsed.debug ?? null,
      };
    } catch (err) {
      this.lastStatus = "down";
      this.lastError = compactClientError(err);
      return fallbackResponse(channel, this.lastError, nowMs() - started);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Poll the agent-bridge for adapter-side health. Returns
   * `{ healthy: boolean, lastSeen: number, error? }` — never throws.
   */
  async health() {
    if (typeof this.fetchImpl !== "function") {
      return { healthy: false, lastSeen: 0, error: "fetch unavailable" };
    }
    const url = `${this.agentBridgeUrl}/api/agent/${encodeURIComponent(this.agentId)}/health`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort("timeout"), Math.min(5000, this.timeoutMs));
    try {
      const resp = await this.fetchImpl(url, {
        method: "GET",
        headers: { ...this.headers },
        signal: ctrl.signal,
      });
      if (!resp.ok) {
        return { healthy: false, lastSeen: 0, error: `HTTP ${resp.status}` };
      }
      const data = await resp.json().catch(() => ({}));
      return {
        healthy: Boolean(data?.healthy ?? data?.ok ?? false),
        lastSeen: Number(data?.lastSeen ?? 0) || 0,
        ...(data?.error ? { error: String(data.error) } : {}),
      };
    } catch (err) {
      return { healthy: false, lastSeen: 0, error: compactClientError(err) };
    } finally {
      clearTimeout(timer);
    }
  }
}

export default HTTPAgentClient;
