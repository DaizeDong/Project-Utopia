import { spawn } from "node:child_process";
import process from "node:process";

import { loadEnvIntoProcess } from "./env-loader.mjs";
import { assertLiveLlmGateAvailable } from "./long-run-support.mjs";
import { writeLongRunSummary } from "./long-run-report.mjs";

const nodeCmd = process.execPath;
const forwardedArgs = process.argv.slice(2);

function run(label, scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(nodeCmd, [scriptPath, ...forwardedArgs], {
      cwd: process.cwd(),
      shell: false,
      stdio: "inherit",
      env: process.env,
      windowsHide: false,
    });
    child.on("exit", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${label} failed with exit code ${code}`));
    });
    child.on("error", reject);
  });
}

async function main() {
  loadEnvIntoProcess();
  await run("verify:long:fallback", "scripts/verify-long-fallback.mjs");
  try {
    await assertLiveLlmGateAvailable();
  } catch (err) {
    writeLongRunSummary();
    throw err;
  }
  await run("verify:long:llm", "scripts/verify-long-llm.mjs");
  const summaryPath = writeLongRunSummary();
  console.log(`[verify:long] summary -> ${summaryPath}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
