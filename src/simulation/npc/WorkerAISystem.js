import { BALANCE } from "../../config/balance.js";
import { ROLE, TILE } from "../../config/constants.js";
import { clamp } from "../../app/math.js";
import { findNearestTileOfTypes, getTile, listTilesByType, randomPassableTile, worldToTile } from "../../world/grid/Grid.js";
import { canAttemptPath, clearPath, followPath, hasActivePath, isPathStuck, setTargetAndPath } from "../navigation/Navigation.js";
import { mapStateToDisplayLabel, transitionEntityState } from "./state/StateGraph.js";
import { planEntityDesiredState } from "./state/StatePlanner.js";
import { getScenarioRuntime } from "../../world/scenarios/ScenarioFactory.js";

const TARGET_REFRESH_BASE_SEC = 1.2;
const TARGET_REFRESH_JITTER_SEC = 0.7;
const WANDER_REFRESH_BASE_SEC = 1.8;
const WANDER_REFRESH_JITTER_SEC = 1.2;
const WORKER_EMERGENCY_RATION_HUNGER_THRESHOLD = 0.18;
const WORKER_TASK_LOCK_SEC = 1.2;
const WORKER_EMERGENCY_RATION_COOLDOWN_SEC = 2.8;

function tileKey(tile) {
  return `${tile.ix},${tile.iz}`;
}

function manhattanTiles(a, b) {
  return Math.abs(Number(a?.ix ?? 0) - Number(b?.ix ?? 0)) + Math.abs(Number(a?.iz ?? 0) - Number(b?.iz ?? 0));
}

function resolveTargetPriority(policy, key, fallback = 1) {
  return Math.max(0, Math.min(3, Number(policy?.targetPriorities?.[key] ?? fallback)));
}

function countNearbyTiles(state, center, tileTypes, radius = 1) {
  let count = 0;
  const targets = new Set(tileTypes);
  for (let iz = center.iz - radius; iz <= center.iz + radius; iz += 1) {
    for (let ix = center.ix - radius; ix <= center.ix + radius; ix += 1) {
      if (ix < 0 || iz < 0 || ix >= state.grid.width || iz >= state.grid.height) continue;
      if (Math.abs(ix - center.ix) + Math.abs(iz - center.iz) > radius) continue;
      if (targets.has(state.grid.tiles[ix + iz * state.grid.width])) count += 1;
    }
  }
  return count;
}

function minDistanceToTiles(origin, tiles = []) {
  let best = Infinity;
  for (const tile of tiles) {
    const dist = manhattanTiles(origin, tile);
    if (dist < best) best = dist;
  }
  return best;
}

function getWorkerPolicy(worker, state) {
  return worker.policy ?? state.ai.groupPolicies.get("workers")?.data ?? null;
}

function getBrokenRouteGapTiles(runtime) {
  const out = [];
  for (const route of runtime.routes ?? []) {
    if (route.connected) continue;
    for (const gap of route.gapTiles ?? []) out.push(gap);
  }
  return out;
}

function getUnreadyDepotAnchors(runtime) {
  const anchors = runtime.scenario?.anchors ?? {};
  return (runtime.depots ?? [])
    .filter((depot) => !depot.ready)
    .map((depot) => anchors[depot.anchor])
    .filter(Boolean);
}

function chooseWorkerTarget(worker, state, targetTileTypes) {
  const candidates = listTilesByType(state.grid, targetTileTypes);
  if (candidates.length <= 0) return null;

  const policy = getWorkerPolicy(worker, state);
  const current = worldToTile(worker.x, worker.z, state.grid);
  const runtime = getScenarioRuntime(state);
  const brokenRouteTiles = getBrokenRouteGapTiles(runtime);
  const depotAnchors = getUnreadyDepotAnchors(runtime);
  let best = null;

  for (const candidate of candidates) {
    const distance = manhattanTiles(current, candidate);
    const tileType = getTile(state.grid, candidate.ix, candidate.iz);
    const wallCoverage = countNearbyTiles(state, candidate, [TILE.WALL], 1);
    const roadNeighbors = countNearbyTiles(state, candidate, [TILE.ROAD, TILE.WAREHOUSE], 1);
    const frontierDistance = minDistanceToTiles(candidate, brokenRouteTiles);
    const depotDistance = minDistanceToTiles(candidate, depotAnchors);
    const frontierAffinity = Number.isFinite(frontierDistance)
      ? frontierDistance <= 2 ? 1 : frontierDistance <= 5 ? 0.45 : 0
      : 0;
    const depotAffinity = Number.isFinite(depotDistance)
      ? depotDistance <= 2 ? 1 : depotDistance <= 4 ? 0.4 : 0
      : 0;
    const ecologyPressure = tileType === TILE.FARM
      ? Math.max(0, Number(state.metrics?.ecology?.farmPressureByKey?.[tileKey(candidate)] ?? 0))
      : 0;
    const warehouseLoad = tileType === TILE.WAREHOUSE
      ? Number(state.metrics?.logistics?.warehouseLoadByKey?.[tileKey(candidate)] ?? 0)
      : 0;

    let score = -distance * 0.08;
    score += roadNeighbors * 0.1 * resolveTargetPriority(policy, "road", 1);
    score += wallCoverage * 0.07 * resolveTargetPriority(policy, "safety", 1);
    score += frontierAffinity * 0.42 * resolveTargetPriority(policy, "frontier", 1);
    score += depotAffinity * 0.38 * resolveTargetPriority(policy, "depot", 1);

    if (tileType === TILE.WAREHOUSE) {
      score += 0.58 * resolveTargetPriority(policy, "warehouse", 1);
      score -= Math.max(0, warehouseLoad - 1) * 0.18;
    } else if (tileType === TILE.FARM) {
      score += 0.54 * resolveTargetPriority(policy, "farm", 1);
      score -= ecologyPressure * Math.max(0.18, resolveTargetPriority(policy, "safety", 1) * 0.12);
    } else if (tileType === TILE.LUMBER) {
      score += 0.54 * resolveTargetPriority(policy, "lumber", 1);
    } else if (tileType === TILE.QUARRY) {
      score += 0.54 * resolveTargetPriority(policy, "quarry", 1);
    } else if (tileType === TILE.HERB_GARDEN) {
      score += 0.54 * resolveTargetPriority(policy, "herb_garden", 1);
    } else if (tileType === TILE.KITCHEN) {
      score += 0.58 * resolveTargetPriority(policy, "kitchen", 1);
    } else if (tileType === TILE.SMITHY) {
      score += 0.58 * resolveTargetPriority(policy, "smithy", 1);
    } else if (tileType === TILE.CLINIC) {
      score += 0.58 * resolveTargetPriority(policy, "clinic", 1);
    }

    if (!best || score > best.score) {
      best = {
        tile: candidate,
        score,
        meta: {
          frontierAffinity,
          depotAffinity,
          warehouseLoad,
          ecologyPressure,
        },
      };
    }
  }

  worker.debug ??= {};
  worker.debug.policyTargetScore = Number(best?.score ?? 0);
  worker.debug.policyTargetFrontier = Number(best?.meta?.frontierAffinity ?? 0);
  worker.debug.policyTargetDepot = Number(best?.meta?.depotAffinity ?? 0);
  worker.debug.policyTargetWarehouseLoad = Number(best?.meta?.warehouseLoad ?? 0);
  worker.debug.policyTargetEcology = Number(best?.meta?.ecologyPressure ?? 0);
  return best?.tile ?? null;
}

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
  const hasCarry = Number(worker.carry?.food ?? 0) + Number(worker.carry?.wood ?? 0) + Number(worker.carry?.stone ?? 0) + Number(worker.carry?.herbs ?? 0) > 0;
  const carryTotal = Number(worker.carry?.food ?? 0) + Number(worker.carry?.wood ?? 0) + Number(worker.carry?.stone ?? 0) + Number(worker.carry?.herbs ?? 0);
  const carryAgeSec = Number(worker.blackboard?.carryAgeSec ?? 0);
  const noWorkSite = (worker.role === ROLE.FARM && Number(state.buildings?.farms ?? 0) <= 0)
    || (worker.role === ROLE.WOOD && Number(state.buildings?.lumbers ?? 0) <= 0)
    || (worker.role === ROLE.STONE && Number(state.buildings?.quarries ?? 0) <= 0)
    || (worker.role === ROLE.HERBS && Number(state.buildings?.herbGardens ?? 0) <= 0)
    || (worker.role === ROLE.COOK && Number(state.buildings?.kitchens ?? 0) <= 0)
    || (worker.role === ROLE.SMITH && Number(state.buildings?.smithies ?? 0) <= 0)
    || (worker.role === ROLE.HERBALIST && Number(state.buildings?.clinics ?? 0) <= 0);
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
  if (worker.role === ROLE.STONE && Number(state.buildings?.quarries ?? 0) > 0) return "quarry";
  if (worker.role === ROLE.HERBS && Number(state.buildings?.herbGardens ?? 0) > 0) return "gather_herbs";
  if (worker.role === ROLE.COOK && Number(state.buildings?.kitchens ?? 0) > 0) return "cook";
  if (worker.role === ROLE.SMITH && Number(state.buildings?.smithies ?? 0) > 0) return "smith";
  if (worker.role === ROLE.HERBALIST && Number(state.buildings?.clinics ?? 0) > 0) return "heal";
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
    const target = chooseWorkerTarget(worker, state, targetTileTypes)
      ?? findNearestTileOfTypes(state.grid, worker, targetTileTypes);
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

      // Prefer meals over raw food
      if (Number(state.resources.meals ?? 0) > 0) {
        const recoveryPerMeal = recoveryPerFood * Number(BALANCE.mealHungerRecoveryMultiplier ?? 2.0);
        const mealGainCap = Math.max(0, eatRecoveryTarget - Number(worker.hunger ?? 0));
        const desiredMeals = Math.min(BALANCE.hungerEatRatePerSecond * dt, mealGainCap / recoveryPerMeal);
        const eatMeals = Math.min(desiredMeals, state.resources.meals);
        if (eatMeals > 0) {
          state.resources.meals -= eatMeals;
          worker.hunger = clamp(worker.hunger + eatMeals * recoveryPerMeal, 0, 1);
        }
      } else {
        const eat = Math.min(desiredFood, state.resources.food);
        if (eat <= 0) return;
        state.resources.food -= eat;
        worker.hunger = clamp(worker.hunger + eat * recoveryPerFood, 0, 1);
      }

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
  const carryTotal = Number(worker.carry?.food ?? 0) + Number(worker.carry?.wood ?? 0) + Number(worker.carry?.stone ?? 0) + Number(worker.carry?.herbs ?? 0);
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
    remaining -= unloadWood;
    const unloadStone = Math.min(Number(worker.carry.stone ?? 0), remaining);
    worker.carry.stone = Math.max(0, Number(worker.carry.stone ?? 0) - unloadStone);
    state.resources.stone = (state.resources.stone ?? 0) + unloadStone;
    remaining -= unloadStone;
    const unloadHerbs = Math.min(Number(worker.carry.herbs ?? 0), remaining);
    worker.carry.herbs = Math.max(0, Number(worker.carry.herbs ?? 0) - unloadHerbs);
    state.resources.herbs = (state.resources.herbs ?? 0) + unloadHerbs;
    worker.debug ??= {};
    worker.debug.targetWarehouseLoad = inboundLoad;
    worker.debug.lastUnloadRate = unloadBudget;
    if (Number(worker.carry.food ?? 0) + Number(worker.carry.wood ?? 0) + Number(worker.carry.stone ?? 0) + Number(worker.carry.herbs ?? 0) <= 1e-4) {
      worker.carry.food = 0;
      worker.carry.wood = 0;
      worker.carry.stone = 0;
      worker.carry.herbs = 0;
      worker.blackboard ??= {};
      worker.blackboard.carryAgeSec = 0;
    }
  }
}

const ROLE_HARVEST_CONFIG = {
  [ROLE.FARM]: { intentKey: "farm", tileTypes: [TILE.FARM] },
  [ROLE.WOOD]: { intentKey: "lumber", tileTypes: [TILE.LUMBER] },
  [ROLE.STONE]: { intentKey: "quarry", tileTypes: [TILE.QUARRY] },
  [ROLE.HERBS]: { intentKey: "gather_herbs", tileTypes: [TILE.HERB_GARDEN] },
};

const ROLE_PROCESS_CONFIG = {
  [ROLE.COOK]: { intentKey: "cook", tileTypes: [TILE.KITCHEN] },
  [ROLE.SMITH]: { intentKey: "smith", tileTypes: [TILE.SMITHY] },
  [ROLE.HERBALIST]: { intentKey: "heal", tileTypes: [TILE.CLINIC] },
};

function handleHarvest(worker, state, services, dt) {
  const config = ROLE_HARVEST_CONFIG[worker.role];
  const intentKey = config?.intentKey ?? (worker.role === ROLE.FARM ? "farm" : "lumber");
  const targetTypes = config?.tileTypes ?? (worker.role === ROLE.FARM ? [TILE.FARM] : [TILE.LUMBER]);
  if (!maybeRetarget(worker, state, services, intentKey, targetTypes)) return;

  if (hasActivePath(worker, state)) {
    const step = followPath(worker, state, dt);
    worker.desiredVel = step.desired;
    if (worker.debug) worker.debug.lastPathLength = worker.path?.length ?? 0;
  } else {
    setIdleDesired(worker);
  }

  if (!isAtTargetTile(worker, state)) return;
  const toolMultiplier = Number(state.gameplay?.toolProductionMultiplier ?? 1);
  if (worker.role === ROLE.FARM) {
    const doctrine = Number(state.gameplay?.modifiers?.farmYield ?? 1);
    const ecology = getFarmEcologyYieldMultiplier(worker, state);
    worker.debug ??= {};
    worker.debug.lastFarmPressure = ecology.pressure;
    worker.debug.lastFarmYieldMultiplier = ecology.multiplier;
    resolveWorkCooldown(
      worker,
      dt,
      Math.max(0.2, state.weather.farmProductionMultiplier * doctrine * ecology.multiplier * toolMultiplier),
      "food",
      services.rng,
    );
  } else if (worker.role === ROLE.STONE) {
    worker.debug ??= {};
    worker.debug.lastFarmPressure = 0;
    worker.debug.lastFarmYieldMultiplier = 1;
    resolveWorkCooldown(worker, dt, Math.max(0.2, Number(state.weather?.farmProductionMultiplier ?? 1) * toolMultiplier), "stone", services.rng);
  } else if (worker.role === ROLE.HERBS) {
    worker.debug ??= {};
    worker.debug.lastFarmPressure = 0;
    worker.debug.lastFarmYieldMultiplier = 1;
    resolveWorkCooldown(worker, dt, Math.max(0.2, Number(state.weather?.farmProductionMultiplier ?? 1) * toolMultiplier), "herbs", services.rng);
  } else {
    const doctrine = Number(state.gameplay?.modifiers?.lumberYield ?? 1);
    worker.debug ??= {};
    worker.debug.lastFarmPressure = 0;
    worker.debug.lastFarmYieldMultiplier = 1;
    resolveWorkCooldown(worker, dt, Math.max(0.2, state.weather.lumberProductionMultiplier * doctrine * toolMultiplier), "wood", services.rng);
  }
}

function handleProcess(worker, state, services, dt) {
  const config = ROLE_PROCESS_CONFIG[worker.role];
  if (!config) {
    setIdleDesired(worker);
    return;
  }
  if (!maybeRetarget(worker, state, services, config.intentKey, config.tileTypes)) return;

  if (hasActivePath(worker, state)) {
    const step = followPath(worker, state, dt);
    worker.desiredVel = step.desired;
    if (worker.debug) worker.debug.lastPathLength = worker.path?.length ?? 0;
  } else {
    setIdleDesired(worker);
  }

  // Worker stays at the building; actual processing is handled by ProcessingSystem
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
      const carryNow = Number(worker.carry?.food ?? 0) + Number(worker.carry?.wood ?? 0) + Number(worker.carry?.stone ?? 0) + Number(worker.carry?.herbs ?? 0);
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
        && (stateNode === "harvest" || stateNode === "deliver" || stateNode === "eat" || stateNode === "process");
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
      } else if (stateNode === "process") {
        handleProcess(worker, state, services, dt);
      } else if (stateNode === "seek_task" || stateNode === "harvest") {
        if (ROLE_PROCESS_CONFIG[worker.role]) {
          handleProcess(worker, state, services, dt);
        } else {
          handleHarvest(worker, state, services, dt);
        }
      } else if (stateNode === "wander") {
        handleWander(worker, state, services, dt);
      } else {
        setIdleDesired(worker);
      }

      updateIdleWithoutReasonMetric(worker, stateNode, dt, state);
    }
  }
}
