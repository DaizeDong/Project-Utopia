#!/usr/bin/env node
// long-horizon-bench.mjs — Living World v0.8.0 spec § 16.
//
// Headless CLI harness that boots a deterministic simulation, runs it up to
// 730 in-game days (240 game-sec each), samples DevIndex checkpoints at day
// boundaries {30, 90, 180, 365, 548, 730}, and emits a JSON + Markdown report.
//
// Usage:
//   node scripts/long-horizon-bench.mjs --seed 42 --max-days 365 \
//     --preset temperate_plains --tick-rate 12
//
// Exit code:
//   0 — passed all checkpoint + monotonicity rules
//   1 — checkpoint failure, monotonicity violation, loss before day 180, or
//       I/O / boot error
//
// This script delegates all sim orchestration to long-horizon-helpers.mjs so
// the smoke tests can drive the same code paths without `child_process`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  bootHeadlessSim,
  runToDayBoundary,
  sampleCheckpoint,
  validateCheckpoints,
  computeSaturation,
  currentDay,
  DEFAULT_CHECKPOINT_DAYS,
  DEFAULT_TICK_RATE,
  SEC_PER_DAY,
} from "./long-horizon-helpers.mjs";

const VERSION = "0.8.0";
const DEFAULT_MAX_DAYS = 365;
const DEFAULT_PRESET = "temperate_plains";
const VALID_PRESETS = Object.freeze([
  "temperate_plains",
  "rugged_highlands",
  "archipelago_isles",
  "coastal_ocean",
  "fertile_riverlands",
  "fortified_basin",
]);

// Known flags accepted by this script. `parseArgs` throws on anything else so
// a typo in CI (e.g. `--max-dayz 90`) fails fast instead of silently running
// at the 365-day default. The matrix runner and smoke tests share this list
// via the KNOWN_FLAGS export.
export const KNOWN_FLAGS = Object.freeze([
  "seed", "max-days", "preset", "tick-rate",
  "stop-on-death", "stop-on-saturation",
  "soft-validation", "out-dir",
]);

function parseBool(value, defaultValue, flag) {
  if (value === undefined || value === null) return defaultValue;
  const v = String(value).trim().toLowerCase();
  if (v === "" || v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  throw new Error(`--${flag}: unrecognised boolean value '${value}' (use true/false/1/0/yes/no)`);
}

export function parseArgs(argv = process.argv.slice(2), knownFlags = KNOWN_FLAGS) {
  const args = {};
  const known = new Set(knownFlags);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      throw new Error(`unexpected positional token '${token}' (flags must start with --)`);
    }
    const eqIndex = token.indexOf("=");
    let key;
    let raw;
    if (eqIndex >= 0) {
      key = token.slice(2, eqIndex);
      raw = token.slice(eqIndex + 1);
    } else {
      key = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        raw = next;
        i += 1;
      } else {
        raw = "";
      }
    }
    if (knownFlags !== null && !known.has(key)) {
      throw new Error(`unknown flag '--${key}' (known: ${[...known].join(", ")})`);
    }
    args[key] = raw;
  }
  return args;
}

export function resolveOptions(args) {
  if (args.seed === undefined || args.seed === "") {
    throw new Error("--seed is required (integer).");
  }
  const seed = Number.parseInt(args.seed, 10);
  if (!Number.isFinite(seed)) throw new Error(`--seed must be an integer (got '${args.seed}')`);

  const maxDaysRaw = args["max-days"];
  const maxDays = maxDaysRaw === undefined || maxDaysRaw === ""
    ? DEFAULT_MAX_DAYS
    : Number.parseInt(maxDaysRaw, 10);
  if (!Number.isFinite(maxDays) || maxDays <= 0) {
    throw new Error(`--max-days must be a positive integer (got '${maxDaysRaw}')`);
  }

  const preset = (args.preset ?? DEFAULT_PRESET).toString();
  if (!VALID_PRESETS.includes(preset)) {
    throw new Error(`--preset '${preset}' not in ${VALID_PRESETS.join(", ")}`);
  }

  const tickRateRaw = args["tick-rate"];
  const tickRate = tickRateRaw === undefined || tickRateRaw === ""
    ? DEFAULT_TICK_RATE
    : Number.parseFloat(tickRateRaw);
  if (!Number.isFinite(tickRate) || tickRate <= 0) {
    throw new Error(`--tick-rate must be positive (got '${tickRateRaw}')`);
  }

  const stopOnDeath = parseBool(args["stop-on-death"], true, "stop-on-death");
  const stopOnSaturation = parseBool(args["stop-on-saturation"], true, "stop-on-saturation");
  // `--soft-validation` drops the strict spec § 16.2 threshold gates (DevIndex
  // ≥ N, pop ≥ 8, etc.) but keeps the monotonicity rule + data-integrity
  // rules (non_finite_in_checkpoint, post_terminal_checkpoint, loss_before_
  // day_180). Used by the smoke preset on PR runs — Phase 6 lands the
  // harness; Phase 7 will tune the colony until the hard gates pass without
  // needing this flag.
  const softValidation = parseBool(args["soft-validation"], false, "soft-validation");

  // Default output lands under output/benchmark-runs/long-horizon/ (gitignored
  // via the existing output/ entry). Callers may override via --out-dir;
  // docs/benchmarks/ is reserved for committed baselines, not run artefacts.
  const outDir = path.resolve(
    args["out-dir"] ?? "output/benchmark-runs/long-horizon",
  );

  return {
    seed, maxDays, preset, tickRate,
    stopOnDeath, stopOnSaturation, softValidation, outDir,
  };
}

function checkpointDaysFor(maxDays) {
  return DEFAULT_CHECKPOINT_DAYS.filter((d) => d <= maxDays);
}

function classifyOutcome({ stoppedReason, reachedMaxDays }) {
  if (stoppedReason === "saturation") return "saturated";
  if (stoppedReason === "loss") return "loss";
  if (stoppedReason === "post_terminal") return "post_terminal";
  if (stoppedReason === "guard") return "stalled";
  if (reachedMaxDays) return "max_days_reached";
  return "unknown";
}

// Hard-violation kinds always count, regardless of --soft-validation. These
// represent data-integrity, simulation-crash, or catastrophic-regression
// failures that no amount of parameter tuning should be allowed to mask.
const HARD_VIOLATION_KINDS = Object.freeze(new Set([
  "monotonicity_violation",
  "non_finite_in_checkpoint",
  "post_terminal_checkpoint",
  "loss_before_day_180",
  "simulation_crash",
]));

export async function runBench(options) {
  const {
    seed, maxDays, preset, tickRate,
    stopOnDeath, stopOnSaturation, softValidation = false, outDir,
  } = options;
  const startedAt = Date.now();

  let simCtx;
  const checkpoints = [];
  let stoppedReason = null;
  let reachedMaxDays = false;
  let crashError = null;

  try {
    simCtx = bootHeadlessSim({ seed, preset, tickRate });
    const { state } = simCtx;

    const checkpointDays = checkpointDaysFor(maxDays);

    for (const day of checkpointDays) {
      const result = runToDayBoundary(simCtx, day, {
        earlyStopOnDeath: stopOnDeath,
        earlyStopOnSaturation: stopOnSaturation,
      });
      if (result.checkpoint) checkpoints.push(result.checkpoint);
      if (result.stopped === "loss" || result.stopped === "saturation"
        || result.stopped === "post_terminal" || result.stopped === "guard") {
        stoppedReason = result.stopped;
        break;
      }
    }

    // Run to the max-day boundary if we haven't stopped and haven't already
    // landed on it as a checkpoint.
    if (!stoppedReason) {
      const lastCheckpointDay = checkpoints.at(-1)?.day ?? 0;
      if (lastCheckpointDay < maxDays) {
        const result = runToDayBoundary(simCtx, maxDays, {
          earlyStopOnDeath: stopOnDeath,
          earlyStopOnSaturation: stopOnSaturation,
        });
        if (result.checkpoint) checkpoints.push(result.checkpoint);
        if (result.stopped === "loss" || result.stopped === "saturation"
          || result.stopped === "post_terminal" || result.stopped === "guard") {
          stoppedReason = result.stopped;
        } else {
          reachedMaxDays = true;
          // Sanity check: timeSec must actually have crossed the boundary.
          const timeSec = Number(state.metrics?.timeSec ?? 0);
          if (timeSec < maxDays * SEC_PER_DAY - Number(simCtx.dt ?? 0)) {
            reachedMaxDays = false;
            stoppedReason = "guard";
          }
        }
      } else {
        reachedMaxDays = true;
      }
    }

    // Final-tick snapshot (always appended) so callers can see the terminal
    // state even when it lands mid-boundary.
    const finalCheckpoint = sampleCheckpoint(state, currentDay(state));
    if (checkpoints.length === 0 || checkpoints.at(-1).day !== finalCheckpoint.day) {
      checkpoints.push(finalCheckpoint);
    }
  } catch (err) {
    // Preserve whatever checkpoints we gathered before the crash — a partial
    // artefact on disk is far more useful for post-mortem debugging than a
    // silent vanish.
    crashError = err;
  }

  const state = simCtx?.state;
  const validation = validateCheckpoints(checkpoints);
  const softViolations = softValidation
    ? validation.violations.filter((v) => !HARD_VIOLATION_KINDS.has(v.kind))
    : [];
  const hardViolations = softValidation
    ? validation.violations.filter((v) => HARD_VIOLATION_KINDS.has(v.kind))
    : validation.violations;

  const finalOutcome = crashError
    ? "crash"
    : classifyOutcome({ stoppedReason, reachedMaxDays });

  const survivalScore = Math.floor(Number(state?.metrics?.survivalScore ?? 0));

  const lossBeforeDay180 = finalOutcome === "loss"
    && Number(state?.metrics?.timeSec ?? 0) < 180 * SEC_PER_DAY;
  const violations = [...hardViolations];
  if (lossBeforeDay180) {
    violations.push({
      kind: "loss_before_day_180",
      atGameSec: Number(state?.metrics?.timeSec ?? 0),
    });
  }
  if (crashError) {
    violations.push({
      kind: "simulation_crash",
      message: String(crashError?.message ?? crashError),
      atDay: state ? currentDay(state) : null,
    });
  }
  const passed = violations.length === 0;

  const report = {
    seed,
    preset,
    version: VERSION,
    finalOutcome,
    daysCompleted: state ? currentDay(state) : 0,
    terminatedAtGameSec: Number(state?.metrics?.timeSec ?? 0),
    survivalScore,
    tickRate,
    dt: simCtx?.dt ?? null,
    wallClockMs: Date.now() - startedAt,
    stopOnDeath,
    stopOnSaturation,
    saturationAtEnd: state ? computeSaturation(state) : null,
    softValidation,
    checkpoints,
    passed,
    violations,
    softViolations,
    crashed: crashError !== null,
    crashStack: crashError ? String(crashError?.stack ?? crashError?.message ?? crashError) : null,
  };

  const jsonPath = path.join(outDir, `long-horizon-${seed}-${preset}.json`);
  const mdPath = path.join(outDir, `long-horizon-${seed}-${preset}.md`);
  let writeError = null;
  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(mdPath, renderMarkdown(report), "utf8");
  } catch (err) {
    writeError = err;
    console.error(`[bench:long] failed to write artefacts to ${outDir}: ${err.code ?? ""} ${err.message}`);
    // Last-resort: dump the JSON to stdout so the report is not entirely lost.
    try {
      console.error(`[bench:long] fallback report JSON:\n${JSON.stringify(report)}`);
    } catch {
      console.error("[bench:long] fallback report also failed to serialize.");
    }
  }

  return { report, jsonPath, mdPath, writeError };
}

function fmt(n, digits = 2) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(digits) : "n/a";
}

function renderMarkdown(report) {
  const lines = [];
  lines.push(`# Long-Horizon Benchmark — seed ${report.seed} / ${report.preset}`);
  lines.push("");
  lines.push(`- **Version:** ${report.version}`);
  lines.push(`- **Final outcome:** \`${report.finalOutcome}\``);
  lines.push(`- **Days completed:** ${report.daysCompleted}`);
  lines.push(`- **Terminated at game-sec:** ${fmt(report.terminatedAtGameSec)}`);
  lines.push(`- **Survival score:** ${report.survivalScore}`);
  lines.push(`- **Tick rate / dt:** ${report.tickRate} / ${fmt(report.dt, 4)}s`);
  lines.push(`- **Wall-clock:** ${fmt(report.wallClockMs / 1000)}s`);
  lines.push(`- **Saturation at end:** ${fmt(report.saturationAtEnd, 3)}`);
  lines.push(`- **Passed:** ${report.passed ? "YES" : "NO"}${report.softValidation ? " (soft-validation)" : ""}`);
  if (report.crashed) {
    lines.push(`- **Crashed:** YES — see violations for details`);
  }
  lines.push("");
  lines.push("## Checkpoints");
  lines.push("");
  lines.push("| Day | DevIndex | Smoothed | Pop | Deaths | Sat | Raids | Tier | Food | Wood | Stone | Flags |");
  lines.push("|----:|---------:|---------:|----:|-------:|----:|------:|-----:|-----:|-----:|------:|:------|");
  for (const cp of report.checkpoints) {
    const flags = [];
    if (cp.postTerminal) flags.push("post-terminal");
    lines.push(
      `| ${cp.day} | ${fmt(cp.devIndex)} | ${fmt(cp.devIndexSmoothed)} `
      + `| ${cp.population ?? "n/a"} | ${cp.deathsTotal ?? "n/a"} | ${fmt(cp.saturation, 3)} `
      + `| ${cp.raidsRepelled ?? "n/a"} | ${cp.raidTier ?? "n/a"} `
      + `| ${fmt(cp.resources?.food)} | ${fmt(cp.resources?.wood)} | ${fmt(cp.resources?.stone)} `
      + `| ${flags.join(", ")} |`,
    );
  }
  lines.push("");
  if (report.violations.length > 0) {
    lines.push("## Violations");
    lines.push("");
    for (const v of report.violations) {
      lines.push(`- \`${v.kind}\` ${JSON.stringify(v)}`);
    }
    lines.push("");
  }
  if (report.softViolations && report.softViolations.length > 0) {
    lines.push("## Soft-validation warnings");
    lines.push("");
    lines.push("Threshold gates relaxed for the Phase 6 landing. Phase 7 parameter tuning should eliminate these.");
    lines.push("");
    for (const v of report.softViolations) {
      lines.push(`- \`${v.kind}\` ${JSON.stringify(v)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  let options;
  try {
    options = resolveOptions(parseArgs());
  } catch (err) {
    console.error(`[bench:long] ${err.message}`);
    process.exit(1);
    return;
  }

  console.log(
    `[bench:long] seed=${options.seed} preset=${options.preset} `
    + `maxDays=${options.maxDays} tickRate=${options.tickRate} `
    + `stopOnDeath=${options.stopOnDeath} stopOnSaturation=${options.stopOnSaturation}`,
  );

  const result = await runBench(options);
  const { report, jsonPath, mdPath, writeError } = result;
  if (!writeError) {
    console.log(`[bench:long] wrote ${jsonPath}`);
    console.log(`[bench:long] wrote ${mdPath}`);
  }
  console.log(
    `[bench:long] outcome=${report.finalOutcome} days=${report.daysCompleted} `
    + `devIndex(last)=${report.checkpoints.at(-1)?.devIndex ?? 0} `
    + `survivalScore=${report.survivalScore} passed=${report.passed}`,
  );
  if (!report.passed) {
    const kinds = report.violations.map((v) => v.kind).join(", ");
    console.log(`[bench:long] violations: ${kinds}`);
  }
  // Exit 1 on write error OR on benchmark failure — both are CI-relevant.
  process.exit((report.passed && !writeError) ? 0 : 1);
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error(err.stack ?? err.message ?? err);
    process.exit(1);
  });
}
