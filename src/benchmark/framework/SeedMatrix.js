// SeedMatrix — multi-seed × multi-scenario benchmark runner (W1 P0-1).
//
// Drives `seeds × scenarios` cells through SimHarness, applying the 5
// academic-benchmark dimension plugins to each finished cell, and aggregates
// per-Crafter ordering: per-seed FIRST, then average across seeds. NDJSON
// dump is opt-in for downstream analysis.
//
// Pure I/O at the leaf — no React/Three.js — and serial cells by default
// to keep MemoryStore / SimulationClock determinism intact across cells.
// `concurrency` opt unlocks Promise.all batching for users that have
// already verified their adapter is concurrency-safe.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { SimHarness, DT_SEC } from "./SimHarness.js";
import { ACADEMIC_BENCHMARK_DIMENSIONS } from "../dimensions/index.js";
import { evaluateRunOutcomeState } from "../../app/runOutcome.js";
import { NoopAgentAdapter } from "../../simulation/ai/llm/AgentAdapter.js";

/**
 * @typedef {object} SeedMatrixOpts
 * @property {number[]} seeds
 * @property {string[]} scenarios — templateId list
 * @property {object} [agentConfig] — { adapterClass, adapterOpts } (default NoopAgentAdapter)
 * @property {number} [durationSec] — default 120
 * @property {boolean} [aiEnabled] — default false (matches Noop path)
 * @property {string} [runtimeProfile] — default "long_run"
 * @property {number} [concurrency] — default 1 (serial)
 * @property {object} [dimensionOpts] — passed to plugin.collectSamples
 * @property {string} [ndjsonPath] — optional file path to dump cells as NDJSON
 */

/**
 * @typedef {object} SeedMatrixCell
 * @property {number} seed
 * @property {string} scenario
 * @property {string} agentId
 * @property {Record<string, number>} perDimensionScores
 * @property {object} aiRuntime — { totalCalls, fallbackCalls, schemaErrors }
 * @property {object|null} outcome
 * @property {number} wallclockMs
 * @property {string} [error]
 */

/**
 * @typedef {object} SeedMatrixResult
 * @property {SeedMatrixCell[]} cells
 * @property {Array<{seed:number, scenarios: SeedMatrixCell[]}>} bySeed
 * @property {{tot:number, mean:number, std:number}} summary
 */

const DEFAULT_DURATION_SEC = 120;

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function buildAdapter(agentConfig) {
  if (!agentConfig) return new NoopAgentAdapter();
  const { adapterClass, adapterOpts } = agentConfig;
  if (typeof adapterClass !== "function") return new NoopAgentAdapter();
  return new adapterClass(adapterOpts ?? {});
}

function adapterIdOf(adapter) {
  if (!adapter) return "noop";
  if (adapter.constructor && adapter.constructor.name) return adapter.constructor.name;
  return "anonymous";
}

/**
 * Run a single (seed, scenario) cell. Internally we instantiate ONE
 * SimHarness per dimension plugin — each plugin owns its sample-collection
 * tick loop and we honor that contract rather than reinterpreting
 * intervals. Per-cell wallclock is the sum across plugins.
 *
 * @param {number} seed
 * @param {string} scenario
 * @param {SeedMatrixOpts} opts
 * @returns {Promise<SeedMatrixCell>}
 */
export async function runOneCell(seed, scenario, opts) {
  const durationSec = Number(opts.durationSec ?? DEFAULT_DURATION_SEC);
  const aiEnabled = Boolean(opts.aiEnabled ?? false);
  const runtimeProfile = String(opts.runtimeProfile ?? "long_run");
  const dimensionOpts = { durationSec, ...(opts.dimensionOpts ?? {}) };

  const adapter = buildAdapter(opts.agentConfig);
  const agentId = adapterIdOf(adapter);

  const startMs = nowMs();
  const perDimensionScores = {};
  let aiRuntime = { totalCalls: 0, fallbackCalls: 0, schemaErrors: 0 };
  let outcome = null;
  let lastErr = "";

  for (const plugin of ACADEMIC_BENCHMARK_DIMENSIONS) {
    let harness;
    try {
      harness = new SimHarness({
        templateId: scenario,
        seed,
        aiEnabled,
        runtimeProfile,
        // Wire the adapter at construction so AdapterToLLMClient becomes
        // services.llmClient and the per-channel sim systems
        // (StrategicDirector / EnvironmentDirectorSystem / NPCBrainSystem /
        // AgentDirectorSystem) actually invoke the adapter. Bug fix: prior
        // to this we only set state.ai.adapter, which no system reads —
        // every alternate adapter was dead code.
        agentAdapter: adapter,
      });

      const samples = await plugin.collectSamples(harness, dimensionOpts);
      const score = plugin.selfScore(samples ?? [], { agentId, seed, scenario });
      for (const dim of plugin.scoreDimensions) {
        const v = Number(score?.[dim]);
        perDimensionScores[dim] = Number.isFinite(v) ? v : 0;
      }

      // Pull aiRuntime from the LAST plugin run's state — these are
      // additive counters maintained by adapters / fallback systems.
      const rt = harness.state?.ai?.runtime;
      if (rt) {
        aiRuntime = {
          totalCalls: Number(rt.totalCalls ?? aiRuntime.totalCalls),
          fallbackCalls: Number(rt.fallbackCalls ?? aiRuntime.fallbackCalls),
          schemaErrors: Number(rt.schemaErrors ?? aiRuntime.schemaErrors),
        };
      }
      outcome = evaluateRunOutcomeState(harness.state) ?? outcome;
    } catch (err) {
      lastErr = String(err?.message ?? err);
      // record zeros for this plugin's dims, keep going for the rest
      for (const dim of plugin.scoreDimensions) {
        perDimensionScores[dim] = 0;
      }
    }
  }

  return {
    seed,
    scenario,
    agentId,
    perDimensionScores,
    aiRuntime,
    outcome,
    wallclockMs: nowMs() - startMs,
    ...(lastErr ? { error: lastErr } : {}),
  };
}

/**
 * Drive the full seeds × scenarios matrix.
 *
 * @param {SeedMatrixOpts} opts
 * @returns {Promise<SeedMatrixResult>}
 */
export async function runSeedMatrix(opts) {
  if (!opts || !Array.isArray(opts.seeds) || opts.seeds.length === 0) {
    throw new Error("runSeedMatrix: opts.seeds must be a non-empty array");
  }
  if (!Array.isArray(opts.scenarios) || opts.scenarios.length === 0) {
    throw new Error("runSeedMatrix: opts.scenarios must be a non-empty array");
  }

  const concurrency = Math.max(1, Number(opts.concurrency ?? 1));

  // Build the (seed, scenario) job list. Order is seeds-major so that
  // per-seed batches stay contiguous in `cells` even at concurrency=1.
  /** @type {Array<{seed:number, scenario:string}>} */
  const jobs = [];
  for (const seed of opts.seeds) {
    for (const scenario of opts.scenarios) {
      jobs.push({ seed, scenario });
    }
  }

  /** @type {SeedMatrixCell[]} */
  const cells = new Array(jobs.length);

  if (concurrency === 1) {
    for (let i = 0; i < jobs.length; i++) {
      cells[i] = await runOneCell(jobs[i].seed, jobs[i].scenario, opts);
    }
  } else {
    let cursor = 0;
    async function worker() {
      while (true) {
        const idx = cursor++;
        if (idx >= jobs.length) return;
        cells[idx] = await runOneCell(jobs[idx].seed, jobs[idx].scenario, opts);
      }
    }
    const pool = [];
    for (let w = 0; w < Math.min(concurrency, jobs.length); w++) pool.push(worker());
    await Promise.all(pool);
  }

  // bySeed ordering
  const bySeedMap = new Map();
  for (const c of cells) {
    if (!bySeedMap.has(c.seed)) bySeedMap.set(c.seed, []);
    bySeedMap.get(c.seed).push(c);
  }
  const bySeed = [...bySeedMap.entries()].map(([seed, scenarios]) => ({ seed, scenarios }));

  // summary — wallclock totals across cells
  const wallclocks = cells.map((c) => Number(c.wallclockMs) || 0);
  const tot = wallclocks.reduce((a, b) => a + b, 0);
  const mean = wallclocks.length ? tot / wallclocks.length : 0;
  const variance = wallclocks.length
    ? wallclocks.reduce((acc, v) => acc + (v - mean) ** 2, 0) / wallclocks.length
    : 0;
  const std = Math.sqrt(variance);

  if (opts.ndjsonPath) {
    await writeNDJSON(opts.ndjsonPath, cells);
  }

  return {
    cells,
    bySeed,
    summary: { tot, mean, std },
  };
}

/**
 * Aggregate per Crafter pattern: per-seed FIRST (mean across scenarios for
 * that seed), THEN grand mean / std across seed-level means. This is the
 * variance-reduced ordering that matches the Crafter benchmark norm.
 *
 * @param {SeedMatrixCell[]} cells
 * @param {string} scoreKey
 * @returns {{ meanPerSeed: number[], grandMean: number, grandStd: number }}
 */
export function aggregatePerSeedThenAverage(cells, scoreKey) {
  if (!Array.isArray(cells) || cells.length === 0) {
    return { meanPerSeed: [], grandMean: 0, grandStd: 0 };
  }
  const bySeed = new Map();
  for (const c of cells) {
    const arr = bySeed.get(c.seed) ?? [];
    const v = Number(c.perDimensionScores?.[scoreKey]);
    arr.push(Number.isFinite(v) ? v : 0);
    bySeed.set(c.seed, arr);
  }
  const meanPerSeed = [];
  for (const [, arr] of bySeed) {
    const m = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    meanPerSeed.push(m);
  }
  const grandMean = meanPerSeed.length
    ? meanPerSeed.reduce((a, b) => a + b, 0) / meanPerSeed.length
    : 0;
  const grandVar = meanPerSeed.length
    ? meanPerSeed.reduce((acc, v) => acc + (v - grandMean) ** 2, 0) / meanPerSeed.length
    : 0;
  const grandStd = Math.sqrt(grandVar);
  return { meanPerSeed, grandMean, grandStd };
}

/**
 * Write each cell as a one-line JSON record (NDJSON). Synchronous fs is
 * fine here — benchmark dumps are bounded and we're already off the hot
 * path.
 *
 * @param {string} path
 * @param {SeedMatrixCell[]} cells
 */
export async function writeNDJSON(path, cells) {
  if (!path || !Array.isArray(cells)) return;
  const dir = dirname(path);
  if (dir && dir !== "." && dir !== "/") {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      // best-effort: caller may already have the dir
    }
  }
  const lines = cells.map((c) => JSON.stringify(c)).join("\n");
  writeFileSync(path, lines + (lines ? "\n" : ""), "utf-8");
}

// Re-exported for convenience so callers don't have to reach into SimHarness.
export { DT_SEC };
