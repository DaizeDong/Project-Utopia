import { AI_CONFIG } from "../../../config/aiConfig.js";
import { buildEnvironmentFallback, buildPolicyFallback } from "./PromptBuilder.js";
import { guardEnvironmentDirective, guardGroupPolicies } from "./Guardrails.js";
import { validateEnvironmentDirective, validateGroupPolicy } from "./ResponseSchema.js";

function compactClientError(err) {
  const raw = String(err?.message ?? err ?? "unknown error")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "unknown error";
  if (raw.toLowerCase().includes("timeout") || raw.toLowerCase().includes("aborted")) return "request timeout";
  if (raw.toLowerCase().includes("openai_api_key")) return "OPENAI_API_KEY missing";
  return raw.slice(0, 180);
}

async function postJson(url, body, timeoutMs) {
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("timeout"), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      const short = text ? text.replace(/\s+/g, " ").trim().slice(0, 140) : "";
      throw new Error(short ? `HTTP ${resp.status}: ${short}` : `HTTP ${resp.status}`);
    }
    const data = await resp.json();
    return { data, latencyMs: performance.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

function buildLocalDebug({
  endpoint,
  requestSummary,
  guardedOutput,
  error = "",
}) {
  return {
    requestedAtIso: new Date().toISOString(),
    endpoint,
    requestSummary,
    rawModelContent: "",
    parsedBeforeValidation: null,
    guardedOutput,
    error,
  };
}

export class LLMClient {
  constructor() {
    this.lastError = "";
    this.lastLatencyMs = 0;
    this.lastStatus = "unknown";
    this.lastModel = "";
  }

  async requestEnvironment(summary, enabled) {
    if (!enabled) {
      const guarded = buildEnvironmentFallback(summary);
      return {
        fallback: true,
        data: guarded,
        error: "",
        model: "fallback",
        debug: buildLocalDebug({
          endpoint: AI_CONFIG.environmentEndpoint,
          requestSummary: summary,
          guardedOutput: guarded,
          error: "",
        }),
      };
    }

    try {
      const result = await postJson(AI_CONFIG.environmentEndpoint, { summary }, AI_CONFIG.requestTimeoutMs);
      const payload = result.data;
      const candidate = payload.directive ?? payload.data ?? payload;
      const validation = validateEnvironmentDirective(candidate);
      if (!validation.ok) {
        throw new Error(`schema: ${validation.error}`);
      }
      this.lastLatencyMs = result.latencyMs;
      this.lastStatus = "up";
      this.lastModel = String(payload.model ?? this.lastModel ?? "").trim();

      return {
        fallback: Boolean(payload.fallback),
        data: guardEnvironmentDirective(validation.value),
        latencyMs: result.latencyMs,
        error: "",
        model: String(payload.model ?? ""),
        debug: payload.debug ?? buildLocalDebug({
          endpoint: AI_CONFIG.environmentEndpoint,
          requestSummary: summary,
          guardedOutput: guardEnvironmentDirective(validation.value),
          error: "",
        }),
      };
    } catch (err) {
      this.lastError = compactClientError(err);
      this.lastStatus = "down";
      const guarded = buildEnvironmentFallback(summary);
      return {
        fallback: true,
        data: guarded,
        latencyMs: this.lastLatencyMs,
        error: this.lastError,
        model: this.lastModel || "fallback",
        debug: buildLocalDebug({
          endpoint: AI_CONFIG.environmentEndpoint,
          requestSummary: summary,
          guardedOutput: guarded,
          error: this.lastError,
        }),
      };
    }
  }

  async requestPolicies(summary, enabled) {
    if (!enabled) {
      const guarded = buildPolicyFallback(summary);
      return {
        fallback: true,
        data: guarded,
        error: "",
        model: "fallback",
        debug: buildLocalDebug({
          endpoint: AI_CONFIG.policyEndpoint,
          requestSummary: summary,
          guardedOutput: guarded,
          error: "",
        }),
      };
    }

    try {
      const result = await postJson(AI_CONFIG.policyEndpoint, { summary }, AI_CONFIG.requestTimeoutMs);
      const payload = result.data;
      const candidate = payload.policies ? payload : payload.data ?? payload;
      const validation = validateGroupPolicy(candidate);
      if (!validation.ok) {
        throw new Error(`schema: ${validation.error}`);
      }
      this.lastLatencyMs = result.latencyMs;
      this.lastStatus = "up";
      this.lastModel = String(payload.model ?? this.lastModel ?? "").trim();

      return {
        fallback: Boolean(payload.fallback),
        data: guardGroupPolicies(validation.value),
        latencyMs: result.latencyMs,
        error: "",
        model: String(payload.model ?? ""),
        debug: payload.debug ?? buildLocalDebug({
          endpoint: AI_CONFIG.policyEndpoint,
          requestSummary: summary,
          guardedOutput: guardGroupPolicies(validation.value),
          error: "",
        }),
      };
    } catch (err) {
      this.lastError = compactClientError(err);
      this.lastStatus = "down";
      const guarded = buildPolicyFallback(summary);
      return {
        fallback: true,
        data: guarded,
        latencyMs: this.lastLatencyMs,
        error: this.lastError,
        model: this.lastModel || "fallback",
        debug: buildLocalDebug({
          endpoint: AI_CONFIG.policyEndpoint,
          requestSummary: summary,
          guardedOutput: guarded,
          error: this.lastError,
        }),
      };
    }
  }
}
