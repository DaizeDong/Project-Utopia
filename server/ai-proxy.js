import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { loadEnvIntoProcess } from "../scripts/env-loader.mjs";
import { buildEnvironmentFallback, buildPolicyFallback } from "../src/simulation/ai/llm/PromptBuilder.js";
import {
  buildEnvironmentPromptUserContent,
  buildPolicyPromptUserContent,
} from "../src/simulation/ai/llm/PromptPayload.js";
import { guardEnvironmentDirective, guardGroupPolicies } from "../src/simulation/ai/llm/Guardrails.js";
import { validateEnvironmentDirective, validateGroupPolicy } from "../src/simulation/ai/llm/ResponseSchema.js";

const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const envLoadResult = loadEnvIntoProcess();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPromptPath = path.resolve(__dirname, "../src/data/prompts/environment-director.md");
const policyPromptPath = path.resolve(__dirname, "../src/data/prompts/npc-brain.md");
const strategicPromptPath = path.resolve(__dirname, "../src/data/prompts/strategic-director.md");

function normalizeConfiguredModel(rawModel) {
  const raw = String(rawModel ?? "").trim();
  if (!raw) {
    return { model: DEFAULT_OPENAI_MODEL, source: "default", normalized: false, configuredModel: "" };
  }

  let normalized = raw;
  if (/mimi/i.test(normalized)) {
    normalized = normalized.replace(/mimi/gi, "mini");
  }
  if (!normalized) normalized = DEFAULT_OPENAI_MODEL;
  return {
    model: normalized,
    source: "env",
    normalized: normalized !== raw,
    configuredModel: raw,
  };
}

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY ?? "").trim();
const modelConfig = normalizeConfiguredModel(process.env.OPENAI_MODEL);
const OPENAI_MODEL_RAW = modelConfig.configuredModel;
const OPENAI_MODEL = modelConfig.model;
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
const OPENAI_REQUEST_TIMEOUT_MS = Math.max(8000, Number(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? 120000) || 120000);
// v0.8.7 T4-3: per-attempt timeout (lower than the overall request timeout)
// so a hung upstream attempt aborts before the wall-clock budget is gone,
// freeing the next retry to actually run. Defaults to the overall timeout
// (back-compat — single-shot when not configured).
const OPENAI_REQUEST_ATTEMPT_TIMEOUT_MS = Math.max(
  500,
  Number(process.env.OPENAI_REQUEST_ATTEMPT_TIMEOUT_MS ?? OPENAI_REQUEST_TIMEOUT_MS)
    || OPENAI_REQUEST_TIMEOUT_MS,
);
// Total attempts allowed = OPENAI_MAX_RETRIES (so a value of 2 = up to 2
// upstream calls per proxy request). Default 1 = no retry, back-compat.
const OPENAI_MAX_RETRIES = Math.max(
  1,
  Number(process.env.OPENAI_MAX_RETRIES ?? 1) || 1,
);
// Base backoff between retries, in ms. Used as the floor for 429 (when
// the upstream did not provide a Retry-After header) and as a fixed delay
// for timeout retries.
const OPENAI_RETRY_BASE_DELAY_MS = Math.max(
  0,
  Number(process.env.OPENAI_RETRY_BASE_DELAY_MS ?? 250) || 0,
);
const MODEL_SOURCE = modelConfig.source;
const API_KEY_SOURCE = OPENAI_API_KEY
  ? (envLoadResult.loadedKeys.includes("OPENAI_API_KEY") ? "env" : "process")
  : "missing";
const PORT = Number(process.env.AI_PROXY_PORT ?? 8787);

if (modelConfig.normalized) {
  console.warn(`[ai-proxy] normalized OPENAI_MODEL '${OPENAI_MODEL_RAW}' -> '${OPENAI_MODEL}'.`);
}

const envSystemPrompt = fs.existsSync(envPromptPath)
  ? fs.readFileSync(envPromptPath, "utf8")
  : "You output strict JSON for environment directives.";

const policySystemPrompt = fs.existsSync(policyPromptPath)
  ? fs.readFileSync(policyPromptPath, "utf8")
  : "You output strict JSON for group policies.";
const strategicSystemPrompt = fs.existsSync(strategicPromptPath)
  ? fs.readFileSync(strategicPromptPath, "utf8")
  : "You output strict JSON for strategic colony priorities.";

function sendJson(res, code, payload) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(payload));
}

function extractJsonCandidate(content) {
  if (typeof content !== "string") return null;
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const fragment = content.slice(start, end + 1);
      try {
        return JSON.parse(fragment);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function extractApiErrorMessage(text) {
  if (typeof text !== "string" || !text.trim()) return "empty response";
  try {
    const parsed = JSON.parse(text);
    const message = parsed?.error?.message;
    if (typeof message === "string" && message.trim()) return message.trim();
  } catch {
    // ignore invalid json bodies
  }
  return text.replace(/\s+/g, " ").trim().slice(0, 220);
}

class OpenAIHttpError extends Error {
  constructor(status, bodyMessage, retryAfter = null) {
    super(`OpenAI HTTP ${status}: ${bodyMessage}`);
    this.name = "OpenAIHttpError";
    this.status = status;
    this.bodyMessage = bodyMessage;
    // v0.8.7 T4-3: capture the Retry-After header for 429 retries.
    this.retryAfter = retryAfter;
  }
}

// v0.8.7 T4-3: helper — true when the abort triggered the request to bail.
function isTimeoutError(err) {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  return msg.includes("aborted") || msg.includes("timeout");
}

// Parse a Retry-After header into ms. Accepts seconds (HTTP/1.1) or HTTP-date.
function parseRetryAfterMs(headerVal, fallbackMs) {
  if (!headerVal) return fallbackMs;
  const asNum = Number(headerVal);
  if (Number.isFinite(asNum) && asNum >= 0) {
    // seconds → ms; cap at 10s so a runaway upstream can't wedge us.
    return Math.min(10000, asNum * 1000);
  }
  const ts = Date.parse(headerVal);
  if (Number.isFinite(ts)) {
    return Math.max(0, Math.min(10000, ts - Date.now()));
  }
  return fallbackMs;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function isModelConfigError(err) {
  if (!(err instanceof OpenAIHttpError)) return false;
  const combined = `${err.bodyMessage ?? ""} ${err.message ?? ""}`.toLowerCase();
  if (![400, 404].includes(Number(err.status))) return false;
  return combined.includes("model");
}

function compactError(err) {
  const raw = String(err?.message ?? err ?? "unknown error")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "unknown error";
  if (raw.toLowerCase().includes("openai_api_key")) return "OPENAI_API_KEY missing";
  if (raw.toLowerCase().includes("aborted") || raw.toLowerCase().includes("timeout")) return "request timeout";
  if (raw.toLowerCase().includes("schema failed")) return raw.slice(0, 180);
  if (raw.toLowerCase().startsWith("openai http")) return raw.slice(0, 200);
  return raw.slice(0, 180);
}

function buildDebugPayload({
  requestedAtIso,
  endpoint,
  requestSummary,
  promptSystem = "",
  promptUser = "",
  requestPayload = null,
  rawModelContent = "",
  parsedBeforeValidation = null,
  guardedOutput = null,
  error = "",
}) {
  return {
    requestedAtIso,
    endpoint,
    requestSummary,
    promptSystem: String(promptSystem ?? ""),
    promptUser: String(promptUser ?? ""),
    requestPayload,
    rawModelContent: String(rawModelContent ?? ""),
    parsedBeforeValidation,
    guardedOutput,
    error: String(error ?? ""),
  };
}

async function callOpenAIOnce(systemPrompt, userPrompt, modelName) {
  const body = {
    model: modelName,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  };

  const ctrl = new AbortController();
  // v0.8.7 T4-3: per-attempt timeout — must be < overall budget so a
  // retry can fit within the same caller-visible wall-clock window.
  const timeout = setTimeout(() => ctrl.abort("timeout"), OPENAI_REQUEST_ATTEMPT_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!resp.ok) {
    const text = await resp.text();
    const retryAfter = resp.headers?.get?.("Retry-After") ?? null;
    throw new OpenAIHttpError(resp.status, extractApiErrorMessage(text), retryAfter);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = extractJsonCandidate(content);
  if (!parsed) {
    throw new Error("OpenAI returned non-JSON content");
  }
  return {
    parsed,
    model: modelName,
    rawModelContent: String(content ?? ""),
    promptSystem: systemPrompt,
    promptUser: userPrompt,
    requestPayload: {
      model: modelName,
      temperature: body.temperature,
      responseFormat: body.response_format?.type ?? "json_object",
    },
  };
}

// v0.8.7 T4-3: retry wrapper. Retries at most OPENAI_MAX_RETRIES total
// attempts on either:
//   - HTTP 429: backoff = max(Retry-After header, OPENAI_RETRY_BASE_DELAY_MS)
//   - request timeout (abort with "timeout"): backoff = OPENAI_RETRY_BASE_DELAY_MS * 2^attempt
// Other errors (model-config, schema failures, 5xx without Retry-After) bubble
// up to the model-fallback / route handler so the existing rule-based
// fallback path runs as before. The total attempts used is recorded on the
// returned shape so the proxy can surface it in `debug.requestPayload.attemptsUsed`.
async function callOpenAI(systemPrompt, userPrompt, modelName) {
  let lastErr = null;
  for (let attempt = 1; attempt <= OPENAI_MAX_RETRIES; attempt += 1) {
    try {
      const result = await callOpenAIOnce(systemPrompt, userPrompt, modelName);
      result.attemptsUsed = attempt;
      // Tag the upstream's per-attempt count into the debug-passthrough
      // requestPayload so test/proxy-retry can inspect it.
      if (result.requestPayload && typeof result.requestPayload === "object") {
        result.requestPayload = { ...result.requestPayload, attemptsUsed: attempt };
      }
      return result;
    } catch (err) {
      lastErr = err;
      if (attempt >= OPENAI_MAX_RETRIES) break;
      const isRateLimited = err instanceof OpenAIHttpError && Number(err.status) === 429;
      const isTimeout = isTimeoutError(err);
      if (!isRateLimited && !isTimeout) break;
      const backoff = isRateLimited
        ? parseRetryAfterMs(err.retryAfter, OPENAI_RETRY_BASE_DELAY_MS)
        : OPENAI_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

async function callOpenAIWithModelFallback(systemPrompt, userPrompt) {
  try {
    return await callOpenAI(systemPrompt, userPrompt, OPENAI_MODEL);
  } catch (err) {
    if (OPENAI_MODEL !== DEFAULT_OPENAI_MODEL && isModelConfigError(err)) {
      return callOpenAI(systemPrompt, userPrompt, DEFAULT_OPENAI_MODEL);
    }
    throw err;
  }
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
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

async function handleEnvironment(summary) {
  if (summary?.channel === "strategic-director") {
    return handleStrategic(summary);
  }

  const requestedAtIso = new Date().toISOString();
  const promptUser = buildEnvironmentPromptUserContent(summary);
  if (!OPENAI_API_KEY) {
    const fallbackRaw = buildEnvironmentFallback(summary);
    const guarded = guardEnvironmentDirective(fallbackRaw);
    return {
      fallback: true,
      directive: guarded,
      error: "OPENAI_API_KEY missing",
      model: OPENAI_MODEL,
      debug: buildDebugPayload({
        requestedAtIso,
        endpoint: "/api/ai/environment",
        requestSummary: summary,
        promptSystem: envSystemPrompt,
        promptUser,
        requestPayload: {
          model: OPENAI_MODEL,
          temperature: 0.3,
          responseFormat: "json_object",
        },
        rawModelContent: JSON.stringify(fallbackRaw, null, 2),
        parsedBeforeValidation: fallbackRaw,
        guardedOutput: guarded,
        error: "OPENAI_API_KEY missing",
      }),
    };
  }

  try {
    const result = await callOpenAIWithModelFallback(envSystemPrompt, promptUser);
    const validation = validateEnvironmentDirective(result.parsed);
    if (!validation.ok) {
      throw new Error(`schema failed: ${validation.error}`);
    }
    const guarded = guardEnvironmentDirective(validation.value);
    return {
      fallback: false,
      directive: guarded,
      error: "",
      model: result.model,
      debug: buildDebugPayload({
        requestedAtIso,
        endpoint: "/api/ai/environment",
        requestSummary: summary,
        promptSystem: result.promptSystem,
        promptUser: result.promptUser,
        requestPayload: result.requestPayload,
        rawModelContent: result.rawModelContent,
        parsedBeforeValidation: result.parsed,
        guardedOutput: guarded,
        error: "",
      }),
    };
  } catch (err) {
    const compact = compactError(err);
    const fallbackRaw = buildEnvironmentFallback(summary);
    const guarded = guardEnvironmentDirective(fallbackRaw);
    return {
      fallback: true,
      directive: guarded,
      error: compact,
      model: OPENAI_MODEL,
      debug: buildDebugPayload({
        requestedAtIso,
        endpoint: "/api/ai/environment",
        requestSummary: summary,
        promptSystem: envSystemPrompt,
        promptUser,
        requestPayload: {
          model: OPENAI_MODEL,
          temperature: 0.3,
          responseFormat: "json_object",
        },
        rawModelContent: JSON.stringify(fallbackRaw, null, 2),
        parsedBeforeValidation: fallbackRaw,
        guardedOutput: guarded,
        error: compact,
      }),
    };
  }
}

async function handleStrategic(summary) {
  const requestedAtIso = new Date().toISOString();
  const promptUser = JSON.stringify(summary ?? {}, null, 2);
  if (!OPENAI_API_KEY) {
    return {
      fallback: true,
      data: null,
      error: "OPENAI_API_KEY missing",
      model: OPENAI_MODEL,
      debug: buildDebugPayload({
        requestedAtIso,
        endpoint: "/api/ai/environment",
        requestSummary: summary,
        promptSystem: strategicSystemPrompt,
        promptUser,
        requestPayload: {
          model: OPENAI_MODEL,
          temperature: 0.3,
          responseFormat: "json_object",
          channel: "strategic-director",
        },
        rawModelContent: "",
        parsedBeforeValidation: null,
        guardedOutput: null,
        error: "OPENAI_API_KEY missing",
      }),
    };
  }

  try {
    const result = await callOpenAIWithModelFallback(strategicSystemPrompt, promptUser);
    return {
      fallback: false,
      data: result.parsed,
      error: "",
      model: result.model,
      debug: buildDebugPayload({
        requestedAtIso,
        endpoint: "/api/ai/environment",
        requestSummary: summary,
        promptSystem: result.promptSystem,
        promptUser: result.promptUser,
        requestPayload: {
          ...result.requestPayload,
          channel: "strategic-director",
        },
        rawModelContent: result.rawModelContent,
        parsedBeforeValidation: result.parsed,
        guardedOutput: result.parsed,
        error: "",
      }),
    };
  } catch (err) {
    const compact = compactError(err);
    return {
      fallback: true,
      data: null,
      error: compact,
      model: OPENAI_MODEL,
      debug: buildDebugPayload({
        requestedAtIso,
        endpoint: "/api/ai/environment",
        requestSummary: summary,
        promptSystem: strategicSystemPrompt,
        promptUser,
        requestPayload: {
          model: OPENAI_MODEL,
          temperature: 0.3,
          responseFormat: "json_object",
          channel: "strategic-director",
        },
        rawModelContent: "",
        parsedBeforeValidation: null,
        guardedOutput: null,
        error: compact,
      }),
    };
  }
}

async function handlePolicies(summary) {
  const requestedAtIso = new Date().toISOString();
  const promptUser = buildPolicyPromptUserContent(summary);
  if (!OPENAI_API_KEY) {
    const fallbackRaw = buildPolicyFallback(summary);
    const guarded = guardGroupPolicies(fallbackRaw);
    return {
      fallback: true,
      ...guarded,
      error: "OPENAI_API_KEY missing",
      model: OPENAI_MODEL,
      debug: buildDebugPayload({
        requestedAtIso,
        endpoint: "/api/ai/policy",
        requestSummary: summary,
        promptSystem: policySystemPrompt,
        promptUser,
        requestPayload: {
          model: OPENAI_MODEL,
          temperature: 0.3,
          responseFormat: "json_object",
        },
        rawModelContent: JSON.stringify(fallbackRaw, null, 2),
        parsedBeforeValidation: fallbackRaw,
        guardedOutput: guarded,
        error: "OPENAI_API_KEY missing",
      }),
    };
  }

  try {
    const result = await callOpenAIWithModelFallback(policySystemPrompt, promptUser);
    const validation = validateGroupPolicy(result.parsed);
    if (!validation.ok) {
      throw new Error(`schema failed: ${validation.error}`);
    }
    const guarded = guardGroupPolicies(validation.value);
    return {
      fallback: false,
      ...guarded,
      error: "",
      model: result.model,
      debug: buildDebugPayload({
        requestedAtIso,
        endpoint: "/api/ai/policy",
        requestSummary: summary,
        promptSystem: result.promptSystem,
        promptUser: result.promptUser,
        requestPayload: result.requestPayload,
        rawModelContent: result.rawModelContent,
        parsedBeforeValidation: result.parsed,
        guardedOutput: guarded,
        error: "",
      }),
    };
  } catch (err) {
    const compact = compactError(err);
    const fallbackRaw = buildPolicyFallback(summary);
    const guarded = guardGroupPolicies(fallbackRaw);
    return {
      fallback: true,
      ...guarded,
      error: compact,
      model: OPENAI_MODEL,
      debug: buildDebugPayload({
        requestedAtIso,
        endpoint: "/api/ai/policy",
        requestSummary: summary,
        promptSystem: policySystemPrompt,
        promptUser,
        requestPayload: {
          model: OPENAI_MODEL,
          temperature: 0.3,
          responseFormat: "json_object",
        },
        rawModelContent: JSON.stringify(fallbackRaw, null, 2),
        parsedBeforeValidation: fallbackRaw,
        guardedOutput: guarded,
        error: compact,
      }),
    };
  }
}

async function handlePlan(body) {
  const requestedAtIso = new Date().toISOString();
  const systemPrompt = String(body?.systemPrompt ?? "").trim();
  const userPrompt = String(body?.userPrompt ?? "").trim();
  const requestSummary = {
    channel: "colony-planner",
    systemPromptLen: systemPrompt.length,
    userPromptLen: userPrompt.length,
  };

  // Without prompts there is nothing for the LLM to act on; surface a
  // structured fallback so the client falls back to its algorithmic planner.
  if (!systemPrompt || !userPrompt) {
    return {
      fallback: true,
      plan: null,
      error: "missing systemPrompt/userPrompt",
      model: OPENAI_MODEL,
      debug: buildDebugPayload({
        requestedAtIso,
        endpoint: "/api/ai/plan",
        requestSummary,
        promptSystem: systemPrompt,
        promptUser: userPrompt,
        requestPayload: {
          model: OPENAI_MODEL,
          temperature: 0.3,
          responseFormat: "json_object",
          channel: "colony-planner",
        },
        rawModelContent: "",
        parsedBeforeValidation: null,
        guardedOutput: null,
        error: "missing systemPrompt/userPrompt",
      }),
    };
  }

  if (!OPENAI_API_KEY) {
    return {
      fallback: true,
      plan: null,
      error: "OPENAI_API_KEY missing",
      model: OPENAI_MODEL,
      debug: buildDebugPayload({
        requestedAtIso,
        endpoint: "/api/ai/plan",
        requestSummary,
        promptSystem: systemPrompt,
        promptUser: userPrompt,
        requestPayload: {
          model: OPENAI_MODEL,
          temperature: 0.3,
          responseFormat: "json_object",
          channel: "colony-planner",
        },
        rawModelContent: "",
        parsedBeforeValidation: null,
        guardedOutput: null,
        error: "OPENAI_API_KEY missing",
      }),
    };
  }

  try {
    const result = await callOpenAIWithModelFallback(systemPrompt, userPrompt);
    return {
      fallback: false,
      plan: result.parsed,
      error: "",
      model: result.model,
      debug: buildDebugPayload({
        requestedAtIso,
        endpoint: "/api/ai/plan",
        requestSummary,
        promptSystem: result.promptSystem,
        promptUser: result.promptUser,
        requestPayload: {
          ...result.requestPayload,
          channel: "colony-planner",
        },
        rawModelContent: result.rawModelContent,
        parsedBeforeValidation: result.parsed,
        guardedOutput: result.parsed,
        error: "",
      }),
    };
  } catch (err) {
    const compact = compactError(err);
    return {
      fallback: true,
      plan: null,
      error: compact,
      model: OPENAI_MODEL,
      debug: buildDebugPayload({
        requestedAtIso,
        endpoint: "/api/ai/plan",
        requestSummary,
        promptSystem: systemPrompt,
        promptUser: userPrompt,
        requestPayload: {
          model: OPENAI_MODEL,
          temperature: 0.3,
          responseFormat: "json_object",
          channel: "colony-planner",
        },
        rawModelContent: "",
        parsedBeforeValidation: null,
        guardedOutput: null,
        error: compact,
      }),
    };
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, {
      ok: true,
      service: "ai-proxy",
      hasApiKey: Boolean(OPENAI_API_KEY),
      baseUrl: OPENAI_BASE_URL,
      model: OPENAI_MODEL,
      configuredModel: OPENAI_MODEL_RAW || null,
      modelNormalized: Boolean(modelConfig.normalized),
      requestTimeoutMs: OPENAI_REQUEST_TIMEOUT_MS,
      port: PORT,
      envLoaded: Boolean(envLoadResult.envLoaded),
      modelSource: MODEL_SOURCE,
      apiKeySource: API_KEY_SOURCE,
      now: new Date().toISOString(),
    });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method not allowed" });
    return;
  }

  try {
    const body = await readBody(req);
    const summary = body?.summary ?? {};

    if (req.url === "/api/ai/environment") {
      const payload = await handleEnvironment(summary);
      sendJson(res, 200, payload);
      return;
    }

    if (req.url === "/api/ai/policy") {
      const payload = await handlePolicies(summary);
      sendJson(res, 200, payload);
      return;
    }

    if (req.url === "/api/ai/plan") {
      // Colony-planner endpoint takes systemPrompt + userPrompt directly
      // (not wrapped in {summary}) since the prompts are assembled client-side
      // from runtime observation + memory and don't share the policy schema.
      const payload = await handlePlan(body);
      sendJson(res, 200, payload);
      return;
    }

    sendJson(res, 404, { error: "not found" });
  } catch (err) {
    sendJson(res, 500, {
      fallback: true,
      error: compactError(err),
      model: OPENAI_MODEL,
    });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[ai-proxy] listening on http://localhost:${PORT}  (baseUrl: ${OPENAI_BASE_URL})`);
});

server.on("error", (err) => {
  if (err?.code === "EADDRINUSE") {
    console.error(`[ai-proxy] port ${PORT} is already in use. Set AI_PROXY_PORT or stop the existing process.`);
    process.exit(1);
    return;
  }
  console.error(`[ai-proxy] server error: ${String(err?.message ?? err)}`);
  process.exit(1);
});
