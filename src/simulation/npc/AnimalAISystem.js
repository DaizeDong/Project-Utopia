import { BALANCE } from "../../config/balance.js";
import { ANIMAL_KIND, ANIMAL_SPECIES, TILE } from "../../config/constants.js";
import { getLongRunWildlifeTuning } from "../../config/longRunProfile.js";
import { clamp } from "../../app/math.js";
import { findNearestTileOfTypes, getTile, inBounds, isPassable, randomPassableTile, worldToTile } from "../../world/grid/Grid.js";
import { emitEvent, EVENT_TYPES } from "../meta/GameEventBus.js";
import { canAttemptPath, clearPath, followPath, isPathStuck, setTargetAndPath } from "../navigation/Navigation.js";
import { mapStateToDisplayLabel, transitionEntityState } from "./state/StateGraph.js";
import { planEntityDesiredState } from "./state/StatePlanner.js";
import { buildSpatialHash, queryNeighbors } from "../movement/SpatialHash.js";
// v0.8.4 strategic walls + GATE (Agent C). Predator-branch wall attack —
// when a hostile (predator / raider_beast) cannot path to its prey AND
// there's an adjacent WALL or GATE, it switches to attack-structure mode
// and chips away at the wallHp until the structure is destroyed (mutated
// to RUINS). This is what makes walls a real defensive geometry instead of
// a one-tick obstruction that hostiles route around.
import { mutateTile } from "../lifecycle/TileMutationHooks.js";

const PREDATOR_HUNT_REFRESH_SEC = 1.15;
const HERBIVORE_FLEE_REFRESH_SEC = 0.9;
const WANDER_REFRESH_BASE_SEC = 2.2;
const WANDER_REFRESH_JITTER_SEC = 1.4;
const HERBIVORE_FLEE_ENTER_DIST = 6.8;
const HERBIVORE_FLEE_EXIT_DIST = 9.6;
const PREDATOR_TARGET_SWITCH_MIN_SEC = 1.0;
const FLEE_EXCLUDED_SPREAD_STATES = new Set(["flee"]);

// v0.8.2 Round-6 Wave-2 (01d-mechanics-content Step 7) — species-aware
// behaviour table. Wolf is the standard pack hunter (default fallback);
// bear is slow but hits hard with longer chase tolerance; raider_beast
// ignores herbivores and goes straight for workers (the new "raider" role).
const PREDATOR_SPECIES_PROFILE = Object.freeze({
  [ANIMAL_SPECIES.WOLF]: { attackCooldownSec: 1.4, chaseDistanceMult: 1.0, ignoresHerbivores: false, targetsWorkers: false },
  [ANIMAL_SPECIES.BEAR]: { attackCooldownSec: 2.6, chaseDistanceMult: 1.5, ignoresHerbivores: false, targetsWorkers: false },
  [ANIMAL_SPECIES.RAIDER_BEAST]: { attackCooldownSec: 1.8, chaseDistanceMult: 1.2, ignoresHerbivores: true, targetsWorkers: true },
});

function getPredatorProfile(animal) {
  const species = String(animal?.species ?? ANIMAL_SPECIES.WOLF);
  return PREDATOR_SPECIES_PROFILE[species] ?? PREDATOR_SPECIES_PROFILE[ANIMAL_SPECIES.WOLF];
}

function resolveTargetPriority(policy, key, fallback = 1) {
  return Math.max(0, Math.min(3, Number(policy?.targetPriorities?.[key] ?? fallback)));
}

function getAnimalPolicy(state, groupId) {
  return state.ai.groupPolicies.get(groupId)?.data ?? null;
}

function tileKey(ix, iz) {
  return `${ix},${iz}`;
}

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

function crowdPenaltyAroundTile(candidate, animals, state, subjectId) {
  let penalty = 0;
  for (const other of animals ?? []) {
    if (!other || other.alive === false || other.id === subjectId) continue;
    const otherTile = worldToTile(other.x, other.z, state.grid);
    const dist = tileDistance(candidate, otherTile);
    if (dist <= 1) penalty += 0.42;
    else if (dist <= 2) penalty += 0.18;
  }
  return penalty;
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

function distanceSq(a, b) {
  if (!a || !b) return Infinity;
  const dx = Number(a.x ?? 0) - Number(b.x ?? 0);
  const dz = Number(a.z ?? 0) - Number(b.z ?? 0);
  return dx * dx + dz * dz;
}

function parseTileKey(key) {
  const [ix, iz] = String(key ?? "").split(",").map((value) => Number(value));
  if (!Number.isFinite(ix) || !Number.isFinite(iz)) return null;
  return { ix, iz };
}

function getScenario(state) {
  return state.gameplay?.scenario ?? {};
}

function getWildlifeZone(state, animal) {
  const scenario = getScenario(state);
  const zones = scenario.wildlifeZones ?? [];
  if (zones.length <= 0) return null;
  const homeZoneId = String(animal.memory?.homeZoneId ?? "");
  if (homeZoneId) {
    const byId = zones.find((zone) => zone.id === homeZoneId);
    if (byId) return byId;
  }
  const anchors = scenario.anchors ?? {};
  const homeTile = animal.memory?.territoryAnchor ?? animal.memory?.homeTile ?? worldToTile(animal.x, animal.z, state.grid);
  let best = null;
  let bestDist = Infinity;
  for (const zone of zones) {
    const anchor = anchors[zone.anchor];
    if (!anchor) continue;
    const dist = tileDistance(homeTile, anchor);
    if (dist < bestDist) {
      bestDist = dist;
      best = zone;
    }
  }
  return best;
}

function getZoneAnchor(state, zone) {
  if (!zone) return null;
  return getScenario(state).anchors?.[zone.anchor] ?? null;
}

function isWithinZone(tile, anchor, radius = 2) {
  return Boolean(tile && anchor) && tileDistance(tile, anchor) <= radius;
}

function isNearCore(tile, state, radius = 4) {
  const core = getScenario(state).anchors?.coreWarehouse ?? null;
  return isWithinZone(tile, core, radius);
}

function countInfrastructurePenalty(state, tile, radius = 1) {
  let penalty = 0;
  for (let iz = tile.iz - radius; iz <= tile.iz + radius; iz += 1) {
    for (let ix = tile.ix - radius; ix <= tile.ix + radius; ix += 1) {
      if (!inBounds(ix, iz, state.grid)) continue;
      if (Math.abs(ix - tile.ix) + Math.abs(iz - tile.iz) > radius) continue;
      const current = getTile(state.grid, ix, iz);
      if (current === TILE.WALL || current === TILE.WAREHOUSE) penalty += 0.38;
      else if (current === TILE.ROAD) penalty += 0.08;
    }
  }
  return penalty;
}

function getHazardPenalty(state, tile) {
  if (!tile) return 0;
  return Number(state.weather?.hazardPenaltyByKey?.[tileKey(tile.ix, tile.iz)] ?? 0);
}

function collectNearbyTilesOfTypes(grid, center, targetTypes, radius = 8) {
  if (!center) return [];
  const candidates = [];
  const seen = new Set();
  for (let iz = center.iz - radius; iz <= center.iz + radius; iz += 1) {
    for (let ix = center.ix - radius; ix <= center.ix + radius; ix += 1) {
      if (!inBounds(ix, iz, grid)) continue;
      if (Math.abs(ix - center.ix) + Math.abs(iz - center.iz) > radius) continue;
      const tile = getTile(grid, ix, iz);
      if (!targetTypes.includes(tile)) continue;
      const key = tileKey(ix, iz);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ ix, iz });
    }
  }
  return candidates;
}

function chooseHerbivoreGrazeTarget(animal, state, ecology, policy, herbivores = [], services = null) {
  const zone = getWildlifeZone(state, animal);
  const zoneAnchor = getZoneAnchor(state, zone) ?? animal.memory?.territoryAnchor ?? animal.memory?.homeTile ?? null;
  const current = worldToTile(animal.x, animal.z, state.grid);
  const searchRadius = Number(BALANCE.herbivoreGrazeSearchRadius ?? 8);
  const centers = [
    animal.memory?.migrationTarget ?? null,
    current,
    zoneAnchor,
    animal.memory?.homeTile ?? null,
  ].filter(Boolean);
  const candidates = [];
  const seen = new Set();
  for (const center of centers) {
    for (const candidate of collectNearbyTilesOfTypes(state.grid, center, [TILE.GRASS, TILE.FARM], searchRadius)) {
      const key = tileKey(candidate.ix, candidate.iz);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
    }
  }
  if (candidates.length <= 0) {
    // v0.8.8 B2 — prefer a leashed in-zone fallback over a whole-map
    // findNearestTileOfTypes call. The whole-map version could pull a
    // herbivore across the entire grid when its zone happens to be
    // grass-poor; staying close keeps the herd visually coherent.
    const leashCenter = zoneAnchor ?? current ?? worldToTile(animal.x, animal.z, state.grid);
    return leashedFallbackTile(state, leashCenter, BALANCE.wildlifeZoneLeashRadius ?? 12, services);
  }

  let best = null;
  let bestScore = -Infinity;
  const homeBias = Number(BALANCE.herbivoreHomeZoneBias ?? 0.68);
  const farmBias = Number(BALANCE.herbivoreFarmAttractionBonus ?? 1.15);
  const corePenalty = Number(BALANCE.herbivoreCoreAvoidancePenalty ?? 0.45);
  for (const candidate of candidates) {
    const currentType = getTile(state.grid, candidate.ix, candidate.iz);
    const key = tileKey(candidate.ix, candidate.iz);
    const pressure = Number(ecology.farmPressureByKey?.[key] ?? 0);
    let score = currentType === TILE.FARM
      ? 1.1 + farmBias * (1.2 - clamp(animal.hunger ?? 0.6, 0, 1)) + resolveTargetPriority(policy, "farm", 0.85) * 0.22
      : 0.95 + resolveTargetPriority(policy, "grass", 1) * 0.18;
    score -= tileDistance(current, candidate) * 0.12;
    score -= pressure * Math.max(0.18, resolveTargetPriority(policy, "safety", 1) * 0.12);
    score -= crowdPenaltyAroundTile(candidate, herbivores, state, animal.id) * 0.22 * resolveTargetPriority(policy, "safety", 1);
    score -= countInfrastructurePenalty(state, candidate, 1) * corePenalty * resolveTargetPriority(policy, "road", 0.8);
    score -= Math.max(0, getHazardPenalty(state, candidate) - 1) * 0.28 * resolveTargetPriority(policy, "safety", 1);
    if (zoneAnchor && isWithinZone(candidate, zoneAnchor, Number(zone?.radius ?? 2) + 2)) {
      score += homeBias + resolveTargetPriority(policy, "wildlife", 1) * 0.16;
    }
    if (animal.memory?.migrationTarget && tileDistance(candidate, animal.memory.migrationTarget) <= 3) score += 0.75;
    if (isNearCore(candidate, state, 4)) score -= corePenalty * resolveTargetPriority(policy, "safety", 1);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function choosePredatorPatrolTile(animal, state, ecology, services, policy, predators = []) {
  const zone = getWildlifeZone(state, animal);
  const zoneAnchor = getZoneAnchor(state, zone) ?? animal.memory?.territoryAnchor ?? animal.memory?.homeTile ?? null;
  const current = worldToTile(animal.x, animal.z, state.grid);
  const hotspotBias = Number(BALANCE.predatorFarmPressureAttraction ?? 1.05);
  const homeBias = Number(BALANCE.predatorHomeZoneBias ?? 0.72);
  let best = null;
  let bestScore = -Infinity;

  for (const [key, pressure] of Object.entries(ecology.farmPressureByKey ?? {})) {
    if (Number(pressure) < 0.14) continue;
    const tile = parseTileKey(key);
    if (!tile) continue;
    let score = Number(pressure) * hotspotBias + resolveTargetPriority(policy, "farm", 0.8) * 0.24;
    score -= tileDistance(current, tile) * 0.08;
    score -= crowdPenaltyAroundTile(tile, predators, state, animal.id) * 0.2;
    score -= Math.max(0, getHazardPenalty(state, tile) - 1) * 0.3;
    if (zoneAnchor && isWithinZone(tile, zoneAnchor, Number(zone?.radius ?? 2) + 5)) {
      score += homeBias + resolveTargetPriority(policy, "wildlife", 1) * 0.18;
    }
    if (score > bestScore) {
      bestScore = score;
      best = tile;
    }
  }
  if (best) {
    animal.debug.lastPatrolLabel = "farm-pressure hotspot";
    return best;
  }

  if (zoneAnchor) {
    const radius = Math.max(2, Number(zone?.radius ?? 2) + 2);
    const candidates = collectNearbyTilesOfTypes(state.grid, zoneAnchor, [TILE.GRASS, TILE.FARM, TILE.LUMBER, TILE.RUINS], radius);
    if (candidates.length > 0) {
      let best = candidates[0];
      let bestScore = -Infinity;
      for (const candidate of candidates) {
        const score = 1
          - tileDistance(current, candidate) * 0.05
          - crowdPenaltyAroundTile(candidate, predators, state, animal.id) * 0.22
          - Math.max(0, getHazardPenalty(state, candidate) - 1) * 0.3;
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      animal.debug.lastPatrolLabel = String(zone?.label ?? "frontier habitat");
      return best;
    }
    animal.debug.lastPatrolLabel = String(zone?.label ?? "frontier habitat");
    return zoneAnchor;
  }

  animal.debug.lastPatrolLabel = "open frontier";
  return randomPassableTile(state.grid, () => services.rng.next());
}

function choosePredatorPrey(animal, herbivores, state, policy) {
  let best = null;
  let bestScore = -Infinity;
  const hotspotFarms = state.metrics?.ecology?.hotspotFarms ?? [];

  for (const prey of herbivores ?? []) {
    if (!prey || prey.alive === false) continue;
    const preyTile = worldToTile(prey.x, prey.z, state.grid);
    const dist = Math.sqrt(distanceSq(animal, prey));
    const nearbyHerd = countNearbyKind(prey, herbivores, 3.2);
    const isolation = Math.max(0, 3 - nearbyHerd);
    const hotspotDistance = hotspotFarms.length > 0
      ? Math.min(...hotspotFarms.map((hotspot) => tileDistance(preyTile, hotspot)))
      : Infinity;
    const hotspotBonus = Number.isFinite(hotspotDistance) && hotspotDistance <= 3 ? 1 : hotspotDistance <= 5 ? 0.4 : 0;
    const zone = getWildlifeZone(state, prey);
    const zoneAnchor = getZoneAnchor(state, zone);
    const wildlifeBonus = zoneAnchor && isWithinZone(preyTile, zoneAnchor, Number(zone?.radius ?? 2) + 2) ? 1 : 0;
    const safetyPenalty = countInfrastructurePenalty(state, preyTile, 1) * resolveTargetPriority(policy, "safety", 0.5) * 0.18;

    const score = resolveTargetPriority(policy, "herbivore", 1) * 0.52
      + resolveTargetPriority(policy, "isolation", 1) * isolation * 0.24
      + resolveTargetPriority(policy, "farm", 0.8) * hotspotBonus * 0.18
      + resolveTargetPriority(policy, "wildlife", 1) * wildlifeBonus * 0.12
      - dist * 0.1
      - safetyPenalty;

    if (score > bestScore) {
      bestScore = score;
      best = prey;
    }
  }

  return best;
}

function countZoneAnimals(state, zoneId, animals) {
  if (!zoneId) return 0;
  let count = 0;
  for (const animal of animals ?? []) {
    if (!animal || animal.alive === false) continue;
    if (String(getWildlifeZone(state, animal)?.id ?? "") === zoneId) count += 1;
  }
  return count;
}

// v0.8.8 B2 — sample a passable tile within Manhattan radius of `center`.
// Used as a leashed fallback so animals don't teleport across the whole
// map when their zone is unsuitable. Walks an in-radius candidate set
// (~O(radius²)) and picks one at random; if none is passable, returns
// `center` itself (which collapses to "stay put" at the call site).
function leashedFallbackTile(state, center, radius, services) {
  if (!center || !state.grid) return center ?? null;
  const r = Math.max(1, Math.floor(Number(radius) || 1));
  const candidates = [];
  for (let iz = center.iz - r; iz <= center.iz + r; iz += 1) {
    for (let ix = center.ix - r; ix <= center.ix + r; ix += 1) {
      if (Math.abs(ix - center.ix) + Math.abs(iz - center.iz) > r) continue;
      if (!inBounds(ix, iz, state.grid)) continue;
      if (!isPassable(state.grid, ix, iz)) continue;
      candidates.push({ ix, iz });
    }
  }
  if (candidates.length === 0) return center;
  const rng = services?.rng?.next ? () => services.rng.next() : Math.random;
  const idx = Math.floor(rng() * candidates.length) % candidates.length;
  return candidates[idx];
}

function chooseSpreadTarget(animal, state, groupAnimals, services) {
  const zone = getWildlifeZone(state, animal);
  const zoneAnchor = getZoneAnchor(state, zone) ?? animal.memory?.territoryAnchor ?? animal.memory?.homeTile ?? null;
  const center = zoneAnchor ?? worldToTile(animal.x, animal.z, state.grid);
  const searchRadius = Math.max(3, Number(zone?.radius ?? 2) + 3);
  const candidates = collectNearbyTilesOfTypes(
    state.grid,
    center,
    animal.kind === ANIMAL_KIND.PREDATOR ? [TILE.GRASS, TILE.FARM, TILE.LUMBER, TILE.RUINS] : [TILE.GRASS, TILE.FARM, TILE.LUMBER],
    searchRadius,
  );
  let best = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    let nearestOther = Infinity;
    for (const other of groupAnimals ?? []) {
      if (!other || other.alive === false || other.id === animal.id) continue;
      const otherTile = worldToTile(other.x, other.z, state.grid);
      nearestOther = Math.min(nearestOther, tileDistance(candidate, otherTile));
    }
    const score = Math.min(6, nearestOther)
      - tileDistance(center, candidate) * 0.08
      - Math.max(0, getHazardPenalty(state, candidate) - 1) * 0.28
      - (isNearCore(candidate, state, 4) ? 0.55 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  if (!best && zoneAnchor) return zoneAnchor;
  // v0.8.8 B2 — leashed fallback. Pre-fix used randomPassableTile() which
  // could pull an animal across the entire map; now we stay near the home
  // zone (or current pos) so animals respect their territory.
  if (!best) {
    const leashCenter = zoneAnchor ?? worldToTile(animal.x, animal.z, state.grid);
    return leashedFallbackTile(state, leashCenter, BALANCE.wildlifeZoneLeashRadius ?? 12, services);
  }
  return best;
}

function shouldForceSpread(animal, groupAnimals, state, tuning, dt, excludedStates = new Set()) {
  const stateNode = String(animal.blackboard?.intent ?? animal.blackboard?.fsm?.state ?? "");
  if (excludedStates.has(stateNode)) {
    animal.debug.crowdingSec = 0;
    return false;
  }
  const nearby = countNearbyKind(animal, groupAnimals, Number(tuning.spreadCrowdRadius ?? 1.5));
  animal.debug.crowdingNeighbors = nearby;
  if (nearby >= Number(tuning.spreadCrowdNeighbors ?? 2)) {
    animal.debug.crowdingSec = Number(animal.debug.crowdingSec ?? 0) + dt;
  } else {
    animal.debug.crowdingSec = 0;
  }
  return Number(animal.debug.crowdingSec ?? 0) >= Number(tuning.spreadCrowdPersistSec ?? 6);
}

function prepareEcologyMetrics(state, dt) {
  const decay = Number(BALANCE.herbivoreFarmPressureDecayPerSecond ?? 0.16);
  const previous = state.metrics.ecology ?? {};
  const farmPressureByKey = {};
  for (const [key, value] of Object.entries(previous.farmPressureByKey ?? {})) {
    const next = Math.max(0, Number(value) - decay * dt);
    if (next >= 0.02) {
      farmPressureByKey[key] = Number(next.toFixed(3));
    }
  }
  const ecology = {
    activeGrazers: 0,
    pressuredFarms: 0,
    maxFarmPressure: 0,
    frontierPredators: 0,
    migrationHerds: 0,
    farmPressureByKey,
    hotspotFarms: [],
    herbivoresByZone: {},
    predatorsByZone: {},
    summary: "Ecology: recalculating",
  };
  state.metrics.ecology = ecology;
  state.debug.ecology = ecology;
  return ecology;
}

function recordZonePresence(ecology, animal, state) {
  const zone = getWildlifeZone(state, animal);
  if (!zone) return;
  const bucket = animal.kind === ANIMAL_KIND.PREDATOR ? ecology.predatorsByZone : ecology.herbivoresByZone;
  bucket[zone.id] = Number(bucket[zone.id] ?? 0) + 1;
}

function recordFarmPressure(animal, state, dt, ecology) {
  const tile = worldToTile(animal.x, animal.z, state.grid);
  if (getTile(state.grid, tile.ix, tile.iz) !== TILE.FARM) {
    animal.debug.lastGrazePressure = 0;
    return;
  }
  const key = tileKey(tile.ix, tile.iz);
  const add = Number(BALANCE.herbivoreFarmPressurePerSecond ?? 0.34) * dt;
  const next = clamp(Number(ecology.farmPressureByKey[key] ?? 0) + add, 0, 1.6);
  ecology.farmPressureByKey[key] = Number(next.toFixed(3));
  ecology.activeGrazers += 1;
  animal.debug.lastGrazePressure = next;
  animal.debug.lastGrazeTile = tile;
}

function recordFrontierPredator(animal, state, ecology) {
  const tile = worldToTile(animal.x, animal.z, state.grid);
  const zone = getWildlifeZone(state, animal);
  const zoneAnchor = getZoneAnchor(state, zone);
  if (zoneAnchor && isWithinZone(tile, zoneAnchor, Number(zone?.radius ?? 2) + 3)) {
    ecology.frontierPredators += 1;
    return;
  }
  if (!isNearCore(tile, state, 4)) ecology.frontierPredators += 1;
}

function finalizeEcologyMetrics(state, ecology) {
  const entries = Object.entries(ecology.farmPressureByKey ?? {})
    .map(([key, pressure]) => ({ tile: parseTileKey(key), pressure: Number(pressure) }))
    .filter((entry) => entry.tile)
    .sort((a, b) => b.pressure - a.pressure);
  ecology.pressuredFarms = entries.length;
  ecology.maxFarmPressure = entries.length > 0 ? Number(entries[0].pressure.toFixed(2)) : 0;
  ecology.hotspotFarms = entries.slice(0, 3).map((entry) => ({
    ix: entry.tile.ix,
    iz: entry.tile.iz,
    pressure: Number(entry.pressure.toFixed(2)),
  }));
  const zoneNames = getScenario(state).wildlifeZones ?? [];
  const topZone = zoneNames
    .map((zone) => ({
      label: zone.label,
      herbivores: Number(ecology.herbivoresByZone[zone.id] ?? 0),
      predators: Number(ecology.predatorsByZone[zone.id] ?? 0),
    }))
    .sort((a, b) => (b.herbivores + b.predators) - (a.herbivores + a.predators))[0] ?? null;
  const hotspotSummary = entries.length > 0 ? `top farm pressure ${ecology.maxFarmPressure.toFixed(2)}` : "no active farm pressure";
  const zoneSummary = topZone && (topZone.herbivores > 0 || topZone.predators > 0)
    ? ` busiest zone ${topZone.label} (herds ${topZone.herbivores}, predators ${topZone.predators})`
    : "";
  ecology.summary = `Ecology: pressured farms ${ecology.pressuredFarms}, ${hotspotSummary}, frontier predators ${ecology.frontierPredators}, migration herds ${ecology.migrationHerds}.${zoneSummary}`;
  state.debug.ecology = ecology;
}

function updateAnimalHunger(animal, dt) {
  const decay = animal.kind === ANIMAL_KIND.PREDATOR
    ? Number(BALANCE.predatorHungerDecayPerSecond ?? 0.012)
    : Number(BALANCE.herbivoreHungerDecayPerSecond ?? 0.009);
  animal.hunger = clamp((animal.hunger ?? 1) - decay * dt, 0, 1);
}

function recoverHerbivoreHunger(animal, dt, tileType = TILE.GRASS) {
  const recover = Number(BALANCE.herbivoreGrazeRecoveryPerSecond ?? 0.08);
  const bonus = tileType === TILE.FARM ? 1.18 : 1;
  animal.hunger = clamp((animal.hunger ?? 0) + recover * dt * bonus, 0, 1);
}

function recoverPredatorHungerOnHit(animal) {
  const recover = Number(BALANCE.predatorHungerRecoveryOnHit ?? 0.22);
  animal.hunger = clamp((animal.hunger ?? 0) + recover, 0, 1);
}

function herbivoreTick(animal, predators, herbivores, state, dt, services, stateNode, ecology, context = null) {
  const bb = animal.blackboard ?? (animal.blackboard = {});
  const policy = getAnimalPolicy(state, "herbivores");
  const tuning = getLongRunWildlifeTuning(state);
  const nearbyPredators = context?.nearbyPredators ?? predators;
  const nearbyHerbivores = context?.nearbyHerbivores ?? herbivores;
  const threat = context?.threat ?? nearestPredator(animal, nearbyPredators);
  const threatNear = Boolean(threat.predator && threat.distance <= HERBIVORE_FLEE_ENTER_DIST);
  const threatFar = Boolean(!threat.predator || threat.distance >= HERBIVORE_FLEE_EXIT_DIST);
  if (threatNear) {
    if (!bb.fleeLatch) {
      emitEvent(state, EVENT_TYPES.HERBIVORE_FLED, {
        entityId: animal.id, entityName: animal.displayName ?? animal.id,
        predatorId: threat.predator?.id, distance: threat.distance,
      });
    }
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
        // v0.8.8 B3 (M5) — when predator and herbivore share a tile,
        // dx=dz=0 and the old `|| 1` fallback caused the herbivore to flee
        // to its OWN current position (instant standstill, predator wins).
        // Now we sample a random angle so the herbivore at least bolts in
        // some direction — distance still 4 tiles, just direction is
        // randomised on the degenerate case.
        let dx = animal.x - predator.x;
        let dz = animal.z - predator.z;
        let len = Math.hypot(dx, dz);
        if (len < 0.001) {
          const angle = (services?.rng?.next ? services.rng.next() : Math.random()) * Math.PI * 2;
          dx = Math.cos(angle);
          dz = Math.sin(angle);
          len = 1;
        }
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

  const migrationTarget = animal.memory?.migrationTarget ?? null;
  const currentTile = worldToTile(animal.x, animal.z, state.grid);
  const hazardPenalty = getHazardPenalty(state, currentTile);
  const forceSpread = shouldForceSpread(animal, nearbyHerbivores, state, tuning, dt, FLEE_EXCLUDED_SPREAD_STATES);
  if ((forceSpread || hazardPenalty > Number(tuning.maxHazardPenaltyForSpawn ?? 1.45)) && canAttemptPath(animal, state)) {
    const nextCrowdRefreshSec = Number(animal.debug?.nextCrowdSpreadRefreshSec ?? -Infinity);
    if (state.metrics.timeSec >= nextCrowdRefreshSec || !hasActivePath(animal, state) || isPathStuck(animal, state, 1.8)) {
      clearPath(animal);
      const spreadTarget = chooseSpreadTarget(animal, state, nearbyHerbivores, services);
      if (spreadTarget && setTargetAndPath(animal, spreadTarget, state, services)) {
        animal.debug.lastCrowdResponse = hazardPenalty > Number(tuning.maxHazardPenaltyForSpawn ?? 1.45) ? "hazard-avoidance" : "spread";
        animal.debug.nextCrowdSpreadRefreshSec = state.metrics.timeSec + 1.1;
      }
    }
    if (hasActivePath(animal, state)) {
      animal.desiredVel = followPath(animal, state, dt).desired;
      return;
    }
  }
  if ((stateNode === "regroup" || stateNode === "wander") && migrationTarget) {
    ecology.migrationHerds += 1;
    const migrationDist = tileDistance(currentTile, migrationTarget);
    if (migrationDist > 2 && canAttemptPath(animal, state)) {
      setTargetAndPath(animal, migrationTarget, state, services);
    }
    if (hasActivePath(animal, state)) {
      animal.desiredVel = followPath(animal, state, dt).desired;
      return;
    }
    if (isAtTargetTile(animal, state)) {
      animal.memory.migrationTarget = null;
      animal.memory.migrationLabel = "";
    }
  }

  if (stateNode === "graze" || stateNode === "regroup") {
    if (!hasValidTarget(animal, state, [TILE.GRASS, TILE.FARM]) && canAttemptPath(animal, state)) {
      let target = null;
      // v0.8.8 B4 (M6) — when regrouping, pull toward herd centroid (avg
      // of nearby herbivores within radius 4). If no neighbours, fall
      // back to standard graze targeting so isolated herbivores still
      // find food. Without this, "regroup" was a duplicate of "graze".
      if (stateNode === "regroup") {
        let sumX = 0;
        let sumZ = 0;
        let count = 0;
        for (const other of nearbyHerbivores ?? []) {
          if (!other || other.alive === false || other.id === animal.id) continue;
          const dx = other.x - animal.x;
          const dz = other.z - animal.z;
          if ((dx * dx + dz * dz) > 16) continue; // radius 4
          sumX += other.x;
          sumZ += other.z;
          count += 1;
        }
        if (count > 0) {
          const cx = sumX / count;
          const cz = sumZ / count;
          const centroidTile = worldToTile(cx, cz, state.grid);
          if (centroidTile && inBounds(centroidTile.ix, centroidTile.iz, state.grid)
              && isPassable(state.grid, centroidTile.ix, centroidTile.iz)) {
            target = centroidTile;
            animal.memory.migrationTarget = { ix: centroidTile.ix, iz: centroidTile.iz };
          }
        }
      }
      if (!target) {
        target = chooseHerbivoreGrazeTarget(animal, state, ecology, policy, nearbyHerbivores, services);
      }
      if (target) setTargetAndPath(animal, target, state, services);
    }

    if (hasActivePath(animal, state)) {
      const step = followPath(animal, state, dt);
      animal.desiredVel = step.desired;
      return;
    }
    if (isAtTargetTile(animal, state)) {
      const currentTile = worldToTile(animal.x, animal.z, state.grid);
      const tileType = getTile(state.grid, currentTile.ix, currentTile.iz);
      setIdleDesired(animal);
      recoverHerbivoreHunger(animal, dt, tileType);
      if (tileType === TILE.FARM) {
        recordFarmPressure(animal, state, dt, ecology);
      }
      return;
    }
  }

  const zone = getWildlifeZone(state, animal);
  const zoneAnchor = getZoneAnchor(state, zone) ?? animal.memory?.homeTile ?? null;
  const wanderTarget = zoneAnchor && tileDistance(worldToTile(animal.x, animal.z, state.grid), zoneAnchor) > 6
    ? zoneAnchor
    : randomPassableTile(state.grid, () => services.rng.next());
  const nextWanderRefreshSec = Number(animal.debug?.nextWanderRefreshSec ?? -Infinity);
  if ((state.metrics.timeSec >= nextWanderRefreshSec || isPathStuck(animal, state, 2.0)) && canAttemptPath(animal, state)) {
    clearPath(animal);
    if (setTargetAndPath(animal, wanderTarget, state, services) && animal.debug) {
      animal.debug.nextWanderRefreshSec = state.metrics.timeSec + WANDER_REFRESH_BASE_SEC + services.rng.next() * WANDER_REFRESH_JITTER_SEC;
    }
  }
  if (hasActivePath(animal, state)) {
    animal.desiredVel = followPath(animal, state, dt).desired;
  } else {
    setIdleDesired(animal);
  }
}

// v0.8.4 strategic walls + GATE (Agent C). Find a WALL or GATE tile within
// 1 manhattan tile of (centerIx, centerIz). Returns null if none exists.
// Used by predator-branch + saboteur-branch wall-attack fallback when a
// hostile entity cannot path to its target.
function findAdjacentBarrier(state, centerIx, centerIz) {
  if (!state?.grid) return null;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dz] of dirs) {
    const ix = centerIx + dx;
    const iz = centerIz + dz;
    if (!inBounds(ix, iz, state.grid)) continue;
    const t = getTile(state.grid, ix, iz);
    if (t === TILE.WALL || t === TILE.GATE) {
      return { ix, iz, tileType: t };
    }
  }
  return null;
}

// v0.8.4 strategic walls + GATE (Agent C). Apply per-tick wall-attack
// damage. Called when a hostile is adjacent to a WALL/GATE and cannot
// otherwise reach its prey/target. Returns true if the structure was
// destroyed this tick (caller should clear path and reroute).
function applyWallAttack(state, attacker, barrier, dt) {
  if (!state?.grid?.tileState || !barrier) return false;
  const idx = barrier.ix + barrier.iz * state.grid.width;
  const entry = state.grid.tileState.get(idx);
  if (!entry) return false;
  // Initialise wallHp lazily if a prior path didn't go through onTileMutated
  // (e.g. scenario-generated walls placed before the state init seeded
  // wallHp). The lazy seed mirrors the value TileMutationHooks would set.
  // v0.8.5 Tier 3: gates use gateMaxHp (75); walls use wallMaxHp (50).
  if (entry.wallHp == null) {
    const isGate = barrier.tileType === TILE.GATE;
    entry.wallHp = isGate
      ? Number(BALANCE.gateMaxHp ?? BALANCE.wallMaxHp ?? 50)
      : Number(BALANCE.wallMaxHp ?? 50);
  }
  const dmg = Math.max(0, Number(BALANCE.wallAttackDamagePerSec ?? 5)) * Math.max(0, dt);
  entry.wallHp = Math.max(0, Number(entry.wallHp) - dmg);
  // v0.8.5 Tier 2 S2: track last damage tick so the regen pass in
  // ConstructionSystem can wait for a safe window before healing.
  entry.lastWallDamageTick = Number(state.metrics?.tick ?? 0);
  attacker.debug ??= {};
  attacker.debug.lastWallAttackHp = entry.wallHp;
  attacker.debug.lastWallAttackTile = { ix: barrier.ix, iz: barrier.iz };
  if (entry.wallHp <= 0) {
    // Mutate to RUINS — opens the path for everyone, including the
    // attacker. mutateTile fires the cleanup cascade so workers / paths
    // refresh on the next tick. The wallHp field is dropped via
    // TileMutationHooks step 5 (oldTile === WALL/GATE branch).
    mutateTile(state, barrier.ix, barrier.iz, TILE.RUINS);
    emitEvent(state, EVENT_TYPES.BUILDING_DESTROYED ?? "buildingDestroyed", {
      tool: barrier.tileType === TILE.GATE ? "gate" : "wall",
      ix: barrier.ix,
      iz: barrier.iz,
      oldType: barrier.tileType,
      newType: TILE.RUINS,
      cause: "wall-attack",
      attackerId: String(attacker.id ?? ""),
    });
    return true;
  }
  return false;
}

function predatorTick(animal, herbivores, predators, state, dt, services, stateNode, ecology, context = null) {
  animal.attackCooldownSec = Math.max(0, Number(animal.attackCooldownSec ?? 0) - dt);
  const policy = getAnimalPolicy(state, "predators");
  const tuning = getLongRunWildlifeTuning(state);
  const useLocalAnimalQueries = Boolean(context?.useLocalAnimalQueries);
  const nearbyHerbivores = context?.nearbyHerbivores ?? herbivores;
  const nearbyPredators = context?.nearbyPredators ?? predators;
  // v0.8.2 Round-6 Wave-2 (01d-mechanics-content Step 7) — species profile.
  const profile = getPredatorProfile(animal);
  const zoneId = String(getWildlifeZone(state, animal)?.id ?? "");
  const zoneHerbivores = zoneId
    ? countZoneAnimals(state, zoneId, herbivores)
    : (herbivores ?? []).filter((entry) => entry?.alive !== false).length;
  const huntSuppressed = zoneHerbivores <= Number(tuning.predatorHuntPreyFloor ?? 0);
  animal.debug ??= {};
  animal.debug.huntSuppressedReason = huntSuppressed ? "prey-floor" : "";
  animal.debug.predatorSpecies = String(animal.species ?? ANIMAL_SPECIES.WOLF);

  // raider_beast ignores herbivores entirely — they are the "raider" archetype
  // that exists to harass the colony, not the wildlife loop. v0.8.3 worker-
  // vs-raider combat: when `profile.targetsWorkers` is true (raider_beast)
  // we look up the nearest live worker as prey so the raider actively moves
  // toward the colony.
  let prey = null;
  if (!huntSuppressed && !profile.ignoresHerbivores) {
    prey = choosePredatorPrey(animal, useLocalAnimalQueries ? nearbyHerbivores : herbivores, state, policy);
  }
  if (!prey && profile.targetsWorkers) {
    let bestWorker = null;
    let bestD2 = Infinity;
    for (const w of state.agents ?? []) {
      if (!w || w.alive === false || w.type !== "WORKER") continue;
      const dx = w.x - animal.x;
      const dz = w.z - animal.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestWorker = w;
      }
    }
    prey = bestWorker;
    // raider_beast doesn't go through the normal stalk/hunt state machine
    // because that branch is gated on herbivore prey detection. Force the
    // stateNode to "stalk" so the chase block below activates.
    if (prey) stateNode = "stalk";
    // v0.8.6 Tier 2 Animal C2: when a raider_beast has no live worker prey
    // for ≥30 sim seconds (e.g. all workers are dead, or behind walls), bleed
    // hunger so the raider eventually starves and despawns instead of
    // wandering forever. Reset the dwell counter the moment prey reappears
    // so a transient empty-pool moment doesn't penalize a still-active
    // raider.
    animal.blackboard ??= {};
    if (!prey) {
      const dwell = Number(animal.blackboard.noPreySinceSec ?? 0) + dt;
      animal.blackboard.noPreySinceSec = dwell;
      if (dwell > 30) {
        // Net-negative hunger drain so a stuck raider dies in ~3 game-min.
        animal.hunger = Math.max(0, Number(animal.hunger ?? 0) - 0.05 * dt);
      }
    } else {
      animal.blackboard.noPreySinceSec = 0;
    }
  }
  const distance = prey ? Math.sqrt(distanceSq(animal, prey)) : Infinity;
  // v0.8.5 Tier 1 B1: chaseDistanceMult was a dead field on PREDATOR_SPECIES_PROFILE
  // (declared per-species but never read in predatorTick). Multiply the
  // baseline 6-tile chase tolerance by profile.chaseDistanceMult so bears
  // pursue out to 9 tiles, raiders to 7.2, and wolves stay at 6. Once a
  // predator's prey moves past this distance, drop the prey lock and fall
  // through to the patrol path (rather than infinitely sprinting after a
  // fleeing herbivore across the map).
  const chaseRangeBaseTiles = 6 * Number(state.grid?.tileSize ?? 1);
  const maxChaseTiles = chaseRangeBaseTiles * Number(profile.chaseDistanceMult ?? 1);
  if (prey && distance > maxChaseTiles) {
    prey = null;
    animal.debug.lastPatrolLabel = "lost-track-out-of-chase-range";
  }
  if (prey && (stateNode === "stalk" || stateNode === "hunt" || stateNode === "feed")) {
    const nowSec = state.metrics.timeSec;
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
    animal.debug.lastPatrolLabel = "";

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
        const preyIsWorker = String(prey.type ?? "") === "WORKER";
        const preyAttackBoost = preyIsWorker && prey.role === "GUARD" ? 0.5 : 1.0;
        // v0.8.3 worker-vs-raider combat — raider_beast uses its per-spawn
        // randomised attack damage if set; wolf/bear stay on the BALANCE
        // baseline. The 0.5 boost is GUARDs taking less damage in melee.
        const baseDmg = (animal.raiderAttackDamage != null && Number.isFinite(Number(animal.raiderAttackDamage)))
          ? Number(animal.raiderAttackDamage)
          : Number(BALANCE.predatorAttackDamage ?? 24);
        const dmg = baseDmg * preyAttackBoost;
        prey.hp = Math.max(0, Number(prey.hp ?? 0) - dmg);
        prey.memory.recentEvents.unshift("predator-hit");
        prey.memory.recentEvents.length = Math.min(prey.memory.recentEvents.length, 6);
        // v0.8.2 Round-6 Wave-2 (01d-mechanics-content Step 7) — species
        // attack cadence overrides the global BALANCE default. Bears are
        // slow but punishing; wolves stay on the standard 1.4s.
        animal.attackCooldownSec = (animal.raiderAttackCooldownSec != null
          && Number.isFinite(Number(animal.raiderAttackCooldownSec)))
          ? Number(animal.raiderAttackCooldownSec)
          : Number(profile.attackCooldownSec ?? BALANCE.predatorAttackCooldownSec ?? 1.4);
        recoverPredatorHungerOnHit(animal);
        emitEvent(state, EVENT_TYPES.PREDATOR_ATTACK, {
          entityId: animal.id, entityName: animal.displayName ?? animal.id,
          targetId: prey.id, targetName: prey.displayName ?? prey.id, damage: dmg,
        });
        if (prey.hp <= 0 && prey.alive !== false) {
          prey.alive = false;
          prey.deathReason = "predation";
          prey.deathSec = state.metrics.timeSec;
          prey.starvationSec = 0;
        }
        // v0.8.3 worker-vs-raider combat — Bidirectional melee. The directly
        // hit worker counter-attacks ONCE per landed hit if their own attack
        // cooldown is ready. GUARD-role workers deal `guardAttackDamage` (≈
        // 14); regular workers retaliate with `workerCounterAttackDamage`
        // (≈ 6). When the predator's hp drops to 0, mark deathReason
        // "killed-by-worker" so MortalitySystem / ecology metrics don't
        // misclassify it. NO area-of-effect — only the hit worker fights
        // back; nearby workers keep their day jobs.
        if (preyIsWorker && prey.alive !== false
            && Number(prey.attackCooldownSec ?? 0) <= 0
            && Number(animal.hp ?? 0) > 0) {
          const isGuard = prey.role === "GUARD";
          const counterDmg = isGuard
            ? Number(BALANCE.guardAttackDamage ?? 14)
            : Number(BALANCE.workerCounterAttackDamage ?? 6);
          animal.hp = Math.max(0, Number(animal.hp ?? 0) - counterDmg);
          prey.attackCooldownSec = Number(BALANCE.workerAttackCooldownSec ?? 1.6);
          prey.memory.recentEvents.unshift(isGuard ? "guard-counter" : "worker-counter");
          prey.memory.recentEvents.length = Math.min(prey.memory.recentEvents.length, 6);
          if (animal.hp <= 0 && animal.alive !== false) {
            animal.alive = false;
            animal.deathReason = "killed-by-worker";
            animal.deathSec = state.metrics.timeSec;
          }
        }
      }
      return;
    }
    if (isAtTargetTile(animal, state)) {
      setIdleDesired(animal);
      return;
    }
    // v0.8.4 strategic walls + GATE (Agent C). The predator has live prey
    // but couldn't acquire a path on this tick (path is null and we're not
    // at the target). If a WALL or GATE is within 1 manhattan tile, switch
    // to "attack_structure" mode and chip away at its hp until the
    // structure breaks (mutates to RUINS, opens the path for everyone).
    // Gating: we require the predator to have been actively trying to
    // reach prey for ≥1.5s (`pathFailDwellSec`) so a transient one-tick
    // path miss while patrolling near a wall doesn't trigger wall-attack
    // — only sustained "stuck on wall" hostility does. This keeps
    // long-horizon plains baselines (where predators wander past walls
    // every patrol cycle) from chipping at walls every time a path fails.
    if (!hasActivePath(animal, state)) {
      const bb = animal.blackboard ?? (animal.blackboard = {});
      const dwell = Number(bb.pathFailDwellSec ?? 0) + dt;
      bb.pathFailDwellSec = dwell;
      if (dwell >= 1.5) {
        const here = worldToTile(animal.x, animal.z, state.grid);
        const barrier = findAdjacentBarrier(state, here.ix, here.iz);
        if (barrier) {
          bb.intent = "attack_structure";
          animal.stateLabel = "Wall-attack";
          setIdleDesired(animal);
          applyWallAttack(state, animal, barrier, dt);
          return;
        }
      }
    } else if (animal.blackboard) {
      animal.blackboard.pathFailDwellSec = 0;
    }
  }

  // v0.8.6 Tier 2 Animal C1: cap predator passive hunger recovery so it stays
  // NET-NEGATIVE without active feed. Pre-fix the passive line added 0.24 ×
  // 0.12 = 0.0288/s while predator decay was ~0.012/s — predators effectively
  // never starved, so wildlife population growth was capped only by spawn
  // rate. Multiplier dropped 0.12 → 0.04 makes recovery 0.0096/s vs decay
  // 0.012/s → net -0.0024/s while idle, requiring active hunting/feeding to
  // actually gain hunger.
  animal.hunger = clamp((animal.hunger ?? 0) + Number(BALANCE.predatorHungerRecoveryOnHit ?? 0.24) * dt * 0.04, 0, 1);
  const nowSec = state.metrics.timeSec;
  const currentTile = worldToTile(animal.x, animal.z, state.grid);
  const hazardPenalty = getHazardPenalty(state, currentTile);
  const forceSpread = shouldForceSpread(animal, nearbyPredators, state, tuning, dt);
  if ((!prey && forceSpread) || hazardPenalty > Number(tuning.maxHazardPenaltyForSpawn ?? 1.45)) {
    const nextCrowdRefreshSec = Number(animal.debug?.nextCrowdSpreadRefreshSec ?? -Infinity);
    const pathInvalid = !hasActivePath(animal, state) || isPathStuck(animal, state, 2.0);
    if ((pathInvalid || nowSec >= nextCrowdRefreshSec) && canAttemptPath(animal, state)) {
      clearPath(animal);
      const spreadTarget = chooseSpreadTarget(animal, state, nearbyPredators, services);
      if (spreadTarget && setTargetAndPath(animal, spreadTarget, state, services)) {
        animal.debug.lastCrowdResponse = hazardPenalty > Number(tuning.maxHazardPenaltyForSpawn ?? 1.45) ? "hazard-avoidance" : "spread";
        animal.debug.nextCrowdSpreadRefreshSec = nowSec + 1.15;
      }
    }
    if (hasActivePath(animal, state)) {
      animal.desiredVel = followPath(animal, state, dt).desired;
      return;
    }
  }
  const nextPatrolRefreshSec = Number(animal.debug?.nextPatrolRefreshSec ?? -Infinity);
  const pathStale = Boolean(animal.path) && animal.pathGridVersion !== state.grid.version;
  const pathMissingAwayFromTarget = !hasActivePath(animal, state) && !isAtTargetTile(animal, state);
  const pathStuck = isPathStuck(animal, state, 2.0);
  const zone = getWildlifeZone(state, animal);
  const zoneAnchor = getZoneAnchor(state, zone) ?? animal.memory?.territoryAnchor ?? animal.memory?.homeTile ?? null;
  const atTerritory = zoneAnchor ? isWithinZone(currentTile, zoneAnchor, Number(zone?.radius ?? 2) + 1) : false;
    const shouldPatrol = stateNode === "stalk" || stateNode === "roam" || (stateNode === "rest" && !atTerritory);
  if (shouldPatrol && canAttemptPath(animal, state) && (pathStale || pathMissingAwayFromTarget || pathStuck || nowSec >= nextPatrolRefreshSec)) {
    clearPath(animal);
    const patrolTarget = choosePredatorPatrolTile(animal, state, ecology, services, policy, nearbyPredators);
    if (patrolTarget && setTargetAndPath(animal, patrolTarget, state, services) && animal.debug) {
      animal.debug.nextPatrolRefreshSec = nowSec + Number(BALANCE.predatorPatrolRefreshSec ?? 1.6);
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
    this.highLoadStride = 1;
    this.herbivoreHash = { map: new Map(), cellSize: 8 };
    this.predatorHash = { map: new Map(), cellSize: 8 };
    this.herbivoreNeighborBuffer = [];
    this.predatorNeighborBuffer = [];
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
    const ecology = prepareEcologyMetrics(state, dt);
    const activeAnimalCount = this.herbivores.length + this.predators.length;
    const requestedScale = Number(state.controls?.timeScale ?? 1);
    const totalEntities = Number(state.agents?.length ?? 0) + Number(state.animals?.length ?? 0);
    const stride = requestedScale >= 7
      ? (activeAnimalCount >= 1000 || totalEntities >= 1200 ? 3
        : activeAnimalCount >= 500 || totalEntities >= 1000 ? 2
          : activeAnimalCount >= 220 || totalEntities >= 650 ? 1
            : 1)
      : (activeAnimalCount >= 1000 ? 4
        : activeAnimalCount >= 500 ? 3
          : activeAnimalCount >= 220 ? 2
            : 1);
    const useLocalAnimalQueries = activeAnimalCount >= 220;
    if (useLocalAnimalQueries) {
      buildSpatialHash(this.herbivores, 8, this.herbivoreHash);
      buildSpatialHash(this.predators, 8, this.predatorHash);
    }
    this.highLoadStride = stride;
    const tick = Number(state.metrics?.tick ?? 0);
    let processed = 0;
    let skipped = 0;
    for (const animal of state.animals) {
      if (animal.alive === false) continue;
      recordZonePresence(ecology, animal, state);
      const blackboard = animal.blackboard ?? (animal.blackboard = {});
      let animalDt = dt;
      if (stride > 1) {
        blackboard.aiLodDt = Number(blackboard.aiLodDt ?? 0) + dt;
        if (!Number.isFinite(blackboard.aiLodPhase)) {
          let phaseSeed = 0;
          const id = String(animal.id ?? "");
          for (let i = 0; i < id.length; i += 1) phaseSeed += id.charCodeAt(i);
          blackboard.aiLodPhase = Math.abs(phaseSeed);
        }
        const phase = blackboard.aiLodPhase % stride;
        if ((tick + phase) % stride !== 0) {
          if (hasActivePath(animal, state)) {
            animal.desiredVel = followPath(animal, state, dt).desired;
          } else {
            setIdleDesired(animal);
          }
          skipped += 1;
          continue;
        }
        animalDt = Math.max(dt, Number(blackboard.aiLodDt ?? dt));
        blackboard.aiLodDt = 0;
      }
      processed += 1;
      updateAnimalHunger(animal, animalDt);

      const groupId = animal.kind === ANIMAL_KIND.HERBIVORE ? "herbivores" : "predators";
      const nearbyPredators = useLocalAnimalQueries
        ? queryNeighbors(this.predatorHash, animal, this.predatorNeighborBuffer, 192)
        : this.predators;
      const nearbyHerbivores = useLocalAnimalQueries
        ? queryNeighbors(this.herbivoreHash, animal, this.herbivoreNeighborBuffer, 192)
        : this.herbivores;
      const animalContext = {
        predators: nearbyPredators,
        herbivores: nearbyHerbivores,
        nearbyPredators,
        nearbyHerbivores,
        useLocalAnimalQueries,
      };
      const plan = planEntityDesiredState(animal, state, animalContext);
      const stateNode = transitionEntityState(animal, groupId, plan.desiredState, state.metrics.timeSec, plan.reason);

      animal.blackboard.intent = stateNode;
      animal.stateLabel = mapStateToDisplayLabel(groupId, stateNode);
      animal.debug ??= {};
      animal.debug.lastIntent = stateNode;
      animal.debug.lastStateNode = stateNode;

      if (groupId === "herbivores") {
        const bb = animal.blackboard ?? (animal.blackboard = {});
        const threat = nearestPredator(animal, nearbyPredators);
        animalContext.threat = threat;
        const threatNear = Boolean(threat.predator && threat.distance <= HERBIVORE_FLEE_ENTER_DIST);
        const threatFar = Boolean(!threat.predator || threat.distance >= HERBIVORE_FLEE_EXIT_DIST);
        if (threatNear) bb.fleeLatch = true;
        else if (threatFar) bb.fleeLatch = false;
        if (stateNode === "idle") setIdleDesired(animal);
        else herbivoreTick(animal, this.predators, this.herbivores, state, animalDt, services, stateNode, ecology, animalContext);
      } else {
        predatorTick(animal, this.herbivores, this.predators, state, animalDt, services, stateNode, ecology, animalContext);
        recordFrontierPredator(animal, state, ecology);
      }

      updateIdleWithoutReasonMetric(animal, stateNode, animalDt, state);
    }
    finalizeEcologyMetrics(state, ecology);
    // v0.10.2 PM-deep-perf R7 — inline combat-metrics duplicate deleted.
    // Canonical writer is MortalitySystem.recomputeCombatMetricsThrottled
    // (lifecycle pass, R6 PK-throttled, ~95% cache-hit on peaceful ticks).
    // Saves ~2.0 ms/tick avg per PM measurement; no behaviour change because
    // MortalitySystem writes the identical state.metrics.combat shape
    // (activeThreats, activeRaiders, activePredators, activeSaboteurs,
    // guardCount, workerCount, nearestThreatDistance) and additionally
    // counts saboteurs which the deleted twin missed.
    if (state.debug) {
      state.debug.animalAiLod = {
        stride,
        processed,
        skipped,
        activeAnimalCount,
      };
    }
  }
}
