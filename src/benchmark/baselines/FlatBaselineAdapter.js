// FlatBaselineAdapter — E1 control adapter for the academic benchmark.
//
// Purpose: act as the "single LLM, no hierarchy" baseline against the project's
// 4-channel agent (StrategicDirector + EnvironmentDirector + NPCBrain +
// ColonyAgent). Instead of issuing four separate prompts, this adapter fuses
// all four channels into one prompt + one round-trip, then dispatches the
// resulting four sub-objects back through `request(channel, ...)` lookups.
//
// Token budget alignment: each per-channel prompt is constructed by the usual
// PromptPayload builders, then concatenated. The reported per-channel
// `usage.promptTokens` is `Math.round(fusedPromptTokens / 4)` so a 4-channel
// hierarchical baseline and a flat baseline are scored on comparable budgets.
//
// Cache: a single fused response is reused for 30 seconds (configurable via
// `cacheTtlMs`). After expiry the next `request()` triggers another fused
// LLM call. Cache hits do NOT count against `llmCallCount`.
//
// Fallback: if the LLM call fails, the schema parse fails, or any sub-channel
// is missing, the adapter returns a `fallback: true` DecisionResponse with
// `data: null` for the affected channel. The remaining channels still see
// whatever fields parsed successfully.
//
// Test seam: pass `llmClient` directly via `opts.llmClient` to inject a
// stubbed object exposing `requestStrategic(prompt, enabled, fallbackData)`.

import { AgentAdapter, CHANNELS, SCHEMA_VERSION } from "../../simulation/ai/llm/AgentAdapter.js";
import { LLMClient } from "../../simulation/ai/llm/LLMClient.js";
import {
  buildEnvironmentPromptUserContent,
  buildPolicyPromptUserContent,
} from "../../simulation/ai/llm/PromptPayload.js";
import { guardEnvironmentDirective, guardGroupPolicies } from "../../simulation/ai/llm/Guardrails.js";
import { validateEnvironmentDirective, validateGroupPolicy } from "../../simulation/ai/llm/ResponseSchema.js";

const DEFAULT_CACHE_TTL_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 30_000;

const CHANNEL_KEY = Object.freeze({
  "environment-director": "env",
  "npc-policy": "policy",
  "strategic-plan": "strategic",
  "colony-agent": "colony",
});

function nowMs() {
  return (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();
}

function emptyDirectiveForChannel(channel, error) {
  return {
    data: null,
    fallback: true,
    usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
    latencyMs: 0,
    model: "flat-baseline-fallback",
    error: String(error || "flat baseline fallback"),
    debug: { channel, reason: "fallback" },
  };
}

// Crude word-count token estimate; matches what the rest of the benchmark
// uses when usage.promptTokens isn't provided by the proxy.
function estimateTokens(text) {
  if (!text) return 0;
  const s = String(text);
  if (!s.trim()) return 0;
  // ~4 chars per token, OpenAI heuristic.
  return Math.max(1, Math.round(s.length / 4));
}

function buildFusedPrompt(payloadByChannel) {
  const envPrompt = payloadByChannel["environment-director"]
    ? buildEnvironmentPromptUserContent(payloadByChannel["environment-director"])
    : "";
  const policyPrompt = payloadByChannel["npc-policy"]
    ? buildPolicyPromptUserContent(payloadByChannel["npc-policy"])
    : "";
  const strategicSummary = payloadByChannel["strategic-plan"] ?? null;
  const colonySummary = payloadByChannel["colony-agent"] ?? null;

  const header = [
    "Make all 4 decisions at once: weather (env), policy (groups), strategic plan, colony build.",
    "Output JSON object {env: {...}, policy: {...}, strategic: {...}, colony: {...}}.",
    "Each sub-object must validate against its channel schema; do not emit prose outside JSON.",
  ].join("\n");

  const body = {
    schemaVersion: SCHEMA_VERSION,
    fused: true,
    instructions: header,
    channels: {
      env: envPrompt || null,
      policy: policyPrompt || null,
      strategic: strategicSummary,
      colony: colonySummary,
    },
  };

  return JSON.stringify(body, null, 2);
}

function parseFusedResponse(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    // Already an object — accept either {env,policy,strategic,colony} or
    // a wrapper {data: {...}}.
    if (raw.env || raw.policy || raw.strategic || raw.colony) return raw;
    if (raw.data && typeof raw.data === "object") return raw.data;
    return raw;
  }
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export class FlatBaselineAdapter extends AgentAdapter {
  /**
   * @param {object} [opts]
   * @param {string} [opts.baseUrl]
   * @param {string} [opts.model]
   * @param {number} [opts.timeoutMs]
   * @param {number} [opts.cacheTtlMs]
   * @param {object} [opts.llmClient] — injected stub for tests; must expose
   *   `requestStrategic(promptStr, enabled, fallbackData)` returning
   *   `{fallback, data, latencyMs, error, model, debug}`.
   */
  constructor(opts = {}) {
    super();
    this.baseUrl = opts.baseUrl ?? "";
    this.model = opts.model ?? "";
    this.timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : DEFAULT_TIMEOUT_MS;
    this.cacheTtlMs = Number(opts.cacheTtlMs) > 0 ? Number(opts.cacheTtlMs) : DEFAULT_CACHE_TTL_MS;
    this.llmClient = opts.llmClient ?? new LLMClient({ baseUrl: this.baseUrl });

    // Cache state: shared across all 4 channels.
    this._cache = null; // { expiresAtMs, parsed, model, fusedPromptTokens, completionTokens, latencyMs }
    this._pendingPayloads = new Map(); // channel -> latest payload (waiting to be fused)
    this.llmCallCount = 0;
    this.cacheHitCount = 0;
  }

  _isCacheFresh() {
    return this._cache !== null && this._cache.expiresAtMs > nowMs();
  }

  _invalidateCache() {
    this._cache = null;
  }

  async _fuseAndCall() {
    const payloadByChannel = {};
    for (const ch of CHANNELS) {
      const p = this._pendingPayloads.get(ch);
      if (p !== undefined) payloadByChannel[ch] = p;
    }
    const fusedPrompt = buildFusedPrompt(payloadByChannel);
    const fusedPromptTokens = estimateTokens(fusedPrompt);

    let result;
    try {
      result = await this.llmClient.requestStrategic(fusedPrompt, true, null);
    } catch (err) {
      result = {
        fallback: true,
        data: null,
        latencyMs: 0,
        error: String(err?.message ?? err ?? "llm error"),
        model: this.model || "flat-baseline-error",
        debug: null,
      };
    }
    this.llmCallCount += 1;

    const parsed = parseFusedResponse(result?.data);
    const completionTokens = estimateTokens(typeof result?.data === "string" ? result.data : JSON.stringify(result?.data ?? ""));

    this._cache = {
      expiresAtMs: nowMs() + this.cacheTtlMs,
      parsed: parsed && typeof parsed === "object" ? parsed : null,
      model: String(result?.model ?? this.model ?? "flat-baseline"),
      fusedPromptTokens,
      completionTokens,
      latencyMs: Number(result?.latencyMs) || 0,
      fallback: Boolean(result?.fallback) || parsed === null,
      error: String(result?.error ?? ""),
      debug: result?.debug ?? null,
    };
    return this._cache;
  }

  /**
   * @param {string} channel
   * @param {object} payload
   * @param {object} [options]
   * @returns {Promise<object>} DecisionResponse
   */
  async request(channel, payload, options = {}) {
    if (!CHANNELS.includes(channel)) {
      return emptyDirectiveForChannel(channel, `unknown channel: ${channel}`);
    }
    // Update pending payload for this channel — only used when next fused
    // call fires (cache miss).
    this._pendingPayloads.set(channel, payload);

    let cache = this._cache;
    if (!this._isCacheFresh()) {
      cache = await this._fuseAndCall();
    } else {
      this.cacheHitCount += 1;
    }
    if (!cache) {
      return emptyDirectiveForChannel(channel, "fused-call returned no cache");
    }

    const key = CHANNEL_KEY[channel];
    const subPayload = cache.parsed ? cache.parsed[key] : null;

    // Per-channel schema gate — env + policy validate; strategic/colony pass
    // through (their schemas live in ColonyPlanner / StrategicDirector and
    // depend on state context not available here).
    let validatedData = subPayload ?? null;
    let fallback = cache.fallback || subPayload == null;
    let error = cache.error;

    if (!fallback) {
      if (channel === "environment-director") {
        const v = validateEnvironmentDirective(subPayload);
        if (!v.ok) { fallback = true; error = `schema: ${v.error}`; validatedData = null; }
        else validatedData = guardEnvironmentDirective(v.value);
      } else if (channel === "npc-policy") {
        // policy validator expects {policies:[...]} envelope.
        const candidate = subPayload.policies ? subPayload : { policies: subPayload };
        const v = validateGroupPolicy(candidate);
        if (!v.ok) { fallback = true; error = `schema: ${v.error}`; validatedData = null; }
        else validatedData = guardGroupPolicies(v.value);
      }
      // strategic-plan + colony-agent: caller validates downstream.
    }

    if (fallback && validatedData == null) {
      return {
        ...emptyDirectiveForChannel(channel, error || "fused parse failed"),
        latencyMs: cache.latencyMs,
        model: cache.model,
        usage: {
          promptTokens: Math.round(cache.fusedPromptTokens / 4),
          completionTokens: Math.round(cache.completionTokens / 4),
          cachedTokens: 0,
        },
      };
    }

    return {
      data: validatedData,
      fallback,
      usage: {
        // Aligned with 4-channel separate-call path: divide fused prompt/
        // completion budget by 4.
        promptTokens: Math.round(cache.fusedPromptTokens / 4),
        completionTokens: Math.round(cache.completionTokens / 4),
        cachedTokens: 0,
      },
      latencyMs: cache.latencyMs,
      model: cache.model,
      error,
      debug: {
        channel,
        fused: true,
        cacheAgeMs: Math.max(0, this.cacheTtlMs - (cache.expiresAtMs - nowMs())),
        llmCallCount: this.llmCallCount,
        cacheHitCount: this.cacheHitCount,
      },
    };
  }
}

export default FlatBaselineAdapter;
