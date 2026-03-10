import { spawn } from "node:child_process";
import process from "node:process";

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function run(label, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(npmCmd, args, { stdio: "inherit", shell: true });
    proc.on("exit", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${label} failed with exit code ${code}`));
    });
    proc.on("error", reject);
  });
}

async function main() {
  console.log("[1/6] unit tests");
  await run("test", ["test"]);
  console.log("[2/6] ui tests");
  await run("test:ui", ["run", "test:ui"]);
  console.log("[3/6] build");
  await run("build", ["run", "build"]);
  console.log("[4/6] performance baseline");
  await run("bench:perf", ["run", "bench:perf"]);
  console.log("[5/6] soak simulation");
  await run("soak:sim", ["run", "soak:sim"]);
  console.log("[6/6] a3 verification");
  await run("verify:a3", ["run", "verify:a3"]);
  console.log("Full verification completed.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
