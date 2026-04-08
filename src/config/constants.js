export const TILE = Object.freeze({
  GRASS: 0,
  ROAD: 1,
  FARM: 2,
  LUMBER: 3,
  WAREHOUSE: 4,
  WALL: 5,
  RUINS: 6,
  WATER: 7,
  QUARRY: 8,
  HERB_GARDEN: 9,
  KITCHEN: 10,
  SMITHY: 11,
  CLINIC: 12,
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
  STONE: "STONE",
  HERBS: "HERBS",
  COOK: "COOK",
  SMITH: "SMITH",
  HERBALIST: "HERBALIST",
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
  width: 96,
  height: 72,
  tileSize: 1,
});

export const TILE_INFO = Object.freeze({
  [TILE.GRASS]: { passable: true, baseCost: 1.0, height: 0.04, color: 0x84c86a },
  [TILE.ROAD]: { passable: true, baseCost: 0.65, height: 0.025, color: 0xc8b39a },
  [TILE.FARM]: { passable: true, baseCost: 1.0, height: 0.09, color: 0xd9c86f },
  [TILE.LUMBER]: { passable: true, baseCost: 1.0, height: 0.11, color: 0x6ea85a },
  [TILE.WAREHOUSE]: { passable: true, baseCost: 1.0, height: 0.2, color: 0xce9468 },
  [TILE.WALL]: { passable: false, baseCost: 1000, height: 0.58, color: 0x9ba9b7 },
  [TILE.RUINS]: { passable: true, baseCost: 1.6, height: 0.07, color: 0xb98b73 },
  [TILE.WATER]: { passable: false, baseCost: 1000, height: 0.018, color: 0x69b4ea },
  [TILE.QUARRY]: { passable: true, baseCost: 1.2, height: 0.13, color: 0xa0896e },
  [TILE.HERB_GARDEN]: { passable: true, baseCost: 1.0, height: 0.08, color: 0x7bb86a },
  [TILE.KITCHEN]: { passable: true, baseCost: 1.0, height: 0.22, color: 0xd4a65a },
  [TILE.SMITHY]: { passable: true, baseCost: 1.0, height: 0.25, color: 0x8c7a6b },
  [TILE.CLINIC]: { passable: true, baseCost: 1.0, height: 0.22, color: 0xc4d8c0 },
});

export const MOVE_DIRECTIONS_4 = Object.freeze([
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
]);

export const SYSTEM_ORDER = Object.freeze([
  "SimulationClock",
  "ProgressionSystem",
  "RoleAssignmentSystem",
  "EnvironmentDirectorSystem",
  "WeatherSystem",
  "WorldEventSystem",
  "NPCBrainSystem",
  "WorkerAISystem",
  "VisitorAISystem",
  "AnimalAISystem",
  "MortalitySystem",
  "BoidsSystem",
  "ResourceSystem",
  "ProcessingSystem",
]);
