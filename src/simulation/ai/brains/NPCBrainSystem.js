import {
  DEFAULT_GROUP_POLICIES,
  GROUP_IDS,
  canonicalizeAiGroupId,
  listAllowedPolicyIntents,
  listAllowedTargetPriorities,
  normalizeAiToken,
} from "../../../config/aiConfig.js";
import { getLongRunAiTuning } from "../../../config/longRunProfile.js";
import { pushWarning } from "../../../app/warnings.js";
import { buildPolicySummary } from "../memory/WorldSummary.js";
import { listGroupStates } from "../../npc/state/StateGraph.js";
import { buildFeasibilityContext, isStateFeasible } from "../../npc/state/StateFeasibility.js";
import { markAiDecisionRequest, recordAiDecisionResult } from "../../../app/aiRuntimeStats.js";
import {
  buildNPCBrainAnalytics,
  validatePolicyDeltas,
} from "./NPCBrainAnalytics.js";

const REQUIRED_POLICY_GROUPS = Object.freeze([
  GROUP_IDS.WORKERS,
  GROUP_IDS.TRADERS,
  GROUP_IDS.SABOTEURS,
  GROUP_IDS.HERBIVORES,
  GROUP_IDS.PREDATORS,
]);

const POLICY_INTENT_TO_STATE = Object.freeze({
  [GROUP_IDS.WORKERS]: Object.freeze({
    eat: "seek_food",
    deliver: "deliver",
    farm: "seek_task",
    wood: "seek_task",
    wander: "wander",
  }),
  [GROUP_IDS.TRADERS]: Object.freeze({
    trade: "seek_trade",
    eat: "seek_food",
    wander: "wander",
  }),
  [GROUP_IDS.SABOTEURS]: Object.freeze({
    sabotage: "sabotage",
    scout: "scout",
    evade: "evade",
    eat: "seek_food",
    wander: "wander",
  }),
  [GROUP_IDS.HERBIVORES]: Object.freeze({
    flee: "flee",
    graze: "graze",
    migrate: "regroup",
    wander: "wander",
  }),
  [GROUP_IDS.PREDATORS]: Object.freeze({
    hunt: "hunt",
    stalk: "stalk",
    feed: "feed",
    rest: "rest",
    wander: "roam",
  }),
});

function canonicalStateForGroup(groupId, rawState) {
  const token = normalizeAiToken(rawState);
  if (!token) return "";
  const allowed = listGroupStates(groupId);
  if (allowed.includes(token)) return token;
  const byToken = new Map(allowed.map((state) => [normalizeAiToken(state), state]));
  return byToken.get(token) ?? "";
}

function sanitizePolicyWeights(source, allowedKeys, fallbackWeights = {}) {
  const out = {};
  for (const key of allowedKeys) {
    const raw = Object.prototype.hasOwnProperty.call(source ?? {}, key) ? source[key] : fallbackWeights[key];
    if (raw === undefined) continue;
    out[key] = Math.max(0, Math.min(3, Number(raw) || 0));
  }
  return out;
}

/**
 * NPC-Brain LLM tuning — derive a per-tick combat snapshot for the policy
 * prompt + sanitization. Reads `state.metrics.combat` (populated by
 * AnimalAISystem) and the most-recent `predator-hit` events on workers.
 * Does NOT mutate state. Returns a flat object whose keys flow through the
 * summary JSON to the LLM and double as a post-sanitization gate.
 *
 * Critical fields:
 * - activeRaiders   — count of `raider_beast` predators (worker-targeting)
 * - guardCount      — workers currently in GUARD role
 * - workerCount     — alive workers
 * - guardDeficit    — missing GUARDs vs. recommended (raiders * 1.5 - guards)
 * - nearestThreatTiles — Manhattan-ish distance from nearest predator
 * - workersUnderHit — workers whose recentEvents has "predator-hit" within 8 entries
 * - raidActive      — derived boolean: any raiders in flight
 */
function buildCombatContext(state) {
  const combat = state.metrics?.combat ?? {};
  const activeRaiders = Number(combat.activeRaiders ?? 0);
  const activePredators = Number(combat.activePredators ?? combat.activeThreats ?? 0);
  const guardCount = Number(combat.guardCount ?? 0);
  const workerCount = Number(combat.workerCount ?? 0);
  const nearestThreatTiles = Number(combat.nearestThreatDistance ?? -1);
  let workersUnderHit = 0;
  let workersHungry = 0;
  for (const w of state.agents ?? []) {
    if (!w || w.alive === false || w.type !== "WORKER") continue;
    const recent = w.memory?.recentEvents ?? [];
    if (recent.length > 0 && recent.slice(0, 8).includes("predator-hit")) workersUnderHit += 1;
    if (Number(w.hunger ?? 1) < 0.34) workersHungry += 1;
  }
  const recommendedGuards = Math.min(
    Math.max(0, workerCount - 1),
    Math.ceil(activeRaiders * 1.5 + (activePredators - activeRaiders) * 0.4),
  );
  const guardDeficit = Math.max(0, recommendedGuards - guardCount);
  const deathsByReason = state.metrics?.deathsByReason ?? {};
  const predationDeaths = Number(deathsByReason.predation ?? 0);
  const raidActive = activeRaiders > 0;
  return {
    activeRaiders,
    activePredators,
    guardCount,
    workerCount,
    workersHungry,
    workersUnderHit,
    nearestThreatTiles: Number.isFinite(nearestThreatTiles) ? Number(nearestThreatTiles.toFixed(2)) : -1,
    recommendedGuards,
    guardDeficit,
    predationDeaths,
    raidActive,
    pressureLevel:
      activeRaiders >= 2 || workersUnderHit >= 2 ? "high"
      : raidActive || activePredators >= 3 || workersUnderHit >= 1 ? "elevated"
      : activePredators >= 1 ? "watch"
      : "calm",
  };
}

/**
 * NPC-Brain LLM tuning — augment the per-tick policy summary with combat
 * context BEFORE it is serialized to JSON for the proxy prompt. The proxy
 * stringifies `summary` verbatim, so anything we add here flows directly to
 * the LLM. We also keep a top-level `_combatContext` mirror so future
 * PromptPayload changes can lift it into a labeled section without changing
 * the wire shape today.
 */
function attachCombatContextToSummary(summary, combat) {
  if (!summary || typeof summary !== "object") return summary;
  summary.world = summary.world ?? {};
  summary.world.combat = {
    activeRaiders: combat.activeRaiders,
    activePredators: combat.activePredators,
    guardCount: combat.guardCount,
    workerCount: combat.workerCount,
    workersUnderHit: combat.workersUnderHit,
    nearestThreatTiles: combat.nearestThreatTiles,
    recommendedGuards: combat.recommendedGuards,
    guardDeficit: combat.guardDeficit,
    predationDeaths: combat.predationDeaths,
    pressureLevel: combat.pressureLevel,
  };
  // Explicit textual directives — the LLM reads `summary` JSON in the prompt
  // body and reliably follows imperative phrasing better than inferring from
  // raw counts. These flow through `_strategyContext` (already lifted by
  // PromptPayload.buildPolicyPromptUserContent into a labeled section) and
  // a dedicated `_combatContext` mirror.
  // Round-2 — proximity-aware directives. Earlier (R1) we issued blanket
  // "must retreat" instructions for any raidActive frame, which over-rotated
  // the LLM in S2 (persistent distant raid → starvation). Now we only push
  // hard-retreat language when threats are CLOSE; otherwise we keep the LLM
  // in throughput-preserving mode and let the delta menu carry the signal.
  const directives = [];
  const nearestTilesDir = Number(combat.nearestThreatTiles ?? 999);
  const proximateDir = nearestTilesDir >= 0 && nearestTilesDir <= 12;
  const imminentDir = proximateDir && (Number(combat.guardDeficit ?? 0) > 0 || Number(combat.workersUnderHit ?? 0) > 0);
  if (combat.raidActive && imminentDir) {
    directives.push(
      `IMMINENT raid (${combat.activeRaiders} raider(s) within ${nearestTilesDir} tiles, ${combat.guardCount}/${combat.recommendedGuards} guards): hard retreat.`,
      "Workers: cap intentWeights.farm and wood at 0.5; deliver carried cargo and idle near depot.",
      "Workers: targetPriorities.safety up; warehouse modest (do NOT cluster all workers — keep them spread so guards can recruit).",
      "Frontier targetPriority below 0.4. Keep deliver weight ≥ 1.4 so cargo flows.",
      "Predators: targetPriorities.farm below 0.3 (don't pile onto raid).",
      "Herbivores: intentWeights.flee must exceed graze.",
    );
    if (combat.workersUnderHit > 0) {
      directives.push(`${combat.workersUnderHit} worker(s) hit — intentWeights.eat ≥ 1.8.`);
    }
  } else if (combat.raidActive) {
    // Distant raid — keep producing, but slightly bias safety. Pick from
    // the delta menu rather than applying blanket retreat.
    directives.push(
      `Distant raid (${combat.activeRaiders} raider(s) at ~${nearestTilesDir} tiles, ${combat.guardCount} guards): MAINTAIN throughput.`,
      "Prefer LOW-score deltas from menu (small farm/wood trims). Keep deliver weight high.",
      "Do NOT zero out farm/wood — colony will starve. Keep intentWeights.farm and wood ≥ 0.7.",
      "Bias predators slightly off the farm tile (`predators.farm-down`) and herbivore flee up.",
    );
  } else if (combat.activePredators >= 2) {
    directives.push(
      `Predator pressure: ${combat.activePredators} active predators. Bias workers toward safety; small frontier trim only.`,
    );
  }
  summary._combatContext = { ...summary.world.combat, raidActive: combat.raidActive, directives };
  // Merge into _strategyContext so PromptPayload surfaces the directives in
  // the labeled `strategyContext` section without us touching PromptPayload.
  summary._strategyContext = summary._strategyContext ?? {};
  summary._strategyContext.combat = summary._combatContext;
  if (directives.length > 0) {
    summary._strategyContext.raidDirectives = directives;
  }
  return summary;
}

/**
 * Round-2 LLM tuning — attach analytics package (group analytics, threat
 * sector map, scored delta menu, baseline hint) to the summary in BOTH a
 * machine-readable form (`summary._npcBrainAnalytics`) and a markdown text
 * block lifted into `_strategyContext.npcBrainAnalyticsText`. The latter is
 * the path the LLM's prompt actually surfaces.
 *
 * Pure: never mutates state, only the `summary` argument.
 */
function attachNPCBrainAnalyticsToSummary(summary, analytics) {
  if (!summary || typeof summary !== "object" || !analytics) return summary;
  // Compact wire format — keep only the fields the LLM needs to ground its
  // pick. Drops baseline.summary/steeringNotes (already in the prompt
  // policy template) and limits delta menu to top-12.
  summary._npcBrainAnalytics = {
    groupAnalytics: analytics.groupAnalytics,
    threatMap: {
      hotSectorId: analytics.threatMap?.hotSectorId ?? null,
      workerCentroidSector: analytics.threatMap?.workerCentroidSector ?? null,
      totalThreats: analytics.threatMap?.totalThreats ?? 0,
      sectors: (analytics.threatMap?.sectors ?? []).filter((s) => s.threatCount > 0),
    },
    deltaMenu: (analytics.deltaMenu ?? []).slice(0, 12),
    baseline: analytics.baseline,
  };
  summary._strategyContext = summary._strategyContext ?? {};
  summary._strategyContext.npcBrainAnalytics = summary._npcBrainAnalytics;
  summary._strategyContext.npcBrainAnalyticsText = analytics.formatted;
  // R2 prompt-style instruction — LLM should PREFER picking deltas from the
  // menu and keep all unmentioned policy fields at baseline. Surfaced as a
  // top-level directive so PromptPayload picks it up alongside raid
  // directives.
  summary._strategyContext.r2Instructions = [
    "PREFER deltas from `_npcBrainAnalytics.deltaMenu` (highest score first).",
    "Keep all unmentioned policy fields at the baseline values shown in `_npcBrainAnalytics.baseline`.",
    "Pick deltas by ID when possible — set policy._appliedDeltas to a list of delta IDs you picked.",
    "If you must deviate from baseline OUTSIDE the menu, set policy._reason explaining why.",
  ];
  return summary;
}

/**
 * NPC-Brain LLM tuning — post-sanitization clamp that hardens any policy
 * (LLM-sourced or fallback) when raiders are in the field. The LLM still
 * "wins" because it sees the combat block in the prompt and produces
 * better-shaped weights up-front; this clamp is a safety net so a flat or
 * over-confident response cannot leave workers exposed. Pure function — never
 * mutates the input fallback policy template.
 *
 * Rules:
 * - workers: cap riskTolerance ≤ 0.30; ensure intentWeights.eat & deliver
 *   stay ≥ 1.4 (retreat-to-depot doctrine); guarantee targetPriorities.safety
 *   ≥ 1.4 and warehouse ≥ 1.5; lower intentWeights.wander to ≤ 0.15.
 * - predators: when raiders co-active, push targetPriorities.farm ≤ 0.6 so
 *   wolves/bears don't pile onto colony tiles where guards are already
 *   committed; cap riskTolerance ≤ 0.7.
 * - herbivores: ensure intentWeights.flee ≥ intentWeights.graze under raid
 *   pressure so they don't keep grazing into a predator pack.
 *
 * Idempotent — running twice produces the same numbers.
 */
function applyRaidPosturePolicy(policy, combat) {
  if (!policy || !combat || !combat.raidActive) return policy;
  const groupId = policy.groupId;
  // Iteration 3 — proximity-gated clamp. Earlier iterations applied the same
  // strong retreat doctrine to every raid tick, which starved the colony
  // when raiders were far away (large templates with persistent low-grade
  // raid pressure). Now we scale the clamp by how close the threat actually
  // is and how many guards are deployed: distant raiders + adequate guards
  // = colony keeps producing; close raiders / guard deficit = full retreat.
  const high = combat.pressureLevel === "high" || Number(combat.guardDeficit ?? 0) >= 2;
  const nearestTiles = Number(combat.nearestThreatTiles ?? 999);
  const proximate = nearestTiles >= 0 && nearestTiles <= 12;
  // "imminent" = close threat AND we are short on guards. "manageable" =
  // raid is technically active but distant or already covered by guards.
  const imminent = proximate && (combat.guardDeficit > 0 || combat.workersUnderHit > 0);
  const manageable = !imminent && !high;

  if (groupId === GROUP_IDS.WORKERS) {
    policy.riskTolerance = Math.min(
      Number(policy.riskTolerance ?? 0.5),
      imminent ? 0.18 : high ? 0.28 : 0.40,
    );
    policy.intentWeights = policy.intentWeights ?? {};
    policy.intentWeights.eat = Math.max(
      Number(policy.intentWeights.eat ?? 0),
      imminent ? 1.8 : high ? 1.5 : 1.2,
    );
    // Manageable raid: leave farm/wood mostly alone so the colony keeps
    // growing. Imminent: hard cap so workers stay near depot.
    if (imminent) {
      if (typeof policy.intentWeights.farm === "number") policy.intentWeights.farm = Math.min(policy.intentWeights.farm, 0.5);
      if (typeof policy.intentWeights.wood === "number") policy.intentWeights.wood = Math.min(policy.intentWeights.wood, 0.5);
      if (typeof policy.intentWeights.quarry === "number") policy.intentWeights.quarry = Math.min(policy.intentWeights.quarry, 0.4);
      if (typeof policy.intentWeights.gather_herbs === "number") policy.intentWeights.gather_herbs = Math.min(policy.intentWeights.gather_herbs, 0.4);
    } else if (high) {
      if (typeof policy.intentWeights.farm === "number") policy.intentWeights.farm = Math.min(policy.intentWeights.farm, 0.8);
      if (typeof policy.intentWeights.wood === "number") policy.intentWeights.wood = Math.min(policy.intentWeights.wood, 0.8);
    } else if (manageable) {
      // R2 iteration-2 — distant raid floor. The R2 LLM (with delta menu)
      // tends to pick multiple retreat deltas under any raidActive frame,
      // which starves the colony when the threat is ≥20 tiles away. Floor
      // farm/wood at 0.7 so the LLM cannot drag them below working levels.
      const fb = DEFAULT_GROUP_POLICIES[groupId]?.intentWeights ?? {};
      if (typeof policy.intentWeights.farm === "number") {
        policy.intentWeights.farm = Math.max(policy.intentWeights.farm, Math.min(0.7, Number(fb.farm ?? 1)));
      }
      if (typeof policy.intentWeights.wood === "number") {
        policy.intentWeights.wood = Math.max(policy.intentWeights.wood, Math.min(0.7, Number(fb.wood ?? 1)));
      }
    }
    // Deliver: keep cargo flowing but cap unbounded LLM aggression.
    policy.intentWeights.deliver = Math.min(
      Math.max(Number(policy.intentWeights.deliver ?? 0), imminent ? 1.4 : 1.0),
      imminent ? 1.7 : 2.4,
    );
    policy.intentWeights.wander = Math.min(Number(policy.intentWeights.wander ?? 0), 0.20);
    policy.targetPriorities = policy.targetPriorities ?? {};
    policy.targetPriorities.safety = Math.max(
      Number(policy.targetPriorities.safety ?? 0),
      imminent ? 1.8 : high ? 1.5 : 1.2,
    );
    policy.targetPriorities.warehouse = Math.max(Number(policy.targetPriorities.warehouse ?? 0), 1.5);
    if (typeof policy.targetPriorities.frontier === "number") {
      policy.targetPriorities.frontier = Math.min(
        policy.targetPriorities.frontier,
        imminent ? 0.4 : manageable ? 0.95 : 0.7,
      );
    }
  } else if (groupId === GROUP_IDS.PREDATORS) {
    policy.riskTolerance = Math.min(Number(policy.riskTolerance ?? 0.8), 0.7);
    policy.targetPriorities = policy.targetPriorities ?? {};
    // Push wolves/bears OFF the farms while the raider beasts pressure the
    // GUARDs — a clean separation that lets guards focus melee on raiders
    // rather than a multi-front predator cluster.
    if (typeof policy.targetPriorities.farm === "number") {
      policy.targetPriorities.farm = Math.min(policy.targetPriorities.farm, 0.4);
    }
    if (typeof policy.targetPriorities.safety === "number") {
      policy.targetPriorities.safety = Math.max(policy.targetPriorities.safety, 0.8);
    }
  } else if (groupId === GROUP_IDS.HERBIVORES) {
    policy.intentWeights = policy.intentWeights ?? {};
    const graze = Number(policy.intentWeights.graze ?? 0);
    const flee = Number(policy.intentWeights.flee ?? 0);
    if (flee < graze + 0.3) policy.intentWeights.flee = Math.min(3, graze + 0.4);
  } else if (groupId === GROUP_IDS.TRADERS) {
    // Traders: only pin under imminent threat. Distant raid leaves trade
    // routes open so depot throughput keeps pace with growth.
    if (imminent) {
      policy.targetPriorities = policy.targetPriorities ?? {};
      policy.targetPriorities.warehouse = Math.max(Number(policy.targetPriorities.warehouse ?? 0), 1.6);
      if (typeof policy.targetPriorities.frontier === "number") {
        policy.targetPriorities.frontier = Math.min(policy.targetPriorities.frontier, 0.5);
      }
      if (typeof policy.targetPriorities.safety === "number") {
        policy.targetPriorities.safety = Math.max(policy.targetPriorities.safety, 1.3);
      }
    }
  }
  return policy;
}

function sanitizePolicyForRuntime(policy, groupId, state, combatContext = null) {
  const fallback = DEFAULT_GROUP_POLICIES[groupId] ?? {};
  const tuning = getLongRunAiTuning(state);
  const sanitized = {
    ...fallback,
    ...policy,
    groupId,
    intentWeights: sanitizePolicyWeights(policy?.intentWeights ?? {}, listAllowedPolicyIntents(groupId), fallback.intentWeights ?? {}),
    targetPriorities: sanitizePolicyWeights(policy?.targetPriorities ?? {}, listAllowedTargetPriorities(groupId), fallback.targetPriorities ?? {}),
    riskTolerance: Math.max(0, Math.min(1, Number(policy?.riskTolerance) || Number(fallback.riskTolerance) || 0.5)),
    ttlSec: Math.max(8, Math.min(90, Number(policy?.ttlSec) || Number(fallback.ttlSec) || Number(tuning.policyTtlDefaultSec) || 24)),
    focus: String(policy?.focus ?? fallback.focus ?? "").slice(0, 72),
    summary: String(policy?.summary ?? fallback.summary ?? "").slice(0, 140),
    steeringNotes: Array.isArray(policy?.steeringNotes)
      ? policy.steeringNotes.map((note) => String(note ?? "").slice(0, 120)).filter(Boolean).slice(0, 4)
      : Array.isArray(fallback.steeringNotes)
        ? [...fallback.steeringNotes]
        : [],
  };
  // NPC-Brain LLM tuning — last-mile raid-posture clamp. Applied uniformly to
  // LLM and fallback policies so the LLM can only "win" via better baseline
  // weights, not by escaping the safety net. When no raid is active this is a
  // pure pass-through.
  if (combatContext?.raidActive) applyRaidPosturePolicy(sanitized, combatContext);
  return sanitized;
}

function sanitizeStateTargetForRuntime(groupId, targetState) {
  if (groupId === GROUP_IDS.WORKERS) {
    if (targetState === "harvest") return "seek_task";
    if (targetState === "eat" || targetState === "seek_food" || targetState === "idle") return "seek_task";
  }
  if (groupId === GROUP_IDS.TRADERS) {
    if (targetState === "trade" || targetState === "eat" || targetState === "seek_food" || targetState === "idle") {
      return "seek_trade";
    }
  }
  return targetState;
}

function deriveStateTargetFromPolicy(policy, state) {
  const groupId = canonicalizeAiGroupId(policy?.groupId);
  const intentMap = POLICY_INTENT_TO_STATE[groupId];
  if (!intentMap) return null;
  const tuning = getLongRunAiTuning(state);

  const intents = Object.entries(policy?.intentWeights ?? {})
    .map(([intent, value]) => ({ intent: normalizeAiToken(intent), value: Number(value) || 0 }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);

  if (intents.length === 0) return null;
  const top = intents[0];
  const second = intents[1]?.value ?? 0;
  const targetState = intentMap[top.intent];
  if (!targetState) return null;
  if (!listGroupStates(groupId).includes(targetState)) return null;

  const dominance = Math.max(0, top.value - second);
  const priority = Math.max(0.35, Math.min(0.82, 0.45 + dominance * 0.2));
  const ttlSec = Math.max(6, Math.min(36, Math.round((Number(policy?.ttlSec) || Number(tuning.policyTtlDefaultSec) || 18) * 0.7)));

  return {
    groupId,
    targetState,
    priority,
    ttlSec,
    reason: `policy-intent:${top.intent}`,
  };
}

function mergeStateTargetsWithPolicyFallback(policies, stateTargets, state) {
  const merged = [...stateTargets];
  const existingGroups = new Set(merged.map((target) => target.groupId));
  for (const policy of policies) {
    const groupId = canonicalizeAiGroupId(policy?.groupId);
    if (!groupId || existingGroups.has(groupId)) continue;
    const derived = deriveStateTargetFromPolicy(policy, state);
    if (!derived) continue;
    merged.push(derived);
    existingGroups.add(groupId);
  }
  return merged;
}

function clonePolicy(policy) {
  return JSON.parse(JSON.stringify(policy));
}

function splitLegacyVisitorsPolicy(policy) {
  const groupId = canonicalizeAiGroupId(policy?.groupId);
  if (groupId !== "visitors") return [policy];
  return [
    clonePolicy({ ...policy, groupId: GROUP_IDS.TRADERS, splitFrom: "visitors" }),
    clonePolicy({ ...policy, groupId: GROUP_IDS.SABOTEURS, splitFrom: "visitors" }),
  ];
}

function normalizePoliciesForRuntime(policies = [], state, combatContext = null) {
  const policyByGroup = new Map();
  let migratedLegacyVisitors = false;

  for (const candidate of policies) {
    if (!candidate || typeof candidate !== "object") continue;
    const expanded = splitLegacyVisitorsPolicy(candidate);
    if (expanded.length > 1) migratedLegacyVisitors = true;
    for (const policy of expanded) {
      const groupId = canonicalizeAiGroupId(policy.groupId);
      if (!groupId) continue;
      if (!REQUIRED_POLICY_GROUPS.includes(groupId)) continue;
      policyByGroup.set(groupId, sanitizePolicyForRuntime(policy, groupId, state, combatContext));
    }
  }

  if (migratedLegacyVisitors) {
    pushWarning(state, "Policy group 'visitors' migrated to traders+saboteurs for compatibility.", "warn", "NPCBrainSystem");
  }

  for (const groupId of REQUIRED_POLICY_GROUPS) {
    if (policyByGroup.has(groupId)) continue;
    const injected = clonePolicy(DEFAULT_GROUP_POLICIES[groupId]);
    if (combatContext?.raidActive) applyRaidPosturePolicy(injected, combatContext);
    policyByGroup.set(groupId, injected);
    pushWarning(state, `Missing policy '${groupId}', fallback policy injected.`, "warn", "NPCBrainSystem");
  }

  return REQUIRED_POLICY_GROUPS.map((groupId) => policyByGroup.get(groupId));
}

function normalizeStateTargetsForRuntime(stateTargets = [], state) {
  const sanitized = [];
  const seen = new Set();

  for (const candidate of stateTargets) {
    if (!candidate || typeof candidate !== "object") continue;
    const groupId = canonicalizeAiGroupId(candidate.groupId);
    const targetState = sanitizeStateTargetForRuntime(
      groupId,
      canonicalStateForGroup(groupId, candidate.targetState),
    );
    if (!groupId || !targetState) continue;
    if (!REQUIRED_POLICY_GROUPS.includes(groupId)) continue;

    const key = `${groupId}:${targetState}`;
    if (seen.has(key)) continue;
    seen.add(key);

    sanitized.push({
      groupId,
      targetState,
      priority: Math.max(0, Math.min(1, Number(candidate.priority) || 0.5)),
      ttlSec: Math.max(4, Math.min(60, Number(candidate.ttlSec) || 14)),
      reason: String(candidate.reason ?? "").slice(0, 160),
    });
  }

  if ((stateTargets?.length ?? 0) > 0 && sanitized.length === 0) {
    pushWarning(state, "Policy stateTargets were rejected by runtime validation.", "warn", "NPCBrainSystem");
  }

  return sanitized;
}

function entitiesByGroup(state, groupId) {
  const list = [];
  for (const entity of state.agents ?? []) {
    if (entity?.alive === false) continue;
    if (String(entity.groupId ?? "") === groupId) list.push(entity);
  }
  for (const entity of state.animals ?? []) {
    if (entity?.alive === false) continue;
    if (String(entity.groupId ?? "") === groupId) list.push(entity);
  }
  return list;
}

function isTargetFeasibleForGroup(state, target) {
  const members = entitiesByGroup(state, target.groupId);
  if (members.length === 0) return true;
  const ctx = {
    predators: state.animals?.filter?.((animal) => animal.groupId === GROUP_IDS.PREDATORS && animal.alive !== false) ?? [],
    herbivores: state.animals?.filter?.((animal) => animal.groupId === GROUP_IDS.HERBIVORES && animal.alive !== false) ?? [],
  };
  for (const entity of members) {
    const feasibilityContext = buildFeasibilityContext(entity, target.groupId, state, ctx);
    const feasible = isStateFeasible(entity, target.groupId, target.targetState, state, {
      ...ctx,
      feasibilityContext,
    });
    if (feasible.ok) return true;
  }
  return false;
}

// NPC-Brain LLM tuning — exported for unit-test coverage. These are pure
// functions (no state mutation beyond the policy/summary argument) and form
// the contract surface the bench / tests pin to.
export {
  buildCombatContext,
  attachCombatContextToSummary,
  attachNPCBrainAnalyticsToSummary,
  applyRaidPosturePolicy,
  sanitizePolicyForRuntime,
  normalizePoliciesForRuntime,
};

export class NPCBrainSystem {
  constructor() {
    this.name = "NPCBrainSystem";
    this.pendingPromise = null;
    this.pendingResult = null;
  }

  update(_dt, state, services) {
    if (this.pendingResult) {
      const now = state.metrics.timeSec;
      // NPC-Brain LLM tuning — recompute raid posture at integration time so
      // the clamp uses the current frame's combat snapshot, not whatever was
      // visible when the request was queued (typically 8-30 s earlier).
      const combatContext = buildCombatContext(state);
      const policies = normalizePoliciesForRuntime(this.pendingResult.data?.policies ?? [], state, combatContext);
      // Round-2 — post-validate the policy bag against the menu shown to
      // the LLM. Tracks `state.metrics.combat.policyDeltaUseRate` so the
      // bench / panels can see whether the LLM is actually using the menu
      // (high rate) vs. inventing weights (low rate).
      const usedFb = Boolean(this.pendingResult.fallback);
      if (this.lastRequestAnalytics && !usedFb) {
        // Validate against the RAW LLM output (pre-sanitize/clamp) so the
        // delta-use signal reflects what the model actually chose.
        // Sanitization clamps everything toward baseline under raid pressure
        // and would zero out the signal otherwise.
        const rawLlmPolicies = this.pendingResult.data?.policies ?? [];
        const validation = validatePolicyDeltas(
          rawLlmPolicies,
          this.lastRequestAnalytics.baseline,
          this.lastRequestAnalytics.deltaMenu,
        );
        // Stash on state.ai (rolling-average) — AnimalAISystem rewrites
        // state.metrics.combat each frame, so any field we put there is
        // wiped before the bench reads it.
        state.ai ??= {};
        const prev = state.ai.npcBrainR2 ?? { samples: 0, sumUse: 0, sumTotal: 0, sumMatched: 0, sumUnjustified: 0, lastIds: [] };
        prev.samples += 1;
        prev.sumUse += validation.deltaUseRate;
        prev.sumTotal += validation.totalDeviations;
        prev.sumMatched += validation.matchedDeltas;
        prev.sumUnjustified += validation.unjustifiedDeviations;
        prev.lastIds = validation.matchedDeltaIds;
        prev.lastUseRate = validation.deltaUseRate;
        state.ai.npcBrainR2 = prev;
        // Also write to metrics.combat for in-frame readers (will likely
        // get overwritten by AnimalAISystem next tick, but useful within a
        // single tick).
        state.metrics ??= {};
        state.metrics.combat ??= {};
        state.metrics.combat.policyDeltaUseRate = validation.deltaUseRate;
        state.metrics.combat.policyDeltaTotalDeviations = validation.totalDeviations;
        state.metrics.combat.policyDeltaMatchedCount = validation.matchedDeltas;
        state.metrics.combat.policyDeltaUnjustified = validation.unjustifiedDeviations;
        state.metrics.combat.policyDeltaMatchedIds = validation.matchedDeltaIds;
      }
      const llmStateTargets = normalizeStateTargetsForRuntime(this.pendingResult.data?.stateTargets ?? [], state);
      // v0.8.6 Tier 0 LR-H1: dedup the "Dropped infeasible state target" spam.
      // Without this gate the trader policy emitting `seek_trade` against a
      // 0-warehouse colony fired the warning every ~5s for the entire run.
      // Rate-limit per (groupId, targetState) key to once per 30 sim seconds.
      state.ai ??= {};
      state.ai._infeasibleWarnings ??= {};
      const dedupBucket = state.ai._infeasibleWarnings;
      const dedupNow = Number(state.metrics?.timeSec ?? 0);
      const stateTargets = mergeStateTargetsWithPolicyFallback(policies, llmStateTargets, state)
        .filter((target) => {
          const feasible = isTargetFeasibleForGroup(state, target);
          if (!feasible) {
            const key = `${target.groupId}:${target.targetState}`;
            const lastEmittedSec = Number(dedupBucket[key] ?? -Infinity);
            if (dedupNow - lastEmittedSec >= 30) {
              dedupBucket[key] = dedupNow;
              pushWarning(
                state,
                `Dropped infeasible state target ${target.groupId}:${target.targetState}.`,
                "warn",
                "NPCBrainSystem",
              );
            }
          }
          return feasible;
        });
      for (const policy of policies) {
        state.ai.groupPolicies.set(policy.groupId, {
          expiresAtSec: now + policy.ttlSec,
          data: policy,
        });
      }
      state.ai.groupStateTargets ??= new Map();
      for (const target of stateTargets) {
        state.ai.groupStateTargets.set(target.groupId, {
          targetState: target.targetState,
          expiresAtSec: now + target.ttlSec,
          priority: target.priority,
          source: this.pendingResult.fallback ? "fallback" : "llm",
          reason: target.reason || `policy:${target.targetState}`,
        });
      }
      const usedFallback = Boolean(this.pendingResult.fallback);
      state.ai.mode = usedFallback ? "fallback" : "llm";
      state.ai.lastPolicySource = usedFallback ? "fallback" : "llm";
      state.ai.lastPolicyResultSec = now;
      state.ai.policyDecisionCount += 1;
      if (!usedFallback) state.ai.policyLlmCount += 1;
      state.ai.lastPolicyError = this.pendingResult.error ?? "";
      state.ai.lastPolicyBatch = [...policies];
      state.ai.lastStateTargetBatch = [...stateTargets];
      state.ai.lastPolicyModel = this.pendingResult.model ?? state.ai.lastPolicyModel ?? "";
      state.ai.lastError = state.ai.lastEnvironmentError || state.ai.lastPolicyError || "";
      state.metrics.aiLatencyMs = Number(this.pendingResult.latencyMs ?? state.metrics.aiLatencyMs ?? 0);
      state.metrics.proxyHealth = services.llmClient.lastStatus ?? state.metrics.proxyHealth;
      recordAiDecisionResult(state, "policy", this.pendingResult, now);

      const debugExchange = this.pendingResult.debug ?? {};
      const baseExchange = {
        category: "npc-brain",
        label: "NPC Brain",
        simSec: now,
        source: usedFallback ? "fallback" : "llm",
        fallback: usedFallback,
        model: this.pendingResult.model ?? state.ai.lastPolicyModel ?? "",
        latencyMs: this.pendingResult.latencyMs ?? null,
        endpoint: debugExchange.endpoint ?? "/api/ai/policy",
        requestedAtIso: debugExchange.requestedAtIso ?? "",
        requestSummary: debugExchange.requestSummary ?? null,
        promptSystem: debugExchange.promptSystem ?? "",
        promptUser: debugExchange.promptUser ?? "",
        requestPayload: debugExchange.requestPayload ?? null,
        rawModelContent: debugExchange.rawModelContent ?? "",
        parsedBeforeValidation: debugExchange.parsedBeforeValidation ?? null,
        guardedOutput: debugExchange.guardedOutput ?? this.pendingResult.data ?? null,
        decisionResult: { policies, stateTargets },
        error: this.pendingResult.error ?? debugExchange.error ?? "",
      };
      state.ai.lastPolicyExchange = baseExchange;
      state.ai.policyExchanges ??= [];
      state.ai.policyExchanges.unshift(baseExchange);
      state.ai.policyExchanges = state.ai.policyExchanges.slice(0, 8);
      state.ai.llmCallLog ??= [];
      state.ai.llmCallLog.unshift(baseExchange);
      state.ai.llmCallLog = state.ai.llmCallLog.slice(0, 24);
      state.ai.lastPolicyExchangeByGroup ??= {};
      for (const policy of policies) {
        state.ai.lastPolicyExchangeByGroup[policy.groupId] = {
          ...baseExchange,
          groupId: policy.groupId,
        };
      }

      // v0.8.2 Round-5b Wave-1 (01e Step 2) — policy-change ring buffer.
      // Pure observer write: compares the first worker policy's focus + the
      // llm/fallback source against the previous entry; pushes a new record
      // when either dimension flips (or at least 5 s have elapsed). Cap 32
      // so the Timeline panel / future debug surface reads bounded history
      // without modifying sim outputs (benchmark bit-identical).
      const firstWorker = policies.find((p) => String(p.groupId ?? "").toLowerCase() === "workers") ?? policies[0] ?? null;
      const focusTag = String(firstWorker?.focus ?? firstWorker?.data?.focus ?? "");
      const errorKind = this.pendingResult.errorKind ?? (this.pendingResult.error ? "unknown" : "none");
      state.ai.policyHistory ??= [];
      const prev = state.ai.policyHistory[0] ?? null;
      const focusChanged = !prev || prev.focus !== focusTag;
      const sourceChanged = !prev || prev.source !== state.ai.lastPolicySource;
      const elapsedGuard = !prev || ((now - Number(prev.atSec ?? 0)) >= 5);
      if (!prev || focusChanged || sourceChanged || !elapsedGuard === false) {
        // Only push on actual change; skip duplicates within 5 s.
        if (!prev || focusChanged || sourceChanged || (now - Number(prev.atSec ?? 0)) >= 5) {
          state.ai.policyHistory.unshift({
            atSec: now,
            source: state.ai.lastPolicySource,
            badgeState: usedFallback
              ? (this.pendingResult.error ? "fallback-degraded" : "fallback-healthy")
              : "llm-live",
            focus: focusTag,
            errorKind,
            errorMessage: String(this.pendingResult.error ?? "").slice(0, 120),
            model: String(this.pendingResult.model ?? ""),
          });
          if (state.ai.policyHistory.length > 32) {
            state.ai.policyHistory = state.ai.policyHistory.slice(0, 32);
          }
        }
      }

      if (state.debug?.aiTrace) {
        const groups = policies.map((p) => p.groupId).join(", ");
        const targets = stateTargets.map((target) => `${target.groupId}:${target.targetState}`).join(" ");
        state.debug.aiTrace.unshift({
          sec: now,
          source: usedFallback ? "fallback" : "llm",
          channel: "policy",
          fallback: usedFallback,
          model: this.pendingResult.model ?? services.llmClient.lastModel ?? "",
          weather: state.weather.current,
          events: `${groups || "none"} ${targets ? `targets=${targets}` : ""}`.trim(),
          error: this.pendingResult.error ?? "",
        });
        state.debug.aiTrace = state.debug.aiTrace.slice(0, 36);
      }
      this.pendingResult = null;
    }

    const now = state.metrics.timeSec;
    for (const [groupId, p] of [...state.ai.groupPolicies.entries()]) {
      if (p.expiresAtSec <= now) {
        state.ai.groupPolicies.delete(groupId);
      }
    }
    if (state.ai.groupStateTargets instanceof Map) {
      for (const [groupId, target] of [...state.ai.groupStateTargets.entries()]) {
        if (Number(target?.expiresAtSec ?? 0) <= now) {
          state.ai.groupStateTargets.delete(groupId);
        }
      }
    }

    const predators = state.animals?.filter?.((animal) => animal.groupId === GROUP_IDS.PREDATORS && animal.alive !== false) ?? [];
    const herbivores = state.animals?.filter?.((animal) => animal.groupId === GROUP_IDS.HERBIVORES && animal.alive !== false) ?? [];
    const targetContext = { predators, herbivores };
    for (const e of [...state.agents, ...state.animals]) {
      e.policy = state.ai.groupPolicies.get(e.groupId)?.data ?? null;
      const groupTarget = state.ai.groupStateTargets?.get?.(e.groupId) ?? null;
      let targetForEntity = groupTarget;
      if (groupTarget) {
        const feasibilityContext = buildFeasibilityContext(e, String(e.groupId ?? ""), state, targetContext);
        const feasible = isStateFeasible(e, String(e.groupId ?? ""), groupTarget.targetState, state, {
          ...targetContext,
          feasibilityContext,
        });
        if (!feasible.ok) {
          targetForEntity = null;
        }
      }
      e.blackboard ??= {};
      e.blackboard.aiTargetState = targetForEntity ? targetForEntity.targetState : null;
      e.blackboard.aiTargetMeta = targetForEntity
        ? {
            expiresAtSec: targetForEntity.expiresAtSec,
            priority: targetForEntity.priority,
            source: targetForEntity.source,
            reason: targetForEntity.reason,
          }
        : null;
    }

    if (this.pendingPromise) return;

    const tuning = getLongRunAiTuning(state);
    if (state.metrics.timeSec - state.ai.lastPolicyDecisionSec < tuning.policyDecisionIntervalSec) {
      return;
    }

    state.ai.lastPolicyDecisionSec = state.metrics.timeSec;
    markAiDecisionRequest(state, "policy", state.metrics.timeSec);
    const summary = buildPolicySummary(state);
    if (services.memoryStore) {
      const memCtx = services.memoryStore.formatForPrompt(
        "workers food wood task policy",
        state.metrics.timeSec,
      );
      if (memCtx) summary._memoryContext = memCtx;
    }
    // NPC-Brain LLM tuning — inject combat context into the policy summary so
    // the LLM sees raid pressure (raider count, guard deficit, predation
    // deaths, workers under hit). The proxy stringifies `summary` into the
    // JSON user message verbatim, so this reaches the prompt without
    // touching PromptPayload/ai-proxy.
    const requestCombat = buildCombatContext(state);
    attachCombatContextToSummary(summary, requestCombat);
    // Round-2 — attach analytics package (group analytics, threat sector
    // map, scored delta menu, baseline hint). Computed up-front so the LLM
    // request and the post-validator share the same baseline + menu (which
    // is critical for the delta-use-rate signal to be meaningful).
    const requestAnalytics = buildNPCBrainAnalytics(state, summary, requestCombat);
    attachNPCBrainAnalyticsToSummary(summary, requestAnalytics);
    // Stash the menu + baseline on the brain instance so the integration
    // step (which can run several seconds later) can validate against the
    // menu that was actually shown to the LLM.
    this.lastRequestAnalytics = requestAnalytics;
    // Phase-LLM-Tune (system-level fix): NPC-Brain LLM only fires when there
    // is a real threat to react to. In calm scenarios the LLM produces
    // policies that are slightly more defensive than the rule-based fallback
    // (a known artifact of the trained tendency toward caution), which costs
    // production output across long runs without saving any lives. Gate LLM
    // on activeThreats|activeRaiders|workersUnderHit; otherwise use fallback.
    // Round-2 iteration-3 — extend the gate: even if there are active
    // threats, only let the LLM steer when the threat is IMMINENT (close
    // OR guard-deficit OR worker hit). Distant raid frames stay on fallback
    // because the LLM consistently over-rotates the colony into starvation
    // (S2 case). Calm + distant-raid both → fallback.
    const calmCombat = requestCombat.activeRaiders === 0
      && Number(state.metrics?.combat?.activeThreats ?? 0) === 0
      && Number(requestCombat.workersUnderHit ?? 0) === 0;
    const nearestTilesGate = Number(requestCombat.nearestThreatTiles ?? 999);
    const proximateGate = nearestTilesGate >= 0 && nearestTilesGate <= 14;
    // Round-2 iteration-3 — imminent gate. Only fire LLM when:
    //   - close threat (≤14 tiles), OR
    //   - guard deficit (need rapid policy shift to recruit), OR
    //   - workers actively hit.
    // Distant-raid frames stay on fallback because the LLM consistently
    // over-rotates the colony into starvation when threat is far away.
    const imminentGate = (requestCombat.activeRaiders > 0 || requestCombat.activePredators >= 2)
      && (proximateGate || requestCombat.guardDeficit > 0 || requestCombat.workersUnderHit > 0);
    const wantsLlm = state.ai.enabled
      && state.ai.coverageTarget !== "fallback"
      && !calmCombat
      && imminentGate;
    if (state.debug?.aiTrace) {
      state.debug.aiTrace.unshift({
        sec: state.metrics.timeSec,
        source: wantsLlm ? "llm" : "fallback",
        channel: "policy-request",
        fallback: !wantsLlm,
        model: state.metrics.proxyModel ?? services.llmClient.lastModel ?? "",
        weather: summary.world.weather.current,
        events: Object.keys(summary.groups).join(", "),
        error: "",
      });
      state.debug.aiTrace = state.debug.aiTrace.slice(0, 36);
    }
    this.pendingPromise = services.llmClient
      .requestPolicies(summary, wantsLlm)
      .then((result) => {
        this.pendingResult = result;
      })
      .catch((err) => {
        const fallbackRaw = services.fallbackPolicies(summary);
        this.pendingResult = {
          fallback: true,
          data: fallbackRaw,
          latencyMs: 0,
          error: String(err?.message ?? err),
          model: services.llmClient.lastModel ?? "fallback",
          debug: {
            requestedAtIso: new Date().toISOString(),
            endpoint: "/api/ai/policy",
            requestSummary: summary,
            rawModelContent: JSON.stringify(fallbackRaw, null, 2),
            parsedBeforeValidation: fallbackRaw,
            guardedOutput: fallbackRaw,
            error: String(err?.message ?? err),
          },
        };
      })
      .finally(() => {
        this.pendingPromise = null;
      });
  }
}
