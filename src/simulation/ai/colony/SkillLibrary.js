/**
 * SkillLibrary — Compound build patterns (Voyager-inspired)
 *
 * Skills are reusable multi-step build templates that the Planner can invoke
 * as atomic actions. Each skill defines preconditions, placement offsets,
 * expected effects, and terrain preferences.
 */

import { BALANCE, BUILD_COST } from "../../../config/balance.js";
import { FOG_STATE, NODE_FLAGS, TILE } from "../../../config/constants.js";
import { getTile, getTileState, inBounds, listTilesByType, toIndex } from "../../../world/grid/Grid.js";

// ── Living World v0.8.0 Phase 5 (patches 14, 17-18) — skill thresholds ──
/** Depleted-yield threshold for skill triggers (distinct from evaluator threshold). */
const SKILL_DEPLETED_YIELD_THRESHOLD = 30;
/** All-depleted threshold for prospect_fog_frontier trigger. */
const SKILL_ALL_DEPLETED_THRESHOLD = 120;
/** Relocation ring distance (min/max Manhattan offsets from the depleted producer). */
const RELOCATE_MIN_DIST = 4;
const RELOCATE_MAX_DIST = 6;

// ── Skill Definitions ────────────────────────────────────────────────

export const SKILL_LIBRARY = Object.freeze({
  logistics_hub: Object.freeze({
    name: "Logistics Hub",
    description: "Warehouse + road star + 2 farms — creates a new logistics anchor with food production",
    preconditions: Object.freeze({ wood: 22, availableGrass: 12 }),
    steps: Object.freeze([
      Object.freeze({ type: "warehouse", offset: [0, 0] }),
      Object.freeze({ type: "road", offset: [1, 0] }),
      Object.freeze({ type: "road", offset: [-1, 0] }),
      Object.freeze({ type: "road", offset: [0, 1] }),
      Object.freeze({ type: "road", offset: [0, -1] }),
      Object.freeze({ type: "farm", offset: [2, 0] }),
      Object.freeze({ type: "farm", offset: [-2, 0] }),
    ]),
    expectedEffect: Object.freeze({ coverage: "+1 cluster", food_rate: "+1.0/s" }),
    terrain_preference: Object.freeze({ minMoisture: 0.4 }),
  }),

  processing_cluster: Object.freeze({
    name: "Processing Cluster",
    description: "Quarry + Smithy near warehouse — unlocks tools for colony-wide production boost",
    preconditions: Object.freeze({ wood: 18, stone: 5 }),
    steps: Object.freeze([
      Object.freeze({ type: "quarry", offset: [0, 0] }),
      Object.freeze({ type: "road", offset: [1, 0] }),
      Object.freeze({ type: "smithy", offset: [2, 0] }),
    ]),
    expectedEffect: Object.freeze({ tools_rate: "+0.2/s", production_multiplier: "+15%" }),
    terrain_preference: Object.freeze({ maxElevation: 0.6 }),
  }),

  defense_line: Object.freeze({
    name: "Defense Line",
    description: "Wall chain along elevation ridge — maximizes wall defense bonus",
    preconditions: Object.freeze({ wood: 10 }),
    steps: Object.freeze([
      Object.freeze({ type: "wall", offset: [0, 0] }),
      Object.freeze({ type: "wall", offset: [1, 0] }),
      Object.freeze({ type: "wall", offset: [2, 0] }),
      Object.freeze({ type: "wall", offset: [3, 0] }),
      Object.freeze({ type: "wall", offset: [4, 0] }),
    ]),
    expectedEffect: Object.freeze({ threat: "-5", wall_coverage: "+0.05" }),
    terrain_preference: Object.freeze({ minElevation: 0.6 }),
  }),

  food_district: Object.freeze({
    name: "Food District",
    description: "Dense farm cluster near warehouse with kitchen — maximizes food throughput",
    preconditions: Object.freeze({ wood: 25, stone: 3, farms: 6 }),
    steps: Object.freeze([
      Object.freeze({ type: "farm", offset: [0, 1] }),
      Object.freeze({ type: "farm", offset: [1, 0] }),
      Object.freeze({ type: "farm", offset: [0, -1] }),
      Object.freeze({ type: "farm", offset: [-1, 0] }),
      Object.freeze({ type: "kitchen", offset: [0, 0] }),
    ]),
    expectedEffect: Object.freeze({ food_rate: "+2.0/s", meals_rate: "+0.3/s" }),
    terrain_preference: Object.freeze({ minMoisture: 0.5 }),
  }),

  expansion_outpost: Object.freeze({
    name: "Expansion Outpost",
    description: "Warehouse + road + farm + lumber in new territory — seeds colony expansion",
    preconditions: Object.freeze({ wood: 22 }),
    steps: Object.freeze([
      Object.freeze({ type: "road", offset: [-1, 0] }),
      Object.freeze({ type: "warehouse", offset: [0, 0] }),
      Object.freeze({ type: "road", offset: [1, 0] }),
      Object.freeze({ type: "farm", offset: [2, 0] }),
      Object.freeze({ type: "lumber", offset: [0, 2] }),
    ]),
    expectedEffect: Object.freeze({ coverage: "+1 frontier", food_rate: "+0.4/s", wood_rate: "+0.5/s" }),
    terrain_preference: Object.freeze({ minMoisture: 0.3 }),
  }),

  bridge_link: Object.freeze({
    name: "Bridge Link",
    description: "Bridge chain across water with road approaches — connects islands",
    preconditions: Object.freeze({ wood: 12, stone: 4 }),
    steps: Object.freeze([
      Object.freeze({ type: "road", offset: [-1, 0] }),
      Object.freeze({ type: "bridge", offset: [0, 0] }),
      Object.freeze({ type: "bridge", offset: [1, 0] }),
      Object.freeze({ type: "road", offset: [2, 0] }),
    ]),
    expectedEffect: Object.freeze({ connectivity: "+1 route" }),
    terrain_preference: Object.freeze({}),
  }),

  medical_center: Object.freeze({
    name: "Medical Center",
    description: "Clinic + herb garden + road — establishes healing infrastructure for colony health",
    preconditions: Object.freeze({ wood: 11, herbs: 4 }),
    steps: Object.freeze([
      Object.freeze({ type: "herb_garden", offset: [0, 0] }),
      Object.freeze({ type: "road", offset: [1, 0] }),
      Object.freeze({ type: "clinic", offset: [2, 0] }),
    ]),
    expectedEffect: Object.freeze({ medicine_rate: "+0.15/s", herbs_rate: "+0.2/s" }),
    terrain_preference: Object.freeze({ minMoisture: 0.4 }),
  }),

  resource_hub: Object.freeze({
    name: "Resource Hub",
    description: "Quarry + lumber + 2 roads near warehouse — diversifies raw material production",
    preconditions: Object.freeze({ wood: 15 }),
    steps: Object.freeze([
      Object.freeze({ type: "lumber", offset: [0, 0] }),
      Object.freeze({ type: "road", offset: [1, 0] }),
      Object.freeze({ type: "road", offset: [2, 0] }),
      Object.freeze({ type: "quarry", offset: [3, 0] }),
    ]),
    expectedEffect: Object.freeze({ wood_rate: "+0.5/s", stone_rate: "+0.3/s" }),
    terrain_preference: Object.freeze({ maxElevation: 0.6 }),
  }),

  rapid_farms: Object.freeze({
    name: "Rapid Farms",
    description: "3 farms in L-shape near warehouse — quick food boost for population growth",
    preconditions: Object.freeze({ wood: 15 }),
    steps: Object.freeze([
      Object.freeze({ type: "farm", offset: [0, 0] }),
      Object.freeze({ type: "farm", offset: [1, 0] }),
      Object.freeze({ type: "farm", offset: [0, 1] }),
    ]),
    expectedEffect: Object.freeze({ food_rate: "+1.2/s" }),
    terrain_preference: Object.freeze({ minMoisture: 0.5 }),
  }),
});

// ── Skill Queries ────────────────────────────────────────────────────

/**
 * Compute the total resource cost for a skill by summing BUILD_COST of each step.
 * @param {string} skillId
 * @returns {Record<string, number>}
 */
export function getSkillTotalCost(skillId) {
  const skill = SKILL_LIBRARY[skillId];
  if (!skill) return {};
  const total = {};
  for (const step of skill.steps) {
    const cost = BUILD_COST[step.type];
    if (!cost) continue;
    for (const [res, amount] of Object.entries(cost)) {
      total[res] = (total[res] ?? 0) + amount;
    }
  }
  return total;
}

/**
 * Check whether a skill's preconditions are met given current state.
 * Preconditions can include resource amounts and building counts.
 * @param {string} skillId
 * @param {object} resources — { food, wood, stone, herbs, ... }
 * @param {object} buildings — { farms, warehouses, ... }
 * @returns {{ met: boolean, missing: string[] }}
 */
export function checkSkillPreconditions(skillId, resources, buildings) {
  const skill = SKILL_LIBRARY[skillId];
  if (!skill) return { met: false, missing: ["unknown skill"] };

  const missing = [];
  const pre = skill.preconditions;

  // Resource checks
  for (const res of ["wood", "stone", "herbs", "food"]) {
    if (pre[res] != null && (resources[res] ?? 0) < pre[res]) {
      missing.push(`${res}: need ${pre[res]}, have ${resources[res] ?? 0}`);
    }
  }

  // Building count checks
  if (pre.farms != null && (buildings.farms ?? 0) < pre.farms) {
    missing.push(`farms: need ${pre.farms}, have ${buildings.farms ?? 0}`);
  }

  // availableGrass is checked at placement time, not here
  return { met: missing.length === 0, missing };
}

/**
 * Expand a skill into concrete build steps anchored at a given tile.
 * @param {string} skillId
 * @param {{ ix: number, iz: number }} anchor — center tile
 * @returns {Array<{ type: string, ix: number, iz: number }>} — absolute tile positions
 */
export function expandSkillSteps(skillId, anchor) {
  const skill = SKILL_LIBRARY[skillId];
  if (!skill) return [];
  return skill.steps.map(step => ({
    type: step.type,
    ix: anchor.ix + step.offset[0],
    iz: anchor.iz + step.offset[1],
  }));
}

/**
 * Check how many of a skill's steps can actually be placed at an anchor.
 * Returns a feasibility ratio (0-1) and the list of feasible/infeasible steps.
 * @param {string} skillId
 * @param {{ ix: number, iz: number }} anchor
 * @param {object} grid
 * @param {object} buildSystem
 * @param {object} state
 * @returns {{ ratio: number, feasible: number, total: number, steps: Array }}
 */
export function assessSkillFeasibility(skillId, anchor, grid, buildSystem, state, services = null) {
  const expanded = expandSkillSteps(skillId, anchor);
  if (expanded.length === 0) return { ratio: 0, feasible: 0, total: 0, steps: [] };

  let feasibleCount = 0;
  const steps = expanded.map(step => {
    if (!inBounds(step.ix, step.iz, grid)) {
      return { ...step, feasible: false, reason: "out_of_bounds" };
    }
    const preview = buildSystem.previewToolAt(state, step.type, step.ix, step.iz, services);
    if (preview.ok) {
      feasibleCount++;
      return { ...step, feasible: true, reason: null };
    }
    return { ...step, feasible: false, reason: preview.reason ?? "blocked" };
  });

  return {
    ratio: feasibleCount / expanded.length,
    feasible: feasibleCount,
    total: expanded.length,
    steps,
  };
}

/**
 * Score a candidate anchor tile for a skill based on terrain preferences.
 * Higher score = better fit. Returns 0-1.
 * @param {string} skillId
 * @param {{ ix: number, iz: number }} anchor
 * @param {object} grid
 * @returns {number}
 */
export function scoreSkillTerrain(skillId, anchor, grid) {
  const skill = SKILL_LIBRARY[skillId];
  if (!skill) return 0;

  const pref = skill.terrain_preference;
  if (!pref || Object.keys(pref).length === 0) return 1; // no preference = always good

  // Sample average terrain across all step positions (not just anchor)
  let totalElev = 0;
  let totalMoist = 0;
  let count = 0;
  for (const step of skill.steps) {
    const ix = anchor.ix + step.offset[0];
    const iz = anchor.iz + step.offset[1];
    if (ix >= 0 && iz >= 0 && ix < grid.width && iz < grid.height) {
      const idx = toIndex(ix, iz, grid.width);
      totalElev += grid.elevation?.[idx] ?? 0.5;
      totalMoist += grid.moisture?.[idx] ?? 0.5;
      count++;
    }
  }
  if (count === 0) return 0.1;

  const elevation = totalElev / count;
  const moisture = totalMoist / count;

  let score = 1;

  if (pref.minMoisture != null) {
    if (moisture < pref.minMoisture) {
      // Soft penalty: score degrades smoothly but never below 0.1
      score *= 0.1 + 0.9 * (moisture / pref.minMoisture);
    }
  }
  if (pref.maxElevation != null) {
    if (elevation > pref.maxElevation) {
      score *= 0.1 + 0.9 * Math.max(0, 1 - (elevation - pref.maxElevation) / 0.4);
    }
  }
  if (pref.minElevation != null) {
    if (elevation < pref.minElevation) {
      score *= 0.1 + 0.9 * (elevation / pref.minElevation);
    }
  }

  return Math.max(0.05, Math.min(1, score));
}

/**
 * Select the best skill for a given strategic goal.
 * @param {string} goal — one of: "expand_coverage", "boost_food", "boost_processing", "fortify", "connect_islands"
 * @param {object} resources
 * @param {object} buildings
 * @returns {{ skillId: string, skill: object } | null}
 */
export function selectSkillForGoal(goal, resources, buildings) {
  const goalSkillMap = {
    expand_coverage: ["logistics_hub", "expansion_outpost"],
    boost_food: ["food_district", "logistics_hub"],
    boost_processing: ["processing_cluster"],
    fortify: ["defense_line"],
    connect_islands: ["bridge_link"],
  };

  const candidates = goalSkillMap[goal];
  if (!candidates) return null;

  for (const skillId of candidates) {
    const { met } = checkSkillPreconditions(skillId, resources, buildings);
    if (met) {
      return { skillId, skill: SKILL_LIBRARY[skillId] };
    }
  }
  return null;
}

// ── Phase 5 Skills (patches 14, 17, 18) ────────────────────────────────────

const PRODUCER_TILE_NAMES = new Map([
  [TILE.LUMBER, "lumber"],
  [TILE.QUARRY, "quarry"],
  [TILE.HERB_GARDEN, "herb_garden"],
  [TILE.FARM, "farm"],
]);

/**
 * Check whether a tile is adjacent (4-way) to a live resource node tile with
 * a non-zero yieldPool. Used by recycle_abandoned_worksite.
 * @param {object} grid
 * @param {number} ix
 * @param {number} iz
 */
function _hasAdjacentLiveNode(grid, ix, iz) {
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  for (const [dx, dz] of dirs) {
    const nx = ix + dx;
    const nz = iz + dz;
    if (!inBounds(nx, nz, grid)) continue;
    const ts = getTileState(grid, nx, nz);
    if (!ts) continue;
    const flags = Number(ts.nodeFlags ?? 0);
    const pool = Number(ts.yieldPool ?? 0);
    if (flags > 0 && pool > 0) return true;
  }
  return false;
}

/**
 * Patch 17 — prospect_fog_frontier.
 *
 * When all discovered producer nodes of a given type have `yieldPool < 120`,
 * suggest exploring the fog boundary nearest the most-depleted node. Returns
 * one suggestion per exhausted resource class.
 *
 * @param {object} state
 * @returns {Array<{skill:"prospect_fog_frontier", resource:string, target:{ix:number,iz:number}, assignments:Array<{intent:string, target:{ix:number, iz:number}}>}>}
 */
export function suggestProspectFogFrontier(state) {
  const grid = state?.grid;
  if (!grid) return [];
  const threshold = Number(BALANCE.skillProspectYieldThreshold ?? SKILL_ALL_DEPLETED_THRESHOLD);
  const suggestions = [];

  const classes = [
    [TILE.LUMBER, "wood"],
    [TILE.QUARRY, "stone"],
    [TILE.HERB_GARDEN, "herbs"],
  ];

  for (const [tileType, resource] of classes) {
    const tiles = listTilesByType(grid, [tileType]);
    if (tiles.length === 0) continue;
    let worstTile = null;
    let worstPool = Infinity;
    let allDepleted = true;
    for (const t of tiles) {
      const ts = getTileState(grid, t.ix, t.iz);
      const pool = Number(ts?.yieldPool ?? 0);
      if (pool >= threshold) { allDepleted = false; break; }
      if (pool < worstPool) {
        worstPool = pool;
        worstTile = t;
      }
    }
    if (!allDepleted || !worstTile) continue;

    const target = _nearestFogBoundaryTile(state, worstTile.ix, worstTile.iz);
    if (!target) continue;

    suggestions.push({
      skill: "prospect_fog_frontier",
      resource,
      target,
      assignments: [{ intent: "explore_fog", target: { ix: target.ix, iz: target.iz } }],
    });
  }

  return suggestions;
}

/**
 * Scan the fog.visibility array (Phase 3 M1b) for the nearest HIDDEN tile to
 * the given anchor. Returns null if fog is disabled / no hidden tiles remain.
 * @param {object} state
 * @param {number} ax
 * @param {number} az
 */
function _nearestFogBoundaryTile(state, ax, az) {
  const grid = state?.grid;
  const fog = state?.fog;
  if (!grid || !fog?.visibility) return null;
  const vis = fog.visibility;
  const { width, height } = grid;

  let bestDist = Infinity;
  let bestTile = null;
  for (let iz = 0; iz < height; iz++) {
    for (let ix = 0; ix < width; ix++) {
      if (vis[toIndex(ix, iz, width)] !== FOG_STATE.HIDDEN) continue;
      const d = Math.abs(ix - ax) + Math.abs(iz - az);
      if (d < bestDist) {
        bestDist = d;
        bestTile = { ix, iz };
      }
    }
  }
  return bestTile;
}

/**
 * Patch 18 — recycle_abandoned_worksite.
 *
 * Detects producer tiles whose yieldPool is fully exhausted (≤0) AND whose
 * neighbours contain no live (pool>0) node. Suggests a `demolish` intent so
 * Plan C1c recycling refunds stone.
 *
 * @param {object} state
 * @returns {Array<{skill:"recycle_abandoned_worksite", target:{ix:number,iz:number}, action:string}>}
 */
export function suggestRecycleAbandonedWorksite(state) {
  const grid = state?.grid;
  if (!grid) return [];

  const results = [];
  const producerTiles = listTilesByType(grid, [TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN]);
  for (const t of producerTiles) {
    const ts = getTileState(grid, t.ix, t.iz);
    if (!ts) continue;
    const pool = Number(ts.yieldPool ?? 0);
    if (pool > 0) continue;
    if (_hasAdjacentLiveNode(grid, t.ix, t.iz)) continue;
    const producerName = PRODUCER_TILE_NAMES.get(grid.tiles[toIndex(t.ix, t.iz, grid.width)]);
    results.push({
      skill: "recycle_abandoned_worksite",
      target: { ix: t.ix, iz: t.iz },
      producer: producerName ?? null,
      action: "demolish",
      assignments: [{ intent: "demolish", target: { ix: t.ix, iz: t.iz } }],
    });
  }
  return results;
}

/**
 * Patch 14 — relocate_depleted_producer.
 *
 * Detects producers whose tile has `yieldPool < 30` AND which are connected
 * to the road network. Recommends demolish + rebuild 4-6 tiles away on a
 * reachable road-adjacent tile. Relies on `state._roadNetwork` union-find
 * (built by LogisticsSystem); when the network is absent, the proximity
 * check falls back to "any adjacent road tile".
 *
 * @param {object} state
 * @returns {Array<{skill:"relocate_depleted_producer", producer:string, from:{ix:number,iz:number}, to:{ix:number,iz:number}|null, steps:Array}>}
 */
export function suggestRelocateDepletedProducer(state) {
  const grid = state?.grid;
  if (!grid) return [];
  const yieldThreshold = Number(BALANCE.skillRelocateYieldThreshold ?? SKILL_DEPLETED_YIELD_THRESHOLD);
  const out = [];
  const producerTiles = listTilesByType(grid, [TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN, TILE.FARM]);

  for (const t of producerTiles) {
    const ts = getTileState(grid, t.ix, t.iz);
    if (!ts) continue;
    const pool = Number(ts.yieldPool ?? 0);
    if (pool >= yieldThreshold) continue;
    if (!_isRoadConnected(state, t.ix, t.iz)) continue;

    const tileType = grid.tiles[toIndex(t.ix, t.iz, grid.width)];
    const producerName = PRODUCER_TILE_NAMES.get(tileType) ?? "producer";
    const relocateTo = _findRelocateAnchor(state, t.ix, t.iz, tileType);
    out.push({
      skill: "relocate_depleted_producer",
      producer: producerName,
      from: { ix: t.ix, iz: t.iz },
      to: relocateTo,
      steps: [
        { action: "demolish", target: { ix: t.ix, iz: t.iz } },
        relocateTo ? { action: "build", buildingType: producerName, target: relocateTo } : null,
      ].filter(Boolean),
    });
  }

  return out;
}

/** Tile is road-adjacent (4-directional) or on a road/bridge itself. */
function _isRoadConnected(state, ix, iz) {
  const grid = state?.grid;
  if (!grid) return false;
  const selfTile = grid.tiles[toIndex(ix, iz, grid.width)];
  if (selfTile === TILE.ROAD || selfTile === TILE.BRIDGE) return true;
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  for (const [dx, dz] of dirs) {
    const nx = ix + dx;
    const nz = iz + dz;
    if (!inBounds(nx, nz, grid)) continue;
    const t = grid.tiles[toIndex(nx, nz, grid.width)];
    if (t === TILE.ROAD || t === TILE.BRIDGE) return true;
  }
  return false;
}

/**
 * Scan tiles in RELOCATE_MIN_DIST..RELOCATE_MAX_DIST Manhattan ring around the
 * depleted producer and return the first GRASS tile that is itself
 * road-connected. Returns null if no suitable anchor exists.
 * @param {object} state
 * @param {number} ox
 * @param {number} oz
 * @param {number} producerTile
 */
function _findRelocateAnchor(state, ox, oz, producerTile) {
  const grid = state?.grid;
  if (!grid) return null;
  for (let dist = RELOCATE_MIN_DIST; dist <= RELOCATE_MAX_DIST; dist++) {
    for (let dz = -dist; dz <= dist; dz++) {
      const dx = dist - Math.abs(dz);
      for (const signed of [dx, -dx]) {
        const ix = ox + signed;
        const iz = oz + dz;
        if (!inBounds(ix, iz, grid)) continue;
        const tile = grid.tiles[toIndex(ix, iz, grid.width)];
        if (tile !== TILE.GRASS) continue;
        if (!_isRoadConnected(state, ix, iz)) continue;
        // For node-gated producers (LUMBER/QUARRY/HERB_GARDEN), require the
        // corresponding node flag bit on the target tile.
        const ts = getTileState(grid, ix, iz);
        const flags = Number(ts?.nodeFlags ?? 0);
        if (producerTile === TILE.LUMBER && !(flags & NODE_FLAGS.FOREST)) continue;
        if (producerTile === TILE.QUARRY && !(flags & NODE_FLAGS.STONE)) continue;
        if (producerTile === TILE.HERB_GARDEN && !(flags & NODE_FLAGS.HERB)) continue;
        return { ix, iz };
      }
    }
  }
  return null;
}

/**
 * List all skills and their current affordability status.
 * @param {object} resources
 * @param {object} buildings
 * @returns {Array<{ skillId: string, name: string, affordable: boolean, missing: string[] }>}
 */
export function listSkillStatus(resources, buildings) {
  return Object.keys(SKILL_LIBRARY).map(skillId => {
    const skill = SKILL_LIBRARY[skillId];
    const { met, missing } = checkSkillPreconditions(skillId, resources, buildings);
    return { skillId, name: skill.name, affordable: met, missing };
  });
}
