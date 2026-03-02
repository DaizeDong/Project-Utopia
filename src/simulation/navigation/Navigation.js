import { BALANCE } from "../../config/balance.js";
import { worldToTile, tileToWorld } from "../../world/grid/Grid.js";
import { aStar } from "./AStar.js";

const PATH_RETRY_BUDGET_SKIP_BASE_SEC = 0.16;
const PATH_RETRY_BUDGET_SKIP_JITTER_SEC = 0.08;
const PATH_RETRY_FAIL_BASE_SEC = 0.45;
const PATH_RETRY_FAIL_JITTER_SEC = 0.25;

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

  const astarStats = state.debug?.astar;
  const pathBudget = getPathBudget(services, state);
  if (astarStats) {
    astarStats.requests += 1;
    astarStats.lastFrom = worldToTile(entity.x, entity.z, state.grid);
    astarStats.lastTo = { ix: targetTile.ix, iz: targetTile.iz };
    astarStats.budgetUsedMs = pathBudget.usedMs;
    astarStats.budgetMaxMs = pathBudget.maxMs;
    astarStats.budgetSkips = Number(astarStats.budgetSkips ?? 0);
  }

  if (
    entity.targetTile &&
    entity.targetTile.ix === targetTile.ix &&
    entity.targetTile.iz === targetTile.iz &&
    entity.path &&
    entity.pathIndex < entity.path.length &&
    entity.pathGridVersion === state.grid.version
  ) {
    return true;
  }

  const start = worldToTile(entity.x, entity.z, state.grid);
  const cachedPath = services.pathCache.get(state.grid.version, start, targetTile);

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
    path = aStar(state.grid, start, targetTile, state.weather.moveCostMultiplier);
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
    entity.targetTile = null;
    if (astarStats) astarStats.fail += 1;
    if (retryState) {
      const jitter = services?.rng?.next ? services.rng.next() * PATH_RETRY_FAIL_JITTER_SEC : PATH_RETRY_FAIL_JITTER_SEC * 0.5;
      retryState.nextPathRetrySec = nowSec + PATH_RETRY_FAIL_BASE_SEC + jitter;
    }
    return false;
  }

  if (!cachedPath) {
    services.pathCache.set(state.grid.version, start, targetTile, path);
  }

  entity.path = path;
  entity.pathIndex = 0;
  entity.pathGridVersion = state.grid.version;
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

  if (dist < 0.16) {
    entity.pathIndex += 1;
    if (entity.pathIndex >= entity.path.length) {
      return { done: true, desired: { x: 0, z: 0 } };
    }
  }

  const speed = entity.type === "WORKER"
    ? BALANCE.workerSpeed
    : entity.type === "VISITOR"
      ? BALANCE.visitorSpeed
      : entity.kind === "PREDATOR"
        ? BALANCE.predatorSpeed
        : BALANCE.herbivoreSpeed;

  const len = Math.hypot(dx, dz) || 1;
  return {
    done: false,
    desired: {
      x: (dx / len) * speed,
      z: (dz / len) * speed,
    },
  };
}

export function clearPath(entity) {
  entity.path = null;
  entity.pathIndex = 0;
  entity.pathGridVersion = -1;
  entity.targetTile = null;
}
