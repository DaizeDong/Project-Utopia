// test/perf-system-budget.test.js
//
// v0.10.1-n (A2 perftrace, Round 0 final-polish-loop) — regression smoke for
// the per-system tick budget. Runs a stress preset for ~600 ticks at a fixed
// seed, instruments per-system wall-clock with the same EMA contract as
// `GameApp.stepSimulation` (state.debug.systemTimingsMs), then asserts:
//
//   (a) no single system's smoothed `.avg` exceeds the soft budget
//       (TOP_SYSTEM_AVG_BUDGET_MS, calibrated 2× of the highest observed
//       value the plan expected — see Risks §5 in the plan; first run is
//       intentionally permissive so it does not flake on slow CI).
//   (b) sum of `.avg` across systems stays under
//       BALANCE.maxStepsPerFrame * (1000/30) ms — i.e. the budget that
//       supports the 8× target at the standard 30 Hz fixed step.
//
// The test is `t.skip()`d when CI_FAST=1 so it does not block fast PR cycles.
//
// This is observability infrastructure — its purpose is to *let future rounds
// see* which system spikes, not to assert a tight regression today.
//
// Plan: assignments/homework7/Final-Polish-Loop/Round0/Plans/A2-performance-auditor.md
import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { SimHarness, DT_SEC } from "../src/benchmark/framework/SimHarness.js";
import { BENCHMARK_PRESETS } from "../src/benchmark/BenchmarkPresets.js";
import { BALANCE } from "../src/config/balance.js";

const TICK_COUNT = 600;
const FIXED_SEED = 4242;
const TEMPLATE_ID = "temperate_plains";
// Stress preset selection — the plan calls for "ConfigA stress preset"; we
// use `crisis_compound` (category: stress) as the closest existing preset
// because there is no preset literally named ConfigA.
const STRESS_PRESET_ID = "crisis_compound";

// Soft budgets — see header comment. These are intentionally permissive so
// the first-ever run flags real outliers (the regression we want to learn
// about) without flaking on transient CPU contention. Round 1 will tune.
const TOP_SYSTEM_AVG_BUDGET_MS = 12;
// `BALANCE.fastForwardScheduler.maxStepsPerFrame` (12 in v0.10.1-n) is the
// upper bound on sim steps per RAF frame. Fixed step is 1/30s = 33.33ms,
// so the soft total-cost ceiling is 12 * 33.33 ≈ 400ms — generous on
// purpose; we want this test to fail only on real regressions.
const TOTAL_AVG_BUDGET_MS = (BALANCE.fastForwardScheduler?.maxStepsPerFrame ?? 12) * (1000 / 30);

function profiledTick(harness) {
  const state = harness.state;
  const debug = state.debug ?? (state.debug = {});
  const timings = debug.systemTimingsMs ?? (debug.systemTimingsMs = {});
  for (const system of harness.systems) {
    const t0 = performance.now();
    try {
      system.update(DT_SEC, state, harness.services);
    } catch (err) {
      // Mirror GameApp.stepSimulation: errors don't stop profiling. Surface
      // them via the warningLog so test output can show what blew up.
      const log = state.metrics?.warningLog;
      if (Array.isArray(log)) {
        log.push({
          id: `perf_test_${log.length}`,
          sec: state.metrics?.timeSec ?? 0,
          level: "error",
          source: system.name ?? system.constructor?.name ?? "unknown",
          message: String(err?.message ?? err),
        });
      }
    } finally {
      const dtMs = performance.now() - t0;
      const name = system.name ?? system.constructor?.name ?? "unknown";
      const stat = timings[name] ?? { last: 0, avg: 0, peak: 0 };
      stat.last = dtMs;
      // Same EMA contract as GameApp.stepSimulation: avg uses 0.85/0.15,
      // peak decays at 0.996 per profiled tick.
      stat.avg = stat.avg * 0.85 + dtMs * 0.15;
      stat.peak = Math.max(stat.peak * 0.996, dtMs);
      timings[name] = stat;
    }
  }
  harness.refreshPopulationStats();
}

test("perf-system-budget: top hot systems stay within tick budget under stress", { concurrency: false }, async (t) => {
  if (process.env.CI_FAST === "1") {
    t.skip("CI_FAST=1 — skipping perf budget regression on fast CI");
    return;
  }

  const preset = BENCHMARK_PRESETS.find((p) => p.id === STRESS_PRESET_ID);
  assert.ok(preset, `preset ${STRESS_PRESET_ID} must exist in BENCHMARK_PRESETS`);

  const harness = new SimHarness({
    templateId: TEMPLATE_ID,
    seed: FIXED_SEED,
    aiEnabled: false,
    preset,
    runtimeProfile: "long_run",
  });

  // Warm-up — first ticks are noisy because EMAs haven't converged. Skip
  // their contribution to the smoothed avg by running them and then resetting
  // the timings map. 30 ticks ≈ 1 second of sim time.
  const WARMUP = 30;
  for (let i = 0; i < WARMUP; i += 1) {
    profiledTick(harness);
    if (harness.state.session.phase === "end") break;
  }
  harness.state.debug.systemTimingsMs = {};

  for (let i = 0; i < TICK_COUNT; i += 1) {
    profiledTick(harness);
    if (harness.state.session.phase === "end") break;
  }

  const timings = harness.state.debug?.systemTimingsMs ?? {};
  const entries = Object.entries(timings)
    .map(([name, stat]) => ({
      name,
      last: Number(stat?.last ?? 0),
      avg: Number(stat?.avg ?? 0),
      peak: Number(stat?.peak ?? 0),
    }))
    .sort((a, b) => b.avg - a.avg);

  assert.ok(entries.length > 0, "expected at least one system to be profiled");

  const top = entries[0];
  const totalAvg = entries.reduce((sum, e) => sum + e.avg, 0);

  // Diagnostic: include the top-3 in the assertion message so a budget
  // failure tells the next reviewer exactly which system regressed.
  const topSummary = entries.slice(0, 3)
    .map((e) => `${e.name} avg=${e.avg.toFixed(2)}ms peak=${e.peak.toFixed(2)}ms`)
    .join(" | ");

  // (a) per-system soft budget
  assert.ok(
    top.avg <= TOP_SYSTEM_AVG_BUDGET_MS,
    `top system "${top.name}" avg=${top.avg.toFixed(2)}ms exceeded soft budget ${TOP_SYSTEM_AVG_BUDGET_MS}ms. Top-3: ${topSummary}`,
  );

  // (b) sum-of-avg soft budget
  assert.ok(
    totalAvg <= TOTAL_AVG_BUDGET_MS,
    `sum of system avg ${totalAvg.toFixed(2)}ms exceeded total budget ${TOTAL_AVG_BUDGET_MS.toFixed(2)}ms. Top-3: ${topSummary}`,
  );
});
