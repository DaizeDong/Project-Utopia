import { BALANCE } from "../../../config/balance.js";
import { ANIMAL_KIND, ROLE, TILE } from "../../../config/constants.js";
import { getTile, worldToTile } from "../../../world/grid/Grid.js";
import { listGroupStates } from "./StateGraph.js";

function hasActivePath(entity, state) {
  return Boolean(
    entity.path &&
      entity.pathIndex < entity.path.length &&
      entity.pathGridVersion === state.grid.version,
  );
}

function isAtTargetTile(entity, state) {
  if (!entity.targetTile) return false;
  const current = worldToTile(entity.x, entity.z, state.grid);
  return current.ix === entity.targetTile.ix && current.iz === entity.targetTile.iz;
}

function isTargetTileType(entity, state, targetTileTypes) {
  if (!entity.targetTile) return false;
  const tile = getTile(state.grid, entity.targetTile.ix, entity.targetTile.iz);
  return targetTileTypes.includes(tile);
}

function deriveWorkerDesiredState(worker, state) {
  if ((worker.hunger ?? 1) < 0.28 && (state.resources.food > 0 || state.buildings.warehouses > 0)) {
    return {
      desiredState: isAtTargetTile(worker, state) && isTargetTileType(worker, state, [TILE.WAREHOUSE])
        ? "eat"
        : "seek_food",
      reason: "rule:hunger",
    };
  }

  const hasWarehouse = state.buildings.warehouses > 0;
  const carryTotal = Number(worker.carry?.food ?? 0) + Number(worker.carry?.wood ?? 0);
  const noWorkSite = (worker.role === ROLE.FARM && state.buildings.farms <= 0)
    || (worker.role === ROLE.WOOD && state.buildings.lumbers <= 0);
  if (hasWarehouse && carryTotal > 0 && (carryTotal >= 2.4 || noWorkSite || worker.blackboard?.fsm?.state === "deliver")) {
    return { desiredState: "deliver", reason: "rule:deliver" };
  }

  if (worker.role === ROLE.FARM && state.buildings.farms > 0) {
    const atFarm = isAtTargetTile(worker, state) && isTargetTileType(worker, state, [TILE.FARM]);
    return { desiredState: atFarm ? "harvest" : "seek_task", reason: "rule:farm" };
  }

  if (worker.role === ROLE.WOOD && state.buildings.lumbers > 0) {
    const atLumber = isAtTargetTile(worker, state) && isTargetTileType(worker, state, [TILE.LUMBER]);
    return { desiredState: atLumber ? "harvest" : "seek_task", reason: "rule:lumber" };
  }

  if (noWorkSite) return { desiredState: "wander", reason: "rule:no-worksite" };
  return { desiredState: "idle", reason: "rule:idle" };
}

function deriveTraderDesiredState(visitor, state) {
  if ((visitor.hunger ?? 1) < 0.22 && state.resources.food > 0) {
    return {
      desiredState: isAtTargetTile(visitor, state) && isTargetTileType(visitor, state, [TILE.WAREHOUSE])
        ? "eat"
        : "seek_food",
      reason: "rule:hunger",
    };
  }
  if (state.buildings.warehouses <= 0) return { desiredState: "wander", reason: "rule:no-warehouse" };
  if (isAtTargetTile(visitor, state) && isTargetTileType(visitor, state, [TILE.WAREHOUSE])) {
    return { desiredState: "trade", reason: "rule:at-warehouse" };
  }
  return { desiredState: "seek_trade", reason: "rule:trade" };
}

function deriveSaboteurDesiredState(visitor, state) {
  if ((visitor.hunger ?? 1) < 0.2 && state.resources.food > 0) {
    return {
      desiredState: isAtTargetTile(visitor, state) && isTargetTileType(visitor, state, [TILE.WAREHOUSE])
        ? "eat"
        : "seek_food",
      reason: "rule:hunger",
    };
  }
  if ((visitor.sabotageCooldown ?? 0) <= 0) return { desiredState: "sabotage", reason: "rule:ready" };
  if (hasActivePath(visitor, state)) return { desiredState: "scout", reason: "rule:path-active" };
  if ((visitor.sabotageCooldown ?? 0) > Number(BALANCE.sabotageCooldownMinSec ?? 7) * 0.5) {
    return { desiredState: "evade", reason: "rule:cooldown" };
  }
  return { desiredState: "scout", reason: "rule:scout" };
}

function distanceSq(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function nearestPredator(herbivore, predators) {
  let best = null;
  let bestSq = Infinity;
  for (const predator of predators ?? []) {
    if (!predator || predator.alive === false) continue;
    const dSq = distanceSq(herbivore, predator);
    if (dSq < bestSq) {
      bestSq = dSq;
      best = predator;
    }
  }
  return { predator: best, distance: Math.sqrt(bestSq) };
}

function nearestHerbivore(predator, herbivores) {
  let best = null;
  let bestSq = Infinity;
  for (const prey of herbivores ?? []) {
    if (!prey || prey.alive === false) continue;
    const dSq = distanceSq(predator, prey);
    if (dSq < bestSq) {
      bestSq = dSq;
      best = prey;
    }
  }
  return { prey: best, distance: Math.sqrt(bestSq) };
}

function countNearbyKind(entity, list, radius = 3.2) {
  const r2 = radius * radius;
  let count = 0;
  for (const other of list ?? []) {
    if (!other || other.id === entity.id || other.alive === false) continue;
    const dx = other.x - entity.x;
    const dz = other.z - entity.z;
    if (dx * dx + dz * dz <= r2) count += 1;
  }
  return count;
}

function deriveHerbivoreDesiredState(animal, context) {
  const { predators = [], herbivores = [] } = context ?? {};
  const { predator, distance } = nearestPredator(animal, predators);
  if (predator && distance < 4.6) return { desiredState: "flee", reason: "rule:predator-near" };
  if ((animal.hunger ?? 1) < 0.55) return { desiredState: "graze", reason: "rule:hunger" };
  if (countNearbyKind(animal, herbivores, 3.4) >= 2) return { desiredState: "regroup", reason: "rule:herd" };
  return { desiredState: "wander", reason: "rule:wander" };
}

function derivePredatorDesiredState(animal, context) {
  const { herbivores = [] } = context ?? {};
  const { prey, distance } = nearestHerbivore(animal, herbivores);
  if (!prey) {
    return (animal.hunger ?? 1) > 0.86
      ? { desiredState: "rest", reason: "rule:no-prey-rest" }
      : { desiredState: "roam", reason: "rule:no-prey-roam" };
  }
  if (distance < Number(BALANCE.predatorAttackDistance ?? 0.9) * 1.1) {
    return { desiredState: "feed", reason: "rule:attack-range" };
  }
  if (distance < 5.2) return { desiredState: "hunt", reason: "rule:hunt" };
  return { desiredState: "stalk", reason: "rule:stalk" };
}

function isCriticalLocalState(groupId, localState) {
  if (groupId === "workers" || groupId === "traders" || groupId === "saboteurs") {
    return localState === "seek_food" || localState === "eat";
  }
  if (groupId === "herbivores") return localState === "flee";
  if (groupId === "predators") return localState === "feed";
  return false;
}

function applyGroupTargetOverride(groupId, localDesired, localReason, entity, state, nowSec) {
  const entry = state.ai.groupStateTargets?.get?.(groupId);
  if (!entry) {
    return { desiredState: localDesired, reason: localReason, aiApplied: false };
  }

  if (Number(entry.expiresAtSec ?? -1) <= nowSec) {
    state.ai.groupStateTargets.delete(groupId);
    return { desiredState: localDesired, reason: localReason, aiApplied: false };
  }

  const allowed = listGroupStates(groupId);
  const targetState = String(entry.targetState ?? "");
  if (!allowed.includes(targetState)) {
    return { desiredState: localDesired, reason: localReason, aiApplied: false };
  }

  const priority = Number(entry.priority ?? 0);
  if (priority < 0.35) {
    return { desiredState: localDesired, reason: localReason, aiApplied: false };
  }

  if (isCriticalLocalState(groupId, localDesired) && priority < 0.75) {
    return { desiredState: localDesired, reason: localReason, aiApplied: false };
  }

  if (targetState === localDesired) {
    return { desiredState: localDesired, reason: `${localReason}|ai-align`, aiApplied: false };
  }

  return {
    desiredState: targetState,
    reason: `ai-target:${targetState}(${String(entry.source ?? "llm")})`,
    aiApplied: true,
  };
}

export function recordDesiredGoal(entity, desiredState, state, nowSec) {
  const logic = state.debug.logic ?? (state.debug.logic = {
    invalidTransitions: 0,
    goalFlipCount: 0,
    totalPathRecalcs: 0,
    idleWithoutReasonSecByGroup: {},
    pathRecalcByEntity: {},
    lastGoalsByEntity: {},
    deathByReasonAndReachability: {},
  });

  const key = String(entity.id ?? "");
  const prev = logic.lastGoalsByEntity[key];
  const lastGoalSec = Number(entity.debug?.lastGoalSetSec ?? -Infinity);
  if (prev && prev !== desiredState && Number.isFinite(lastGoalSec) && nowSec - lastGoalSec <= 3.0) {
    logic.goalFlipCount = Number(logic.goalFlipCount ?? 0) + 1;
    state.metrics.goalFlipCount = Number(state.metrics.goalFlipCount ?? 0) + 1;
  }
  logic.lastGoalsByEntity[key] = desiredState;
  entity.debug ??= {};
  entity.debug.lastGoalSetSec = nowSec;
}

export function planEntityDesiredState(entity, state, context = {}) {
  const nowSec = Number(state.metrics.timeSec ?? 0);
  const groupId = String(entity.groupId ?? "");

  let local = { desiredState: "idle", reason: "rule:idle" };
  if (groupId === "workers") {
    local = deriveWorkerDesiredState(entity, state);
  } else if (groupId === "traders") {
    local = deriveTraderDesiredState(entity, state);
  } else if (groupId === "saboteurs") {
    local = deriveSaboteurDesiredState(entity, state);
  } else if (groupId === "herbivores") {
    local = deriveHerbivoreDesiredState(entity, context);
  } else if (groupId === "predators") {
    local = derivePredatorDesiredState(entity, context);
  }

  const merged = applyGroupTargetOverride(groupId, local.desiredState, local.reason, entity, state, nowSec);
  recordDesiredGoal(entity, merged.desiredState, state, nowSec);

  entity.debug ??= {};
  entity.debug.localDesiredState = local.desiredState;
  entity.debug.desiredStateNode = merged.desiredState;
  entity.debug.aiTargetApplied = Boolean(merged.aiApplied);
  entity.debug.aiTargetReason = merged.aiApplied ? merged.reason : "";

  return {
    groupId,
    desiredState: merged.desiredState,
    reason: merged.reason,
    localDesiredState: local.desiredState,
    aiApplied: merged.aiApplied,
  };
}
