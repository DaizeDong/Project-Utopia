import { ENTITY_TYPE, ROLE, VISITOR_KIND, ANIMAL_KIND, TILE } from "../config/constants.js";
import { INITIAL_POPULATION, INITIAL_RESOURCES } from "../config/balance.js";
import { GROUP_IDS } from "../config/aiConfig.js";
import { nextId } from "../app/id.js";
import {
  createInitialGrid,
  randomTileOfTypes,
  tileToWorld,
  rebuildBuildingStats,
  countTilesByType,
  DEFAULT_MAP_TEMPLATE_ID,
  describeMapTemplate,
} from "../world/grid/Grid.js";

const ALPHA_START_RESOURCES = Object.freeze({
  food: Math.min(INITIAL_RESOURCES.food, 42),
  wood: Math.min(INITIAL_RESOURCES.wood, 32),
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
    carry: { food: 0, wood: 0 },
    stateLabel: "Idle",
    cooldown: 0,
    sabotageCooldown: 8 + random() * 6,
    targetTile: null,
    path: null,
    pathIndex: 0,
    pathGridVersion: -1,
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

export function createWorker(x, z, random = Math.random) {
  const id = nextId("worker");
  const hungerSeekThreshold = 0.12 + random() * 0.08;
  const eatRecoveryTarget = 0.62 + random() * 0.12;
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
  };
  // Stagger worker hunger so they do not synchronize into warehouse meal waves.
  worker.hunger = Math.max(eatRecoveryTarget + 0.05, 0.8) + random() * 0.15;
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
    blackboard: {
      lastFeasibilityReject: null,
    },
    policy: null,
    memory: { recentEvents: [] },
    debug: {
      lastIntent: "",
      lastPathLength: 0,
      lastPathRecalcSec: 0,
    },
    groupId: kind === ANIMAL_KIND.PREDATOR ? GROUP_IDS.PREDATORS : GROUP_IDS.HERBIVORES,
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function toIndex(ix, iz, width) {
  return ix + iz * width;
}

function setTileDirect(grid, ix, iz, tileType) {
  if (ix < 0 || iz < 0 || ix >= grid.width || iz >= grid.height) return false;
  grid.tiles[toIndex(ix, iz, grid.width)] = tileType;
  return true;
}

function tileAt(grid, ix, iz) {
  if (ix < 0 || iz < 0 || ix >= grid.width || iz >= grid.height) return TILE.WATER;
  return grid.tiles[toIndex(ix, iz, grid.width)];
}

function isPassableBaseTile(tileType) {
  return tileType !== TILE.WATER;
}

function findNearestScenarioAnchor(grid, startIx, startIz, maxRadius = 24) {
  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (let iz = startIz - radius; iz <= startIz + radius; iz += 1) {
      for (let ix = startIx - radius; ix <= startIx + radius; ix += 1) {
        if (ix < 0 || iz < 0 || ix >= grid.width || iz >= grid.height) continue;
        if (Math.max(Math.abs(ix - startIx), Math.abs(iz - startIz)) !== radius) continue;
        if (isPassableBaseTile(tileAt(grid, ix, iz))) return { ix, iz };
      }
    }
  }
  return {
    ix: clamp(startIx, 0, grid.width - 1),
    iz: clamp(startIz, 0, grid.height - 1),
  };
}

function clearInfrastructure(grid) {
  for (let i = 0; i < grid.tiles.length; i += 1) {
    const tile = grid.tiles[i];
    if (
      tile === TILE.ROAD ||
      tile === TILE.FARM ||
      tile === TILE.LUMBER ||
      tile === TILE.WAREHOUSE ||
      tile === TILE.WALL ||
      tile === TILE.RUINS
    ) {
      grid.tiles[i] = TILE.GRASS;
    }
  }
}

function clearFootprint(grid, center, radiusX, radiusZ) {
  for (let iz = center.iz - radiusZ; iz <= center.iz + radiusZ; iz += 1) {
    for (let ix = center.ix - radiusX; ix <= center.ix + radiusX; ix += 1) {
      if (ix < 0 || iz < 0 || ix >= grid.width || iz >= grid.height) continue;
      grid.tiles[toIndex(ix, iz, grid.width)] = TILE.GRASS;
    }
  }
}

function stampRoad(grid, x0, z0, x1, z1) {
  let ix = x0;
  let iz = z0;
  setTileDirect(grid, ix, iz, TILE.ROAD);
  while (ix !== x1) {
    ix += ix < x1 ? 1 : -1;
    setTileDirect(grid, ix, iz, TILE.ROAD);
  }
  while (iz !== z1) {
    iz += iz < z1 ? 1 : -1;
    setTileDirect(grid, ix, iz, TILE.ROAD);
  }
}

function stampCluster(grid, center, offsets, tileType) {
  for (const offset of offsets) {
    setTileDirect(grid, center.ix + offset.x, center.iz + offset.z, tileType);
  }
}

function applyAlphaScenarioLayout(grid) {
  clearInfrastructure(grid);

  const center = findNearestScenarioAnchor(grid, Math.floor(grid.width / 2), Math.floor(grid.height / 2));
  const eastOutpost = {
    ix: clamp(center.ix + 9, 3, grid.width - 4),
    iz: clamp(center.iz + 3, 3, grid.height - 4),
  };
  const westOutpost = {
    ix: clamp(center.ix - 9, 3, grid.width - 4),
    iz: clamp(center.iz - 3, 3, grid.height - 4),
  };

  clearFootprint(grid, center, 8, 6);
  clearFootprint(grid, eastOutpost, 5, 4);
  clearFootprint(grid, westOutpost, 5, 4);

  stampRoad(grid, center.ix - 2, center.iz, center.ix + 2, center.iz);
  stampRoad(grid, center.ix, center.iz - 1, center.ix, center.iz + 2);
  stampRoad(grid, center.ix - 4, center.iz - 1, center.ix - 2, center.iz);
  stampRoad(grid, center.ix + 2, center.iz + 1, center.ix + 4, center.iz + 1);
  stampRoad(grid, westOutpost.ix, westOutpost.iz, westOutpost.ix + 2, westOutpost.iz);
  setTileDirect(grid, center.ix, center.iz, TILE.WAREHOUSE);

  stampCluster(grid, center, [{ x: 1, z: 2 }, { x: 2, z: 2 }], TILE.FARM);
  stampCluster(grid, westOutpost, [{ x: 0, z: 0 }], TILE.LUMBER);

  setTileDirect(grid, westOutpost.ix + 3, westOutpost.iz, TILE.RUINS);
  setTileDirect(grid, eastOutpost.ix + 1, eastOutpost.iz, TILE.RUINS);
  setTileDirect(grid, eastOutpost.ix + 2, eastOutpost.iz, TILE.RUINS);

  stampCluster(grid, eastOutpost, [{ x: 0, z: -1 }, { x: 0, z: 1 }, { x: 1, z: -1 }], TILE.WALL);

  // Invalidate tile-type caches derived from the generated terrain layout.
  grid.version = Number(grid.version ?? 0) + 1;

  return {
    id: "alpha_broken_frontier",
    anchors: {
      coreWarehouse: { ix: center.ix, iz: center.iz },
      westLumberOutpost: { ix: westOutpost.ix, iz: westOutpost.iz },
      eastDepot: { ix: eastOutpost.ix, iz: eastOutpost.iz },
    },
    routeGaps: [
      { ix: center.ix - 5, iz: center.iz - 1 },
      { ix: center.ix - 6, iz: center.iz - 1 },
      { ix: westOutpost.ix + 3, iz: westOutpost.iz },
      { ix: westOutpost.ix + 4, iz: westOutpost.iz },
    ],
  };
}

export function createInitialEntities(grid) {
  return createInitialEntitiesWithRandom(grid, Math.random);
}

function createInitialEntitiesWithRandom(grid, random) {
  const agents = [];
  const animals = [];

  for (let i = 0; i < INITIAL_POPULATION.workers; i += 1) {
    const tile = randomTileOfTypes(grid, [TILE.ROAD, TILE.FARM, TILE.LUMBER, TILE.WAREHOUSE], random);
    const p = tileToWorld(tile.ix, tile.iz, grid);
    agents.push(createWorker(p.x, p.z, random));
  }

  for (let i = 0; i < INITIAL_POPULATION.visitors; i += 1) {
    const tile = randomTileOfTypes(grid, [TILE.ROAD, TILE.GRASS], random);
    const p = tileToWorld(tile.ix, tile.iz, grid);
    const kind = i % 5 === 0 ? VISITOR_KIND.TRADER : VISITOR_KIND.SABOTEUR;
    agents.push(createVisitor(p.x, p.z, kind, random));
  }

  for (let i = 0; i < INITIAL_POPULATION.herbivores; i += 1) {
    const tile = randomTileOfTypes(grid, [TILE.GRASS, TILE.FARM], random);
    const p = tileToWorld(tile.ix, tile.iz, grid);
    animals.push(createAnimal(p.x, p.z, ANIMAL_KIND.HERBIVORE, random));
  }

  for (let i = 0; i < INITIAL_POPULATION.predators; i += 1) {
    const tile = randomTileOfTypes(grid, [TILE.GRASS, TILE.LUMBER, TILE.RUINS], random);
    const p = tileToWorld(tile.ix, tile.iz, grid);
    animals.push(createAnimal(p.x, p.z, ANIMAL_KIND.PREDATOR, random));
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
  const grid = createInitialGrid({ templateId, seed, terrainTuning });
  const alphaScenario = applyAlphaScenarioLayout(grid);
  const templateMeta = describeMapTemplate(grid.templateId);
  const random = createDeterministicRandom(grid.seed);
  const { agents, animals } = createInitialEntitiesWithRandom(grid, random);
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
      timeLeftSec: 999,
      moveCostMultiplier: 1,
      farmProductionMultiplier: 1,
      lumberProductionMultiplier: 1,
      source: "default",
      hazardTiles: [],
      hazardTileSet: new Set(),
      hazardPenaltyMultiplier: 1,
      hazardLabel: "clear",
    },
    metrics: {
      timeSec: 0,
      tick: 0,
      frameMs: 0,
      frameCount: 0,
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
    },
    ai: {
      enabled: false,
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
      modifiers: {
        farmYield: 1,
        lumberYield: 1,
        tradeYield: 1,
        sabotageResistance: 1,
        threatDamp: 1,
      },
      prosperity: 35,
      threat: 25,
      objectiveIndex: 0,
      scenario: alphaScenario,
      objectives: [
        {
          id: "logistics-1",
          title: "Reconnect the Frontier",
          description: "Reconnect the west lumber outpost, reclaim the east depot with a warehouse, then reach 4 farms, 3 lumbers, and 20 roads.",
          completed: false,
          progress: 0,
          reward: "+18 food, +18 wood",
        },
        {
          id: "stockpile-1",
          title: "Refill the Stockpile",
          description: "Reach 95 food and 90 wood after the network is expanded.",
          completed: false,
          progress: 0,
          reward: "Spawn +4 workers",
        },
        {
          id: "stability-1",
          title: "Fortify and Stabilize",
          description: "Build 12 walls, then hold prosperity >= 58 and threat <= 44 for 30 seconds.",
          completed: false,
          progress: 0,
          reward: "Permanent doctrine bonus +8%",
        },
      ],
      objectiveHoldSec: 0,
      objectiveHint: "Reconnect the west lumber route and reclaim the east depot before scaling up.",
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
