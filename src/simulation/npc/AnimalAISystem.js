import { BALANCE } from "../../config/balance.js";
import { ANIMAL_KIND, TILE } from "../../config/constants.js";
import { clamp } from "../../app/math.js";
import { findNearestTileOfTypes, getTile, inBounds, randomPassableTile, worldToTile } from "../../world/grid/Grid.js";
import { canAttemptPath, clearPath, followPath, isPathStuck, setTargetAndPath } from "../navigation/Navigation.js";
import { mapStateToDisplayLabel, transitionEntityState } from "./state/StateGraph.js";
import { planEntityDesiredState } from "./state/StatePlanner.js";

const PREDATOR_HUNT_REFRESH_SEC = 1.15;
const HERBIVORE_FLEE_REFRESH_SEC = 0.9;
const WANDER_REFRESH_BASE_SEC = 2.2;
const WANDER_REFRESH_JITTER_SEC = 1.4;
const HERBIVORE_FLEE_ENTER_DIST = 3.4;
const HERBIVORE_FLEE_EXIT_DIST = 4.8;
const PREDATOR_TARGET_SWITCH_MIN_SEC = 1.0;

function countNearbyKind(entity, list, radius = 3.2) {
  const r2 = radius * radius;
  let count = 0;
  for (const other of list) {
    if (other.id === entity.id || other.alive === false) continue;
    const dx = other.x - entity.x;
    const dz = other.z - entity.z;
    if (dx * dx + dz * dz <= r2) count += 1;
  }
  return count;
}

function nearestPredator(herbivore, predators) {
  let best = null;
  let bestDSq = Infinity;
  for (let i = 0; i < predators.length; i += 1) {
    const predator = predators[i];
    if (predator.alive === false) continue;
    const dx = herbivore.x - predator.x;
    const dz = herbivore.z - predator.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDSq) {
      bestDSq = dSq;
      best = predator;
    }
  }
  return { predator: best, distance: Math.sqrt(bestDSq) };
}

function nearestHerbivore(predator, herbivores) {
  let best = null;
  let bestDSq = Infinity;
  for (let i = 0; i < herbivores.length; i += 1) {
    const prey = herbivores[i];
    if (prey.alive === false) continue;
    const dx = predator.x - prey.x;
    const dz = predator.z - prey.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDSq) {
      bestDSq = dSq;
      best = prey;
    }
  }
  return { prey: best, distance: Math.sqrt(bestDSq) };
}

function hasActivePath(animal, state) {
  return Boolean(
    animal.path &&
      animal.pathIndex < animal.path.length &&
      animal.pathGridVersion === state.grid.version,
  );
}

function isAtTargetTile(animal, state) {
  if (!animal.targetTile) return false;
  const tile = worldToTile(animal.x, animal.z, state.grid);
  return tile.ix === animal.targetTile.ix && tile.iz === animal.targetTile.iz;
}

function hasValidTarget(animal, state, targetTileTypes) {
  if (!animal.targetTile) return false;
  if (animal.pathGridVersion !== state.grid.version) return false;
  const tile = getTile(state.grid, animal.targetTile.ix, animal.targetTile.iz);
  if (!targetTileTypes.includes(tile)) return false;
  return hasActivePath(animal, state) || isAtTargetTile(animal, state);
}

function setIdleDesired(animal) {
  if (!animal.desiredVel) {
    animal.desiredVel = { x: 0, z: 0 };
    return;
  }
  animal.desiredVel.x = 0;
  animal.desiredVel.z = 0;
}

function tileDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.abs(a.ix - b.ix) + Math.abs(a.iz - b.iz);
}

function findNearbyGrazeTarget(animal, state, rng, attempts = 12, radius = 7) {
  const center = worldToTile(animal.x, animal.z, state.grid);
  for (let i = 0; i < attempts; i += 1) {
    const ix = center.ix + Math.floor((rng.next() * 2 - 1) * radius);
    const iz = center.iz + Math.floor((rng.next() * 2 - 1) * radius);
    if (!inBounds(ix, iz, state.grid)) continue;
    const tile = getTile(state.grid, ix, iz);
    if (tile === TILE.GRASS || tile === TILE.FARM) {
      return { ix, iz };
    }
  }
  return null;
}

function updateAnimalHunger(animal, dt) {
  const decay = animal.kind === ANIMAL_KIND.PREDATOR
    ? Number(BALANCE.predatorHungerDecayPerSecond ?? 0.012)
    : Number(BALANCE.herbivoreHungerDecayPerSecond ?? 0.009);
  animal.hunger = clamp((animal.hunger ?? 1) - decay * dt, 0, 1);
}

function recoverHerbivoreHunger(animal, dt) {
  const recover = Number(BALANCE.herbivoreGrazeRecoveryPerSecond ?? 0.08);
  animal.hunger = clamp((animal.hunger ?? 0) + recover * dt, 0, 1);
}

function recoverPredatorHungerOnHit(animal) {
  const recover = Number(BALANCE.predatorHungerRecoveryOnHit ?? 0.22);
  animal.hunger = clamp((animal.hunger ?? 0) + recover, 0, 1);
}

function herbivoreTick(animal, predators, state, dt, services, stateNode) {
  const bb = animal.blackboard ?? (animal.blackboard = {});
  const threat = nearestPredator(animal, predators);
  const threatNear = Boolean(threat.predator && threat.distance <= HERBIVORE_FLEE_ENTER_DIST);
  const threatFar = Boolean(!threat.predator || threat.distance >= HERBIVORE_FLEE_EXIT_DIST);
  if (threatNear) {
    bb.fleeLatch = true;
  } else if (threatFar) {
    bb.fleeLatch = false;
  }

  if (stateNode === "flee") {
    const predator = threat.predator;
    if (predator) {
      const nowSec = state.metrics.timeSec;
      const nextFleeRefresh = Number(animal.debug?.nextFleeRefreshSec ?? -Infinity);
      const stalePath = !hasActivePath(animal, state) || isPathStuck(animal, state, 1.8);
      if ((stalePath || nowSec >= nextFleeRefresh) && canAttemptPath(animal, state)) {
        const dx = animal.x - predator.x;
        const dz = animal.z - predator.z;
        const len = Math.hypot(dx, dz) || 1;
        const tx = animal.x + (dx / len) * 4;
        const tz = animal.z + (dz / len) * 4;
        const t = worldToTile(tx, tz, state.grid);
        if (setTargetAndPath(animal, t, state, services) && animal.debug) {
          animal.debug.nextFleeRefreshSec = nowSec + HERBIVORE_FLEE_REFRESH_SEC;
        }
      }
      if (hasActivePath(animal, state)) {
        animal.desiredVel = followPath(animal, state, dt).desired;
        return;
      }
      setIdleDesired(animal);
      return;
    }
  }

  if (stateNode === "graze" || stateNode === "regroup") {
    if (!hasValidTarget(animal, state, [TILE.GRASS, TILE.FARM]) && canAttemptPath(animal, state)) {
      const grassTarget = findNearbyGrazeTarget(animal, state, services.rng) ?? findNearestTileOfTypes(state.grid, animal, [TILE.FARM]);
      if (grassTarget) setTargetAndPath(animal, grassTarget, state, services);
    }

    if (hasActivePath(animal, state)) {
      const step = followPath(animal, state, dt);
      animal.desiredVel = step.desired;
      return;
    }
    if (isAtTargetTile(animal, state)) {
      setIdleDesired(animal);
      recoverHerbivoreHunger(animal, dt);
      return;
    }
  }

  const nextWanderRefreshSec = Number(animal.debug?.nextWanderRefreshSec ?? -Infinity);
  if ((state.metrics.timeSec >= nextWanderRefreshSec || isPathStuck(animal, state, 2.0)) && canAttemptPath(animal, state)) {
    clearPath(animal);
    if (setTargetAndPath(animal, randomPassableTile(state.grid), state, services) && animal.debug) {
      animal.debug.nextWanderRefreshSec = state.metrics.timeSec + WANDER_REFRESH_BASE_SEC + services.rng.next() * WANDER_REFRESH_JITTER_SEC;
    }
  }
  if (hasActivePath(animal, state)) {
    animal.desiredVel = followPath(animal, state, dt).desired;
  } else {
    setIdleDesired(animal);
  }
}

function predatorTick(animal, herbivores, state, dt, services, stateNode) {
  animal.attackCooldownSec = Math.max(0, Number(animal.attackCooldownSec ?? 0) - dt);

  const { prey, distance } = nearestHerbivore(animal, herbivores);
  if (prey && (stateNode === "stalk" || stateNode === "hunt" || stateNode === "feed")) {
    const nowSec = state.metrics.timeSec;
    animal.debug ??= {};
    const lastSwitchSec = Number(animal.debug.lastPredatorTargetSwitchSec ?? -Infinity);
    const lastPreyId = String(animal.debug.lastPredatorTargetId ?? "");
    const switchingTarget = lastPreyId && lastPreyId !== String(prey.id ?? "");
    if (switchingTarget && nowSec - lastSwitchSec < PREDATOR_TARGET_SWITCH_MIN_SEC) {
      setIdleDesired(animal);
      return;
    }
    if (switchingTarget) {
      animal.debug.lastPredatorTargetSwitchSec = nowSec;
    }
    animal.debug.lastPredatorTargetId = String(prey.id ?? "");

    const nextRefreshSec = Number(animal.debug?.nextHuntRefreshSec ?? -Infinity);
    const preyTile = worldToTile(prey.x, prey.z, state.grid);
    const targetDrifted = tileDistance(animal.targetTile, preyTile) >= 2;
    const pathStale = Boolean(animal.path) && animal.pathGridVersion !== state.grid.version;
    const pathMissingAwayFromTarget = !hasActivePath(animal, state) && !isAtTargetTile(animal, state);
    const pathStuck = isPathStuck(animal, state, 2.0);
    const shouldRetarget = pathStale || pathMissingAwayFromTarget || pathStuck || (targetDrifted && nowSec >= nextRefreshSec);
    if (shouldRetarget && canAttemptPath(animal, state)) {
      if (setTargetAndPath(animal, preyTile, state, services) && animal.debug) {
        animal.debug.nextHuntRefreshSec = nowSec + PREDATOR_HUNT_REFRESH_SEC;
      }
    }

    if (hasActivePath(animal, state)) {
      const step = followPath(animal, state, dt);
      animal.desiredVel = step.desired;
      if (distance < Number(BALANCE.predatorAttackDistance ?? 0.9) && animal.attackCooldownSec <= 0) {
        const dmg = Number(BALANCE.predatorAttackDamage ?? 24);
        prey.hp = Math.max(0, Number(prey.hp ?? 0) - dmg);
        prey.memory.recentEvents.unshift("predator-hit");
        prey.memory.recentEvents.length = Math.min(prey.memory.recentEvents.length, 6);
        animal.attackCooldownSec = Number(BALANCE.predatorAttackCooldownSec ?? 1.4);
        recoverPredatorHungerOnHit(animal);
        if (prey.hp <= 0 && prey.alive !== false) {
          prey.alive = false;
          prey.deathReason = "predation";
          prey.deathSec = state.metrics.timeSec;
          prey.starvationSec = 0;
        }
      }
      return;
    }
    if (isAtTargetTile(animal, state)) {
      setIdleDesired(animal);
      return;
    }
  }

  const nextWanderRefreshSec = Number(animal.debug?.nextWanderRefreshSec ?? -Infinity);
  if ((state.metrics.timeSec >= nextWanderRefreshSec || isPathStuck(animal, state, 2.0)) && canAttemptPath(animal, state)) {
    clearPath(animal);
    if (setTargetAndPath(animal, randomPassableTile(state.grid), state, services) && animal.debug) {
      animal.debug.nextWanderRefreshSec = state.metrics.timeSec + WANDER_REFRESH_BASE_SEC + services.rng.next() * WANDER_REFRESH_JITTER_SEC;
    }
  }
  if (hasActivePath(animal, state)) {
    animal.desiredVel = followPath(animal, state, dt).desired;
  } else {
    setIdleDesired(animal);
  }
}

function updateIdleWithoutReasonMetric(animal, stateNode, dt, state) {
  if (stateNode !== "idle" && stateNode !== "wander" && stateNode !== "rest") return;
  state.metrics.idleWithoutReasonSec ??= {};
  const group = String(animal.groupId ?? animal.kind ?? "animals");
  state.metrics.idleWithoutReasonSec[group] = Number(state.metrics.idleWithoutReasonSec[group] ?? 0) + dt;

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

export class AnimalAISystem {
  constructor() {
    this.name = "AnimalAISystem";
    this.herbivores = [];
    this.predators = [];
  }

  #partitionAnimals(state) {
    this.herbivores.length = 0;
    this.predators.length = 0;
    for (let i = 0; i < state.animals.length; i += 1) {
      const animal = state.animals[i];
      if (animal.alive === false) continue;
      if (animal.kind === ANIMAL_KIND.HERBIVORE) {
        this.herbivores.push(animal);
      } else if (animal.kind === ANIMAL_KIND.PREDATOR) {
        this.predators.push(animal);
      }
    }
  }

  update(dt, state, services) {
    this.#partitionAnimals(state);
    for (const animal of state.animals) {
      if (animal.alive === false) continue;
      updateAnimalHunger(animal, dt);

      const groupId = animal.kind === ANIMAL_KIND.HERBIVORE ? "herbivores" : "predators";
      const plan = planEntityDesiredState(animal, state, {
        predators: this.predators,
        herbivores: this.herbivores,
      });
      const stateNode = transitionEntityState(animal, groupId, plan.desiredState, state.metrics.timeSec, plan.reason);

      animal.blackboard.intent = stateNode;
      animal.stateLabel = mapStateToDisplayLabel(groupId, stateNode);
      animal.debug ??= {};
      animal.debug.lastIntent = stateNode;
      animal.debug.lastStateNode = stateNode;

      if (groupId === "herbivores") {
        const bb = animal.blackboard ?? (animal.blackboard = {});
        const threat = nearestPredator(animal, this.predators);
        const threatNear = Boolean(threat.predator && threat.distance <= HERBIVORE_FLEE_ENTER_DIST);
        const threatFar = Boolean(!threat.predator || threat.distance >= HERBIVORE_FLEE_EXIT_DIST);
        if (threatNear) bb.fleeLatch = true;
        else if (threatFar) bb.fleeLatch = false;
        if (stateNode === "idle") setIdleDesired(animal);
        else herbivoreTick(animal, this.predators, state, dt, services, stateNode);
      } else {
        if (stateNode === "rest" || stateNode === "idle") {
          setIdleDesired(animal);
          animal.hunger = clamp((animal.hunger ?? 0) + Number(BALANCE.predatorHungerRecoveryOnHit ?? 0.24) * dt * 0.12, 0, 1);
        } else {
          predatorTick(animal, this.herbivores, state, dt, services, stateNode);
        }
      }

      updateIdleWithoutReasonMetric(animal, stateNode, dt, state);
    }
  }
}
