import { BALANCE } from "../../config/balance.js";
import { ANIMAL_KIND, TILE } from "../../config/constants.js";
import { clamp } from "../../app/math.js";
import { findNearestTileOfTypes, getTile, inBounds, randomPassableTile, worldToTile } from "../../world/grid/Grid.js";
import { canAttemptPath, clearPath, followPath, isPathStuck, setTargetAndPath } from "../navigation/Navigation.js";

const PREDATOR_HUNT_REFRESH_SEC = 1.15;
const HERBIVORE_FLEE_REFRESH_SEC = 0.9;
const WANDER_REFRESH_BASE_SEC = 2.2;
const WANDER_REFRESH_JITTER_SEC = 1.4;

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

function herbivoreTick(animal, predators, state, dt, services) {
  if (animal.debug) animal.debug.lastIntent = "graze";
  const { predator, distance } = nearestPredator(animal, predators);
  if (predator && distance < 4.6) {
    if (animal.debug) animal.debug.lastIntent = "flee";
    animal.stateLabel = "Flee";
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
    if (isAtTargetTile(animal, state)) {
      setIdleDesired(animal);
      return;
    }
  }

  animal.stateLabel = "Graze";
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

  animal.stateLabel = "Wander";
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

function predatorTick(animal, herbivores, state, dt, services) {
  if (animal.debug) animal.debug.lastIntent = "hunt";
  animal.attackCooldownSec = Math.max(0, Number(animal.attackCooldownSec ?? 0) - dt);

  const { prey, distance } = nearestHerbivore(animal, herbivores);
  if (prey) {
    animal.stateLabel = "Hunt";
    const nowSec = state.metrics.timeSec;
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

  animal.stateLabel = "Roam";
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
      if (animal.kind === ANIMAL_KIND.HERBIVORE) {
        herbivoreTick(animal, this.predators, state, dt, services);
      } else {
        predatorTick(animal, this.herbivores, state, dt, services);
      }
    }
  }
}
