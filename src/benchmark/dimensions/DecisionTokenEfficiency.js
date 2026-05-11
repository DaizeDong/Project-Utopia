// DecisionTokenEfficiency — DTE dimension plugin (S6).
//
// Score families (all unbounded — consumers normalize before bayesianScore):
//   - dte_per_completion_token ∈ ℝ      higher is better (more task progress per token)
//   - dte_per_decision         ∈ ℝ      higher is better (more task progress per LLM call)
//   - first_token_latency_p50  ∈ [0,∞)  ms; lower is better
//
// IMPORTANT: until S5 wave-2 wires AgentAdapter implementations to populate
// state.metrics.aiRuntime.{prompt,completion,cached}Tokens + firstTokenLatencyMs,
// these fields are zero in fallback mode and DTE returns 0 across the board.
// Plugin runs successfully (no NaN) but downstream comparisons are vacuous;
// a `bench:long` with `aiEnabled=true` is required for meaningful values.

export const DecisionTokenEfficiencyPlugin = {
  id: "dte",
  label: "Decision Token Efficiency",
  scoreDimensions: ["dte_per_completion_token", "dte_per_decision", "first_token_latency_p50"],

  async collectSamples(harness, opts = {}) {
    const durationSec = Number(opts.durationSec ?? 600);
    const samples = [];
    const totalTicks = Math.max(1, Math.round(durationSec / (1 / 30)));
    const sampleEveryTicks = Math.max(1, Math.round(10 / (1 / 30)));

    for (let t = 0; t < totalTicks; t++) {
      await harness.tick();
      if (t % sampleEveryTicks !== 0) continue;
      const s = harness.state;
      const ai = s.metrics?.aiRuntime ?? {};
      samples.push({
        t: s.metrics.timeSec ?? 0,
        promptTokens: ai.promptTokens ?? 0,
        completionTokens: ai.completionTokens ?? 0,
        firstTokenLatencyMs: ai.firstTokenLatencyMs ?? 0,
        responseCount: ai.responseCount ?? 0,
        food: s.resources?.food ?? 0,
        workers: s.agents?.filter(a => a.type === "WORKER" && a.alive !== false).length ?? 0,
      });
      if (s.session?.phase === "end") break;
    }
    return samples;
  },

  selfScore(samples) {
    if (samples.length < 2) {
      return { dte_per_completion_token: 0, dte_per_decision: 0, first_token_latency_p50: 0 };
    }
    const first = samples[0];
    const last = samples[samples.length - 1];

    const taskScoreFirst = (first.workers > 0 ? 1 : 0) * Math.log1p(first.food);
    const taskScoreLast = (last.workers > 0 ? 1 : 0) * Math.log1p(last.food);
    const deltaScore = taskScoreLast - taskScoreFirst;

    const tokens = Math.max(1, last.completionTokens - first.completionTokens);
    const decisions = Math.max(1, last.responseCount - first.responseCount);

    const ftls = samples
      .map(s => s.firstTokenLatencyMs)
      .filter(v => v > 0)
      .sort((a, b) => a - b);
    const p50 = ftls.length > 0 ? ftls[Math.floor(ftls.length / 2)] : 0;

    return {
      dte_per_completion_token: Number((deltaScore / tokens).toFixed(6)),
      dte_per_decision: Number((deltaScore / decisions).toFixed(4)),
      first_token_latency_p50: Number(p50.toFixed(2)),
    };
  },
};
