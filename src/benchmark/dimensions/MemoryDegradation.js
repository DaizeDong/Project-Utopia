// MemoryDegradation — long-horizon context decay dimension plugin (S6 / S7).
//
// Score families:
//   - anchored_fact_recall — fraction of seeded "anchor" events still
//                             present in strategic summaries
//   - behavioral_drift     — KL divergence between current policy directive
//                             and an early-run baseline directive (matched
//                             world summaries)
//   - performance_at_t    — task score (RAE composite) at sample time t
//
// Used by the long-horizon memory harness (S7); for short benchmarks
// reports zeros so the plugin can still be installed.

export const MemoryDegradationPlugin = {
  id: "memory_degradation",
  label: "Memory Degradation",
  scoreDimensions: ["anchored_fact_recall", "behavioral_drift", "performance_at_t"],

  async collectSamples(harness, opts = {}) {
    const durationSec = Number(opts.durationSec ?? 600);
    const samples = [];
    const totalTicks = Math.max(1, Math.round(durationSec / (1 / 30)));
    const sampleEveryTicks = Math.max(1, Math.round(30 / (1 / 30)));

    for (let t = 0; t < totalTicks; t++) {
      await harness.tick();
      if (t % sampleEveryTicks !== 0) continue;
      const s = harness.state;
      const memoryEntries = harness.memoryStore?.formatForPrompt?.() ?? "";
      samples.push({
        t: s.metrics.timeSec ?? 0,
        memoryLength: memoryEntries.length,
        strategicSummary: String(s.ai?.strategicPlan?.summary ?? ""),
        food: s.resources?.food ?? 0,
        workers: s.agents?.filter(a => a.type === "WORKER" && a.alive !== false).length ?? 0,
      });
      if (s.session?.phase === "end") break;
    }
    return samples;
  },

  selfScore(samples, ctx = {}) {
    if (!samples?.length) {
      return { anchored_fact_recall: 0, behavioral_drift: 0, performance_at_t: 0 };
    }
    // Anchored-fact recall — for v1 we don't seed anchors; report 0.
    const anchors = ctx.anchors ?? [];
    let recallHits = 0;
    if (anchors.length > 0) {
      for (const sample of samples) {
        for (const anchor of anchors) {
          if (sample.strategicSummary.includes(anchor)) recallHits++;
        }
      }
    }
    const recallScore = anchors.length > 0
      ? recallHits / (anchors.length * samples.length)
      : 0;

    // Behavioral drift placeholder — needs paired baseline run.
    return {
      anchored_fact_recall: Number(recallScore.toFixed(4)),
      behavioral_drift: 0,
      performance_at_t: samples[samples.length - 1].workers > 0 ? 1 : 0,
    };
  },
};
