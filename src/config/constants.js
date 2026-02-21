export const TILE = Object.freeze({
  GRASS: 0,
  ROAD: 1,
  FARM: 2,
  LUMBER: 3,
  WAREHOUSE: 4,
  WALL: 5,
  RUINS: 6,
  WATER: 7,
});

export const ENTITY_TYPE = Object.freeze({
  WORKER: "WORKER",
  VISITOR: "VISITOR",
  ANIMAL: "ANIMAL",
});

export const VISITOR_KIND = Object.freeze({
  TRADER: "TRADER",
  SABOTEUR: "SABOTEUR",
});

export const ANIMAL_KIND = Object.freeze({
  HERBIVORE: "HERBIVORE",
  PREDATOR: "PREDATOR",
});

export const ROLE = Object.freeze({
  FARM: "FARM",
  WOOD: "WOOD",
  HAUL: "HAUL",
});

export const WEATHER = Object.freeze({
  CLEAR: "clear",
  RAIN: "rain",
  STORM: "storm",
  DROUGHT: "drought",
  WINTER: "winter",
});

export const EVENT_TYPE = Object.freeze({
  ANIMAL_MIGRATION: "animalMigration",
  BANDIT_RAID: "banditRaid",
  TRADE_CARAVAN: "tradeCaravan",
});

export const DEFAULT_GRID = Object.freeze({
  width: 42,
  height: 30,
  tileSize: 1,
});

export const TILE_INFO = Object.freeze({
  [TILE.GRASS]: { passable: true, baseCost: 1.0, height: 0.05, color: 0x162a1a },
  [TILE.ROAD]: { passable: true, baseCost: 0.65, height: 0.03, color: 0x33353a },
  [TILE.FARM]: { passable: true, baseCost: 1.0, height: 0.12, color: 0x455c1f },
  [TILE.LUMBER]: { passable: true, baseCost: 1.0, height: 0.12, color: 0x27422c },
  [TILE.WAREHOUSE]: { passable: true, baseCost: 1.0, height: 0.2, color: 0x5b3f2b },
  [TILE.WALL]: { passable: false, baseCost: 1000, height: 0.55, color: 0x2a2a2d },
  [TILE.RUINS]: { passable: true, baseCost: 1.6, height: 0.08, color: 0x4a2f2b },
  [TILE.WATER]: { passable: false, baseCost: 1000, height: 0.01, color: 0x1b3f61 },
});

export const MOVE_DIRECTIONS_4 = Object.freeze([
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
]);

export const SYSTEM_ORDER = Object.freeze([
  "SimulationClock",
  "RoleAssignmentSystem",
  "EnvironmentDirectorSystem",
  "WeatherSystem",
  "WorldEventSystem",
  "NPCBrainSystem",
  "WorkerAISystem",
  "VisitorAISystem",
  "AnimalAISystem",
  "BoidsSystem",
  "ResourceSystem",
]);
