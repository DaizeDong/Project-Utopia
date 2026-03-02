import { BALANCE } from "../../config/balance.js";
import { worldToTile, tileToWorld } from "../../world/grid/Grid.js";
import { aStar } from "./AStar.js";

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function setTargetAndPath(entity, targetTile, state, services) {
  if (!targetTile) return false;

  const astarStats = state.debug?.astar;
  if (astarStats) {
    astarStats.requests += 1;
    astarStats.lastFrom = worldToTile(entity.x, entity.z, state.grid);
    astarStats.lastTo = { ix: targetTile.ix, iz: targetTile.iz };
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
    const t0 = nowMs();
    path = aStar(state.grid, start, targetTile, state.weather.moveCostMultiplier);
    durationMs = nowMs() - t0;
  }

  if (astarStats) {
    if (cachedPath) {
      astarStats.cacheHits += 1;
    } else {
      astarStats.cacheMisses += 1;
      astarStats.lastDurationMs = durationMs;
      astarStats.avgDurationMs = astarStats.avgDurationMs * 0.92 + durationMs * 0.08;
    }
  }

  if (!path) {
    entity.path = null;
    entity.pathIndex = 0;
    entity.pathGridVersion = -1;
    entity.targetTile = null;
    if (astarStats) astarStats.fail += 1;
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
