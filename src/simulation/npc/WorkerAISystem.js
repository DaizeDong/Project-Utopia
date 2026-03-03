import { BALANCE } from "../../config/balance.js";
import { ROLE, TILE } from "../../config/constants.js";
import { clamp } from "../../app/math.js";
import { findNearestTileOfTypes, getTile, randomPassableTile, worldToTile } from "../../world/grid/Grid.js";
import { canAttemptPath, clearPath, followPath, setTargetAndPath } from "../navigation/Navigation.js";

const TARGET_REFRESH_BASE_SEC = 1.2;
const TARGET_REFRESH_JITTER_SEC = 0.7;
const WANDER_REFRESH_BASE_SEC = 1.8;
const WANDER_REFRESH_JITTER_SEC = 1.2;
const DELIVER_THRESHOLD = 2.4;

export function chooseWorkerIntent(worker, state) {
  const hasWarehouse = state.buildings.warehouses > 0;
  const hasCarry = worker.carry.food + worker.carry.wood > 0;
  const carryTotal = worker.carry.food + worker.carry.wood;
  const noWorkSite = (worker.role === ROLE.FARM && state.buildings.farms <= 0)
    || (worker.role === ROLE.WOOD && state.buildings.lumbers <= 0);
  const alreadyDelivering = worker.stateLabel === "Deliver (Warehouse)";
  if (worker.hunger < 0.3 && state.resources.food > 0 && hasWarehouse) return "eat";
  if (
    hasCarry &&
    hasWarehouse &&
    (carryTotal >= DELIVER_THRESHOLD || alreadyDelivering || noWorkSite)
  ) {
    return "deliver";
  }
  if (worker.role === ROLE.FARM && state.buildings.farms > 0) return "farm";
  if (worker.role === ROLE.WOOD && state.buildings.lumbers > 0) return "lumber";
  return "wander";
}

function resolveWorkCooldown(worker, dt, amount, resourceType, rng) {
  if (worker.cooldown <= 0) {
    worker.cooldown = BALANCE.productionCooldownSec * (0.8 + rng.next() * 0.5);
    return;
  }

  worker.cooldown -= dt;
  if (worker.cooldown <= 0) {
    worker.carry[resourceType] += amount;
  }
}

function isTargetTileType(worker, state, targetTileTypes) {
  if (!worker.targetTile) return false;
  const tile = getTile(state.grid, worker.targetTile.ix, worker.targetTile.iz);
  return targetTileTypes.includes(tile);
}

function hasActivePath(worker, state) {
  return Boolean(
    worker.path &&
      worker.pathIndex < worker.path.length &&
      worker.pathGridVersion === state.grid.version,
  );
}

function isAtTargetTile(worker, state) {
  if (!worker.targetTile) return false;
  const current = worldToTile(worker.x, worker.z, state.grid);
  return current.ix === worker.targetTile.ix && current.iz === worker.targetTile.iz;
}

function setIdleDesired(worker) {
  if (!worker.desiredVel) {
    worker.desiredVel = { x: 0, z: 0 };
    return;
  }
  worker.desiredVel.x = 0;
  worker.desiredVel.z = 0;
}

function maybeRetarget(worker, state, services, intent, targetTileTypes) {
  const nowSec = state.metrics.timeSec;
  const blackboard = worker.blackboard ?? (worker.blackboard = {});

  const intentChanged = blackboard.intentTargetIntent !== intent;
  const targetInvalid = !isTargetTileType(worker, state, targetTileTypes);
  const pathStale = Boolean(worker.path) && worker.pathGridVersion !== state.grid.version;
  const pathMissingAwayFromTarget = !hasActivePath(worker, state) && !isAtTargetTile(worker, state);
  const shouldRetarget = intentChanged || targetInvalid || pathStale || pathMissingAwayFromTarget;

  if (shouldRetarget) {
    if (!canAttemptPath(worker, state)) {
      return hasActivePath(worker, state) || isAtTargetTile(worker, state);
    }
    const target = findNearestTileOfTypes(state.grid, worker, targetTileTypes);
    if (!target || !setTargetAndPath(worker, target, state, services)) {
      return false;
    }
    blackboard.intentTargetIntent = intent;
    blackboard.nextTargetRefreshSec = nowSec + TARGET_REFRESH_BASE_SEC + services.rng.next() * TARGET_REFRESH_JITTER_SEC;
  }

  return hasActivePath(worker, state) || isAtTargetTile(worker, state);
}

export class WorkerAISystem {
  constructor() {
    this.name = "WorkerAISystem";
  }

  update(dt, state, services) {
    const rng = services.rng;
    for (const worker of state.agents) {
      if (worker.type !== "WORKER") continue;

      worker.hunger = clamp(worker.hunger - BALANCE.hungerDecayPerSecond * dt, 0, 1);

      const intent = chooseWorkerIntent(worker, state);
      worker.blackboard.intent = intent;
      if (worker.debug) worker.debug.lastIntent = intent;

      if (intent === "eat") {
        worker.stateLabel = "Eat (Warehouse)";
        if (maybeRetarget(worker, state, services, intent, [TILE.WAREHOUSE])) {
          if (hasActivePath(worker, state)) {
            const step = followPath(worker, state, dt);
            worker.desiredVel = step.desired;
            if (worker.debug) worker.debug.lastPathLength = worker.path?.length ?? 0;
          } else {
            setIdleDesired(worker);
          }
          if (isAtTargetTile(worker, state)) {
            const eat = Math.min(BALANCE.hungerEatRatePerSecond * dt, state.resources.food);
            state.resources.food -= eat;
            worker.hunger = clamp(worker.hunger + eat * BALANCE.hungerEatRecoveryPerFoodUnit, 0, 1);
          }
          continue;
        }
      }

      if (intent === "deliver") {
        worker.stateLabel = "Deliver (Warehouse)";
        if (maybeRetarget(worker, state, services, intent, [TILE.WAREHOUSE])) {
          if (hasActivePath(worker, state)) {
            const step = followPath(worker, state, dt);
            worker.desiredVel = step.desired;
            if (worker.debug) worker.debug.lastPathLength = worker.path?.length ?? 0;
          } else {
            setIdleDesired(worker);
          }
          if (isAtTargetTile(worker, state)) {
            state.resources.food += worker.carry.food;
            state.resources.wood += worker.carry.wood;
            worker.carry.food = 0;
            worker.carry.wood = 0;
          }
          continue;
        }
      }

      if (intent === "farm") {
        worker.stateLabel = "Work (Farm)";
        if (maybeRetarget(worker, state, services, intent, [TILE.FARM])) {
          if (hasActivePath(worker, state)) {
            const step = followPath(worker, state, dt);
            worker.desiredVel = step.desired;
            if (worker.debug) worker.debug.lastPathLength = worker.path?.length ?? 0;
          } else {
            setIdleDesired(worker);
          }
          if (isAtTargetTile(worker, state)) {
            const doctrine = Number(state.gameplay?.modifiers?.farmYield ?? 1);
            resolveWorkCooldown(worker, dt, Math.max(0.2, state.weather.farmProductionMultiplier * doctrine), "food", rng);
          }
          continue;
        }
      }

      if (intent === "lumber") {
        worker.stateLabel = "Work (Lumber)";
        if (maybeRetarget(worker, state, services, intent, [TILE.LUMBER])) {
          if (hasActivePath(worker, state)) {
            const step = followPath(worker, state, dt);
            worker.desiredVel = step.desired;
            if (worker.debug) worker.debug.lastPathLength = worker.path?.length ?? 0;
          } else {
            setIdleDesired(worker);
          }
          if (isAtTargetTile(worker, state)) {
            const doctrine = Number(state.gameplay?.modifiers?.lumberYield ?? 1);
            resolveWorkCooldown(worker, dt, Math.max(0.2, state.weather.lumberProductionMultiplier * doctrine), "wood", rng);
          }
          continue;
        }
      }

      worker.stateLabel = "Wander";
      const blackboard = worker.blackboard ?? (worker.blackboard = {});
      blackboard.intentTargetIntent = "wander";
      const nowSec = state.metrics.timeSec;
      const nextWanderRefreshSec = Number(blackboard.nextWanderRefreshSec ?? -Infinity);
      const stalePath = Boolean(worker.path) && worker.pathGridVersion !== state.grid.version;
      if (!hasActivePath(worker, state)) {
        const driftedFromTarget = worker.targetTile ? !isAtTargetTile(worker, state) : true;
        const shouldRetarget = stalePath || driftedFromTarget || nowSec >= nextWanderRefreshSec;
        if (shouldRetarget && canAttemptPath(worker, state)) {
          clearPath(worker);
          if (setTargetAndPath(worker, randomPassableTile(state.grid), state, services)) {
            blackboard.nextWanderRefreshSec = nowSec + WANDER_REFRESH_BASE_SEC + rng.next() * WANDER_REFRESH_JITTER_SEC;
          }
        }
      }
      if (hasActivePath(worker, state)) {
        worker.desiredVel = followPath(worker, state, dt).desired;
      } else {
        setIdleDesired(worker);
      }
    }
  }
}
