import net from "node:net";
import { spawn } from "node:child_process";

import { loadEnvIntoProcess } from "./env-loader.mjs";

const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
loadEnvIntoProcess();

const npmCmd = "npm";
const proxyPort = Number(process.env.AI_PROXY_PORT ?? 8787);
const proxyHost = process.env.AI_PROXY_HOST ?? "127.0.0.1";
const proxyBaseUrl = `http://localhost:${proxyPort}`;
const previewPort = Number(process.env.PREVIEW_PORT ?? 4173);
const previewBindHost = process.env.PREVIEW_BIND_HOST ?? "0.0.0.0";
const expectedHasApiKey = Boolean((process.env.OPENAI_API_KEY ?? "").trim());
const expectedModel = (process.env.OPENAI_MODEL ?? "").trim() || DEFAULT_OPENAI_MODEL;
const expectedProxyTimeoutMs = Math.max(8000, Number(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? 18000) || 18000);

function runCommand(commandExpr) {
  const command = `${npmCmd} run ${commandExpr}`;
  return spawn(command, {
    stdio: "inherit",
    env: process.env,
    shell: true,
    windowsHide: false,
  });
}

function isTcpPortOpen(port, host = "127.0.0.1", timeoutMs = 400) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finalize = (isOpen) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(isOpen);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finalize(true));
    socket.once("timeout", () => finalize(false));
    socket.once("error", () => finalize(false));
    socket.connect(port, host);
  });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchProxyHealth(baseUrl) {
  try {
    const healthResponse = await fetch(`${baseUrl}/health`, { method: "GET" });
    if (!healthResponse.ok) return null;
    const payload = await healthResponse.json().catch(() => null);
    if (!payload || typeof payload !== "object") return null;
    if (payload.service !== "ai-proxy") return null;
    return payload;
  } catch {
    return null;
  }
}

async function waitForProxyHealth(baseUrl, attempts = 15, delayMs = 250) {
  for (let i = 0; i < attempts; i += 1) {
    const payload = await fetchProxyHealth(baseUrl);
    if (payload) return payload;
    await sleep(delayMs);
  }
  return null;
}

async function probeExistingProxy(baseUrl) {
  const healthPayload = await fetchProxyHealth(baseUrl);
  const hasHealthyEndpoint = Boolean(healthPayload);

  try {
    const response = await fetch(`${baseUrl}/api/ai/environment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: {
          resources: { food: 100, wood: 100 },
          traffic: { congestion: 0.15 },
        },
      }),
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    const hasEnvironmentContract = Boolean(
      payload && typeof payload === "object" && "fallback" in payload
    );
    return {
      isProxyLike: hasEnvironmentContract,
      hasHealthEndpoint: hasHealthyEndpoint,
      healthPayload,
    };
  } catch {
    return {
      isProxyLike: false,
      hasHealthEndpoint: hasHealthyEndpoint,
      healthPayload,
    };
  }
}

function printStartupSummary(mode, healthPayload) {
  const hasApiKey = Boolean(healthPayload?.hasApiKey);
  const model = healthPayload?.model ?? expectedModel;
  const port = healthPayload?.port ?? proxyPort;
  const timeoutMs = healthPayload?.requestTimeoutMs ?? expectedProxyTimeoutMs;
  console.log(
    `[preview:full] proxy ${mode}; hasApiKey=${hasApiKey}; model=${model}; timeoutMs=${timeoutMs}; port=${port}`
  );
}

async function prepareProxyProcess() {
  const portInUse = await isTcpPortOpen(proxyPort, proxyHost);
  if (!portInUse) {
    const processHandle = runCommand("ai-proxy");
    const healthPayload = await waitForProxyHealth(proxyBaseUrl);
    printStartupSummary("spawned", healthPayload);
    return { process: processHandle, reused: false };
  }

  const probe = await probeExistingProxy(proxyBaseUrl);
  if (probe.isProxyLike && probe.hasHealthEndpoint) {
    if (typeof probe.healthPayload?.requestTimeoutMs !== "number") {
      console.error(
        `[preview:full] Existing ai-proxy on ${proxyBaseUrl} is outdated (missing requestTimeoutMs in /health).`
      );
      console.error(
        "[preview:full] Stop the existing proxy and rerun so preview:full can launch the current proxy version."
      );
      process.exit(1);
    }

    if (probe.healthPayload.requestTimeoutMs !== expectedProxyTimeoutMs) {
      console.error(
        `[preview:full] Existing ai-proxy timeout mismatch on ${proxyBaseUrl}.`
      );
      console.error(
        `[preview:full] expected timeoutMs=${expectedProxyTimeoutMs}, actual timeoutMs=${probe.healthPayload.requestTimeoutMs}.`
      );
      console.error(
        "[preview:full] Stop the existing proxy and rerun so the process can load current timeout settings."
      );
      process.exit(1);
    }

    if (
      typeof probe.healthPayload?.hasApiKey === "boolean"
      && probe.healthPayload.hasApiKey !== expectedHasApiKey
    ) {
      console.error(
        `[preview:full] Existing ai-proxy key status mismatch on ${proxyBaseUrl}.`
      );
      console.error(
        `[preview:full] expected hasApiKey=${expectedHasApiKey}, actual hasApiKey=${probe.healthPayload.hasApiKey}.`
      );
      console.error(
        "[preview:full] Stop the existing proxy and rerun so the process can load the current .env."
      );
      process.exit(1);
    }

    if (
      typeof probe.healthPayload?.model === "string"
      && probe.healthPayload.model !== expectedModel
    ) {
      console.warn(
        `[preview:full] Reusing proxy model=${probe.healthPayload.model} (expected ${expectedModel}).`
      );
    }

    printStartupSummary("reused", probe.healthPayload);
    return { process: null, reused: true };
  }

  if (probe.isProxyLike && !probe.hasHealthEndpoint) {
    console.error(
      `[preview:full] Detected a legacy ai-proxy on ${proxyBaseUrl} (missing /health).`
    );
    console.error(
      "[preview:full] Stop the existing process so preview:full can launch the current proxy version."
    );
    process.exit(1);
  }

  console.error(
    `[preview:full] Port ${proxyPort} is already in use by a non-ai-proxy service.`
  );
  console.error(
    "[preview:full] Stop the process using that port, or set a different AI_PROXY_PORT in .env."
  );
  process.exit(1);
}

const { process: proxyProc } = await prepareProxyProcess();
const previewProc = runCommand(`preview -- --host ${previewBindHost} --port ${previewPort}`);

let shuttingDown = false;
const keepAlive = setInterval(() => {}, 1 << 30);

function terminateAll(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(keepAlive);

  if (proxyProc) proxyProc.kill("SIGTERM");
  previewProc.kill("SIGTERM");

  setTimeout(() => {
    if (proxyProc) proxyProc.kill("SIGKILL");
    previewProc.kill("SIGKILL");
    process.exit(exitCode);
  }, 1200).unref();
}

if (proxyProc) {
  proxyProc.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const exitCode = code ?? (signal ? 1 : 0);
    console.error(`[preview:full] ai-proxy exited (${signal ?? code}). Stopping preview server.`);
    terminateAll(exitCode);
  });

  proxyProc.on("error", (err) => {
    console.error(`[preview:full] failed to start ai-proxy: ${String(err?.message ?? err)}`);
    terminateAll(1);
  });
}

previewProc.on("exit", (code, signal) => {
  if (shuttingDown) return;
  const exitCode = code ?? (signal ? 1 : 0);
  console.error(`[preview:full] vite preview exited (${signal ?? code}). Stopping ${proxyProc ? "ai-proxy" : "session"}.`);
  terminateAll(exitCode);
});

previewProc.on("error", (err) => {
  console.error(`[preview:full] failed to start vite preview: ${String(err?.message ?? err)}`);
  terminateAll(1);
});

process.on("SIGINT", () => terminateAll(0));
process.on("SIGTERM", () => terminateAll(0));
process.on("exit", () => {
  clearInterval(keepAlive);
});
