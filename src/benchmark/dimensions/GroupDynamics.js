// GroupDynamics — emergent group-level dynamics dimension plugin (S6).
//
// Score families:
//   - intent_entropy          — H(W_g) per group from intentWeights, mean across groups
//   - coalition_coupling      — cross-group correlation of targetPriorities
//   - state_target_obedience  — fraction of NPCs whose realized FSM state
//                                matches LLM stateTargets within ttlSec
//   - faction_responsiveness  — cross-corr(factionTension, predator/saboteur incidents)

function entropy(weights) {
  const total = weights.reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0) return 0;
  let h = 0;
  for (const w of weights) {
    const p = Math.max(0, w) / total;
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
}

export const GroupDynamicsPlugin = {
  id: "group_dynamics",
  label: "Group Dynamics",
  scoreDimensions: [
    "intent_entropy",
    "coalition_coupling",
    "state_target_obedience",
    "faction_responsiveness",
  ],

  async collectSamples(harness, opts = {}) {
    const durationSec = Number(opts.durationSec ?? 600);
    const samples = [];
    const totalTicks = Math.max(1, Math.round(durationSec / (1 / 30)));
    const sampleEveryTicks = Math.max(1, Math.round(5 / (1 / 30)));

    for (let t = 0; t < totalTicks; t++) {
      await harness.tick();
      if (t % sampleEveryTicks !== 0) continue;
      const s = harness.state;
      const policies = s.ai?.groupPolicies ?? {};
      const env = s.ai?.environmentDirective ?? {};
      samples.push({
        t: s.metrics.timeSec ?? 0,
        groupPolicies: Object.entries(policies).map(([gid, pol]) => ({
          groupId: gid,
          intentWeights: { ...(pol?.intentWeights ?? {}) },
          targetPriorities: { ...(pol?.targetPriorities ?? {}) },
        })),
        factionTension: env?.factionTension ?? 0,
        threat: s.gameplay?.threat ?? 0,
      });
      if (s.session?.phase === "end") break;
    }
    return samples;
  },

  selfScore(samples) {
    if (!samples?.length) {
      return {
        intent_entropy: 0,
        coalition_coupling: 0,
        state_target_obedience: 0,
        faction_responsiveness: 0,
      };
    }
    let entSum = 0, entCount = 0;
    for (const s of samples) {
      for (const g of s.groupPolicies ?? []) {
        const weights = Object.values(g.intentWeights ?? {});
        if (weights.length > 0) {
          entSum += entropy(weights);
          entCount++;
        }
      }
    }
    const meanEntropy = entCount > 0 ? entSum / entCount : 0;

    return {
      intent_entropy: Number(meanEntropy.toFixed(4)),
      // Pearson correlation across groups — placeholder until S6 wave-2.
      coalition_coupling: 0,
      // Requires per-NPC fsm.state vs ai.stateTargets join — placeholder.
      state_target_obedience: 0,
      // Cross-correlation against predator-hit events — placeholder.
      faction_responsiveness: 0,
    };
  },
};
