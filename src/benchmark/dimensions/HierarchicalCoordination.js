// HierarchicalCoordination — cross-channel agreement dimension plugin (S6).
//
// Score families (mixed scales — DO NOT pipe directly into bayesianScore):
//   - plan_policy_alignment    ∈ [0,1]  higher is better; fraction of strategic-
//                                       plan tokens (priority / resourceFocus /
//                                       workerFocus / phase / defensePosture)
//                                       that appear with positive weight in the
//                                       workers group's directive (intentWeights ∪
//                                       targetPriorities ∪ focus). Wired W3.
//                                       Tracks whether the strategic-plan channel
//                                       and the npc-policy channel agree on
//                                       which axes to prioritize.
//   - env_threat_responsiveness ∈ [-1,1] higher is better; Pearson corr of
//                                        factionTension vs threat
//   - colony_cadence_health     ∈ [0,∞) std-dev of decision intervals (sec);
//                                        lower is better; needs scenario-relative
//                                        normalization before bayesianScore
//
// Tests whether the 4 LLM channels behave coherently.

/** Map strategic-plan field values to the directive-token vocabulary used by
 *  Guardrails default group policies (intent / target keys, lowercase). The
 *  match is one-direction: each plan field contributes a token; alignment is
 *  the fraction of plan tokens that show up in the workers directive. */
function planTokens(strategy) {
  if (!strategy || typeof strategy !== "object") return [];
  const tokens = [];
  // resourceFocus directly maps to canonical intent / target keys.
  const rf = String(strategy.resourceFocus ?? "").toLowerCase();
  if (rf === "food") tokens.push("farm");
  else if (rf === "wood") tokens.push("wood", "lumber");
  else if (rf === "stone") tokens.push("quarry", "stone");
  // workerFocus is already in the intent vocabulary.
  const wf = String(strategy.workerFocus ?? "").toLowerCase();
  if (wf && wf !== "balanced") tokens.push(wf);
  // priority maps to high-level objective: "defend"→safety, "survive"→eat/safety
  // "complete_objective"→deliver. "grow" has no direct directive token.
  const pri = String(strategy.priority ?? "").toLowerCase();
  if (pri === "defend") tokens.push("safety");
  else if (pri === "survive") tokens.push("eat", "safety");
  else if (pri === "complete_objective") tokens.push("deliver");
  // phase: industrialize→quarry/smith, process→cook, fortify→safety, optimize→deliver
  const phase = String(strategy.phase ?? "").toLowerCase();
  if (phase === "industrialize") tokens.push("quarry", "smith");
  else if (phase === "process") tokens.push("cook");
  else if (phase === "fortify") tokens.push("safety");
  else if (phase === "optimize") tokens.push("deliver");
  // defensePosture: aggressive/defensive both raise safety as a directive token.
  const dp = String(strategy.defensePosture ?? "").toLowerCase();
  if (dp === "defensive" || dp === "aggressive") tokens.push("safety");
  // Dedup, keep order.
  return Array.from(new Set(tokens.filter(Boolean)));
}

/** Extract the directive token set with positive weight for a single group's
 *  policy entry (`{ intentWeights, targetPriorities, focus, … }`). */
function directiveTokenSet(policy) {
  const out = new Set();
  if (!policy || typeof policy !== "object") return out;
  for (const [k, w] of Object.entries(policy.intentWeights ?? {})) {
    if (Number(w) > 0) out.add(String(k).toLowerCase());
  }
  for (const [k, w] of Object.entries(policy.targetPriorities ?? {})) {
    if (Number(w) > 0) out.add(String(k).toLowerCase());
  }
  // focus is a free-text field, but tokens like "depot"/"tools" still register
  // when split on whitespace.
  for (const tok of String(policy.focus ?? "").toLowerCase().split(/\s+/)) {
    if (tok) out.add(tok);
  }
  return out;
}

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

      // Snapshot strategy + workers directive for plan_policy_alignment.
      const strategy = s.ai?.strategy ?? null;
      const policiesRaw = s.ai?.groupPolicies;
      let workerPolicy = null;
      if (policiesRaw instanceof Map) {
        const wrap = policiesRaw.get("workers");
        workerPolicy = wrap?.data ?? wrap ?? null;
      } else if (policiesRaw && typeof policiesRaw === "object") {
        const wrap = policiesRaw.workers;
        workerPolicy = wrap?.data ?? wrap ?? null;
      }

      samples.push({
        t: s.metrics.timeSec ?? 0,
        factionTension: s.ai?.environmentDirective?.factionTension ?? 0,
        threat: s.gameplay?.threat ?? 0,
        prosperity: s.gameplay?.prosperity ?? 0,
        // Snapshot for plan_policy_alignment — only the keys the alignment
        // computation reads; cheap and JSON-stable.
        strategySnapshot: strategy ? {
          priority: strategy.priority,
          resourceFocus: strategy.resourceFocus,
          workerFocus: strategy.workerFocus,
          phase: strategy.phase,
          defensePosture: strategy.defensePosture,
        } : null,
        workerPolicySnapshot: workerPolicy ? {
          intentWeights: { ...(workerPolicy.intentWeights ?? {}) },
          targetPriorities: { ...(workerPolicy.targetPriorities ?? {}) },
          focus: workerPolicy.focus ?? "",
        } : null,
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

    // ── plan_policy_alignment: per-sample fraction of plan tokens that
    // appear with positive weight in the workers directive. We average
    // across samples that have BOTH a strategy snapshot and a workers
    // directive (skipping samples where either is null — early ticks
    // before either channel has fired). If no sample has both, alignment
    // is 0 (= no observed agreement, never NaN).
    let alignSum = 0, alignCount = 0;
    for (const s of samples) {
      const strategy = s.strategySnapshot;
      const policy = s.workerPolicySnapshot;
      if (!strategy || !policy) continue;
      const tokens = planTokens(strategy);
      if (tokens.length === 0) continue; // strategy provides no testable tokens
      const directiveTokens = directiveTokenSet(policy);
      let hits = 0;
      for (const tok of tokens) if (directiveTokens.has(tok)) hits++;
      alignSum += hits / tokens.length;
      alignCount++;
    }
    const alignment = alignCount > 0 ? alignSum / alignCount : 0;

    return {
      plan_policy_alignment: Number(alignment.toFixed(4)),
      env_threat_responsiveness: Number(corr.toFixed(4)),
      colony_cadence_health: Number(stdDev.toFixed(2)),
    };
  },
};
