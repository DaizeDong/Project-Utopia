import { BALANCE } from "../../config/balance.js";
import { TILE } from "../../config/constants.js";
import { getTile, listTilesByType } from "../../world/grid/Grid.js";
import { getScenarioRuntime } from "../../world/scenarios/ScenarioFactory.js";

const NETWORK_TILES = new Set([TILE.ROAD, TILE.WAREHOUSE, TILE.LUMBER, TILE.BRIDGE]);
const WORKSITE_TILES = Object.freeze([TILE.FARM, TILE.LUMBER]);

const TARGETS = Object.freeze([
  { key: "warehouses", tool: "warehouse", label: "Anchor stockpile" },
  { key: "farms", tool: "farm", label: "Grow food supply" },
  { key: "lumbers", tool: "lumber", label: "Grow wood supply" },
  { key: "roads", tool: "road", label: "Extend road network" },
  { key: "walls", tool: "wall", label: "Brace defenses" },
]);

function finiteCount(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function tileLabel(tile) {
  return tile && Number.isFinite(Number(tile.ix)) && Number.isFinite(Number(tile.iz))
    ? `(${tile.ix},${tile.iz})`
    : "";
}

function worksiteLabel(tileType) {
  if (tileType === TILE.FARM) return "farm";
  if (tileType === TILE.LUMBER) return "lumber camp";
  return "worksite";
}

function nearestDistance(from, targets) {
  if (!from || !Array.isArray(targets) || targets.length <= 0) return Infinity;
  let best = Infinity;
  for (const target of targets) {
    const d = Math.abs(Number(from.ix) - Number(target.ix)) + Math.abs(Number(from.iz) - Number(target.iz));
    if (Number.isFinite(d) && d < best) best = d;
  }
  return best;
}

function findCoverageWorksite(state, preferredTypes = WORKSITE_TILES) {
  if (!state?.grid) return null;
  const sites = listTilesByType(state.grid, preferredTypes);
  if (!Array.isArray(sites) || sites.length <= 0) return null;
  const warehouses = listTilesByType(state.grid, [TILE.WAREHOUSE]);
  const softRadius = Number(BALANCE.worksiteCoverageSoftRadius ?? 10);
  const hardRadius = Number(BALANCE.worksiteCoverageHardRadius ?? 16);
  let stretched = null;
  for (const site of sites) {
    const depotDistance = nearestDistance(site, warehouses);
    const tileType = getTile(state.grid, site.ix, site.iz);
    const candidate = { ix: site.ix, iz: site.iz, tileType, depotDistance };
    if (!Number.isFinite(depotDistance) || depotDistance > hardRadius) return candidate;
    if (!stretched && depotDistance > softRadius) stretched = candidate;
  }
  return stretched;
}

function advice({ priority = "normal", label, detail, tool = "select", target = null, reason }) {
  return {
    priority,
    label,
    detail,
    tool,
    target,
    reason,
  };
}

function getScenarioContext(runtime) {
  const scenario = runtime?.scenario ?? {};
  const context = runtime?.nextActionContext ?? scenario.nextActionContext ?? {};
  return {
    routeLabel: String(context.routeLabel ?? scenario.routeLinks?.[0]?.label ?? "supply route").trim(),
    depotLabel: String(context.depotLabel ?? scenario.depotZones?.[0]?.label ?? "depot").trim(),
    logisticsTitle: String(context.logisticsTitle ?? scenario.objectiveCopy?.logisticsTitle ?? "Reconnect the logistics loop").trim(),
    logisticsDescription: String(context.logisticsDescription ?? scenario.objectiveCopy?.logisticsDescription ?? "").trim(),
    stockpileTitle: String(context.stockpileTitle ?? scenario.objectiveCopy?.stockpileTitle ?? "Refill the stockpile").trim(),
    stockpileDescription: String(context.stockpileDescription ?? scenario.objectiveCopy?.stockpileDescription ?? "").trim(),
    stabilityTitle: String(context.stabilityTitle ?? scenario.objectiveCopy?.stabilityTitle ?? "Fortify and stabilize").trim(),
    stabilityDescription: String(context.stabilityDescription ?? scenario.objectiveCopy?.stabilityDescription ?? "").trim(),
    hintInitial: String(context.hintInitial ?? scenario.hintCopy?.initial ?? "").trim(),
    hintAfterLogistics: String(context.hintAfterLogistics ?? scenario.hintCopy?.afterLogistics ?? "").trim(),
    hintAfterStockpile: String(context.hintAfterStockpile ?? scenario.hintCopy?.afterStockpile ?? "").trim(),
    hintCompleted: String(context.hintCompleted ?? scenario.hintCopy?.completed ?? "").trim(),
  };
}

function withCauseFields(base, extras = {}) {
  return {
    ...base,
    whyNow: extras.whyNow ?? "",
    expectedOutcome: extras.expectedOutcome ?? "",
    headline: extras.headline ?? "",
  };
}

function findOpenRouteGap(state, route) {
  const gaps = Array.isArray(route?.gapTiles) ? route.gapTiles : [];
  for (const gap of gaps) {
    const tile = getTile(state.grid, gap.ix, gap.iz);
    if (!NETWORK_TILES.has(tile)) return { ix: gap.ix, iz: gap.iz };
  }
  return gaps[0] ? { ix: gaps[0].ix, iz: gaps[0].iz } : null;
}

function getWorksiteCoverageAdvice(state, { crisis = false, preferredTypes = WORKSITE_TILES } = {}) {
  const logistics = state.metrics?.logistics ?? {};
  const isolated = finiteCount(logistics.isolatedWorksites);
  const stretched = finiteCount(logistics.stretchedWorksites);
  const issueCount = isolated > 0 ? isolated : stretched;
  if (issueCount <= 0) return null;

  const target = findCoverageWorksite(state, preferredTypes);
  if (crisis && !target) return null;

  const place = tileLabel(target);
  const site = target ? worksiteLabel(target.tileType) : "worksite";
  const issueKind = isolated > 0 ? "outside depot reach" : "beyond efficient depot reach";
  const label = crisis
    ? `Reconnect ${site}${place ? ` at ${place}` : ""}`
    : `Reconnect ${issueCount} ${isolated > 0 ? "isolated" : "stretched"} worksite${issueCount === 1 ? "" : "s"}`;
  const detail = target
    ? `Place a warehouse or road link near ${place}; this ${site} is ${issueKind}.`
    : "Add a warehouse or road link near the uncovered worksite cluster.";
  return withCauseFields(advice({
    priority: crisis ? "critical" : "high",
    label,
    detail,
    tool: "warehouse",
    target: target ? { ix: target.ix, iz: target.iz } : null,
    reason: crisis ? "food_access_crisis" : "worksite_coverage",
  }), {
    headline: crisis
      ? `Food access gap${place ? ` at ${place}` : ""}`
      : `Reconnect ${issueCount} ${isolated > 0 ? "isolated" : "stretched"} worksite${issueCount === 1 ? "" : "s"}`,
    whyNow: crisis
      ? `Food is critical and a ${site} is ${issueKind}${place ? ` at ${place}` : ""}.`
      : `${issueCount} worksite${issueCount === 1 ? " is" : "s are"} ${issueKind}.`,
    expectedOutcome: crisis
      ? "Reachable farms restore food intake before hunger collapses hauling."
      : "Depot coverage shortens hauls and lets workers deliver output reliably.",
  });
}

function getFoodCrisisAdvice(state) {
  const food = Number(state.resources?.food ?? 0);
  const emptySec = Number(state.metrics?.resourceEmptySec?.food ?? 0);
  const starvationRisk = finiteCount(state.metrics?.starvationRiskCount);
  const emergencyFood = Number(BALANCE.foodEmergencyThreshold ?? 18);
  if (food > emergencyFood && emptySec <= 0 && starvationRisk <= 0) return null;
  const farmAccessAdvice = getWorksiteCoverageAdvice(state, { crisis: true, preferredTypes: [TILE.FARM] });
  if (farmAccessAdvice) return farmAccessAdvice;
  return withCauseFields(advice({
    priority: "critical",
    label: "Stabilize food supply",
    detail: "Place another farm on green terrain or reconnect field access before starvation recovery starts.",
    tool: "farm",
    reason: "food_crisis",
  }), {
    headline: "Food bottleneck",
    whyNow: food <= emergencyFood
      ? `Food is below the emergency line (${food} available, target ${emergencyFood}).`
      : "Food recovery is stalling and starvation risk is rising.",
    expectedOutcome: "More reachable farms keep workers fed and preserve haul capacity.",
  });
}

function getRouteAdvice(state, runtime, context) {
  const route = (runtime.routes ?? []).find((entry) => !entry.connected);
  if (!route) return null;
  const target = findOpenRouteGap(state, route);
  const place = tileLabel(target);
  const routeLabel = String(route.label ?? context.routeLabel ?? "supply route").trim();
  return withCauseFields(advice({
    priority: "high",
    label: `Repair ${routeLabel}`,
    detail: target
      ? `Road at ${place} reconnects ${routeLabel}.`
      : `Road segments reconnect ${routeLabel}.`,
    tool: "road",
    target,
    reason: "route_gap",
  }), {
    headline: `${routeLabel}${place ? ` gap at ${place}` : ""}`,
    whyNow: `The ${routeLabel} is broken${place ? ` at ${place}` : ""}.`,
    expectedOutcome: "Restores the haul line to storage.",
  });
}

function getDepotAdvice(runtime, context) {
  const depot = (runtime.depots ?? []).find((entry) => !entry.ready);
  if (!depot) return null;
  const target = runtime.scenario?.anchors?.[depot.anchor] ?? null;
  const place = tileLabel(target);
  const depotLabel = String(depot.label ?? context.depotLabel ?? "depot").trim();
  return withCauseFields(advice({
    priority: "high",
    label: `Reclaim ${depotLabel}`,
    detail: target
      ? `Warehouse near ${place} reopens ${depotLabel}.`
      : `Warehouse inside the zone reopens ${depotLabel}.`,
    tool: "warehouse",
    target,
    reason: "depot_missing",
  }), {
    headline: `${depotLabel}${place ? ` at ${place}` : ""}`,
    whyNow: `${depotLabel} is still offline.`,
    expectedOutcome: "A warehouse there reopens stockpile coverage and shortens delivery trips.",
  });
}

function getTargetAdvice(runtime, context) {
  const counts = runtime.counts ?? {};
  const targets = runtime.logisticsTargets ?? {};
  for (const entry of TARGETS) {
    const current = finiteCount(counts[entry.key]);
    const target = finiteCount(targets[entry.key]);
    if (target > 0 && current < target) {
      const missing = target - current;
      const plural = missing === 1 ? "" : "s";
      const narrative = entry.key === "warehouses"
        ? `The stockpile still needs ${missing} warehouse${plural}.`
        : entry.key === "farms"
          ? `Food production still needs ${missing} more farm${plural}.`
          : entry.key === "lumbers"
            ? `Wood production still needs ${missing} more lumber site${plural}.`
            : entry.key === "roads"
              ? `The road network still needs ${missing} more segment${plural}.`
              : `Defenses still need ${missing} more wall${plural}.`;
      return withCauseFields(advice({
        priority: "normal",
        label: entry.label,
        detail: `${current}/${target} ${entry.key} built. ${narrative}`,
        tool: entry.tool,
        reason: `target_${entry.key}`,
      }), {
        headline: `${entry.label} target`,
        whyNow: narrative,
        expectedOutcome: `Completes the ${entry.key} target and unlocks the next layer of the scenario.`,
      });
    }
  }
  return null;
}

export function getNextActionAdvice(state) {
  if (!state || !state.grid) {
    return withCauseFields(advice({
      priority: "idle",
      label: "Start a run",
      detail: "Start a colony to receive a live next action.",
      reason: "missing_state",
    }), {
      headline: "No active colony",
      whyNow: "There is no live colony to analyze yet.",
      expectedOutcome: "Start a run to unlock the next action loop.",
    });
  }

  if ((state.session?.phase ?? "active") !== "active") {
    return withCauseFields(advice({
      priority: "idle",
      label: "Start a run",
      detail: "Start the colony to receive live next actions.",
      reason: "session_inactive",
    }), {
      headline: "Menu state",
      whyNow: "The colony is not in an active simulation phase.",
      expectedOutcome: "Start the colony to resume live guidance.",
    });
  }

  const runtime = getScenarioRuntime(state);
  const context = getScenarioContext(runtime);
  // v0.8.2 Round-7 01b: no-farms emergency rule — highest priority when colony
  // has no farms and is already running low on food.
  if (
    Number(state.resources?.food ?? 0) < 80
    && (Number(state.buildings?.farms ?? 0)) === 0
    && (Number(state.metrics?.timeSec ?? 0)) > 10
  ) {
    return withCauseFields(advice({
      priority: "critical",
      label: "No farms — place a Farm on green terrain to feed your workers.",
      detail: "Without farms food will run out soon. Place a Farm on green terrain.",
      tool: "farm",
      reason: "no_farms_emergency",
    }), {
      headline: "No farms",
      whyNow: "Colony has no farms and food is critically low.",
      expectedOutcome: "A farm will start producing food to keep workers alive.",
    });
  }
  return getFoodCrisisAdvice(state)
    ?? getRouteAdvice(state, runtime, context)
    ?? getDepotAdvice(runtime, context)
    ?? getWorksiteCoverageAdvice(state)
    ?? getTargetAdvice(runtime, context)
    ?? withCauseFields(advice({
      priority: "done",
      label: "Hold and improve",
      detail: "Scenario logistics targets are stable; use build preview to improve throughput.",
      tool: "select",
      reason: "all_clear",
    }), {
      headline: "Scenario stable",
      whyNow: "All required logistics targets are currently satisfied.",
      expectedOutcome: "Use build preview to keep throughput efficient.",
    });
}
