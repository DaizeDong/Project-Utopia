import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const nodeCmd = process.execPath;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(port, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`http://localhost:${port}/health`);
      if (resp.ok) return await resp.json();
    } catch {
      // keep polling
    }
    await sleep(100);
  }
  throw new Error(`proxy not healthy on :${port}`);
}

test("ai-proxy exposes /health endpoint", async () => {
  const port = 8897;
  const proxy = spawn(nodeCmd, ["server/ai-proxy.js"], {
    env: {
      ...process.env,
      AI_PROXY_PORT: String(port),
      OPENAI_API_KEY: "",
    },
    stdio: "ignore",
  });

  try {
    const payload = await waitForHealth(port);
    assert.equal(payload.ok, true);
    assert.equal(payload.service, "ai-proxy");
    assert.equal(payload.port, port);
  } finally {
    proxy.kill("SIGTERM");
  }
});
