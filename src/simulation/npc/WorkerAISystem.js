import { BALANCE } from "../../config/balance.js";
import { ROLE, TILE } from "../../config/constants.js";
import { clamp } from "../../app/math.js";
import { findNearestTileOfTypes, getTile, randomPassableTile } from "../../world/grid/Grid.js";
import { clearPath, followPath, setTargetAndPath } from "../navigation/Navigation.js";

const TARGET_REFRESH_BASE_SEC = 1.2;
const TARGET_REFRESH_JITTER_SEC = 0.7;

export function chooseWorkerIntent(worker, state) {
  const hasWarehouse = state.buildings.warehouses > 0;
  const hasCarry = worker.carry.food + worker.carry.wood > 0;
  if (worker.hunger < 0.3 && state.resources.food > 0 && hasWarehouse) return "eat";
  if (hasCarry && hasWarehouse) return "deliver";
  if (worker.role === ROLE.FARM && state.buildings.farms > 0) return "farm";
  if (worker.role === ROLE.WOOD && state.buildings.lumbers > 0) return "lumber";
  return "wander";
}

function resolveWorkCooldown(worker, dt, amount, resourceType) {
  if (worker.cooldown <= 0) {
    worker.cooldown = BALANCE.productionCooldownSec * (0.8 + Math.random() * 0.5);
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

function maybeRetarget(worker, state, services, intent, targetTileTypes) {
  const nowSec = state.metrics.timeSec;
  const blackboard = worker.blackboard ?? (worker.blackboard = {});

  const intentChanged = blackboard.intentTargetIntent !== intent;
  const targetExpired = nowSec >= Number(blackboard.nextTargetRefreshSec ?? -Infinity);
  const targetInvalid = !isTargetTileType(worker, state, targetTileTypes);
  const pathInvalid = !worker.path || worker.pathIndex >= worker.path.length || worker.pathGridVersion !== state.grid.version;

  if (intentChanged || targetExpired || targetInvalid || pathInvalid) {
    const target = findNearestTileOfTypes(state.grid, worker, targetTileTypes);
    if (!target || !setTargetAndPath(worker, target, state, services)) {
      return false;
    }
    blackboard.intentTargetIntent = intent;
    blackboard.nextTargetRefreshSec = nowSec + TARGET_REFRESH_BASE_SEC + Math.random() * TARGET_REFRESH_JITTER_SEC;
  }

  return Boolean(worker.path && worker.pathIndex < worker.path.length);
}

export class WorkerAISystem {
  constructor() {
    this.name = "WorkerAISystem";
  }

  update(dt, state, services) {
    for (const worker of state.agents) {
      if (worker.type !== "WORKER") continue;

      worker.hunger = clamp(worker.hunger - BALANCE.hungerDecayPerSecond * dt, 0, 1);

      const intent = chooseWorkerIntent(worker, state);
      worker.blackboard.intent = intent;
      if (worker.debug) worker.debug.lastIntent = intent;

      if (intent === "eat") {
        worker.stateLabel = "Eat (Warehouse)";
        if (maybeRetarget(worker, state, services, intent, [TILE.WAREHOUSE])) {
          const step = followPath(worker, state, dt);
          worker.desiredVel = step.desired;
          if (worker.debug) worker.debug.lastPathLength = worker.path?.length ?? 0;
          if (step.done) {
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
          const step = followPath(worker, state, dt);
          worker.desiredVel = step.desired;
          if (worker.debug) worker.debug.lastPathLength = worker.path?.length ?? 0;
          if (step.done) {
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
          const step = followPath(worker, state, dt);
          worker.desiredVel = step.desired;
          if (worker.debug) worker.debug.lastPathLength = worker.path?.length ?? 0;
          if (step.done) {
            const doctrine = Number(state.gameplay?.modifiers?.farmYield ?? 1);
            resolveWorkCooldown(worker, dt, Math.max(0.2, state.weather.farmProductionMultiplier * doctrine), "food");
          }
          continue;
        }
      }

      if (intent === "lumber") {
        worker.stateLabel = "Work (Lumber)";
        if (maybeRetarget(worker, state, services, intent, [TILE.LUMBER])) {
          const step = followPath(worker, state, dt);
          worker.desiredVel = step.desired;
          if (worker.debug) worker.debug.lastPathLength = worker.path?.length ?? 0;
          if (step.done) {
            const doctrine = Number(state.gameplay?.modifiers?.lumberYield ?? 1);
            resolveWorkCooldown(worker, dt, Math.max(0.2, state.weather.lumberProductionMultiplier * doctrine), "wood");
          }
          continue;
        }
      }

      worker.stateLabel = "Wander";
      if (worker.blackboard) {
        worker.blackboard.intentTargetIntent = "wander";
      }
      if (!worker.targetTile || !worker.path || worker.pathIndex >= worker.path.length) {
        clearPath(worker);
        setTargetAndPath(worker, randomPassableTile(state.grid), state, services);
      }
      worker.desiredVel = followPath(worker, state, dt).desired;
    }
  }
}
