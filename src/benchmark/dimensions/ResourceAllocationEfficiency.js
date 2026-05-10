// ResourceAllocationEfficiency — RAE dimension plugin (S6).
//
// Operations-research style metric family for the academic benchmark.
// Pure read-only over harness samples; conforms to DimensionPlugin protocol
// (see src/benchmark/framework/DimensionPlugin.js).
//
// Score families produced (all in [0,1] except path_overhead):
//   - rae_sufficiency       ∈ [0,1]  higher is better; clamp(food/demand) × clamp(wood/demand)
//   - rae_distribution_gini ∈ [0,1]  lower is better; Gini over per-zone resource availability
//   - rae_idle_capacity     ∈ [0,1]  lower is better; fraction of idle workers
//   - rae_path_overhead     ∈ [1,∞)  lower is better; placeholder=1.0 until S6 wave-2 wires PathCache hooks
//
// ScoringEngine consumers MUST normalize: pass `rae_sufficiency` directly,
// invert `(1 - rae_distribution_gini)` and `(1 - rae_idle_capacity)`, and
// transform `1 / rae_path_overhead` before feeding bayesianScore (which
// expects [0,1] benefit scores).
//
// All four are time-weighted means across the sample window.

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

export const ResourceAllocationEfficiencyPlugin = {
  id: "rae",
  label: "Resource Allocation Efficiency",
  scoreDimensions: ["rae_sufficiency", "rae_distribution_gini", "rae_idle_capacity", "rae_path_overhead"],

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
      return { rae_sufficiency: 0, rae_distribution_gini: 0, rae_idle_capacity: 0, rae_path_overhead: 1 };
    }
    const last = samples[samples.length - 1];
    const foodDemand = Math.max(1, last.workers * 1.0);
    const woodDemand = Math.max(1, last.workers * 0.4);
    const sufficiency = clamp01(last.food / foodDemand) * clamp01(last.wood / woodDemand);

    const idleFracs = samples.map(s => s.workers > 0 ? s.idleWorkers / s.workers : 0);
    const idleAvg = idleFracs.reduce((a, b) => a + b, 0) / idleFracs.length;

    const resourceVec = [last.food, last.wood, last.stone, last.herbs];
    const distributionGini = gini(resourceVec);

    return {
      rae_sufficiency: Number(sufficiency.toFixed(4)),
      rae_distribution_gini: Number(distributionGini.toFixed(4)),
      rae_idle_capacity: Number(idleAvg.toFixed(4)),
      // Path overhead requires PathCache hooks; placeholder until S6 wave-2.
      rae_path_overhead: 1.0,
    };
  },
};
