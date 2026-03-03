import { BALANCE } from "../../config/balance.js";
import { ROLE, TILE } from "../../config/constants.js";
import { clamp } from "../../app/math.js";
import { findNearestTileOfTypes, getTile, randomPassableTile, worldToTile } from "../../world/grid/Grid.js";
import { canAttemptPath, clearPath, followPath, isPathStuck, setTargetAndPath } from "../navigation/Navigation.js";
import { mapStateToDisplayLabel, transitionEntityState } from "./state/StateGraph.js";
import { planEntityDesiredState } from "./state/StatePlanner.js";

const TARGET_REFRESH_BASE_SEC = 1.2;
const TARGET_REFRESH_JITTER_SEC = 0.7;
const WANDER_REFRESH_BASE_SEC = 1.8;
const WANDER_REFRESH_JITTER_SEC = 1.2;
const DELIVER_THRESHOLD = 2.4;

export function chooseWorkerIntent(worker, state) {
  const hasWarehouse = Number(state.buildings?.warehouses ?? 0) > 0;
  const hasCarry = Number(worker.carry?.food ?? 0) + Number(worker.carry?.wood ?? 0) > 0;
  const carryTotal = Number(worker.carry?.food ?? 0) + Number(worker.carry?.wood ?? 0);
  const noWorkSite = (worker.role === ROLE.FARM && Number(state.buildings?.farms ?? 0) <= 0)
    || (worker.role === ROLE.WOOD && Number(state.buildings?.lumbers ?? 0) <= 0);
  const alreadyDelivering = String(worker.stateLabel ?? "").toLowerCase().includes("deliver");

  if ((worker.hunger ?? 1) < 0.3 && Number(state.resources?.food ?? 0) > 0) return "eat";
  if (hasCarry && hasWarehouse && (carryTotal >= DELIVER_THRESHOLD || alreadyDelivering || noWorkSite)) {
    return "deliver";
  }
  if (worker.role === ROLE.FARM && Number(state.buildings?.farms ?? 0) > 0) return "farm";
  if (worker.role === ROLE.WOOD && Number(state.buildings?.lumbers ?? 0) > 0) return "lumber";
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

function consumeEmergencyRation(worker, state, dt) {
  if (Number(state.resources.food ?? 0) <= 0) return;
  const eatRate = Number(BALANCE.hungerEatRatePerSecond ?? 5) * 0.45;
  const eat = Math.min(eatRate * dt, Number(state.resources.food ?? 0));
  if (eat <= 0) return;
  state.resources.food -= eat;
  worker.hunger = clamp(worker.hunger + eat * Number(BALANCE.hungerEatRecoveryPerFoodUnit ?? 0.04), 0, 1);
}

function maybeRetarget(worker, state, services, intentKey, targetTileTypes) {
  const nowSec = state.metrics.timeSec;
  const blackboard = worker.blackboard ?? (worker.blackboard = {});

  const intentChanged = blackboard.intentTargetIntent !== intentKey;
  const targetInvalid = !isTargetTileType(worker, state, targetTileTypes);
  const pathStale = Boolean(worker.path) && worker.pathGridVersion !== state.grid.version;
  const pathMissingAwayFromTarget = !hasActivePath(worker, state) && !isAtTargetTile(worker, state);
  const pathStuck = isPathStuck(worker, state, 2.4);
  const shouldRetarget = intentChanged || targetInvalid || pathStale || pathMissingAwayFromTarget || pathStuck;

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
      const eat = Math.min(BALANCE.hungerEatRatePerSecond * dt, state.resources.food);
      state.resources.food -= eat;
      worker.hunger = clamp(worker.hunger + eat * BALANCE.hungerEatRecoveryPerFoodUnit, 0, 1);
    }
    return;
  }

  setIdleDesired(worker);
  consumeEmergencyRation(worker, state, dt);
}

function handleDeliver(worker, state, services, dt) {
  if (!maybeRetarget(worker, state, services, "deliver", [TILE.WAREHOUSE])) return;

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
    resolveWorkCooldown(worker, dt, Math.max(0.2, state.weather.farmProductionMultiplier * doctrine), "food", services.rng);
  } else {
    const doctrine = Number(state.gameplay?.modifiers?.lumberYield ?? 1);
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

      worker.hunger = clamp(worker.hunger - BALANCE.hungerDecayPerSecond * dt, 0, 1);

      const plan = planEntityDesiredState(worker, state);
      const stateNode = transitionEntityState(
        worker,
        "workers",
        plan.desiredState,
        state.metrics.timeSec,
        plan.reason,
      );

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
