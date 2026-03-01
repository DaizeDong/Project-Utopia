import { BALANCE } from "../../config/balance.js";
import { worldToTile, tileToWorld } from "../../world/grid/Grid.js";
import { aStar } from "./AStar.js";

export function setTargetAndPath(entity, targetTile, state, services) {
  if (!targetTile) return false;

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
  const path = cachedPath ?? aStar(state.grid, start, targetTile, state.weather.moveCostMultiplier);

  if (!path) {
    entity.path = null;
    entity.pathIndex = 0;
    entity.pathGridVersion = -1;
    entity.targetTile = null;
    return false;
  }

  if (!cachedPath) {
    services.pathCache.set(state.grid.version, start, targetTile, path);
  }

  entity.path = path;
  entity.pathIndex = 0;
  entity.pathGridVersion = state.grid.version;
  entity.targetTile = targetTile;
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
