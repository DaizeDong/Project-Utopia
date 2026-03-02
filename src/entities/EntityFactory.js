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
    blackboard: {},
    policy: null,
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
  return {
    ...baseAgent(id, ENTITY_TYPE.WORKER, x, z, withLabel(id, "Worker"), random),
    role: ROLE.FARM,
    groupId: GROUP_IDS.WORKERS,
  };
}

export function createVisitor(x, z, kind = VISITOR_KIND.SABOTEUR, random = Math.random) {
  const id = nextId("visitor");
  return {
    ...baseAgent(id, ENTITY_TYPE.VISITOR, x, z, withLabel(id, kind === VISITOR_KIND.TRADER ? "Trader" : "Saboteur"), random),
    kind,
    groupId: GROUP_IDS.VISITORS,
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
    stateLabel: "Wander",
    targetTile: null,
    path: null,
    pathIndex: 0,
    pathGridVersion: -1,
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
    world: {
      mapTemplateId: grid.templateId,
      mapTemplateName: templateMeta.name,
      mapSeed: grid.seed,
      terrainTuning: grid.terrainTuning,
    },
    resources: {
      food: INITIAL_RESOURCES.food,
      wood: INITIAL_RESOURCES.wood,
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
      regressionFlags: [],
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
      objectives: [
        {
          id: "stockpile-1",
          title: "Secure Stockpile",
          description: "Reach 120 food and 120 wood.",
          completed: false,
          progress: 0,
          reward: "+30 food, +30 wood",
        },
        {
          id: "infrastructure-1",
          title: "Build Logistics Core",
          description: "Build 2 warehouses, 8 farms, 8 lumbers and 120 roads.",
          completed: false,
          progress: 0,
          reward: "Spawn +6 workers",
        },
        {
          id: "stability-1",
          title: "Stabilize Colony",
          description: "Hold prosperity >= 62 and threat <= 48 for 40 seconds.",
          completed: false,
          progress: 0,
          reward: "Permanent doctrine bonus +8%",
        },
      ],
      objectiveHoldSec: 0,
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
        visitors: agents.filter((a) => a.type === ENTITY_TYPE.VISITOR).length,
        herbivores: animals.filter((a) => a.kind === ANIMAL_KIND.HERBIVORE).length,
        predators: animals.filter((a) => a.kind === ANIMAL_KIND.PREDATOR).length,
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
