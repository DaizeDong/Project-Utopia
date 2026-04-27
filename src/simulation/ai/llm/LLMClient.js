import { AI_CONFIG } from "../../../config/aiConfig.js";
import { buildEnvironmentFallback, buildPolicyFallback } from "./PromptBuilder.js";
import {
  buildEnvironmentPromptUserContent,
  buildPolicyPromptUserContent,
} from "./PromptPayload.js";
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

async function postJson(baseUrl, endpoint, body, timeoutMs) {
  const url = endpoint.startsWith("http") ? endpoint : `${baseUrl.replace(/\/$/, "")}${endpoint}`;
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
  promptSystem = "",
  promptUser = "",
  requestPayload = null,
  guardedOutput,
  parsedBeforeValidation = null,
  rawModelContent = "",
  error = "",
}) {
  const parsed = parsedBeforeValidation ?? guardedOutput ?? null;
  const raw = rawModelContent || (() => {
    try {
      return JSON.stringify(parsed, null, 2);
    } catch {
      return "";
    }
  })();
  return {
    requestedAtIso: new Date().toISOString(),
    endpoint,
    requestSummary,
    promptSystem,
    promptUser,
    requestPayload,
    rawModelContent: raw,
    parsedBeforeValidation: parsed,
    guardedOutput,
    error,
  };
}

const STRATEGIC_ENUMS = Object.freeze({
  priority: ["survive", "grow", "defend", "complete_objective"],
  resourceFocus: ["food", "wood", "stone", "balanced"],
  defensePosture: ["aggressive", "defensive", "neutral"],
  expansionDirection: ["north", "south", "east", "west", "none"],
  workerFocus: ["farm", "wood", "deliver", "balanced"],
  environmentPreference: ["calm", "pressure", "neutral"],
  phase: ["bootstrap", "growth", "industrialize", "process", "fortify", "optimize"],
});

function validateStrategicResponseData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "strategic response must be a JSON object";
  }
  const strategy = data.strategy;
  if (!strategy || typeof strategy !== "object" || Array.isArray(strategy)) {
    return "strategic response missing strategy object";
  }
  const knownFields = Object.keys(STRATEGIC_ENUMS);
  if (!knownFields.some((key) => Object.prototype.hasOwnProperty.call(strategy, key))) {
    return "strategic response has no recognized strategy fields";
  }
  for (const [key, allowed] of Object.entries(STRATEGIC_ENUMS)) {
    const value = strategy[key];
    if (value == null || value === "") continue;
    if (!allowed.includes(value)) {
      return `strategy.${key} invalid: ${String(value).slice(0, 60)}`;
    }
  }
  if (strategy.riskTolerance != null && !Number.isFinite(Number(strategy.riskTolerance))) {
    return "strategy.riskTolerance must be numeric";
  }
  if (strategy.primaryGoal != null && typeof strategy.primaryGoal !== "string") {
    return "strategy.primaryGoal must be a string";
  }
  if (strategy.constraints != null && !Array.isArray(strategy.constraints)) {
    return "strategy.constraints must be an array";
  }
  if (strategy.resourceBudget != null && (typeof strategy.resourceBudget !== "object" || Array.isArray(strategy.resourceBudget))) {
    return "strategy.resourceBudget must be an object";
  }
  return "";
}

export class LLMClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl ?? "";
    this.lastError = "";
    this.lastLatencyMs = 0;
    this.lastStatus = "unknown";
    this.lastModel = "";
  }

  async requestEnvironment(summary, enabled) {
    if (!enabled) {
      const guarded = buildEnvironmentFallback(summary);
      const promptUser = buildEnvironmentPromptUserContent(summary);
      return {
        fallback: true,
        data: guarded,
        error: "",
        model: "fallback",
        debug: buildLocalDebug({
          endpoint: AI_CONFIG.environmentEndpoint,
          requestSummary: summary,
          promptSystem: "(local fallback: proxy call skipped)",
          promptUser,
          requestPayload: { endpoint: AI_CONFIG.environmentEndpoint, mode: "fallback-local" },
          guardedOutput: guarded,
          error: "",
        }),
      };
    }

    try {
      const result = await postJson(this.baseUrl, AI_CONFIG.environmentEndpoint, { summary }, AI_CONFIG.requestTimeoutMs);
      const payload = result.data;
      const candidate = payload.directive ?? payload.data ?? payload;
      const validation = validateEnvironmentDirective(candidate);
      if (!validation.ok) {
        throw new Error(`schema: ${validation.error}`);
      }
      this.lastLatencyMs = result.latencyMs;
      this.lastStatus = "up";
      this.lastError = String(payload.error ?? "");
      this.lastModel = String(payload.model ?? this.lastModel ?? "").trim();

      return {
        fallback: Boolean(payload.fallback),
        data: guardEnvironmentDirective(validation.value),
        latencyMs: result.latencyMs,
        error: String(payload.error ?? ""),
        model: String(payload.model ?? ""),
        debug: payload.debug ?? buildLocalDebug({
          endpoint: AI_CONFIG.environmentEndpoint,
          requestSummary: summary,
          promptSystem: "(proxy response missing prompt debug)",
          promptUser: buildEnvironmentPromptUserContent(summary),
          requestPayload: { endpoint: AI_CONFIG.environmentEndpoint, mode: "proxy-response" },
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
          promptSystem: "(proxy request failed before debug payload)",
          promptUser: buildEnvironmentPromptUserContent(summary),
          requestPayload: { endpoint: AI_CONFIG.environmentEndpoint, mode: "proxy-error" },
          guardedOutput: guarded,
          error: this.lastError,
        }),
      };
    }
  }

  async requestStrategic(promptContent, enabled, fallbackData = null) {
    const requestSummary = (() => {
      if (typeof promptContent !== "string") return promptContent ?? {};
      try {
        return JSON.parse(promptContent);
      } catch {
        return { channel: "strategic-director", rawPrompt: promptContent };
      }
    })();
    const promptUser = typeof promptContent === "string"
      ? promptContent
      : JSON.stringify(requestSummary, null, 2);

    if (!enabled) {
      return {
        fallback: true,
        data: fallbackData,
        error: "",
        model: "fallback",
        debug: buildLocalDebug({
          endpoint: AI_CONFIG.environmentEndpoint,
          requestSummary,
          promptSystem: "(local fallback: strategic proxy call skipped)",
          promptUser,
          requestPayload: { endpoint: AI_CONFIG.environmentEndpoint, channel: "strategic-director", mode: "fallback-local" },
          guardedOutput: fallbackData,
          error: "",
        }),
      };
    }

    try {
      const result = await postJson(this.baseUrl, AI_CONFIG.environmentEndpoint, { summary: requestSummary }, AI_CONFIG.requestTimeoutMs);
      const payload = result.data;
      const data = payload.data ?? (payload.strategy ? { strategy: payload.strategy } : payload);
      this.lastLatencyMs = result.latencyMs;
      this.lastStatus = "up";
      this.lastError = String(payload.error ?? "");
      this.lastModel = String(payload.model ?? this.lastModel ?? "").trim();

      if (payload.fallback) {
        return {
          fallback: true,
          data: fallbackData,
          latencyMs: result.latencyMs,
          error: String(payload.error ?? ""),
          model: String(payload.model ?? this.lastModel ?? "fallback"),
          debug: payload.debug ?? buildLocalDebug({
            endpoint: AI_CONFIG.environmentEndpoint,
            requestSummary,
            promptSystem: "(strategic proxy returned fallback without debug)",
            promptUser,
            requestPayload: { endpoint: AI_CONFIG.environmentEndpoint, channel: "strategic-director", mode: "proxy-fallback" },
            guardedOutput: fallbackData,
            error: String(payload.error ?? ""),
          }),
        };
      }

      const validationError = validateStrategicResponseData(data);
      if (validationError) {
        const error = `schema: ${validationError}`;
        this.lastError = error;
        return {
          fallback: true,
          data: fallbackData,
          latencyMs: result.latencyMs,
          error,
          model: String(payload.model ?? this.lastModel ?? "fallback"),
          debug: payload.debug
            ? {
              ...payload.debug,
              parsedBeforeValidation: payload.debug.parsedBeforeValidation ?? data,
              guardedOutput: fallbackData,
              error,
            }
            : buildLocalDebug({
              endpoint: AI_CONFIG.environmentEndpoint,
              requestSummary,
              promptSystem: "(strategic proxy response failed schema validation)",
              promptUser,
              requestPayload: { endpoint: AI_CONFIG.environmentEndpoint, channel: "strategic-director", mode: "schema-fallback" },
              parsedBeforeValidation: data,
              guardedOutput: fallbackData,
              error,
            }),
        };
      }

      return {
        fallback: false,
        data,
        latencyMs: result.latencyMs,
        error: String(payload.error ?? ""),
        model: String(payload.model ?? ""),
        debug: payload.debug ?? buildLocalDebug({
          endpoint: AI_CONFIG.environmentEndpoint,
          requestSummary,
          promptSystem: "(proxy response missing strategic prompt debug)",
          promptUser,
          requestPayload: { endpoint: AI_CONFIG.environmentEndpoint, channel: "strategic-director", mode: "proxy-response" },
          guardedOutput: data,
          error: "",
        }),
      };
    } catch (err) {
      this.lastError = compactClientError(err);
      this.lastStatus = "down";
      return {
        fallback: true,
        data: fallbackData,
        latencyMs: this.lastLatencyMs,
        error: this.lastError,
        model: this.lastModel || "fallback",
        debug: buildLocalDebug({
          endpoint: AI_CONFIG.environmentEndpoint,
          requestSummary,
          promptSystem: "(strategic proxy request failed before debug payload)",
          promptUser,
          requestPayload: { endpoint: AI_CONFIG.environmentEndpoint, channel: "strategic-director", mode: "proxy-error" },
          guardedOutput: fallbackData,
          error: this.lastError,
        }),
      };
    }
  }

  async requestPolicies(summary, enabled) {
    if (!enabled) {
      const guarded = buildPolicyFallback(summary);
      const promptUser = buildPolicyPromptUserContent(summary);
      return {
        fallback: true,
        data: guarded,
        error: "",
        model: "fallback",
        debug: buildLocalDebug({
          endpoint: AI_CONFIG.policyEndpoint,
          requestSummary: summary,
          promptSystem: "(local fallback: proxy call skipped)",
          promptUser,
          requestPayload: { endpoint: AI_CONFIG.policyEndpoint, mode: "fallback-local" },
          guardedOutput: guarded,
          error: "",
        }),
      };
    }

    try {
      const result = await postJson(this.baseUrl, AI_CONFIG.policyEndpoint, { summary }, AI_CONFIG.requestTimeoutMs);
      const payload = result.data;
      const candidate = payload.policies ? payload : payload.data ?? payload;
      const validation = validateGroupPolicy(candidate);
      if (!validation.ok) {
        throw new Error(`schema: ${validation.error}`);
      }
      this.lastLatencyMs = result.latencyMs;
      this.lastStatus = "up";
      this.lastError = String(payload.error ?? "");
      this.lastModel = String(payload.model ?? this.lastModel ?? "").trim();

      return {
        fallback: Boolean(payload.fallback),
        data: guardGroupPolicies(validation.value),
        latencyMs: result.latencyMs,
        error: String(payload.error ?? ""),
        model: String(payload.model ?? ""),
        debug: payload.debug ?? buildLocalDebug({
          endpoint: AI_CONFIG.policyEndpoint,
          requestSummary: summary,
          promptSystem: "(proxy response missing prompt debug)",
          promptUser: buildPolicyPromptUserContent(summary),
          requestPayload: { endpoint: AI_CONFIG.policyEndpoint, mode: "proxy-response" },
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
          promptSystem: "(proxy request failed before debug payload)",
          promptUser: buildPolicyPromptUserContent(summary),
          requestPayload: { endpoint: AI_CONFIG.policyEndpoint, mode: "proxy-error" },
          guardedOutput: guarded,
          error: this.lastError,
        }),
      };
    }
  }
}
