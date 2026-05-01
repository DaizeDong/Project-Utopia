import { BALANCE } from "../../config/balance.js";
import { ENTITY_TYPE, EVENT_TYPE, TILE, VISITOR_KIND } from "../../config/constants.js";
import { getLongRunEventTuning } from "../../config/longRunProfile.js";
import { getScenarioEventCandidates, getScenarioRuntime } from "../scenarios/ScenarioFactory.js";
import { emitEvent, EVENT_TYPES } from "../../simulation/meta/GameEventBus.js";
import { mutateTile } from "../../simulation/lifecycle/TileMutationHooks.js";
import { pushWarning } from "../../app/warnings.js";

function tileKey(ix, iz) {
  return `${ix},${iz}`;
}

/**
 * v0.8.0 Phase 4 — safe read of the RaidEscalator bundle.
 *
 * Normally populated each tick by `RaidEscalatorSystem` at
 * `state.gameplay.raidEscalation`. Older savegames, benchmark harnesses, and
 * tests that construct minimal state may omit the field, so this helper
 * returns explicit baseline defaults (tier 0, baseline interval, 1× intensity).
 *
 * The defaults are deliberately visible (not silent): the comment exists so a
 * future reader understands *why* the fallback is here and can track it back
 * to Phase 4 § 5.4-5.5 of the spec.
 */
function readRaidEscalation(state) {
  const esc = state?.gameplay?.raidEscalation;
  if (esc && typeof esc === "object") {
    return {
      tier: Number(esc.tier ?? 0),
      intervalTicks: Number(esc.intervalTicks ?? BALANCE.raidIntervalBaseTicks ?? 3600),
      intensityMultiplier: Number(esc.intensityMultiplier ?? 1),
      devIndexSample: Number(esc.devIndexSample ?? 0),
    };
  }
  // v0.8.0 Phase 4 iteration H2: in a real game tick RaidEscalatorSystem runs
  // before WorldEventSystem and populates state.gameplay.raidEscalation. If the
  // field is still missing after tick 1, system ordering or init was skipped —
  // log once so the silent-failure isn't masked by the defaults below.
  const tick = Number(state?.metrics?.tick ?? 0);
  const timeSec = Number(state?.metrics?.timeSec ?? 0);
  if ((tick > 1 || timeSec > 1) && !state?.__raidEscalationMissingWarned) {
    console.warn(
      "[WorldEventSystem] raidEscalation missing after tick 1 — is RaidEscalatorSystem wired into SYSTEM_ORDER? Falling back to tier-0 defaults.",
    );
    if (state) state.__raidEscalationMissingWarned = true;
  }
  return {
    tier: 0,
    intervalTicks: Number(BALANCE.raidIntervalBaseTicks ?? 3600),
    intensityMultiplier: 1,
    devIndexSample: 0,
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function roundMetric(value, digits = 2) {
  return Number(Number(value ?? 0).toFixed(digits));
}

function createEventUpdateContext(state) {
  return {
    gridVersion: Number(state.grid?.version ?? 0),
    runtime: null,
    activeWorkers: null,
    saboteurs: null,
    stats: {
      activeEvents: Number(state.events?.active?.length ?? 0),
      spatialCacheHits: 0,
      spatialCacheMisses: 0,
      workerListBuilds: 0,
      saboteurListBuilds: 0,
      densityHotCount: 0,
    },
  };
}

function getRuntimeForEventUpdate(state, ctx) {
  if (ctx) {
    ctx.runtime ??= getScenarioRuntime(state);
    return ctx.runtime;
  }
  return getScenarioRuntime(state);
}

function getActiveWorkers(state, ctx) {
  if (ctx?.activeWorkers) return ctx.activeWorkers;
  const workers = [];
  for (const agent of state.agents ?? []) {
    if (agent.type === ENTITY_TYPE.WORKER && agent.alive !== false) workers.push(agent);
  }
  if (ctx) {
    ctx.activeWorkers = workers;
    ctx.stats.workerListBuilds += 1;
  }
  return workers;
}

function getSaboteurs(state, ctx) {
  if (ctx?.saboteurs) return ctx.saboteurs;
  const saboteurs = [];
  for (const agent of state.agents ?? []) {
    if (agent.type === ENTITY_TYPE.VISITOR && agent.kind === VISITOR_KIND.SABOTEUR && agent.alive !== false) {
      saboteurs.push(agent);
    }
  }
  if (ctx) {
    ctx.saboteurs = saboteurs;
    ctx.stats.saboteurListBuilds += 1;
  }
  return saboteurs;
}

function resetEventUpdateContextForGridChange(state, ctx) {
  if (!ctx) return;
  ctx.gridVersion = Number(state.grid?.version ?? 0);
  ctx.runtime = null;
}

function targetTilesSignature(tiles) {
  return tiles.map((tile) => `${tile.ix},${tile.iz}`).join("|");
}

function animalMigrationPressureSignature(state, targetRefId) {
  const ecology = state.metrics?.ecology ?? {};
  return `${Number(ecology.herbivoresByZone?.[targetRefId] ?? 0)}:${Number(ecology.predatorsByZone?.[targetRefId] ?? 0)}`;
}

function spatialCacheKey(event, state, targetTiles) {
  const targetRefId = String(event.payload?.targetRefId ?? "");
  const animalPressure = event.type === EVENT_TYPE.ANIMAL_MIGRATION
    ? animalMigrationPressureSignature(state, targetRefId)
    : "";
  return [
    Number(state.grid?.version ?? 0),
    event.type,
    Number(event.intensity ?? 1).toFixed(3),
    String(event.payload?.targetKind ?? ""),
    targetRefId,
    targetTilesSignature(targetTiles),
    animalPressure,
  ].join("|");
}

function collectCoverageStats(state, tiles) {
  const grid = state.grid;
  const width = Number(grid?.width ?? 0);
  const height = Number(grid?.height ?? 0);
  const gridTiles = grid?.tiles ?? [];
  const tileState = grid?.tileState;
  const wallMaxHp = Math.max(1, Number(BALANCE.wallMaxHp ?? 50));
  const seenNear = new Set();
  const seenCore = new Set();
  const stats = {
    walls: 0,
    // v0.8.5 Tier 1 B3: HP-weighted effective wall coverage. A wall at 1 HP
    // contributes 1/wallMaxHp instead of a full 1.0 — so once raiders chip
    // walls down, the BANDIT_RAID mitigation softens proportionally rather
    // than staying at 100% protection until the wall pops to RUINS.
    effectiveWalls: 0,
    roads: 0,
    warehouses: 0,
    farms: 0,
    lumbers: 0,
  };

  for (const tile of tiles) {
    for (let iz = tile.iz - 1; iz <= tile.iz + 1; iz += 1) {
      for (let ix = tile.ix - 1; ix <= tile.ix + 1; ix += 1) {
        if (ix < 0 || iz < 0 || ix >= width || iz >= height) continue;
        if (Math.abs(ix - tile.ix) + Math.abs(iz - tile.iz) > 1) continue;
        const idx = ix + iz * width;
        if (seenNear.has(idx)) continue;
        seenNear.add(idx);
        const current = gridTiles[idx];
        if (current === TILE.WALL || current === TILE.GATE) {
          stats.walls += 1;
          // Read tile state HP if available; default to full HP when the
          // tileState entry is missing (older savegames / scenario walls).
          const entry = tileState?.get?.(idx);
          const hp = entry?.wallHp != null ? Number(entry.wallHp) : wallMaxHp;
          stats.effectiveWalls += Math.max(0, Math.min(1, hp / wallMaxHp));
        }
        else if (current === TILE.ROAD) stats.roads += 1;
        else if (current === TILE.WAREHOUSE) stats.warehouses += 1;
      }
    }

    const coreIdx = tile.ix + tile.iz * width;
    if (seenCore.has(coreIdx)) continue;
    seenCore.add(coreIdx);
    const current = gridTiles[coreIdx];
    if (current === TILE.FARM) stats.farms += 1;
    else if (current === TILE.LUMBER) stats.lumbers += 1;
  }

  return stats;
}

function applySpatialPayloadSnapshot(event, snapshot) {
  Object.assign(event.payload, snapshot);
}

function setSpatialPayloadCache(event, cache) {
  Object.defineProperty(event, "_spatialPayloadCache", {
    value: cache,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

function writeWorldEventDebug(state, ctx) {
  if (!state.debug || !ctx?.stats) return;
  state.debug.worldEventLod = {
    ...ctx.stats,
    activeEvents: Number(state.events?.active?.length ?? ctx.stats.activeEvents ?? 0),
    gridVersion: Number(state.grid?.version ?? 0),
  };
}

/**
 * v0.8.2 Round-5 Wave-1 (02d Step 2/3) — mirror of MortalitySystem's
 * pushWorkerMemory with optional (dedupKey, windowSec) dedup. Keeps the
 * existing 6-entry ring-buffer invariant; new pushes drop when the same
 * event key fired within windowSec at the same tile. `recentKeys` is
 * lazily initialised as a Map so snapshot roundtrips (which shallow-clone
 * `memory` and lose Map instances) never explode.
 */
function pushWorkerMemory(worker, label, dedupKey = null, windowSec = 30, nowSec = 0) {
  worker.memory ??= { recentEvents: [], dangerTiles: [] };
  if (!Array.isArray(worker.memory.recentEvents)) worker.memory.recentEvents = [];
  if (dedupKey) {
    if (!(worker.memory.recentKeys instanceof Map)) worker.memory.recentKeys = new Map();
    const recentKeys = worker.memory.recentKeys;
    const last = Number(recentKeys.get(dedupKey) ?? -Infinity);
    if (Number.isFinite(last) && Number(nowSec) - last < Number(windowSec)) {
      return;
    }
    recentKeys.set(dedupKey, Number(nowSec));
  }
  worker.memory.recentEvents.unshift(label);
  worker.memory.recentEvents = worker.memory.recentEvents.slice(0, 6);
}

function recordWorkerEventMemory(state, label, dedupKey = null, windowSec = 30, workers = null) {
  const nowSecNum = Math.max(0, Number(state.metrics?.timeSec ?? 0));
  const nowSecText = nowSecNum.toFixed(0);
  for (const agent of workers ?? state.agents ?? []) {
    if (agent.type !== ENTITY_TYPE.WORKER || agent.alive === false) continue;
    pushWorkerMemory(agent, `[${nowSecText}s] ${label}`, dedupKey, windowSec, nowSecNum);
  }
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

function chooseBestZone(state, eventType, ctx = null) {
  const runtime = getRuntimeForEventUpdate(state, ctx);
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

function pickBanditRaidZone(state, ctx = null) {
  return chooseBestZone(state, EVENT_TYPE.BANDIT_RAID, ctx);
}

function pickTradeZone(state, ctx = null) {
  return chooseBestZone(state, EVENT_TYPE.TRADE_CARAVAN, ctx);
}

function pickMigrationZone(state, ctx = null) {
  return chooseBestZone(state, EVENT_TYPE.ANIMAL_MIGRATION, ctx);
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

function ensureSpatialPayload(event, state, ctx = null) {
  event.payload ??= {};
  const tuning = getLongRunEventTuning(state);

  if (!Array.isArray(event.payload.targetTiles)) {
    if (event.type === EVENT_TYPE.BANDIT_RAID) {
      const zone = pickBanditRaidZone(state, ctx);
      event.payload.targetLabel = zone.label;
      event.payload.targetTiles = zone.tiles;
      event.payload.targetKind = zone.kind;
      event.payload.targetRefId = zone.ref?.id ?? "";
      event.payload.focusScore = zone.score ?? 0;
    } else if (event.type === EVENT_TYPE.TRADE_CARAVAN) {
      const zone = pickTradeZone(state, ctx);
      event.payload.targetLabel = zone.label;
      event.payload.targetTiles = zone.tiles;
      event.payload.targetKind = zone.kind;
      event.payload.targetRefId = zone.ref?.id ?? "";
      event.payload.focusScore = zone.score ?? 0;
    } else if (event.type === EVENT_TYPE.ANIMAL_MIGRATION) {
      const zone = pickMigrationZone(state, ctx);
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

  const cacheKey = spatialCacheKey(event, state, targetTiles);
  if (event._spatialPayloadCache?.key === cacheKey) {
    applySpatialPayloadSnapshot(event, event._spatialPayloadCache.snapshot);
    if (ctx?.stats) ctx.stats.spatialCacheHits += 1;
    return;
  }
  if (ctx?.stats) ctx.stats.spatialCacheMisses += 1;

  const runtime = getRuntimeForEventUpdate(state, ctx);
  const coverage = collectCoverageStats(state, targetTiles);
  const walls = coverage.walls;
  const roads = coverage.roads;
  const warehouses = coverage.warehouses;
  const farms = coverage.farms;
  const lumbers = coverage.lumbers;
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

  const snapshot = {
    targetTiles,
    focusTile: event.payload.focusTile ?? targetTiles[0] ?? null,
    wallCoverage: walls,
    // v0.8.5 Tier 1 B3: HP-weighted effective wall coverage. Carried in
    // event payload so applyActiveEvent reads damaged walls rather than
    // the raw count.
    effectiveWallCoverage: coverage.effectiveWalls,
    roadSupport: roads,
    warehouseCoverage: warehouses,
    farmCoverage: farms,
    lumberCoverage: lumbers,
    routeOnline,
    depotReady,
    hazardOverlapTiles: hazard.overlapTiles,
    hazardOverlapRatio: hazard.overlapRatio,
    hazardPeakPenalty: hazard.peakPenalty,
    hazardLabels: hazard.labels,
    basePressure: roundMetric(pressure, 2),
    pressure: roundMetric(pressure, 2),
    severity: severityLabel(pressure),
    baseLossMultiplier: lossMultiplier == null ? null : roundMetric(lossMultiplier, 2),
    lossMultiplier: lossMultiplier == null ? null : roundMetric(lossMultiplier, 2),
    baseRewardMultiplier: rewardMultiplier == null ? null : roundMetric(rewardMultiplier, 2),
    rewardMultiplier: rewardMultiplier == null ? null : roundMetric(rewardMultiplier, 2),
  };
  applySpatialPayloadSnapshot(event, snapshot);
  setSpatialPayloadCache(event, { key: cacheKey, snapshot });
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
  const coverageByEvent = new Map();

  for (const event of activeEvents) {
    const keys = collectCoverageKeys(event);
    coverageByEvent.set(event, keys);
    for (const key of keys) {
      eventOccupancy.set(key, (eventOccupancy.get(key) ?? 0) + 1);
    }
  }

  for (const event of activeEvents) {
    const keys = coverageByEvent.get(event) ?? new Set();
    let eventOverlapTiles = 0;
    for (const key of keys) {
      if (Number(eventOccupancy.get(key) ?? 0) > 1) eventOverlapTiles += 1;
    }
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

  // Route through mutateTile() so the cascade cleanup (building counts,
  // reservations, worker target/path invalidation, dirty-tile-key bookkeeping
  // for ProcessingSystem) runs synchronously. Previously this site wrote
  // grid.tiles[] raw, leaving downstream state stale until the next tick —
  // workers froze on RUIN-targeted intents because counts+reservations didn't
  // catch up before WorkerAISystem ran later in the SAME tick.
  return mutateTile(state, impactTile.ix, impactTile.iz, TILE.RUINS);
}

function applyBanditRaidImpact(event, state, ctx = null) {
  if (event.payload?.sabotageApplied) return;
  ensureSpatialPayload(event, state, ctx);
  const targetTiles = collectTargetTiles(event);
  // v0.8.6 Tier 1 CB-C3: defense should be HP-weighted so a 1-HP wall stub
  // doesn't provide full impact-tile shielding. Match the same priority order
  // as `applyActiveEvent` (effective → raw → 0). Walls below 100% HP now
  // shield proportionally instead of absolutely.
  const defense = Number(
    event.payload?.effectiveWallCoverage
      ?? event.payload?.wallCoverage
      ?? 0,
  );
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

function applyActiveEvent(event, dt, state, ctx = null) {
  if (event.type === EVENT_TYPE.BANDIT_RAID) {
    // v0.8.5 Tier 1 B3: read the HP-weighted effective wall coverage when
    // available so a half-broken wall provides only half the mitigation.
    // Falls back to raw wallCoverage / defenseScore for events that
    // pre-date the field (older savegame, scenario raid).
    const defense = Number(
      event.payload?.defenseScore
        ?? event.payload?.effectiveWallCoverage
        ?? event.payload?.wallCoverage
        ?? 0,
    );
    const mitigation = Math.max(0.42, 1 - defense * 0.12);
    const lossMultiplier = Math.max(1, Number(event.payload?.lossMultiplier ?? 1));
    const loss = event.intensity * dt * 0.62 * lossMultiplier * mitigation;
    state.resources.food = Math.max(0, state.resources.food - loss);
    state.resources.wood = Math.max(0, state.resources.wood - loss * 0.82);

    const saboteurs = getSaboteurs(state, ctx);
    const boost = Math.max(0.3, 1.5 - saboteurs.length * 0.03);
    for (const saboteur of saboteurs) {
      saboteur.sabotageCooldown = Math.max(1.5, saboteur.sabotageCooldown - dt * boost);
    }
  }

  if (event.type === EVENT_TYPE.TRADE_CARAVAN) {
    ensureSpatialPayload(event, state, ctx);
    const yieldMultiplier = Math.max(0.72, Number(event.payload?.rewardMultiplier ?? 1));
    // v0.10.1-r2-A5 P0: TRADE_CARAVAN food/wood rates halved (0.5→0.22,
    // 0.34→0.18) — A5 R2 root cause: a 20s caravan at intensity=1 was
    // injecting ~10 food, and the EventDirector's tradeCaravan weight=1
    // re-fired one every few minutes, lifting AFK food 18→313 over a
    // 30-min run. Reducing the per-tick yield by ~56% means caravans are
    // still meaningful relief for active colonies but cannot single-handedly
    // sustain a no-op run with zero farms.
    state.resources.food += dt * 0.22 * event.intensity * yieldMultiplier;
    state.resources.wood += dt * 0.18 * event.intensity * yieldMultiplier;
  }

  if (event.type === EVENT_TYPE.ANIMAL_MIGRATION) {
    if (event.payload?.migrationApplied) return;
    ensureSpatialPayload(event, state, ctx);
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
    event.payload.migrationApplied = true;
  }

  // v0.8.2 Round-6 Wave-2 (01d-mechanics-content Step 4) — proactive event
  // effects. Three branches added so EventDirectorSystem's queued events
  // actually do something the player can perceive.
  if (event.type === EVENT_TYPE.DISEASE_OUTBREAK) {
    const intensity = Math.max(1, Number(event.intensity ?? 1));
    const medicineDrain = 0.4 * intensity * dt;
    state.resources.medicine = Math.max(0, Number(state.resources.medicine ?? 0) - medicineDrain);
    // v0.8.5 Tier 3: damage a fixed cohort of 3 victims per tick (8/s each)
    // rather than spreading 5/s across the whole worker pool. Pre-v0.8.5
    // the spread-thin damage was invisible (workers self-healed faster
    // than they took damage). Concentrating damage on the cohort makes
    // disease feel like a real crisis the player must respond to.
    const workers = getActiveWorkers(state, ctx);
    if (workers.length > 0) {
      const cohortSize = Math.min(3, workers.length);
      const baseTick = Math.floor(Number(state.metrics?.tick ?? 0));
      const dmg = 8 * dt * intensity;
      const seen = new Set();
      for (let c = 0; c < cohortSize; c += 1) {
        const idx = (baseTick + c) % workers.length;
        if (seen.has(idx)) continue;
        seen.add(idx);
        const victim = workers[idx];
        victim.hp = Math.max(0, Number(victim.hp ?? 0) - dmg);
      }
      event.payload ??= {};
      event.payload.diseaseInfectedCount = Number(event.payload.diseaseInfectedCount ?? 0) + cohortSize;
    }
    if (!event.payload?.diseaseLogged) {
      recordWorkerEventMemory(
        state,
        `Plague spread (${Number(event.payload?.diseaseInfectedCount ?? 1)} infected)`,
        `disease:${event.id ?? "anon"}`,
        45,
        workers,
      );
      event.payload ??= {};
      event.payload.diseaseLogged = true;
    }
  }

  if (event.type === EVENT_TYPE.WILDFIRE) {
    const intensity = Math.max(1, Number(event.intensity ?? 1));
    const targetTiles = collectTargetTiles(event);
    const grid = state.grid;
    const width = Number(grid?.width ?? 0);
    if (targetTiles.length > 0 && grid?.tiles && width > 0) {
      // Per-second 5% × dt × intensity probability of converting one LUMBER
      // tile to RUINS. Deterministic-ish: use tick parity to pick the candidate
      // index so seeded benchmarks stay reproducible (no Math.random here).
      const burnChance = Math.min(1, 0.05 * dt * intensity);
      const tickSalt = Number(state.metrics?.tick ?? 0);
      // Cheap deterministic roll without consuming services.rng (which the
      // bench harness reserves for spawn distribution).
      const roll = ((tickSalt * 9301 + 49297) % 233280) / 233280;
      if (roll < burnChance) {
        for (let i = 0; i < targetTiles.length; i += 1) {
          const tileIdx = (tickSalt + i) % targetTiles.length;
          const tile = targetTiles[tileIdx];
          const cur = grid.tiles[tile.ix + tile.iz * width];
          // v0.8.5 Tier 3: wildfire now also burns FARM and HERB_GARDEN.
          // Pre-v0.8.5 only LUMBER burned, which meant farm-heavy colonies
          // never feared wildfire. Farms and herb gardens are flammable
          // organic matter; let them burn too.
          if (cur === TILE.LUMBER || cur === TILE.FARM || cur === TILE.HERB_GARDEN) {
            if (applyImpactTileToGrid(state, tile)) {
              event.payload ??= {};
              event.payload.wildfireBurnedTiles = Number(event.payload.wildfireBurnedTiles ?? 0) + 1;
              break;
            }
          }
        }
      }
    }
  }

  if (event.type === EVENT_TYPE.MORALE_BREAK) {
    if (event.payload?.moraleBreakAssigned) return;
    const nowSec = Number(state.metrics?.timeSec ?? 0);
    const workers = getActiveWorkers(state, ctx);
    if (workers.length > 0) {
      let victim = workers[0];
      let lowMood = Number(workers[0].mood ?? 0.5);
      for (let i = 1; i < workers.length; i += 1) {
        const m = Number(workers[i].mood ?? 0.5);
        if (m < lowMood) {
          lowMood = m;
          victim = workers[i];
        }
      }
      victim.blackboard ??= {};
      const breakDurationSec = Math.max(5, Number(event.durationSec ?? 30));
      victim.blackboard.moraleBreak = { untilSec: nowSec + breakDurationSec };
      event.payload ??= {};
      event.payload.moraleBreakAssigned = true;
      event.payload.moraleBreakWorkerId = victim.id ?? "";
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

// v0.8.2 Round-7 02a — module-level dedup map for objectiveLog entries
// (fire/vermin events should not flood the log within 30s windows).
const _warehouseObjLogDedup = new Map();

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

function applyWarehouseDensityRisk(dt, state, services, ctx = null) {
  const density = state.metrics?.warehouseDensity;
  const hot = density?.hotWarehouses;
  if (!Array.isArray(hot) || hot.length <= 0) return;
  if (ctx?.stats) ctx.stats.densityHotCount = hot.length;

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
      // v0.8.2 Round-5 Wave-1 (02d Step 3) — dedup same-tile fire events
      // within a 30s window so recentEvents isn't drowned by successive
      // hot-warehouse rolls.
      recordWorkerEventMemory(
        state,
        `Warehouse fire at (${loc.ix},${loc.iz})`,
        `fire:${loc.ix},${loc.iz}`,
        30,
        getActiveWorkers(state, ctx),
      );
      pushWarning(state, `Warehouse fire at (${loc.ix},${loc.iz}) — stored goods damaged`, "warning", "WorldEventSystem");
      // v0.8.2 Round-7 02a — push fire event to objectiveLog for player visibility.
      if (state.gameplay) {
        if (!Array.isArray(state.gameplay.objectiveLog)) state.gameplay.objectiveLog = [];
        const nowSec = Number(state.metrics?.timeSec ?? 0);
        const dedupeKey = `fire:${loc.ix},${loc.iz}`;
        if (!_warehouseObjLogDedup.has(dedupeKey) || nowSec - _warehouseObjLogDedup.get(dedupeKey) > 30) {
          _warehouseObjLogDedup.set(dedupeKey, nowSec);
          const lossTotal = Math.round(lossFood + lossWood + lossStone + lossHerbs);
          state.gameplay.objectiveLog.unshift(
            `[${nowSec.toFixed(1)}s] Warehouse fire at (${loc.ix},${loc.iz}) — ${lossTotal} resources lost`,
          );
          state.gameplay.objectiveLog = state.gameplay.objectiveLog.slice(0, 24);
        }
      }
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
      recordWorkerEventMemory(
        state,
        "Vermin swarm gnawed the stores",
        `vermin:${loc.ix},${loc.iz}`,
        30,
        getActiveWorkers(state, ctx),
      );
      pushWarning(state, `Vermin swarm at warehouse (${loc.ix},${loc.iz}) — food stores gnawed`, "warning", "WorldEventSystem");
      // v0.8.2 Round-7 02a — push vermin event to objectiveLog for player visibility.
      if (state.gameplay) {
        if (!Array.isArray(state.gameplay.objectiveLog)) state.gameplay.objectiveLog = [];
        const nowSec = Number(state.metrics?.timeSec ?? 0);
        const dedupeKey = `vermin:${loc.ix},${loc.iz}`;
        if (!_warehouseObjLogDedup.has(dedupeKey) || nowSec - _warehouseObjLogDedup.get(dedupeKey) > 30) {
          _warehouseObjLogDedup.set(dedupeKey, nowSec);
          const lossRounded = Math.round(lossFood);
          state.gameplay.objectiveLog.unshift(
            `[${nowSec.toFixed(1)}s] Vermin swarm at (${loc.ix},${loc.iz}) — ${lossRounded} food gnawed`,
          );
          state.gameplay.objectiveLog = state.gameplay.objectiveLog.slice(0, 24);
        }
      }
    }
  }
}

export class WorldEventSystem {
  constructor() {
    this.name = "WorldEventSystem";
  }

  update(dt, state, services) {
    const ctx = createEventUpdateContext(state);
    const gridVersionAtStart = Number(state.grid?.version ?? 0);

    if (state.events.queue.length > 0) {
      const escalation = readRaidEscalation(state);
      const currentTick = Number(state.metrics?.tick ?? 0);
      // v0.8.7.1 P10 — track lastRaidTick locally so multi-raid drains in
      // the same tick correctly cool down against the previous spawn (mostly
      // defensive; today maxConcurrent gates this to one anyway).
      let lastRaidTick = Number(state.gameplay?.lastRaidTick ?? -9999);
      const tuning = getLongRunEventTuning(state);
      const drained = state.events.queue.splice(0, state.events.queue.length);
      const spawned = [];
      const droppedRaids = [];
      const droppedByCap = [];
      const activeCountsByType = new Map();
      const spawnedCountsByType = new Map();
      for (const active of state.events.active ?? []) {
        activeCountsByType.set(active.type, (activeCountsByType.get(active.type) ?? 0) + 1);
      }

      for (const event of drained) {
        const maxConcurrent = Number(tuning.maxConcurrentByType?.[event.type] ?? Infinity);
        if (Number.isFinite(maxConcurrent)) {
          const activeOfType = Number(activeCountsByType.get(event.type) ?? 0);
          const spawnedOfType = Number(spawnedCountsByType.get(event.type) ?? 0);
          if (activeOfType + spawnedOfType >= maxConcurrent) {
            droppedByCap.push(event);
            continue;
          }
        }
        if (event.type === EVENT_TYPE.BANDIT_RAID) {
          // v0.8.0 Phase 4 Plan C — enforce the DevIndex-driven raid cooldown.
          // Raids queued faster than `raidEscalation.intervalTicks` apart are
          // dropped so that frequency scales exclusively with DevIndex tier.
          if (currentTick - lastRaidTick < escalation.intervalTicks) {
            droppedRaids.push(event);
            continue;
          }
          // Apply the tier's intensity multiplier to the raid's base intensity.
          // v0.8.0 Phase 4 iteration SR3: guard against double-application if
          // the same queued raid ever re-enters this loop (e.g. a pre-tiered
          // replay from a savegame). A raid carries its applied tier forward
          // so intensity cannot be silently compounded.
          event.payload ??= {};
          if (!event.payload.raidTierApplied) {
            event.intensity = Number(event.intensity ?? 1) * escalation.intensityMultiplier;
            event.payload.raidTierApplied = true;
          }
          event.payload.raidTier = escalation.tier;
          event.payload.raidIntensityMultiplier = escalation.intensityMultiplier;
          event.payload.raidDevIndexSample = escalation.devIndexSample;

          state.gameplay ??= {};
          state.gameplay.lastRaidTick = currentTick;
          // v0.8.7.1 P10 — refresh local copy so subsequent BANDIT_RAID
          // events drained on the same tick honour the cooldown.
          lastRaidTick = currentTick;
        }
        spawned.push(event);
        spawnedCountsByType.set(event.type, (spawnedCountsByType.get(event.type) ?? 0) + 1);
      }

      for (const event of spawned) ensureSpatialPayload(event, state, ctx);
      state.events.active.push(...spawned);
      if (state.debug?.eventTrace) {
        for (const event of spawned) {
          state.debug.eventTrace.unshift(
            `[${state.metrics.timeSec.toFixed(1)}s] spawn ${event.type} status=${event.status} target=${event.payload?.targetLabel ?? "-"} p=${Number(event.payload?.pressure ?? event.intensity ?? 0).toFixed(2)}`,
          );
        }
        for (const event of droppedRaids) {
          state.debug.eventTrace.unshift(
            `[${state.metrics.timeSec.toFixed(1)}s] drop ${event.type} (raid cooldown: ${(currentTick - lastRaidTick)}/${escalation.intervalTicks} ticks)`,
          );
        }
        for (const event of droppedByCap) {
          state.debug.eventTrace.unshift(
            `[${state.metrics.timeSec.toFixed(1)}s] drop ${event.type} (concurrency cap)`,
          );
        }
        state.debug.eventTrace = state.debug.eventTrace.slice(0, 36);
      }
    }

    for (const event of state.events.active) {
      ensureSpatialPayload(event, state, ctx);
      const prevStatus = event.status;
      if (event.status === "active") {
        applyActiveEvent(event, dt, state, ctx);
      }
      const changed = advanceLifecycle(event, dt);
      if (changed && event.status === "active") {
        if (event.type === EVENT_TYPE.BANDIT_RAID) {
          applyBanditRaidImpact(event, state, ctx);
        }
        applyActiveEvent(event, 0, state, ctx);
      }
      // Phase 10: monotonic raid-repelled counter. A BANDIT_RAID that reaches
      // `resolve` has exhausted its active window with the colony still running,
      // so we credit one repel. Long-horizon-helpers reads this instead of the
      // legacy ring-buffer scan that looked for never-emitted event types.
      // v0.10.1-r2-A5 P0: gate the increment on actual defense — surviving
      // the active window with no walls + no engagement isn't "repelled",
      // it's just "the raid happened to pick a target you weren't using".
      // Require either a non-trivial defense score (HP-weighted wall
      // coverage ≥ 1 ≈ 1+ wall on path) or the explicit `blockedByWalls`
      // flag set by applyBanditRaidImpact when shielding occurs.
      if (changed && prevStatus === "active" && event.status === "resolve"
        && event.type === EVENT_TYPE.BANDIT_RAID) {
        const defenseScore = Number(event.payload?.defenseScore ?? 0);
        const blockedByWalls = event.payload?.blockedByWalls === true;
        if (defenseScore >= 1 || blockedByWalls) {
          state.metrics.raidsRepelled = Number(state.metrics.raidsRepelled ?? 0) + 1;
        }
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

    if (Number(state.grid?.version ?? 0) !== gridVersionAtStart) {
      resetEventUpdateContextForGridChange(state, ctx);
      for (const event of state.events.active) ensureSpatialPayload(event, state, ctx);
    }
    applyContestedEventPressure(state);
    rebuildSpatialPressureMetrics(state);

    // v0.8.0 Phase 2 M2: per-tick density-risk rolls for hot warehouses.
    applyWarehouseDensityRisk(dt, state, services, ctx);
    writeWorldEventDebug(state, ctx);
  }
}
