import { AI_CONFIG } from "../../../config/aiConfig.js";
import { buildEnvironmentFallback, buildPolicyFallback } from "./PromptBuilder.js";
import { guardEnvironmentDirective, guardGroupPolicies } from "./Guardrails.js";
import { validateEnvironmentDirective, validateGroupPolicy } from "./ResponseSchema.js";

async function postJson(url, body, timeoutMs) {
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
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

export class LLMClient {
  constructor() {
    this.lastError = "";
  }

  async requestEnvironment(summary, enabled) {
    if (!enabled) {
      return { fallback: true, data: buildEnvironmentFallback(summary), error: "llm disabled" };
    }

    try {
      const payload = await postJson(AI_CONFIG.environmentEndpoint, { summary }, AI_CONFIG.requestTimeoutMs);
      const candidate = payload.directive ?? payload.data ?? payload;
      const validation = validateEnvironmentDirective(candidate);
      if (!validation.ok) {
        throw new Error(`schema: ${validation.error}`);
      }

      return {
        fallback: Boolean(payload.fallback),
        data: guardEnvironmentDirective(validation.value),
        error: "",
      };
    } catch (err) {
      this.lastError = String(err?.message ?? err);
      return {
        fallback: true,
        data: buildEnvironmentFallback(summary),
        error: this.lastError,
      };
    }
  }

  async requestPolicies(summary, enabled) {
    if (!enabled) {
      return { fallback: true, data: buildPolicyFallback(summary), error: "llm disabled" };
    }

    try {
      const payload = await postJson(AI_CONFIG.policyEndpoint, { summary }, AI_CONFIG.requestTimeoutMs);
      const candidate = payload.policies ? payload : payload.data ?? payload;
      const validation = validateGroupPolicy(candidate);
      if (!validation.ok) {
        throw new Error(`schema: ${validation.error}`);
      }

      return {
        fallback: Boolean(payload.fallback),
        data: guardGroupPolicies(validation.value),
        error: "",
      };
    } catch (err) {
      this.lastError = String(err?.message ?? err);
      return {
        fallback: true,
        data: buildPolicyFallback(summary),
        error: this.lastError,
      };
    }
  }
}
