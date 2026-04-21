import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const sourceDir = path.resolve(projectRoot, "desktop-dist", "win-unpacked");
const outputFile = path.resolve(projectRoot, "desktop-dist", "Project-Utopia-win-unpacked.zip");

if (!fs.existsSync(sourceDir)) {
  throw new Error(`Desktop app directory not found: ${sourceDir}`);
}

if (fs.existsSync(outputFile)) {
  fs.rmSync(outputFile, { force: true });
}

const escapedSource = sourceDir.replace(/'/g, "''");
const escapedOutput = outputFile.replace(/'/g, "''");
const command = `Compress-Archive -Path '${escapedSource}\\*' -DestinationPath '${escapedOutput}' -Force`;
const result = spawnSync(
  "powershell",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
  { cwd: projectRoot, stdio: "inherit" },
);

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`[desktop:zip] Wrote ${outputFile}`);
