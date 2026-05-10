// ResourceAllocationEfficiency — RAE dimension plugin (S6, P0-3 v2).
//
// Operations-research style metric family for the academic benchmark.
// Pure read-only over harness samples; conforms to DimensionPlugin protocol
// (see src/benchmark/framework/DimensionPlugin.js).
//
// Score families produced (P0-3 v2 — Crafter geometric mean composite):
//   - rae_sufficiency       ∈ [0,1]  higher is better; backward-compat (food×wood product)
//   - rae_composite         ∈ [0,1]  higher is better; Crafter geometric mean over
//                                     4-resource per-capita sufficiency (food/wood/stone/herbs).
//                                     Punishes single-resource starvation; recommended primary.
//   - rae_distribution_gini ∈ [0,1]  lower is better; Gini over resource vector
//   - rae_idle_capacity     ∈ [0,1]  lower is better; fraction of idle workers
//   - rae_path_overhead     ∈ [1,∞)  lower is better; placeholder=1.0 until S6 wave-2
//
// Crafter geometric mean (Hafner 2021): S = exp((1/N) Σ ln(1 + sᵢ)) − 1
//   - +1 / −1 shift handles sᵢ = 0 in log-space without losing rare-resource amplification
//   - score per seed first, then average across seeds (Crafter ordering)
//
// ScoringEngine consumers MUST normalize: pass `rae_composite` or `rae_sufficiency`
// directly; invert `(1 - rae_distribution_gini)` and `(1 - rae_idle_capacity)`;
// transform `1 / rae_path_overhead` before feeding bayesianScore.

import { computeTaskScore } from "../BenchmarkMetrics.js";

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function gini(values) {
  if (!values?.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  let cumulative = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    cumulative += sorted[i] * (i + 1);
    sum += sorted[i];
  }
  if (sum <= 0) return 0;
  return (2 * cumulative) / (n * sum) - (n + 1) / n;
}

/**
 * Crafter geometric mean (Hafner 2021):
 *   S = exp((1/N) Σ ln(1 + sᵢ)) − 1
 * for sᵢ ∈ [0,1]. Punishes single-axis failure: any sᵢ=0 collapses S toward 0.
 */
export function crafterGeometricMean(scores) {
  if (!scores?.length) return 0;
  const N = scores.length;
  const logSum = scores.reduce((acc, s) => acc + Math.log(1 + clamp01(s)), 0);
  return Math.exp(logSum / N) - 1;
}

export const ResourceAllocationEfficiencyPlugin = {
  id: "rae",
  label: "Resource Allocation Efficiency",
  scoreDimensions: ["rae_composite", "rae_sufficiency", "rae_distribution_gini", "rae_idle_capacity", "rae_path_overhead"],

  /**
   * @param {object} harness
   * @param {object} opts
   */
  async collectSamples(harness, opts = {}) {
    const intervalSec = Number(opts.intervalSec ?? 5);
    const durationSec = Number(opts.durationSec ?? 600);
    const samples = [];
    const totalTicks = Math.max(1, Math.round(durationSec / (1 / 30)));
    const sampleEveryTicks = Math.max(1, Math.round(intervalSec / (1 / 30)));

    for (let t = 0; t < totalTicks; t++) {
      await harness.tick();
      if (t % sampleEveryTicks !== 0) continue;
      const s = harness.state;
      const workers = s.agents?.filter(a => a.type === "WORKER" && a.alive !== false) ?? [];
      const idleCount = workers.filter(w => (w.fsm?.state ?? "") === "IDLE").length;
      samples.push({
        t: s.metrics.timeSec ?? 0,
        food: s.resources?.food ?? 0,
        wood: s.resources?.wood ?? 0,
        stone: s.resources?.stone ?? 0,
        herbs: s.resources?.herbs ?? 0,
        workers: workers.length,
        idleWorkers: idleCount,
        prosperity: s.gameplay?.prosperity ?? 0,
        threat: s.gameplay?.threat ?? 0,
      });
      if (s.session?.phase === "end") break;
    }
    return samples;
  },

  /**
   * @param {Array} samples
   * @param {object} _ctx
   */
  selfScore(samples, _ctx = {}) {
    if (!samples?.length) {
      return {
        rae_composite: 0,
        rae_sufficiency: 0,
        rae_distribution_gini: 0,
        rae_idle_capacity: 0,
        rae_path_overhead: 1,
      };
    }
    const last = samples[samples.length - 1];
    const w = Math.max(1, last.workers);

    // Per-resource per-capita sufficiency [0,1]. Demand coefficients chosen to
    // align with worker carry capacity (~1.0 food, 0.4 wood, 0.1 stone, 0.05 herbs
    // per worker per cycle). Tunable as scenario parameters.
    const foodSuf  = clamp01(last.food  / (w * 1.0));
    const woodSuf  = clamp01(last.wood  / (w * 0.4));
    const stoneSuf = clamp01(last.stone / Math.max(1, w * 0.1));
    const herbsSuf = clamp01(last.herbs / Math.max(1, w * 0.05));

    // Backward-compat (v1) — food × wood product
    const sufficiency = foodSuf * woodSuf;

    // P0-3 (v2): Crafter geometric mean over all 4 resource axes.
    // Punishes single-resource starvation more strongly than the v1 product.
    const composite = crafterGeometricMean([foodSuf, woodSuf, stoneSuf, herbsSuf]);

    const idleFracs = samples.map(s => s.workers > 0 ? s.idleWorkers / s.workers : 0);
    const idleAvg = idleFracs.reduce((a, b) => a + b, 0) / idleFracs.length;

    const resourceVec = [last.food, last.wood, last.stone, last.herbs];
    const distributionGini = gini(resourceVec);

    return {
      rae_composite: Number(composite.toFixed(4)),
      rae_sufficiency: Number(sufficiency.toFixed(4)),
      rae_distribution_gini: Number(distributionGini.toFixed(4)),
      rae_idle_capacity: Number(idleAvg.toFixed(4)),
      // TODO(rae_path_overhead): wire when PathCache exposes per-call
      // observed-vs-Manhattan ratios. The required telemetry is the
      // mean(actual_path_len / manhattan_dist) over completed worker paths;
      // PathCache currently emits hit/miss counters but not path-length
      // stats. Either (a) extend PathCache.recordResult() to log
      // {manhattan, computed} and ProbeCollector to expose a rolling mean,
      // or (b) walk all worker `e.blackboard.lastPath` entries during
      // collectSamples — both require new telemetry hooks not present in
      // the current sampling surface. Returning 1.0 (= optimal) means the
      // DimensionNormalizer maps it to 1.0 (best), so this acts as a
      // neutral input until wired.
      rae_path_overhead: 1.0,
    };
  },
};
