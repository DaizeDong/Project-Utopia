import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { loadEnvIntoProcess } from "../scripts/env-loader.mjs";
import { buildEnvironmentFallback, buildPolicyFallback } from "../src/simulation/ai/llm/PromptBuilder.js";
import { guardEnvironmentDirective, guardGroupPolicies } from "../src/simulation/ai/llm/Guardrails.js";
import { validateEnvironmentDirective, validateGroupPolicy } from "../src/simulation/ai/llm/ResponseSchema.js";

const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const envLoadResult = loadEnvIntoProcess();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPromptPath = path.resolve(__dirname, "../src/data/prompts/environment-director.md");
const policyPromptPath = path.resolve(__dirname, "../src/data/prompts/npc-brain.md");

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
  constructor(status, bodyMessage) {
    super(`OpenAI HTTP ${status}: ${bodyMessage}`);
    this.name = "OpenAIHttpError";
    this.status = status;
    this.bodyMessage = bodyMessage;
  }
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
  rawModelContent = "",
  parsedBeforeValidation = null,
  guardedOutput = null,
  error = "",
}) {
  return {
    requestedAtIso,
    endpoint,
    requestSummary,
    rawModelContent: String(rawModelContent ?? ""),
    parsedBeforeValidation,
    guardedOutput,
    error: String(error ?? ""),
  };
}

async function callOpenAI(systemPrompt, summary, modelName) {
  const body = {
    model: modelName,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          summary,
          constraint: "Return strict JSON only. No markdown. No prose.",
        }),
      },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new OpenAIHttpError(resp.status, extractApiErrorMessage(text));
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = extractJsonCandidate(content);
  if (!parsed) {
    throw new Error("OpenAI returned non-JSON content");
  }
  return { parsed, model: modelName, rawModelContent: String(content ?? "") };
}

async function callOpenAIWithModelFallback(systemPrompt, summary) {
  try {
    return await callOpenAI(systemPrompt, summary, OPENAI_MODEL);
  } catch (err) {
    if (OPENAI_MODEL !== DEFAULT_OPENAI_MODEL && isModelConfigError(err)) {
      return callOpenAI(systemPrompt, summary, DEFAULT_OPENAI_MODEL);
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
  const requestedAtIso = new Date().toISOString();
  if (!OPENAI_API_KEY) {
    const guarded = guardEnvironmentDirective(buildEnvironmentFallback(summary));
    return {
      fallback: true,
      directive: guarded,
      error: "OPENAI_API_KEY missing",
      model: OPENAI_MODEL,
      debug: buildDebugPayload({
        requestedAtIso,
        endpoint: "/api/ai/environment",
        requestSummary: summary,
        parsedBeforeValidation: null,
        guardedOutput: guarded,
        error: "OPENAI_API_KEY missing",
      }),
    };
  }

  try {
    const result = await callOpenAIWithModelFallback(envSystemPrompt, summary);
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
        rawModelContent: result.rawModelContent,
        parsedBeforeValidation: result.parsed,
        guardedOutput: guarded,
        error: "",
      }),
    };
  } catch (err) {
    const compact = compactError(err);
    const guarded = guardEnvironmentDirective(buildEnvironmentFallback(summary));
    return {
      fallback: true,
      directive: guarded,
      error: compact,
      model: OPENAI_MODEL,
      debug: buildDebugPayload({
        requestedAtIso,
        endpoint: "/api/ai/environment",
        requestSummary: summary,
        parsedBeforeValidation: null,
        guardedOutput: guarded,
        error: compact,
      }),
    };
  }
}

async function handlePolicies(summary) {
  const requestedAtIso = new Date().toISOString();
  if (!OPENAI_API_KEY) {
    const guarded = guardGroupPolicies(buildPolicyFallback(summary));
    return {
      fallback: true,
      ...guarded,
      error: "OPENAI_API_KEY missing",
      model: OPENAI_MODEL,
      debug: buildDebugPayload({
        requestedAtIso,
        endpoint: "/api/ai/policy",
        requestSummary: summary,
        parsedBeforeValidation: null,
        guardedOutput: guarded,
        error: "OPENAI_API_KEY missing",
      }),
    };
  }

  try {
    const result = await callOpenAIWithModelFallback(policySystemPrompt, summary);
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
        rawModelContent: result.rawModelContent,
        parsedBeforeValidation: result.parsed,
        guardedOutput: guarded,
        error: "",
      }),
    };
  } catch (err) {
    const compact = compactError(err);
    const guarded = guardGroupPolicies(buildPolicyFallback(summary));
    return {
      fallback: true,
      ...guarded,
      error: compact,
      model: OPENAI_MODEL,
      debug: buildDebugPayload({
        requestedAtIso,
        endpoint: "/api/ai/policy",
        requestSummary: summary,
        parsedBeforeValidation: null,
        guardedOutput: guarded,
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
      model: OPENAI_MODEL,
      configuredModel: OPENAI_MODEL_RAW || null,
      modelNormalized: Boolean(modelConfig.normalized),
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
  console.log(`[ai-proxy] listening on http://localhost:${PORT}`);
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
