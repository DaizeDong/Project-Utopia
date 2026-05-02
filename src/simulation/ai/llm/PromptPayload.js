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

  // v0.8.2: soil, node depletion, water connectivity, terrain highlights
  if (Number(world.soil?.criticalSalinized ?? 0) > 0) {
    highlights.push(`SOIL CRISIS: ${world.soil.criticalSalinized} farm(s) critically salinized — need fallow immediately`);
  } else if (Number(world.soil?.salinizedFarmCount ?? 0) > 0) {
    highlights.push(`Soil health: ${world.soil.salinizedFarmCount} farm(s) above 60% salinization`);
  }
  if (Number(world.nodes?.depletedForestCount ?? 0) > 0) {
    highlights.push(`LUMBER CRISIS: ${world.nodes.depletedForestCount} lumber mill(s) on depleted nodes`);
  }
  if (Number(world.nodes?.atRiskNodeCount ?? 0) > 0) {
    highlights.push(`Resource nodes: ${world.nodes.atRiskNodeCount} node(s) below 60% yield capacity`);
  }
  if (Number(world.connectivity?.waterIsolatedResources ?? 0) > 0) {
    const coord = world.connectivity.bridgeCoord;
    const loc = coord ? ` at tile (${coord.ix},${coord.iz})` : "";
    highlights.push(`WATER BARRIER: ${world.connectivity.waterIsolatedResources} resource tile(s) cut off by water — build bridge${loc}`);
  }
  if (Number(world.terrain?.lowMoistureRatio ?? 0) > 0.4) {
    highlights.push(`Dry terrain: ${Math.round(world.terrain.lowMoistureRatio * 100)}% of land is low-moisture — herb gardens and farms may underperform`);
  }

  // v0.10.1 R5 PC-recruit-flow-rate-gate (PC-1/PC-2): surface the same
  // food-runway number that PopulationGrowthSystem and ColonyPlanner use
  // to refuse recklessly-timed recruits. The LLM otherwise sees only
  // spot food + per-min rates and happily emits `recruit` actions while
  // the colony is bleeding food — reviewer's PC log captured 3/3 such
  // recruits at drain −12/−24 food/s. With this line the LLM sees the
  // gate's actual number and can self-suppress.
  const headroomSec = Number(world.population?.foodHeadroomSec ?? Infinity);
  if (Number.isFinite(headroomSec) && headroomSec < 9999) {
    if (headroomSec < 30) {
      highlights.push(`FOOD RUNWAY CRITICAL: ${headroomSec.toFixed(0)}s headroom — DO NOT recruit; queue farm/kitchen instead.`);
    } else if (headroomSec < 60) {
      highlights.push(`Food runway low: ${headroomSec.toFixed(0)}s headroom (recruit gate fires below 60s) — defer recruit until production catches up.`);
    } else if (headroomSec < 180) {
      highlights.push(`Food runway: ${headroomSec.toFixed(0)}s headroom — recruit OK but watch drain rate.`);
    }
  }

  // Hotfix iter4 batch D — late-game role-allocation imbalance signal.
  // We can't see per-role counts in the world summary (those live on
  // state.agents and would require a WorldSummary.js change which is
  // out-of-scope for this batch), but we CAN infer extractor saturation
  // from buildings + worker count + resource stability. Surface the
  // signal so all four LLM channels (strategic / colony-planner /
  // npc-brain / environment-director) and the fallback policy adjuster
  // see it.
  const workerCount = Number(world.population?.workers ?? 0);
  const extractionSiteCount =
      Number(world.buildings?.farms ?? 0)
    + Number(world.buildings?.lumbers ?? 0)
    + Number(world.buildings?.quarries ?? 0);
  const processingSiteCount =
      Number(world.buildings?.kitchens ?? 0)
    + Number(world.buildings?.smithies ?? 0)
    + Number(world.buildings?.clinics ?? 0);
  // Hotfix iter5 Gap A — broaden trigger so wood/stone-starved colonies
  // (which never accumulated reserves but DID over-build extraction
  // sites) still see the saturation signal. The original wood>=15 +
  // stone>=8 + food>=30 floor was meant to suppress the highlight on
  // brand-new colonies still bootstrapping. We replace the floor with a
  // softer "non-bootstrap" gate (workers>=10 AND at least one of basic
  // resources flowing OR extraction itself is the imbalance source).
  // Either path produces the same advice: recruit/promote BUILDER/GUARD/
  // COOK/SMITH rather than piling more extractors on top.
  const foodFlow = Number(world.resources?.food ?? 0) >= 8;
  const woodFlow = Number(world.resources?.wood ?? 0) >= 4;
  const stoneFlow = Number(world.resources?.stone ?? 0) >= 2;
  // "Wood-starved AND extraction-still-running" — colonies that can't
  // ever switch to processing because they keep bleeding wood into
  // extractor construction are extractor-saturated by definition.
  const woodStarvedExtractorTreadmill =
    Number(world.resources?.wood ?? 0) < 4 && extractionSiteCount >= 5;
  const nonBootstrap =
    (foodFlow && (woodFlow || stoneFlow))
    || woodStarvedExtractorTreadmill
    || processingSiteCount === 0;
  if (workerCount >= 10 && extractionSiteCount >= 5 && nonBootstrap) {
    const ratio = extractionSiteCount / Math.max(1, extractionSiteCount + processingSiteCount);
    if (ratio > 0.65 || processingSiteCount === 0) {
      highlights.push(
        `Role distribution: extractor-saturated (${workerCount} workers, ${extractionSiteCount} extraction vs ${processingSiteCount} processing sites) — recruit/promote BUILDER, GUARD, COOK/SMITH instead of more farms/lumbers/quarries.`,
      );
    }
  }
  // Threat + low defense signal — even without per-role counts, a high
  // threat reading with no walls and few processing buildings means GUARD
  // promotion + walls/road-defense are higher ROI than extraction.
  const threatLevel = Number(world.gameplay?.threat ?? 0);
  const wallCount = Number(world.buildings?.walls ?? 0);
  if (threatLevel >= 55 && wallCount <= 2 && workerCount >= 8) {
    highlights.push(
      `Defense gap: threat=${threatLevel.toFixed(0)} with only ${wallCount} wall(s) — promote GUARDs and queue defense_line instead of more extraction.`,
    );
  }

  if (highlights.length === 0) {
    highlights.push("World is currently stable; keep policies legible and avoid noisy steering.");
  }
  return highlights.slice(0, 8);
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
