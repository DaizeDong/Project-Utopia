/**
 * NPC-Brain LLM Round-2 Analytics
 *
 * Round 1 prompted the LLM with raw raid counts and asked it to produce full
 * policy bags from scratch. That worked in S1 (scripted-raid scenario where
 * raid pressure dominates) but lost in S2/S3 because the LLM was effectively
 * hallucinating whole policies rather than making targeted adjustments.
 *
 * Round 2 changes the contract: we surface to the LLM
 *   1. **Group analytics** — per-group state (idle, active, under-hit, spread).
 *   2. **Threat sector map** — coarse 4×4 grid of predator density so the LLM
 *      can bias workers / herbivores away from the hot sector.
 *   3. **Recommended baseline** — the rule-based fallback policy as a starting
 *      hint so the LLM only deviates with reason.
 *   4. **Scored delta menu** — pre-computed per-scenario adjustments
 *      (e.g. "intentWeights.farm -= 0.3, expectedEffect: less-exposure")
 *      ranked by expected risk reduction. The LLM can pick deltas by ID and
 *      the post-validator checks that any deviation from baseline either
 *      matches a delta in the menu or is justified by an explicit `_reason`.
 *
 * All functions are pure: they read `state` and produce JSON-serialisable
 * outputs. They do NOT mutate state. The output is consumed by
 * NPCBrainSystem.attachCombatContextToSummary (R2 hook) so it flows through
 * the prompt JSON without modifying ai-proxy or LLMClient.
 */

import { DEFAULT_GROUP_POLICIES, GROUP_IDS } from "../../../config/aiConfig.js";
import { buildPolicyFallback } from "../llm/PromptBuilder.js";

// 4×4 sectors — small enough that the LLM can reason about NE/SW etc. without
// drowning in numbers, large enough that a single predator does not dominate.
const SECTOR_ROWS = 4;
const SECTOR_COLS = 4;

const SECTOR_LABELS = (() => {
  const out = [];
  const rowNames = ["N", "NM", "SM", "S"];
  const colNames = ["W", "MW", "ME", "E"];
  for (let r = 0; r < SECTOR_ROWS; r += 1) {
    for (let c = 0; c < SECTOR_COLS; c += 1) {
      out.push(`${rowNames[r]}${colNames[c]}`);
    }
  }
  return out;
})();

function safeNumber(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function meanAndStdDev(samples) {
  if (samples.length === 0) return { mean: 0, std: 0 };
  let sum = 0;
  for (const v of samples) sum += v;
  const mean = sum / samples.length;
  let varSum = 0;
  for (const v of samples) varSum += (v - mean) * (v - mean);
  const std = Math.sqrt(varSum / samples.length);
  return { mean, std };
}

/**
 * Sector index for a tile coordinate (x, z) on a grid of (width, height).
 */
function sectorIndex(x, z, width, height) {
  const col = Math.max(0, Math.min(SECTOR_COLS - 1, Math.floor((x / Math.max(1, width)) * SECTOR_COLS)));
  const row = Math.max(0, Math.min(SECTOR_ROWS - 1, Math.floor((z / Math.max(1, height)) * SECTOR_ROWS)));
  return row * SECTOR_COLS + col;
}

/**
 * Per-group analytics: idle/active/underHit counts, spread (stddev from
 * centroid), nearby-threat count. Pure read of state.agents / state.animals.
 *
 * @returns {Record<string, object>}  groupId → analytics block
 */
export function computeGroupAnalytics(state) {
  const out = {};
  const grid = state?.grid ?? state?.world?.grid ?? null;
  const width = safeNumber(grid?.width, 96);
  const height = safeNumber(grid?.height, 72);

  // Bucket entities by groupId. Workers + animals + visitors all flow here.
  const buckets = new Map();
  for (const a of state?.agents ?? []) {
    if (!a || a.alive === false) continue;
    const gid = String(a.groupId ?? "");
    if (!buckets.has(gid)) buckets.set(gid, { agents: [], animals: [] });
    buckets.get(gid).agents.push(a);
  }
  for (const a of state?.animals ?? []) {
    if (!a || a.alive === false) continue;
    const gid = String(a.groupId ?? "");
    if (!buckets.has(gid)) buckets.set(gid, { agents: [], animals: [] });
    buckets.get(gid).animals.push(a);
  }

  // Threat positions for proximity counting.
  const threats = [];
  for (const a of state?.animals ?? []) {
    if (!a || a.alive === false) continue;
    if (a.kind === "predator" || a.kind === 1 || String(a.species ?? "").startsWith("raider")) {
      threats.push({ x: safeNumber(a.x, width / 2), z: safeNumber(a.z, height / 2) });
    }
  }

  for (const [gid, { agents, animals }] of buckets.entries()) {
    const members = [...agents, ...animals];
    let idleCount = 0;
    let activeCount = 0;
    let underHit = 0;
    let threatedCount = 0;
    let avgHunger = 0;
    let hungerSamples = 0;
    const xs = [];
    const zs = [];
    for (const m of members) {
      const x = safeNumber(m.x, width / 2);
      const z = safeNumber(m.z, height / 2);
      xs.push(x);
      zs.push(z);
      const fsm = m.blackboard?.fsm?.state ?? m.stateLabel ?? "idle";
      const isIdle = fsm === "idle" || fsm === "wander" || fsm === "rest" || fsm === "roam";
      if (isIdle) idleCount += 1;
      else activeCount += 1;
      const recent = m.memory?.recentEvents ?? [];
      if (recent.length > 0 && recent.slice(0, 8).includes("predator-hit")) underHit += 1;
      const h = m.hunger;
      if (typeof h === "number") {
        avgHunger += h;
        hungerSamples += 1;
      }
      // Proximity threat count (within ~10 tiles).
      let nearThreat = false;
      for (const t of threats) {
        const dx = t.x - x;
        const dz = t.z - z;
        if (dx * dx + dz * dz <= 100) {
          nearThreat = true;
          break;
        }
      }
      if (nearThreat) threatedCount += 1;
    }
    const cx = meanAndStdDev(xs);
    const cz = meanAndStdDev(zs);
    // Distance-from-centroid stddev: how spread-out the group is. High value
    // = workers scattered (vulnerable in raid); low value = clustered.
    const dists = [];
    for (let i = 0; i < xs.length; i += 1) {
      const dx = xs[i] - cx.mean;
      const dz = zs[i] - cz.mean;
      dists.push(Math.sqrt(dx * dx + dz * dz));
    }
    const distStats = meanAndStdDev(dists);

    out[gid] = {
      groupId: gid,
      memberCount: members.length,
      idleCount,
      activeCount,
      underHit,
      threatedCount,
      avgHunger: hungerSamples > 0 ? Number((avgHunger / hungerSamples).toFixed(3)) : null,
      centroid: { x: Number(cx.mean.toFixed(2)), z: Number(cz.mean.toFixed(2)) },
      distFromCentroidMean: Number(distStats.mean.toFixed(2)),
      distFromCentroidStdDev: Number(distStats.std.toFixed(2)),
    };
  }

  return out;
}

/**
 * Threat sector map — coarse 4×4 grid of predator density. The LLM can read
 * this to bias workers/herbivores away from the densest sector and steer
 * predators (in their own policy) toward isolated wildlife.
 */
export function computeThreatZoneMap(state) {
  const grid = state?.grid ?? state?.world?.grid ?? null;
  const width = safeNumber(grid?.width, 96);
  const height = safeNumber(grid?.height, 72);
  const counts = new Array(SECTOR_ROWS * SECTOR_COLS).fill(0);
  const raiderCounts = new Array(SECTOR_ROWS * SECTOR_COLS).fill(0);
  let totalThreats = 0;
  for (const a of state?.animals ?? []) {
    if (!a || a.alive === false) continue;
    const isPredator = a.kind === "predator" || a.kind === 1;
    const isRaider = String(a.species ?? "") === "raider_beast";
    if (!isPredator && !isRaider) continue;
    const idx = sectorIndex(safeNumber(a.x, 0), safeNumber(a.z, 0), width, height);
    counts[idx] += 1;
    if (isRaider) raiderCounts[idx] += 1;
    totalThreats += 1;
  }
  const sectors = counts.map((count, idx) => ({
    id: SECTOR_LABELS[idx],
    threatCount: count,
    raiderCount: raiderCounts[idx],
    density: Number((count / Math.max(1, totalThreats)).toFixed(3)),
  }));
  // Workers' centroid sector — so the LLM can recognize "raiders are in the
  // same sector as workers" vs "raiders are 2 sectors away".
  let workerCentroidSector = null;
  let cx = 0;
  let cz = 0;
  let n = 0;
  for (const w of state?.agents ?? []) {
    if (!w || w.alive === false || w.type !== "WORKER") continue;
    cx += safeNumber(w.x, 0);
    cz += safeNumber(w.z, 0);
    n += 1;
  }
  if (n > 0) {
    workerCentroidSector = SECTOR_LABELS[sectorIndex(cx / n, cz / n, width, height)];
  }
  // Hot sector — by far the densest one (or null if essentially uniform).
  const sortedSectors = [...sectors].sort((a, b) => b.threatCount - a.threatCount);
  const hotSector = sortedSectors[0] && sortedSectors[0].threatCount > 0 ? sortedSectors[0] : null;
  return {
    rows: SECTOR_ROWS,
    cols: SECTOR_COLS,
    totalThreats,
    workerCentroidSector,
    hotSectorId: hotSector?.id ?? null,
    sectors,
  };
}

/**
 * Pre-computed scored delta menu. Each delta is a `{id, target, op, value,
 * expectedEffect, score}` tuple. Score is heuristic-derived from current
 * combat pressure.
 *
 * Naming: deltas are namespaced by groupId so the LLM picks
 * `workers.farm-down` rather than ambiguous "farm-down".
 */
export function computeDeltaMenu(state, combat = null) {
  const c = combat ?? {};
  const activeRaiders = safeNumber(c.activeRaiders, 0);
  const activePredators = safeNumber(c.activePredators, activeRaiders);
  const guardDeficit = safeNumber(c.guardDeficit, 0);
  const workersUnderHit = safeNumber(c.workersUnderHit, 0);
  const nearestTiles = safeNumber(c.nearestThreatTiles, -1);
  const proximate = nearestTiles >= 0 && nearestTiles <= 12;
  const imminent = (activeRaiders > 0 || activePredators >= 2) && (proximate || guardDeficit > 0 || workersUnderHit > 0);
  const distantRaid = (activeRaiders > 0 || activePredators >= 2) && !imminent;

  // Score = expected per-tick predation-risk reduction (0-10 heuristic). The
  // LLM uses this to triage which deltas to apply — high-score deltas should
  // dominate the chosen set when raid pressure is high. Round-2 iteration-2
  // tuning: in DISTANT raid, ALL retreat deltas get score ≤ 2 so the LLM
  // does not over-rotate the colony into starvation. Throughput-preserving
  // deltas (deliver-up, predators.farm-down, herbivores.flee-up) keep
  // higher scores even at distance.
  const menu = [];
  const push = (id, groupId, target, op, value, expectedEffect, score) => {
    menu.push({ id, groupId, target, op, value: Number(value.toFixed(3)), expectedEffect, score: Number(score.toFixed(2)) });
  };

  // ── workers — RETREAT deltas (gated on imminent only) ──
  // Round-2 iteration-3: when threat is DISTANT the retreat menu is OMITTED
  // entirely. Empirical lesson from S2 (temperate_plains, persistent ≥20-tile
  // raid): the LLM picks any retreat delta we offer and starves the colony.
  // Distant raid → menu only contains throughput-preserving deltas.
  if (imminent) {
    push(
      "workers.farm-down",
      GROUP_IDS.WORKERS,
      "intentWeights.farm",
      "-=",
      0.6,
      "less farm-tile exposure during imminent raid",
      8.0,
    );
    push(
      "workers.wood-down",
      GROUP_IDS.WORKERS,
      "intentWeights.wood",
      "-=",
      0.6,
      "less forest-edge exposure",
      7.5,
    );
    push(
      "workers.eat-up",
      GROUP_IDS.WORKERS,
      "intentWeights.eat",
      "+=",
      workersUnderHit > 0 ? 0.6 : 0.3,
      "retreat-to-table cycle so hits convert to safety",
      workersUnderHit > 0 ? 7.0 : 4.0,
    );
    push(
      "workers.warehouse-up",
      GROUP_IDS.WORKERS,
      "targetPriorities.warehouse",
      "+=",
      0.25,
      "modest pull toward defended depot — DO NOT cluster all workers",
      4.5,
    );
    push(
      "workers.safety-up",
      GROUP_IDS.WORKERS,
      "targetPriorities.safety",
      "+=",
      0.4,
      "bias movement toward safety markers, keep workers spread",
      5.5,
    );
    push(
      "workers.frontier-down",
      GROUP_IDS.WORKERS,
      "targetPriorities.frontier",
      "-=",
      0.5,
      "abandon exposed frontier targets",
      6.0,
    );
    push(
      "workers.risk-down",
      GROUP_IDS.WORKERS,
      "riskTolerance",
      "set",
      0.18,
      "lower riskTolerance under imminent threat — covered routes only",
      6.0,
    );
  }

  // ── workers — THROUGHPUT-PRESERVING deltas (always available; do NOT
  // starve the colony) ──
  push(
    "workers.deliver-up",
    GROUP_IDS.WORKERS,
    "intentWeights.deliver",
    "+=",
    imminent ? 0.4 : 0.5,
    "drain cargo to depot — keeps warehouse full and defends supply",
    imminent ? 5.0 : distantRaid ? 4.0 : 1.5,
  );

  // ── predators (steer wolves/bears OFF the colony) ── always useful
  push(
    "predators.farm-down",
    GROUP_IDS.PREDATORS,
    "targetPriorities.farm",
    "-=",
    0.4,
    "wolves/bears stop piling onto farm tiles where guards are committed",
    imminent ? 5.0 : distantRaid ? 3.5 : 1.0,
  );
  push(
    "predators.herbivore-up",
    GROUP_IDS.PREDATORS,
    "targetPriorities.herbivore",
    "+=",
    0.3,
    "redirect predators to natural prey, away from workers",
    imminent ? 4.5 : distantRaid ? 3.5 : 1.5,
  );

  // ── herbivores ── always cheap to rotate
  push(
    "herbivores.flee-up",
    GROUP_IDS.HERBIVORES,
    "intentWeights.flee",
    "+=",
    0.5,
    "herds avoid being chased through farms",
    activePredators >= 2 ? 4.0 : 1.5,
  );
  push(
    "herbivores.graze-down",
    GROUP_IDS.HERBIVORES,
    "intentWeights.graze",
    "-=",
    0.3,
    "stop grazing into predator pack",
    activePredators >= 2 ? 3.0 : 1.0,
  );

  // ── traders (only if imminent — distant raid leaves trade lanes open) ──
  if (imminent) {
    push(
      "traders.warehouse-up",
      GROUP_IDS.TRADERS,
      "targetPriorities.warehouse",
      "+=",
      0.3,
      "traders fall back to defended depot during raid",
      4.0,
    );
    push(
      "traders.frontier-down",
      GROUP_IDS.TRADERS,
      "targetPriorities.frontier",
      "-=",
      0.4,
      "skip exposed frontier trade lanes",
      3.5,
    );
  }

  // Rank: highest expected risk reduction first. The LLM should generally
  // pick from the top of this list when raid pressure is high.
  menu.sort((a, b) => b.score - a.score);
  return menu;
}

/**
 * Recommended baseline = rule-based fallback policy bag. Surfaced to the LLM
 * as a hint so it knows the safe starting point and only deviates with reason.
 */
export function computeRecommendedBaseline(state, summary) {
  // Use the existing fallback builder so the baseline matches what the
  // post-validator and runtime expect when no LLM input is available.
  const fb = buildPolicyFallback(summary);
  const out = {};
  for (const policy of fb.policies ?? []) {
    if (!policy?.groupId) continue;
    out[policy.groupId] = {
      intentWeights: { ...(policy.intentWeights ?? {}) },
      targetPriorities: { ...(policy.targetPriorities ?? {}) },
      riskTolerance: Number(policy.riskTolerance ?? 0.5),
      focus: String(policy.focus ?? ""),
    };
  }
  // Ensure every required group has an entry, even if buildPolicyFallback
  // omitted it.
  for (const gid of Object.values(GROUP_IDS)) {
    if (!out[gid] && DEFAULT_GROUP_POLICIES[gid]) {
      const dflt = DEFAULT_GROUP_POLICIES[gid];
      out[gid] = {
        intentWeights: { ...(dflt.intentWeights ?? {}) },
        targetPriorities: { ...(dflt.targetPriorities ?? {}) },
        riskTolerance: Number(dflt.riskTolerance ?? 0.5),
        focus: String(dflt.focus ?? ""),
      };
    }
  }
  return out;
}

/**
 * Format the analytics block as a markdown-style text section. Returned as a
 * string so it can be dropped into summary._strategyContext (PromptPayload
 * already lifts that into the labeled context block).
 */
export function formatNPCBrainAnalyticsForLLM({ groupAnalytics, threatMap, deltaMenu, baseline }) {
  const lines = [];
  lines.push("## Group Analytics");
  for (const [gid, a] of Object.entries(groupAnalytics ?? {})) {
    if (!a || a.memberCount === 0) continue;
    lines.push(`- ${gid}: members=${a.memberCount} idle=${a.idleCount} active=${a.activeCount} underHit=${a.underHit} threated=${a.threatedCount} spread=${a.distFromCentroidStdDev}${a.avgHunger != null ? ` hunger=${a.avgHunger}` : ""}`);
  }
  lines.push("");
  lines.push("## Threat Sector Map (4x4)");
  if (threatMap?.totalThreats > 0) {
    lines.push(`- totalThreats=${threatMap.totalThreats} hotSector=${threatMap.hotSectorId ?? "n/a"} workerCentroidSector=${threatMap.workerCentroidSector ?? "n/a"}`);
    const hotSectors = (threatMap.sectors ?? []).filter((s) => s.threatCount > 0);
    for (const s of hotSectors) {
      lines.push(`  - ${s.id}: threats=${s.threatCount} raiders=${s.raiderCount} density=${s.density}`);
    }
  } else {
    lines.push("- no active threats on map");
  }
  lines.push("");
  lines.push("## Suggested Deltas (pick by ID; PREFER these over inventing weights)");
  const top = (deltaMenu ?? []).slice(0, 12);
  for (const d of top) {
    lines.push(`- [${d.id}] ${d.target} ${d.op} ${d.value} (group=${d.groupId}, score=${d.score}) — ${d.expectedEffect}`);
  }
  lines.push("");
  lines.push("## Baseline Hint (rule-based fallback — keep unchanged unless a delta says otherwise)");
  for (const [gid, b] of Object.entries(baseline ?? {})) {
    const intent = Object.entries(b.intentWeights ?? {}).slice(0, 6).map(([k, v]) => `${k}=${v}`).join(",");
    const target = Object.entries(b.targetPriorities ?? {}).slice(0, 6).map(([k, v]) => `${k}=${v}`).join(",");
    lines.push(`- ${gid}: risk=${b.riskTolerance} intent={${intent}} target={${target}}`);
  }
  return lines.join("\n");
}

/**
 * Validate an LLM policy bag against the baseline + delta menu. Walks each
 * group and:
 *   - Counts deviations from baseline (by intent/target weight).
 *   - For each deviation, checks whether it matches an entry in the delta
 *     menu (by direction and magnitude within tolerance) or has an explicit
 *     `_reason` string in the policy.
 *   - Returns { totalDeviations, matchedDeltas, unjustifiedDeviations,
 *     deltaUseRate } — the use rate is matched / max(1, totalDeviations).
 *
 * This does NOT mutate the policy. It is informational and used to populate
 * `state.metrics.combat.policyDeltaUseRate` for bench reporting.
 */
export function validatePolicyDeltas(policies, baseline, deltaMenu) {
  let totalDeviations = 0;
  let matchedDeltas = 0;
  let unjustifiedDeviations = 0;
  const matchedIds = new Set();
  const tolerance = 0.05;

  for (const policy of policies ?? []) {
    if (!policy || !policy.groupId) continue;
    const base = baseline?.[policy.groupId];
    if (!base) continue;
    const allFields = [];
    for (const [k, v] of Object.entries(policy.intentWeights ?? {})) {
      allFields.push({ target: `intentWeights.${k}`, current: Number(v), baseline: Number(base.intentWeights?.[k] ?? 0) });
    }
    for (const [k, v] of Object.entries(policy.targetPriorities ?? {})) {
      allFields.push({ target: `targetPriorities.${k}`, current: Number(v), baseline: Number(base.targetPriorities?.[k] ?? 0) });
    }
    if (typeof policy.riskTolerance === "number") {
      allFields.push({ target: "riskTolerance", current: Number(policy.riskTolerance), baseline: Number(base.riskTolerance ?? 0.5) });
    }
    const explicitReason = typeof policy._reason === "string" && policy._reason.trim().length > 0;
    for (const f of allFields) {
      const diff = f.current - f.baseline;
      if (Math.abs(diff) < tolerance) continue;
      totalDeviations += 1;
      // Find a matching delta in the menu for this group + target + direction.
      const candidates = (deltaMenu ?? []).filter(
        (d) => d.groupId === policy.groupId && d.target === f.target,
      );
      let matched = false;
      for (const d of candidates) {
        if (d.op === "+=" && diff > 0) {
          matched = true;
          matchedIds.add(d.id);
          break;
        }
        if (d.op === "-=" && diff < 0) {
          matched = true;
          matchedIds.add(d.id);
          break;
        }
        if (d.op === "set") {
          if (Math.abs(f.current - d.value) <= tolerance + 0.05) {
            matched = true;
            matchedIds.add(d.id);
            break;
          }
        }
      }
      if (matched) matchedDeltas += 1;
      else if (!explicitReason) unjustifiedDeviations += 1;
    }
  }

  const deltaUseRate = totalDeviations === 0 ? 0 : Number((matchedDeltas / totalDeviations).toFixed(3));
  return {
    totalDeviations,
    matchedDeltas,
    unjustifiedDeviations,
    deltaUseRate,
    matchedDeltaIds: [...matchedIds],
  };
}

/**
 * Top-level helper — build the entire R2 analytics package in one call so
 * NPCBrainSystem can attach it to the summary with a single function.
 */
export function buildNPCBrainAnalytics(state, summary, combat) {
  const groupAnalytics = computeGroupAnalytics(state);
  const threatMap = computeThreatZoneMap(state);
  const deltaMenu = computeDeltaMenu(state, combat);
  const baseline = computeRecommendedBaseline(state, summary);
  const formatted = formatNPCBrainAnalyticsForLLM({ groupAnalytics, threatMap, deltaMenu, baseline });
  return {
    groupAnalytics,
    threatMap,
    deltaMenu,
    baseline,
    formatted,
  };
}
