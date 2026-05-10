// MultiBackendAdapter — cross-vendor channel router (V6.1 / E3 cell support).
//
// For E3-style cross-vendor cells (XV-OPUS-SONNET, XV-DIVERSE-LIGHT, etc.)
// each of the 4 channels can route to a different concrete AgentAdapter.
// This class wraps a `Map<channel, AgentAdapter>` so the SimHarness sees a
// single AgentAdapter while requests dispatch by channel string.
//
// Concrete adapters are constructed by `instantiateAdapterForBackend()` in
// server/config/agent-routing.js — typically NoopAgentAdapter for the
// `kind:"fallback"` case and LLMClient otherwise.
//
// Failure mode: if a request arrives for a channel that has no registered
// adapter, the router returns a synthetic fallback DecisionResponse (matches
// AgentAdapter contract — never throws on unknown channel) and increments
// `unknownChannelCount` for diagnostics.

import { AgentAdapter, CHANNELS } from "../../simulation/ai/llm/AgentAdapter.js";

function nowMs() {
  return (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();
}

export class MultiBackendAdapter extends AgentAdapter {
  /**
   * @param {Map<string, AgentAdapter>|object} channelToAdapterMap
   *   Either a Map keyed by channel name, or a plain object whose keys are
   *   channel names. Adapters not provided for a given channel will use the
   *   fallback path on `request()`.
   */
  constructor(channelToAdapterMap) {
    super();
    this._adapters = new Map();
    if (channelToAdapterMap instanceof Map) {
      for (const [k, v] of channelToAdapterMap.entries()) this._adapters.set(String(k), v);
    } else if (channelToAdapterMap && typeof channelToAdapterMap === "object") {
      for (const [k, v] of Object.entries(channelToAdapterMap)) this._adapters.set(String(k), v);
    }
    this.unknownChannelCount = 0;
    this.dispatchCount = 0;
  }

  /**
   * @param {string} channel
   * @param {object} payload
   * @param {object} [options]
   * @returns {Promise<object>} DecisionResponse
   */
  async request(channel, payload, options) {
    if (!CHANNELS.includes(channel)) {
      this.unknownChannelCount += 1;
      return this._buildFallback(channel, `unknown channel: ${channel}`);
    }
    const target = this._adapters.get(channel);
    if (!target || typeof target.request !== "function") {
      this.unknownChannelCount += 1;
      return this._buildFallback(channel, `no adapter registered for channel: ${channel}`);
    }
    this.dispatchCount += 1;
    const startMs = nowMs();
    try {
      const out = await target.request(channel, payload, options);
      // Tag the debug field so downstream telemetry can see which sub-adapter
      // the response came from.
      if (out && typeof out === "object") {
        out.debug = {
          ...(out.debug ?? {}),
          multiBackend: { channel, sub: target.constructor?.name ?? "anonymous" },
        };
      }
      return out;
    } catch (err) {
      const latencyMs = Math.max(0, nowMs() - startMs);
      return {
        data: null,
        fallback: true,
        usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
        latencyMs,
        model: "multi-backend-error",
        error: String(err?.message ?? err),
        debug: { multiBackend: { channel, sub: target.constructor?.name ?? "anonymous", caught: true } },
      };
    }
  }

  _buildFallback(channel, error) {
    return {
      data: null,
      fallback: true,
      usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
      latencyMs: 0,
      model: "multi-backend-fallback",
      error: String(error || "multi-backend fallback"),
      debug: { multiBackend: { channel, reason: "fallback" } },
    };
  }

  /** Inspect/test helper: list registered channel names. */
  channels() {
    return Array.from(this._adapters.keys());
  }
}

export default MultiBackendAdapter;
