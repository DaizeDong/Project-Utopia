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

// v0.8.7 T2-2 (QA3-H2): hoist the wanted-tile Set so the tallyTiles cache key
// matches by identity. Re-creating this Set on every collectEconomySnapshot
// call would defeat memoization (the wantedSet identity check would always
// fail).
const ECON_WANTED_TILES = new Set();
let __econWantedTilesInit = false;
function ensureEconWantedTiles() {
  if (__econWantedTilesInit) return ECON_WANTED_TILES;
  ECON_WANTED_TILES.add(TILE.ROAD);
  ECON_WANTED_TILES.add(TILE.WAREHOUSE);
  ECON_WANTED_TILES.add(TILE.WALL);
  ECON_WANTED_TILES.add(TILE.FARM);
  ECON_WANTED_TILES.add(TILE.LUMBER);
  ECON_WANTED_TILES.add(TILE.QUARRY);
  ECON_WANTED_TILES.add(TILE.HERB_GARDEN);
  ECON_WANTED_TILES.add(TILE.KITCHEN);
  ECON_WANTED_TILES.add(TILE.SMITHY);
  ECON_WANTED_TILES.add(TILE.CLINIC);
  __econWantedTilesInit = true;
  return ECON_WANTED_TILES;
}

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
 *
 * v0.8.7 T2-2 (QA3-H2): memoize against grid.version. Pre-fix this was called
 * every tick from collectEconomySnapshot → DevIndexSystem and walked all
 * 96×72 = 6912 tiles unconditionally; with EconomyTelemetry running on every
 * fixed step (30Hz) that adds up to ~200k ops/sec just for tile counts even
 * when the grid has not changed. The grid.version counter is bumped by every
 * tile mutation (mutateTile in TileMutationHooks) so cache invalidation is
 * already plumbed correctly — we just need to consume it.
 */
function tallyTiles(grid, wantedSet) {
  const tiles = grid?.tiles ?? null;
  // Plain-array fast path (tests pass Uint8Array directly)
  if (!grid || typeof grid.version !== "number") {
    const tally = new Map();
    for (const id of wantedSet) tally.set(id, 0);
    if (!tiles) return tally;
    for (let i = 0; i < tiles.length; i += 1) {
      const t = tiles[i];
      if (wantedSet.has(t)) tally.set(t, (tally.get(t) ?? 0) + 1);
    }
    return tally;
  }
  // Cache shape: { version, counts: Map<TILE, number> } stored on grid
  // under a non-enumerable symbol-ish key. The wantedSet is fixed across
  // calls (collectEconomySnapshot reuses the same Set literal) so we only
  // recompute when grid.version changes.
  const cached = grid.__econTileTallyCache;
  if (cached && cached.version === grid.version && cached.wantedSet === wantedSet) {
    return cached.counts;
  }
  const counts = new Map();
  for (const id of wantedSet) counts.set(id, 0);
  if (tiles) {
    for (let i = 0; i < tiles.length; i += 1) {
      const t = tiles[i];
      if (wantedSet.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  grid.__econTileTallyCache = { version: grid.version, wantedSet, counts };
  return counts;
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
  // v0.8.7 T2-2: pass `grid` (not raw `tiles`) so tallyTiles can memoize
  // against grid.version. Identity-stable wanted-set hoisted to module scope.
  const wantedTiles = ensureEconWantedTiles();
  const tally = tallyTiles(grid, wantedTiles);
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
  // v0.10.2 PD P0-1: pop dim allowed to 200 so DevIndex composite (still
  // clamped 0-100 by computeWeightedComposite) keeps moving past the
  // 30-worker plateau as the colony grows further. RaidEscalator's tier
  // curve `2.5 × log2(1 + DI/15)` was structurally capped at tier 7 once
  // population saturated at 100. With the cap raised to 200, an 80-worker
  // colony (ratio ≈ 3.33) can push pop-dim toward ~266, allowing the
  // composite (after weighted blend with the other 5 dims still ≤ 100)
  // to drift higher and unlock tiers 8-10.
  // 80 points at target, saturating at 200 when 2.5× target.
  const ratio = snapshot.agentCount / target;
  const score = ratio * 80;
  if (!Number.isFinite(score)) return 0;
  if (score < 0) return 0;
  if (score > 200) return 200;
  return score;
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
