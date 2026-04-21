import { BALANCE } from "../../config/balance.js";
import { EVENT_TYPE, TILE, VISITOR_KIND } from "../../config/constants.js";
import { getLongRunEventTuning } from "../../config/longRunProfile.js";
import { getScenarioEventCandidates, getScenarioRuntime } from "../scenarios/ScenarioFactory.js";
import { emitEvent, EVENT_TYPES } from "../../simulation/meta/GameEventBus.js";
import { pushWarning } from "../../app/warnings.js";

function tileKey(ix, iz) {
  return `${ix},${iz}`;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function roundMetric(value, digits = 2) {
  return Number(Number(value ?? 0).toFixed(digits));
}

function severityLabel(pressure) {
  const safe = Number(pressure ?? 0);
  if (safe >= 1.45) return "high";
  if (safe >= 0.75) return "medium";
  return "low";
}

function collectTargetTiles(event) {
  if (Array.isArray(event.payload?.targetTiles)) return event.payload.targetTiles;
  if (Number.isFinite(Number(event.payload?.ix)) && Number.isFinite(Number(event.payload?.iz))) {
    return [{ ix: Number(event.payload.ix), iz: Number(event.payload.iz) }];
  }
  return [];
}

function countTilesNearTiles(state, tiles, acceptedTypes, radius = 1) {
  const accepted = new Set(acceptedTypes);
  const seen = new Set();
  let count = 0;
  for (const tile of tiles) {
    for (let iz = tile.iz - radius; iz <= tile.iz + radius; iz += 1) {
      for (let ix = tile.ix - radius; ix <= tile.ix + radius; ix += 1) {
        if (ix < 0 || iz < 0 || ix >= state.grid.width || iz >= state.grid.height) continue;
        if (Math.abs(ix - tile.ix) + Math.abs(iz - tile.iz) > radius) continue;
        const key = tileKey(ix, iz);
        if (seen.has(key)) continue;
        seen.add(key);
        if (accepted.has(state.grid.tiles[ix + iz * state.grid.width])) count += 1;
      }
    }
  }
  return count;
}

function countWallsNearTiles(state, tiles, radius = 1) {
  return countTilesNearTiles(state, tiles, [TILE.WALL], radius);
}

function buildWeatherHazardSet(state) {
  if (state.weather?.hazardTileSet instanceof Set) return state.weather.hazardTileSet;
  return new Set((state.weather?.hazardTiles ?? []).map((tile) => tileKey(tile.ix, tile.iz)));
}

function measureHazardOverlap(state, tiles) {
  const hazardSet = buildWeatherHazardSet(state);
  const penaltyByKey = state.weather?.hazardPenaltyByKey ?? {};
  const labelByKey = state.weather?.hazardLabelByKey ?? {};
  let overlapTiles = 0;
  let peakPenalty = 1;
  const labels = new Set();

  for (const tile of tiles) {
    const key = tileKey(tile.ix, tile.iz);
    if (!hazardSet.has(key)) continue;
    overlapTiles += 1;
    peakPenalty = Math.max(peakPenalty, Number(penaltyByKey[key] ?? state.weather?.hazardPenaltyMultiplier ?? 1));
    const nextLabels = Array.isArray(labelByKey[key]) ? labelByKey[key] : [];
    for (const label of nextLabels) labels.add(label);
  }

  return {
    overlapTiles,
    overlapRatio: tiles.length > 0 ? roundMetric(overlapTiles / tiles.length, 2) : 0,
    peakPenalty: roundMetric(peakPenalty, 2),
    labels: Array.from(labels),
  };
}

function getRuntimeRoute(runtime, targetRefId) {
  if (!targetRefId) return null;
  return runtime.routes.find((route) => route.id === targetRefId) ?? null;
}

function getRuntimeDepot(runtime, targetRefId) {
  if (!targetRefId) return null;
  return runtime.depots.find((depot) => depot.id === targetRefId) ?? null;
}

function scoreBanditZone(state, runtime, zone) {
  const walls = countWallsNearTiles(state, zone.tiles, 1);
  const roads = countTilesNearTiles(state, zone.tiles, [TILE.ROAD], 1);
  const hazard = measureHazardOverlap(state, zone.tiles);
  let score = roads * 0.05
    + Math.max(0, hazard.peakPenalty - 1) * Number(BALANCE.banditRaidHazardPressureScale ?? 0.52)
    + hazard.overlapRatio * 0.55
    - walls * Number(BALANCE.banditRaidWallMitigationPerWall ?? 0.06);

  if (zone.kind === "route") {
    const route = getRuntimeRoute(runtime, zone.ref?.id);
    score += Number(BALANCE.banditRaidRouteBonus ?? 0.28) + (route?.connected ? 0.2 : 0.08);
  } else if (zone.kind === "depot") {
    const depot = getRuntimeDepot(runtime, zone.ref?.id);
    score += Number(BALANCE.banditRaidDepotBonus ?? 0.22) + (depot?.ready ? 0.16 : 0.05);
  } else if (zone.kind === "choke") {
    score += Number(BALANCE.banditRaidChokeBonus ?? 0.34);
  }

  return score;
}

function scoreTradeZone(state, runtime, zone) {
  const walls = countWallsNearTiles(state, zone.tiles, 1);
  const roads = countTilesNearTiles(state, zone.tiles, [TILE.ROAD], 1);
  const warehouses = countTilesNearTiles(state, zone.tiles, [TILE.WAREHOUSE], 1);
  const hazard = measureHazardOverlap(state, zone.tiles);
  const routeOnline = runtime.connectedRoutes > 0;
  const depot = getRuntimeDepot(runtime, zone.ref?.id);
  const depotReady = Boolean(depot?.ready) || warehouses > 0;
  const safety = Math.min(
    walls * Number(BALANCE.tradeCaravanWallSafetyBonusPerWall ?? 0.05),
    Number(BALANCE.tradeCaravanMaxWallSafetyBonus ?? 0.24),
  );

  return warehouses * 0.18
    + roads * Number(BALANCE.tradeCaravanRoadSupportBonus ?? 0.055)
    + safety
    + (depotReady ? Number(BALANCE.tradeCaravanDepotReadyBonus ?? 0.42) : 0.04)
    + (routeOnline ? Number(BALANCE.tradeCaravanConnectedRouteBonus ?? 0.24) : 0)
    - Math.max(0, hazard.peakPenalty - 1) * Number(BALANCE.tradeCaravanHazardPenaltyPerPressure ?? 0.22)
    - hazard.overlapRatio * 0.24;
}

function scoreMigrationZone(state, zone) {
  const hazard = measureHazardOverlap(state, zone.tiles);
  const herbivores = Number(state.metrics?.ecology?.herbivoresByZone?.[zone.ref?.id] ?? 0);
  const predators = Number(state.metrics?.ecology?.predatorsByZone?.[zone.ref?.id] ?? 0);
  const occupancy = herbivores + predators * 0.5;
  return occupancy * 0.18
    + Math.max(0, hazard.peakPenalty - 1) * Number(BALANCE.animalMigrationPressurePerHazard ?? 0.38)
    + hazard.overlapRatio * 0.2
    + (zone.kind === "wildlife" ? Number(BALANCE.animalMigrationWildlifeZoneBonus ?? 0.18) : 0);
}

function chooseBestZone(state, eventType) {
  const runtime = getScenarioRuntime(state);
  const candidates = getScenarioEventCandidates(state, eventType);
  if (candidates.length <= 0) return { label: "unknown", kind: "unknown", tiles: [], ref: null, score: 0 };

  const scored = candidates.map((zone) => {
    let score = 0;
    if (eventType === EVENT_TYPE.BANDIT_RAID) score = scoreBanditZone(state, runtime, zone);
    else if (eventType === EVENT_TYPE.TRADE_CARAVAN) score = scoreTradeZone(state, runtime, zone);
    else if (eventType === EVENT_TYPE.ANIMAL_MIGRATION) score = scoreMigrationZone(state, zone);
    return { ...zone, score: roundMetric(score, 3) };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.label.localeCompare(b.label);
  });
  return scored[0];
}

function pickBanditRaidZone(state) {
  return chooseBestZone(state, EVENT_TYPE.BANDIT_RAID);
}

function pickTradeZone(state) {
  return chooseBestZone(state, EVENT_TYPE.TRADE_CARAVAN);
}

function pickMigrationZone(state) {
  return chooseBestZone(state, EVENT_TYPE.ANIMAL_MIGRATION);
}

function pickImpactTile(state, tiles, targetKind, excludeKeys = new Set()) {
  const prioritiesByKind = {
    route: [TILE.ROAD, TILE.LUMBER, TILE.FARM, TILE.GRASS],
    depot: [TILE.ROAD, TILE.FARM, TILE.LUMBER, TILE.GRASS],
    choke: [TILE.ROAD, TILE.FARM, TILE.LUMBER, TILE.GRASS],
    wildlife: [TILE.FARM, TILE.ROAD, TILE.GRASS],
    local: [TILE.WAREHOUSE, TILE.FARM, TILE.LUMBER, TILE.ROAD, TILE.GRASS],
    default: [TILE.ROAD, TILE.LUMBER, TILE.FARM, TILE.GRASS],
  };
  const priorities = prioritiesByKind[targetKind] ?? prioritiesByKind.default;
  for (const targetType of priorities) {
    for (const tile of tiles) {
      const key = tileKey(tile.ix, tile.iz);
      if (excludeKeys.has(key)) continue;
      const current = state.grid.tiles[tile.ix + tile.iz * state.grid.width];
      if (current === targetType) return tile;
    }
  }
  return null;
}

function ensureSpatialPayload(event, state) {
  event.payload ??= {};
  const tuning = getLongRunEventTuning(state);

  if (!Array.isArray(event.payload.targetTiles)) {
    if (event.type === EVENT_TYPE.BANDIT_RAID) {
      const zone = pickBanditRaidZone(state);
      event.payload.targetLabel = zone.label;
      event.payload.targetTiles = zone.tiles;
      event.payload.targetKind = zone.kind;
      event.payload.targetRefId = zone.ref?.id ?? "";
      event.payload.focusScore = zone.score ?? 0;
    } else if (event.type === EVENT_TYPE.TRADE_CARAVAN) {
      const zone = pickTradeZone(state);
      event.payload.targetLabel = zone.label;
      event.payload.targetTiles = zone.tiles;
      event.payload.targetKind = zone.kind;
      event.payload.targetRefId = zone.ref?.id ?? "";
      event.payload.focusScore = zone.score ?? 0;
    } else if (event.type === EVENT_TYPE.ANIMAL_MIGRATION) {
      const zone = pickMigrationZone(state);
      event.payload.targetLabel = zone.label;
      event.payload.targetTiles = zone.tiles;
      event.payload.targetKind = zone.kind;
      event.payload.targetRefId = zone.ref?.id ?? "";
      event.payload.focusScore = zone.score ?? 0;
      event.payload.focusTile = zone.tiles[0] ?? null;
    } else if (Number.isFinite(Number(event.payload.ix)) && Number.isFinite(Number(event.payload.iz))) {
      event.payload.targetTiles = [{ ix: Number(event.payload.ix), iz: Number(event.payload.iz) }];
      event.payload.targetKind ??= "local";
      event.payload.targetLabel ??= event.payload.targetLabel ?? "local infrastructure";
    }
  }

  const targetTiles = collectTargetTiles(event);
  if (targetTiles.length <= 0) return;

  const runtime = getScenarioRuntime(state);
  const walls = countWallsNearTiles(state, targetTiles, 1);
  const roads = countTilesNearTiles(state, targetTiles, [TILE.ROAD], 1);
  const warehouses = countTilesNearTiles(state, targetTiles, [TILE.WAREHOUSE], 1);
  const farms = countTilesNearTiles(state, targetTiles, [TILE.FARM], 0);
  const lumbers = countTilesNearTiles(state, targetTiles, [TILE.LUMBER], 0);
  const hazard = measureHazardOverlap(state, targetTiles);
  const route = getRuntimeRoute(runtime, event.payload.targetRefId);
  const depot = getRuntimeDepot(runtime, event.payload.targetRefId);
  const routeOnline = Boolean(route?.connected) || (event.type === EVENT_TYPE.TRADE_CARAVAN && runtime.connectedRoutes > 0);
  const depotReady = Boolean(depot?.ready) || warehouses > 0;
  const kind = String(event.payload.targetKind ?? "unknown");
  let pressure = clamp(
    Number(event.intensity ?? 1) * 0.5 + Math.max(0, hazard.peakPenalty - 1) * 0.3,
    0.2,
    2.2,
  );
  let rewardMultiplier = null;
  let lossMultiplier = null;

  if (event.type === EVENT_TYPE.BANDIT_RAID) {
    pressure = Number(event.intensity ?? 1) * 0.54
      + roads * 0.035
      + Math.max(0, hazard.peakPenalty - 1) * Number(BALANCE.banditRaidHazardPressureScale ?? 0.52)
      + hazard.overlapRatio * 0.4
      - walls * Number(BALANCE.banditRaidWallMitigationPerWall ?? 0.06);
    if (kind === "route") pressure += Number(BALANCE.banditRaidRouteBonus ?? 0.28) + (route?.connected ? 0.18 : 0.08);
    else if (kind === "depot") pressure += Number(BALANCE.banditRaidDepotBonus ?? 0.22) + (depotReady ? 0.16 : 0.05);
    else if (kind === "choke") pressure += Number(BALANCE.banditRaidChokeBonus ?? 0.34);
    pressure = clamp(pressure, 0.35, Math.min(2.6, Number(tuning.maxBanditRaidPressure ?? 2.6)));
    lossMultiplier = 1 + pressure * Number(BALANCE.banditRaidLossPerPressure ?? 0.36);
  } else if (event.type === EVENT_TYPE.TRADE_CARAVAN) {
    const safetyBonus = Math.min(
      walls * Number(BALANCE.tradeCaravanWallSafetyBonusPerWall ?? 0.05),
      Number(BALANCE.tradeCaravanMaxWallSafetyBonus ?? 0.24),
    );
    const supportBonus = roads * Number(BALANCE.tradeCaravanRoadSupportBonus ?? 0.055);
    const routeBonus = routeOnline ? Number(BALANCE.tradeCaravanConnectedRouteBonus ?? 0.24) : 0;
    const depotBonus = depotReady ? Number(BALANCE.tradeCaravanDepotReadyBonus ?? 0.42) : 0;
    const hazardPenalty = Math.max(0, hazard.peakPenalty - 1) * Number(BALANCE.tradeCaravanHazardPenaltyPerPressure ?? 0.22)
      + hazard.overlapRatio * 0.18;

    rewardMultiplier = clamp(1 + depotBonus + routeBonus + supportBonus + safetyBonus - hazardPenalty, 0.75, 2.4);
    pressure = clamp(hazardPenalty + (depotReady ? 0 : 0.16) + (routeOnline ? 0 : 0.12), 0.08, 1.4);
  } else if (event.type === EVENT_TYPE.ANIMAL_MIGRATION) {
    const herbivores = Number(state.metrics?.ecology?.herbivoresByZone?.[event.payload.targetRefId] ?? 0);
    const predators = Number(state.metrics?.ecology?.predatorsByZone?.[event.payload.targetRefId] ?? 0);
    const occupancy = herbivores + predators * 0.5;
    pressure = Number(event.intensity ?? 1) * 0.42
      + Math.max(0, hazard.peakPenalty - 1) * Number(BALANCE.animalMigrationPressurePerHazard ?? 0.38)
      + occupancy * 0.08
      + (kind === "wildlife" ? Number(BALANCE.animalMigrationWildlifeZoneBonus ?? 0.18) : 0);
    pressure = clamp(pressure, 0.22, 1.9);
  } else if (event.type === "sabotage") {
    pressure = clamp(
      0.85
        + Math.max(0, hazard.peakPenalty - 1) * 0.4
        + roads * 0.04
        - walls * 0.05,
      0.25,
      2.2,
    );
  }
  pressure = Math.min(pressure, Number(tuning.maxEventPressurePerEvent ?? pressure));

  event.payload.targetTiles = targetTiles;
  event.payload.focusTile ??= targetTiles[0] ?? null;
  event.payload.wallCoverage = walls;
  event.payload.roadSupport = roads;
  event.payload.warehouseCoverage = warehouses;
  event.payload.farmCoverage = farms;
  event.payload.lumberCoverage = lumbers;
  event.payload.routeOnline = routeOnline;
  event.payload.depotReady = depotReady;
  event.payload.hazardOverlapTiles = hazard.overlapTiles;
  event.payload.hazardOverlapRatio = hazard.overlapRatio;
  event.payload.hazardPeakPenalty = hazard.peakPenalty;
  event.payload.hazardLabels = hazard.labels;
  event.payload.basePressure = roundMetric(pressure, 2);
  event.payload.pressure = roundMetric(pressure, 2);
  event.payload.severity = severityLabel(pressure);
  event.payload.baseLossMultiplier = lossMultiplier == null ? null : roundMetric(lossMultiplier, 2);
  event.payload.lossMultiplier = event.payload.baseLossMultiplier;
  event.payload.baseRewardMultiplier = rewardMultiplier == null ? null : roundMetric(rewardMultiplier, 2);
  event.payload.rewardMultiplier = event.payload.baseRewardMultiplier;
}

function collectCoverageKeys(event) {
  const keys = new Set();
  for (const tile of collectTargetTiles(event)) {
    keys.add(tileKey(tile.ix, tile.iz));
  }
  const impactTile = event.payload?.impactTile ?? null;
  if (impactTile) keys.add(tileKey(impactTile.ix, impactTile.iz));
  const secondaryImpactTile = event.payload?.secondaryImpactTile ?? null;
  if (secondaryImpactTile) keys.add(tileKey(secondaryImpactTile.ix, secondaryImpactTile.iz));
  return keys;
}

function applyContestedEventPressure(state) {
  const activeEvents = state.events.active ?? [];
  const tuning = getLongRunEventTuning(state);
  const eventOccupancy = new Map();

  for (const event of activeEvents) {
    const keys = collectCoverageKeys(event);
    for (const key of keys) {
      eventOccupancy.set(key, (eventOccupancy.get(key) ?? 0) + 1);
    }
  }

  for (const event of activeEvents) {
    const keys = collectCoverageKeys(event);
    const eventOverlapTiles = Array.from(keys).filter((key) => Number(eventOccupancy.get(key) ?? 0) > 1).length;
    const hazardOverlapTiles = Number(event.payload?.hazardOverlapTiles ?? 0);
    const contestedTiles = hazardOverlapTiles + eventOverlapTiles;
    const basePressure = Number(event.payload?.basePressure ?? event.payload?.pressure ?? event.intensity ?? 0);
    const nextPressure = clamp(
      basePressure + eventOverlapTiles * 0.12,
      0,
      Math.min(2.8, Number(tuning.maxEventPressurePerEvent ?? 2.8)),
    );

    event.payload.eventOverlapTiles = eventOverlapTiles;
    event.payload.contestedTiles = contestedTiles;
    event.payload.contested = contestedTiles > 0;
    event.payload.pressure = roundMetric(nextPressure, 2);
    event.payload.severity = severityLabel(nextPressure);

    if (typeof event.payload?.baseLossMultiplier === "number") {
      event.payload.lossMultiplier = roundMetric(
        1 + nextPressure * Number(BALANCE.banditRaidLossPerPressure ?? 0.36),
        2,
      );
    }
    if (typeof event.payload?.baseRewardMultiplier === "number") {
      const overlapPenalty = eventOverlapTiles * 0.08 + hazardOverlapTiles * 0.01;
      event.payload.rewardMultiplier = roundMetric(
        clamp(Number(event.payload.baseRewardMultiplier) - overlapPenalty, 0.72, 2.4),
        2,
      );
    }
  }
}

function rebuildSpatialPressureMetrics(state) {
  const activeEvents = state.events.active ?? [];
  const weatherPressure = roundMetric(state.weather?.pressureScore ?? 0, 2);
  let eventPressure = 0;
  let contestedZones = 0;
  let contestedTiles = 0;
  let peakEventSeverity = 0;

  for (const event of activeEvents) {
    const pressure = Number(event.payload?.pressure ?? event.intensity ?? 0);
    eventPressure += pressure;
    peakEventSeverity = Math.max(peakEventSeverity, pressure);
    if (event.payload?.contested) contestedZones += 1;
    contestedTiles += Number(event.payload?.contestedTiles ?? 0);
  }

  const weatherFronts = Number(state.weather?.hazardFronts?.length ?? 0);
  const eventCount = activeEvents.length;
  let summary = "Spatial pressure: idle";
  if (weatherPressure > 0 || eventCount > 0) {
    summary = `Spatial pressure: weather ${weatherPressure.toFixed(2)} across ${weatherFronts} fronts; events ${eventPressure.toFixed(2)} across ${eventCount} active zones; contested zones ${contestedZones}.`;
  }

  state.metrics.spatialPressure = {
    weatherPressure,
    eventPressure: roundMetric(eventPressure, 2),
    contestedZones,
    contestedTiles,
    activeEventCount: eventCount,
    peakEventSeverity: roundMetric(peakEventSeverity, 2),
    summary,
  };
}

function applyImpactTileToGrid(state, impactTile) {
  if (!impactTile) return false;

  const idx = impactTile.ix + impactTile.iz * state.grid.width;
  const current = state.grid.tiles[idx];
  if (current === TILE.WATER || current === TILE.WALL || current === TILE.WAREHOUSE || current === TILE.RUINS) return false;

  state.grid.tiles[idx] = TILE.RUINS;
  state.grid.version = Number(state.grid.version ?? 0) + 1;
  return true;
}

function applyBanditRaidImpact(event, state) {
  if (event.payload?.sabotageApplied) return;
  ensureSpatialPayload(event, state);
  const targetTiles = collectTargetTiles(event);
  const defense = Number(event.payload?.wallCoverage ?? 0);
  const impactTile = pickImpactTile(state, targetTiles, String(event.payload?.targetKind ?? "route"));

  event.payload.sabotageApplied = true;
  event.payload.impactTile = impactTile;
  event.payload.secondaryImpactTile = null;
  event.payload.defenseScore = defense;

  if (!impactTile) return;

  const shielded = defense >= 4;
  event.payload.blockedByWalls = shielded;
  if (shielded) return;

  const primaryApplied = applyImpactTileToGrid(state, impactTile);
  if (!primaryApplied) return;

  if (Number(event.payload?.pressure ?? 0) >= Number(BALANCE.banditRaidSecondaryImpactPressure ?? 1.2)) {
    const secondary = pickImpactTile(
      state,
      targetTiles,
      String(event.payload?.targetKind ?? "route"),
      new Set([tileKey(impactTile.ix, impactTile.iz)]),
    );
    if (secondary && applyImpactTileToGrid(state, secondary)) {
      event.payload.secondaryImpactTile = secondary;
    }
  }
}

function applyActiveEvent(event, dt, state) {
  if (event.type === EVENT_TYPE.BANDIT_RAID) {
    const defense = Number(event.payload?.defenseScore ?? event.payload?.wallCoverage ?? 0);
    const mitigation = Math.max(0.42, 1 - defense * 0.12);
    const lossMultiplier = Math.max(1, Number(event.payload?.lossMultiplier ?? 1));
    const loss = event.intensity * dt * 0.62 * lossMultiplier * mitigation;
    state.resources.food = Math.max(0, state.resources.food - loss);
    state.resources.wood = Math.max(0, state.resources.wood - loss * 0.82);

    const saboteurs = state.agents.filter((a) => a.type === "VISITOR" && a.kind === VISITOR_KIND.SABOTEUR);
    const boost = Math.max(0.3, 1.5 - saboteurs.length * 0.03);
    for (const saboteur of saboteurs) {
      saboteur.sabotageCooldown = Math.max(1.5, saboteur.sabotageCooldown - dt * boost);
    }
  }

  if (event.type === EVENT_TYPE.TRADE_CARAVAN) {
    ensureSpatialPayload(event, state);
    const yieldMultiplier = Math.max(0.72, Number(event.payload?.rewardMultiplier ?? 1));
    state.resources.food += dt * 0.5 * event.intensity * yieldMultiplier;
    state.resources.wood += dt * 0.34 * event.intensity * yieldMultiplier;
  }

  if (event.type === EVENT_TYPE.ANIMAL_MIGRATION) {
    ensureSpatialPayload(event, state);
    const label = String(event.payload?.targetLabel ?? "migration");
    const focusTile = event.payload?.focusTile ?? null;
    const pressure = Number(event.payload?.pressure ?? 0);
    for (const animal of state.animals) {
      if (animal.kind === "HERBIVORE") {
        animal.memory.recentEvents.unshift(label);
        animal.memory.recentEvents = animal.memory.recentEvents.slice(0, 6);
        animal.memory.migrationTarget = focusTile;
        animal.memory.migrationLabel = label;
        animal.debug.lastMigrationPressure = pressure;
      }
    }
  }
}

function advanceLifecycle(event, dt) {
  event.elapsedSec += dt;

  if (event.status === "prepare" && event.elapsedSec >= 1) {
    event.status = "active";
    event.elapsedSec = 0;
    return true;
  }

  if (event.status === "active" && event.elapsedSec >= event.durationSec) {
    event.status = "resolve";
    event.elapsedSec = 0;
    return true;
  }

  if (event.status === "resolve" && event.elapsedSec >= 1) {
    event.status = "cooldown";
    event.elapsedSec = 0;
    return true;
  }

  return false;
}

// v0.8.0 Phase 2 M2: per-tick density-risk roll for warehouses above threshold.
// Spec § 3: high resource density around a warehouse probabilistically ignites
// WAREHOUSE_FIRE or VERMIN_SWARM. A given warehouse emits at most one event
// per tick (fire rolled first, then vermin if fire missed).
function parseWarehouseKey(key) {
  const parts = String(key ?? "").split(",");
  const ix = Number.parseInt(parts[0], 10);
  const iz = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(ix) || !Number.isFinite(iz)) return null;
  return { ix, iz, key };
}

function applyWarehouseDensityRisk(dt, state, services) {
  const density = state.metrics?.warehouseDensity;
  const hot = density?.hotWarehouses;
  if (!Array.isArray(hot) || hot.length <= 0) return;

  const fireChance = Number(BALANCE.warehouseFireIgniteChancePerTick ?? 0.008) * Math.max(0, dt);
  const verminChance = Number(BALANCE.verminSwarmIgniteChancePerTick ?? 0.005) * Math.max(0, dt);
  const fireLossFraction = Number(BALANCE.warehouseFireLossFraction ?? 0.2);
  const fireLossCap = Number(BALANCE.warehouseFireLossCap ?? 30);
  const verminLossFraction = Number(BALANCE.verminSwarmLossFraction ?? 0.15);
  const verminLossCap = Number(BALANCE.verminSwarmLossCap ?? 40);
  // Deterministic RNG: prefer test stub, then services.rng (seeded), then Math.random.
  const rng = typeof state._riskRng === "function"
    ? state._riskRng
    : (typeof services?.rng?.next === "function" ? () => services.rng.next() : Math.random);

  const grid = state.grid;
  const width = Number(grid?.width ?? 0);

  for (const key of hot) {
    const loc = parseWarehouseKey(key);
    if (!loc) continue;
    // Revalidate the warehouse still exists at this tile (density metrics run on a
    // throttled cadence; a mid-tick demolition could leave a stale key).
    if (grid?.tiles?.[loc.ix + loc.iz * width] !== TILE.WAREHOUSE) continue;
    const densityScore = Number(density.byKey?.[key] ?? 0);

    if (rng() < fireChance) {
      const lossFood = fireLossFraction * Math.min(Number(state.resources.food ?? 0), fireLossCap);
      const lossWood = fireLossFraction * Math.min(Number(state.resources.wood ?? 0), fireLossCap);
      const lossStone = fireLossFraction * Math.min(Number(state.resources.stone ?? 0), fireLossCap);
      const lossHerbs = fireLossFraction * Math.min(Number(state.resources.herbs ?? 0), fireLossCap);
      state.resources.food = Math.max(0, Number(state.resources.food ?? 0) - lossFood);
      state.resources.wood = Math.max(0, Number(state.resources.wood ?? 0) - lossWood);
      state.resources.stone = Math.max(0, Number(state.resources.stone ?? 0) - lossStone);
      state.resources.herbs = Math.max(0, Number(state.resources.herbs ?? 0) - lossHerbs);
      emitEvent(state, EVENT_TYPES.WAREHOUSE_FIRE, {
        entityId: null,
        ix: loc.ix,
        iz: loc.iz,
        key,
        densityScore,
        loss: { food: lossFood, wood: lossWood, stone: lossStone, herbs: lossHerbs },
      });
      pushWarning(state, `Warehouse fire at (${loc.ix},${loc.iz}) — stored goods damaged`, "warning", "WorldEventSystem");
      continue; // at most one density-risk event per warehouse per tick
    }

    if (rng() < verminChance) {
      const lossFood = verminLossFraction * Math.min(Number(state.resources.food ?? 0), verminLossCap);
      state.resources.food = Math.max(0, Number(state.resources.food ?? 0) - lossFood);
      emitEvent(state, EVENT_TYPES.VERMIN_SWARM, {
        entityId: null,
        ix: loc.ix,
        iz: loc.iz,
        key,
        densityScore,
        loss: { food: lossFood },
      });
      pushWarning(state, `Vermin swarm at warehouse (${loc.ix},${loc.iz}) — food stores gnawed`, "warning", "WorldEventSystem");
    }
  }
}

export class WorldEventSystem {
  constructor() {
    this.name = "WorldEventSystem";
  }

  update(dt, state, services) {
    if (state.events.queue.length > 0) {
      const spawned = state.events.queue.splice(0, state.events.queue.length);
      for (const event of spawned) ensureSpatialPayload(event, state);
      state.events.active.push(...spawned);
      if (state.debug?.eventTrace) {
        for (const event of spawned) {
          state.debug.eventTrace.unshift(
            `[${state.metrics.timeSec.toFixed(1)}s] spawn ${event.type} status=${event.status} target=${event.payload?.targetLabel ?? "-"} p=${Number(event.payload?.pressure ?? event.intensity ?? 0).toFixed(2)}`,
          );
        }
        state.debug.eventTrace = state.debug.eventTrace.slice(0, 36);
      }
    }

    for (const event of state.events.active) {
      ensureSpatialPayload(event, state);
      const prevStatus = event.status;
      if (event.status === "active") {
        applyActiveEvent(event, dt, state);
      }
      const changed = advanceLifecycle(event, dt);
      if (changed && event.status === "active") {
        if (event.type === EVENT_TYPE.BANDIT_RAID) {
          applyBanditRaidImpact(event, state);
        }
        applyActiveEvent(event, 0, state);
      }
      if (changed && state.debug?.eventTrace) {
        const impact = event.payload?.impactTile
          ? ` impact=(${event.payload.impactTile.ix},${event.payload.impactTile.iz})`
          : "";
        const pressure = ` p=${Number(event.payload?.pressure ?? event.intensity ?? 0).toFixed(2)}`;
        state.debug.eventTrace.unshift(
          `[${state.metrics.timeSec.toFixed(1)}s] ${event.type} ${prevStatus} -> ${event.status} target=${event.payload?.targetLabel ?? "-"}${pressure}${impact}`,
        );
        state.debug.eventTrace = state.debug.eventTrace.slice(0, 36);
      }
    }

    state.events.active = state.events.active.filter((event) => {
      if (event.status !== "cooldown") return true;
      return event.elapsedSec < 4;
    });

    for (const event of state.events.active) ensureSpatialPayload(event, state);
    applyContestedEventPressure(state);
    rebuildSpatialPressureMetrics(state);

    // v0.8.0 Phase 2 M2: per-tick density-risk rolls for hot warehouses.
    applyWarehouseDensityRisk(dt, state, services);
  }
}
