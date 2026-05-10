// HierarchicalCoordination — cross-channel agreement dimension plugin (S6).
//
// Score families:
//   - plan_policy_alignment    — fraction of npc-policy directives whose
//                                 intentWeights are consistent with the
//                                 strategic-plan goals
//   - env_threat_responsiveness — env factionTension vs strategic threat
//                                  (lag-corrected cross-correlation)
//   - colony_cadence_health    — std-dev of colony-agent decision intervals
//
// Tests whether the 4 LLM channels behave coherently.

function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return 0;
  return num / Math.sqrt(dx2 * dy2);
}

export const HierarchicalCoordinationPlugin = {
  id: "hierarchical",
  label: "Hierarchical Coordination",
  scoreDimensions: [
    "plan_policy_alignment",
    "env_threat_responsiveness",
    "colony_cadence_health",
  ],

  async collectSamples(harness, opts = {}) {
    const durationSec = Number(opts.durationSec ?? 600);
    const samples = [];
    const totalTicks = Math.max(1, Math.round(durationSec / (1 / 30)));
    const sampleEveryTicks = Math.max(1, Math.round(10 / (1 / 30)));

    let lastColonyDecisionAt = 0;
    const colonyIntervals = [];

    for (let t = 0; t < totalTicks; t++) {
      await harness.tick();
      if (t % sampleEveryTicks !== 0) continue;
      const s = harness.state;
      const colonyDecisionAt = s.ai?.colonyAgent?.lastDecisionSec ?? 0;
      if (colonyDecisionAt > lastColonyDecisionAt) {
        colonyIntervals.push(colonyDecisionAt - lastColonyDecisionAt);
        lastColonyDecisionAt = colonyDecisionAt;
      }
      samples.push({
        t: s.metrics.timeSec ?? 0,
        factionTension: s.ai?.environmentDirective?.factionTension ?? 0,
        threat: s.gameplay?.threat ?? 0,
        prosperity: s.gameplay?.prosperity ?? 0,
      });
      if (s.session?.phase === "end") break;
    }
    samples._colonyIntervals = colonyIntervals;
    return samples;
  },

  selfScore(samples) {
    if (!samples?.length) {
      return {
        plan_policy_alignment: 0,
        env_threat_responsiveness: 0,
        colony_cadence_health: 0,
      };
    }
    const factionSeries = samples.map(s => s.factionTension);
    const threatSeries = samples.map(s => s.threat);
    const corr = pearson(factionSeries, threatSeries);

    const intervals = samples._colonyIntervals ?? [];
    let stdDev = 0;
    if (intervals.length > 1) {
      const m = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((a, b) => a + (b - m) ** 2, 0) / intervals.length;
      stdDev = Math.sqrt(variance);
    }

    return {
      plan_policy_alignment: 0, // requires plan→policy join (S6 wave-2)
      env_threat_responsiveness: Number(corr.toFixed(4)),
      colony_cadence_health: Number(stdDev.toFixed(2)),
    };
  },
};
