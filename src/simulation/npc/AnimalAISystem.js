import { ANIMAL_KIND, TILE } from "../../config/constants.js";
import { distance2D } from "../../app/math.js";
import { findNearestTileOfTypes, randomPassableTile, worldToTile } from "../../world/grid/Grid.js";
import { clearPath, followPath, setTargetAndPath } from "../navigation/Navigation.js";

function nearestPredator(herbivore, animals) {
  let best = null;
  let bestD = Infinity;
  for (const a of animals) {
    if (a.kind !== ANIMAL_KIND.PREDATOR) continue;
    const d = distance2D(herbivore, a);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return { predator: best, distance: bestD };
}

function nearestHerbivore(predator, animals) {
  let best = null;
  let bestD = Infinity;
  for (const a of animals) {
    if (a.kind !== ANIMAL_KIND.HERBIVORE) continue;
    const d = distance2D(predator, a);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return { prey: best, distance: bestD };
}

function herbivoreTick(animal, state, dt, services) {
  const { predator, distance } = nearestPredator(animal, state.animals);
  if (predator && distance < 4.6) {
    animal.stateLabel = "Flee";
    const dx = animal.x - predator.x;
    const dz = animal.z - predator.z;
    const len = Math.hypot(dx, dz) || 1;
    const tx = animal.x + (dx / len) * 4;
    const tz = animal.z + (dz / len) * 4;
    const t = worldToTile(tx, tz, state.grid);
    if (setTargetAndPath(animal, t, state, services)) {
      animal.desiredVel = followPath(animal, state, dt).desired;
      return;
    }
  }

  animal.stateLabel = "Graze";
  const grassTarget = findNearestTileOfTypes(state.grid, animal, [TILE.GRASS, TILE.FARM]);
  if (grassTarget && setTargetAndPath(animal, grassTarget, state, services)) {
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

function predatorTick(animal, state, dt, services) {
  const { prey, distance } = nearestHerbivore(animal, state.animals);
  if (prey) {
    animal.stateLabel = "Hunt";
    const preyTile = worldToTile(prey.x, prey.z, state.grid);
    if (setTargetAndPath(animal, preyTile, state, services)) {
      const step = followPath(animal, state, dt);
      animal.desiredVel = step.desired;
      if (distance < 0.9) {
        // predator pressure creates migration signal without killing entities.
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
  }

  update(dt, state, services) {
    for (const animal of state.animals) {
      if (animal.kind === ANIMAL_KIND.HERBIVORE) {
        herbivoreTick(animal, state, dt, services);
      } else {
        predatorTick(animal, state, dt, services);
      }
    }
  }
}
