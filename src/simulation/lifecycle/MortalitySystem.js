import { ANIMAL_KIND, ENTITY_TYPE, TILE } from "../../config/constants.js";
import { pushWarning } from "../../app/warnings.js";
import { aStar } from "../navigation/AStar.js";
import { findNearestTileOfTypes, worldToTile } from "../../world/grid/Grid.js";

function deathThresholdFor(entity) {
  if (entity.type === ENTITY_TYPE.WORKER) return { hunger: 0.045, holdSec: 34 };
  if (entity.type === ENTITY_TYPE.VISITOR) return { hunger: 0.04, holdSec: 40 };
  if (entity.kind === ANIMAL_KIND.HERBIVORE) return { hunger: 0.035, holdSec: 20 };
  return { hunger: 0.03, holdSec: 28 };
}

function ensureLogicBucket(state) {
  const logic = state.debug.logic ?? (state.debug.logic = {
    invalidTransitions: 0,
    goalFlipCount: 0,
    totalPathRecalcs: 0,
    idleWithoutReasonSecByGroup: {},
    pathRecalcByEntity: {},
    lastGoalsByEntity: {},
    deathByReasonAndReachability: {},
  });
  return logic;
}

function incrementDeathCounters(state, entity, reason, reachableFood) {
  state.metrics.deathsTotal = Number(state.metrics.deathsTotal ?? 0) + 1;
  state.metrics.deathsByReason ??= {};
  state.metrics.deathsByReason[reason] = Number(state.metrics.deathsByReason[reason] ?? 0) + 1;
  state.metrics.deathsByGroup ??= {};
  const groupId = String(entity.groupId ?? entity.kind ?? entity.type ?? "unknown");
  state.metrics.deathsByGroup[groupId] = Number(state.metrics.deathsByGroup[groupId] ?? 0) + 1;

  const reachabilityKey = `${reason}:${reachableFood ? "reachable" : "unreachable"}`;
  state.metrics.deathByReasonAndReachability ??= {};
  state.metrics.deathByReasonAndReachability[reachabilityKey] = Number(state.metrics.deathByReasonAndReachability[reachabilityKey] ?? 0) + 1;

  const logic = ensureLogicBucket(state);
  logic.deathByReasonAndReachability[reachabilityKey] = Number(logic.deathByReasonAndReachability[reachabilityKey] ?? 0) + 1;
}

function markDeath(entity, reason, nowSec, context = null) {
  entity.alive = false;
  entity.deathReason = reason;
  entity.deathSec = nowSec;
  entity.deathContext = context ?? null;
}

function hasReachableWarehouseFood(entity, state, services, nowSec) {
  if (Number(state.resources?.food ?? 0) <= 0) return false;
  if (state.buildings.warehouses <= 0) return false;
  if (Number(entity.carry?.food ?? 0) > 0) return true;

  const bb = entity.blackboard ?? (entity.blackboard = {});
  const deathCtx = bb.deathContext ?? (bb.deathContext = {});
  const lastCheckSec = Number(deathCtx.lastFoodReachCheckSec ?? -Infinity);
  if (nowSec - lastCheckSec < 2.5 && typeof deathCtx.lastFoodReachable === "boolean") {
    return deathCtx.lastFoodReachable;
  }

  const fromTile = worldToTile(entity.x, entity.z, state.grid);
  const target = findNearestTileOfTypes(state.grid, entity, [TILE.WAREHOUSE]);
  if (!target) {
    deathCtx.lastFoodReachable = false;
    deathCtx.lastFoodReachCheckSec = nowSec;
    return false;
  }

  if (fromTile.ix === target.ix && fromTile.iz === target.iz) {
    deathCtx.lastFoodReachable = true;
    deathCtx.lastFoodReachCheckSec = nowSec;
    return true;
  }

  let path = services?.pathCache?.get?.(state.grid.version, fromTile, target) ?? null;
  if (!path) {
    path = aStar(state.grid, fromTile, target, state.weather.moveCostMultiplier);
    if (path) {
      services?.pathCache?.set?.(state.grid.version, fromTile, target, path);
    }
  }

  const reachable = Array.isArray(path) && path.length > 0;
  deathCtx.lastFoodReachable = reachable;
  deathCtx.lastFoodReachCheckSec = nowSec;
  deathCtx.lastFoodSourceTile = target;
  return reachable;
}

function shouldStarve(entity, dt, state, services, nowSec) {
  const { hunger, holdSec } = deathThresholdFor(entity);
  const current = Number(entity.hunger ?? 1);

  if (entity.type === ENTITY_TYPE.WORKER || entity.type === ENTITY_TYPE.VISITOR) {
    const reachableFood = hasReachableWarehouseFood(entity, state, services, nowSec);
    entity.debug ??= {};
    entity.debug.reachableFood = reachableFood;
    if (current <= hunger) {
      if (reachableFood) {
        entity.starvationSec = Math.max(0, Number(entity.starvationSec ?? 0) - dt * 1.6);
      } else {
        entity.starvationSec = Number(entity.starvationSec ?? 0) + dt;
      }
    } else {
      entity.starvationSec = 0;
    }
    return {
      shouldDie: Number(entity.starvationSec ?? 0) >= holdSec && !reachableFood,
      reachableFood,
    };
  }

  if (current <= hunger) {
    entity.starvationSec = Number(entity.starvationSec ?? 0) + dt;
  } else {
    entity.starvationSec = 0;
  }
  return {
    shouldDie: Number(entity.starvationSec ?? 0) >= holdSec,
    reachableFood: false,
  };
}

function buildDeathContext(entity, state, reason, reachableFood) {
  const fsm = entity.blackboard?.fsm ?? null;
  return {
    reason,
    simSec: Number(state.metrics.timeSec ?? 0),
    reachableFood: Boolean(reachableFood),
    hunger: Number(entity.hunger ?? 0),
    hp: Number(entity.hp ?? 0),
    state: fsm?.state ?? entity.stateLabel ?? "-",
    targetTile: entity.targetTile ? { ix: entity.targetTile.ix, iz: entity.targetTile.iz } : null,
    pathIndex: Number(entity.pathIndex ?? 0),
    pathLength: Number(entity.path?.length ?? 0),
    pathGridVersion: Number(entity.pathGridVersion ?? -1),
    aiTarget: entity.blackboard?.aiTargetState ?? null,
  };
}

export class MortalitySystem {
  constructor() {
    this.name = "MortalitySystem";
  }

  update(dt, state, services) {
    const nowSec = Number(state.metrics.timeSec ?? 0);
    const deadIds = new Set();
    const deathEvents = [];

    for (const entity of state.agents) {
      if (entity.alive === false) {
        deadIds.add(entity.id);
        continue;
      }

      let reachableFood = Boolean(entity.debug?.reachableFood);
      if (Number(entity.hp ?? 1) <= 0) {
        const reason = entity.deathReason || "event";
        markDeath(entity, reason, nowSec, buildDeathContext(entity, state, reason, reachableFood));
      } else {
        const starve = shouldStarve(entity, dt, state, services, nowSec);
        reachableFood = starve.reachableFood;
        if (starve.shouldDie) {
          markDeath(entity, "starvation", nowSec, buildDeathContext(entity, state, "starvation", reachableFood));
        }
      }

      if (entity.alive === false) {
        deadIds.add(entity.id);
        incrementDeathCounters(state, entity, entity.deathReason || "event", reachableFood);
        deathEvents.push(`${entity.displayName ?? entity.id} died (${entity.deathReason || "event"}).`);
      }
    }

    for (const animal of state.animals) {
      if (animal.alive === false) {
        deadIds.add(animal.id);
        continue;
      }

      let reachableFood = false;
      if (Number(animal.hp ?? 1) <= 0) {
        const reason = animal.deathReason || "predation";
        markDeath(animal, reason, nowSec, buildDeathContext(animal, state, reason, reachableFood));
      } else {
        const starve = shouldStarve(animal, dt, state, services, nowSec);
        if (starve.shouldDie) {
          markDeath(animal, "starvation", nowSec, buildDeathContext(animal, state, "starvation", reachableFood));
        }
      }

      if (animal.alive === false) {
        deadIds.add(animal.id);
        incrementDeathCounters(state, animal, animal.deathReason || "event", reachableFood);
        deathEvents.push(`${animal.displayName ?? animal.id} died (${animal.deathReason || "event"}).`);
      }
    }

    if (deadIds.size === 0) return;

    state.agents = state.agents.filter((entity) => !deadIds.has(entity.id));
    state.animals = state.animals.filter((entity) => !deadIds.has(entity.id));

    if (state.controls.selectedEntityId && deadIds.has(state.controls.selectedEntityId)) {
      state.controls.selectedEntityId = null;
      state.controls.actionMessage = "Selected entity died and was removed.";
      state.controls.actionKind = "info";
    }

    state.debug.eventTrace ??= [];
    for (const msg of deathEvents) {
      state.debug.eventTrace.unshift(`[${nowSec.toFixed(1)}s] ${msg}`);
      pushWarning(state, msg, "warn", "MortalitySystem");
    }
    state.debug.eventTrace = state.debug.eventTrace.slice(0, 36);
  }
}
