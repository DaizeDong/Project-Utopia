import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";

const nodeCmd = process.execPath;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reservePort() {
  const server = http.createServer((_req, res) => res.end("reserved"));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startServer(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

async function closeServer(server) {
  if (typeof server.closeAllConnections === "function") {
    server.closeAllConnections();
  }
  await new Promise((resolve) => server.close(resolve));
}

async function waitForHealth(port, timeoutMs = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/health`);
      if (resp.ok) return await resp.json();
    } catch {
      // keep polling
    }
    await sleep(100);
  }
  throw new Error(`proxy not healthy on :${port}`);
}

async function postJson(url, body) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`${url} HTTP ${resp.status}`);
  }
  return resp.json();
}

function buildEnvironmentCompletion(weather = "clear") {
  return JSON.stringify({
    weather,
    durationSec: 18,
    factionTension: 0.35,
    eventSpawns: [],
  });
}

test("ai-proxy retries 429 responses before falling back", async () => {
  let upstreamCalls = 0;
  const upstream = http.createServer(async (req, res) => {
    if (req.url !== "/v1/chat/completions" || req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }

    upstreamCalls += 1;
    if (upstreamCalls === 1) {
      res.writeHead(429, {
        "Content-Type": "application/json; charset=utf-8",
        "Retry-After": "0",
      });
      res.end(JSON.stringify({ error: { message: "rate limited" } }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      choices: [{ message: { content: buildEnvironmentCompletion("rain") } }],
    }));
  });

  const upstreamPort = await startServer(upstream);
  const proxyPort = await reservePort();
  const proxy = spawn(nodeCmd, ["server/ai-proxy.js"], {
    env: {
      ...process.env,
      AI_PROXY_PORT: String(proxyPort),
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: `http://127.0.0.1:${upstreamPort}/v1`,
      OPENAI_REQUEST_TIMEOUT_MS: "4000",
      OPENAI_REQUEST_ATTEMPT_TIMEOUT_MS: "1000",
      OPENAI_MAX_RETRIES: "2",
      OPENAI_RETRY_BASE_DELAY_MS: "50",
    },
    stdio: "ignore",
  });

  try {
    await waitForHealth(proxyPort);
    const payload = await postJson(`http://127.0.0.1:${proxyPort}/api/ai/environment`, {
      summary: {
        resources: { food: 32, wood: 24 },
        traffic: { congestion: 0.2 },
      },
    });

    assert.equal(payload.fallback, false);
    assert.equal(payload.directive.weather, "rain");
    assert.equal(upstreamCalls, 2);
    assert.equal(payload.debug?.requestPayload?.attemptsUsed, 2);
  } finally {
    proxy.kill("SIGTERM");
    await closeServer(upstream);
  }
});

test("ai-proxy retries a timed out upstream attempt before falling back", async () => {
  let upstreamCalls = 0;
  const upstream = http.createServer((req, res) => {
    if (req.url !== "/v1/chat/completions" || req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }

    upstreamCalls += 1;
    if (upstreamCalls === 1) {
      const timer = setTimeout(() => {
        if (res.destroyed || res.writableEnded) return;
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
          choices: [{ message: { content: buildEnvironmentCompletion("storm") } }],
        }));
      }, 4500);
      req.on("close", () => clearTimeout(timer));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      choices: [{ message: { content: buildEnvironmentCompletion("clear") } }],
    }));
  });

  const upstreamPort = await startServer(upstream);
  const proxyPort = await reservePort();
  const proxy = spawn(nodeCmd, ["server/ai-proxy.js"], {
    env: {
      ...process.env,
      AI_PROXY_PORT: String(proxyPort),
      OPENAI_API_KEY: "test-key",
      OPENAI_BASE_URL: `http://127.0.0.1:${upstreamPort}/v1`,
      OPENAI_REQUEST_TIMEOUT_MS: "9000",
      OPENAI_REQUEST_ATTEMPT_TIMEOUT_MS: "4000",
      OPENAI_MAX_RETRIES: "2",
      OPENAI_RETRY_BASE_DELAY_MS: "50",
    },
    stdio: "ignore",
  });

  try {
    await waitForHealth(proxyPort);
    const payload = await postJson(`http://127.0.0.1:${proxyPort}/api/ai/environment`, {
      summary: {
        resources: { food: 18, wood: 12 },
        traffic: { congestion: 0.1 },
      },
    });

    assert.equal(payload.fallback, false);
    assert.equal(payload.directive.weather, "clear");
    assert.equal(upstreamCalls, 2);
    assert.equal(payload.debug?.requestPayload?.attemptsUsed, 2);
  } finally {
    proxy.kill("SIGTERM");
    await closeServer(upstream);
  }
});
