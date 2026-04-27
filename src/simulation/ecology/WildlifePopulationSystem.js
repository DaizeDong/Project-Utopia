import { ANIMAL_KIND, TILE } from "../../config/constants.js";
import { getLongRunWildlifeTuning, getWildlifeZoneLimits } from "../../config/longRunProfile.js";
import {
  createAnimal,
  createDefaultWildlifeRuntime,
} from "../../entities/EntityFactory.js";
import { getTile, inBounds, tileToWorld, worldToTile } from "../../world/grid/Grid.js";

const HERBIVORE_SPAWN_TILES = Object.freeze([TILE.GRASS, TILE.FARM, TILE.LUMBER, TILE.RUINS]);
const PREDATOR_SPAWN_TILES = Object.freeze([TILE.GRASS, TILE.FARM, TILE.LUMBER, TILE.RUINS]);

function tileKey(ix, iz) {
  return `${ix},${iz}`;
}

function tileDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.abs(Number(a.ix ?? 0) - Number(b.ix ?? 0)) + Math.abs(Number(a.iz ?? 0) - Number(b.iz ?? 0));
}

function distanceSq(a, b) {
  if (!a || !b) return Infinity;
  const dx = Number(a.x ?? 0) - Number(b.x ?? 0);
  const dz = Number(a.z ?? 0) - Number(b.z ?? 0);
  return dx * dx + dz * dz;
}

function getScenario(state) {
  return state.gameplay?.scenario ?? {};
}

function getZoneAnchor(state, zone) {
  return getScenario(state).anchors?.[zone?.anchor] ?? null;
}

function isWithinZone(tile, anchor, radius = 2) {
  return Boolean(tile && anchor) && tileDistance(tile, anchor) <= radius;
}

function isNearCore(tile, state, radius = 4) {
  const core = getScenario(state).anchors?.coreWarehouse ?? null;
  return isWithinZone(tile, core, radius);
}

function assignAnimalHabitat(animal, zone, anchor, spawnTile) {
  animal.memory.homeTile = spawnTile ? { ix: spawnTile.ix, iz: spawnTile.iz } : null;
  animal.memory.territoryAnchor = anchor ? { ix: anchor.ix, iz: anchor.iz } : null;
  animal.memory.territoryRadius = Number(zone?.radius ?? 0);
  animal.memory.homeZoneId = String(zone?.id ?? "");
  animal.memory.homeZoneLabel = String(zone?.label ?? "");
  animal.memory.migrationTarget = null;
  animal.memory.migrationLabel = "";
}

function ensureWildlifeRuntime(state) {
  state.gameplay.wildlifeRuntime ??= createDefaultWildlifeRuntime();
  state.gameplay.wildlifeRuntime.zoneControl ??= {};
  state.gameplay.wildlifeRuntime.clusterState ??= {};
  state.gameplay.wildlifeRuntime.audit ??= {
    herbivoreZeroSinceSec: null,
    predatorWithoutPreySinceSec: null,
  };
  state.gameplay.wildlifeRuntime.audit.births ??= 0;
  state.gameplay.wildlifeRuntime.audit.breedingSpawns ??= 0;
  state.gameplay.wildlifeRuntime.audit.recoverySpawns ??= 0;
  state.gameplay.wildlifeRuntime.audit.predatorRecoverySpawns ??= 0;
  state.gameplay.wildlifeRuntime.audit.predatorRetreats ??= 0;
  state.gameplay.wildlifeRuntime.audit.predationDeaths ??= 0;
  state.gameplay.wildlifeRuntime.audit.starvationDeaths ??= 0;
  return state.gameplay.wildlifeRuntime;
}

function ensureZoneControl(runtime, zoneId) {
  runtime.zoneControl[zoneId] ??= {
    herbivoreLowSec: 0,
    predatorAbsentSec: 0,
    predatorPressureSec: 0,
    stableSec: 0,
    extinctionSec: 0,
    nextRecoveryAtSec: -Infinity,
    nextBreedAtSec: -Infinity,
    nextPredatorRecoveryAtSec: -Infinity,
  };
  return runtime.zoneControl[zoneId];
}

function nearestZoneForAnimal(state, animal) {
  const scenario = getScenario(state);
  const zones = scenario.wildlifeZones ?? [];
  if (zones.length <= 0) return null;
  const byId = String(animal.memory?.homeZoneId ?? "");
  if (byId) {
    const found = zones.find((zone) => zone.id === byId);
    if (found) return found;
  }
  const currentTile = animal.memory?.homeTile ?? animal.memory?.territoryAnchor ?? worldToTile(animal.x, animal.z, state.grid);
  let best = null;
  let bestDist = Infinity;
  for (const zone of zones) {
    const anchor = getZoneAnchor(state, zone);
    if (!anchor) continue;
    const dist = tileDistance(currentTile, anchor);
    if (dist < bestDist) {
      bestDist = dist;
      best = zone;
    }
  }
  return best;
}

function buildZoneBuckets(state) {
  const scenario = getScenario(state);
  const buckets = {};
  for (const zone of scenario.wildlifeZones ?? []) {
    buckets[zone.id] = {
      zone,
      herbivores: [],
      predators: [],
    };
  }
  for (const animal of state.animals ?? []) {
    if (!animal || animal.alive === false) continue;
    const zone = nearestZoneForAnimal(state, animal);
    if (!zone) continue;
    const bucket = buckets[zone.id] ?? (buckets[zone.id] = { zone, herbivores: [], predators: [] });
    if (animal.kind === ANIMAL_KIND.HERBIVORE) bucket.herbivores.push(animal);
    if (animal.kind === ANIMAL_KIND.PREDATOR) bucket.predators.push(animal);
  }
  return buckets;
}

function getZoneHazardPenalty(anchor, state) {
  if (!anchor) return 0;
  const penalties = state.weather?.hazardPenaltyByKey ?? {};
  let best = 0;
  for (let iz = anchor.iz - 1; iz <= anchor.iz + 1; iz += 1) {
    for (let ix = anchor.ix - 1; ix <= anchor.ix + 1; ix += 1) {
      const penalty = Number(penalties[tileKey(ix, iz)] ?? 0);
      if (penalty > best) best = penalty;
    }
  }
  return best;
}

function isSafeRecoveryWindow(state, anchor, tuning) {
  const weatherPressure = Number(state.metrics?.spatialPressure?.weatherPressure ?? 0);
  const eventPressure = Number(state.metrics?.spatialPressure?.eventPressure ?? 0);
  const hazardPenalty = getZoneHazardPenalty(anchor, state);
  return weatherPressure <= Number(tuning.lowPressureWeatherMax ?? Infinity)
    && eventPressure <= Number(tuning.lowPressureEventMax ?? Infinity)
    && hazardPenalty <= Number(tuning.maxHazardPenaltyForSpawn ?? Infinity);
}

function pickSpawnTile(state, zone, kind, tuning, rng) {
  const anchor = getZoneAnchor(state, zone);
  if (!anchor) return null;
  const radius = Math.max(2, Number(zone.radius ?? 2) + 2);
  const targetTiles = kind === ANIMAL_KIND.PREDATOR ? PREDATOR_SPAWN_TILES : HERBIVORE_SPAWN_TILES;
  const candidates = [];
  for (let iz = anchor.iz - radius; iz <= anchor.iz + radius; iz += 1) {
    for (let ix = anchor.ix - radius; ix <= anchor.ix + radius; ix += 1) {
      if (!inBounds(ix, iz, state.grid)) continue;
      if (Math.abs(ix - anchor.ix) + Math.abs(iz - anchor.iz) > radius) continue;
      const tile = getTile(state.grid, ix, iz);
      if (!targetTiles.includes(tile)) continue;
      const penalty = Number(state.weather?.hazardPenaltyByKey?.[tileKey(ix, iz)] ?? 0);
      if (penalty > Number(tuning.maxHazardPenaltyForSpawn ?? Infinity)) continue;
      const tileCoord = { ix, iz };
      if (isNearCore(tileCoord, state, Number(tuning.coreAvoidRadius ?? 4))) continue;
      const tooCloseToOthers = (state.animals ?? []).some((animal) => {
        if (!animal || animal.alive === false) return false;
        const current = worldToTile(animal.x, animal.z, state.grid);
        const minDistance = kind === ANIMAL_KIND.HERBIVORE && animal.kind === ANIMAL_KIND.PREDATOR
          ? Number(tuning.herbivoreSpawnAvoidPredatorRadius ?? 3)
          : 1;
        return tileDistance(current, tileCoord) <= minDistance;
      });
      if (tooCloseToOthers) continue;
      candidates.push(tileCoord);
    }
  }
  if (candidates.length <= 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

function spawnAnimals(state, zone, kind, count, runtime, eventKey, rng, tuning) {
  const anchor = getZoneAnchor(state, zone);
  let spawned = 0;
  for (let i = 0; i < count; i += 1) {
    const tile = pickSpawnTile(state, zone, kind, tuning, rng);
    if (!tile) break;
    const pos = tileToWorld(tile.ix, tile.iz, state.grid);
    const animal = createAnimal(pos.x, pos.z, kind, rng);
    assignAnimalHabitat(animal, zone, anchor, tile);
    animal.hunger = kind === ANIMAL_KIND.PREDATOR ? 0.72 : 0.78;
    animal.blackboard = {
      ...(animal.blackboard ?? {}),
      spawnedForRecovery: eventKey,
    };
    state.animals.push(animal);
    spawned += 1;
  }
  if (spawned > 0) {
    runtime.audit.births = Number(runtime.audit.births ?? 0) + spawned;
    runtime.audit[eventKey] = Number(runtime.audit[eventKey] ?? 0) + spawned;
  }
  return spawned;
}

function consumeAnimalDeathMetrics(state, runtime) {
  const pending = state.metrics.ecologyPendingDeaths ?? { predation: 0, starvation: 0 };
  runtime.audit.predationDeaths = Number(runtime.audit.predationDeaths ?? 0) + Number(pending.predation ?? 0);
  runtime.audit.starvationDeaths = Number(runtime.audit.starvationDeaths ?? 0) + Number(pending.starvation ?? 0);
  state.metrics.ecologyPendingDeaths = {
    predation: 0,
    starvation: 0,
    event: 0,
  };
}

function buildComponents(animals, radius, excludedStates = new Set()) {
  const active = animals.filter((animal) => {
    const stateNode = String(animal.blackboard?.intent ?? animal.blackboard?.fsm?.state ?? "");
    return !excludedStates.has(stateNode);
  });
  const visited = new Set();
  const components = [];
  const r2 = radius * radius;
  for (const animal of active) {
    if (visited.has(animal.id)) continue;
    const queue = [animal];
    visited.add(animal.id);
    const members = [];
    while (queue.length > 0) {
      const current = queue.shift();
      members.push(current);
      for (const other of active) {
        if (visited.has(other.id) || other.id === current.id) continue;
        if (distanceSq(current, other) <= r2) {
          visited.add(other.id);
          queue.push(other);
        }
      }
    }
    components.push(members);
  }
  return components;
}

function updateClusterMetrics(state, runtime, tuning) {
  const nowSec = Number(state.metrics?.timeSec ?? 0);
  const byGroup = {};
  let overallMaxClusterSize = 0;
  let stuckClusterCount = 0;
  let longestClusterDurationSec = 0;
  const groups = [
    { id: "herbivores", animals: (state.animals ?? []).filter((animal) => animal.alive !== false && animal.kind === ANIMAL_KIND.HERBIVORE), excludedStates: new Set(["flee", "regroup"]) },
    { id: "predators", animals: (state.animals ?? []).filter((animal) => animal.alive !== false && animal.kind === ANIMAL_KIND.PREDATOR), excludedStates: new Set() },
  ];

  for (const group of groups) {
    const components = buildComponents(group.animals, Number(tuning.clusterRadius ?? 1.25), group.excludedStates);
    const crowdedCount = components
      .filter((component) => component.length > 1)
      .reduce((sum, component) => sum + component.length, 0);
    const maxClusterSize = components.reduce((best, component) => Math.max(best, component.length), 0);
    const ratio = group.animals.length > 0 ? crowdedCount / group.animals.length : 0;
    const stateForGroup = runtime.clusterState[group.id] ?? (runtime.clusterState[group.id] = {
      activeSinceSec: null,
      longestDurationSec: 0,
    });
    if (ratio >= Number(tuning.clusterRatioThreshold ?? 0.7) && maxClusterSize > 1) {
      stateForGroup.activeSinceSec ??= nowSec;
    } else {
      stateForGroup.activeSinceSec = null;
    }
    const currentDurationSec = stateForGroup.activeSinceSec == null ? 0 : Math.max(0, nowSec - stateForGroup.activeSinceSec);
    stateForGroup.longestDurationSec = Math.max(Number(stateForGroup.longestDurationSec ?? 0), currentDurationSec);
    if (currentDurationSec >= Number(tuning.clusterHoldSec ?? 30)) {
      stuckClusterCount += components.filter((component) => component.length > 1).length;
    }
    overallMaxClusterSize = Math.max(overallMaxClusterSize, maxClusterSize);
    longestClusterDurationSec = Math.max(longestClusterDurationSec, Number(stateForGroup.longestDurationSec ?? 0));
    byGroup[group.id] = {
      ratio: Number(ratio.toFixed(2)),
      crowdedCount,
      componentCount: components.filter((component) => component.length > 1).length,
      maxClusterSize,
      currentDurationSec: Number(currentDurationSec.toFixed(2)),
      longestDurationSec: Number(stateForGroup.longestDurationSec.toFixed(2)),
    };
  }

  return {
    maxSameSpeciesClusterSize: overallMaxClusterSize,
    stuckClusterCount,
    longestClusterDurationSec: Number(longestClusterDurationSec.toFixed(2)),
    byGroup,
  };
}

function computeZoneCrowdScore(animals, tuning, excludedStates = new Set()) {
  if ((animals?.length ?? 0) <= 1) return 0;
  const components = buildComponents(animals, Number(tuning.clusterRadius ?? 1.25), excludedStates);
  const crowdedCount = components
    .filter((component) => component.length > 1)
    .reduce((sum, component) => sum + component.length, 0);
  return Number((crowdedCount / Math.max(1, animals.length)).toFixed(2));
}

function updateZonePopulation(state, runtime, bucket, tuning, rng, dt) {
  const nowSec = Number(state.metrics?.timeSec ?? 0);
  const { zone, herbivores, predators } = bucket;
  const anchor = getZoneAnchor(state, zone);
  const herbivoreLimits = getWildlifeZoneLimits(state.world?.mapTemplateId, "herbivores", tuning);
  const predatorLimits = getWildlifeZoneLimits(state.world?.mapTemplateId, "predators", tuning);
  const control = ensureZoneControl(runtime, zone.id);
  const lowPressure = isSafeRecoveryWindow(state, anchor, tuning);
  let herbivoreCount = herbivores.length;
  let predatorCount = predators.length;
  const healthyHerbivores = herbivores.filter((animal) => Number(animal.hunger ?? 0) >= 0.45).length;
  const stableFloor = Math.max(1, Math.min(
    Number(tuning.herbivoreStableFloor ?? herbivoreLimits.min ?? 2),
    Number(herbivoreLimits.max ?? 6),
  ));
  const crowdScore = Math.max(
    computeZoneCrowdScore(herbivores, tuning, new Set(["flee", "regroup"])),
    computeZoneCrowdScore(predators, tuning),
  );

  control.extinctionSec = herbivoreCount <= 0 ? Number((control.extinctionSec + dt).toFixed(2)) : 0;
  control.herbivoreLowSec = herbivoreCount < Number(tuning.herbivoreLowWatermark ?? 2) ? Number((control.herbivoreLowSec + dt).toFixed(2)) : 0;
  control.predatorAbsentSec = predatorCount <= 0 ? Number((control.predatorAbsentSec + dt).toFixed(2)) : 0;
  control.predatorPressureSec = predatorCount > 0 && herbivoreCount <= Number(tuning.predatorRetreatPreyFloor ?? 0)
    ? Number((control.predatorPressureSec + dt).toFixed(2))
    : 0;
  const stable = lowPressure
    && crowdScore < Number(tuning.clusterRatioThreshold ?? 0.7)
    && herbivoreCount >= stableFloor
    && healthyHerbivores >= stableFloor
    && herbivoreCount < herbivoreLimits.max;
  control.stableSec = stable ? Number((control.stableSec + dt).toFixed(2)) : 0;

  if (
    lowPressure
    && herbivoreCount < Number(tuning.herbivoreLowWatermark ?? 2)
    && control.herbivoreLowSec >= Number(tuning.herbivoreRecoveryDelaySec ?? 45)
    && nowSec >= Number(control.nextRecoveryAtSec ?? -Infinity)
  ) {
    const capacity = Math.max(0, herbivoreLimits.max - herbivoreCount);
    const spawned = spawnAnimals(
      state,
      zone,
      ANIMAL_KIND.HERBIVORE,
      Math.min(capacity, Number(tuning.herbivoreRecoverySpawnCount ?? 2)),
      runtime,
      "recoverySpawns",
      rng,
      tuning,
    );
    if (spawned > 0) {
      herbivoreCount += spawned;
      control.herbivoreLowSec = 0;
      control.extinctionSec = 0;
      control.nextRecoveryAtSec = nowSec + Number(tuning.herbivoreRecoveryCooldownSec ?? 75);
    }
  }

  if (
    lowPressure
    && control.stableSec >= Number(tuning.herbivoreBreedStableSec ?? 60)
    && herbivoreCount < herbivoreLimits.max
    && nowSec >= Number(control.nextBreedAtSec ?? -Infinity)
  ) {
    const spawned = spawnAnimals(
      state,
      zone,
      ANIMAL_KIND.HERBIVORE,
      Math.min(herbivoreLimits.max - herbivoreCount, Number(tuning.herbivoreBreedSpawnCount ?? 1)),
      runtime,
      "breedingSpawns",
      rng,
      tuning,
    );
    if (spawned > 0) {
      herbivoreCount += spawned;
      control.stableSec = 0;
      control.nextBreedAtSec = nowSec + Number(tuning.herbivoreBreedCooldownSec ?? 120);
    }
  }

  if (
    lowPressure
    && predatorCount <= 0
    && herbivoreCount >= Math.max(4, herbivoreLimits.target)
    && control.predatorAbsentSec >= Number(tuning.predatorRecoveryDelaySec ?? 90)
    && nowSec >= Number(control.nextPredatorRecoveryAtSec ?? -Infinity)
    && predatorCount < predatorLimits.max
  ) {
    const spawned = spawnAnimals(
      state,
      zone,
      ANIMAL_KIND.PREDATOR,
      Math.min(predatorLimits.max - predators.length, Number(tuning.predatorRecoverySpawnCount ?? 1)),
      runtime,
      "predatorRecoverySpawns",
      rng,
      tuning,
    );
    if (spawned > 0) {
      predatorCount += spawned;
      control.predatorAbsentSec = 0;
      control.nextPredatorRecoveryAtSec = nowSec + Number(tuning.predatorRecoveryCooldownSec ?? 120);
    }
  }

  if (
    predatorCount > 0
    && herbivoreCount <= Number(tuning.predatorRetreatPreyFloor ?? 0)
    && control.predatorPressureSec >= Number(tuning.predatorRetreatDelaySec ?? 18)
  ) {
    const retreatTarget = predators
      .filter((animal) => animal?.alive !== false)
      .sort((a, b) => Number(a.hunger ?? 0) - Number(b.hunger ?? 0))[0] ?? null;
    if (retreatTarget) {
      state.animals = state.animals.filter((animal) => animal.id !== retreatTarget.id);
      runtime.audit.predatorRetreats = Number(runtime.audit.predatorRetreats ?? 0) + 1;
      predatorCount = Math.max(0, predatorCount - 1);
      control.predatorAbsentSec = predatorCount <= 0 ? 0 : Number(control.predatorAbsentSec ?? 0);
      control.predatorPressureSec = 0;
    }
  }

  return {
    id: String(zone.id ?? ""),
    label: String(zone.label ?? ""),
    herbivoreCount,
    predatorCount,
    herbivoreCapacity: herbivoreLimits,
    predatorCapacity: predatorLimits,
    recoveryCooldownSec: Math.max(0, Number(control.nextRecoveryAtSec ?? -Infinity) - nowSec),
    breedingCooldownSec: Math.max(0, Number(control.nextBreedAtSec ?? -Infinity) - nowSec),
    predatorRecoveryCooldownSec: Math.max(0, Number(control.nextPredatorRecoveryAtSec ?? -Infinity) - nowSec),
    herbivoreLowSec: Number(control.herbivoreLowSec ?? 0),
    predatorAbsentSec: Number(control.predatorAbsentSec ?? 0),
    stableSec: Number(control.stableSec ?? 0),
    extinctionSec: Number(control.extinctionSec ?? 0),
    crowdScore,
  };
}

export class WildlifePopulationSystem {
  constructor() {
    this.name = "WildlifePopulationSystem";
  }

  update(dt, state, services) {
    const scenario = getScenario(state);
    if ((scenario.wildlifeZones ?? []).length <= 0) return;
    const runtime = ensureWildlifeRuntime(state);
    const ecology = state.metrics.ecology ?? {};
    const tuning = getLongRunWildlifeTuning(state);
    // Seeded RNG is authoritative (determinism contract). Fall back to
     // Math.random only when services is absent (legacy GameApp boot path
     // before createServices is wired).
    const rng = typeof services?.rng?.next === "function"
      ? () => services.rng.next()
      : Math.random;
    const zoneBuckets = buildZoneBuckets(state);
    const zoneStats = Object.values(zoneBuckets).map((bucket) => updateZonePopulation(state, runtime, bucket, tuning, rng, dt));
    const clusters = updateClusterMetrics(state, runtime, tuning);

    consumeAnimalDeathMetrics(state, runtime);
    ecology.zoneStats = zoneStats;
    ecology.events = {
      births: Number(runtime.audit.births ?? 0),
      breedingSpawns: Number(runtime.audit.breedingSpawns ?? 0),
      recoverySpawns: Number(runtime.audit.recoverySpawns ?? 0),
      predatorRecoverySpawns: Number(runtime.audit.predatorRecoverySpawns ?? 0),
      predatorRetreats: Number(runtime.audit.predatorRetreats ?? 0),
      predationDeaths: Number(runtime.audit.predationDeaths ?? 0),
      starvationDeaths: Number(runtime.audit.starvationDeaths ?? 0),
    };
    ecology.clusters = clusters;
    const totalPredators = (state.animals ?? []).filter((animal) => animal.alive !== false && animal.kind === ANIMAL_KIND.PREDATOR).length;
    const totalHerbivores = (state.animals ?? []).filter((animal) => animal.alive !== false && animal.kind === ANIMAL_KIND.HERBIVORE).length;
    // v0.8.2 Round-6 Wave-2 (01d-mechanics-content Step 8) — expose per-species
    // predator counts so HUD/Inspector can show wolf/bear/raider_beast splits
    // without each panel re-walking state.animals.
    const predatorsBySpecies = { wolf: 0, bear: 0, raider_beast: 0 };
    for (const animal of state.animals ?? []) {
      if (!animal || animal.alive === false) continue;
      if (animal.kind !== ANIMAL_KIND.PREDATOR) continue;
      const species = String(animal.species ?? "wolf");
      if (predatorsBySpecies[species] === undefined) {
        predatorsBySpecies[species] = 0;
      }
      predatorsBySpecies[species] += 1;
    }
    ecology.predatorsBySpecies = predatorsBySpecies;
    ecology.flags = {
      extinctionRisk: zoneStats.some((entry) => entry.herbivoreCount < Number(entry.herbivoreCapacity?.min ?? 0)),
      overgrowthRisk: zoneStats.some((entry) => entry.herbivoreCount > Number(entry.herbivoreCapacity?.max ?? Infinity) || entry.predatorCount > Number(entry.predatorCapacity?.max ?? Infinity)),
      clumpingRisk: Object.values(clusters.byGroup ?? {}).some((entry) => Number(entry?.ratio ?? 0) >= Number(tuning.clusterRatioThreshold ?? 0.7)),
      predatorWithoutPrey: totalPredators > 0 && totalHerbivores <= 0,
    };
    state.metrics.ecology = ecology;
  }
}
