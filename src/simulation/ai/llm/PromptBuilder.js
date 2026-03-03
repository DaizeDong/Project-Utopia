import { EVENT_TYPE, WEATHER } from "../../../config/constants.js";
import { DEFAULT_GROUP_POLICIES } from "../../../config/aiConfig.js";

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function clonePolicies() {
  return Object.values(DEFAULT_GROUP_POLICIES).map((policy) => JSON.parse(JSON.stringify(policy)));
}

function boost(weights, key, delta) {
  const current = Number(weights[key] ?? 0);
  weights[key] = clamp(Number((current + delta).toFixed(3)), 0, 3);
}

function adjustWorkerPolicy(policy, context, world) {
  const dominant = String(context?.dominantState ?? "");
  const avgHunger = Number(context?.avgHunger ?? 0.5);
  const food = Number(world?.resources?.food ?? 0);
  const carrying = Number(context?.carrying ?? 0);

  if (food < 20 || avgHunger < 0.34 || dominant === "seek_food" || dominant === "eat") {
    boost(policy.intentWeights, "eat", 0.7);
    boost(policy.intentWeights, "deliver", 0.35);
    boost(policy.intentWeights, "farm", -0.2);
  }
  if (carrying > Math.max(4, Number(context?.count ?? 0) * 0.5)) {
    boost(policy.intentWeights, "deliver", 0.6);
  } else {
    boost(policy.intentWeights, "deliver", -0.25);
  }
  if (dominant === "wander" || dominant === "idle") {
    boost(policy.intentWeights, "farm", 0.25);
    boost(policy.intentWeights, "wood", 0.2);
    boost(policy.intentWeights, "wander", -0.2);
  }
}

function adjustTraderPolicy(policy, context, world) {
  const dominant = String(context?.dominantState ?? "");
  const avgHunger = Number(context?.avgHunger ?? 0.5);
  const threatSignals = Number(world?.events?.length ?? 0);

  if (avgHunger < 0.35 || dominant === "seek_food" || dominant === "eat") {
    boost(policy.intentWeights, "eat", 0.6);
    boost(policy.intentWeights, "trade", -0.25);
  }
  if (dominant === "seek_trade" || dominant === "trade") {
    boost(policy.intentWeights, "trade", 0.45);
    boost(policy.intentWeights, "wander", -0.2);
  }
  if (threatSignals > 0) {
    policy.ttlSec = clamp(policy.ttlSec - 4, 8, 60);
  }
}

function adjustSaboteurPolicy(policy, context) {
  const dominant = String(context?.dominantState ?? "");
  const avgHunger = Number(context?.avgHunger ?? 0.5);

  if (avgHunger < 0.35 || dominant === "seek_food" || dominant === "eat") {
    boost(policy.intentWeights, "evade", 0.35);
    boost(policy.intentWeights, "sabotage", -0.3);
  }
  if (dominant === "evade") {
    boost(policy.intentWeights, "evade", 0.45);
    boost(policy.intentWeights, "scout", 0.2);
  }
  if (dominant === "scout" || dominant === "sabotage") {
    boost(policy.intentWeights, "sabotage", 0.4);
  }
}

function adjustHerbivorePolicy(policy, context) {
  const dominant = String(context?.dominantState ?? "");
  if (dominant === "flee") {
    boost(policy.intentWeights, "flee", 0.55);
    boost(policy.intentWeights, "graze", -0.2);
  }
  if (dominant === "regroup") {
    boost(policy.intentWeights, "migrate", 0.25);
  }
  if (dominant === "graze") {
    boost(policy.intentWeights, "graze", 0.35);
  }
}

function adjustPredatorPolicy(policy, context, world) {
  const dominant = String(context?.dominantState ?? "");
  const herbivores = Number(world?.population?.herbivores ?? 0);
  if (dominant === "rest") {
    boost(policy.intentWeights, "stalk", 0.3);
    boost(policy.intentWeights, "hunt", 0.3);
  }
  if (dominant === "hunt" || dominant === "stalk") {
    boost(policy.intentWeights, "hunt", 0.45);
  }
  if (herbivores <= 0) {
    boost(policy.intentWeights, "wander", 0.4);
    boost(policy.intentWeights, "hunt", -0.5);
  }
}

function applyStateAwareTemplate(policy, summary) {
  const context = summary?.stateTransitions?.groups?.[policy.groupId] ?? null;
  const world = summary?.world ?? {};

  if (!context) return policy;

  if (policy.groupId === "workers") adjustWorkerPolicy(policy, context, world);
  else if (policy.groupId === "traders") adjustTraderPolicy(policy, context, world);
  else if (policy.groupId === "saboteurs") adjustSaboteurPolicy(policy, context, world);
  else if (policy.groupId === "herbivores") adjustHerbivorePolicy(policy, context);
  else if (policy.groupId === "predators") adjustPredatorPolicy(policy, context, world);

  policy.ttlSec = clamp(Number(policy.ttlSec) || 24, 8, 60);
  policy.riskTolerance = clamp(Number(policy.riskTolerance) || 0.5, 0, 1);
  return policy;
}

function parsePreferredPath(pathText) {
  return String(pathText ?? "")
    .split("->")
    .map((part) => part.trim())
    .filter(Boolean);
}

function pickStateTargetForGroup(groupId, summary) {
  const context = summary?.stateTransitions?.groups?.[groupId] ?? null;
  if (!context) return null;

  const nodes = Array.isArray(context.stateNodes) ? [...context.stateNodes] : [];
  if (nodes.length === 0 && Array.isArray(context.transitions)) {
    for (const edge of context.transitions) {
      const from = String(edge?.from ?? "").trim();
      const to = String(edge?.to ?? "").trim();
      if (from && !nodes.includes(from)) nodes.push(from);
      if (to && !nodes.includes(to)) nodes.push(to);
    }
  }
  const dominant = String(context.dominantState ?? nodes[0] ?? "idle");
  if (nodes.length === 0) {
    if (dominant) nodes.push(dominant);
    const preferredPaths = Array.isArray(context.preferredPaths) ? context.preferredPaths : [];
    for (const pathText of preferredPaths.slice(0, 2)) {
      for (const state of parsePreferredPath(pathText)) {
        if (!nodes.includes(state)) nodes.push(state);
      }
    }
  }
  if (nodes.length === 0) return null;

  const preferredPaths = Array.isArray(context.preferredPaths) ? context.preferredPaths : [];
  let targetState = dominant;

  if (preferredPaths.length > 0) {
    const states = parsePreferredPath(preferredPaths[0]);
    if (states.length > 0) {
      const first = states[0];
      const second = states[1];
      if (first === dominant && second && nodes.includes(second)) {
        targetState = second;
      } else if (nodes.includes(first)) {
        targetState = first;
      }
    }
  }

  if (!nodes.includes(targetState)) {
    targetState = nodes.includes(dominant) ? dominant : nodes[0];
  }

  const avgHunger = Number(context.avgHunger ?? 0.5);
  const basePriority = 0.45 + Math.max(0, Math.min(0.35, (0.5 - avgHunger) * 0.7));
  const priority = clamp(Number(basePriority.toFixed(3)), 0.2, 0.9);
  const ttlSec = clamp(Math.round(14 + Number(context.count ?? 0) * 0.2), 8, 28);

  return {
    groupId,
    targetState,
    priority,
    ttlSec,
    reason: `state-template:${dominant}`,
  };
}

function isFallbackTargetFeasible(groupId, targetState, summary, context) {
  const world = summary?.world ?? {};
  const resources = world.resources ?? {};
  const buildings = world.buildings ?? {};
  const population = world.population ?? {};
  const carrying = Number(context?.carrying ?? 0);
  const count = Number(context?.count ?? 0);

  if (groupId === "workers") {
    if (targetState === "deliver") {
      const minCarry = Math.max(1, count * 0.15);
      return Number(buildings.warehouses ?? 0) > 0 && carrying >= minCarry;
    }
    if (targetState === "seek_food" || targetState === "eat") {
      return Number(resources.food ?? 0) > 0 && Number(buildings.warehouses ?? 0) > 0;
    }
  }
  if (groupId === "traders" && (targetState === "seek_trade" || targetState === "trade")) {
    return Number(buildings.warehouses ?? 0) > 0;
  }
  if (groupId === "saboteurs" && targetState === "sabotage") {
    return Number(buildings.farms ?? 0) + Number(buildings.lumbers ?? 0) + Number(buildings.warehouses ?? 0) > 0;
  }
  if (groupId === "predators" && (targetState === "hunt" || targetState === "feed")) {
    return Number(population.herbivores ?? 0) > 0;
  }
  if (groupId === "herbivores" && targetState === "flee") {
    return Number(population.predators ?? 0) > 0;
  }
  return true;
}

function fallbackTargetForGroup(groupId) {
  if (groupId === "workers") return "seek_task";
  if (groupId === "traders") return "seek_trade";
  if (groupId === "saboteurs") return "scout";
  if (groupId === "herbivores") return "graze";
  if (groupId === "predators") return "stalk";
  return "idle";
}

function buildFallbackStateTargets(policies, summary) {
  const targets = [];
  const seen = new Set();
  for (const policy of policies) {
    const groupId = String(policy.groupId ?? "").trim();
    if (!groupId || seen.has(groupId)) continue;
    seen.add(groupId);
    const context = summary?.stateTransitions?.groups?.[groupId] ?? {};
    const target = pickStateTargetForGroup(groupId, summary);
    if (!target) continue;
    if (isFallbackTargetFeasible(groupId, target.targetState, summary, context)) {
      targets.push(target);
      continue;
    }
    targets.push({
      ...target,
      targetState: fallbackTargetForGroup(groupId),
      priority: Math.min(Number(target.priority ?? 0.5), 0.55),
      reason: `fallback-feasible:${fallbackTargetForGroup(groupId)}`,
    });
  }
  return targets;
}

export function buildEnvironmentFallback(summary) {
  const lowFood = summary.resources.food < 18;
  const congestionHigh = summary.traffic.congestion > 0.58;
  const stabilitySignal = Number(summary.resources.food ?? 0) * 0.41
    + Number(summary.resources.wood ?? 0) * 0.19
    + Number(summary.traffic.congestion ?? 0) * 100 * 0.27;

  if (lowFood) {
    return {
      weather: WEATHER.CLEAR,
      durationSec: 18,
      factionTension: 0.45,
      eventSpawns: [{ type: EVENT_TYPE.TRADE_CARAVAN, intensity: 1.2, durationSec: 16 }],
    };
  }

  if (congestionHigh) {
    return {
      weather: WEATHER.RAIN,
      durationSec: 14,
      factionTension: 0.6,
      eventSpawns: [{ type: EVENT_TYPE.ANIMAL_MIGRATION, intensity: 1.0, durationSec: 15 }],
    };
  }

  return {
    weather: stabilitySignal % 7 > 4.8 ? WEATHER.STORM : WEATHER.CLEAR,
    durationSec: 16,
    factionTension: 0.55,
    eventSpawns: [{ type: EVENT_TYPE.BANDIT_RAID, intensity: 0.8, durationSec: 12 }],
  };
}

export function buildPolicyFallback(summary) {
  const basePolicies = clonePolicies();
  const policies = basePolicies.map((policy) => applyStateAwareTemplate(policy, summary));
  const stateTargets = buildFallbackStateTargets(policies, summary);
  return { policies, stateTargets };
}
