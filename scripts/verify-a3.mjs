import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeCmd = process.execPath;

function run(name, cmd, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const commandLine = [cmd, ...args].join(" ");
    const proc = spawn(commandLine, {
      stdio: "inherit",
      env,
      shell: true,
    });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${name} failed with exit code ${code}`));
    });
  });
}

async function waitFor(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForProxyReady(port, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const health = await fetch(`http://localhost:${port}/health`);
      if (health.ok) return;
    } catch {
      // wait and retry
    }
    await waitFor(150);
  }
  throw new Error(`ai-proxy did not become healthy on :${port} within ${timeoutMs}ms`);
}

async function verifyProxyContract() {
  const port = 8879;
  const env = {
    ...process.env,
    AI_PROXY_PORT: String(port),
  };
  const proxy = spawn(nodeCmd, ["server/ai-proxy.js"], {
    stdio: "inherit",
    env,
  });

  try {
    await waitForProxyReady(port);
    const body = {
      summary: {
        resources: { food: 20, wood: 30 },
        traffic: { congestion: 0.2 },
      },
    };

    const [environmentResp, policyResp] = await Promise.all([
      fetch(`http://localhost:${port}/api/ai/environment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      fetch(`http://localhost:${port}/api/ai/policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ]);

    if (!environmentResp.ok) throw new Error(`/api/ai/environment HTTP ${environmentResp.status}`);
    if (!policyResp.ok) throw new Error(`/api/ai/policy HTTP ${policyResp.status}`);

    const environment = await environmentResp.json();
    const policy = await policyResp.json();

    if (typeof environment.fallback !== "boolean" || !environment.directive) {
      throw new Error("environment payload invalid");
    }
    if (typeof policy.fallback !== "boolean" || !Array.isArray(policy.policies)) {
      throw new Error("policy payload invalid");
    }
  } finally {
    proxy.kill("SIGTERM");
  }
}

function assertFilesExist(files) {
  const missing = files.filter((f) => !existsSync(f));
  if (missing.length === 0) return;
  throw new Error(`required files missing:\n${missing.map((m) => `- ${m}`).join("\n")}`);
}

async function main() {
  console.log("[1/5] unit tests");
  await run("npm test", npmCmd, ["test"]);

  console.log("[2/5] production build");
  await run("npm run build", npmCmd, ["run", "build"]);

  console.log("[3/5] required docs");
  assertFilesExist([
    "docs/assignment3/demo-video-script.md",
    "docs/assignment3/A3-report-final.md",
    "docs/assignment3/A3-report-final.pdf",
    "docs/assignment3/submission-checklist.md",
  ]);

  console.log("[4/5] build artifact");
  assertFilesExist(["build-dist.zip"]);

  console.log("[5/5] runtime endpoint quick check");
  await verifyProxyContract();

  console.log("A3 local verification completed.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
