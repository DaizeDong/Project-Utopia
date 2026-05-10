#!/usr/bin/env node
/**
 * RNG coverage audit — answers benchmark_proposal.md Appendix B Q1.
 *
 * Greps every src/**.js file for raw `Math.random()` calls. Any hit
 * outside src/app/rng.js (the seeded PRNG implementation itself) is a
 * determinism leak.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const PATTERN = /Math\.random\s*\(/g;
const ALLOWLIST = new Set([
  "src/app/rng.js".replaceAll("/", "\\"),
  "src/app/rng.js",
]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else if (name.endsWith(".js")) yield p;
  }
}

const leaks = [];
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  if (ALLOWLIST.has(rel)) continue;
  const text = readFileSync(file, "utf8");
  let m;
  PATTERN.lastIndex = 0;
  while ((m = PATTERN.exec(text)) !== null) {
    const before = text.slice(0, m.index);
    const line = before.split("\n").length;
    leaks.push({ file: rel, line });
  }
}

if (leaks.length === 0) {
  console.log("[rng-coverage] OK — no Math.random() outside rng.js");
  process.exit(0);
}
console.log(`[rng-coverage] FOUND ${leaks.length} leak(s):`);
for (const l of leaks) console.log(`  ${l.file}:${l.line}`);
process.exit(1);
