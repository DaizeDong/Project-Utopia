import { BALANCE } from "../../config/balance.js";
import { ROLE, TILE } from "../../config/constants.js";
import { clamp } from "../../app/math.js";
import { findNearestTileOfTypes, randomPassableTile } from "../../world/grid/Grid.js";
import { clearPath, followPath, setTargetAndPath } from "../navigation/Navigation.js";

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

      if (intent === "eat") {
        worker.stateLabel = "Eat (Warehouse)";
        const target = findNearestTileOfTypes(state.grid, worker, [TILE.WAREHOUSE]);
        if (target && setTargetAndPath(worker, target, state, services)) {
          const step = followPath(worker, state, dt);
          worker.desiredVel = step.desired;
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
        const target = findNearestTileOfTypes(state.grid, worker, [TILE.WAREHOUSE]);
        if (target && setTargetAndPath(worker, target, state, services)) {
          const step = followPath(worker, state, dt);
          worker.desiredVel = step.desired;
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
        const target = findNearestTileOfTypes(state.grid, worker, [TILE.FARM]);
        if (target && setTargetAndPath(worker, target, state, services)) {
          const step = followPath(worker, state, dt);
          worker.desiredVel = step.desired;
          if (step.done) {
            resolveWorkCooldown(worker, dt, Math.max(0.2, state.weather.farmProductionMultiplier), "food");
          }
          continue;
        }
      }

      if (intent === "lumber") {
        worker.stateLabel = "Work (Lumber)";
        const target = findNearestTileOfTypes(state.grid, worker, [TILE.LUMBER]);
        if (target && setTargetAndPath(worker, target, state, services)) {
          const step = followPath(worker, state, dt);
          worker.desiredVel = step.desired;
          if (step.done) {
            resolveWorkCooldown(worker, dt, Math.max(0.2, state.weather.lumberProductionMultiplier), "wood");
          }
          continue;
        }
      }

      worker.stateLabel = "Wander";
      if (!worker.targetTile || !worker.path || worker.pathIndex >= worker.path.length) {
        clearPath(worker);
        setTargetAndPath(worker, randomPassableTile(state.grid), state, services);
      }
      worker.desiredVel = followPath(worker, state, dt).desired;
    }
  }
}
