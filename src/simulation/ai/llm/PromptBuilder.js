import { EVENT_TYPE, WEATHER } from "../../../config/constants.js";
import { DEFAULT_GROUP_POLICIES } from "../../../config/aiConfig.js";

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function clonePolicies() {
  return Object.values(DEFAULT_GROUP_POLICIES).map((policy) => JSON.parse(JSON.stringify(policy)));
}

function getWorld(summary) {
  return summary?.world ?? summary ?? {};
}

function getFrontier(summary) {
  return getWorld(summary).frontier ?? {};
}

function getObjective(summary) {
  return getWorld(summary).objective ?? {};
}

function getLogistics(summary) {
  return getWorld(summary).logistics ?? {};
}

function getEcology(summary) {
  return getWorld(summary).ecology ?? {};
}

function getGameplay(summary) {
  return getWorld(summary).gameplay ?? {};
}

function boost(weights, key, delta) {
  const current = Number(weights[key] ?? 0);
  weights[key] = clamp(Number((current + delta).toFixed(3)), 0, 3);
}

function boostTarget(policy, key, delta) {
  const current = Number(policy.targetPriorities?.[key] ?? 0);
  policy.targetPriorities[key] = clamp(Number((current + delta).toFixed(3)), 0, 3);
}

function addNote(notes, text) {
  const clean = String(text ?? "").trim();
  if (!clean || notes.includes(clean)) return;
  notes.push(clean);
}

function buildEnvironmentNotes(summary, weather) {
  const frontier = getFrontier(summary);
  const logistics = getLogistics(summary);
  const gameplay = getGameplay(summary);
  const notes = [];

  if ((frontier.brokenRoutes ?? []).length > 0) {
    addNote(notes, `Keep pressure readable around ${frontier.brokenRoutes[0]} instead of spawning generic world noise.`);
  }
  if ((frontier.unreadyDepots ?? []).length > 0) {
    addNote(notes, `Respect the unreclaimed depot at ${frontier.unreadyDepots[0]} so the player can see why route repair matters.`);
  }
  if (Number(logistics.isolatedWorksites ?? 0) > 0 || Number(logistics.overloadedWarehouses ?? 0) > 0) {
    addNote(notes, "Use weather and events to sharpen logistics consequences, not to replace them.");
  }
  if (Number(gameplay.recovery?.collapseRisk ?? 0) >= 60) {
    addNote(notes, "Recovery risk is already high, so keep the directive survivable.");
  }
  if (weather === WEATHER.STORM) {
    addNote(notes, "Storms should contest routes and depots more than safe interior tiles.");
  }
  return notes.slice(0, 4);
}

function buildEnvironmentDirective(payload, summary, focus) {
  return {
    ...payload,
    focus,
    summary: `Pressure ${focus} for ${payload.durationSec.toFixed(0)}s while keeping the scenario legible.`,
    steeringNotes: buildEnvironmentNotes(summary, payload.weather),
  };
}

function describeWorkerFocus(summary, notes) {
  const objective = getObjective(summary);
  const frontier = getFrontier(summary);
  const logistics = getLogistics(summary);
  if ((frontier.brokenRoutes ?? []).length > 0 || (frontier.unreadyDepots ?? []).length > 0) {
    return "route repair and depot relief";
  }
  if (Number(logistics.overloadedWarehouses ?? 0) > 0 || Number(logistics.strandedCarryWorkers ?? 0) > 0) {
    return "cargo relief";
  }
  if (objective.id === "stockpile-1") {
    return "stockpile throughput";
  }
  if (notes.some((note) => /weather|bandit|pressure/i.test(note))) {
    return "safe frontier throughput";
  }
  return "frontier buildout";
}

function describeTraderFocus(summary) {
  const frontier = getFrontier(summary);
  const gameplay = getGameplay(summary);
  if ((frontier.readyDepots ?? []).length > 0 && Number(gameplay.threat ?? 0) < 52) return "forward depot trade";
  if ((frontier.unreadyDepots ?? []).length > 0) return "defended warehouse lanes";
  return "warehouse circulation";
}

function describeSaboteurFocus(summary) {
  const frontier = getFrontier(summary);
  if ((frontier.brokenRoutes ?? []).length > 0) return "soft frontier corridor hits";
  if ((frontier.unreadyDepots ?? []).length > 0) return "depot disruption";
  return "economic harassment";
}

function describeHerbivoreFocus(summary) {
  const ecology = getEcology(summary);
  if (Number(ecology.pressuredFarms ?? 0) > 0) return "farm-edge grazing";
  if (Number(ecology.frontierPredators ?? 0) > 0) return "habitat safety";
  return "wildlife grazing";
}

function describePredatorFocus(summary) {
  const ecology = getEcology(summary);
  if (Number(ecology.pressuredFarms ?? 0) > 0) return "farm hotspot patrol";
  if (Number(ecology.migrationHerds ?? 0) > 0) return "migration interception";
  return "isolated prey patrol";
}

function adjustWorkerPolicy(policy, context, summary) {
  const world = getWorld(summary);
  const objective = getObjective(summary);
  const frontier = getFrontier(summary);
  const logistics = getLogistics(summary);
  const gameplay = getGameplay(summary);
  const dominant = String(context?.dominantState ?? "");
  const avgHunger = Number(context?.avgHunger ?? 0.5);
  const food = Number(world?.resources?.food ?? 0);
  const wood = Number(world?.resources?.wood ?? 0);
  const carrying = Number(context?.carrying ?? 0);
  const notes = [];

  // Food scarcity — two tiers
  if (food < 8 || avgHunger < 0.25) {
    // Critical: eat immediately, deliver what you have
    boost(policy.intentWeights, "eat", 0.9);
    boost(policy.intentWeights, "deliver", 0.5);
    boostTarget(policy, "warehouse", 0.25);
    addNote(notes, "Food critical: workers must eat and deliver reserves first.");
  } else if (food < 25 || avgHunger < 0.4 || dominant === "seek_food" || dominant === "eat") {
    // Low: boost BOTH farm AND eat (produce more food while staying alive)
    boost(policy.intentWeights, "eat", 0.4);
    boost(policy.intentWeights, "farm", 0.35);
    boost(policy.intentWeights, "deliver", 0.2);
    addNote(notes, "Food is low: balance eating with increased farm output.");
  }
  if (carrying > Math.max(4, Number(context?.count ?? 0) * 0.5)) {
    boost(policy.intentWeights, "deliver", 0.6);
    boostTarget(policy, "warehouse", 0.32);
    boostTarget(policy, "depot", 0.22);
    addNote(notes, "Cargo is accumulating; delivery should outrank more harvesting.");
  } else {
    boost(policy.intentWeights, "deliver", -0.25);
  }
  if (dominant === "wander" || dominant === "idle") {
    boost(policy.intentWeights, "farm", 0.25);
    boost(policy.intentWeights, "wood", 0.2);
    boost(policy.intentWeights, "wander", -0.2);
    addNote(notes, "Workers are drifting; bias back toward active worksites.");
  }

  if ((frontier.brokenRoutes ?? []).length > 0 || (frontier.unreadyDepots ?? []).length > 0) {
    boost(policy.intentWeights, "deliver", 0.35);
    boostTarget(policy, "road", 0.35);
    boostTarget(policy, "depot", 0.35);
    boostTarget(policy, "frontier", 0.2);
    policy.ttlSec = clamp(policy.ttlSec - 4, 8, 60);
    addNote(notes, "Broken routes mean workers should favor sites that reconnect or shorten logistics.");
  }
  if (Number(logistics.overloadedWarehouses ?? 0) > 0 || Number(logistics.strandedCarryWorkers ?? 0) > 0) {
    boost(policy.intentWeights, "deliver", 0.45);
    boostTarget(policy, "warehouse", 0.24);
    boostTarget(policy, "safety", 0.16);
    policy.riskTolerance = clamp(policy.riskTolerance - 0.05, 0, 1);
    addNote(notes, "Depot congestion is real, so steering should reduce cargo stalls instead of amplifying them.");
  }
  if (objective.id === "stockpile-1") {
    if (food <= wood) {
      boost(policy.intentWeights, "farm", 0.25);
      boostTarget(policy, "farm", 0.2);
      addNote(notes, "The current objective needs food first, so farm pressure should lead wood pressure.");
    } else {
      boost(policy.intentWeights, "wood", 0.25);
      boostTarget(policy, "lumber", 0.2);
      addNote(notes, "The current objective needs wood support more than extra food.");
    }
  }
  if (objective.id === "stability-1" || Number(gameplay.threat ?? 0) >= 56 || Number(world.spatialPressure?.eventPressure ?? 0) > 1.05) {
    boostTarget(policy, "safety", 0.24);
    addNote(notes, "Threat is elevated, so prefer safer paths and work clusters.");
  }

  // Predator awareness
  const predators = Number(world?.population?.predators ?? 0);
  if (predators >= 3) {
    policy.riskTolerance = clamp(policy.riskTolerance - 0.1, 0, 1);
    boostTarget(policy, "safety", 0.2);
    boostTarget(policy, "warehouse", 0.15);
    addNote(notes, "Multiple predators present: workers should avoid exposed positions.");
  }

  // Population-aware adjustments
  const workerCount = Number(context?.count ?? 0);
  if (workerCount <= 5) {
    // Small crew: be conservative, focus on essentials
    policy.riskTolerance = clamp(policy.riskTolerance - 0.08, 0, 1);
    boost(policy.intentWeights, "eat", 0.2);
    boost(policy.intentWeights, "farm", 0.15);
    addNote(notes, "Skeleton crew: every worker matters, minimize risk.");
  } else if (workerCount >= 16) {
    // Large crew: diversify and build
    boost(policy.intentWeights, "wood", 0.15);
    boost(policy.intentWeights, "build", 0.2);
    boost(policy.intentWeights, "deliver", 0.15);
    addNote(notes, "Large workforce: diversify into wood and building.");
  }

  policy.focus = describeWorkerFocus(summary, notes);
  policy.summary = `Workers should sustain ${policy.focus} while keeping hunger and carried cargo from overriding the map's intended reroute pressure.`;
  policy.steeringNotes = notes.slice(0, 4);
}

function adjustTraderPolicy(policy, context, summary) {
  const world = getWorld(summary);
  const frontier = getFrontier(summary);
  const dominant = String(context?.dominantState ?? "");
  const avgHunger = Number(context?.avgHunger ?? 0.5);
  const threatSignals = Number(world?.events?.length ?? 0);
  const notes = [];

  if (avgHunger < 0.35 || dominant === "seek_food" || dominant === "eat") {
    boost(policy.intentWeights, "eat", 0.6);
    boost(policy.intentWeights, "trade", -0.25);
    boostTarget(policy, "warehouse", 0.18);
    addNote(notes, "Hungry traders should still route through food-safe warehouses.");
  }
  if (dominant === "seek_trade" || dominant === "trade") {
    boost(policy.intentWeights, "trade", 0.45);
    boost(policy.intentWeights, "wander", -0.2);
  }
  if ((frontier.readyDepots ?? []).length > 0) {
    boostTarget(policy, "depot", 0.32);
    boostTarget(policy, "road", 0.18);
    addNote(notes, "Use reclaimed depots as the anchor for profitable trade runs.");
  }
  if ((frontier.unreadyDepots ?? []).length > 0) {
    boostTarget(policy, "warehouse", 0.18);
    boostTarget(policy, "safety", 0.16);
    addNote(notes, "When forward depots are still ruined, keep trade closer to defended warehouses.");
  }
  if (threatSignals > 0 || Number(world?.gameplay?.threat ?? 0) > 54) {
    boostTarget(policy, "safety", 0.24);
    policy.ttlSec = clamp(policy.ttlSec - 4, 8, 60);
    addNote(notes, "Threat is active, so route choice should favor safer lanes.");
  }

  policy.focus = describeTraderFocus(summary);
  policy.summary = `Traders should circulate through ${policy.focus} so route support and warehouse defense matter to the economy.`;
  policy.steeringNotes = notes.slice(0, 4);
}

function adjustSaboteurPolicy(policy, context, summary) {
  const world = getWorld(summary);
  const frontier = getFrontier(summary);
  const dominant = String(context?.dominantState ?? "");
  const avgHunger = Number(context?.avgHunger ?? 0.5);
  const notes = [];

  if (avgHunger < 0.35 || dominant === "seek_food" || dominant === "eat") {
    boost(policy.intentWeights, "evade", 0.35);
    boost(policy.intentWeights, "sabotage", -0.3);
    addNote(notes, "Hungry saboteurs should preserve escape capacity instead of forcing bad sabotage loops.");
  }
  if (dominant === "evade") {
    boost(policy.intentWeights, "evade", 0.45);
    boost(policy.intentWeights, "scout", 0.2);
  }
  if (dominant === "scout" || dominant === "sabotage") {
    boost(policy.intentWeights, "sabotage", 0.4);
  }
  if ((frontier.brokenRoutes ?? []).length > 0) {
    boostTarget(policy, "frontier", 0.3);
    boostTarget(policy, "road", 0.16);
    addNote(notes, "Broken corridors are easier to pressure than stable interiors.");
  }
  if ((frontier.unreadyDepots ?? []).length > 0) {
    boostTarget(policy, "warehouse", 0.2);
    boostTarget(policy, "choke", 0.16);
    addNote(notes, "Exposed depots and gate tiles should matter more than random farms.");
  }
  if (Number(world?.gameplay?.threat ?? 0) > 58) {
    boostTarget(policy, "exit", 0.12);
    policy.riskTolerance = clamp(policy.riskTolerance + 0.04, 0, 1);
  }

  policy.focus = describeSaboteurFocus(summary);
  policy.summary = `Saboteurs should create ${policy.focus} so frontier layout and depot defense remain strategically meaningful.`;
  policy.steeringNotes = notes.slice(0, 4);
}

function adjustHerbivorePolicy(policy, context, summary) {
  const dominant = String(context?.dominantState ?? "");
  const ecology = getEcology(summary);
  const notes = [];
  if (dominant === "flee") {
    boost(policy.intentWeights, "flee", 0.55);
    boost(policy.intentWeights, "graze", -0.2);
    boostTarget(policy, "safety", 0.28);
    addNote(notes, "Predator pressure should keep flee behavior above opportunistic grazing.");
  }
  if (dominant === "regroup") {
    boost(policy.intentWeights, "migrate", 0.25);
    boostTarget(policy, "wildlife", 0.16);
  }
  if (dominant === "graze") {
    boost(policy.intentWeights, "graze", 0.35);
  }
  if (Number(ecology.pressuredFarms ?? 0) > 0) {
    boostTarget(policy, "farm", 0.22);
    addNote(notes, "Existing farm pressure should keep herds near the frontier food edge.");
  }
  if (Number(ecology.frontierPredators ?? 0) > 0) {
    boostTarget(policy, "safety", 0.18);
    boostTarget(policy, "wildlife", 0.12);
  }

  policy.focus = describeHerbivoreFocus(summary);
  policy.summary = `Herbivores should sustain ${policy.focus} so wildlife becomes a readable spatial pressure instead of background motion.`;
  policy.steeringNotes = notes.slice(0, 4);
}

function adjustPredatorPolicy(policy, context, summary) {
  const dominant = String(context?.dominantState ?? "");
  const world = getWorld(summary);
  const ecology = getEcology(summary);
  const herbivores = Number(world?.population?.herbivores ?? 0);
  const notes = [];
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
    addNote(notes, "When no prey are present, patrol pressure should fall back to wildlife edges instead of fake hunting.");
  }
  if (Number(ecology.pressuredFarms ?? 0) > 0) {
    boostTarget(policy, "farm", 0.2);
    addNote(notes, "Farm hotspots should pull patrols only as a secondary prey signal.");
  }
  if (Number(ecology.migrationHerds ?? 0) > 0) {
    boostTarget(policy, "wildlife", 0.18);
    boostTarget(policy, "herbivore", 0.16);
  }

  policy.focus = describePredatorFocus(summary);
  policy.summary = `Predators should maintain ${policy.focus} so prey isolation and habitat edges remain visible gameplay pressures.`;
  policy.steeringNotes = notes.slice(0, 4);
}

function applyStateAwareTemplate(policy, summary) {
  const context = summary?.stateTransitions?.groups?.[policy.groupId] ?? null;
  if (!context) return policy;

  if (policy.groupId === "workers") adjustWorkerPolicy(policy, context, summary);
  else if (policy.groupId === "traders") adjustTraderPolicy(policy, context, summary);
  else if (policy.groupId === "saboteurs") adjustSaboteurPolicy(policy, context, summary);
  else if (policy.groupId === "herbivores") adjustHerbivorePolicy(policy, context, summary);
  else if (policy.groupId === "predators") adjustPredatorPolicy(policy, context, summary);

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

function sanitizeFallbackTargetState(groupId, targetState, context) {
  const carrying = Number(context?.carrying ?? 0);
  const count = Number(context?.count ?? 0);

  if (groupId === "workers") {
    if (targetState === "harvest" || targetState === "eat" || targetState === "seek_food" || targetState === "idle") {
      return carrying >= Math.max(4, count * 0.4) ? "deliver" : "seek_task";
    }
  }

  if (groupId === "traders") {
    if (targetState === "trade" || targetState === "eat" || targetState === "seek_food" || targetState === "idle") {
      return "seek_trade";
    }
  }

  return targetState;
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
      const dominantIndex = states.indexOf(dominant);
      if (dominantIndex >= 0 && states[dominantIndex + 1] && nodes.includes(states[dominantIndex + 1])) {
        targetState = states[dominantIndex + 1];
      } else if (nodes.includes(first)) {
        targetState = first;
      }
    }
  }

  if (!nodes.includes(targetState)) {
    targetState = nodes.includes(dominant) ? dominant : nodes[0];
  }
  targetState = sanitizeFallbackTargetState(groupId, targetState, context);

  const avgHunger = Number(context.avgHunger ?? 0.5);
  const frontierPenalty = Math.max(0, Number(getFrontier(summary).brokenRouteCount ?? 0) * 0.06);
  const basePriority = 0.45 + Math.max(0, Math.min(0.35, (0.5 - avgHunger) * 0.7)) + frontierPenalty;
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
  const world = getWorld(summary);
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
  const world = getWorld(summary);
  const gameplay = getGameplay(summary);
  const lowFood = Number(world.resources?.food ?? 0) < 18;
  const collapseRisk = Number(gameplay.recovery?.collapseRisk ?? 0);
  const prosperity = Number(gameplay.prosperity ?? 50);
  const threat = Number(gameplay.threat ?? 25);

  // 1. Colony in crisis: calm everything, send help
  if (lowFood || collapseRisk >= 65) {
    return buildEnvironmentDirective({
      weather: WEATHER.CLEAR,
      durationSec: 25,
      factionTension: 0.3,
      eventSpawns: [{ type: EVENT_TYPE.TRADE_CARAVAN, intensity: 1.2, durationSec: 16 }],
    }, summary, "recovery lane");
  }

  // 2. Colony struggling (prosperity < 55 or threat > 60): calm, no pressure
  if (prosperity < 55 || threat > 60) {
    return buildEnvironmentDirective({
      weather: WEATHER.CLEAR,
      durationSec: 22,
      factionTension: 0.35,
      eventSpawns: [],
    }, summary, "stabilization");
  }

  // 2b. High predator count: clear weather, calm conditions to reduce death rate
  const predatorCount = Number(world.population?.predators ?? 0);
  if (predatorCount >= 3 && prosperity < 60) {
    return buildEnvironmentDirective({
      weather: WEATHER.CLEAR,
      durationSec: 22,
      factionTension: 0.3,
      eventSpawns: [],
    }, summary, "predator mitigation");
  }

  // 3. Colony thriving (prosperity >= 70 and threat <= 25): apply light challenge
  if (prosperity >= 70 && threat <= 25) {
    return buildEnvironmentDirective({
      weather: WEATHER.RAIN,
      durationSec: 16,
      factionTension: 0.55,
      eventSpawns: [{ type: EVENT_TYPE.ANIMAL_MIGRATION, intensity: 0.5, durationSec: 12 }],
    }, summary, "light challenge");
  }

  // 4. Default stable: clear weather, optional mild event
  return buildEnvironmentDirective({
    weather: WEATHER.CLEAR,
    durationSec: 20,
    factionTension: 0.4,
    eventSpawns: prosperity >= 55
      ? [{ type: EVENT_TYPE.TRADE_CARAVAN, intensity: 0.8, durationSec: 12 }]
      : [],
  }, summary, "steady state");
}

function applyStrategyToPolicy(policy, strategy) {
  if (policy.groupId !== "workers") return;

  // Resource focus
  if (strategy.workerFocus === "farm" || strategy.resourceFocus === "food") {
    policy.intentWeights.farm = Math.max(policy.intentWeights.farm, 1.6);
    policy.intentWeights.wood = Math.min(policy.intentWeights.wood, 0.6);
    if (policy.notes) addNote(policy.notes, "Strategy: food focus prioritized.");
  } else if (strategy.workerFocus === "wood" || strategy.resourceFocus === "wood") {
    policy.intentWeights.wood = Math.max(policy.intentWeights.wood, 1.6);
    policy.intentWeights.farm = Math.min(policy.intentWeights.farm, 0.6);
    if (policy.notes) addNote(policy.notes, "Strategy: wood focus prioritized.");
  } else if (strategy.workerFocus === "deliver") {
    policy.intentWeights.deliver = Math.max(policy.intentWeights.deliver ?? 1.0, 1.6);
    if (policy.notes) addNote(policy.notes, "Strategy: delivery focus prioritized.");
  }

  // Survival mode
  if (strategy.priority === "survive") {
    policy.riskTolerance = Math.min(policy.riskTolerance, 0.25);
    policy.intentWeights.eat = Math.max(policy.intentWeights.eat, 1.8);
    if (policy.notes) addNote(policy.notes, "Strategy: survival mode active.");
  }

  // Defense mode
  if (strategy.priority === "defend" || strategy.defensePosture === "defensive") {
    policy.riskTolerance = Math.min(policy.riskTolerance, 0.3);
    if (policy.notes) addNote(policy.notes, "Strategy: defensive posture.");
  }
}

export function buildPolicyFallback(summary) {
  const basePolicies = clonePolicies();
  const policies = basePolicies.map((policy) => applyStateAwareTemplate(policy, summary));

  // Apply strategy context if available
  const strategy = getWorld(summary)._strategyContext ?? null;
  if (strategy) {
    for (const policy of policies) {
      applyStrategyToPolicy(policy, strategy);
    }
  }

  const stateTargets = buildFallbackStateTargets(policies, summary);
  return { policies, stateTargets };
}
