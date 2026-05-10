// AdapterToLLMClient — LLMClient-compatible shim wrapping an AgentAdapter.
//
// Why this exists:
//   The simulation's per-channel decision sites (StrategicDirector,
//   EnvironmentDirectorSystem, NPCBrainSystem, AgentDirectorSystem) all call
//   `services.llmClient.requestXxx(...)` directly. The benchmark framework
//   wants to swap in alternate decision policies (FlatBaselineAdapter,
//   ScriptedOraclePolicy, HTTPAgentClient, LayerCastAdapter, NoopAgentAdapter)
//   that conform to the AgentAdapter `request(channel, payload, options)`
//   interface — but the sim systems will never speak that interface natively.
//
// This class accepts an AgentAdapter and exposes the LLMClient surface the
// sim systems already consume (`requestEnvironment` / `requestPolicies` /
// `requestStrategic` / `requestPlan` plus the `lastStatus` / `lastModel` /
// `lastLatencyMs` / `lastError` fields). Each LLMClient call is forwarded
// to `adapter.request(channel, payload, options)` and the AgentAdapter's
// `DecisionResponse` is unwrapped into the LLMClient envelope.
//
// Validation + Guardrails: each LLMClient method validates and guards the
// adapter's `data` payload using the same schema/guard helpers that LLMClient
// uses on the proxy response, so a bad adapter response degrades gracefully
// to fallback rather than escaping into the sim systems unchecked.
//
// Fallback behaviour: when the adapter returns `fallback: true` or a
// schema-invalid payload, this shim returns a fallback envelope consistent
// with what LLMClient itself emits on a failed proxy call — i.e. the sim
// systems' existing `pendingResult.fallback` branches keep working.
//
// Note: when the adapter is invoked with `enabled: false` we still call
// `adapter.request(...)` because adapters are entitled to provide
// deterministic data even in "AI disabled" mode (e.g. ScriptedOraclePolicy).
// Adapters that prefer a true short-circuit can implement that internally.

import { CHANNELS, SCHEMA_VERSION } from "./AgentAdapter.js";
import { buildEnvironmentFallback, buildPolicyFallback } from "./PromptBuilder.js";
import { guardEnvironmentDirective, guardGroupPolicies } from "./Guardrails.js";
import { validateEnvironmentDirective, validateGroupPolicy } from "./ResponseSchema.js";
import { validatePlanResponse } from "../colony/ColonyPlanner.js";

const DEFAULT_TIMEOUT_MS = 30_000;

function safeChannel(name) {
  return CHANNELS.includes(name) ? name : null;
}

function nowMs() {
  return (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now()
    : Date.now();
}

function buildOptions(extra) {
  return {
    schemaVersion: SCHEMA_VERSION,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    ...(extra ?? {}),
  };
}

export class AdapterToLLMClient {
  /**
   * @param {import("./AgentAdapter.js").AgentAdapter} agentAdapter
   */
  constructor(agentAdapter) {
    if (!agentAdapter || typeof agentAdapter.request !== "function") {
      throw new Error("AdapterToLLMClient: agentAdapter must implement request(channel, payload, options)");
    }
    this.agentAdapter = agentAdapter;
    // LLMClient-compatible status fields read by sim systems.
    this.lastStatus = "idle";
    this.lastModel = "";
    this.lastLatencyMs = 0;
    this.lastError = "";
  }

  _recordStatus(response) {
    this.lastModel = String(response?.model ?? this.lastModel ?? "");
    this.lastLatencyMs = Number(response?.latencyMs ?? this.lastLatencyMs ?? 0);
    this.lastError = String(response?.error ?? "");
    if (response?.error) {
      this.lastStatus = "error";
    } else if (response?.fallback) {
      this.lastStatus = "fallback";
    } else {
      this.lastStatus = "ok";
    }
  }

  async _safeRequest(channel, payload, options) {
    const ch = safeChannel(channel);
    if (!ch) {
      return {
        data: null,
        fallback: true,
        usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
        latencyMs: 0,
        model: "fallback",
        error: `unknown channel: ${channel}`,
        debug: null,
      };
    }
    const started = nowMs();
    try {
      const r = await this.agentAdapter.request(ch, payload, buildOptions(options));
      // Coerce any non-conforming return into the DecisionResponse shape.
      return {
        data: r?.data ?? null,
        fallback: Boolean(r?.fallback),
        usage: r?.usage ?? { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
        latencyMs: Number.isFinite(r?.latencyMs) ? r.latencyMs : (nowMs() - started),
        model: String(r?.model ?? ""),
        error: String(r?.error ?? ""),
        debug: r?.debug ?? null,
      };
    } catch (err) {
      return {
        data: null,
        fallback: true,
        usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
        latencyMs: nowMs() - started,
        model: "fallback",
        error: String(err?.message ?? err ?? "adapter error"),
        debug: null,
      };
    }
  }

  // ── LLMClient interface methods ────────────────────────────────────────

  async requestEnvironment(summary, _enabled) {
    const response = await this._safeRequest("environment-director", summary);
    this._recordStatus(response);

    if (response.fallback || response.data == null) {
      const guarded = buildEnvironmentFallback(summary);
      return {
        fallback: true,
        data: guarded,
        latencyMs: response.latencyMs,
        error: response.error,
        model: response.model || "fallback",
        debug: response.debug ?? {
          requestedAtIso: new Date().toISOString(),
          endpoint: "/api/ai/environment",
          requestSummary: summary,
          rawModelContent: JSON.stringify(guarded, null, 2),
          parsedBeforeValidation: null,
          guardedOutput: guarded,
          error: response.error,
        },
      };
    }

    const validation = validateEnvironmentDirective(response.data);
    if (!validation.ok) {
      const guarded = buildEnvironmentFallback(summary);
      this.lastStatus = "fallback";
      this.lastError = `schema: ${validation.error}`;
      return {
        fallback: true,
        data: guarded,
        latencyMs: response.latencyMs,
        error: this.lastError,
        model: response.model || "fallback",
        debug: response.debug ?? null,
      };
    }
    return {
      fallback: false,
      data: guardEnvironmentDirective(validation.value),
      latencyMs: response.latencyMs,
      error: response.error,
      model: response.model,
      debug: response.debug ?? null,
    };
  }

  async requestPolicies(summary, _enabled) {
    const response = await this._safeRequest("npc-policy", summary);
    this._recordStatus(response);

    if (response.fallback || response.data == null) {
      const guarded = buildPolicyFallback(summary);
      return {
        fallback: true,
        data: guarded,
        latencyMs: response.latencyMs,
        error: response.error,
        model: response.model || "fallback",
        debug: response.debug ?? {
          requestedAtIso: new Date().toISOString(),
          endpoint: "/api/ai/policy",
          requestSummary: summary,
          rawModelContent: JSON.stringify(guarded, null, 2),
          parsedBeforeValidation: null,
          guardedOutput: guarded,
          error: response.error,
        },
      };
    }

    // Adapters may emit either {policies:[...], stateTargets:[...]} OR a raw
    // policies array — the validator expects an envelope object.
    const candidate = Array.isArray(response.data) ? { policies: response.data } : response.data;
    const validation = validateGroupPolicy(candidate);
    if (!validation.ok) {
      const guarded = buildPolicyFallback(summary);
      this.lastStatus = "fallback";
      this.lastError = `schema: ${validation.error}`;
      return {
        fallback: true,
        data: guarded,
        latencyMs: response.latencyMs,
        error: this.lastError,
        model: response.model || "fallback",
        debug: response.debug ?? null,
      };
    }
    return {
      fallback: false,
      data: guardGroupPolicies(validation.value),
      latencyMs: response.latencyMs,
      error: response.error,
      model: response.model,
      debug: response.debug ?? null,
    };
  }

  async requestStrategic(promptContent, _enabled, fallbackData = null) {
    const response = await this._safeRequest("strategic-plan", promptContent);
    this._recordStatus(response);

    if (response.fallback || response.data == null) {
      return {
        fallback: true,
        data: fallbackData,
        latencyMs: response.latencyMs,
        error: response.error,
        model: response.model || "fallback",
        debug: response.debug ?? null,
      };
    }
    // No deep schema validation here — strategic-plan validation lives
    // inside StrategicDirector. We just pass the data through.
    return {
      fallback: false,
      data: response.data,
      latencyMs: response.latencyMs,
      error: response.error,
      model: response.model,
      debug: response.debug ?? null,
    };
  }

  /**
   * `LLMClient.requestPlan(systemPrompt, userPrompt, options)` returns
   * `{ ok, plan, source, error, latencyMs, model, debug }`. We mirror
   * that shape from a `colony-agent` channel response.
   */
  async requestPlan(systemPrompt, userPrompt, options = {}) {
    const payload = { systemPrompt, userPrompt, ...options };
    const response = await this._safeRequest("colony-agent", payload);
    this._recordStatus(response);

    if (response.fallback || response.data == null) {
      return {
        ok: false,
        plan: null,
        source: "proxy-fallback",
        error: response.error || "fallback",
        latencyMs: response.latencyMs,
        model: response.model || "fallback",
        debug: response.debug ?? null,
      };
    }
    const validation = validatePlanResponse(response.data?.plan ?? response.data);
    if (!validation.ok) {
      return {
        ok: false,
        plan: null,
        source: "client-error",
        error: `schema: ${validation.error}`,
        latencyMs: response.latencyMs,
        model: response.model || "fallback",
        debug: response.debug ?? null,
      };
    }
    return {
      ok: true,
      plan: { ...validation.plan, source: "llm" },
      source: "llm",
      error: response.error,
      latencyMs: response.latencyMs,
      model: response.model,
      debug: response.debug ?? null,
    };
  }
}
