import {
  GROUP_IDS,
  GROUP_POLICY_CONTRACTS,
  listAllowedPolicyIntents,
  listAllowedTargetPriorities,
} from "../../../config/aiConfig.js";
import { EVENT_TYPE, WEATHER } from "../../../config/constants.js";

const POLICY_GROUP_ORDER = Object.freeze([
  GROUP_IDS.WORKERS,
  GROUP_IDS.TRADERS,
  GROUP_IDS.SABOTEURS,
  GROUP_IDS.HERBIVORES,
  GROUP_IDS.PREDATORS,
]);

function pickHighlights(summary) {
  const world = summary?.world ?? {};
  const objective = world.objective ?? {};
  const gameplay = world.gameplay ?? {};
  const frontier = world.frontier ?? {};
  const logistics = world.logistics ?? {};
  const ecology = world.ecology ?? {};
  const events = Array.isArray(world.events) ? world.events : [];
  const highlights = [];

  if (world.scenario?.title) {
    highlights.push(`Scenario ${world.scenario.title}: ${world.scenario.summary || world.scenario.family || "no summary"}`);
  }
  if (objective.title) {
    highlights.push(`Objective ${objective.title} at ${Number(objective.progress ?? 0).toFixed(0)}%: ${objective.hint || objective.description || "no hint"}`);
  }
  if ((frontier.brokenRoutes ?? []).length > 0) {
    highlights.push(`Broken routes: ${frontier.brokenRoutes.join(", ")}`);
  }
  if ((frontier.unreadyDepots ?? []).length > 0) {
    highlights.push(`Unready depots: ${frontier.unreadyDepots.join(", ")}`);
  }
  if (Number(logistics.isolatedWorksites ?? 0) > 0 || Number(logistics.overloadedWarehouses ?? 0) > 0) {
    highlights.push(`Logistics pressure: isolated=${logistics.isolatedWorksites ?? 0}, overloaded=${logistics.overloadedWarehouses ?? 0}, stranded=${logistics.strandedCarryWorkers ?? 0}`);
  }
  if (Number(ecology.pressuredFarms ?? 0) > 0 || Number(ecology.frontierPredators ?? 0) > 0) {
    highlights.push(`Ecology pressure: farms=${ecology.pressuredFarms ?? 0}, frontier predators=${ecology.frontierPredators ?? 0}, max pressure=${Number(ecology.maxFarmPressure ?? 0).toFixed(2)}`);
  }
  if (events.length > 0) {
    const lead = events[0];
    highlights.push(`Active pressure: ${lead.type} on ${lead.targetLabel || "frontier"} severity=${lead.severity || "-"} pressure=${Number(lead.pressure ?? 0).toFixed(2)}`);
  }
  if (Number(gameplay.recovery?.collapseRisk ?? 0) >= 40) {
    highlights.push(`Recovery risk ${Number(gameplay.recovery.collapseRisk).toFixed(0)}% with ${Number(gameplay.recovery.charges ?? 0)} charges left`);
  }
  if (highlights.length === 0) {
    highlights.push("World is currently stable; keep policies legible and avoid noisy steering.");
  }
  return highlights.slice(0, 6);
}

function buildGroupContracts() {
  const out = {};
  for (const groupId of POLICY_GROUP_ORDER) {
    out[groupId] = {
      allowedIntents: listAllowedPolicyIntents(groupId),
      allowedTargets: listAllowedTargetPriorities(groupId),
      focusHint: GROUP_POLICY_CONTRACTS[groupId]?.focusHint ?? "",
    };
  }
  return out;
}

export function buildEnvironmentPromptUserContent(summary) {
  const payload = {
    channel: "environment-director",
    summary,
    operationalHighlights: pickHighlights(summary),
    allowedWeather: Object.values(WEATHER),
    allowedEvents: Object.values(EVENT_TYPE),
    explanationFields: ["summary", "focus", "steeringNotes"],
    hardRules: [
      "Shape short-horizon pressure around the current scenario and objective instead of random global chaos.",
      "Prefer spatially legible weather and events that reinforce route gaps, depots, chokepoints, and wildlife zones already present in summary.world.frontier and scenario data.",
      "If resources or recovery are fragile, lower pressure rather than escalating.",
    ],
    constraint: "Return strict JSON only. No markdown. No prose outside the JSON fields.",
  };
  if (summary._strategyContext) payload.strategyContext = summary._strategyContext;
  if (summary._memoryContext) payload.recentMemory = summary._memoryContext;
  return JSON.stringify(payload, null, 2);
}

export function buildPolicyPromptUserContent(summary) {
  const payload = {
    channel: "npc-policy",
    summary,
    operationalHighlights: pickHighlights(summary),
    groupContracts: buildGroupContracts(),
    explanationFields: ["summary", "focus", "steeringNotes"],
    hardRules: [
      "Use only the allowed intentWeights and targetPriorities keys listed for each group.",
      "Preserve local feasibility: workers must still deliver carried cargo, hunger-safe states outrank cosmetic steering, and wildlife safety should remain plausible.",
      "Prefer a small number of strong priorities over flat noisy weights.",
      "State targets should reinforce the current route/depot/objective pressure, not contradict it.",
    ],
    constraint: "Return strict JSON only. No markdown. No prose outside the JSON fields.",
  };
  if (summary._strategyContext) payload.strategyContext = summary._strategyContext;
  if (summary._memoryContext) payload.recentMemory = summary._memoryContext;
  return JSON.stringify(payload, null, 2);
}
