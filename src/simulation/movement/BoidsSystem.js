import { BALANCE } from "../../config/balance.js";
import { clamp } from "../../app/math.js";
import { buildSpatialHash, queryNeighbors } from "./SpatialHash.js";

function sameFlockGroup(a, b) {
  if (a.type !== b.type) return false;
  if (a.type === "ANIMAL") return a.kind === b.kind;
  return true;
}

function boidsSteer(entity, neighbors, desired) {
  const sep = { x: 0, z: 0 };
  const ali = { x: 0, z: 0 };
  const coh = { x: 0, z: 0 };

  let count = 0;
  const neighborR = BALANCE.boidsNeighborRadius;
  const sepR = BALANCE.boidsSeparationRadius;

  for (const other of neighbors) {
    if (other === entity) continue;
    if (!sameFlockGroup(entity, other)) continue;

    const dx = other.x - entity.x;
    const dz = other.z - entity.z;
    const d = Math.hypot(dx, dz);
    if (d <= 1e-6 || d > neighborR) continue;

    ali.x += other.vx;
    ali.z += other.vz;
    coh.x += other.x;
    coh.z += other.z;
    count += 1;

    if (d < sepR) {
      sep.x += (-dx / d) / (d + 0.001);
      sep.z += (-dz / d) / (d + 0.001);
    }
  }

  if (count > 0) {
    ali.x /= count;
    ali.z /= count;
    coh.x = coh.x / count - entity.x;
    coh.z = coh.z / count - entity.z;
  }

  return {
    x:
      sep.x * BALANCE.boidsWeights.separation +
      ali.x * BALANCE.boidsWeights.alignment +
      coh.x * BALANCE.boidsWeights.cohesion +
      desired.x * BALANCE.boidsWeights.seek,
    z:
      sep.z * BALANCE.boidsWeights.separation +
      ali.z * BALANCE.boidsWeights.alignment +
      coh.z * BALANCE.boidsWeights.cohesion +
      desired.z * BALANCE.boidsWeights.seek,
  };
}

export class BoidsSystem {
  constructor() {
    this.name = "BoidsSystem";
  }

  update(dt, state) {
    const entities = [...state.agents, ...state.animals];
    const hash = buildSpatialHash(entities, 2.0);

    const boundsX = (state.grid.width * state.grid.tileSize) / 2 - 0.5;
    const boundsZ = (state.grid.height * state.grid.tileSize) / 2 - 0.5;

    for (const e of entities) {
      const desired = e.desiredVel ?? { x: 0, z: 0 };
      const neighbors = queryNeighbors(hash, e);
      const steer = boidsSteer(e, neighbors, desired);

      e.vx = e.vx + (steer.x - e.vx) * 0.12;
      e.vz = e.vz + (steer.z - e.vz) * 0.12;

      const maxV =
        e.type === "WORKER"
          ? BALANCE.workerSpeed + 0.15
          : e.type === "VISITOR"
            ? BALANCE.visitorSpeed + 0.1
            : e.kind === "PREDATOR"
              ? BALANCE.predatorSpeed + 0.1
              : BALANCE.herbivoreSpeed + 0.1;

      const speed = Math.hypot(e.vx, e.vz);
      if (speed > maxV) {
        const s = maxV / (speed + 1e-6);
        e.vx *= s;
        e.vz *= s;
      }

      e.x += e.vx * dt;
      e.z += e.vz * dt;

      e.x = clamp(e.x, -boundsX, boundsX);
      e.z = clamp(e.z, -boundsZ, boundsZ);
    }
  }
}
