import { BALANCE } from "../../config/balance.js";
import { EVENT_TYPE, WEATHER } from "../../config/constants.js";
import { worldToTile } from "../../world/grid/Grid.js";
import { getScenarioRuntime } from "../../world/scenarios/ScenarioFactory.js";

function tileKey(ix, iz) {
  return `${ix},${iz}`;
}

function roundMetric(value, digits = 2) {
  return Number(Number(value ?? 0).toFixed(digits));
}

function findActiveEventZones(state, ix, iz) {
  const key = tileKey(ix, iz);
  return state.events.active
    .map((event) => {
      const targetTiles = Array.isArray(event.payload?.targetTiles) ? event.payload.targetTiles : [];
      const targeted = targetTiles.some((tile) => tileKey(tile.ix, tile.iz) === key);
      const impacted = event.payload?.impactTile
        && tileKey(event.payload.impactTile.ix, event.payload.impactTile.iz) === key;
      if (!targeted && !impacted) return null;
      return {
        type: event.type,
        status: event.status,
        targetLabel: event.payload?.targetLabel ?? "-",
        pressure: Number(event.payload?.pressure ?? 0),
        severity: event.payload?.severity ?? "",
        contestedTiles: Number(event.payload?.contestedTiles ?? 0),
        impacted,
      };
    })
    .filter(Boolean);
}

function summarizeEvent(event) {
  const targetLabel = event.payload?.targetLabel ?? event.targetLabel ?? "";
  const impactTile = event.payload?.impactTile ?? event.impactTile ?? null;
  const secondaryImpactTile = event.payload?.secondaryImpactTile ?? event.secondaryImpactTile ?? null;
  const pressure = Number(event.payload?.pressure ?? event.pressure ?? 0);
  const severity = String(event.payload?.severity ?? event.severity ?? "").trim();
  const contestedTiles = Number(event.payload?.contestedTiles ?? event.contestedTiles ?? 0);
  const weatherOverlap = Number(event.payload?.hazardOverlapTiles ?? event.hazardOverlapTiles ?? 0);
  const target = targetLabel ? ` @ ${targetLabel}` : "";
  const impact = impactTile ? ` impact (${impactTile.ix},${impactTile.iz})` : "";
  const secondaryImpact = secondaryImpactTile ? ` secondary (${secondaryImpactTile.ix},${secondaryImpactTile.iz})` : "";
  const pressureText = pressure > 0 ? ` ${severity ? `${severity} ` : ""}pressure ${roundMetric(pressure, 2).toFixed(2)}` : "";
  const overlapText = weatherOverlap > 0 ? ` weather overlap ${weatherOverlap}` : "";
  const contestedText = contestedTiles > 0 ? ` contested ${contestedTiles}` : "";
  if (event.type === EVENT_TYPE.BANDIT_RAID) return `bandit raid ${event.status}${target}${pressureText}${overlapText}${contestedText}${impact}${secondaryImpact}`;
  if (event.type === EVENT_TYPE.TRADE_CARAVAN) return `trade caravan ${event.status}${target}${pressureText}${overlapText}${contestedText}`;
  if (event.type === EVENT_TYPE.ANIMAL_MIGRATION) return `animal migration ${event.status}${target}${pressureText}${overlapText}${contestedText}`;
  return `${event.type}:${event.status}${target}${pressureText}${overlapText}${contestedText}${impact}`;
}

export function getFrontierStatus(state) {
  const runtime = getScenarioRuntime(state);
  const routesSummary = runtime.routes.length > 0
    ? `${runtime.connectedRoutes}/${runtime.routes.length} routes online`
    : "no route goals";
  const depotsSummary = runtime.depots.length > 0
    ? `${runtime.readyDepots}/${runtime.depots.length} depots reclaimed`
    : "no depot goals";
  return {
    routesOnline: runtime.connectedRoutes,
    depotsReady: runtime.readyDepots,
    routesTotal: runtime.routes.length,
    depotsTotal: runtime.depots.length,
    summary: `${runtime.scenario?.title ?? "Scenario"}: ${routesSummary} | ${depotsSummary} | warehouses ${runtime.counts.warehouses}/${runtime.logisticsTargets.warehouses} | farms ${runtime.counts.farms}/${runtime.logisticsTargets.farms} | lumbers ${runtime.counts.lumbers}/${runtime.logisticsTargets.lumbers} | roads ${runtime.counts.roads}/${runtime.logisticsTargets.roads}${runtime.logisticsTargets.walls > 0 ? ` | walls ${runtime.counts.walls}/${runtime.logisticsTargets.walls}` : ""}`,
  };
}

export function getWeatherInsight(state) {
  const current = state.weather.current ?? WEATHER.CLEAR;
  const hazardCount = Array.isArray(state.weather.hazardTiles) ? state.weather.hazardTiles.length : 0;
  const hazardLabel = state.weather.hazardLabel && state.weather.hazardLabel !== "clear"
    ? state.weather.hazardLabel
    : "";
  const fronts = Array.isArray(state.weather.hazardFronts) ? state.weather.hazardFronts : [];
  const frontSummary = String(state.weather.hazardFocusSummary ?? "").trim();
  const pressureScore = Number(state.weather.pressureScore ?? 0);
  const peakPenalty = fronts.reduce((peak, front) => Math.max(peak, Number(front.peakPenalty ?? 1)), 1);
  if (!hazardLabel || hazardCount === 0) {
    return {
      summary: `${current} (${Math.max(0, Number(state.weather.timeLeftSec ?? 0)).toFixed(0)}s)`,
      hasHazards: false,
    };
  }

  return {
    summary: `${current} (${Math.max(0, Number(state.weather.timeLeftSec ?? 0)).toFixed(0)}s, ${fronts.length} fronts${frontSummary ? ` on ${frontSummary}` : ""}, ${hazardCount} hazard tiles, pressure ${pressureScore.toFixed(2)}, peak x${peakPenalty.toFixed(2)} path cost)`,
    hasHazards: true,
  };
}

export function getEventInsight(state) {
  if ((state.events.active?.length ?? 0) === 0) return "none";
  const events = state.events.active.map((event) => summarizeEvent(event)).join(", ");
  const spatialSummary = String(state.metrics?.spatialPressure?.summary ?? "").trim();
  if (!spatialSummary || spatialSummary === "Spatial pressure: idle") return events;
  return `${events} | ${spatialSummary}`;
}

export function getLogisticsInsight(state) {
  const logistics = state.metrics?.logistics ?? null;
  if (!logistics) return "Logistics: unavailable";
  return logistics.summary ?? "Logistics: unavailable";
}

export function getTrafficInsight(state) {
  const traffic = state.metrics?.traffic ?? null;
  if (!traffic) {
    return { summary: "Traffic: unavailable", hasPressure: false, hasHotspots: false };
  }
  return {
    summary: traffic.summary ?? "Traffic: unavailable",
    hasPressure: Number(traffic.activeLaneCount ?? 0) > 0,
    hasHotspots: Number(traffic.hotspotCount ?? 0) > 0,
  };
}

export function getTileInsight(state, tile) {
  if (!tile) return [];
  const runtime = getScenarioRuntime(state);
  const scenario = runtime.scenario ?? {};
  const anchors = scenario.anchors ?? {};
  const insights = [];
  const eventZones = findActiveEventZones(state, tile.ix, tile.iz);
  const hazardSet = state.weather.hazardTileSet instanceof Set
    ? state.weather.hazardTileSet
    : new Set((state.weather.hazardTiles ?? []).map((entry) => tileKey(entry.ix, entry.iz)));
  const key = tileKey(tile.ix, tile.iz);
  const traffic = state.metrics?.traffic ?? null;
  const ecology = state.metrics?.ecology ?? null;
  const trafficPenalty = Math.max(1, Number(traffic?.penaltyByKey?.[key] ?? 1));
  const trafficLoad = Number(traffic?.loadByKey?.[key] ?? 0);
  const farmPressure = Math.max(0, Number(ecology?.farmPressureByKey?.[key] ?? 0));
  const weatherPenalty = Math.max(1, Number(state.weather?.hazardPenaltyByKey?.[key] ?? state.weather?.hazardPenaltyMultiplier ?? 1));
  const hazardLabels = Array.isArray(state.weather?.hazardLabelByKey?.[key]) ? state.weather.hazardLabelByKey[key] : [];
  const hotspotKeys = new Set((traffic?.hotspotTiles ?? []).map((entry) => tileKey(entry.ix, entry.iz)));

  for (const route of scenario.routeLinks ?? []) {
    if ((route.gapTiles ?? []).some((gap) => gap.ix === tile.ix && gap.iz === tile.iz)) {
      insights.push(`Objective: this broken gap blocks the ${route.label}.`);
    }
  }
  for (const depot of scenario.depotZones ?? []) {
    const anchor = anchors[depot.anchor];
    if (anchor && Math.abs(tile.ix - anchor.ix) + Math.abs(tile.iz - anchor.iz) <= (depot.radius ?? 2)) {
      insights.push(`Objective: build a warehouse near ${depot.label}.`);
    }
  }
  for (const choke of scenario.chokePoints ?? []) {
    const anchor = anchors[choke.anchor];
    if (anchor && Math.abs(tile.ix - anchor.ix) + Math.abs(tile.iz - anchor.iz) <= (choke.radius ?? 2)) {
      insights.push(`Chokepoint: ${choke.label}.`);
    }
  }
  for (const wildlife of scenario.wildlifeZones ?? []) {
    const anchor = anchors[wildlife.anchor];
    if (anchor && Math.abs(tile.ix - anchor.ix) + Math.abs(tile.iz - anchor.iz) <= (wildlife.radius ?? 2)) {
      insights.push(`Wildlife pressure: ${wildlife.label}.`);
      const herbivores = Number(ecology?.herbivoresByZone?.[wildlife.id] ?? 0);
      const predators = Number(ecology?.predatorsByZone?.[wildlife.id] ?? 0);
      if (herbivores > 0 || predators > 0) {
        insights.push(`Ecology: this zone currently holds ${herbivores} herbivores and ${predators} predators.`);
      }
    }
  }
  if (anchors.coreWarehouse && Math.abs(tile.ix - anchors.coreWarehouse.ix) + Math.abs(tile.iz - anchors.coreWarehouse.iz) <= 2) {
    insights.push("Zone: primary logistics core.");
  }
  if (hazardSet.has(key)) {
    const labelSummary = hazardLabels.length > 0 ? hazardLabels.join(", ") : (state.weather.hazardLabel ?? state.weather.current);
    insights.push(`Weather: this tile sits inside ${labelSummary} (${state.weather.current} front, x${weatherPenalty.toFixed(2)} path cost).`);
  }
  if (trafficPenalty > 1.01) {
    if (hotspotKeys.has(key)) {
      insights.push(`Traffic: this lane is overloaded (${trafficLoad.toFixed(1)} load, x${trafficPenalty.toFixed(2)} path cost) and should trigger reroutes.`);
    } else {
      insights.push(`Traffic: nearby crowding spills into this tile (x${trafficPenalty.toFixed(2)} path cost).`);
    }
  }
  if (farmPressure > 0.05) {
    const penaltyPct = Math.round(Math.min(
      Number(BALANCE.ecologyFarmYieldPenaltyMax ?? 0.7),
      farmPressure * Number(BALANCE.ecologyFarmYieldPenaltyPerPressure ?? 0.44),
    ) * 100);
    insights.push(`Ecology: herbivores are stripping this farm lane, cutting yield by about ${penaltyPct}% until the herd is displaced.`);
  }
  for (const zone of eventZones) {
    const impactSuffix = zone.impacted ? " impact point" : " target zone";
    insights.push(`Event: ${summarizeEvent(zone)}${impactSuffix}.`);
  }
  return insights;
}

export function getEntityInsight(state, entity) {
  if (!entity) return [];
  const insights = [];
  const carryTotal = Number(entity.carry?.food ?? 0) + Number(entity.carry?.wood ?? 0);
  const currentTile = worldToTile(entity.x, entity.z, state.grid);
  const targetTile = entity.targetTile ?? null;
  const pathTile = targetTile ?? currentTile;
  const eventZones = findActiveEventZones(state, pathTile.ix, pathTile.iz);
  const hazardSet = state.weather.hazardTileSet instanceof Set
    ? state.weather.hazardTileSet
    : new Set((state.weather.hazardTiles ?? []).map((entry) => tileKey(entry.ix, entry.iz)));
  const traffic = state.metrics?.traffic ?? null;
  const ecology = state.metrics?.ecology ?? null;

  if (entity.type === "WORKER") {
    if ((entity.hunger ?? 1) < 0.14 && state.resources.food > 0 && state.buildings.warehouses > 0) {
      insights.push("Local survival rule is prioritizing food access because hunger is below the worker seek-food threshold.");
    } else if (carryTotal > 0 && state.buildings.warehouses > 0) {
      insights.push(`Local logistics rule sees ${carryTotal.toFixed(2)} carried resources, so delivery should outrank more harvesting.`);
      const carryAgeSec = Number(entity.debug?.carryAgeSec ?? entity.blackboard?.carryAgeSec ?? 0);
      if (carryAgeSec >= 5.5) {
        insights.push(`Carry pressure has been building for ${carryAgeSec.toFixed(1)}s, so the worker is being pushed back toward a depot.`);
      }
    } else if ((entity.role === "FARM" && state.buildings.farms > 0) || (entity.role === "WOOD" && state.buildings.lumbers > 0)) {
      insights.push(`Worker is still in a gather loop because carry is low and a ${String(entity.role).toLowerCase()} worksite exists.`);
    }
    if (targetTile && state.metrics?.logistics?.warehouseLoadByKey) {
      const key = tileKey(targetTile.ix, targetTile.iz);
      const load = Number(state.metrics.logistics.warehouseLoadByKey[key] ?? 0);
      if (load > 1) {
        insights.push(`Target warehouse currently has ${load} inbound workers, so unloading will be slower.`);
      }
    }
    if (targetTile) {
      const key = tileKey(targetTile.ix, targetTile.iz);
      const pressure = Math.max(0, Number(ecology?.farmPressureByKey?.[key] ?? 0));
      if (pressure > 0.05) {
        const penaltyPct = Math.round(Math.min(
          Number(BALANCE.ecologyFarmYieldPenaltyMax ?? 0.7),
          pressure * Number(BALANCE.ecologyFarmYieldPenaltyPerPressure ?? 0.44),
        ) * 100);
        insights.push(`Wildlife pressure is suppressing the target farm by about ${penaltyPct}%, so this worker's current food loop is less efficient.`);
      }
    }
  }

  if (entity.type === "VISITOR" && entity.kind === "TRADER") {
    const tradeLabel = String(entity.blackboard?.tradeTargetLabel ?? "");
    const tradeBonus = Number(entity.blackboard?.tradeTargetBonus ?? entity.blackboard?.lastTradeYieldBonus ?? 0);
    const defense = Number(entity.blackboard?.tradeTargetDefense ?? 0);
    if (tradeLabel) {
      const defenseText = defense > 0 ? ` with ${defense} nearby wall tiles` : "";
      insights.push(`Trader is favoring ${tradeLabel}${defenseText}; current trade yield bonus is x${Math.max(1, tradeBonus).toFixed(2)}.`);
    }
  }

  if (entity.type === "VISITOR" && entity.kind !== "TRADER") {
    const sabotageLabel = String(entity.blackboard?.sabotageTargetLabel ?? entity.blackboard?.lastSabotageTargetLabel ?? "");
    const defense = Number(entity.blackboard?.sabotageTargetDefense ?? entity.blackboard?.lastSabotageDefense ?? 0);
    if (sabotageLabel) {
      const blocked = entity.blackboard?.lastSabotageBlocked ? " Last sabotage run was blocked." : "";
      insights.push(`Saboteur is pressuring ${sabotageLabel}; current target has ${defense} nearby wall tiles.${blocked}`);
    }
  }

  if (entity.kind === "HERBIVORE") {
    if (entity.memory?.homeZoneLabel) {
      insights.push(`This herd is anchored to ${entity.memory.homeZoneLabel} and prefers grazing near that frontier habitat before drifting toward the core.`);
    }
    if (Number(entity.debug?.lastMigrationPressure ?? 0) > 0.1) {
      insights.push(`Current migration order is carrying spatial pressure ${Number(entity.debug.lastMigrationPressure).toFixed(2)}, so the herd is less likely to linger near the colony core.`);
    }
    if (Number(entity.debug?.lastGrazePressure ?? 0) > 0.05) {
      const penaltyPct = Math.round(Math.min(
        Number(BALANCE.ecologyFarmYieldPenaltyMax ?? 0.7),
        Number(entity.debug.lastGrazePressure) * Number(BALANCE.ecologyFarmYieldPenaltyPerPressure ?? 0.44),
      ) * 100);
      insights.push(`Current grazing pressure is strong enough to suppress nearby farm output by about ${penaltyPct}%.`);
    }
  }

  if (entity.kind === "PREDATOR") {
    if (entity.memory?.homeZoneLabel) {
      const patrolLabel = entity.debug?.lastPatrolLabel ? ` Current patrol focus: ${entity.debug.lastPatrolLabel}.` : "";
      insights.push(`Predator is patrolling ${entity.memory.homeZoneLabel} and nearby pressure hotspots.${patrolLabel}`);
    }
  }

  if (entity.memory?.migrationTarget && entity.kind === "HERBIVORE") {
    const migrationLabel = entity.memory?.migrationLabel ? ` (${entity.memory.migrationLabel})` : "";
    insights.push(`Migration order is steering this herd toward (${entity.memory.migrationTarget.ix}, ${entity.memory.migrationTarget.iz})${migrationLabel}.`);
  }

  if (hazardSet.has(tileKey(pathTile.ix, pathTile.iz))) {
    insights.push(`Current route touches the ${state.weather.hazardLabel ?? state.weather.current}, so path cost is elevated on the next leg.`);
  }

  if (entity.path && traffic?.penaltyByKey) {
    let highestTrafficPenalty = 1;
    let highestTrafficTile = null;
    let highestTrafficLoad = 0;
    for (let i = Math.max(0, Number(entity.pathIndex ?? 0)); i < entity.path.length; i += 1) {
      const node = entity.path[i];
      const key = tileKey(node.ix, node.iz);
      const penalty = Math.max(1, Number(traffic.penaltyByKey[key] ?? 1));
      if (penalty <= highestTrafficPenalty) continue;
      highestTrafficPenalty = penalty;
      highestTrafficTile = node;
      highestTrafficLoad = Number(traffic.loadByKey?.[key] ?? 0);
    }
    if (highestTrafficTile) {
      insights.push(`Current route crosses congestion near (${highestTrafficTile.ix}, ${highestTrafficTile.iz}) with lane load ${highestTrafficLoad.toFixed(1)} and x${highestTrafficPenalty.toFixed(2)} path cost.`);
    }
  }

  for (const zone of eventZones) {
    insights.push(`Current route overlaps ${summarizeEvent(zone)}${zone.impacted ? " impact" : " target"} zone.`);
  }

  if (typeof entity.debug?.policyRejectedReason === "string" && entity.debug.policyRejectedReason.length > 0) {
    insights.push(`Policy override was rejected: ${entity.debug.policyRejectedReason}.`);
  } else if (entity.blackboard?.aiTargetState) {
    insights.push(`Group AI is currently biasing this unit toward ${entity.blackboard.aiTargetState}.`);
  }

  if (entity.path && entity.pathGridVersion !== state.grid.version) {
    insights.push("Path is stale relative to the current grid version and should be recalculated.");
  }

  const runtime = getScenarioRuntime(state);
  const missingRoute = runtime.routes.find((route) => !route.connected);
  if (missingRoute && entity.type === "WORKER") {
    insights.push(`Scenario pressure is still focused on the ${missingRoute.label}.`);
  }

  return insights;
}
