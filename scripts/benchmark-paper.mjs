#!/usr/bin/env node
// benchmark-paper.mjs — one-shot paper run entrypoint (V6.1).
//
// Drives the academic-benchmark pipeline end-to-end for a given experiment
// (E1 / E3 / E6 / custom) and emits NDJSON rows ready for figure / table
// generation.
//
// Each NDJSON row carries:
//   {experiment, cellId, scenario, seed, dim, raw, normalized, sandwichNorm,
//    bayesianMean, bayesianCi95, agentId}
//
// Usage:
//   node scripts/benchmark-paper.mjs --experiment E1 \
//     [--scenarios temperate_plains,fortified_basin] \
//     [--seeds 0xC0FFEE,0xBEEF,0xCAFE] \
//     [--cells WW,SW,WS,SS,FB] \
//     [--duration-sec 120] \
//     [--out output/paper/E1.ndjson] \
//     [--concurrency 1]
//
// Experiments:
//   E1  hierarchical (4-channel) vs flat baseline
//       → cells = ["SS","FB"]  (override with --cells)
//   E3  9-cell cross-vendor matrix
//       → cells = ["FB","WW","SW","WS","SS","XV-OPUS-SONNET","XV-DIVERSE-LIGHT",
//                  "XV-DIVERSE-STRONG","XV-OPENWEIGHT-ONLY"]
//   E6  schema failure profile (simplified to 2-3 model)
//       → cells = ["FB","WW","SS"]
//
// LLM integration: by default the driver wires a NoopAgentAdapter (E1/E6
// fallback path) — real-LLM runs are gated by W3 (cross-vendor). Cross-vendor
// cells use a MultiBackendAdapter routing per-channel to the configured
// adapter. With no proxy reachable they collapse to fallbacks gracefully.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { runSeedMatrix } from "../src/benchmark/framework/SeedMatrix.js";
import { ScriptedOraclePolicy } from "../src/benchmark/baselines/ScriptedOraclePolicy.js";
import { MultiBackendAdapter } from "../src/benchmark/baselines/MultiBackendAdapter.js";
import { NoopAgentAdapter } from "../src/simulation/ai/llm/AgentAdapter.js";
import {
  DIMENSION_NORMALIZERS,
  normalizeDimension,
  buildSandwichTriple,
} from "../src/benchmark/framework/DimensionNormalizer.js";
import { sandwichNormalize, bayesianScore } from "../src/benchmark/framework/ScoringEngine.js";
import {
  buildBackendsForCell as buildBackends,
  instantiateAdapterForBackend as instantiateBackend,
  DEFAULT_AGENT_ROUTING as ROUTING,
} from "../server/config/agent-routing.js";

// ── experiment definitions ────────────────────────────────────────────

export const PAPER_EXPERIMENTS = Object.freeze({
  E1: {
    description: "hierarchical (4-channel) vs flat baseline",
    defaultCells: ["SS", "FB"],
  },
  E3: {
    description: "9-cell cross-vendor matrix",
    defaultCells: [
      "FB", "WW", "SW", "WS", "SS",
      "XV-OPUS-SONNET", "XV-DIVERSE-LIGHT", "XV-DIVERSE-STRONG", "XV-OPENWEIGHT-ONLY",
    ],
  },
  E6: {
    description: "schema failure profile (simplified)",
    defaultCells: ["FB", "WW", "SS"],
  },
});

const DEFAULT_SCENARIOS = ["temperate_plains", "fortified_basin"];
const DEFAULT_SEEDS_HEX = ["0xC0FFEE", "0xBEEF", "0xCAFE"];
const DEFAULT_DURATION_SEC = 120;

// ── arg parsing ───────────────────────────────────────────────────────

/**
 * Parse a comma-separated list, trimming whitespace and dropping empties.
 * @param {string|undefined} s
 * @returns {string[]}
 */
function parseCsv(s) {
  if (!s) return [];
  return String(s).split(",").map((x) => x.trim()).filter((x) => x.length > 0);
}

/**
 * Parse a seed token: supports decimal, 0x-prefix hex, and negative numerics.
 * @param {string} tok
 */
export function parseSeedToken(tok) {
  const t = String(tok).trim();
  if (!t) return NaN;
  if (/^-?0x[0-9a-fA-F]+$/.test(t)) return parseInt(t, 16);
  return Number(t);
}

/**
 * Parse the CLI argument list into a normalized config object.
 * @param {string[]} argv — the raw process.argv.slice(2)
 * @returns {{experiment:string, scenarios:string[], seeds:number[],
 *           cells:string[], durationSec:number, out:string, concurrency:number}}
 */
export function parseDriverArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      experiment:    { type: "string" },
      scenarios:     { type: "string" },
      seeds:         { type: "string" },
      cells:         { type: "string" },
      "duration-sec":{ type: "string" },
      out:           { type: "string" },
      concurrency:   { type: "string" },
      help:          { type: "boolean", short: "h" },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    return { help: true };
  }
  const experiment = String(values.experiment ?? "").toUpperCase();
  if (!experiment || !PAPER_EXPERIMENTS[experiment]) {
    throw new Error(
      `--experiment is required and must be one of: ${Object.keys(PAPER_EXPERIMENTS).join(", ")}`,
    );
  }

  const scenarios = parseCsv(values.scenarios);
  const cells = parseCsv(values.cells);
  const seedsRaw = parseCsv(values.seeds);
  const seeds = seedsRaw.map(parseSeedToken).filter((n) => Number.isFinite(n));

  const durationSec = values["duration-sec"] !== undefined
    ? Number(values["duration-sec"]) : DEFAULT_DURATION_SEC;
  const concurrency = values.concurrency !== undefined
    ? Math.max(1, Number(values.concurrency)) : 1;

  // Default fill-ins — preserve user override when present.
  const filledScenarios = scenarios.length > 0 ? scenarios : DEFAULT_SCENARIOS.slice();
  const filledCells     = cells.length > 0 ? cells : PAPER_EXPERIMENTS[experiment].defaultCells.slice();
  const filledSeeds     = seeds.length > 0 ? seeds : DEFAULT_SEEDS_HEX.map(parseSeedToken);

  // Validate cell labels exist in the routing table.
  for (const c of filledCells) {
    if (!Object.prototype.hasOwnProperty.call(ROUTING, c)) {
      throw new Error(`unknown cell label: ${c} (known: ${Object.keys(ROUTING).join(", ")})`);
    }
  }
  // Default output — namespaced by experiment so concurrent runs don't collide.
  const out = String(values.out ?? `output/paper/${experiment}.ndjson`);

  return {
    experiment,
    scenarios: filledScenarios,
    seeds: filledSeeds,
    cells: filledCells,
    durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : DEFAULT_DURATION_SEC,
    out,
    concurrency,
  };
}

// ── adapter wiring ────────────────────────────────────────────────────

/**
 * Materialise a SeedMatrix-compatible `agentConfig` for a given cell label.
 * Uses MultiBackendAdapter when channels route to >1 distinct backend; falls
 * back to the per-channel-uniform path otherwise (NoopAgentAdapter for FB).
 *
 * @param {string} cellId
 * @returns {{adapterClass: Function, adapterOpts: object}}
 */
export function buildAgentConfigForCell(cellId) {
  const backends = buildBackends(cellId);
  // Build per-channel concrete adapters once (cross-vendor cells need
  // distinct LLMClient instances; FB collapses to NoopAgentAdapter).
  const channelMap = new Map();
  for (const [ch, cfg] of backends.entries()) {
    channelMap.set(ch, instantiateBackend(cfg));
  }
  // SeedMatrix instantiates adapters via `new adapterClass(adapterOpts)`,
  // so we wrap the channel map in a closure-like factory that returns a
  // pre-built MultiBackendAdapter.
  return {
    adapterClass: function PreBuilt(_opts) {
      return new MultiBackendAdapter(channelMap);
    },
    adapterOpts: {},
  };
}

/**
 * Run the oracle path for a (seed × scenario) sub-matrix using
 * ScriptedOraclePolicy. Each cell is a fresh oracle instance pinned to
 * the scenario it runs against — that's the upper-bound reference for
 * sandwichNormalize.
 *
 * @param {object} params
 * @param {number[]} params.seeds
 * @param {string} params.scenario
 * @param {number} params.durationSec
 * @returns {Promise<Array<object>>} cells
 */
async function runOracleForScenario({ seeds, scenario, durationSec }) {
  const result = await runSeedMatrix({
    seeds,
    scenarios: [scenario],
    durationSec,
    dimensionOpts: { durationSec },
    agentConfig: {
      adapterClass: function ScriptedOracleFactory() {
        return new ScriptedOraclePolicy(scenario);
      },
      adapterOpts: {},
    },
  });
  return result.cells;
}

/**
 * Run the deterministic-fallback path (R_random in sandwichNormalize) using
 * NoopAgentAdapter. The simulation's built-in fallback policies fire on
 * every channel — this is the lower-bound reference.
 *
 * @param {object} params
 * @param {number[]} params.seeds
 * @param {string[]} params.scenarios
 * @param {number} params.durationSec
 * @returns {Promise<Array<object>>} cells
 */
async function runFallback({ seeds, scenarios, durationSec }) {
  const result = await runSeedMatrix({
    seeds,
    scenarios,
    durationSec,
    dimensionOpts: { durationSec },
    agentConfig: {
      adapterClass: NoopAgentAdapter,
      adapterOpts: {},
    },
  });
  return result.cells;
}

// ── main pipeline ─────────────────────────────────────────────────────

/**
 * Run a single experiment end-to-end and return the NDJSON rows (one row
 * per cell × scenario × seed × dim).
 *
 * @param {object} cfg — output of parseDriverArgs
 * @returns {Promise<Array<object>>}
 */
export async function runPaperExperiment(cfg) {
  const { experiment, scenarios, seeds, cells, durationSec, concurrency } = cfg;

  // 1. Reference cells (shared across all agent cells): fallback + oracle.
  const fallbackCells = await runFallback({ seeds, scenarios, durationSec });
  const oracleByScenario = new Map();
  for (const sc of scenarios) {
    const oc = await runOracleForScenario({ seeds, scenario: sc, durationSec });
    oracleByScenario.set(sc, oc);
  }
  // Flatten oracle cells across scenarios for sandwich-triple alignment.
  const allOracleCells = [];
  for (const arr of oracleByScenario.values()) allOracleCells.push(...arr);

  const rows = [];

  // 2. Per-cell agent run.
  for (const cellId of cells) {
    const agentConfig = buildAgentConfigForCell(cellId);
    const result = await runSeedMatrix({
      seeds,
      scenarios,
      durationSec,
      concurrency,
      dimensionOpts: { durationSec },
      agentConfig,
    });
    const agentCells = result.cells;

    // 3. For each registered dim, compute (raw, normalized, sandwichNorm).
    for (const dimKey of Object.keys(DIMENSION_NORMALIZERS)) {
      let triple;
      try {
        triple = buildSandwichTriple(agentCells, fallbackCells, allOracleCells, dimKey);
      } catch (err) {
        // Skip this dim if alignment fails (logged via console.error so
        // the operator can investigate, but continue with other dims).
        // eslint-disable-next-line no-console
        console.error(`[benchmark-paper] dim=${dimKey} sandwich alignment failed: ${err.message}`);
        continue;
      }
      const agentNorm    = triple.agent.map((v) => normalizeDimension(dimKey, v));
      const fallbackNorm = triple.fallback.map((v) => normalizeDimension(dimKey, v));
      const oracleNorm   = triple.oracle.map((v) => normalizeDimension(dimKey, v));
      const sandwichArr  = sandwichNormalize(agentNorm, fallbackNorm, oracleNorm);

      // Bayesian posterior is computed across the full cell × dim sample
      // (per-cell posterior — cell × scenario × seed all collapse into one
      // posterior over [0,1] normalized scores).
      const bayes = bayesianScore(agentNorm.filter((v) => Number.isFinite(v)));

      // Emit one row per (cell, scenario, seed, dim).
      for (let i = 0; i < triple.keys.length; i++) {
        const { seed, scenario } = triple.keys[i];
        rows.push({
          experiment,
          cellId,
          scenario,
          seed,
          dim: dimKey,
          raw: triple.agent[i],
          normalized: agentNorm[i],
          sandwichNorm: sandwichArr[i],
          bayesianMean: bayes.mean,
          bayesianCi95: bayes.ci95,
          agentId: agentCells.find((c) => c.seed === seed && c.scenario === scenario)?.agentId ?? null,
        });
      }
    }
  }

  return rows;
}

/**
 * Write rows to NDJSON, creating the parent directory if needed.
 *
 * @param {string} outPath
 * @param {Array<object>} rows
 */
export function writeNDJSONRows(outPath, rows) {
  const dir = path.dirname(outPath);
  if (dir && dir !== "." && dir !== "/") {
    fs.mkdirSync(dir, { recursive: true });
  }
  const lines = rows.map((r) => JSON.stringify(r)).join("\n");
  fs.writeFileSync(outPath, lines + (lines ? "\n" : ""), "utf-8");
}

function printUsage() {
  // eslint-disable-next-line no-console
  console.log(`benchmark-paper.mjs — V6.1 paper-run entrypoint

Usage:
  node scripts/benchmark-paper.mjs --experiment <E1|E3|E6> [opts]

Options:
  --experiment <id>      one of: ${Object.keys(PAPER_EXPERIMENTS).join(" / ")}
  --scenarios <csv>      default: ${DEFAULT_SCENARIOS.join(",")}
  --seeds <csv>          default: ${DEFAULT_SEEDS_HEX.join(",")}
  --cells <csv>          default: experiment-specific
  --duration-sec <int>   default: ${DEFAULT_DURATION_SEC}
  --out <path>           default: output/paper/<EXPERIMENT>.ndjson
  --concurrency <int>    default: 1

Experiments:
${Object.entries(PAPER_EXPERIMENTS).map(([k, v]) =>
  `  ${k}  ${v.description}\n     defaultCells = [${v.defaultCells.join(", ")}]`,
).join("\n")}
`);
}

// ── CLI entrypoint (only fires when invoked as a script) ──────────────

const isMain = (() => {
  try {
    if (!process.argv[1]) return false;
    // Idiomatic ESM cross-platform main-check.
    const entryUrl = pathToFileURL(path.resolve(process.argv[1])).href;
    return entryUrl === import.meta.url;
  } catch {
    // Fallback: basename match.
    return Boolean(process.argv[1]?.endsWith("benchmark-paper.mjs"));
  }
})();

if (isMain) {
  (async () => {
    let cfg;
    try {
      cfg = parseDriverArgs(process.argv.slice(2));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[benchmark-paper] arg error: ${err.message}\n`);
      printUsage();
      process.exitCode = 2;
      return;
    }
    if (cfg.help) {
      printUsage();
      return;
    }
    // eslint-disable-next-line no-console
    console.log(
      `[benchmark-paper] experiment=${cfg.experiment} cells=[${cfg.cells.join(",")}] `
      + `scenarios=[${cfg.scenarios.join(",")}] seeds=[${cfg.seeds.map((s) => s.toString(16)).join(",")}] `
      + `durationSec=${cfg.durationSec} concurrency=${cfg.concurrency}`,
    );
    const t0 = Date.now();
    const rows = await runPaperExperiment(cfg);
    writeNDJSONRows(cfg.out, rows);
    const t1 = Date.now();
    // eslint-disable-next-line no-console
    console.log(`[benchmark-paper] wrote ${rows.length} rows to ${cfg.out} in ${t1 - t0} ms`);
  })().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`[benchmark-paper] fatal:`, err);
    process.exitCode = 1;
  });
}
