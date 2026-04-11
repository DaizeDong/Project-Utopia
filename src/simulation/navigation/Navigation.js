import { BALANCE } from "../../config/balance.js";
import { TILE } from "../../config/constants.js";
import { worldToTile, tileToWorld, getTile } from "../../world/grid/Grid.js";
import { aStar } from "./AStar.js";

const PATH_RETRY_BUDGET_SKIP_BASE_SEC = 0.16;
const PATH_RETRY_BUDGET_SKIP_JITTER_SEC = 0.08;
const PATH_RETRY_FAIL_BASE_SEC = 0.45;
const PATH_RETRY_FAIL_JITTER_SEC = 0.25;
const PATH_STUCK_DIST = 0.42;

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function getPathBudget(services, state) {
  const budget = services.pathBudget ?? (services.pathBudget = {
    tick: -1,
    usedMs: 0,
    skipped: 0,
    maxMs: 6,
  });
  const currentTick = Number(state.metrics?.tick ?? 0);
  if (budget.tick !== currentTick) {
    budget.tick = currentTick;
    budget.usedMs = 0;
    budget.skipped = 0;
  }
  return budget;
}

function getPathRetryState(entity) {
  if (!entity || typeof entity !== "object") return null;
  const blackboard = entity.blackboard ?? (entity.blackboard = {});
  if (!Number.isFinite(blackboard.nextPathRetrySec)) {
    blackboard.nextPathRetrySec = -Infinity;
  }
  return blackboard;
}

function isEntityAtTile(entity, tile, grid) {
  if (!entity || !tile || !grid) return false;
  const current = worldToTile(entity.x, entity.z, grid);
  return current.ix === tile.ix && current.iz === tile.iz;
}

function getWeatherHazardData(state) {
  return {
    tiles: state.weather?.hazardTileSet ?? null,
    penaltyMultiplier: state.weather?.hazardPenaltyMultiplier ?? 1,
    penaltyByKey: state.weather?.hazardPenaltyByKey ?? null,
  };
}

function getTrafficCostData(state) {
  return {
    version: Number(state.metrics?.traffic?.version ?? 0),
    penaltyByKey: state.metrics?.traffic?.penaltyByKey ?? null,
    hotspotCount: Number(state.metrics?.traffic?.hotspotCount ?? 0),
    peakLoad: Number(state.metrics?.traffic?.peakLoad ?? 0),
  };
}

function getDynamicPathCosts(state) {
  return {
    hazards: getWeatherHazardData(state),
    traffic: {
      penaltyByKey: getTrafficCostData(state).penaltyByKey,
    },
  };
}

function getPathTrafficVersion(entity) {
  const version = Number(entity?.pathTrafficVersion);
  return Number.isFinite(version) ? version : 0;
}

function getDynamicPathVersion(state) {
  return Number(getTrafficCostData(state).version ?? 0);
}

export function hasActivePath(entity, state) {
  return Boolean(
    entity?.path &&
      entity.pathIndex < entity.path.length &&
      entity.pathGridVersion === state.grid.version &&
      getPathTrafficVersion(entity) === getDynamicPathVersion(state),
  );
}

export function canAttemptPath(entity, state) {
  const nowSec = Number(state.metrics?.timeSec ?? 0);
  const retryState = getPathRetryState(entity);
  return nowSec >= Number(retryState?.nextPathRetrySec ?? -Infinity);
}

export function setTargetAndPath(entity, targetTile, state, services) {
  if (!targetTile) return false;

  const nowSec = Number(state.metrics?.timeSec ?? 0);
  const retryState = getPathRetryState(entity);
  const retryDeadline = Number(retryState?.nextPathRetrySec ?? -Infinity);
  if (nowSec < retryDeadline) {
    const astarStatsEarly = state.debug?.astar;
    if (astarStatsEarly) {
      astarStatsEarly.retrySkips = Number(astarStatsEarly.retrySkips ?? 0) + 1;
    }
    return false;
  }

  const sameTarget = Boolean(
    entity.targetTile &&
    entity.targetTile.ix === targetTile.ix &&
    entity.targetTile.iz === targetTile.iz
  );
  if (sameTarget) {
    const hasValidPath = hasActivePath(entity, state);
    if (hasValidPath) {
      return true;
    }
    if (isEntityAtTile(entity, targetTile, state.grid)) {
      entity.path = null;
      entity.pathIndex = 0;
      entity.pathGridVersion = state.grid.version;
      entity.pathTrafficVersion = getDynamicPathVersion(state);
      entity.targetTile = targetTile;
      if (retryState) retryState.nextPathRetrySec = -Infinity;
      return true;
    }
  }

  const astarStats = state.debug?.astar;
  const pathBudget = getPathBudget(services, state);
  const trafficData = getTrafficCostData(state);
  const pathCostVersion = getDynamicPathVersion(state);
  if (astarStats) {
    astarStats.requests += 1;
    astarStats.lastFrom = worldToTile(entity.x, entity.z, state.grid);
    astarStats.lastTo = { ix: targetTile.ix, iz: targetTile.iz };
    astarStats.budgetUsedMs = pathBudget.usedMs;
    astarStats.budgetMaxMs = pathBudget.maxMs;
    astarStats.budgetSkips = Number(astarStats.budgetSkips ?? 0);
    astarStats.trafficVersion = pathCostVersion;
    astarStats.lastTrafficHotspots = trafficData.hotspotCount;
    astarStats.lastTrafficPeakLoad = trafficData.peakLoad;
  }

  const start = worldToTile(entity.x, entity.z, state.grid);
  const cachedPath = services.pathCache.get(state.grid.version, start, targetTile, pathCostVersion);

  let path = cachedPath;
  let durationMs = 0;
  if (!path) {
    if (pathBudget.usedMs >= pathBudget.maxMs) {
      pathBudget.skipped += 1;
      if (astarStats) astarStats.budgetSkips += 1;
      if (retryState) {
        const jitter = services?.rng?.next ? services.rng.next() * PATH_RETRY_BUDGET_SKIP_JITTER_SEC : PATH_RETRY_BUDGET_SKIP_JITTER_SEC * 0.5;
        retryState.nextPathRetrySec = nowSec + PATH_RETRY_BUDGET_SKIP_BASE_SEC + jitter;
      }
      return false;
    }
    const t0 = nowMs();
    path = aStar(
      state.grid,
      start,
      targetTile,
      state.weather.moveCostMultiplier,
      getDynamicPathCosts(state),
    );
    durationMs = nowMs() - t0;
    pathBudget.usedMs += durationMs;
  }

  if (astarStats) {
    if (cachedPath) {
      astarStats.cacheHits += 1;
    } else {
      astarStats.cacheMisses += 1;
      astarStats.lastDurationMs = durationMs;
      astarStats.avgDurationMs = astarStats.avgDurationMs * 0.92 + durationMs * 0.08;
      astarStats.budgetUsedMs = pathBudget.usedMs;
    }
  }

  if (!path) {
    entity.path = null;
    entity.pathIndex = 0;
    entity.pathGridVersion = -1;
    entity.pathTrafficVersion = 0;
    entity.targetTile = null;
    if (astarStats) astarStats.fail += 1;
    if (retryState) {
      const jitter = services?.rng?.next ? services.rng.next() * PATH_RETRY_FAIL_JITTER_SEC : PATH_RETRY_FAIL_JITTER_SEC * 0.5;
      retryState.nextPathRetrySec = nowSec + PATH_RETRY_FAIL_BASE_SEC + jitter;
    }
    return false;
  }

  if (!cachedPath) {
    services.pathCache.set(state.grid.version, start, targetTile, pathCostVersion, path);
  }

  entity.path = path;
  entity.pathIndex = 0;
  entity.pathGridVersion = state.grid.version;
  entity.pathTrafficVersion = pathCostVersion;
  entity.targetTile = targetTile;
  if (astarStats) {
    astarStats.success += 1;
    astarStats.lastPathLength = path.length;
    astarStats.avgPathLength = astarStats.avgPathLength * 0.9 + path.length * 0.1;
  }
  if (entity.debug) {
    entity.debug.lastPathLength = path.length;
    entity.debug.lastPathRecalcSec = Number(state.metrics?.timeSec ?? 0);
  }
  state.debug ??= {};
  const logic = state.debug.logic ?? (state.debug.logic = {
    invalidTransitions: 0,
    goalFlipCount: 0,
    totalPathRecalcs: 0,
    idleWithoutReasonSecByGroup: {},
    pathRecalcByEntity: {},
    lastGoalsByEntity: {},
    deathByReasonAndReachability: {},
  });
  logic.totalPathRecalcs = Number(logic.totalPathRecalcs ?? 0) + 1;
  const entityId = String(entity.id ?? "unknown");
  logic.pathRecalcByEntity[entityId] = Number(logic.pathRecalcByEntity[entityId] ?? 0) + 1;
  if (retryState) retryState.nextPathRetrySec = -Infinity;
  return true;
}

export function followPath(entity, state, dt) {
  if (!entity.path || entity.pathIndex >= entity.path.length) {
    return { done: true, desired: { x: 0, z: 0 } };
  }

  const tile = entity.path[entity.pathIndex];
  const wp = tileToWorld(tile.ix, tile.iz, state.grid);
  const dx = wp.x - entity.x;
  const dz = wp.z - entity.z;
  const dist = Math.hypot(dx, dz);
  const nowSec = Number(state.metrics?.timeSec ?? 0);
  if (entity.debug) {
    if (!Number.isFinite(entity.debug.lastPathProgressSec)) {
      entity.debug.lastPathProgressSec = nowSec;
    }
    if (!Number.isFinite(entity.debug.lastPathObservedIndex)) {
      entity.debug.lastPathObservedIndex = entity.pathIndex;
    }
  }

  if (dist < 0.16) {
    entity.pathIndex += 1;
    if (entity.debug) {
      entity.debug.lastPathObservedIndex = entity.pathIndex;
      entity.debug.lastPathProgressSec = nowSec;
    }
    if (entity.pathIndex >= entity.path.length) {
      return { done: true, desired: { x: 0, z: 0 } };
    }
  }

  let speed = entity.type === "WORKER"
    ? BALANCE.workerSpeed * Number(entity.preferences?.speedMultiplier ?? 1)
    : entity.type === "VISITOR"
      ? BALANCE.visitorSpeed
      : entity.kind === "PREDATOR"
        ? BALANCE.predatorSpeed
        : BALANCE.herbivoreSpeed;

  // Road speed bonus: workers on road/bridge tiles move faster, degraded by wear
  if (entity.type === "WORKER" && state.grid) {
    const cur = worldToTile(entity.x, entity.z, state.grid);
    const curTile = getTile(state.grid, cur.ix, cur.iz);
    if (curTile === TILE.ROAD || curTile === TILE.BRIDGE) {
      const idx = cur.ix + cur.iz * state.grid.width;
      const wear = state.grid.tileState?.get(idx)?.wear ?? 0;
      // Full bonus at wear=0, linearly degrades to 1.0x at wear=1.0
      const roadBonus = (BALANCE.roadSpeedMultiplier ?? 1.35);
      speed *= 1 + (roadBonus - 1) * (1 - wear);
    }
  }

  const len = Math.hypot(dx, dz) || 1;
  return {
    done: false,
    desired: {
      x: (dx / len) * speed,
      z: (dz / len) * speed,
    },
  };
}

export function isPathStuck(entity, state, timeoutSec = 2.2) {
  if (!entity?.path || entity.pathIndex >= entity.path.length) return false;
  if (entity.pathGridVersion !== state.grid.version) return false;
  const nowSec = Number(state.metrics?.timeSec ?? 0);
  const dbg = entity.debug ?? (entity.debug = {});

  if (!Number.isFinite(dbg.lastPathProgressSec)) {
    dbg.lastPathProgressSec = nowSec;
  }
  if (!Number.isFinite(dbg.lastPathObservedIndex)) {
    dbg.lastPathObservedIndex = entity.pathIndex;
    dbg.lastPathProgressSec = nowSec;
    return false;
  }

  if (dbg.lastPathObservedIndex !== entity.pathIndex) {
    dbg.lastPathObservedIndex = entity.pathIndex;
    dbg.lastPathProgressSec = nowSec;
    return false;
  }

  const tile = entity.path[entity.pathIndex];
  if (!tile) return false;
  const wp = tileToWorld(tile.ix, tile.iz, state.grid);
  const dist = Math.hypot(wp.x - entity.x, wp.z - entity.z);
  if (dist < PATH_STUCK_DIST) {
    dbg.lastPathProgressSec = nowSec;
    return false;
  }

  return nowSec - Number(dbg.lastPathProgressSec ?? nowSec) >= timeoutSec;
}

export function clearPath(entity) {
  entity.path = null;
  entity.pathIndex = 0;
  entity.pathGridVersion = -1;
  entity.pathTrafficVersion = 0;
  entity.targetTile = null;
}
