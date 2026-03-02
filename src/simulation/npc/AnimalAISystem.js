import { ANIMAL_KIND, TILE } from "../../config/constants.js";
import { findNearestTileOfTypes, getTile, inBounds, randomPassableTile, worldToTile } from "../../world/grid/Grid.js";
import { clearPath, followPath, setTargetAndPath } from "../navigation/Navigation.js";

const HERBIVORE_TARGET_REFRESH_BASE_SEC = 1.5;
const HERBIVORE_TARGET_REFRESH_JITTER_SEC = 0.6;
const PREDATOR_HUNT_REFRESH_SEC = 0.45;
const HERBIVORE_FLEE_REFRESH_SEC = 0.35;

function nearestPredator(herbivore, predators) {
  let best = null;
  let bestDSq = Infinity;
  for (let i = 0; i < predators.length; i += 1) {
    const predator = predators[i];
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

function hasValidTarget(animal, state, targetTileTypes) {
  if (!animal.targetTile || !animal.path || animal.pathIndex >= animal.path.length) return false;
  if (animal.pathGridVersion !== state.grid.version) return false;
  const tile = getTile(state.grid, animal.targetTile.ix, animal.targetTile.iz);
  return targetTileTypes.includes(tile);
}

function findNearbyGrazeTarget(animal, state, attempts = 12, radius = 7) {
  const center = worldToTile(animal.x, animal.z, state.grid);
  for (let i = 0; i < attempts; i += 1) {
    const ix = center.ix + Math.floor((Math.random() * 2 - 1) * radius);
    const iz = center.iz + Math.floor((Math.random() * 2 - 1) * radius);
    if (!inBounds(ix, iz, state.grid)) continue;
    const tile = getTile(state.grid, ix, iz);
    if (tile === TILE.GRASS || tile === TILE.FARM) {
      return { ix, iz };
    }
  }
  return null;
}

function herbivoreTick(animal, predators, state, dt, services) {
  if (animal.debug) animal.debug.lastIntent = "graze";
  const { predator, distance } = nearestPredator(animal, predators);
  if (predator && distance < 4.6) {
    if (animal.debug) animal.debug.lastIntent = "flee";
    animal.stateLabel = "Flee";
    const nowSec = state.metrics.timeSec;
    const nextFleeRefresh = Number(animal.debug?.nextFleeRefreshSec ?? -Infinity);
    if (!animal.path || animal.pathIndex >= animal.path.length || animal.pathGridVersion !== state.grid.version || nowSec >= nextFleeRefresh) {
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
    if (animal.path && animal.pathIndex < animal.path.length) {
      animal.desiredVel = followPath(animal, state, dt).desired;
      return;
    }
  }

  animal.stateLabel = "Graze";
  const nowSec = state.metrics.timeSec;
  const nextRefreshSec = Number(animal.debug?.nextTargetRefreshSec ?? -Infinity);
  const shouldRefresh = nowSec >= nextRefreshSec;
  if (shouldRefresh || !hasValidTarget(animal, state, [TILE.GRASS, TILE.FARM])) {
    const grassTarget = findNearbyGrazeTarget(animal, state) ?? findNearestTileOfTypes(state.grid, animal, [TILE.FARM]);
    if (grassTarget && setTargetAndPath(animal, grassTarget, state, services)) {
      if (animal.debug) {
        animal.debug.nextTargetRefreshSec = nowSec + HERBIVORE_TARGET_REFRESH_BASE_SEC + Math.random() * HERBIVORE_TARGET_REFRESH_JITTER_SEC;
      }
    }
  }

  if (animal.path && animal.pathIndex < animal.path.length) {
    const step = followPath(animal, state, dt);
    animal.desiredVel = step.desired;
    return;
  }

  animal.stateLabel = "Wander";
  if (!animal.path || animal.pathIndex >= animal.path.length) {
    clearPath(animal);
    setTargetAndPath(animal, randomPassableTile(state.grid), state, services);
  }
  animal.desiredVel = followPath(animal, state, dt).desired;
}

function predatorTick(animal, herbivores, state, dt, services) {
  if (animal.debug) animal.debug.lastIntent = "hunt";
  const { prey, distance } = nearestHerbivore(animal, herbivores);
  if (prey) {
    animal.stateLabel = "Hunt";
    const nowSec = state.metrics.timeSec;
    const nextRefreshSec = Number(animal.debug?.nextHuntRefreshSec ?? -Infinity);
    if (!animal.path || animal.pathIndex >= animal.path.length || animal.pathGridVersion !== state.grid.version || nowSec >= nextRefreshSec) {
      const preyTile = worldToTile(prey.x, prey.z, state.grid);
      setTargetAndPath(animal, preyTile, state, services);
      if (animal.debug) animal.debug.nextHuntRefreshSec = nowSec + PREDATOR_HUNT_REFRESH_SEC;
    }

    if (animal.path && animal.pathIndex < animal.path.length) {
      const step = followPath(animal, state, dt);
      animal.desiredVel = step.desired;
      if (distance < 0.9) {
        // Predator pressure creates migration signal without killing entities.
        prey.memory.recentEvents.unshift("predator-near");
        prey.memory.recentEvents.length = Math.min(prey.memory.recentEvents.length, 6);
      }
      return;
    }
  }

  animal.stateLabel = "Roam";
  if (!animal.path || animal.pathIndex >= animal.path.length) {
    clearPath(animal);
    setTargetAndPath(animal, randomPassableTile(state.grid), state, services);
  }
  animal.desiredVel = followPath(animal, state, dt).desired;
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
      if (animal.kind === ANIMAL_KIND.HERBIVORE) {
        herbivoreTick(animal, this.predators, state, dt, services);
      } else {
        predatorTick(animal, this.herbivores, state, dt, services);
      }
    }
  }
}
