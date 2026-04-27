#!/usr/bin/env node
// long-horizon-matrix.mjs — runs the long-horizon bench over the nightly
// matrix defined in spec § 16.4: 10 seeds × 3 presets = 30 runs, output
// collected under docs/benchmarks/nightly/.
//
// Usage:
//   node scripts/long-horizon-matrix.mjs                # full 30-run matrix
//   node scripts/long-horizon-matrix.mjs --max-days 90  # smoke-matrix variant
//
// Run-level errors do not abort the matrix — we collect every outcome and
// emit a single summary JSON so a failing seed is visible but the whole run
// still produces artefacts. The exit code is 0 iff all runs passed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runBench, parseArgs } from "./long-horizon-bench.mjs";
import { DEFAULT_TICK_RATE } from "./long-horizon-helpers.mjs";

const SEEDS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const PRESETS = Object.freeze(["temperate_plains", "rugged_highlands", "fertile_riverlands"]);

// Matrix-level flags; must stay in sync with the subset supported by this
// runner. `parseArgs` throws on unknown flags — typos fail fast instead of
// silently using defaults across 30 runs.
const MATRIX_FLAGS = Object.freeze(["max-days", "tick-rate", "out-dir"]);

async function main() {
  const args = parseArgs(process.argv.slice(2), MATRIX_FLAGS);
  const maxDays = args["max-days"] === undefined || args["max-days"] === ""
    ? 365
    : Number.parseInt(args["max-days"], 10);
  const tickRate = args["tick-rate"] === undefined || args["tick-rate"] === ""
    ? DEFAULT_TICK_RATE
    : Number.parseFloat(args["tick-rate"]);
  const outDir = path.resolve(args["out-dir"] ?? "output/benchmark-runs/long-horizon/nightly");
  fs.mkdirSync(outDir, { recursive: true });

  console.log(
    `[bench:long:matrix] ${SEEDS.length} seeds × ${PRESETS.length} presets `
    + `= ${SEEDS.length * PRESETS.length} runs; maxDays=${maxDays} tickRate=${tickRate}`,
  );

  const summary = [];
  const startedAt = Date.now();

  for (const preset of PRESETS) {
    for (const seed of SEEDS) {
      const runStart = Date.now();
      let entry;
      try {
        const { report, writeError } = await runBench({
          seed,
          preset,
          maxDays,
          tickRate,
          stopOnDeath: true,
          stopOnSaturation: true,
          outDir,
        });
        entry = {
          seed,
          preset,
          passed: report.passed && !writeError,
          crashed: report.crashed === true,
          writeError: writeError ? String(writeError.message ?? writeError) : null,
          finalOutcome: report.finalOutcome,
          daysCompleted: report.daysCompleted,
          survivalScore: report.survivalScore,
          violations: report.violations.map((v) => v.kind),
          wallClockMs: report.wallClockMs,
        };
      } catch (err) {
        // runBench is designed to never throw (it catches internally), but
        // guard belt-and-braces against new error paths (e.g. out-of-memory
        // in the Node runtime itself).
        entry = {
          seed,
          preset,
          passed: false,
          crashed: true,
          writeError: null,
          error: String(err?.message ?? err),
          wallClockMs: Date.now() - runStart,
        };
      }
      summary.push(entry);
      console.log(
        `[bench:long:matrix] ${preset} seed=${seed} passed=${entry.passed} `
        + `outcome=${entry.finalOutcome ?? "error"} days=${entry.daysCompleted ?? "?"} `
        + `t=${(entry.wallClockMs / 1000).toFixed(1)}s`,
      );
    }
  }

  // Split counts so operators can distinguish "3 runs missed thresholds"
  // (tuning issue) from "3 runs crashed" (code bug).
  const totals = {
    total: summary.length,
    passed: summary.filter((r) => r.passed).length,
    thresholdFailures: summary.filter((r) => !r.passed && !r.crashed).length,
    crashes: summary.filter((r) => r.crashed).length,
    writeErrors: summary.filter((r) => r.writeError).length,
  };

  const summaryPath = path.join(outDir, "matrix-summary.json");
  fs.writeFileSync(
    summaryPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      totalWallClockMs: Date.now() - startedAt,
      maxDays,
      tickRate,
      totals,
      runs: summary,
    }, null, 2)}\n`,
    "utf8",
  );
  console.log(`[bench:long:matrix] wrote ${summaryPath}`);
  console.log(
    `[bench:long:matrix] totals: ${totals.passed}/${totals.total} passed `
    + `(${totals.thresholdFailures} threshold, ${totals.crashes} crashes, `
    + `${totals.writeErrors} write-errors)`,
  );

  const allPassed = summary.every((r) => r.passed);
  process.exit(allPassed ? 0 : 1);
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error(err.stack ?? err.message ?? err);
    process.exit(1);
  });
}
