import net from "node:net";
import { spawn } from "node:child_process";

const npmCmd = "npm";
const proxyPort = Number(process.env.AI_PROXY_PORT ?? 8787);
const proxyHost = process.env.AI_PROXY_HOST ?? "127.0.0.1";
const proxyBaseUrl = `http://localhost:${proxyPort}`;

function runScript(scriptName) {
  const command = `${npmCmd} run ${scriptName}`;
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

async function probeExistingProxy(baseUrl) {
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
    return Boolean(payload && typeof payload === "object" && "fallback" in payload);
  } catch {
    return false;
  }
}

async function prepareProxyProcess() {
  const portInUse = await isTcpPortOpen(proxyPort, proxyHost);
  if (!portInUse) {
    return { process: runScript("ai-proxy"), reused: false };
  }

  const looksLikeProxy = await probeExistingProxy(proxyBaseUrl);
  if (looksLikeProxy) {
    console.log(`[dev:full] Reusing existing ai-proxy on ${proxyBaseUrl}`);
    return { process: null, reused: true };
  }

  console.error(`[dev:full] Port ${proxyPort} is already in use by a non-ai-proxy service.`);
  console.error("[dev:full] Stop the process using that port, or set a different AI_PROXY_PORT in .env.");
  process.exit(1);
}

const { process: proxyProc } = await prepareProxyProcess();
const devProc = runScript("dev");

let shuttingDown = false;
const keepAlive = setInterval(() => {}, 1 << 30);

function terminateAll(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(keepAlive);

  if (proxyProc) proxyProc.kill("SIGTERM");
  devProc.kill("SIGTERM");

  setTimeout(() => {
    if (proxyProc) proxyProc.kill("SIGKILL");
    devProc.kill("SIGKILL");
    process.exit(exitCode);
  }, 1200).unref();
}

if (proxyProc) {
  proxyProc.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const exitCode = code ?? (signal ? 1 : 0);
    console.error(`[dev:full] ai-proxy exited (${signal ?? code}). Stopping dev server.`);
    terminateAll(exitCode);
  });

  proxyProc.on("error", (err) => {
    console.error(`[dev:full] failed to start ai-proxy: ${String(err?.message ?? err)}`);
    terminateAll(1);
  });
}

devProc.on("exit", (code, signal) => {
  if (shuttingDown) return;
  const exitCode = code ?? (signal ? 1 : 0);
  console.error(`[dev:full] vite dev exited (${signal ?? code}). Stopping ${proxyProc ? "ai-proxy" : "session"}.`);
  terminateAll(exitCode);
});

devProc.on("error", (err) => {
  console.error(`[dev:full] failed to start vite dev: ${String(err?.message ?? err)}`);
  terminateAll(1);
});

process.on("SIGINT", () => terminateAll(0));
process.on("SIGTERM", () => terminateAll(0));
process.on("exit", () => {
  clearInterval(keepAlive);
});
