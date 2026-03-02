import { AI_CONFIG } from "../../../config/aiConfig.js";
import { buildEnvironmentFallback, buildPolicyFallback } from "./PromptBuilder.js";
import { guardEnvironmentDirective, guardGroupPolicies } from "./Guardrails.js";
import { validateEnvironmentDirective, validateGroupPolicy } from "./ResponseSchema.js";

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
      throw new Error(`HTTP ${resp.status}`);
    }
    const data = await resp.json();
    return { data, latencyMs: performance.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

export class LLMClient {
  constructor() {
    this.lastError = "";
    this.lastLatencyMs = 0;
    this.lastStatus = "unknown";
  }

  async requestEnvironment(summary, enabled) {
    if (!enabled) {
      return { fallback: true, data: buildEnvironmentFallback(summary), error: "" };
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

      return {
        fallback: Boolean(payload.fallback),
        data: guardEnvironmentDirective(validation.value),
        latencyMs: result.latencyMs,
        error: "",
      };
    } catch (err) {
      this.lastError = String(err?.message ?? err);
      this.lastStatus = "down";
      return {
        fallback: true,
        data: buildEnvironmentFallback(summary),
        latencyMs: this.lastLatencyMs,
        error: this.lastError,
      };
    }
  }

  async requestPolicies(summary, enabled) {
    if (!enabled) {
      return { fallback: true, data: buildPolicyFallback(summary), error: "" };
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

      return {
        fallback: Boolean(payload.fallback),
        data: guardGroupPolicies(validation.value),
        latencyMs: result.latencyMs,
        error: "",
      };
    } catch (err) {
      this.lastError = String(err?.message ?? err);
      this.lastStatus = "down";
      return {
        fallback: true,
        data: buildPolicyFallback(summary),
        latencyMs: this.lastLatencyMs,
        error: this.lastError,
      };
    }
  }
}
