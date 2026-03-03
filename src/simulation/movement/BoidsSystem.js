import { BALANCE } from "../../config/balance.js";
import { clamp } from "../../app/math.js";
import { buildSpatialHash, queryNeighbors } from "./SpatialHash.js";

function sameFlockGroup(a, b) {
  if (a.type !== b.type) return false;
  const ga = String(a.groupId ?? "");
  const gb = String(b.groupId ?? "");
  if (ga && gb) return ga === gb;
  if (a.type === "ANIMAL") return a.kind === b.kind;
  return a.type === b.type;
}

function getGroupProfile(entity) {
  const groupId = String(entity.groupId ?? "").trim();
  const profile = BALANCE.boidsGroupProfiles?.[groupId] ?? null;
  if (profile) return profile;
  return {
    neighborRadius: BALANCE.boidsNeighborRadius,
    separationRadius: BALANCE.boidsSeparationRadius,
    weights: BALANCE.boidsWeights,
  };
}

function boidsSteer(entity, neighbors, desiredX, desiredZ, out) {
  let sepX = 0;
  let sepZ = 0;
  let aliX = 0;
  let aliZ = 0;
  let cohX = 0;
  let cohZ = 0;
  let count = 0;
  const maxSamples = 24;
  const profile = getGroupProfile(entity);
  const neighborR = Number(profile.neighborRadius ?? BALANCE.boidsNeighborRadius);
  const sepR = Number(profile.separationRadius ?? BALANCE.boidsSeparationRadius);
  const weights = profile.weights ?? BALANCE.boidsWeights;

  for (let i = 0; i < neighbors.length; i += 1) {
    const other = neighbors[i];
    if (other === entity) continue;
    if (!sameFlockGroup(entity, other)) continue;

    const dx = other.x - entity.x;
    const dz = other.z - entity.z;
    const dSq = dx * dx + dz * dz;
    if (dSq <= 1e-12) continue;
    const d = Math.sqrt(dSq);
    if (d <= 1e-6 || d > neighborR) continue;

    aliX += other.vx;
    aliZ += other.vz;
    cohX += other.x;
    cohZ += other.z;
    count += 1;
    if (count >= maxSamples) break;

    if (d < sepR) {
      const invD = 1 / (d + 0.001);
      sepX += (-dx / d) * invD;
      sepZ += (-dz / d) * invD;
    }
  }

  if (count > 0) {
    aliX /= count;
    aliZ /= count;
    cohX = cohX / count - entity.x;
    cohZ = cohZ / count - entity.z;
  }

  out.x =
    sepX * Number(weights.separation ?? BALANCE.boidsWeights.separation) +
    aliX * Number(weights.alignment ?? BALANCE.boidsWeights.alignment) +
    cohX * Number(weights.cohesion ?? BALANCE.boidsWeights.cohesion) +
    desiredX * Number(weights.seek ?? BALANCE.boidsWeights.seek);
  out.z =
    sepZ * Number(weights.separation ?? BALANCE.boidsWeights.separation) +
    aliZ * Number(weights.alignment ?? BALANCE.boidsWeights.alignment) +
    cohZ * Number(weights.cohesion ?? BALANCE.boidsWeights.cohesion) +
    desiredZ * Number(weights.seek ?? BALANCE.boidsWeights.seek);
}

export class BoidsSystem {
  constructor() {
    this.name = "BoidsSystem";
    this.entityBuffer = [];
    this.neighborBuffer = [];
    this.hash = { map: new Map(), cellSize: 2 };
    this.steerOut = { x: 0, z: 0 };
    this.highLoadEntityThreshold = 320;
    this.highLoadStepSec = 1 / 15;
    this.highLoadAccumulator = 0;
  }

  #collectEntities(state) {
    this.entityBuffer.length = 0;
    for (let i = 0; i < state.agents.length; i += 1) this.entityBuffer.push(state.agents[i]);
    for (let i = 0; i < state.animals.length; i += 1) this.entityBuffer.push(state.animals[i]);
    return this.entityBuffer;
  }

  update(dt, state) {
    const entities = this.#collectEntities(state);
    if (entities.length === 0) return;

    let simDt = dt;
    let updateIntervalSec = dt;
    if (entities.length >= this.highLoadEntityThreshold) {
      this.highLoadAccumulator += dt;
      updateIntervalSec = this.highLoadStepSec;
      if (this.highLoadAccumulator < this.highLoadStepSec) {
        return;
      }
      simDt = this.highLoadAccumulator;
      this.highLoadAccumulator = 0;
    } else {
      this.highLoadAccumulator = 0;
    }

    const hash = buildSpatialHash(entities, 2.0, this.hash);
    const boundsX = (state.grid.width * state.grid.tileSize) / 2 - 0.5;
    const boundsZ = (state.grid.height * state.grid.tileSize) / 2 - 0.5;
    let totalNeighbors = 0;
    let totalSpeed = 0;
    let maxSpeed = 0;

    for (let i = 0; i < entities.length; i += 1) {
      const e = entities[i];
      const desired = e.desiredVel;
      const desiredX = desired ? desired.x : 0;
      const desiredZ = desired ? desired.z : 0;
      const neighbors = queryNeighbors(hash, e, this.neighborBuffer, 72);
      totalNeighbors += Math.max(0, neighbors.length - 1);
      boidsSteer(e, neighbors, desiredX, desiredZ, this.steerOut);

      e.vx = e.vx + (this.steerOut.x - e.vx) * 0.12;
      e.vz = e.vz + (this.steerOut.z - e.vz) * 0.12;

      const maxV =
        e.type === "WORKER"
          ? BALANCE.workerSpeed + 0.15
          : e.type === "VISITOR"
            ? BALANCE.visitorSpeed + 0.1
            : e.kind === "PREDATOR"
              ? BALANCE.predatorSpeed + 0.1
              : BALANCE.herbivoreSpeed + 0.1;

      const speed = Math.hypot(e.vx, e.vz);
      totalSpeed += speed;
      if (speed > maxSpeed) maxSpeed = speed;
      if (speed > maxV) {
        const s = maxV / (speed + 1e-6);
        e.vx *= s;
        e.vz *= s;
      }

      e.x += e.vx * simDt;
      e.z += e.vz * simDt;

      e.x = clamp(e.x, -boundsX, boundsX);
      e.z = clamp(e.z, -boundsZ, boundsZ);
    }

    if (state.debug) {
      const n = Math.max(1, entities.length);
      state.debug.boids = {
        entities: entities.length,
        avgNeighbors: totalNeighbors / n,
        avgSpeed: totalSpeed / n,
        maxSpeed,
        updateIntervalSec,
      };
    }
  }
}
