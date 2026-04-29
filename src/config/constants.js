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
  BRIDGE: 13,
  // v0.8.4 strategic walls + gate (Agent C). GATE is faction-aware: passable
  // for the colony faction; blocked for hostile factions (predators, raiders,
  // saboteurs). Faction logic lives in src/simulation/navigation/Faction.js;
  // pathfinding (AStar) consults it via options.faction. The base TILE_INFO
  // marks GATE as `passable: true` so callers that don't pass a faction (e.g.
  // raw isPassable() probes, scenario tooling) get the colony-side answer.
  GATE: 14,
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
  // v0.8.3 worker-vs-raider combat — GUARDs do not farm/haul. They patrol
  // near home and engage predators in melee within `guardAggroRadius`. They
  // are promoted from idle workers when threat posture is hot (see
  // ThreatPlanner / RoleAssignmentSystem). Stat profile: higher attack
  // damage, same hp as a regular worker.
  GUARD: "GUARD",
  // v0.8.4 building-construction (Agent A) — BUILDERs walk to construction
  // sites in `state.constructionSites` and apply work-seconds to the
  // `tileState.construction` overlay. RoleAssignmentSystem promotes idle
  // workers to BUILDER while at least one site exists, capped by
  // BALANCE.builderMax. Reverts to FARM when sites empty.
  BUILDER: "BUILDER",
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
  // v0.8.2 Round-6 Wave-2 (01d-mechanics-content Step 1) — proactive event
  // pressure. EventDirectorSystem rolls these into state.events.queue on a
  // ~240s cadence; WorldEventSystem.applyActiveEvent dispatches their effects.
  MORALE_BREAK: "moraleBreak",
  DISEASE_OUTBREAK: "diseaseOutbreak",
  WILDFIRE: "wildfire",
});

// v0.8.2 Round-6 Wave-2 (01d-mechanics-content Step 1) — predator/herbivore
// species variants. ANIMAL_KIND stays binary (HERBIVORE/PREDATOR) so existing
// code paths keep working; species is a sub-field on the animal that
// AnimalAISystem reads to vary attack cadence + behaviour.
export const ANIMAL_SPECIES = Object.freeze({
  DEER: "deer",
  WOLF: "wolf",
  BEAR: "bear",
  RAIDER_BEAST: "raider_beast",
});

// v0.8.0 Phase 3 M1a — per-tile resource node bitmask stored on tileState.nodeFlags.
// FOREST → only valid placement surface for LUMBER.
// STONE  → only valid placement surface for QUARRY.
// HERB   → only valid placement surface for HERB_GARDEN.
// FARM is not node-gated (arable tiles are derived from fertility + moisture).
export const NODE_FLAGS = Object.freeze({
  NONE: 0,
  FOREST: 1,
  STONE: 2,
  HERB: 4,
});

// v0.8.0 Phase 3 M1b — fog of war tile visibility state (stored in parallel Uint8Array).
export const FOG_STATE = Object.freeze({
  HIDDEN: 0,   // never revealed
  EXPLORED: 1, // previously revealed, currently out of sight
  VISIBLE: 2,  // currently within an actor's reveal radius
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
  [TILE.BRIDGE]: { passable: true, baseCost: 0.65, height: 0.04, color: 0x8b7d6b },
  // v0.8.4 strategic walls + gate (Agent C). Passable=true is the
  // *default* answer for callers that don't supply a faction; the actual
  // hostile-blocking logic lives in
  // `src/simulation/navigation/Faction.js#isTilePassableForFaction`, which
  // AStar consults when options.faction is provided.
  [TILE.GATE]: { passable: true, baseCost: 0.85, height: 0.45, color: 0x8b6f47 },
});

export const MOVE_DIRECTIONS_4 = Object.freeze([
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
]);

export const SYSTEM_ORDER = Object.freeze([
  "SimulationClock",
  "VisibilitySystem",
  "ProgressionSystem",
  "DevIndexSystem",
  "RaidEscalatorSystem",
  // v0.8.2 Round-6 Wave-2 (01d-mechanics-content Step 2) — EventDirector
  // sits after RaidEscalator (so it can read raidEscalation.intervalTicks for
  // the bandit-raid cooldown downgrade) and before ColonyDirector (so its
  // queued events are visible to the same-tick building snapshot).
  "EventDirectorSystem",
  // Phase A LLM Colony Planner wiring: AgentDirectorSystem replaces
  // ColonyDirectorSystem in the order. AgentDirectorSystem internally wraps
  // ColonyDirectorSystem as `_fallback` and delegates to it when
  // `state.ai.coverageTarget === "fallback"` (Autopilot OFF) so behaviour is
  // unchanged for non-LLM runs.
  "AgentDirectorSystem",
  "RoleAssignmentSystem",
  "PopulationGrowthSystem",
  "EnvironmentDirectorSystem",
  "WeatherSystem",
  "WorldEventSystem",
  "TileStateSystem",
  "NPCBrainSystem",
  "WarehouseQueueSystem",
  "WorkerAISystem",
  // v0.8.4 building-construction (Agent A) — sits AFTER WorkerAISystem so
  // any builder workAppliedSec increment from this same tick is reflected
  // before completion is checked, and BEFORE VisitorAISystem so the
  // post-mutation tile is already visible to other agents this tick.
  "ConstructionSystem",
  "VisitorAISystem",
  "AnimalAISystem",
  "MortalitySystem",
  "BoidsSystem",
  "ResourceSystem",
  "ProcessingSystem",
]);

// v0.9.0-a — Feature flags. Object.freeze with a getter so the surface is
// immutable but `_testSetFeatureFlag` can flip the underlying state for
// test isolation. Production code reads `FEATURE_FLAGS.USE_JOB_LAYER`
// exactly like a static frozen field; tests call `_testSetFeatureFlag`
// from this module only (NOT exported anywhere else).
//
// USE_JOB_LAYER — Phase 1 of 5 in the v0.9.0 Job-layer rewrite. When false
// (production default), WorkerAISystem.update runs the legacy chooseWorker*
// + commitmentCycle dispatch (zero behaviour change). When true,
// WorkerAISystem routes through src/simulation/npc/jobs/JobScheduler.
// Will flip to true in phase 0.9.0-d after harvest/deliver/eat/build/rest
// /process/guard Jobs are ported and validated against the trace harness.
let _useJobLayer = false;

export const FEATURE_FLAGS = Object.freeze({
  get USE_JOB_LAYER() { return _useJobLayer; },
});

// Test-only setter. Do NOT call from production code paths.
// Restores the flag to its default in afterEach hooks to keep tests isolated.
export function _testSetFeatureFlag(name, value) {
  if (name === "USE_JOB_LAYER") _useJobLayer = Boolean(value);
}
