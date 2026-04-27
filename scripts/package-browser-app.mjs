import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.resolve(projectRoot, "launcher-dist");
const packageRoot = path.resolve(outputRoot, "Project-Utopia-Launcher");
const nodeExeSource = process.execPath;
const zipPath = path.resolve(outputRoot, "Project-Utopia-Launcher.zip");

const copies = [
  [path.resolve(projectRoot, ".env.example"), path.resolve(packageRoot, ".env.example")],
  [path.resolve(projectRoot, "Project Utopia.cmd"), path.resolve(packageRoot, "Project Utopia.cmd")],
  [path.resolve(projectRoot, "README-Launcher.txt"), path.resolve(packageRoot, "README-Launcher.txt")],
  [path.resolve(projectRoot, "launch-project-utopia.ps1"), path.resolve(packageRoot, "launch-project-utopia.ps1")],
  [path.resolve(projectRoot, "desktop", "server.mjs"), path.resolve(packageRoot, "desktop", "server.mjs")],
  [path.resolve(projectRoot, "desktop", "serve-app.mjs"), path.resolve(packageRoot, "desktop", "serve-app.mjs")],
  [path.resolve(projectRoot, "scripts", "env-loader.mjs"), path.resolve(packageRoot, "scripts", "env-loader.mjs")],
  [path.resolve(projectRoot, "dist"), path.resolve(packageRoot, "dist")],
  [path.resolve(projectRoot, "src"), path.resolve(packageRoot, "src")],
  [nodeExeSource, path.resolve(packageRoot, "runtime", "node.exe")],
];

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

if (!fs.existsSync(path.resolve(projectRoot, "dist", "index.html"))) {
  throw new Error("Missing dist/index.html. Run 'npm run build' first.");
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(packageRoot, { recursive: true });

for (const [from, to] of copies) {
  if (!fs.existsSync(from)) {
    throw new Error(`Missing required path: ${from}`);
  }
  ensureParent(to);
  fs.cpSync(from, to, { recursive: true, force: true });
}

const command = `Compress-Archive -Path '${packageRoot.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`;
const result = spawnSync(
  "powershell",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
  { cwd: projectRoot, stdio: "inherit" },
);

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`[launcher-dist] Wrote ${zipPath}`);
