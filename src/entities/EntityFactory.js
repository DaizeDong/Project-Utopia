import { ENTITY_TYPE, ROLE, VISITOR_KIND, ANIMAL_KIND } from "../config/constants.js";
import { INITIAL_POPULATION, INITIAL_RESOURCES } from "../config/balance.js";
import { GROUP_IDS } from "../config/aiConfig.js";
import { nextId } from "../app/id.js";
import { createInitialGrid, randomPassableTile, tileToWorld, rebuildBuildingStats } from "../world/grid/Grid.js";

function baseAgent(id, type, x, z) {
  return {
    id,
    type,
    x,
    z,
    vx: (Math.random() - 0.5) * 0.3,
    vz: (Math.random() - 0.5) * 0.3,
    hunger: 1,
    stamina: 1,
    carry: { food: 0, wood: 0 },
    stateLabel: "Idle",
    cooldown: 0,
    sabotageCooldown: 8 + Math.random() * 6,
    targetTile: null,
    path: null,
    pathIndex: 0,
    pathGridVersion: -1,
    blackboard: {},
    policy: null,
    memory: { recentEvents: [], dangerTiles: [] },
  };
}

export function createWorker(x, z) {
  return {
    ...baseAgent(nextId("worker"), ENTITY_TYPE.WORKER, x, z),
    role: ROLE.FARM,
    groupId: GROUP_IDS.WORKERS,
  };
}

export function createVisitor(x, z, kind = VISITOR_KIND.SABOTEUR) {
  return {
    ...baseAgent(nextId("visitor"), ENTITY_TYPE.VISITOR, x, z),
    kind,
    groupId: GROUP_IDS.VISITORS,
  };
}

export function createAnimal(x, z, kind = ANIMAL_KIND.HERBIVORE) {
  return {
    id: nextId("animal"),
    type: ENTITY_TYPE.ANIMAL,
    kind,
    x,
    z,
    vx: (Math.random() - 0.5) * 0.25,
    vz: (Math.random() - 0.5) * 0.25,
    stateLabel: "Wander",
    targetTile: null,
    path: null,
    pathIndex: 0,
    pathGridVersion: -1,
    policy: null,
    memory: { recentEvents: [] },
    groupId: kind === ANIMAL_KIND.PREDATOR ? GROUP_IDS.PREDATORS : GROUP_IDS.HERBIVORES,
  };
}

export function createInitialEntities(grid) {
  const agents = [];
  const animals = [];

  for (let i = 0; i < INITIAL_POPULATION.workers; i += 1) {
    const tile = randomPassableTile(grid);
    const p = tileToWorld(tile.ix, tile.iz, grid);
    agents.push(createWorker(p.x, p.z));
  }

  for (let i = 0; i < INITIAL_POPULATION.visitors; i += 1) {
    const tile = randomPassableTile(grid);
    const p = tileToWorld(tile.ix, tile.iz, grid);
    const kind = i % 5 === 0 ? VISITOR_KIND.TRADER : VISITOR_KIND.SABOTEUR;
    agents.push(createVisitor(p.x, p.z, kind));
  }

  for (let i = 0; i < INITIAL_POPULATION.herbivores; i += 1) {
    const tile = randomPassableTile(grid);
    const p = tileToWorld(tile.ix, tile.iz, grid);
    animals.push(createAnimal(p.x, p.z, ANIMAL_KIND.HERBIVORE));
  }

  for (let i = 0; i < INITIAL_POPULATION.predators; i += 1) {
    const tile = randomPassableTile(grid);
    const p = tileToWorld(tile.ix, tile.iz, grid);
    animals.push(createAnimal(p.x, p.z, ANIMAL_KIND.PREDATOR));
  }

  return { agents, animals };
}

/**
 * @returns {import("../app/types.js").GameState}
 */
export function createInitialGameState() {
  const grid = createInitialGrid();
  const { agents, animals } = createInitialEntities(grid);

  return {
    grid,
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
      warnings: [],
    },
    ai: {
      enabled: false,
      mode: "fallback",
      lastError: "",
      lastEnvironmentDecisionSec: -999,
      lastPolicyDecisionSec: -999,
      groupPolicies: new Map(),
    },
    controls: {
      farmRatio: 0.5,
      selectedEntityId: null,
      tool: "road",
      stressExtraWorkers: 0,
    },
  };
}
