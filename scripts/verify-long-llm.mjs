import { spawn } from "node:child_process";
import process from "node:process";

import { loadEnvIntoProcess } from "./env-loader.mjs";
import { assertLiveLlmGateAvailable } from "./long-run-support.mjs";
import { writeLongRunSummary } from "./long-run-report.mjs";

const nodeCmd = process.execPath;
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const forwardedArgs = process.argv.slice(2);

function run(label, command, args) {
  return new Promise((resolve, reject) => {
    const isWindowsShellCommand = process.platform === "win32" && command.endsWith(".cmd");
    const child = spawn(
      isWindowsShellCommand ? "cmd.exe" : command,
      isWindowsShellCommand ? ["/d", "/s", "/c", command, ...args] : args,
      {
      cwd: process.cwd(),
      shell: false,
      stdio: "inherit",
      env: process.env,
      windowsHide: false,
      }
    );
    child.on("exit", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${label} failed with exit code ${code}`));
    });
    child.on("error", reject);
  });
}

async function main() {
  loadEnvIntoProcess();
  await assertLiveLlmGateAvailable();
  await run("build", npmCmd, ["run", "build"]);
  await run("idle llm", nodeCmd, ["scripts/soak-browser-idle.mjs", "--ai-mode=llm", ...forwardedArgs]);
  await run("operator llm", nodeCmd, ["scripts/soak-browser-operator.mjs", "--ai-mode=llm", ...forwardedArgs]);
  const summaryPath = writeLongRunSummary();
  console.log(`[verify:long:llm] summary -> ${summaryPath}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
