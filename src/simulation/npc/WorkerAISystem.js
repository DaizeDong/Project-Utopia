import { BALANCE } from "../../config/balance.js";
import { ROLE, TILE } from "../../config/constants.js";
import { clamp } from "../../app/math.js";
import { findNearestTileOfTypes, getTile, randomPassableTile, worldToTile } from "../../world/grid/Grid.js";
import { canAttemptPath, clearPath, followPath, hasActivePath, isPathStuck, setTargetAndPath } from "../navigation/Navigation.js";
import { mapStateToDisplayLabel, transitionEntityState } from "./state/StateGraph.js";
import { planEntityDesiredState } from "./state/StatePlanner.js";

const TARGET_REFRESH_BASE_SEC = 1.2;
const TARGET_REFRESH_JITTER_SEC = 0.7;
const WANDER_REFRESH_BASE_SEC = 1.8;
const WANDER_REFRESH_JITTER_SEC = 1.2;
const WORKER_EMERGENCY_RATION_HUNGER_THRESHOLD = 0.18;
const WORKER_TASK_LOCK_SEC = 1.2;
const WORKER_EMERGENCY_RATION_COOLDOWN_SEC = 2.8;

function getWorkerHungerSeekThreshold(worker) {
  const base = Number(BALANCE.workerHungerSeekThreshold ?? 0.14);
  const override = Number(worker?.metabolism?.hungerSeekThreshold ?? base);
  return clamp(override, 0.05, 0.8);
}

function getWorkerEatRecoveryTarget(worker) {
  const base = Number(BALANCE.workerEatRecoveryTarget ?? 0.68);
  const override = Number(worker?.metabolism?.eatRecoveryTarget ?? base);
  return clamp(override, 0.2, 0.98);
}

function getWorkerHungerDecayPerSecond(worker) {
  const base = Math.max(0, Number(BALANCE.workerHungerDecayPerSecond ?? BALANCE.hungerDecayPerSecond ?? 0.014));
  const multiplier = Number(worker?.metabolism?.hungerDecayMultiplier ?? 1);
  return Math.max(0, base * clamp(multiplier, 0.5, 1.5));
}

function getWorkerRecoveryPerFoodUnit(worker) {
  const base = Number(BALANCE.workerHungerEatRecoveryPerFoodUnit ?? BALANCE.hungerEatRecoveryPerFoodUnit ?? 0.04);
  const multiplier = Number(worker?.metabolism?.eatRecoveryPerFoodMultiplier ?? 1);
  return Math.max(1e-4, base * clamp(multiplier, 0.5, 1.5));
}

export function chooseWorkerIntent(worker, state) {
  const hasWarehouse = Number(state.buildings?.warehouses ?? 0) > 0;
  const hasCarry = Number(worker.carry?.food ?? 0) + Number(worker.carry?.wood ?? 0) > 0;
  const carryTotal = Number(worker.carry?.food ?? 0) + Number(worker.carry?.wood ?? 0);
  const carryAgeSec = Number(worker.blackboard?.carryAgeSec ?? 0);
  const noWorkSite = (worker.role === ROLE.FARM && Number(state.buildings?.farms ?? 0) <= 0)
    || (worker.role === ROLE.WOOD && Number(state.buildings?.lumbers ?? 0) <= 0);
  const alreadyDelivering = String(worker.stateLabel ?? "").toLowerCase().includes("deliver");
  const nearestWarehouseDistance = estimateNearestWarehouseDistance(worker, state);
  const deliverThreshold = Number(BALANCE.workerDeliverThreshold ?? 2.4);
  const carryPressureSec = Number(BALANCE.workerCarryPressureSec ?? 6);
  const farDepotDistance = Number(BALANCE.workerFarDepotDistance ?? 14);

  if ((worker.hunger ?? 1) < getWorkerHungerSeekThreshold(worker) && Number(state.resources?.food ?? 0) > 0) return "eat";
  if (
    hasCarry &&
    hasWarehouse &&
    (
      carryTotal >= deliverThreshold
      || alreadyDelivering
      || noWorkSite
      || carryAgeSec >= carryPressureSec
      || nearestWarehouseDistance >= farDepotDistance
    )
  ) {
    return "deliver";
  }
  if (worker.role === ROLE.FARM && Number(state.buildings?.farms ?? 0) > 0) return "farm";
  if (worker.role === ROLE.WOOD && Number(state.buildings?.lumbers ?? 0) > 0) return "lumber";
  return "wander";
}

function estimateNearestWarehouseDistance(worker, state) {
  if (!state?.grid || !Number.isFinite(worker?.x) || !Number.isFinite(worker?.z)) return 0;
  if (Number(state.buildings?.warehouses ?? 0) <= 0) return Infinity;
  const nearest = findNearestTileOfTypes(state.grid, worker, [TILE.WAREHOUSE]);
  if (!nearest) return Infinity;
  const current = worldToTile(worker.x, worker.z, state.grid);
  return Math.abs(current.ix - nearest.ix) + Math.abs(current.iz - nearest.iz);
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

function getFarmEcologyYieldMultiplier(worker, state) {
  const target = worker.targetTile ?? null;
  if (!target) return { multiplier: 1, pressure: 0 };
  const key = `${target.ix},${target.iz}`;
  const pressure = Math.max(0, Number(state.metrics?.ecology?.farmPressureByKey?.[key] ?? 0));
  const penalty = Math.min(
    Number(BALANCE.ecologyFarmYieldPenaltyMax ?? 0.7),
    pressure * Number(BALANCE.ecologyFarmYieldPenaltyPerPressure ?? 0.44),
  );
  return {
    multiplier: Math.max(0.15, 1 - penalty),
    pressure,
  };
}

function consumeEmergencyRation(worker, state, dt, nowSec) {
  const eatRecoveryTarget = getWorkerEatRecoveryTarget(worker);
  const hungerNow = Number(worker.hunger ?? 0);
  if (hungerNow >= WORKER_EMERGENCY_RATION_HUNGER_THRESHOLD) return;
  if (Number(state.resources.food ?? 0) <= 0) return;
  if (worker.debug?.reachableFood) return;
  worker.blackboard ??= {};
  const nextAllowed = Number(worker.blackboard.emergencyRationCooldownSec ?? -Infinity);
  if (nowSec < nextAllowed) return;
  const recoveryPerFood = getWorkerRecoveryPerFoodUnit(worker);
  const eatRate = Number(BALANCE.hungerEatRatePerSecond ?? 5) * 0.22;
  const gainCap = Math.max(0, eatRecoveryTarget - hungerNow);
  const desiredFood = Math.min(eatRate * dt, gainCap / recoveryPerFood);
  const eat = Math.min(desiredFood, Number(state.resources.food ?? 0));
  if (eat <= 0) return;
  state.resources.food -= eat;
  worker.hunger = clamp(worker.hunger + eat * recoveryPerFood, 0, 1);
  worker.blackboard.emergencyRationCooldownSec = nowSec + WORKER_EMERGENCY_RATION_COOLDOWN_SEC;
}

function maybeRetarget(worker, state, services, intentKey, targetTileTypes) {
  const nowSec = state.metrics.timeSec;
  const blackboard = worker.blackboard ?? (worker.blackboard = {});

  const targetInvalid = !isTargetTileType(worker, state, targetTileTypes);
  const pathStale = Boolean(worker.path) && worker.pathGridVersion !== state.grid.version;
  const pathMissingAwayFromTarget = !hasActivePath(worker, state) && !isAtTargetTile(worker, state);
  const pathStuck = isPathStuck(worker, state, 2.4);
  const shouldRetarget = targetInvalid || pathStale || pathMissingAwayFromTarget || pathStuck;

  if (shouldRetarget) {
    if (!canAttemptPath(worker, state)) {
      return hasActivePath(worker, state) || isAtTargetTile(worker, state);
    }
    const target = findNearestTileOfTypes(state.grid, worker, targetTileTypes);
    if (!target || !setTargetAndPath(worker, target, state, services)) {
      return false;
    }
    blackboard.intentTargetIntent = intentKey;
    blackboard.nextTargetRefreshSec = nowSec + TARGET_REFRESH_BASE_SEC + services.rng.next() * TARGET_REFRESH_JITTER_SEC;
  }

  return hasActivePath(worker, state) || isAtTargetTile(worker, state);
}

function handleEat(worker, state, services, dt) {
  const eatRecoveryTarget = getWorkerEatRecoveryTarget(worker);
  if ((worker.hunger ?? 0) >= eatRecoveryTarget) {
    clearPath(worker);
    setIdleDesired(worker);
    return;
  }

  const canUseWarehouse = state.buildings.warehouses > 0;
  if (canUseWarehouse && maybeRetarget(worker, state, services, "seek_food", [TILE.WAREHOUSE])) {
    if (hasActivePath(worker, state)) {
      const step = followPath(worker, state, dt);
      worker.desiredVel = step.desired;
      if (worker.debug) worker.debug.lastPathLength = worker.path?.length ?? 0;
    } else {
      setIdleDesired(worker);
    }
    if (isAtTargetTile(worker, state)) {
      const recoveryPerFood = getWorkerRecoveryPerFoodUnit(worker);
      const gainCap = Math.max(0, eatRecoveryTarget - Number(worker.hunger ?? 0));
      const desiredFood = Math.min(BALANCE.hungerEatRatePerSecond * dt, gainCap / recoveryPerFood);
      const eat = Math.min(desiredFood, state.resources.food);
      if (eat <= 0) return;
      state.resources.food -= eat;
      worker.hunger = clamp(worker.hunger + eat * recoveryPerFood, 0, 1);
      if ((worker.hunger ?? 0) >= eatRecoveryTarget) {
        clearPath(worker);
      }
    }
    return;
  }

  setIdleDesired(worker);
  consumeEmergencyRation(worker, state, dt, Number(state.metrics.timeSec ?? 0));
}

function handleDeliver(worker, state, services, dt) {
  const carryTotal = Number(worker.carry?.food ?? 0) + Number(worker.carry?.wood ?? 0);
  if (carryTotal <= 0 || Number(state.buildings?.warehouses ?? 0) <= 0) {
    clearPath(worker);
    setIdleDesired(worker);
    worker.blackboard ??= {};
    worker.blackboard.intentTargetIntent = "seek_task";
    worker.blackboard.taskLock = { state: "", untilSec: -Infinity };
    state.metrics.deliverWithoutCarryCount = Number(state.metrics.deliverWithoutCarryCount ?? 0) + 1;
    return;
  }
  if (!maybeRetarget(worker, state, services, "deliver", [TILE.WAREHOUSE])) return;

  if (hasActivePath(worker, state)) {
    const step = followPath(worker, state, dt);
    worker.desiredVel = step.desired;
    if (worker.debug) worker.debug.lastPathLength = worker.path?.length ?? 0;
  } else {
    setIdleDesired(worker);
  }

  if (isAtTargetTile(worker, state)) {
    const key = `${worker.targetTile?.ix ?? -1},${worker.targetTile?.iz ?? -1}`;
    const logistics = state.metrics?.logistics ?? {};
    const inboundLoad = Math.max(1, Number(logistics.warehouseLoadByKey?.[key] ?? 1));
    const penalty = Math.max(1, 1 + Math.max(0, inboundLoad - 1) * Number(BALANCE.warehouseQueuePenalty ?? 0.32));
    const unloadBudget = Math.max(0.2, Number(BALANCE.workerUnloadRatePerSecond ?? 4.2) / penalty) * dt;
    let remaining = unloadBudget;
    const unloadFood = Math.min(Number(worker.carry.food ?? 0), remaining);
    worker.carry.food = Math.max(0, Number(worker.carry.food ?? 0) - unloadFood);
    state.resources.food += unloadFood;
    remaining -= unloadFood;
    const unloadWood = Math.min(Number(worker.carry.wood ?? 0), remaining);
    worker.carry.wood = Math.max(0, Number(worker.carry.wood ?? 0) - unloadWood);
    state.resources.wood += unloadWood;
    worker.debug ??= {};
    worker.debug.targetWarehouseLoad = inboundLoad;
    worker.debug.lastUnloadRate = unloadBudget;
    if (Number(worker.carry.food ?? 0) + Number(worker.carry.wood ?? 0) <= 1e-4) {
      worker.carry.food = 0;
      worker.carry.wood = 0;
      worker.blackboard ??= {};
      worker.blackboard.carryAgeSec = 0;
    }
  }
}

function handleHarvest(worker, state, services, dt) {
  const intentKey = worker.role === ROLE.FARM ? "farm" : "lumber";
  const targetType = worker.role === ROLE.FARM ? TILE.FARM : TILE.LUMBER;
  if (!maybeRetarget(worker, state, services, intentKey, [targetType])) return;

  if (hasActivePath(worker, state)) {
    const step = followPath(worker, state, dt);
    worker.desiredVel = step.desired;
    if (worker.debug) worker.debug.lastPathLength = worker.path?.length ?? 0;
  } else {
    setIdleDesired(worker);
  }

  if (!isAtTargetTile(worker, state)) return;
  if (worker.role === ROLE.FARM) {
    const doctrine = Number(state.gameplay?.modifiers?.farmYield ?? 1);
    const ecology = getFarmEcologyYieldMultiplier(worker, state);
    worker.debug ??= {};
    worker.debug.lastFarmPressure = ecology.pressure;
    worker.debug.lastFarmYieldMultiplier = ecology.multiplier;
    resolveWorkCooldown(
      worker,
      dt,
      Math.max(0.2, state.weather.farmProductionMultiplier * doctrine * ecology.multiplier),
      "food",
      services.rng,
    );
  } else {
    const doctrine = Number(state.gameplay?.modifiers?.lumberYield ?? 1);
    worker.debug ??= {};
    worker.debug.lastFarmPressure = 0;
    worker.debug.lastFarmYieldMultiplier = 1;
    resolveWorkCooldown(worker, dt, Math.max(0.2, state.weather.lumberProductionMultiplier * doctrine), "wood", services.rng);
  }
}

function handleWander(worker, state, services, dt) {
  const blackboard = worker.blackboard ?? (worker.blackboard = {});
  blackboard.intentTargetIntent = "wander";

  const nowSec = state.metrics.timeSec;
  const nextWanderRefreshSec = Number(blackboard.nextWanderRefreshSec ?? -Infinity);
  const stalePath = Boolean(worker.path) && worker.pathGridVersion !== state.grid.version;
  const pathStuck = isPathStuck(worker, state, 2.3);
  if (!hasActivePath(worker, state) || pathStuck) {
    const driftedFromTarget = worker.targetTile ? !isAtTargetTile(worker, state) : true;
    const shouldRetarget = stalePath || driftedFromTarget || nowSec >= nextWanderRefreshSec || pathStuck;
    if (shouldRetarget && canAttemptPath(worker, state)) {
      clearPath(worker);
      if (setTargetAndPath(worker, randomPassableTile(state.grid), state, services)) {
        blackboard.nextWanderRefreshSec = nowSec + WANDER_REFRESH_BASE_SEC + services.rng.next() * WANDER_REFRESH_JITTER_SEC;
      }
    }
  }

  if (hasActivePath(worker, state)) {
    worker.desiredVel = followPath(worker, state, dt).desired;
  } else {
    setIdleDesired(worker);
  }
}

function updateIdleWithoutReasonMetric(worker, stateNode, dt, state) {
  if (stateNode !== "idle" && stateNode !== "wander") return;
  const reason = String(worker.blackboard?.fsm?.reason ?? "");
  if (!reason.includes("no-worksite") && !reason.includes("idle")) return;

  const metrics = state.metrics;
  metrics.idleWithoutReasonSec ??= {};
  const group = String(worker.groupId ?? "workers");
  metrics.idleWithoutReasonSec[group] = Number(metrics.idleWithoutReasonSec[group] ?? 0) + dt;

  const logic = state.debug.logic ?? (state.debug.logic = {
    invalidTransitions: 0,
    goalFlipCount: 0,
    totalPathRecalcs: 0,
    idleWithoutReasonSecByGroup: {},
    pathRecalcByEntity: {},
    lastGoalsByEntity: {},
    deathByReasonAndReachability: {},
  });
  logic.idleWithoutReasonSecByGroup[group] = Number(logic.idleWithoutReasonSecByGroup[group] ?? 0) + dt;
}

export class WorkerAISystem {
  constructor() {
    this.name = "WorkerAISystem";
  }

  update(dt, state, services) {
    for (const worker of state.agents) {
      if (worker.type !== "WORKER") continue;
      if (worker.alive === false) continue;

      worker.hunger = clamp(worker.hunger - getWorkerHungerDecayPerSecond(worker) * dt, 0, 1);
      worker.blackboard ??= {};
      const carryNow = Number(worker.carry?.food ?? 0) + Number(worker.carry?.wood ?? 0);
      worker.blackboard.carryAgeSec = carryNow > 0
        ? Number(worker.blackboard.carryAgeSec ?? 0) + dt
        : 0;
      worker.debug ??= {};
      worker.debug.carryAgeSec = Number(worker.blackboard.carryAgeSec ?? 0);
      worker.debug.nearestWarehouseDistance = Number.isFinite(estimateNearestWarehouseDistance(worker, state))
        ? estimateNearestWarehouseDistance(worker, state)
        : -1;

      const plan = planEntityDesiredState(worker, state);
      const nowSec = Number(state.metrics.timeSec ?? 0);
      const fsm = worker.blackboard?.fsm ?? null;
      worker.blackboard.taskLock ??= { state: "", untilSec: -Infinity };
      const lock = worker.blackboard.taskLock;
      const lockState = String(lock.state ?? "");
      const currentState = String(fsm?.state ?? "");
      const inTaskLock = nowSec < Number(lock.untilSec ?? -Infinity) && lockState === currentState;
      const interruptForSurvival = (plan.desiredState === "seek_food" || plan.desiredState === "eat")
        && Number(worker.hunger ?? 1) < 0.16;
      const desiredState = inTaskLock && plan.desiredState !== currentState && !interruptForSurvival
        ? currentState
        : plan.desiredState;
      const stateNode = transitionEntityState(
        worker,
        "workers",
        desiredState,
        nowSec,
        plan.reason,
      );

      const enteredTaskState = stateNode !== currentState
        && (stateNode === "harvest" || stateNode === "deliver" || stateNode === "eat");
      if (enteredTaskState) {
        worker.blackboard.taskLock = {
          state: stateNode,
          untilSec: nowSec + WORKER_TASK_LOCK_SEC,
        };
      } else if (lockState && stateNode !== lockState) {
        worker.blackboard.taskLock = {
          state: "",
          untilSec: -Infinity,
        };
      }

      worker.blackboard.intent = stateNode;
      worker.stateLabel = mapStateToDisplayLabel("workers", stateNode);
      worker.debug ??= {};
      worker.debug.lastIntent = stateNode;
      worker.debug.lastStateNode = stateNode;

      if (stateNode === "seek_food" || stateNode === "eat") {
        handleEat(worker, state, services, dt);
      } else if (stateNode === "deliver") {
        handleDeliver(worker, state, services, dt);
      } else if (stateNode === "seek_task" || stateNode === "harvest") {
        handleHarvest(worker, state, services, dt);
      } else if (stateNode === "wander") {
        handleWander(worker, state, services, dt);
      } else {
        setIdleDesired(worker);
      }

      updateIdleWithoutReasonMetric(worker, stateNode, dt, state);
    }
  }
}
