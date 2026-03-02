import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const port = 8890;
const nodeCmd = process.execPath;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(url, body) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`${url} HTTP ${resp.status}`);
  return resp.json();
}

async function main() {
  const proxy = spawn(nodeCmd, ["server/ai-proxy.js"], {
    stdio: "inherit",
    env: {
      ...process.env,
      AI_PROXY_PORT: String(port),
    },
  });

  const environmentAttempts = [];
  const policyAttempts = [];

  try {
    await sleep(900);

    for (let i = 0; i < 12; i += 1) {
      const summary = {
        resources: {
          food: 14 + (i % 4) * 4,
          wood: 24 + (i % 3) * 6,
        },
        traffic: {
          congestion: 0.25 + (i % 5) * 0.11,
        },
      };

      const [envResp, policyResp] = await Promise.all([
        postJson(`http://localhost:${port}/api/ai/environment`, { summary }),
        postJson(`http://localhost:${port}/api/ai/policy`, { summary }),
      ]);

      environmentAttempts.push({
        index: i + 1,
        fallback: Boolean(envResp.fallback),
        error: envResp.error ?? "",
        weather: envResp.directive?.weather ?? "",
      });
      policyAttempts.push({
        index: i + 1,
        fallback: Boolean(policyResp.fallback),
        error: policyResp.error ?? "",
        policyCount: Array.isArray(policyResp.policies) ? policyResp.policies.length : 0,
      });

      if (!envResp.fallback && !policyResp.fallback) {
        break;
      }
      await sleep(1200);
    }
  } finally {
    proxy.kill("SIGTERM");
  }

  const evidence = {
    generatedAt: new Date().toISOString(),
    hasApiKey: Boolean(process.env.OPENAI_API_KEY),
    endpointBase: `http://localhost:${port}`,
    environment: {
      totalAttempts: environmentAttempts.length,
      llmHits: environmentAttempts.filter((a) => !a.fallback).length,
      attempts: environmentAttempts,
    },
    policy: {
      totalAttempts: policyAttempts.length,
      llmHits: policyAttempts.filter((a) => !a.fallback).length,
      attempts: policyAttempts,
    },
    verdict: {
      environmentHasLlmHit: environmentAttempts.some((a) => !a.fallback),
      policyHasLlmHit: policyAttempts.some((a) => !a.fallback),
    },
  };

  const outputPath = path.resolve(process.cwd(), "docs/assignment3/live-ai-evidence.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  console.log(`AI evidence saved: ${outputPath}`);
  if (!evidence.verdict.environmentHasLlmHit || !evidence.verdict.policyHasLlmHit) {
    console.log("No full live-AI proof yet. Configure OPENAI_API_KEY and rerun `npm run a3:evidence:ai`.");
  } else {
    console.log("Live AI proof captured (environment + policy contain llm hits).");
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
