import { ANIMAL_KIND, ENTITY_TYPE, TILE } from "../../config/constants.js";
import { pushWarning } from "../../app/warnings.js";
import { aStar } from "../navigation/AStar.js";
import { findNearestTileOfTypes, worldToTile } from "../../world/grid/Grid.js";

const NEARBY_FARM_SUPPLY_MAX_PATH_LEN = 16;

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

function resolveReachability(entity, state, services, fromTile, target, sourceType) {
  if (!target) return { reachable: false, sourceType: "none", pathLength: 0 };
  if (fromTile.ix === target.ix && fromTile.iz === target.iz) {
    return { reachable: true, sourceType, pathLength: 0 };
  }

  let path = services?.pathCache?.get?.(state.grid.version, fromTile, target) ?? null;
  if (!path) {
    path = aStar(state.grid, fromTile, target, state.weather.moveCostMultiplier);
    if (path) {
      services?.pathCache?.set?.(state.grid.version, fromTile, target, path);
    }
  }

  const reachable = Array.isArray(path) && path.length > 0;
  return {
    reachable,
    sourceType: reachable ? sourceType : "none",
    pathLength: reachable ? Number(path.length ?? 0) : 0,
  };
}

function hasReachableNutritionSource(entity, state, services, nowSec) {
  if (Number(entity.carry?.food ?? 0) > 0) {
    return { reachable: true, sourceType: "carry", pathLength: 0 };
  }

  const bb = entity.blackboard ?? (entity.blackboard = {});
  const deathCtx = bb.deathContext ?? (bb.deathContext = {});
  const lastCheckSec = Number(deathCtx.lastFoodReachCheckSec ?? -Infinity);
  if (nowSec - lastCheckSec < 2.5 && typeof deathCtx.lastFoodReachable === "boolean") {
    return {
      reachable: deathCtx.lastFoodReachable,
      sourceType: String(deathCtx.lastFoodSourceType ?? "none"),
      pathLength: Number(deathCtx.lastFoodPathLength ?? 0),
    };
  }

  const fromTile = worldToTile(entity.x, entity.z, state.grid);

  if (Number(state.resources?.food ?? 0) > 0 && Number(state.buildings?.warehouses ?? 0) > 0) {
    const warehouse = findNearestTileOfTypes(state.grid, entity, [TILE.WAREHOUSE]);
    const resolved = resolveReachability(entity, state, services, fromTile, warehouse, "warehouse");
    if (resolved.reachable) {
      deathCtx.lastFoodReachable = true;
      deathCtx.lastFoodReachCheckSec = nowSec;
      deathCtx.lastFoodSourceTile = warehouse;
      deathCtx.lastFoodSourceType = resolved.sourceType;
      deathCtx.lastFoodPathLength = resolved.pathLength;
      return resolved;
    }
  }

  if (Number(state.buildings?.farms ?? 0) > 0) {
    const farm = findNearestTileOfTypes(state.grid, entity, [TILE.FARM]);
    const resolved = resolveReachability(entity, state, services, fromTile, farm, "nearby-farm");
    if (resolved.reachable && resolved.pathLength <= NEARBY_FARM_SUPPLY_MAX_PATH_LEN) {
      deathCtx.lastFoodReachable = true;
      deathCtx.lastFoodReachCheckSec = nowSec;
      deathCtx.lastFoodSourceTile = farm;
      deathCtx.lastFoodSourceType = resolved.sourceType;
      deathCtx.lastFoodPathLength = resolved.pathLength;
      return resolved;
    }
  }

  deathCtx.lastFoodReachable = false;
  deathCtx.lastFoodReachCheckSec = nowSec;
  deathCtx.lastFoodSourceType = "none";
  deathCtx.lastFoodPathLength = 0;
  return { reachable: false, sourceType: "none", pathLength: 0 };
}

function shouldStarve(entity, dt, state, services, nowSec) {
  const { hunger, holdSec } = deathThresholdFor(entity);
  const current = Number(entity.hunger ?? 1);

  if (entity.type === ENTITY_TYPE.WORKER || entity.type === ENTITY_TYPE.VISITOR) {
    const nutrition = hasReachableNutritionSource(entity, state, services, nowSec);
    entity.debug ??= {};
    entity.debug.reachableFood = nutrition.reachable;
    entity.debug.nutritionSourceType = nutrition.sourceType;
    if (current <= hunger) {
      if (nutrition.reachable) {
        entity.starvationSec = Math.max(0, Number(entity.starvationSec ?? 0) - dt * 1.2);
      } else {
        entity.starvationSec = Number(entity.starvationSec ?? 0) + dt;
      }
    } else {
      entity.starvationSec = 0;
    }

    return {
      shouldDie: Number(entity.starvationSec ?? 0) >= holdSec && !nutrition.reachable,
      reachableFood: nutrition.reachable,
      nutritionSourceType: nutrition.sourceType,
      isStarvationRisk: current <= hunger && !nutrition.reachable,
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
    nutritionSourceType: "none",
    isStarvationRisk: current <= hunger,
  };
}

function buildDeathContext(entity, state, reason, reachableFood, nutritionSourceType = "none") {
  const fsm = entity.blackboard?.fsm ?? null;
  return {
    reason,
    simSec: Number(state.metrics.timeSec ?? 0),
    reachableFood: Boolean(reachableFood),
    nutritionReachable: Boolean(reachableFood),
    nutritionSourceType,
    starvationSecAtDeath: Number(entity.starvationSec ?? 0),
    hunger: Number(entity.hunger ?? 0),
    hp: Number(entity.hp ?? 0),
    state: fsm?.state ?? entity.stateLabel ?? "-",
    targetTile: entity.targetTile ? { ix: entity.targetTile.ix, iz: entity.targetTile.iz } : null,
    pathIndex: Number(entity.pathIndex ?? 0),
    pathLength: Number(entity.path?.length ?? 0),
    pathGridVersion: Number(entity.pathGridVersion ?? -1),
    aiTarget: entity.blackboard?.aiTargetState ?? null,
    lastFeasibilityReject: entity.blackboard?.lastFeasibilityReject ?? null,
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
    let starvationRiskCount = 0;

    for (const entity of state.agents) {
      if (entity.alive === false) {
        deadIds.add(entity.id);
        continue;
      }

      let reachableFood = Boolean(entity.debug?.reachableFood);
      let nutritionSourceType = String(entity.debug?.nutritionSourceType ?? "none");
      if (Number(entity.hp ?? 1) <= 0) {
        const reason = entity.deathReason || "event";
        markDeath(entity, reason, nowSec, buildDeathContext(entity, state, reason, reachableFood, nutritionSourceType));
      } else {
        const starve = shouldStarve(entity, dt, state, services, nowSec);
        reachableFood = starve.reachableFood;
        nutritionSourceType = starve.nutritionSourceType;
        if (starve.isStarvationRisk) starvationRiskCount += 1;
        if (starve.shouldDie) {
          markDeath(entity, "starvation", nowSec, buildDeathContext(entity, state, "starvation", reachableFood, nutritionSourceType));
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

      const reachableFood = false;
      if (Number(animal.hp ?? 1) <= 0) {
        const reason = animal.deathReason || "predation";
        markDeath(animal, reason, nowSec, buildDeathContext(animal, state, reason, reachableFood, "none"));
      } else {
        const starve = shouldStarve(animal, dt, state, services, nowSec);
        if (starve.isStarvationRisk) starvationRiskCount += 1;
        if (starve.shouldDie) {
          markDeath(animal, "starvation", nowSec, buildDeathContext(animal, state, "starvation", reachableFood, "none"));
        }
      }

      if (animal.alive === false) {
        deadIds.add(animal.id);
        incrementDeathCounters(state, animal, animal.deathReason || "event", reachableFood);
        deathEvents.push(`${animal.displayName ?? animal.id} died (${animal.deathReason || "event"}).`);
      }
    }

    state.metrics.starvationRiskCount = starvationRiskCount;

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
