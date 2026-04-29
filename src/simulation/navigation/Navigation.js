import { BALANCE } from "../../config/balance.js";
import { TILE } from "../../config/constants.js";
import { worldToTile, tileToWorld, getTile } from "../../world/grid/Grid.js";
import { aStar } from "./AStar.js";
import { getEntityFaction } from "./Faction.js";
import { buildPathWorkerKey, snapshotDynamicCostsForPathWorker, snapshotGridForPathWorker } from "./PathWorkerPool.js";

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

function getNavigationEntityCount(state) {
  return Number(state?.agents?.length ?? 0) + Number(state?.animals?.length ?? 0);
}

function isHighLoadPathingState(state) {
  const entityCount = getNavigationEntityCount(state);
  const scale = Number(state.controls?.timeScale ?? 1);
  return entityCount >= 350 || scale >= 4;
}

function getPathCostCacheVersion(state) {
  const dynamicVersion = getDynamicPathVersion(state);
  return isHighLoadPathingState(state) ? 0 : dynamicVersion;
}

function hasAcceptableTrafficVersion(entity, state) {
  if (getPathTrafficVersion(entity) === getDynamicPathVersion(state)) return true;
  // Dynamic crowd penalties should influence new paths, not invalidate hundreds
  // of already-moving agents every traffic sample under high load.
  return isHighLoadPathingState(state);
}

function shouldUsePathWorkers(entity, state, services) {
  if (!services?.pathWorkerPool?.available) return false;
  if (state.controls?.parallelPathing === false) return false;
  const entityCount = getNavigationEntityCount(state);
  const scale = Number(state.controls?.timeScale ?? 1);
  return entityCount >= 350 || scale >= 4 || Boolean(entity?.isStressWorker);
}

function applyPathWorkerStats(state, services) {
  const stats = services?.pathWorkerPool?.getStats?.();
  if (!stats || !state.debug?.astar) return;
  state.debug.astar.workerPool = stats;
}

function getPathWorkerGridSnapshot(state) {
  const version = Number(state.grid?.version ?? 0);
  const cached = state._pathWorkerGridSnapshot;
  if (cached?.version === version && cached?.grid === state.grid) return cached.snapshot;
  const snapshot = snapshotGridForPathWorker(state.grid, version);
  Object.defineProperty(state, "_pathWorkerGridSnapshot", {
    value: { version, grid: state.grid, snapshot },
    writable: true,
    configurable: true,
    enumerable: false,
  });
  return snapshot;
}

export function hasActivePath(entity, state) {
  return Boolean(
    entity?.path &&
      entity.pathIndex < entity.path.length &&
      entity.pathGridVersion === state.grid.version &&
      hasAcceptableTrafficVersion(entity, state),
  );
}

export function canAttemptPath(entity, state) {
  const nowSec = Number(state.metrics?.timeSec ?? 0);
  const retryState = getPathRetryState(entity);
  return nowSec >= Number(retryState?.nextPathRetrySec ?? -Infinity);
}

export function hasPendingPathRequest(entity, services) {
  const key = String(entity?.blackboard?.pendingPathWorkerKey ?? "");
  return Boolean(key && services?.pathWorkerPool?.hasPending?.(key));
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
      // v0.8.12 F6 — already-at-target counts as a successful resolution; keep
      // stall detector quiet until the worker actually needs a fresh path.
      if (entity.blackboard) {
        entity.blackboard.lastSuccessfulPathSec = nowSec;
      }
      if (retryState) retryState.nextPathRetrySec = -Infinity;
      return true;
    }
  }

  const astarStats = state.debug?.astar;
  const pathBudget = getPathBudget(services, state);
  const trafficData = getTrafficCostData(state);
  const currentTrafficVersion = getDynamicPathVersion(state);
  const pathCostVersion = getPathCostCacheVersion(state);
  if (astarStats) {
    astarStats.requests += 1;
    astarStats.lastFrom = worldToTile(entity.x, entity.z, state.grid);
    astarStats.lastTo = { ix: targetTile.ix, iz: targetTile.iz };
    astarStats.budgetUsedMs = pathBudget.usedMs;
    astarStats.budgetMaxMs = pathBudget.maxMs;
    astarStats.budgetSkips = Number(astarStats.budgetSkips ?? 0);
    astarStats.trafficVersion = currentTrafficVersion;
    astarStats.pathCostVersion = pathCostVersion;
    astarStats.lastTrafficHotspots = trafficData.hotspotCount;
    astarStats.lastTrafficPeakLoad = trafficData.peakLoad;
  }

  const start = worldToTile(entity.x, entity.z, state.grid);
  // v0.8.4 strategic walls + GATE (Agent C). Faction derives from the
  // entity (worker → "colony", saboteur → "hostile", predator → "hostile",
  // herbivore → "neutral"). Threaded through cache key + A* options +
  // worker pool key so a hostile path search is never served a colony
  // result and vice versa.
  const faction = getEntityFaction(entity);
  const cachedPath = services.pathCache.get(state.grid.version, start, targetTile, pathCostVersion, faction);

  let path = cachedPath;
  let durationMs = 0;
  let resolvedByWorker = false;
  const workerKey = buildPathWorkerKey(state.grid.version, start, targetTile, pathCostVersion, faction);
  if (!path && shouldUsePathWorkers(entity, state, services)) {
    const pendingKey = String(retryState?.pendingPathWorkerKey ?? "");
    let workerResult = null;
    if (pendingKey) {
      if (pendingKey !== workerKey) {
        services.pathWorkerPool.take(pendingKey);
        retryState.pendingPathWorkerKey = "";
        retryState.pendingPathTargetTile = null;
      } else {
        workerResult = services.pathWorkerPool.take(pendingKey);
        if (workerResult) {
          retryState.pendingPathWorkerKey = "";
          retryState.pendingPathTargetTile = null;
        } else if (services.pathWorkerPool.hasPending(pendingKey)) {
          if (astarStats) {
            astarStats.workerPendingSkips = Number(astarStats.workerPendingSkips ?? 0) + 1;
            applyPathWorkerStats(state, services);
          }
          return false;
        } else {
          retryState.pendingPathWorkerKey = "";
        }
      }
    }
    if (!workerResult) {
      workerResult = services.pathWorkerPool.take(workerKey);
    }
    if (workerResult) {
      path = workerResult.path;
      durationMs = Number(workerResult.durationMs ?? 0);
      resolvedByWorker = true;
      if (astarStats) {
        astarStats.workerHits = Number(astarStats.workerHits ?? 0) + 1;
        astarStats.lastDurationMs = durationMs;
        astarStats.avgDurationMs = astarStats.avgDurationMs * 0.92 + durationMs * 0.08;
      }
    } else if (!resolvedByWorker) {
      const accepted = services.pathWorkerPool.request({
        key: workerKey,
        gridVersion: Number(state.grid.version ?? 0),
        costVersion: pathCostVersion,
        start,
        goal: targetTile,
        weatherMoveCostMultiplier: state.weather.moveCostMultiplier,
        dynamicCosts: snapshotDynamicCostsForPathWorker(state),
        grid: getPathWorkerGridSnapshot(state),
        // v0.8.4 strategic walls + GATE (Agent C). Faction is included on
        // the worker job so the off-thread aStar applies the same
        // gate/wall rules as on-thread.
        faction,
      });
      if (astarStats) {
        astarStats.workerRequests = Number(astarStats.workerRequests ?? 0) + 1;
        if (accepted) astarStats.workerQueued = Number(astarStats.workerQueued ?? 0) + 1;
        else astarStats.workerBackpressure = Number(astarStats.workerBackpressure ?? 0) + 1;
        applyPathWorkerStats(state, services);
      }
      if (accepted) {
        if (retryState) {
          retryState.pendingPathWorkerKey = workerKey;
          retryState.pendingPathTargetTile = { ix: targetTile.ix, iz: targetTile.iz };
        }
        entity.targetTile = targetTile;
        return false;
      }
      if (retryState) {
        const jitter = services?.rng?.next ? services.rng.next() * PATH_RETRY_BUDGET_SKIP_JITTER_SEC : PATH_RETRY_BUDGET_SKIP_JITTER_SEC * 0.5;
        retryState.nextPathRetrySec = nowSec + PATH_RETRY_BUDGET_SKIP_BASE_SEC + jitter;
      }
      return false;
    }
  }

  if (resolvedByWorker && !path) {
    entity.path = null;
    entity.pathIndex = 0;
    entity.pathGridVersion = -1;
    entity.pathTrafficVersion = 0;
    entity.targetTile = null;
    if (astarStats) astarStats.fail += 1;
    if (retryState) {
      const jitter = services?.rng?.next ? services.rng.next() * PATH_RETRY_FAIL_JITTER_SEC : PATH_RETRY_FAIL_JITTER_SEC * 0.5;
      retryState.nextPathRetrySec = nowSec + PATH_RETRY_FAIL_BASE_SEC + jitter;
      retryState.pendingPathWorkerKey = "";
      retryState.pendingPathTargetTile = null;
    }
    applyPathWorkerStats(state, services);
    return false;
  }

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
    // v0.8.4 strategic walls + GATE (Agent C). Faction-aware A* — gates
    // open for "colony", closed for "hostile"/"neutral". The default
    // "colony" baseline is preserved for tests/scenes that path without
    // faction context (the entity-based callers above always provide one).
    path = aStar(
      state.grid,
      start,
      targetTile,
      state.weather.moveCostMultiplier,
      getDynamicPathCosts(state),
      { faction },
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
      retryState.pendingPathWorkerKey = "";
      retryState.pendingPathTargetTile = null;
    }
    return false;
  }

  if (!cachedPath) {
    // v0.8.4 strategic walls + GATE (Agent C). Cache by faction so a
    // hostile result can never be returned to a colony lookup and vice
    // versa.
    services.pathCache.set(state.grid.version, start, targetTile, pathCostVersion, faction, path);
  }
  applyPathWorkerStats(state, services);

  entity.path = path;
  entity.pathIndex = 0;
  entity.pathGridVersion = state.grid.version;
  entity.pathTrafficVersion = pathCostVersion;
  entity.targetTile = targetTile;
  // v0.8.12 F6 — record last successful path acquisition for stall detection.
  // Consumers: WorkerAISystem deliverStuckReplan (F12), commitment-latch
  // escape (F2). Workers whose targets keep failing A* will not update this
  // field; if (nowSec - lastSuccessfulPathSec) grows, downstream logic can
  // force a re-plan / wander.
  if (entity.blackboard) {
    entity.blackboard.lastSuccessfulPathSec = Number(state.metrics?.timeSec ?? 0);
  }
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
  if (retryState) {
    retryState.nextPathRetrySec = -Infinity;
    retryState.pendingPathWorkerKey = "";
    retryState.pendingPathTargetTile = null;
  }
  return true;
}

/**
 * M4 road compounding: per-worker consecutive-on-road-step counter.
 * Tracks how many ticks in a row the worker has occupied a ROAD or BRIDGE
 * tile. Caps at BALANCE.roadStackStepCap. Resets to 0 as soon as the worker
 * steps off a road/bridge tile. Stored on entity.blackboard.roadStep.
 */
function updateRoadStep(entity, state) {
  if (!entity || entity.type !== "WORKER" || !state?.grid) return;
  const blackboard = entity.blackboard ?? (entity.blackboard = {});
  const cur = worldToTile(entity.x, entity.z, state.grid);
  const curTile = getTile(state.grid, cur.ix, cur.iz);
  if (curTile === TILE.ROAD || curTile === TILE.BRIDGE) {
    const cap = Math.max(0, Number(BALANCE.roadStackStepCap ?? 0));
    const prev = Math.max(0, Number(blackboard.roadStep ?? 0));
    blackboard.roadStep = Math.min(cap, prev + 1);
  } else {
    blackboard.roadStep = 0;
  }
}

export function followPath(entity, state, dt) {
  // M4 road compounding: update per-tick roadStep BEFORE any early-return so the
  // counter stays in sync with the worker's actual tile occupancy (including
  // the final tick when the path completes).
  updateRoadStep(entity, state);

  if (!entity.path || entity.pathIndex >= entity.path.length) {
    // Gentle center pull when near map edge to prevent boids forces trapping entity at boundary
    if (state?.grid) {
      const boundsX = (state.grid.width * state.grid.tileSize) / 2 - 0.5;
      const boundsZ = (state.grid.height * state.grid.tileSize) / 2 - 0.5;
      const nearEdgeX = Math.abs(entity.x) > boundsX * 0.92;
      const nearEdgeZ = Math.abs(entity.z) > boundsZ * 0.92;
      if (nearEdgeX || nearEdgeZ) {
        return { done: true, desired: { x: -entity.x * 0.08, z: -entity.z * 0.08 } };
      }
    }
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

  // Road speed bonus: workers on road/bridge tiles move faster, degraded by wear.
  // M4 road compounding: the consecutive-step counter (roadStep) was already
  // advanced at the top of followPath; here we apply the stacked multiplier.
  if (entity.type === "WORKER" && state.grid) {
    const cur = worldToTile(entity.x, entity.z, state.grid);
    const curTile = getTile(state.grid, cur.ix, cur.iz);
    if (curTile === TILE.ROAD || curTile === TILE.BRIDGE) {
      const idx = cur.ix + cur.iz * state.grid.width;
      const wear = state.grid.tileState?.get(idx)?.wear ?? 0;
      const baseRoadBonus = (BALANCE.roadSpeedMultiplier ?? 1.35);
      const cap = Math.max(0, Number(BALANCE.roadStackStepCap ?? 0));
      const perStep = Math.max(0, Number(BALANCE.roadStackPerStep ?? 0));
      const step = Math.min(cap, Math.max(0, Number(entity.blackboard?.roadStep ?? 0)));
      const stackMultiplier = 1 + step * perStep;
      const wearDegrade = 1 - wear;
      // Stacking scales the bonus delta; wear-degradation still applies multiplicatively.
      speed *= 1 + (baseRoadBonus - 1) * wearDegrade * stackMultiplier;
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
  if (entity.blackboard) {
    entity.blackboard.pendingPathWorkerKey = "";
    entity.blackboard.pendingPathTargetTile = null;
  }
}
