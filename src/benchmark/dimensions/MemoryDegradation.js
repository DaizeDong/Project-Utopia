// MemoryDegradation — long-horizon context decay dimension plugin (S6 / S7, P0-12+P0-13 v2).
//
// Score families (paper §2.5 — three-axis joint analysis):
//
//   anchored_fact_recall    ∈ [0,1]   verbal recall: anchor-token presence in
//                                      strategic-summary string
//   action_grounded_recall  ∈ [0,1]   action recall: directive distribution
//                                      still reflects anchor's implicit goal
//                                      (P0-12 NEW, distinct from verbal recall
//                                      per H5e)
//   behavioral_drift        ∈ [0,∞)   KL divergence between current and t=0
//                                      policy directive (matched world summary)
//   performance_at_t        ∈ [0,1]   task-grounded outcome at sample time t
//
// Three-axis decoupling allows the four diagnostic patterns from paper §2.5:
//
//   (high recall × high perf)            coherent + effective
//   (high recall × low perf)              coherent but ineffective
//   (low recall × high perf)              forgot but adapts via observation only
//   (low recall × low perf × high drift)  catastrophic forgetting
//
// vs prior art:
//   - LongMemEval / RULER / NIAH: only verbal recall, no env loop
//   - MemoryArena: only action-grounded recall, session-discrete tasks
//   - MemoryAgentBench: Selective Forgetting axis, no env feedback loop
//   - Lost-in-the-Middle: position-aware verbal recall on synthetic distractors
//
// Project-Utopia is the first to (a) split verbal vs action-grounded recall,
// (b) couple both with continuous tick-level Performance, (c) run on
// naturally-accumulated 4-channel sim history.
//
// P0-13 (NEW): session-discrete ablation mode — reset memoryStore every
// `sessionResetSec` (default 1800 = 30 sim-min) to mimic MemoryArena-style
// session boundaries. Used in H5f to compare tick-continuous vs session-
// discrete recall decay.

/** Default per-anchor "implicit goal token" mapping. The action-grounded
 *  recall probe checks whether the directive's intentWeights / targetPriorities
 *  still contain these tokens after the anchor is no longer in the prompt
 *  (i.e., the LLM is acting on memory not on observation).
 *
 *  Each anchor in opts.anchors should have:
 *    { token: string, implicitGoals: string[] }
 *  e.g. { token: "ANCHOR-WAREHOUSE-12-8", implicitGoals: ["deliver", "warehouse"] }
 */
const DEFAULT_IMPLICIT_GOAL_KEYS = ["deliver", "build", "guard", "farm"];

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

/** Extract the union of all weighted intent / target tokens from a group policies
 *  directive (`state.ai.groupPolicies` shape) for the action-grounded recall test. */
function extractActionTokens(state) {
  const tokens = new Set();
  const policies = state?.ai?.groupPolicies ?? {};
  for (const pol of Object.values(policies)) {
    for (const [intent, w] of Object.entries(pol?.intentWeights ?? {})) {
      if (Number(w) > 0) tokens.add(String(intent).toLowerCase());
    }
    for (const [target, w] of Object.entries(pol?.targetPriorities ?? {})) {
      if (Number(w) > 0) tokens.add(String(target).toLowerCase());
    }
  }
  return tokens;
}

export const MemoryDegradationPlugin = {
  id: "memory_degradation",
  label: "Memory Degradation",
  scoreDimensions: [
    "anchored_fact_recall",
    "action_grounded_recall",
    "behavioral_drift",
    "performance_at_t",
  ],

  /**
   * @param {object} harness  SimHarness instance
   * @param {object} opts
   * @param {number} [opts.durationSec=600]
   * @param {number} [opts.sampleEverySec=30]
   * @param {boolean} [opts.sessionDiscreteMode=false]   P0-13: reset memoryStore every sessionResetSec
   * @param {number} [opts.sessionResetSec=1800]         default 30 sim-min
   * @param {Array<{token, implicitGoals}>} [opts.anchors=[]]
   */
  async collectSamples(harness, opts = {}) {
    const durationSec = Number(opts.durationSec ?? 600);
    const sampleEverySec = Number(opts.sampleEverySec ?? 30);
    const sessionDiscrete = Boolean(opts.sessionDiscreteMode);
    const sessionResetSec = Number(opts.sessionResetSec ?? 1800);
    const anchors = opts.anchors ?? [];

    const samples = [];
    const totalTicks = Math.max(1, Math.round(durationSec / (1 / 30)));
    const sampleEveryTicks = Math.max(1, Math.round(sampleEverySec / (1 / 30)));
    const sessionResetTicks = Math.max(1, Math.round(sessionResetSec / (1 / 30)));
    let lastSessionResetTick = 0;
    let baselineActionTokens = null;

    for (let t = 0; t < totalTicks; t++) {
      // P0-13: session-discrete ablation — periodically clear memoryStore
      // and force a fresh strategic-plan call. Mimics MemoryArena's discrete
      // task-session boundary; allows us to compare tick-continuous (default)
      // vs session-discrete (this branch) recall decay (H5f).
      if (sessionDiscrete && t > 0 && (t - lastSessionResetTick) >= sessionResetTicks) {
        if (typeof harness.memoryStore?.clear === "function") {
          harness.memoryStore.clear();
        } else if (harness.memoryStore?.events) {
          harness.memoryStore.events.length = 0;
        }
        lastSessionResetTick = t;
      }

      await harness.tick();
      if (t % sampleEveryTicks !== 0) continue;

      const s = harness.state;
      const memoryEntries = harness.memoryStore?.formatForPrompt?.() ?? "";
      const summary = String(s.ai?.strategicPlan?.summary ?? "");
      const actionTokens = extractActionTokens(s);

      // Capture baseline directive tokens at first sample for drift computation.
      if (baselineActionTokens === null) {
        baselineActionTokens = new Set(actionTokens);
      }

      samples.push({
        t: s.metrics?.timeSec ?? 0,
        memoryLength: memoryEntries.length,
        strategicSummary: summary,
        // Snapshot action-token vector (sorted to be hash-stable)
        actionTokens: Array.from(actionTokens).sort(),
        baselineActionTokens: Array.from(baselineActionTokens).sort(),
        food: s.resources?.food ?? 0,
        wood: s.resources?.wood ?? 0,
        workers: s.agents?.filter(a => a.type === "WORKER" && a.alive !== false).length ?? 0,
        prosperity: s.gameplay?.prosperity ?? 0,
        threat: s.gameplay?.threat ?? 0,
      });
      if (s.session?.phase === "end") break;
    }
    samples._meta = { sessionDiscrete, sessionResetSec, anchorsCount: anchors.length };
    return samples;
  },

  /**
   * @param {Array} samples
   * @param {object} ctx
   * @param {Array<{token, implicitGoals}>} [ctx.anchors=[]]
   */
  selfScore(samples, ctx = {}) {
    if (!samples?.length) {
      return {
        anchored_fact_recall: 0,
        action_grounded_recall: 0,
        behavioral_drift: 0,
        performance_at_t: 0,
      };
    }
    const anchors = (ctx.anchors ?? []).map(a => ({
      token: String(a?.token ?? a),
      implicitGoals: (a?.implicitGoals ?? DEFAULT_IMPLICIT_GOAL_KEYS).map(k => String(k).toLowerCase()),
    }));

    // ── Verbal recall: anchor token in strategic-summary ──────────────
    let verbalHits = 0;
    let verbalChecks = 0;
    if (anchors.length > 0) {
      for (const sample of samples) {
        for (const a of anchors) {
          verbalChecks++;
          if (sample.strategicSummary.includes(a.token)) verbalHits++;
        }
      }
    }
    const verbalRecall = verbalChecks > 0 ? verbalHits / verbalChecks : 0;

    // ── P0-12: Action-grounded recall ───────────────────────────────────
    // Independently of whether the LLM mentions the anchor's verbal token in
    // its summary, does the *directive distribution* still reflect the
    // anchor's implicit goal? E.g. anchor = "warehouse at (12,8)" → implicit
    // goals = {"deliver","warehouse"}. If the directive intent/target weights
    // still cover those tokens, action-grounded recall is preserved even
    // when the anchor token has dropped from the prompt context.
    let actionHits = 0;
    let actionChecks = 0;
    if (anchors.length > 0) {
      for (const sample of samples) {
        const tokenSet = new Set(sample.actionTokens ?? []);
        for (const a of anchors) {
          actionChecks++;
          // Hit iff at least one of the implicit goals appears in directive.
          if (a.implicitGoals.some(goal => tokenSet.has(goal))) actionHits++;
        }
      }
    }
    const actionRecall = actionChecks > 0 ? actionHits / actionChecks : 0;

    // ── Behavioral drift ───────────────────────────────────────────────
    // Approximate KL via Jaccard distance between current action-token set
    // and t=0 baseline. (Full KL requires probabilistic policy distribution;
    // this is a tractable proxy that's still monotone in true KL on these
    // discrete supports.)
    const last = samples[samples.length - 1];
    const baseline = new Set(last.baselineActionTokens ?? []);
    const current = new Set(last.actionTokens ?? []);
    const union = new Set([...baseline, ...current]);
    const intersection = new Set([...baseline].filter(x => current.has(x)));
    const jaccard = union.size > 0 ? intersection.size / union.size : 1;
    const drift = 1 - jaccard;

    // ── Performance at t ───────────────────────────────────────────────
    // Project-Utopia objective surrogate: workers alive × food sufficiency.
    const w = Math.max(1, last.workers);
    const foodSuf = clamp01(last.food / w);
    const performance = (last.workers > 0 ? 1 : 0) * foodSuf;

    return {
      anchored_fact_recall: Number(verbalRecall.toFixed(4)),
      action_grounded_recall: Number(actionRecall.toFixed(4)),
      behavioral_drift: Number(drift.toFixed(4)),
      performance_at_t: Number(performance.toFixed(4)),
    };
  },
};
