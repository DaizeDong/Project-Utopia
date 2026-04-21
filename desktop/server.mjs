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
const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const ENV_PROMPT_PATH = path.resolve(PROJECT_ROOT, "src/data/prompts/environment-director.md");
const POLICY_PROMPT_PATH = path.resolve(PROJECT_ROOT, "src/data/prompts/npc-brain.md");

function dedupePaths(paths) {
  const seen = new Set();
  const result = [];
  for (const raw of paths) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    const normalized = path.resolve(value);
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function resolveEnvCandidates(customCandidates = []) {
  const exeDir = path.dirname(process.execPath ?? PROJECT_ROOT);
  const configured = process.env.PROJECT_UTOPIA_ENV ?? "";
  return dedupePaths([
    configured,
    ...customCandidates,
    path.resolve(exeDir, ".env"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(PROJECT_ROOT, ".env"),
  ]);
}

function loadDesktopEnv(customCandidates = []) {
  const candidates = resolveEnvCandidates(customCandidates);
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    return loadEnvIntoProcess(candidate);
  }
  return loadEnvIntoProcess(candidates[0] ?? path.resolve(PROJECT_ROOT, ".env"));
}

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

async function callOpenAI(systemPrompt, userPrompt, runtimeConfig, modelName) {
  const body = {
    model: modelName,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  };

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort("timeout"), runtimeConfig.requestTimeoutMs);
  let resp;
  try {
    resp = await fetch(`${runtimeConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtimeConfig.apiKey}`,
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
    throw new OpenAIHttpError(resp.status, extractApiErrorMessage(text));
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

async function callOpenAIWithModelFallback(systemPrompt, userPrompt, runtimeConfig) {
  try {
    return await callOpenAI(systemPrompt, userPrompt, runtimeConfig, runtimeConfig.model);
  } catch (err) {
    if (runtimeConfig.model !== DEFAULT_OPENAI_MODEL && isModelConfigError(err)) {
      return callOpenAI(systemPrompt, userPrompt, runtimeConfig, DEFAULT_OPENAI_MODEL);
    }
    throw err;
  }
}

function sendJson(res, code, payload) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(payload));
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

function createAiRouteHandler({ getPublicPort = () => 0, envPathCandidates = [] } = {}) {
  const envLoadResult = loadDesktopEnv(envPathCandidates);
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  const modelConfig = normalizeConfiguredModel(process.env.OPENAI_MODEL);
  const runtimeConfig = {
    apiKey,
    baseUrl: (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
    requestTimeoutMs: Math.max(8000, Number(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? 120000) || 120000),
    model: modelConfig.model,
    configuredModel: modelConfig.configuredModel,
    modelNormalized: Boolean(modelConfig.normalized),
    modelSource: modelConfig.source,
    apiKeySource: apiKey ? (envLoadResult.loadedKeys.includes("OPENAI_API_KEY") ? "env" : "process") : "missing",
    envLoadResult,
  };

  const envSystemPrompt = fs.existsSync(ENV_PROMPT_PATH)
    ? fs.readFileSync(ENV_PROMPT_PATH, "utf8")
    : "You output strict JSON for environment directives.";
  const policySystemPrompt = fs.existsSync(POLICY_PROMPT_PATH)
    ? fs.readFileSync(POLICY_PROMPT_PATH, "utf8")
    : "You output strict JSON for group policies.";

  async function handleEnvironment(summary) {
    const requestedAtIso = new Date().toISOString();
    const promptUser = buildEnvironmentPromptUserContent(summary);
    if (!runtimeConfig.apiKey) {
      const fallbackRaw = buildEnvironmentFallback(summary);
      const guarded = guardEnvironmentDirective(fallbackRaw);
      return {
        fallback: true,
        directive: guarded,
        error: "OPENAI_API_KEY missing",
        model: runtimeConfig.model,
        debug: buildDebugPayload({
          requestedAtIso,
          endpoint: "/api/ai/environment",
          requestSummary: summary,
          promptSystem: envSystemPrompt,
          promptUser,
          requestPayload: {
            model: runtimeConfig.model,
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
      const result = await callOpenAIWithModelFallback(envSystemPrompt, promptUser, runtimeConfig);
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
        model: runtimeConfig.model,
        debug: buildDebugPayload({
          requestedAtIso,
          endpoint: "/api/ai/environment",
          requestSummary: summary,
          promptSystem: envSystemPrompt,
          promptUser,
          requestPayload: {
            model: runtimeConfig.model,
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

  async function handlePolicies(summary) {
    const requestedAtIso = new Date().toISOString();
    const promptUser = buildPolicyPromptUserContent(summary);
    if (!runtimeConfig.apiKey) {
      const fallbackRaw = buildPolicyFallback(summary);
      const guarded = guardGroupPolicies(fallbackRaw);
      return {
        fallback: true,
        ...guarded,
        error: "OPENAI_API_KEY missing",
        model: runtimeConfig.model,
        debug: buildDebugPayload({
          requestedAtIso,
          endpoint: "/api/ai/policy",
          requestSummary: summary,
          promptSystem: policySystemPrompt,
          promptUser,
          requestPayload: {
            model: runtimeConfig.model,
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
      const result = await callOpenAIWithModelFallback(policySystemPrompt, promptUser, runtimeConfig);
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
        model: runtimeConfig.model,
        debug: buildDebugPayload({
          requestedAtIso,
          endpoint: "/api/ai/policy",
          requestSummary: summary,
          promptSystem: policySystemPrompt,
          promptUser,
          requestPayload: {
            model: runtimeConfig.model,
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

  return async function handleAiRoute(req, res) {
    if (req.method === "OPTIONS") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: "ai-proxy",
        hasApiKey: Boolean(runtimeConfig.apiKey),
        baseUrl: runtimeConfig.baseUrl,
        model: runtimeConfig.model,
        configuredModel: runtimeConfig.configuredModel || null,
        modelNormalized: runtimeConfig.modelNormalized,
        requestTimeoutMs: runtimeConfig.requestTimeoutMs,
        port: getPublicPort(),
        envLoaded: Boolean(runtimeConfig.envLoadResult.envLoaded),
        modelSource: runtimeConfig.modelSource,
        apiKeySource: runtimeConfig.apiKeySource,
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
        model: runtimeConfig.model,
      });
    }
  };
}

function createNotFoundResponse(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

function resolveStaticPath(rootDir, pathname) {
  const cleanPath = decodeURIComponent(String(pathname ?? "/")).replace(/\\/g, "/");
  const relativePath = cleanPath === "/" ? "index.html" : cleanPath.replace(/^\/+/, "");
  const target = path.resolve(rootDir, relativePath);
  const relative = path.relative(rootDir, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return target;
}

function sendFile(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME_TYPES.get(ext) ?? "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

async function serveStaticRequest(req, res, distDir) {
  const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
  const candidate = resolveStaticPath(distDir, requestUrl.pathname);
  if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    sendFile(req, res, candidate);
    return;
  }

  const fallback = path.resolve(distDir, "index.html");
  if (!path.extname(requestUrl.pathname) && fs.existsSync(fallback)) {
    sendFile(req, res, fallback);
    return;
  }

  createNotFoundResponse(res);
}

export async function startDesktopServer(options = {}) {
  const distDir = path.resolve(options.distDir ?? path.resolve(PROJECT_ROOT, "dist"));
  if (!fs.existsSync(distDir)) {
    throw new Error(`Desktop build assets not found at ${distDir}. Run 'npm run build' first.`);
  }

  let publicPort = 0;
  const aiRouteHandler = createAiRouteHandler({
    getPublicPort: () => publicPort,
    envPathCandidates: options.envPathCandidates ?? [],
  });

  const host = options.host ?? "127.0.0.1";
  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    if (requestUrl.pathname === "/health" || requestUrl.pathname.startsWith("/api/")) {
      await aiRouteHandler(req, res);
      return;
    }

    if (!["GET", "HEAD"].includes(req.method ?? "GET")) {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Method not allowed");
      return;
    }

    await serveStaticRequest(req, res, distDir);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Desktop server failed to resolve a TCP port.");
  }
  publicPort = address.port;

  return {
    host,
    port: publicPort,
    origin: `http://${host}:${publicPort}`,
    close: () => new Promise((resolveClose, rejectClose) => {
      server.close((err) => {
        if (err) rejectClose(err);
        else resolveClose();
      });
    }),
    server,
  };
}
