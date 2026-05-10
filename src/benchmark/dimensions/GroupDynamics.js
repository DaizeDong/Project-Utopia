// GroupDynamics — emergent group-level dynamics dimension plugin (S6).
//
// Score families:
//   - intent_entropy          — H(W_g) per group from intentWeights, mean across groups
//   - coalition_coupling      — cross-group Pearson correlation of targetPriorities
//                                weight vectors (mean across all unordered group pairs);
//                                wired W3 — paper §4.1 GroupDynamics N=4.
//   - state_target_obedience  — fraction of NPCs whose realized fsm.state matches
//                                their group's `state.ai.groupStateTargets` entry;
//                                wired W3 from per-sample agent fsm snapshots.
//   - faction_responsiveness  — Pearson correlation between sample-time
//                                `factionTension` and active hostile-group agent
//                                count (predators + saboteurs); wired W3.
//                                Differs from `env_threat_responsiveness`
//                                (factionTension vs threat) — this couples
//                                tension to the *count* of active aggressor NPCs.

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

/** Pearson correlation over two arrays of equal length; returns 0 on degeneracy. */
function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return 0;
  return num / Math.sqrt(dx2 * dy2);
}

/** Mean Pearson coupling of targetPriorities across all unordered group pairs.
 *  For each pair we form the union of priority keys and align both weight
 *  vectors against it (zero-fill missing). Pairs with degenerate (constant)
 *  vectors contribute 0. Returns mean across pairs in [-1, 1]. */
function groupCouplingMean(groupPolicies) {
  const groups = (groupPolicies ?? []).filter(g => g && g.targetPriorities);
  if (groups.length < 2) return 0;
  let sum = 0, count = 0;
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const aPri = groups[i].targetPriorities ?? {};
      const bPri = groups[j].targetPriorities ?? {};
      const keys = new Set([...Object.keys(aPri), ...Object.keys(bPri)]);
      if (keys.size < 2) continue;
      const xs = []; const ys = [];
      for (const k of keys) {
        xs.push(Number(aPri[k] ?? 0));
        ys.push(Number(bPri[k] ?? 0));
      }
      const r = pearson(xs, ys);
      if (Number.isFinite(r)) { sum += r; count++; }
    }
  }
  return count > 0 ? sum / count : 0;
}

const HOSTILE_GROUPS = new Set(["predators", "saboteurs"]);

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
      // groupPolicies may be Map (live runtime) or plain object (older fixtures).
      const policiesRaw = s.ai?.groupPolicies;
      const policyEntries = policiesRaw instanceof Map
        ? Array.from(policiesRaw.entries())
        : Object.entries(policiesRaw ?? {});
      const groupPolicies = policyEntries.map(([gid, wrap]) => {
        const pol = wrap?.data ?? wrap;
        return {
          groupId: String(gid),
          intentWeights: { ...(pol?.intentWeights ?? {}) },
          targetPriorities: { ...(pol?.targetPriorities ?? {}) },
        };
      });
      const env = s.ai?.environmentDirective ?? {};

      // Group-state targets (live: Map<groupId, {targetState,…}>) — capture as
      // plain object so samples are JSON-serializable.
      const targetsRaw = s.ai?.groupStateTargets;
      const groupStateTargets = {};
      if (targetsRaw instanceof Map) {
        for (const [gid, entry] of targetsRaw.entries()) {
          groupStateTargets[String(gid)] = String(entry?.targetState ?? "");
        }
      } else if (targetsRaw && typeof targetsRaw === "object") {
        for (const [gid, entry] of Object.entries(targetsRaw)) {
          groupStateTargets[String(gid)] = String(entry?.targetState ?? "");
        }
      }

      // Per-NPC fsm.state snapshot — collect counts per (groupId, fsmState)
      // for state_target_obedience scoring without storing every entity.
      const fsmCounts = {}; // { [groupId]: { [fsmState]: count } }
      let hostileCount = 0;
      for (const a of s.agents ?? []) {
        if (a?.alive === false) continue;
        const gid = String(a.groupId ?? "");
        if (!gid) continue;
        if (HOSTILE_GROUPS.has(gid)) hostileCount++;
        const fsmState = String(a.fsm?.state ?? "");
        if (!fsmState) continue;
        fsmCounts[gid] ??= {};
        fsmCounts[gid][fsmState] = (fsmCounts[gid][fsmState] ?? 0) + 1;
      }

      samples.push({
        t: s.metrics.timeSec ?? 0,
        groupPolicies,
        groupStateTargets,
        fsmCounts,
        hostileCount,
        factionTension: Number(env?.factionTension ?? 0),
        threat: Number(s.gameplay?.threat ?? 0),
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
    let couplingSum = 0, couplingCount = 0;
    let obeyHits = 0, obeyChecks = 0;
    const tensionSeries = [];
    const hostileSeries = [];

    for (const s of samples) {
      for (const g of s.groupPolicies ?? []) {
        const weights = Object.values(g.intentWeights ?? {});
        if (weights.length > 0) {
          entSum += entropy(weights);
          entCount++;
        }
      }

      // ── Coalition coupling: mean Pearson over targetPriorities pairs.
      const r = groupCouplingMean(s.groupPolicies ?? []);
      if (Number.isFinite(r)) {
        couplingSum += r;
        couplingCount++;
      }

      // ── State-target obedience: realized fsm.state vs declared targetState.
      // Per-sample numerator = NPCs in target state; denominator = NPCs in
      // any group that has a targetState declared. Pooled across samples
      // so transient targets dominate fewer cycles.
      const targets = s.groupStateTargets ?? {};
      const fsmCounts = s.fsmCounts ?? {};
      for (const [gid, targetState] of Object.entries(targets)) {
        if (!targetState) continue;
        const counts = fsmCounts[gid] ?? {};
        let groupTotal = 0;
        for (const c of Object.values(counts)) groupTotal += Number(c) || 0;
        if (groupTotal === 0) continue;
        obeyChecks += groupTotal;
        obeyHits += Number(counts[targetState] ?? 0);
      }

      tensionSeries.push(Number(s.factionTension) || 0);
      hostileSeries.push(Number(s.hostileCount) || 0);
    }
    const meanEntropy = entCount > 0 ? entSum / entCount : 0;
    const meanCoupling = couplingCount > 0 ? couplingSum / couplingCount : 0;
    const obedience = obeyChecks > 0 ? obeyHits / obeyChecks : 0;
    const factionResp = pearson(tensionSeries, hostileSeries);

    return {
      intent_entropy: Number(meanEntropy.toFixed(4)),
      coalition_coupling: Number(meanCoupling.toFixed(4)),
      state_target_obedience: Number(obedience.toFixed(4)),
      faction_responsiveness: Number(factionResp.toFixed(4)),
    };
  },
};
