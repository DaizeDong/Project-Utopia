import { BALANCE } from "../../config/balance.js";
import { ENTITY_TYPE, TILE } from "../../config/constants.js";

/**
 * EconomyTelemetry — Living World v0.8.0 Phase 4.
 *
 * Pure-function helpers that gather the raw per-tick economy signals consumed by
 * `DevIndexSystem` (see `src/simulation/meta/DevIndexSystem.js`). Keeping the
 * data-gathering step pure makes each dimension independently unit-testable
 * without running the full game loop.
 *
 * All exports here are side-effect free. `collectEconomySnapshot(state)`
 * returns the consolidated raw snapshot; the per-dim helpers normalise a
 * snapshot slice into a 0–100 score using the targets in BALANCE.
 *
 * Public contract (consumers must not reorder):
 *   snapshot = {
 *     agentCount: number,
 *     militiaCount: number,
 *     resources: { food, wood, stone },
 *     tileCounts: { road, warehouse, wall, farm, lumber, quarry, herbGarden,
 *                   kitchen, smithy, clinic },
 *     mapTileArea: number,
 *     distress: { hunger, fatigue, morale },
 *   }
 */

const DEFAULT_RESOURCE_TARGETS = Object.freeze({ food: 200, wood: 150, stone: 100 });

function clamp01To100(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Count tiles of the given types in state.grid.tiles. Accepts a Set for O(1)
 * membership checks. Returns a plain tally object keyed by TILE id.
 */
function tallyTiles(tiles, wantedSet) {
  const tally = new Map();
  for (const id of wantedSet) tally.set(id, 0);
  if (!tiles) return tally;
  for (let i = 0; i < tiles.length; i += 1) {
    const t = tiles[i];
    if (wantedSet.has(t)) tally.set(t, (tally.get(t) ?? 0) + 1);
  }
  return tally;
}

/**
 * Collect the per-tick economy snapshot. Pure: reads only from `state`.
 */
export function collectEconomySnapshot(state) {
  const agents = Array.isArray(state?.agents) ? state.agents : [];
  const grid = state?.grid ?? null;
  const tiles = grid?.tiles ?? null;
  const mapTileArea = tiles ? tiles.length : 0;

  // ------ Agents & militia ------
  let agentCount = 0;
  let militiaCount = 0;
  let hungerSum = 0;
  let restSum = 0;
  let moraleSum = 0;
  let workerCount = 0;
  for (const a of agents) {
    if (!a || a.alive === false) continue;
    if (a.type !== ENTITY_TYPE.WORKER && a.type !== ENTITY_TYPE.VISITOR) continue;
    agentCount += 1;
    if (a.role === "MILITIA" || a.role === "militia") militiaCount += 1;
    if (a.type === ENTITY_TYPE.WORKER) {
      workerCount += 1;
      hungerSum += safeNum(a.hunger, 1);
      restSum += safeNum(a.rest, 1);
      moraleSum += safeNum(a.morale, 1);
    }
  }

  const distress = workerCount > 0
    ? {
        // distress = 1 - mean(needs). Higher distress = lower resilience.
        hunger: Math.max(0, 1 - hungerSum / workerCount),
        fatigue: Math.max(0, 1 - restSum / workerCount),
        morale: Math.max(0, 1 - moraleSum / workerCount),
      }
    : { hunger: 0, fatigue: 0, morale: 0 };

  // ------ Resources ------
  const r = state?.resources ?? {};
  const resources = {
    food: safeNum(r.food, 0),
    wood: safeNum(r.wood, 0),
    stone: safeNum(r.stone, 0),
  };

  // ------ Tile tallies ------
  const wantedTiles = new Set([
    TILE.ROAD, TILE.WAREHOUSE, TILE.WALL, TILE.FARM, TILE.LUMBER,
    TILE.QUARRY, TILE.HERB_GARDEN, TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC,
  ]);
  const tally = tallyTiles(tiles, wantedTiles);
  const tileCounts = {
    road: tally.get(TILE.ROAD) ?? 0,
    warehouse: tally.get(TILE.WAREHOUSE) ?? 0,
    wall: tally.get(TILE.WALL) ?? 0,
    farm: tally.get(TILE.FARM) ?? 0,
    lumber: tally.get(TILE.LUMBER) ?? 0,
    quarry: tally.get(TILE.QUARRY) ?? 0,
    herbGarden: tally.get(TILE.HERB_GARDEN) ?? 0,
    kitchen: tally.get(TILE.KITCHEN) ?? 0,
    smithy: tally.get(TILE.SMITHY) ?? 0,
    clinic: tally.get(TILE.CLINIC) ?? 0,
  };

  return {
    agentCount,
    militiaCount,
    resources,
    tileCounts,
    mapTileArea,
    distress,
  };
}

// ---------------------------------------------------------------------------
// Per-dimension scorers (each returns a float in [0, 100]).
// ---------------------------------------------------------------------------

export function scorePopulation(snapshot) {
  const target = Number(BALANCE.devIndexAgentTarget ?? 30);
  if (target <= 0) return 0;
  // 80 points at target, saturating at 100 when 25% above target.
  const ratio = snapshot.agentCount / target;
  const score = ratio * 80;
  return clamp01To100(score);
}

export function scoreEconomy(snapshot) {
  const targets = BALANCE.devIndexResourceTargets ?? DEFAULT_RESOURCE_TARGETS;
  const keys = ["food", "wood", "stone"];
  let sum = 0;
  let weight = 0;
  for (const k of keys) {
    const tgt = Number(targets[k] ?? DEFAULT_RESOURCE_TARGETS[k] ?? 0);
    if (tgt <= 0) continue;
    const have = Number(snapshot.resources[k] ?? 0);
    // Linear to 80 at target, saturating at 100 when 25% above target.
    const score = Math.min(100, (have / tgt) * 80);
    sum += Math.max(0, score);
    weight += 1;
  }
  if (weight === 0) return 0;
  return clamp01To100(sum / weight);
}

export function scoreInfrastructure(snapshot) {
  const { tileCounts, mapTileArea } = snapshot;
  if (!mapTileArea) return 0;
  const roads = tileCounts.road ?? 0;
  const warehouses = tileCounts.warehouse ?? 0;
  // Target ~6% road+warehouse coverage of map for full score.
  const coverage = (roads + warehouses) / mapTileArea;
  const score = (coverage / 0.06) * 80;
  return clamp01To100(score);
}

export function scoreProduction(snapshot) {
  const target = Number(BALANCE.devIndexProducerTarget ?? 24);
  if (target <= 0) return 0;
  const { tileCounts } = snapshot;
  const producers = (tileCounts.farm ?? 0)
    + (tileCounts.lumber ?? 0)
    + (tileCounts.quarry ?? 0)
    + (tileCounts.herbGarden ?? 0)
    + (tileCounts.kitchen ?? 0)
    + (tileCounts.smithy ?? 0)
    + (tileCounts.clinic ?? 0);
  const score = (producers / target) * 80;
  return clamp01To100(score);
}

export function scoreDefense(snapshot) {
  const target = Number(BALANCE.devIndexDefenseTarget ?? 12);
  if (target <= 0) return 0;
  const walls = snapshot.tileCounts.wall ?? 0;
  const militia = snapshot.militiaCount ?? 0;
  // Each wall counts as 1, each militia counts as 2 (force multiplier).
  const defensePoints = walls + militia * 2;
  const score = (defensePoints / target) * 80;
  return clamp01To100(score);
}

export function scoreResilience(snapshot) {
  const d = snapshot.distress ?? { hunger: 0, fatigue: 0, morale: 0 };
  // Mean of three distress channels, all in [0, 1]; invert → higher = calmer.
  const meanDistress = (
    Math.max(0, Math.min(1, d.hunger))
    + Math.max(0, Math.min(1, d.fatigue))
    + Math.max(0, Math.min(1, d.morale))
  ) / 3;
  const score = (1 - meanDistress) * 100;
  return clamp01To100(score);
}

/**
 * Convenience: compute all six dim scores from a snapshot in one call.
 */
export function scoreAllDims(snapshot) {
  return {
    population: scorePopulation(snapshot),
    economy: scoreEconomy(snapshot),
    infrastructure: scoreInfrastructure(snapshot),
    production: scoreProduction(snapshot),
    defense: scoreDefense(snapshot),
    resilience: scoreResilience(snapshot),
  };
}
