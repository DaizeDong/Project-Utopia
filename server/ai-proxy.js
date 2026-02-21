import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { buildEnvironmentFallback, buildPolicyFallback } from "../src/simulation/ai/llm/PromptBuilder.js";
import { guardEnvironmentDirective, guardGroupPolicies } from "../src/simulation/ai/llm/Guardrails.js";
import { validateEnvironmentDirective, validateGroupPolicy } from "../src/simulation/ai/llm/ResponseSchema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPromptPath = path.resolve(__dirname, "../src/data/prompts/environment-director.md");
const policyPromptPath = path.resolve(__dirname, "../src/data/prompts/npc-brain.md");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const PORT = Number(process.env.AI_PROXY_PORT ?? 8787);

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
    "Access-Control-Allow-Methods": "POST,OPTIONS",
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

async function callOpenAI(systemPrompt, summary) {
  const body = {
    model: OPENAI_MODEL,
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
    throw new Error(`OpenAI HTTP ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = extractJsonCandidate(content);
  if (!parsed) {
    throw new Error("OpenAI returned non-JSON content");
  }
  return parsed;
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
  if (!OPENAI_API_KEY) {
    return {
      fallback: true,
      directive: guardEnvironmentDirective(buildEnvironmentFallback(summary)),
      error: "OPENAI_API_KEY missing",
    };
  }

  try {
    const raw = await callOpenAI(envSystemPrompt, summary);
    const validation = validateEnvironmentDirective(raw);
    if (!validation.ok) {
      throw new Error(`schema failed: ${validation.error}`);
    }
    return {
      fallback: false,
      directive: guardEnvironmentDirective(validation.value),
      error: "",
    };
  } catch (err) {
    return {
      fallback: true,
      directive: guardEnvironmentDirective(buildEnvironmentFallback(summary)),
      error: String(err?.message ?? err),
    };
  }
}

async function handlePolicies(summary) {
  if (!OPENAI_API_KEY) {
    return {
      fallback: true,
      ...guardGroupPolicies(buildPolicyFallback(summary)),
      error: "OPENAI_API_KEY missing",
    };
  }

  try {
    const raw = await callOpenAI(policySystemPrompt, summary);
    const validation = validateGroupPolicy(raw);
    if (!validation.ok) {
      throw new Error(`schema failed: ${validation.error}`);
    }
    return {
      fallback: false,
      ...guardGroupPolicies(validation.value),
      error: "",
    };
  } catch (err) {
    return {
      fallback: true,
      ...guardGroupPolicies(buildPolicyFallback(summary)),
      error: String(err?.message ?? err),
    };
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
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
      error: String(err?.message ?? err),
    });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[ai-proxy] listening on http://localhost:${PORT}`);
});
