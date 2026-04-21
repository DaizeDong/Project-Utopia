import fs from "node:fs";
import process from "node:process";

import { startDesktopServer } from "./server.mjs";

function parseArgs(argv) {
  const options = {
    urlFile: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] ?? "");
    if (token === "--url-file") {
      options.urlFile = String(argv[i + 1] ?? "").trim();
      i += 1;
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const server = await startDesktopServer();
const origin = `${server.origin}/`;

if (options.urlFile) {
  fs.writeFileSync(options.urlFile, origin, "utf8");
}

console.log(`[Project Utopia] serving ${origin}`);

let shuttingDown = false;
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  await server.close().catch(() => {});
  process.exit(code);
}

process.on("SIGINT", () => {
  void shutdown(0);
});
process.on("SIGTERM", () => {
  void shutdown(0);
});
process.on("uncaughtException", (err) => {
  console.error(err);
  void shutdown(1);
});
process.on("unhandledRejection", (err) => {
  console.error(err);
  void shutdown(1);
});

setInterval(() => {}, 1 << 30);
