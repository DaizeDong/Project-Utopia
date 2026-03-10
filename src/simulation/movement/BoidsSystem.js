import { BALANCE } from "../../config/balance.js";
import { clamp } from "../../app/math.js";
import { inBounds, worldToTile } from "../../world/grid/Grid.js";
import { buildSpatialHash, queryNeighbors } from "./SpatialHash.js";

const TRAFFIC_NEIGHBOR_OFFSETS = Object.freeze([
  { dx: 0, dz: 0 },
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
]);

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

function tileKey(ix, iz) {
  return `${ix},${iz}`;
}

function getTrafficWeight(entity) {
  const weights = BALANCE.trafficCrowdWeights ?? {};
  if (entity.type === "WORKER") return Math.max(0, Number(weights.worker ?? 1));
  if (entity.type === "VISITOR") return Math.max(0, Number(weights.visitor ?? 0.92));
  if (entity.kind === "PREDATOR") return Math.max(0, Number(weights.predator ?? 0.72));
  return Math.max(0, Number(weights.herbivore ?? 0.58));
}

function setPeakPenalty(penaltyByKey, key, penalty) {
  if (!key || penalty <= 1) return;
  const next = Math.max(Number(penaltyByKey[key] ?? 1), penalty);
  penaltyByKey[key] = Number(next.toFixed(2));
}

function buildTrafficMetrics(entities, state, previousTraffic, previousSignature = "") {
  const loadByKeyRaw = {};
  let totalLoad = 0;
  for (const entity of entities) {
    if (entity.alive === false) continue;
    const tile = worldToTile(entity.x, entity.z, state.grid);
    if (!inBounds(tile.ix, tile.iz, state.grid)) continue;
    const weight = getTrafficWeight(entity);
    if (weight <= 0) continue;
    const key = tileKey(tile.ix, tile.iz);
    loadByKeyRaw[key] = Number(loadByKeyRaw[key] ?? 0) + weight;
    totalLoad += weight;
  }

  const softLoad = Math.max(1, Number(BALANCE.trafficSoftTileLoad ?? 2.15));
  const hotspotLoad = Math.max(softLoad + 0.1, Number(BALANCE.trafficHotspotTileLoad ?? 3.2));
  const penaltyPerLoad = Math.max(0.05, Number(BALANCE.trafficPenaltyPerLoad ?? 0.28));
  const neighborRatio = clamp(Number(BALANCE.trafficNeighborPenaltyRatio ?? 0.46), 0, 1);
  const maxPenalty = Math.max(1.05, Number(BALANCE.trafficMaxPenaltyMultiplier ?? 2.2));
  const loadByKey = {};
  const pressureTiles = Object.entries(loadByKeyRaw)
    .map(([key, rawLoad]) => {
      const [ix, iz] = key.split(",").map(Number);
      const load = Number(rawLoad.toFixed(2));
      loadByKey[key] = load;
      const overflow = Math.max(0, load - softLoad);
      const penalty = overflow > 0
        ? Math.min(maxPenalty, 1 + overflow * penaltyPerLoad)
        : 1;
      return { key, ix, iz, load, penalty: Number(penalty.toFixed(2)) };
    })
    .filter((entry) => entry.penalty > 1)
    .sort((a, b) => b.load - a.load || b.penalty - a.penalty);

  const hotspotTiles = pressureTiles.filter((entry) => entry.load >= hotspotLoad);
  const penaltyByKey = {};
  for (const tile of pressureTiles) {
    setPeakPenalty(penaltyByKey, tile.key, tile.penalty);
    const spillPenalty = 1 + (tile.penalty - 1) * neighborRatio;
    for (const offset of TRAFFIC_NEIGHBOR_OFFSETS) {
      const nx = tile.ix + offset.dx;
      const nz = tile.iz + offset.dz;
      if (!inBounds(nx, nz, state.grid)) continue;
      setPeakPenalty(penaltyByKey, tileKey(nx, nz), Math.min(maxPenalty, spillPenalty));
    }
  }

  const penaltyValues = Object.values(penaltyByKey).map((value) => Number(value));
  const peakLoad = Number(pressureTiles[0]?.load ?? 0);
  const peakPenalty = penaltyValues.length > 0
    ? Number(Math.max(...penaltyValues).toFixed(2))
    : 1;
  const occupiedTileCount = Math.max(0, Object.keys(loadByKey).length);
  const avgLoad = occupiedTileCount > 0
    ? Number((totalLoad / occupiedTileCount).toFixed(2))
    : 0;
  const signature = hotspotTiles
    .slice(0, 6)
    .map((tile) => tile.key)
    .join("|");
  const prevVersion = Number(previousTraffic?.version ?? 0);
  const version = signature === previousSignature ? prevVersion : prevVersion + 1;

  let summary = "Traffic: lanes clear.";
  if (pressureTiles.length > 0 && hotspotTiles.length === 0) {
    summary = `Traffic: ${pressureTiles.length} pressured lanes, avg load ${avgLoad.toFixed(1)}, peak load ${peakLoad.toFixed(1)}, peak path cost x${peakPenalty.toFixed(2)}.`;
  } else if (hotspotTiles.length > 0) {
    summary = `Traffic: ${hotspotTiles.length} hotspots, avg load ${avgLoad.toFixed(1)}, peak load ${peakLoad.toFixed(1)}, peak path cost x${peakPenalty.toFixed(2)}.`;
  }

  return {
    version,
    activeLaneCount: pressureTiles.length,
    hotspotCount: hotspotTiles.length,
    peakLoad,
    avgLoad,
    peakPenalty,
    loadByKey,
    penaltyByKey,
    hotspotTiles: (hotspotTiles.length > 0 ? hotspotTiles : pressureTiles).slice(0, 6).map((tile) => ({
      ix: tile.ix,
      iz: tile.iz,
      load: tile.load,
      penalty: tile.penalty,
    })),
    summary,
    signature,
  };
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
    this.nextTrafficSampleSec = -Infinity;
    this.lastTrafficSignature = "";
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

    const nowSec = Number(state.metrics?.timeSec ?? 0);
    if (!state.metrics?.traffic || nowSec >= this.nextTrafficSampleSec) {
      const traffic = buildTrafficMetrics(entities, state, state.metrics?.traffic, this.lastTrafficSignature);
      this.lastTrafficSignature = traffic.signature;
      state.metrics.traffic = {
        version: traffic.version,
        activeLaneCount: traffic.activeLaneCount,
        hotspotCount: traffic.hotspotCount,
        peakLoad: traffic.peakLoad,
        avgLoad: traffic.avgLoad,
        peakPenalty: traffic.peakPenalty,
        loadByKey: traffic.loadByKey,
        penaltyByKey: traffic.penaltyByKey,
        hotspotTiles: traffic.hotspotTiles,
        summary: traffic.summary,
      };
      state.debug.traffic = state.metrics.traffic;
      this.nextTrafficSampleSec = nowSec + Math.max(0.2, Number(BALANCE.trafficSampleIntervalSec ?? 0.45));
    }

    if (state.debug) {
      const n = Math.max(1, entities.length);
      const traffic = state.metrics?.traffic ?? {};
      state.debug.boids = {
        entities: entities.length,
        avgNeighbors: totalNeighbors / n,
        avgSpeed: totalSpeed / n,
        maxSpeed,
        updateIntervalSec,
        congestionHotspots: Number(traffic.hotspotCount ?? 0),
        peakTileLoad: Number(traffic.peakLoad ?? 0),
        peakPenalty: Number(traffic.peakPenalty ?? 1),
        trafficVersion: Number(traffic.version ?? 0),
      };
    }
  }
}
