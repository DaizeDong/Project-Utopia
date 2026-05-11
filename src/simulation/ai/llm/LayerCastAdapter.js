// LayerCastAdapter — hardware-independent bit-identical LLM inference adapter.
//
// Wraps the project's existing LLMClient with a "LayerCast" inference-mode
// flag (Yuan et al., NeurIPS 2025 Oral): bf16 weights + FP32 compute, with
// deterministic mode requested explicitly. Because we don't ship a real
// LayerCast inference server, this adapter operates in two modes:
//
//   1. Passthrough — adds LayerCast headers + an `inference_config` block
//      to the request body. If the proxy echoes back
//      `inference_config_acknowledged: true` (or the response usage block
//      reports `deterministic: true`), the adapter records that
//      deterministic mode is active and continues passthrough.
//
//   2. Record-replay fallback — if the first response does NOT acknowledge
//      LayerCast support, the adapter sets `_supported = false` and
//      delegates subsequent calls to a record-replay cache (see
//      RecordReplayCache.js). This guarantees bit-identical replay across
//      hardware even when the underlying inference server doesn't
//      support deterministic mode natively.
//
// Inference fingerprint is included in cache keys so that switching model
// snapshot ID, temperature, or top_p invalidates replay. The fingerprint
// is intentionally narrow: model + temperature + top_p (the three knobs
// that change deterministic output between runs even with identical
// prompts and weights).

import { AgentAdapter, CHANNELS, SCHEMA_VERSION } from "./AgentAdapter.js";
import { LLMClient } from "./LLMClient.js";
import {
  buildEnvironmentPromptUserContent,
  buildPolicyPromptUserContent,
} from "./PromptPayload.js";
import { guardEnvironmentDirective, guardGroupPolicies } from "./Guardrails.js";
import { validateEnvironmentDirective, validateGroupPolicy } from "./ResponseSchema.js";

export const LAYERCAST_HEADERS = Object.freeze({
  "X-LayerCast-Weights": "bf16",
  "X-LayerCast-Compute": "fp32",
  "X-LayerCast-Deterministic": "true",
});

export const LAYERCAST_INFERENCE_CONFIG = Object.freeze({
  weights: "bf16",
  compute: "fp32",
  deterministic: true,
});

const ENV_VAR_NAME = "LAYERCAST_DETERMINISTIC_MODE";

function nowMs() {
  return (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();
}

function setEnvFlag() {
  // Best-effort flag setter for downstream native bridges. process.env is
  // string-only on Node; ignore in browsers.
  try {
    if (typeof process !== "undefined" && process && process.env) {
      process.env[ENV_VAR_NAME] = "true";
    }
  } catch {
    /* noop */
  }
}

function buildPromptForChannel(channel, payload) {
  if (channel === "environment-director") return buildEnvironmentPromptUserContent(payload);
  if (channel === "npc-policy") return buildPolicyPromptUserContent(payload);
  // strategic-plan and colony-agent come in pre-built (or as summary objects);
  // stringify so cache keys are stable.
  if (typeof payload === "string") return payload;
  try { return JSON.stringify(payload); } catch { return String(payload); }
}

function inferDeterministicMode(result) {
  // Accept several forms: explicit acknowledgement at the top level, in the
  // debug envelope, or in the OpenAI-compatible `usage` block.
  if (!result || typeof result !== "object") return false;
  if (result.inference_config_acknowledged === true) return true;
  if (result.usage && (result.usage.deterministic === true || result.usage.layercast === true)) return true;
  if (result.debug && result.debug.inference_config_acknowledged === true) return true;
  if (result.model && /layercast/i.test(String(result.model))) return true;
  return false;
}

function fingerprintFor(model, temperature, topP) {
  return [
    `model=${model || "unknown"}`,
    `temp=${Number.isFinite(temperature) ? Number(temperature).toFixed(4) : "default"}`,
    `top_p=${Number.isFinite(topP) ? Number(topP).toFixed(4) : "default"}`,
  ].join("|");
}

function emptyFallback(channel, error, latencyMs = 0, model = "layercast-fallback") {
  return {
    data: null,
    fallback: true,
    usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
    latencyMs,
    model,
    error: String(error || "layercast adapter fallback"),
    debug: { channel, reason: "fallback" },
  };
}

export class LayerCastAdapter extends AgentAdapter {
  /**
   * @param {object} [opts]
   * @param {string} [opts.baseUrl]
   * @param {string} [opts.model]
   * @param {number} [opts.temperature]
   * @param {number} [opts.topP]
   * @param {object} [opts.llmClient]    — injected stub for tests.
   *   Must expose `requestStrategic(promptStr, enabled, fallbackData, options?)`.
   * @param {object} [opts.recordReplayCache]
   *   — Optional RecordReplayCache instance to use when LayerCast is
   *   unsupported. If not provided, fallback simply throws on missing
   *   support.
   */
  constructor(opts = {}) {
    super();
    this.baseUrl = opts.baseUrl ?? "";
    this.model = opts.model ?? "";
    this.temperature = Number.isFinite(opts.temperature) ? Number(opts.temperature) : 0;
    this.topP = Number.isFinite(opts.topP) ? Number(opts.topP) : 1;
    this.llmClient = opts.llmClient ?? new LLMClient({ baseUrl: this.baseUrl });
    this.recordReplayCache = opts.recordReplayCache ?? null;

    // Verified after first request:
    //   null      — not yet probed
    //   true      — proxy acknowledged LayerCast / response reported det mode
    //   false     — proxy did NOT acknowledge; fallback to record-replay
    this._supported = null;
    this._lastFingerprint = "";
    this._headers = { ...LAYERCAST_HEADERS };
    this._capturedRequests = []; // for tests (last call audit trail)

    setEnvFlag();
  }

  /** @returns {boolean|null} true if supported, false if degraded, null if not yet probed. */
  isDeterministicModeActive() {
    return this._supported === true;
  }

  _captureRequest(req) {
    // Bounded ring buffer for tests; never grows beyond 16 entries.
    this._capturedRequests.push(req);
    if (this._capturedRequests.length > 16) this._capturedRequests.shift();
  }

  /**
   * @param {string} channel
   * @param {object} payload
   * @param {object} [options]
   * @returns {Promise<object>} DecisionResponse
   */
  async request(channel, payload, options = {}) {
    if (!CHANNELS.includes(channel)) {
      return emptyFallback(channel, `unknown channel: ${channel}`);
    }

    const promptStr = buildPromptForChannel(channel, payload);
    const fingerprint = fingerprintFor(this.model, this.temperature, this.topP);
    this._lastFingerprint = fingerprint;

    const requestBody = {
      channel,
      schemaVersion: options.schemaVersion ?? SCHEMA_VERSION,
      prompt: promptStr,
      model: this.model,
      temperature: this.temperature,
      top_p: this.topP,
      inference_config: { ...LAYERCAST_INFERENCE_CONFIG },
      headers: { ...this._headers },
      fingerprint,
    };

    const cacheKeyReq = {
      channel,
      model: this.model,
      prompt: promptStr,
      temperature: this.temperature,
      top_p: this.topP,
    };

    // If we already know LayerCast isn't supported AND we have a cache,
    // skip straight to replay.
    if (this._supported === false && this.recordReplayCache) {
      const cached = await this.recordReplayCache.get(cacheKeyReq);
      if (cached) {
        return {
          ...cached,
          debug: { ...(cached.debug ?? {}), source: "record-replay", fingerprint },
        };
      }
      return emptyFallback(channel, "layercast unsupported and no replay entry", 0, this.model || "layercast-replay-miss");
    }

    this._captureRequest(requestBody);

    const startedAt = nowMs();
    let result;
    try {
      result = await this.llmClient.requestStrategic(
        promptStr,
        true,
        null,
        {
          model: this.model,
          temperature: this.temperature,
          top_p: this.topP,
          inference_config: { ...LAYERCAST_INFERENCE_CONFIG },
          headers: { ...this._headers },
        },
      );
    } catch (err) {
      const latencyMs = nowMs() - startedAt;
      // Treat as unsupported and fall through to record-replay if available.
      this._supported = false;
      if (this.recordReplayCache) {
        const cached = await this.recordReplayCache.get(cacheKeyReq);
        if (cached) {
          return { ...cached, debug: { ...(cached.debug ?? {}), source: "record-replay", fingerprint } };
        }
      }
      return emptyFallback(channel, String(err?.message ?? err ?? "layercast error"), latencyMs, this.model || "layercast-error");
    }

    // Probe for LayerCast acknowledgement.
    const supported = inferDeterministicMode(result);
    if (this._supported === null) {
      this._supported = Boolean(supported);
    }

    if (this._supported === false && this.recordReplayCache) {
      // Degraded — try replay first, otherwise record this round-trip
      // for future replay parity.
      const cached = await this.recordReplayCache.get(cacheKeyReq);
      if (cached) {
        return { ...cached, debug: { ...(cached.debug ?? {}), source: "record-replay", fingerprint } };
      }
      // Best-effort record so next run is bit-identical; ignore failure.
      try { await this.recordReplayCache.put(cacheKeyReq, this._wrapResponse(channel, result, fingerprint)); } catch { /* noop */ }
    }

    return this._wrapResponse(channel, result, fingerprint);
  }

  _wrapResponse(channel, result, fingerprint) {
    const fallback = Boolean(result?.fallback);
    let data = result?.data ?? null;
    let error = String(result?.error ?? "");

    // Per-channel guardrail/validation for env + policy. Strategic + colony
    // pass through (their schemas live elsewhere).
    if (!fallback && data) {
      if (channel === "environment-director") {
        const v = validateEnvironmentDirective(data);
        if (!v.ok) { error = `schema: ${v.error}`; data = null; }
        else data = guardEnvironmentDirective(v.value);
      } else if (channel === "npc-policy") {
        const candidate = data.policies ? data : { policies: data };
        const v = validateGroupPolicy(candidate);
        if (!v.ok) { error = `schema: ${v.error}`; data = null; }
        else data = guardGroupPolicies(v.value);
      }
    }

    return {
      data,
      fallback: fallback || data == null,
      usage: {
        promptTokens: Number(result?.usage?.promptTokens) || 0,
        completionTokens: Number(result?.usage?.completionTokens) || 0,
        cachedTokens: Number(result?.usage?.cachedTokens) || 0,
      },
      latencyMs: Number(result?.latencyMs) || 0,
      model: String(result?.model ?? this.model ?? "layercast"),
      error,
      debug: {
        channel,
        fingerprint,
        layercastSupported: this._supported,
        source: "layercast-passthrough",
        original: result?.debug ?? null,
      },
    };
  }
}

export default LayerCastAdapter;
