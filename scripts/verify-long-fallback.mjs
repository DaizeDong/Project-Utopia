import { spawn } from "node:child_process";
import process from "node:process";

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
  await run("build", npmCmd, ["run", "build"]);
  await run("idle fallback", nodeCmd, ["scripts/soak-browser-idle.mjs", "--ai-mode=fallback", ...forwardedArgs]);
  await run("operator fallback", nodeCmd, ["scripts/soak-browser-operator.mjs", "--ai-mode=fallback", ...forwardedArgs]);
  const summaryPath = writeLongRunSummary();
  console.log(`[verify:long:fallback] summary -> ${summaryPath}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
