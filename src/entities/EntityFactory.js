import { ENTITY_TYPE, ROLE, VISITOR_KIND, ANIMAL_KIND, TILE } from "../config/constants.js";
import { BALANCE, INITIAL_POPULATION, INITIAL_RESOURCES } from "../config/balance.js";
import { GROUP_IDS } from "../config/aiConfig.js";
import { nextId } from "../app/id.js";
import { createDefaultAiRuntimeStats } from "../app/aiRuntimeStats.js";
import {
  createInitialGrid,
  randomTileOfTypes,
  tileToWorld,
  rebuildBuildingStats,
  countTilesByType,
  DEFAULT_MAP_TEMPLATE_ID,
  describeMapTemplate,
} from "../world/grid/Grid.js";
import { buildScenarioBundle } from "../world/scenarios/ScenarioFactory.js";

const ALPHA_START_RESOURCES = Object.freeze({
  food: INITIAL_RESOURCES.food,
  wood: INITIAL_RESOURCES.wood,
  stone: INITIAL_RESOURCES.stone ?? 0,
});

function createDeterministicRandom(seed) {
  let s = Number(seed) >>> 0;
  if (!s) s = 0x9e3779b9;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function withLabel(id, fallback) {
  const seq = id.includes("_") ? id.split("_")[1] : "?";
  return `${fallback}-${seq}`;
}

function baseAgent(id, type, x, z, displayName, random = Math.random) {
  return {
    id,
    displayName,
    type,
    x,
    z,
    vx: (random() - 0.5) * 0.3,
    vz: (random() - 0.5) * 0.3,
    desiredVel: { x: 0, z: 0 },
    hunger: 1,
    stamina: 1,
    carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
    stateLabel: "Idle",
    cooldown: 0,
    sabotageCooldown: 25 + random() * 15,
    targetTile: null,
    path: null,
    pathIndex: 0,
    pathGridVersion: -1,
    pathTrafficVersion: 0,
    blackboard: {
      taskLock: { state: "", untilSec: -Infinity },
      emergencyRationCooldownSec: -Infinity,
      lastFeasibilityReject: null,
    },
    policy: null,
    alive: true,
    hp: 100,
    maxHp: 100,
    deathReason: "",
    deathSec: -1,
    starvationSec: 0,
    attackCooldownSec: 0,
    memory: { recentEvents: [], dangerTiles: [] },
    debug: {
      lastIntent: "",
      lastPathLength: 0,
      lastPathRecalcSec: 0,
    },
  };
}

// Available trait pool — each worker gets 1-2 random traits
const TRAIT_POOL = ["hardy", "swift", "careful", "efficient", "social", "resilient"];

function pickTraits(random) {
  const count = random() < 0.4 ? 1 : 2;
  const pool = [...TRAIT_POOL];
  const picked = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function generateSkills(random) {
  return {
    farming: 0.3 + random() * 0.7,
    woodcutting: 0.3 + random() * 0.7,
    mining: 0.3 + random() * 0.7,
    cooking: 0.3 + random() * 0.7,
    crafting: 0.3 + random() * 0.7,
  };
}

export function createWorker(x, z, random = Math.random) {
  const id = nextId("worker");
  const hungerSeekThreshold = 0.12 + random() * 0.08;
  const eatRecoveryTarget = 0.62 + random() * 0.12;
  const traits = pickTraits(random);
  const skills = generateSkills(random);
  const worker = {
    ...baseAgent(id, ENTITY_TYPE.WORKER, x, z, withLabel(id, "Worker"), random),
    role: ROLE.FARM,
    groupId: GROUP_IDS.WORKERS,
    metabolism: {
      hungerSeekThreshold,
      eatRecoveryTarget,
      hungerDecayMultiplier: 0.88 + random() * 0.24,
      eatRecoveryPerFoodMultiplier: 0.9 + random() * 0.2,
    },
    // Needs system
    rest: 0.7 + random() * 0.3,      // 0 = exhausted, 1 = fully rested
    morale: 0.6 + random() * 0.4,    // 0 = miserable, 1 = happy
    social: 0.5 + random() * 0.5,    // 0 = lonely, 1 = socially fulfilled
    mood: 0.7,                        // composite mood indicator (updated each tick)
    // Individual identity
    traits,
    skills,
    preferences: {
      speedMultiplier: traits.includes("swift") ? 1.15 : (traits.includes("careful") ? 0.9 : 1.0),
      workDurationMultiplier: traits.includes("efficient") ? 0.8 : (traits.includes("careful") ? 1.2 : 1.0),
    },
    relationships: {},                // { otherWorkerId: opinion (-1 to 1) }
    // Work progress tracking
    progress: 0,                      // 0-1 progress toward current action completion
    workRemaining: 0,                 // seconds remaining on current work action
  };
  // Stagger worker hunger so eating behavior appears within 120s scenarios.
  worker.hunger = 0.4 + random() * 0.55;
  worker.hunger = Math.min(1, worker.hunger);
  return worker;
}

export function createVisitor(x, z, kind = VISITOR_KIND.SABOTEUR, random = Math.random) {
  const id = nextId("visitor");
  const groupId = kind === VISITOR_KIND.TRADER ? GROUP_IDS.TRADERS : GROUP_IDS.SABOTEURS;
  return {
    ...baseAgent(id, ENTITY_TYPE.VISITOR, x, z, withLabel(id, kind === VISITOR_KIND.TRADER ? "Trader" : "Saboteur"), random),
    kind,
    groupId,
  };
}

export function createAnimal(x, z, kind = ANIMAL_KIND.HERBIVORE, random = Math.random) {
  const id = nextId("animal");
  return {
    id,
    displayName: withLabel(id, kind === ANIMAL_KIND.PREDATOR ? "Predator" : "Herbivore"),
    type: ENTITY_TYPE.ANIMAL,
    kind,
    x,
    z,
    vx: (random() - 0.5) * 0.25,
    vz: (random() - 0.5) * 0.25,
    desiredVel: { x: 0, z: 0 },
    hunger: 1,
    hp: kind === ANIMAL_KIND.PREDATOR ? 90 : 70,
    maxHp: kind === ANIMAL_KIND.PREDATOR ? 90 : 70,
    alive: true,
    deathReason: "",
    deathSec: -1,
    starvationSec: 0,
    attackCooldownSec: 0,
    stateLabel: "Wander",
    targetTile: null,
    path: null,
    pathIndex: 0,
    pathGridVersion: -1,
    pathTrafficVersion: 0,
    blackboard: {
      lastFeasibilityReject: null,
    },
    policy: null,
    memory: {
      recentEvents: [],
      migrationTarget: null,
      migrationLabel: "",
      homeTile: null,
      territoryAnchor: null,
      territoryRadius: 0,
      homeZoneId: "",
      homeZoneLabel: "",
    },
    debug: {
      lastIntent: "",
      lastPathLength: 0,
      lastPathRecalcSec: 0,
    },
    groupId: kind === ANIMAL_KIND.PREDATOR ? GROUP_IDS.PREDATORS : GROUP_IDS.HERBIVORES,
  };
}

export function createInitialEntities(grid) {
  return createInitialEntitiesWithRandom(grid, Math.random);
}

function randomTileNearAnchorOfTypes(grid, anchor, radius, targetTypes, random) {
  if (!anchor) return null;
  const candidates = [];
  for (let iz = anchor.iz - radius; iz <= anchor.iz + radius; iz += 1) {
    for (let ix = anchor.ix - radius; ix <= anchor.ix + radius; ix += 1) {
      if (ix < 0 || iz < 0 || ix >= grid.width || iz >= grid.height) continue;
      if (Math.abs(ix - anchor.ix) + Math.abs(iz - anchor.iz) > radius) continue;
      const tile = grid.tiles[ix + iz * grid.width];
      if (!targetTypes.includes(tile)) continue;
      candidates.push({ ix, iz });
    }
  }
  if (candidates.length <= 0) return null;
  return candidates[Math.floor(random() * candidates.length)];
}

function assignAnimalHabitat(animal, zone, anchor, spawnTile) {
  animal.memory.homeTile = spawnTile ? { ix: spawnTile.ix, iz: spawnTile.iz } : null;
  animal.memory.territoryAnchor = anchor ? { ix: anchor.ix, iz: anchor.iz } : null;
  animal.memory.territoryRadius = Number(zone?.radius ?? 0);
  animal.memory.homeZoneId = String(zone?.id ?? "");
  animal.memory.homeZoneLabel = String(zone?.label ?? "");
}

export function createDefaultEcologyMetrics() {
  return {
    activeGrazers: 0,
    pressuredFarms: 0,
    maxFarmPressure: 0,
    frontierPredators: 0,
    migrationHerds: 0,
    farmPressureByKey: {},
    hotspotFarms: [],
    herbivoresByZone: {},
    predatorsByZone: {},
    zoneStats: [],
    events: {
      births: 0,
      breedingSpawns: 0,
      recoverySpawns: 0,
      predatorRecoverySpawns: 0,
      predatorRetreats: 0,
      predationDeaths: 0,
      starvationDeaths: 0,
    },
    clusters: {
      maxSameSpeciesClusterSize: 0,
      stuckClusterCount: 0,
      longestClusterDurationSec: 0,
      byGroup: {},
    },
    flags: {
      extinctionRisk: false,
      overgrowthRisk: false,
      clumpingRisk: false,
      predatorWithoutPrey: false,
    },
    summary: "Ecology: idle",
  };
}

export function createDefaultWildlifeRuntime() {
  return {
    zoneControl: {},
    clusterState: {},
    audit: {
      herbivoreZeroSinceSec: null,
      predatorWithoutPreySinceSec: null,
      predatorRetreats: 0,
    },
  };
}

function createInitialEntitiesWithRandom(grid, random, scenario = null) {
  const agents = [];
  const animals = [];
  const wildlifeZones = Array.isArray(scenario?.wildlifeZones) ? scenario.wildlifeZones : [];
  const anchors = scenario?.anchors ?? {};
  const wildlifeRadiusBonus = Number(BALANCE.wildlifeSpawnRadiusBonus ?? 3);

  for (let i = 0; i < INITIAL_POPULATION.workers; i += 1) {
    const tile = randomTileOfTypes(grid, [TILE.ROAD, TILE.FARM, TILE.LUMBER, TILE.WAREHOUSE], random);
    const p = tileToWorld(tile.ix, tile.iz, grid);
    agents.push(createWorker(p.x, p.z, random));
  }

  for (let i = 0; i < INITIAL_POPULATION.visitors; i += 1) {
    const tile = randomTileOfTypes(grid, [TILE.ROAD, TILE.GRASS], random);
    const p = tileToWorld(tile.ix, tile.iz, grid);
    const kind = i % 2 === 0 ? VISITOR_KIND.TRADER : VISITOR_KIND.SABOTEUR;
    agents.push(createVisitor(p.x, p.z, kind, random));
  }

  for (let i = 0; i < INITIAL_POPULATION.herbivores; i += 1) {
    const zone = wildlifeZones.length > 0 ? wildlifeZones[i % wildlifeZones.length] : null;
    const anchor = zone ? anchors[zone.anchor] : null;
    const tile = randomTileNearAnchorOfTypes(
      grid,
      anchor,
      Math.max(2, Number(zone?.radius ?? 2) + wildlifeRadiusBonus),
      [TILE.GRASS, TILE.FARM],
      random,
    ) ?? randomTileOfTypes(grid, [TILE.GRASS, TILE.FARM], random);
    const p = tileToWorld(tile.ix, tile.iz, grid);
    const animal = createAnimal(p.x, p.z, ANIMAL_KIND.HERBIVORE, random);
    assignAnimalHabitat(animal, zone, anchor, tile);
    animals.push(animal);
  }

  for (let i = 0; i < INITIAL_POPULATION.predators; i += 1) {
    const zone = wildlifeZones.length > 0 ? wildlifeZones[i % wildlifeZones.length] : null;
    const anchor = zone ? anchors[zone.anchor] : null;
    const tile = randomTileNearAnchorOfTypes(
      grid,
      anchor,
      Math.max(2, Number(zone?.radius ?? 2) + wildlifeRadiusBonus),
      [TILE.GRASS, TILE.LUMBER, TILE.RUINS, TILE.FARM],
      random,
    ) ?? randomTileOfTypes(grid, [TILE.GRASS, TILE.LUMBER, TILE.RUINS], random);
    const p = tileToWorld(tile.ix, tile.iz, grid);
    const animal = createAnimal(p.x, p.z, ANIMAL_KIND.PREDATOR, random);
    assignAnimalHabitat(animal, zone, anchor, tile);
    animals.push(animal);
  }

  return { agents, animals };
}

/**
 * @returns {import("../app/types.js").GameState}
 */
export function createInitialGameState(options = {}) {
  const templateId = options.templateId ?? DEFAULT_MAP_TEMPLATE_ID;
  const seed = options.seed ?? 1337;
  const terrainTuning = options.terrainTuning ?? {};
  const grid = createInitialGrid({ templateId, seed, terrainTuning, width: options.width, height: options.height });
  const scenarioBundle = buildScenarioBundle(grid);
  const templateMeta = describeMapTemplate(grid.templateId);
  const random = createDeterministicRandom(grid.seed);
  const { agents, animals } = createInitialEntitiesWithRandom(grid, random, scenarioBundle.scenario);
  const roads = countTilesByType(grid, [TILE.ROAD]);
  const farms = countTilesByType(grid, [TILE.FARM]);
  const lumbers = countTilesByType(grid, [TILE.LUMBER]);
  const warehouses = countTilesByType(grid, [TILE.WAREHOUSE]);
  const walls = countTilesByType(grid, [TILE.WALL]);
  const water = countTilesByType(grid, [TILE.WATER]);
  const grass = countTilesByType(grid, [TILE.GRASS]);
  const ruins = countTilesByType(grid, [TILE.RUINS]);
  const passable = roads + farms + lumbers + warehouses + grass + ruins;

  return {
    grid,
    session: {
      phase: "menu",
      outcome: "none",
      reason: "",
      endedAtSec: -1,
    },
    world: {
      mapTemplateId: grid.templateId,
      mapTemplateName: templateMeta.name,
      mapSeed: grid.seed,
      terrainTuning: grid.terrainTuning,
    },
    resources: {
      food: ALPHA_START_RESOURCES.food,
      wood: ALPHA_START_RESOURCES.wood,
      stone: ALPHA_START_RESOURCES.stone,
      herbs: 0,
      meals: 0,
      medicine: 0,
      tools: 0,
    },
    agents,
    animals,
    buildings: rebuildBuildingStats(grid),
    events: {
      queue: [],
      active: [],
    },
    weather: {
      current: "clear",
      timeLeftSec: 30,
      moveCostMultiplier: 1,
      farmProductionMultiplier: 1,
      lumberProductionMultiplier: 1,
      source: "default",
      hazardTiles: [],
      hazardTileSet: new Set(),
      hazardPenaltyMultiplier: 1,
      hazardPenaltyByKey: {},
      hazardLabelByKey: {},
      hazardFronts: [],
      hazardFocusSummary: "",
      pressureScore: 0,
      hazardLabel: "clear",
    },
    metrics: {
      timeSec: 0,
      tick: 0,
      frameMs: 0,
      frameCount: 0,
      renderFrameCount: 0,
      averageFps: 60,
      benchmarkStatus: "idle",
      benchmarkCsvReady: false,
      simDt: 0,
      simStepsThisFrame: 0,
      simCostMs: 0,
      isDebugStepping: false,
      warnings: [],
      warningLog: [],
      memoryMb: 0,
      cpuBudgetMs: 0,
      uiCpuMs: 0,
      renderCpuMs: 0,
      aiLatencyMs: 0,
      proxyHealth: "unknown",
      proxyHasApiKey: false,
      proxyModel: "",
      proxyLastCheckSec: -999,
      aiRuntime: createDefaultAiRuntimeStats(),
      regressionFlags: [],
      deathsTotal: 0,
      deathsByReason: {
        starvation: 0,
        predation: 0,
        event: 0,
      },
      deathsByGroup: {},
      invalidTransitionCount: 0,
      idleWithoutReasonSec: {},
      pathRecalcPerEntityPerMin: 0,
      goalFlipCount: 0,
      avgGoalFlipPerEntity: 0,
      deliverWithoutCarryCount: 0,
      feasibilityRejectCountByGroup: {},
      starvationRiskCount: 0,
      deathByReasonAndReachability: {},
      ecologyPendingDeaths: {
        predation: 0,
        starvation: 0,
        event: 0,
      },
      logistics: {
        carryingWorkers: 0,
        totalCarryInTransit: 0,
        avgDepotDistance: 0,
        strandedCarryWorkers: 0,
        overloadedWarehouses: 0,
        busiestWarehouseLoad: 0,
        stretchedWorksites: 0,
        isolatedWorksites: 0,
        warehouseLoadByKey: {},
        summary: "Logistics: idle",
      },
      ecology: createDefaultEcologyMetrics(),
      spatialPressure: {
        weatherPressure: 0,
        eventPressure: 0,
        contestedZones: 0,
        contestedTiles: 0,
        activeEventCount: 0,
        peakEventSeverity: 0,
        summary: "Spatial pressure: idle",
      },
    },
    ai: {
      enabled: false,
      coverageTarget: "fallback",
      runtimeProfile: "default",
      manualModeLocked: false,
      mode: "fallback",
      lastError: "",
      lastEnvironmentError: "",
      lastPolicyError: "",
      lastEnvironmentDecisionSec: -999,
      lastPolicyDecisionSec: -999,
      lastEnvironmentResultSec: -999,
      lastPolicyResultSec: -999,
      lastEnvironmentSource: "none",
      lastPolicySource: "none",
      environmentDecisionCount: 0,
      policyDecisionCount: 0,
      environmentLlmCount: 0,
      policyLlmCount: 0,
      groupPolicies: new Map(),
      lastEnvironmentDirective: null,
      lastPolicyBatch: [],
      lastEnvironmentModel: "",
      lastPolicyModel: "",
      lastEnvironmentExchange: null,
      lastPolicyExchange: null,
      lastPolicyExchangeByGroup: {},
      policyExchanges: [],
      environmentExchanges: [],
      groupStateTargets: new Map(),
      lastStateTargetBatch: [],
    },
    debug: {
      selectedTile: null,
      systemTimingsMs: {},
      astar: {
        requests: 0,
        cacheHits: 0,
        cacheMisses: 0,
        success: 0,
        fail: 0,
        avgDurationMs: 0,
        avgPathLength: 0,
        lastDurationMs: 0,
        lastPathLength: 0,
        lastFrom: null,
        lastTo: null,
      },
      boids: {
        entities: 0,
        avgNeighbors: 0,
        avgSpeed: 0,
        maxSpeed: 0,
        congestionHotspots: 0,
        peakTileLoad: 0,
        peakPenalty: 1,
        trafficVersion: 0,
      },
      traffic: {
        version: 0,
        activeLaneCount: 0,
        hotspotCount: 0,
        peakLoad: 0,
        avgLoad: 0,
        peakPenalty: 1,
        loadByKey: {},
        penaltyByKey: {},
        hotspotTiles: [],
        summary: "Traffic: unavailable",
      },
      renderMode: "detailed",
      renderEntityCount: agents.length + animals.length,
      renderModelDisableThreshold: 260,
      renderPixelRatio: Math.min(1.4, (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1),
      visualAssetPack: "unloaded",
      tileTexturesLoaded: false,
      iconAtlasLoaded: false,
      unitSpriteLoaded: false,
      rng: { initialSeed: 0, state: 0, calls: 0 },
      aiTrace: [],
      eventTrace: [],
      presetComparison: [],
      roadCount: roads,
      gridStats: {
        roads,
        farms,
        lumbers,
        warehouses,
        walls,
        water,
        grass,
        ruins,
        emptyBaseTiles: grid.emptyBaseTiles ?? 0,
        passableRatio: passable / grid.tiles.length,
      },
      logic: {
        invalidTransitions: 0,
        goalFlipCount: 0,
        totalPathRecalcs: 0,
        idleWithoutReasonSecByGroup: {},
        pathRecalcByEntity: {},
        lastGoalsByEntity: {},
        deathByReasonAndReachability: {},
      },
    },
    gameplay: {
      doctrine: "balanced",
      doctrineMastery: 1,
      modifiers: {
        farmYield: 1,
        lumberYield: 1,
        tradeYield: 1,
        sabotageResistance: 1,
        threatDamp: 1,
        farmBias: 0,
        logisticsWarehouseScale: 1,
        logisticsFarmScale: 1,
        logisticsLumberScale: 1,
        logisticsRoadScale: 1,
        logisticsWallScale: 1,
        stockpileFoodScale: 1,
        stockpileWoodScale: 1,
        stockpileProsperityFloor: 36,
        stabilityWallScale: 1,
        stabilityHoldScale: 1,
        stabilityProsperityOffset: 0,
        stabilityThreatOffset: 0,
        recoveryFood: 12,
        recoveryWood: 10,
        recoveryThreatRelief: 8,
        recoveryProsperityBoost: 6,
      },
      prosperity: 35,
      threat: 25,
      objectiveIndex: 0,
      scenario: scenarioBundle.scenario,
      wildlifeRuntime: createDefaultWildlifeRuntime(),
      objectives: scenarioBundle.objectives,
      objectiveHoldSec: 0,
      recovery: {
        charges: 1,
        activeBoostSec: 0,
        lastTriggerSec: -Infinity,
        collapseRisk: 0,
        lastReason: "",
      },
      objectiveHint: scenarioBundle.objectiveHint,
      objectiveLog: [],
    },
    controls: {
      farmRatio: 0.5,
      selectedEntityId: null,
      selectedTile: null,
      tool: "road",
      stressExtraWorkers: 0,
      populationTargets: {
        workers: agents.filter((a) => a.type === ENTITY_TYPE.WORKER).length,
        traders: agents.filter((a) => a.type === ENTITY_TYPE.VISITOR && (a.kind === VISITOR_KIND.TRADER || a.groupId === GROUP_IDS.TRADERS)).length,
        saboteurs: agents.filter((a) => a.type === ENTITY_TYPE.VISITOR && !(a.kind === VISITOR_KIND.TRADER || a.groupId === GROUP_IDS.TRADERS)).length,
        herbivores: animals.filter((a) => a.kind === ANIMAL_KIND.HERBIVORE).length,
        predators: animals.filter((a) => a.kind === ANIMAL_KIND.PREDATOR).length,
        visitors: agents.filter((a) => a.type === ENTITY_TYPE.VISITOR).length,
      },
      populationBreakdown: {
        baseWorkers: agents.filter((a) => a.type === ENTITY_TYPE.WORKER).length,
        stressWorkers: 0,
        totalWorkers: agents.filter((a) => a.type === ENTITY_TYPE.WORKER).length,
        totalEntities: agents.length + animals.length,
      },
      saveSlotId: "default",
      canUndo: false,
      canRedo: false,
      buildPreview: null,
      showReplayPanel: false,
      showPresetComparator: false,
      undoStack: [],
      redoStack: [],
      isPaused: false,
      stepFramesPending: 0,
      timeScale: 1,
      fixedStepSec: 1 / 30,
      cameraMinZoom: 0.55,
      cameraMaxZoom: 3.2,
      renderModelDisableThreshold: 260,
      benchmarkConfig: {
        schedule: [0, 100, 200, 300, 400, 500],
        stageDurationSec: 4,
        sampleStartSec: 1.2,
      },
      visualPreset: "flat_worldsim",
      showTileIcons: true,
      showUnitSprites: true,
      mapTemplateId: grid.templateId,
      mapSeed: grid.seed,
      terrainTuning: { ...(grid.terrainTuning ?? {}) },
      doctrine: "balanced",
      actionMessage: "Ready",
      actionKind: "info",
    },
  };
}
