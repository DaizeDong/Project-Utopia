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

function chooseHerbivoreGrazeTarget(animal, state, ecology) {
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
    return findNearestTileOfTypes(state.grid, animal, [TILE.FARM, TILE.GRASS]);
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
    let score = currentType === TILE.FARM ? 1.1 + farmBias * (1.2 - clamp(animal.hunger ?? 0.6, 0, 1)) : 0.95;
    score -= tileDistance(current, candidate) * 0.12;
    score -= pressure * 0.28;
    score -= countInfrastructurePenalty(state, candidate, 1) * corePenalty;
    if (zoneAnchor && isWithinZone(candidate, zoneAnchor, Number(zone?.radius ?? 2) + 2)) score += homeBias;
    if (animal.memory?.migrationTarget && tileDistance(candidate, animal.memory.migrationTarget) <= 3) score += 0.75;
    if (isNearCore(candidate, state, 4)) score -= corePenalty;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function choosePredatorPatrolTile(animal, state, ecology, services) {
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
    let score = Number(pressure) * hotspotBias;
    score -= tileDistance(current, tile) * 0.08;
    if (zoneAnchor && isWithinZone(tile, zoneAnchor, Number(zone?.radius ?? 2) + 5)) score += homeBias;
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
      animal.debug.lastPatrolLabel = String(zone?.label ?? "frontier habitat");
      return candidates[Math.floor(services.rng.next() * candidates.length)];
    }
    animal.debug.lastPatrolLabel = String(zone?.label ?? "frontier habitat");
    return zoneAnchor;
  }

  animal.debug.lastPatrolLabel = "open frontier";
  return randomPassableTile(state.grid);
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

function herbivoreTick(animal, predators, state, dt, services, stateNode, ecology) {
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

  const migrationTarget = animal.memory?.migrationTarget ?? null;
  if ((stateNode === "regroup" || stateNode === "wander") && migrationTarget) {
    ecology.migrationHerds += 1;
    const migrationDist = tileDistance(worldToTile(animal.x, animal.z, state.grid), migrationTarget);
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
      const grazeTarget = chooseHerbivoreGrazeTarget(animal, state, ecology);
      if (grazeTarget) setTargetAndPath(animal, grazeTarget, state, services);
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
    : randomPassableTile(state.grid);
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

function predatorTick(animal, herbivores, state, dt, services, stateNode, ecology) {
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

  animal.hunger = clamp((animal.hunger ?? 0) + Number(BALANCE.predatorHungerRecoveryOnHit ?? 0.24) * dt * 0.12, 0, 1);
  const nowSec = state.metrics.timeSec;
  const nextPatrolRefreshSec = Number(animal.debug?.nextPatrolRefreshSec ?? -Infinity);
  const pathStale = Boolean(animal.path) && animal.pathGridVersion !== state.grid.version;
  const pathMissingAwayFromTarget = !hasActivePath(animal, state) && !isAtTargetTile(animal, state);
  const pathStuck = isPathStuck(animal, state, 2.0);
  const zone = getWildlifeZone(state, animal);
  const zoneAnchor = getZoneAnchor(state, zone) ?? animal.memory?.territoryAnchor ?? animal.memory?.homeTile ?? null;
  const currentTile = worldToTile(animal.x, animal.z, state.grid);
  const atTerritory = zoneAnchor ? isWithinZone(currentTile, zoneAnchor, Number(zone?.radius ?? 2) + 1) : false;
  const shouldPatrol = stateNode === "stalk" || stateNode === "roam" || (stateNode === "rest" && !atTerritory);
  if (shouldPatrol && canAttemptPath(animal, state) && (pathStale || pathMissingAwayFromTarget || pathStuck || nowSec >= nextPatrolRefreshSec)) {
    clearPath(animal);
    const patrolTarget = choosePredatorPatrolTile(animal, state, ecology, services);
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
    for (const animal of state.animals) {
      if (animal.alive === false) continue;
      updateAnimalHunger(animal, dt);
      recordZonePresence(ecology, animal, state);

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
        else herbivoreTick(animal, this.predators, state, dt, services, stateNode, ecology);
      } else {
        predatorTick(animal, this.herbivores, state, dt, services, stateNode, ecology);
        recordFrontierPredator(animal, state, ecology);
      }

      updateIdleWithoutReasonMetric(animal, stateNode, dt, state);
    }
    finalizeEcologyMetrics(state, ecology);
  }
}
