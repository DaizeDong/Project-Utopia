/**
 * PlanExecutor — Grounds and executes LLM-generated build plans.
 *
 * Responsibilities:
 * 1. Resolve location hints to candidate tiles (near_cluster, near_step, expansion, etc.)
 * 2. SayCan-inspired affordance scoring to filter infeasible actions
 * 3. Terrain-aware tile ranking (moisture for farms, elevation for walls)
 * 4. Execute plan steps respecting dependencies and per-tick build limits
 * 5. Skill expansion (compound skills → individual build steps)
 */

import { BUILD_COST, BALANCE } from "../../../config/balance.js";
import { TILE } from "../../../config/constants.js";
import {
  inBounds, getTile, listTilesByType, toIndex,
  rebuildBuildingStats,
} from "../../../world/grid/Grid.js";
import { canAfford } from "../../construction/BuildAdvisor.js";
import { detectClusters, analyzeExpansionFrontiers } from "./ColonyPerceiver.js";
import {
  SKILL_LIBRARY, expandSkillSteps, assessSkillFeasibility, scoreSkillTerrain,
} from "./SkillLibrary.js";
import { analyzeCandidateTiles } from "./PlacementSpecialist.js";

// ── Constants ────────────────────────────────────────────────────────

const MAX_BUILDS_PER_TICK = 2;
const HINT_SEARCH_RADIUS = 6;
const NEAR_STEP_RADIUS = 4;
const COVERAGE_GAP_SEARCH_RADIUS = 10;

// Terrain quality weights by building type
const TERRAIN_RANK_WEIGHTS = Object.freeze({
  farm:        { moisture: 1.0, elevation: -0.3 },
  lumber:      { moisture: 0.3, elevation: -0.2 },
  herb_garden: { moisture: 0.8, elevation: -0.2 },
  quarry:      { moisture: -0.1, elevation: 0.4 },
  wall:        { moisture: 0, elevation: 0.6 },
  warehouse:   { moisture: 0.2, elevation: -0.1 },
  kitchen:     { moisture: 0.3, elevation: -0.1 },
  smithy:      { moisture: 0, elevation: 0.2 },
  clinic:      { moisture: 0.4, elevation: -0.1 },
  road:        { moisture: 0, elevation: -0.2 },
  bridge:      { moisture: 0, elevation: 0 },
});

// ── Location Hint Resolution ─────────────────────────────────────────

/**
 * Resolve a location hint string into an array of candidate tiles.
 *
 * Supported hint formats:
 *   near_cluster:<id>       — within radius 6 of cluster centroid
 *   near_step:<id>          — within radius 4 of a previously grounded step
 *   expansion:<direction>   — tiles in expansion frontier (north/south/east/west)
 *   coverage_gap            — centroid of uncovered worksites
 *   defense_line:<dir>      — border tiles along a direction
 *   terrain:high_moisture   — tiles with moisture > 0.5 near infrastructure
 *   <ix>,<iz>               — explicit coordinate
 *
 * @param {string} hint
 * @param {object} state
 * @param {Map} [groundedSteps] — map of step.id → grounded tile for near_step resolution
 * @returns {Array<{ ix: number, iz: number }>}
 */
export function resolveLocationHint(hint, state, groundedSteps = new Map()) {
  if (!hint || typeof hint !== "string") {
    return _defaultCandidates(state);
  }

  const grid = state.grid;

  // Explicit coordinate: "42,31"
  const coordMatch = hint.match(/^(\d+),(\d+)$/);
  if (coordMatch) {
    const ix = parseInt(coordMatch[1], 10);
    const iz = parseInt(coordMatch[2], 10);
    if (inBounds(ix, iz, grid)) return [{ ix, iz }];
    return [];
  }

  // near_cluster:<id>
  if (hint.startsWith("near_cluster:")) {
    const clusterId = hint.slice("near_cluster:".length);
    const clusters = detectClusters(grid);
    const cluster = clusters.find(c => c.id === clusterId) ?? clusters[0];
    if (!cluster) return _defaultCandidates(state);
    return _tilesInRadius(grid, cluster.center, HINT_SEARCH_RADIUS);
  }

  // near_step:<id>
  if (hint.startsWith("near_step:")) {
    const stepId = parseInt(hint.slice("near_step:".length), 10);
    const tile = groundedSteps.get(stepId);
    if (!tile) return _defaultCandidates(state);
    return _tilesInRadius(grid, tile, NEAR_STEP_RADIUS);
  }

  // expansion:<direction>
  if (hint.startsWith("expansion:")) {
    const direction = hint.slice("expansion:".length);
    const clusters = detectClusters(grid);
    const frontiers = analyzeExpansionFrontiers(grid, clusters);
    const frontier = frontiers.find(f => f.direction === direction);
    if (!frontier || !frontier.tiles || frontier.tiles.length === 0) {
      // Fallback: search in the direction from map center
      return _directionalCandidates(grid, direction);
    }
    return frontier.tiles;
  }

  // coverage_gap
  if (hint === "coverage_gap") {
    return _coverageGapCandidates(state);
  }

  // defense_line:<direction>
  if (hint.startsWith("defense_line:")) {
    const dir = hint.slice("defense_line:".length);
    return _defenseLineCandidates(grid, dir);
  }

  // terrain:high_moisture
  if (hint === "terrain:high_moisture") {
    return _highMoistureCandidates(grid, state);
  }

  return _defaultCandidates(state);
}

/** Search tiles in Manhattan radius around a center. */
function _tilesInRadius(grid, center, radius) {
  const candidates = [];
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (Math.abs(dx) + Math.abs(dz) > radius) continue;
      const ix = center.ix + dx;
      const iz = center.iz + dz;
      if (inBounds(ix, iz, grid) && getTile(grid, ix, iz) === TILE.GRASS) {
        candidates.push({ ix, iz });
      }
    }
  }
  return candidates;
}

/** Default: search near existing warehouses. */
function _defaultCandidates(state) {
  const warehouses = listTilesByType(state.grid, [TILE.WAREHOUSE]);
  if (warehouses.length === 0) return [];
  const all = [];
  for (const wh of warehouses) {
    all.push(..._tilesInRadius(state.grid, wh, HINT_SEARCH_RADIUS));
  }
  return _dedup(all);
}

/** Find candidate tiles in a directional quadrant from map center. */
function _directionalCandidates(grid, direction) {
  const cx = Math.floor(grid.width / 2);
  const cz = Math.floor(grid.height / 2);
  const candidates = [];
  const margin = 4;

  for (let iz = margin; iz < grid.height - margin; iz++) {
    for (let ix = margin; ix < grid.width - margin; ix++) {
      if (getTile(grid, ix, iz) !== TILE.GRASS) continue;
      const inQuadrant =
        (direction === "north" && iz < cz - 5) ||
        (direction === "south" && iz > cz + 5) ||
        (direction === "east" && ix > cx + 5) ||
        (direction === "west" && ix < cx - 5);
      if (inQuadrant) candidates.push({ ix, iz });
    }
  }
  // Limit to 50 closest to center to avoid huge candidate lists
  candidates.sort((a, b) =>
    (Math.abs(a.ix - cx) + Math.abs(a.iz - cz)) - (Math.abs(b.ix - cx) + Math.abs(b.iz - cz))
  );
  return candidates.slice(0, 50);
}

/** Find coverage gap — centroid of uncovered worksites. */
function _coverageGapCandidates(state) {
  const grid = state.grid;
  const worksites = listTilesByType(grid, [TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN]);
  const warehouses = listTilesByType(grid, [TILE.WAREHOUSE]);
  if (worksites.length === 0 || warehouses.length === 0) return _defaultCandidates(state);

  const uncovered = worksites.filter(ws =>
    Math.min(...warehouses.map(wh => Math.abs(ws.ix - wh.ix) + Math.abs(ws.iz - wh.iz))) > 10
  );
  if (uncovered.length === 0) return _defaultCandidates(state);

  const cx = Math.round(uncovered.reduce((s, t) => s + t.ix, 0) / uncovered.length);
  const cz = Math.round(uncovered.reduce((s, t) => s + t.iz, 0) / uncovered.length);
  return _tilesInRadius(grid, { ix: cx, iz: cz }, COVERAGE_GAP_SEARCH_RADIUS);
}

/** Defense line candidates: border tiles along a direction. */
function _defenseLineCandidates(grid, direction) {
  const candidates = [];
  const w = grid.width;
  const h = grid.height;

  if (direction === "north" || direction === "south") {
    const iz = direction === "north" ? 3 : h - 4;
    for (let ix = 2; ix < w - 2; ix++) {
      if (inBounds(ix, iz, grid) && getTile(grid, ix, iz) === TILE.GRASS) {
        candidates.push({ ix, iz });
      }
    }
  } else {
    const ix = direction === "west" ? 3 : w - 4;
    for (let iz = 2; iz < h - 2; iz++) {
      if (inBounds(ix, iz, grid) && getTile(grid, ix, iz) === TILE.GRASS) {
        candidates.push({ ix, iz });
      }
    }
  }
  return candidates;
}

/** High moisture tiles near existing infrastructure. */
function _highMoistureCandidates(grid, state) {
  const infra = listTilesByType(grid, [TILE.WAREHOUSE, TILE.ROAD, TILE.FARM, TILE.BRIDGE]);
  if (infra.length === 0 || !grid.moisture) return [];

  const seen = new Set();
  const candidates = [];
  for (const anchor of infra) {
    for (let dz = -8; dz <= 8; dz++) {
      for (let dx = -8; dx <= 8; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > 8) continue;
        const ix = anchor.ix + dx;
        const iz = anchor.iz + dz;
        const key = `${ix},${iz}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!inBounds(ix, iz, grid)) continue;
        if (getTile(grid, ix, iz) !== TILE.GRASS) continue;
        const idx = toIndex(ix, iz, grid.width);
        if ((grid.moisture[idx] ?? 0.5) > 0.5) {
          candidates.push({ ix, iz });
        }
      }
    }
  }
  return candidates;
}

function _dedup(tiles) {
  const seen = new Set();
  return tiles.filter(t => {
    const key = `${t.ix},${t.iz}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Demolish Candidate Resolution ────────────────────────────────────

/**
 * v0.8.4 (Agent B) — Resolve a demolish hint to a list of candidate tiles
 * that contain a built structure or RUINS. Unlike resolveLocationHint (which
 * filters for GRASS), this filter accepts the inverse: any tile in the
 * erase tool's allowedOldTypes EXCEPT GRASS / WATER.
 *
 * Hint forms:
 *   "<ix>,<iz>"          — explicit coord; returns [{ ix, iz }] if the tile
 *                          is built/RUINS, otherwise [].
 *   "ruins_cluster"      — RUINS tiles, sorted by adjacency to roads.
 *   "depleted_farm"      — FARM tiles with low yieldPool / salinized first.
 *   "depleted_producer"  — Any depleted producer (farm/lumber/quarry/herb).
 *   "blocking_road"      — Built tile adjacent to a road that breaks the chain.
 *   "auto" / null        — Best inferred target (RUINS first, then depleted).
 *
 * @param {string|null} hint
 * @param {object} state
 * @param {Map} groundedSteps — map of step.id → grounded tile (for near_step)
 * @returns {Array<{ ix:number, iz:number }>}
 */
function _resolveDemolishCandidates(hint, state, groundedSteps = new Map()) {
  const grid = state?.grid;
  if (!grid || !grid.tiles) return [];

  if (typeof hint === "string") {
    const m = hint.match(/^(\d+)\s*,\s*(\d+)$/);
    if (m) {
      const ix = parseInt(m[1], 10);
      const iz = parseInt(m[2], 10);
      if (!inBounds(ix, iz, grid)) return [];
      if (_isDemolishable(grid, ix, iz)) return [{ ix, iz }];
      return [];
    }
  }

  const keyword = (typeof hint === "string" && hint.length > 0) ? hint : "auto";

  if (keyword === "ruins_cluster") {
    return _rankDemolishRuins(state);
  }
  if (keyword === "depleted_farm") {
    return _rankDemolishProducers(state, [TILE.FARM]);
  }
  if (keyword === "depleted_producer") {
    return _rankDemolishProducers(state, [TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN]);
  }
  if (keyword === "blocking_road") {
    return _rankDemolishBlockingTiles(state);
  }
  // "auto" / unknown — RUINS first, then depleted producers, then any built.
  const ruins = _rankDemolishRuins(state);
  if (ruins.length > 0) return ruins;
  const depleted = _rankDemolishProducers(state, [TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN]);
  if (depleted.length > 0) return depleted;
  // Last resort: any built tile (excluding warehouses — too important).
  const out = [];
  const PROTECTED = new Set([TILE.WAREHOUSE, TILE.GRASS, TILE.WATER]);
  for (let iz = 0; iz < grid.height; iz++) {
    for (let ix = 0; ix < grid.width; ix++) {
      const tile = grid.tiles[toIndex(ix, iz, grid.width)];
      if (PROTECTED.has(tile)) continue;
      if (_isDemolishable(grid, ix, iz)) out.push({ ix, iz });
      if (out.length >= 20) break;
    }
    if (out.length >= 20) break;
  }
  return out;
}

/** Predicate: tile contains a built structure or RUINS (i.e. not GRASS / WATER). */
function _isDemolishable(grid, ix, iz) {
  if (!inBounds(ix, iz, grid)) return false;
  const tile = grid.tiles[toIndex(ix, iz, grid.width)];
  return tile !== TILE.GRASS && tile !== TILE.WATER;
}

/** Rank RUINS tiles: prefer adjacency to road / warehouse (clearing widens logistics). */
function _rankDemolishRuins(state) {
  const grid = state.grid;
  const ruins = listTilesByType(grid, [TILE.RUINS]);
  const ranked = ruins.map((r) => {
    let score = 0;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of dirs) {
      const nx = r.ix + dx;
      const nz = r.iz + dz;
      if (!inBounds(nx, nz, grid)) continue;
      const nType = grid.tiles[toIndex(nx, nz, grid.width)];
      if (nType === TILE.ROAD || nType === TILE.WAREHOUSE) score += 5;
    }
    return { ix: r.ix, iz: r.iz, score };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked.map(({ ix, iz }) => ({ ix, iz }));
}

/** Rank producer tiles by depletion (salinized first, then lowest yieldPool). */
function _rankDemolishProducers(state, tileTypes) {
  const grid = state.grid;
  const producers = listTilesByType(grid, tileTypes);
  const ranked = [];
  for (const p of producers) {
    const idx = toIndex(p.ix, p.iz, grid.width);
    const ts = grid.tileState && typeof grid.tileState.get === "function"
      ? grid.tileState.get(idx)
      : null;
    if (!ts) continue;
    const pool = Number(ts.yieldPool ?? Infinity);
    const salinized = Number(ts.salinized ?? 0) > 0;
    const fallowTicks = Number(ts.fallowTicks ?? 0);
    if (!(salinized || pool < 60 || fallowTicks > 2400)) continue;
    const score = salinized ? -1000 : pool - fallowTicks * 0.01;
    ranked.push({ ix: p.ix, iz: p.iz, score });
  }
  ranked.sort((a, b) => a.score - b.score);
  return ranked.map(({ ix, iz }) => ({ ix, iz }));
}

/** Find built tiles adjacent to a road that block the road's continuation. */
function _rankDemolishBlockingTiles(state) {
  const grid = state.grid;
  const out = [];
  const PROTECTED = new Set([TILE.WAREHOUSE, TILE.WATER, TILE.GRASS, TILE.ROAD, TILE.BRIDGE]);
  for (let iz = 0; iz < grid.height; iz++) {
    for (let ix = 0; ix < grid.width; ix++) {
      const tile = grid.tiles[toIndex(ix, iz, grid.width)];
      if (PROTECTED.has(tile)) continue;
      if (!_isDemolishable(grid, ix, iz)) continue;
      let roadAdj = 0;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dz] of dirs) {
        const nx = ix + dx;
        const nz = iz + dz;
        if (!inBounds(nx, nz, grid)) continue;
        const nType = grid.tiles[toIndex(nx, nz, grid.width)];
        if (nType === TILE.ROAD) roadAdj++;
      }
      if (roadAdj >= 2) out.push({ ix, iz });
    }
  }
  return out;
}

// ── Affordance Scoring (SayCan-inspired) ─────────────────────────────

/**
 * Compute an affordance score (0-1) for a build action given current resources.
 * 1.0 = can easily afford with buffer. 0.0 = cannot afford at all.
 * @param {object} resources
 * @param {object} cost — { wood: N, stone: N, ... }
 * @returns {number}
 */
export function computeAffordanceScore(resources, cost) {
  if (!cost || Object.keys(cost).length === 0) return 1;

  let minRatio = Infinity;
  for (const [res, needed] of Object.entries(cost)) {
    if (needed <= 0) continue;
    const have = resources[res] ?? 0;
    const ratio = have / needed;
    if (ratio < minRatio) minRatio = ratio;
  }

  if (minRatio === Infinity) return 1;
  if (minRatio < 1) return 0; // can't afford
  // Score: 1.0 at 2x resources, 0.5 at 1x exactly
  return Math.min(1, 0.5 + (minRatio - 1) * 0.5);
}

// ── Terrain Ranking ──────────────────────────────────────────────────

/**
 * Rank candidate tiles by terrain quality for a given building type.
 * Uses moisture and elevation with type-specific weights.
 * @param {Array<{ ix: number, iz: number }>} tiles
 * @param {string} buildType
 * @param {object} grid
 * @returns {Array<{ ix: number, iz: number, terrainScore: number }>}
 */
export function rankByTerrainQuality(tiles, buildType, grid) {
  const weights = TERRAIN_RANK_WEIGHTS[buildType] ?? { moisture: 0, elevation: 0 };

  const scored = tiles.map(tile => {
    const idx = toIndex(tile.ix, tile.iz, grid.width);
    const moisture = grid.moisture?.[idx] ?? 0.5;
    const elevation = grid.elevation?.[idx] ?? 0.5;
    const terrainScore = weights.moisture * moisture + weights.elevation * elevation + 0.5;
    return { ...tile, terrainScore: Math.max(0, Math.min(1, terrainScore)) };
  });

  scored.sort((a, b) => b.terrainScore - a.terrainScore);
  return scored;
}

// ── Plan Grounding ───────────────────────────────────────────────────

/**
 * Ground a single plan step — resolve location, check feasibility, rank tiles.
 * @param {object} step — { id, action: { type, hint, skill? }, depends_on, ... }
 * @param {object} state
 * @param {object} buildSystem
 * @param {Map} groundedSteps — previously grounded step tiles
 * @returns {object} — step with groundedTile, affordanceScore, feasible
 */
/** Building types that get enhanced placement analysis */
const ENHANCED_PLACEMENT_TYPES = new Set([
  "warehouse", "farm", "quarry", "herb_garden", "kitchen", "smithy", "clinic",
]);

export function groundPlanStep(step, state, buildSystem, groundedSteps = new Map(), services = null) {
  const action = step.action;

  // Skill expansion
  if (action.skill) {
    return _groundSkillStep(step, state, buildSystem, groundedSteps, services);
  }

  // v0.8.2 Round-5 Wave-1 (01b Step 5 + summary §5) — `reassign_role` is a
  // pseudo-action that carries no tile and no cost. Mark it trivially
  // feasible and let executeNextSteps detect the type and write the
  // fallbackHints.pendingRoleBoost signal.
  if (action.type === "reassign_role") {
    return {
      ...step,
      groundedTile: null,
      affordanceScore: 1,
      feasible: true,
      candidateCount: 0,
      feasibleCount: 0,
      placementDetails: null,
      status: "pending",
    };
  }

  // v0.8.4 Phase 11 (Agent D) — `recruit` action carries no tile and no
  // resource cost (RecruitmentSystem checks food at spawn time). Mark
  // trivially feasible so executeNextSteps detects the type and bumps
  // state.controls.recruitQueue by action.count.
  if (action.type === "recruit") {
    return {
      ...step,
      groundedTile: null,
      affordanceScore: 1,
      feasible: true,
      candidateCount: 0,
      feasibleCount: 0,
      placementDetails: null,
      status: "pending",
    };
  }

  // v0.8.4 (Agent B) — `demolish` action: ground to a tile that contains a
  // built structure or RUINS. Hints accept "<ix>,<iz>", whitelisted keywords
  // ("ruins_cluster" / "depleted_farm" / "depleted_producer" /
  // "blocking_road" / "auto"), or a fall-through to "auto" via
  // _resolveDemolishCandidates. The grounded tile is then validated via
  // `buildSystem.previewToolAt(state, "erase", ix, iz)` so we share the
  // same allowedOldTypes / RUINS-includes-GRASS rule the player UI uses.
  if (action.type === "demolish") {
    const cost = BALANCE.demolishToolCost ?? { wood: 1 };
    const affordanceScore = computeAffordanceScore(state.resources ?? {}, cost);
    const candidates = _resolveDemolishCandidates(action.hint, state, groundedSteps);
    const feasibleTiles = candidates.filter((tile) => {
      const preview = buildSystem.previewToolAt(state, "erase", tile.ix, tile.iz, services);
      return preview.ok;
    });
    const bestTile = feasibleTiles[0] ?? null;
    return {
      ...step,
      groundedTile: bestTile,
      affordanceScore,
      feasible: bestTile != null && affordanceScore > 0.5,
      candidateCount: candidates.length,
      feasibleCount: feasibleTiles.length,
      placementDetails: null,
      status: "pending",
    };
  }

  // Single build action
  const cost = BUILD_COST[action.type] ?? {};
  const affordanceScore = computeAffordanceScore(state.resources, cost);

  const candidates = resolveLocationHint(action.hint, state, groundedSteps);
  const feasibleTiles = candidates.filter(tile => {
    const preview = buildSystem.previewToolAt(state, action.type, tile.ix, tile.iz, services);
    return preview.ok;
  });

  let bestTile = null;
  let placementDetails = null;

  // Use enhanced placement analysis for key building types
  if (ENHANCED_PLACEMENT_TYPES.has(action.type) && feasibleTiles.length > 0) {
    const analyzed = analyzeCandidateTiles(feasibleTiles, action.type, state.grid, state);
    if (analyzed.length > 0) {
      bestTile = { ix: analyzed[0].ix, iz: analyzed[0].iz, terrainScore: analyzed[0].score };
      placementDetails = {
        topCandidates: analyzed.slice(0, 3).map(c => ({
          ix: c.ix, iz: c.iz, score: c.score, notes: c.notes,
        })),
      };
    }
  }

  // Fallback to basic terrain ranking for simple types
  if (!bestTile) {
    const ranked = rankByTerrainQuality(feasibleTiles, action.type, state.grid);
    bestTile = ranked[0] ?? null;
  }

  return {
    ...step,
    groundedTile: bestTile,
    affordanceScore,
    feasible: bestTile != null && affordanceScore > 0.5,
    candidateCount: candidates.length,
    feasibleCount: feasibleTiles.length,
    placementDetails,
    status: "pending",
  };
}

/** Ground a skill step — find best anchor, expand into sub-steps. */
function _groundSkillStep(step, state, buildSystem, groundedSteps, services = null) {
  const skillId = step.action.skill;
  const skill = SKILL_LIBRARY[skillId];
  if (!skill) {
    return { ...step, groundedTile: null, affordanceScore: 0, feasible: false, status: "failed" };
  }

  const candidates = resolveLocationHint(step.action.hint, state, groundedSteps);

  // Score each candidate anchor by terrain quality × feasibility
  let bestAnchor = null;
  let bestScore = -1;
  let bestFeasibility = null;

  // Limit candidate evaluation to avoid O(n²) explosion
  const evalLimit = Math.min(candidates.length, 30);
  for (let i = 0; i < evalLimit; i++) {
    const anchor = candidates[i];
    const terrainScore = scoreSkillTerrain(skillId, anchor, state.grid);
    const feasibility = assessSkillFeasibility(skillId, anchor, state.grid, buildSystem, state, services);
    const combinedScore = terrainScore * 0.3 + feasibility.ratio * 0.7;

    if (combinedScore > bestScore) {
      bestScore = combinedScore;
      bestAnchor = anchor;
      bestFeasibility = feasibility;
    }
  }

  if (!bestAnchor || bestScore <= 0) {
    return { ...step, groundedTile: null, affordanceScore: 0, feasible: false, status: "failed" };
  }

  // Expand skill into sub-steps
  const subSteps = bestFeasibility.steps.filter(s => s.feasible);

  return {
    ...step,
    groundedTile: bestAnchor,
    affordanceScore: computeAffordanceScore(state.resources, _skillTotalCost(skillId)),
    feasible: bestFeasibility.ratio >= 0.6, // at least 60% of steps must be feasible
    skillSubSteps: subSteps,
    skillFeasibility: bestFeasibility.ratio,
    status: "pending",
  };
}

function _skillTotalCost(skillId) {
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

// ── Plan Execution ───────────────────────────────────────────────────

/**
 * Ground an entire plan — resolve all steps with dependency-aware ordering.
 * @param {object} plan — { goal, steps: [...] }
 * @param {object} state
 * @param {object} buildSystem
 * @returns {object} — plan with grounded steps
 */
export function groundPlan(plan, state, buildSystem, services = null) {
  const groundedSteps = new Map();
  const grounded = [];

  // Sort steps by dependency order (topological)
  const ordered = _topologicalSort(plan.steps);

  for (const step of ordered) {
    const g = groundPlanStep(step, state, buildSystem, groundedSteps, services);
    if (g.groundedTile) {
      groundedSteps.set(step.id, g.groundedTile);
    }
    grounded.push(g);
  }

  return { ...plan, steps: grounded };
}

/**
 * Execute the next available steps in a grounded plan.
 * Respects dependencies and per-tick build limits.
 * @param {object} plan — grounded plan
 * @param {object} state
 * @param {object} buildSystem
 * @returns {Array<object>} — executed steps
 */
export function executeNextSteps(plan, state, buildSystem, services = null) {
  const executed = [];

  for (const step of plan.steps) {
    if (executed.length >= MAX_BUILDS_PER_TICK) break;
    if (step.status === "completed" || step.status === "failed") continue;

    // Check dependencies
    const depsComplete = (step.depends_on ?? []).every(depId =>
      plan.steps.find(s => s.id === depId)?.status === "completed"
    );
    if (!depsComplete) continue;

    // v0.8.2 Round-5 Wave-1 (01b Step 5) — `reassign_role` is a noop at the
    // construction layer. Emit the hint and mark the step completed so
    // progress accounting isn't blocked on a pseudo-step. We do NOT charge
    // resources and do NOT rebuild building stats.
    if (step.action.type === "reassign_role") {
      const role = typeof step.action.role === "string" ? step.action.role.toUpperCase() : null;
      if (role) {
        state.ai ??= {};
        state.ai.fallbackHints ??= {};
        if (role === "GUARD") {
          // v0.8.3 worker-vs-raider combat — GUARD promotion is counted, not
          // a single boost: each step bumps the requested guard count by 1.
          // RoleAssignmentSystem clamps to BALANCE.threatGuardCap.
          state.ai.fallbackHints.pendingGuardCount =
            Math.max(1, Number(state.ai.fallbackHints.pendingGuardCount ?? 0) + 1);
        } else {
          state.ai.fallbackHints.pendingRoleBoost = role;
        }
      }
      step.status = "completed";
      executed.push(step);
      continue;
    }

    // v0.8.4 Phase 11 (Agent D) — `recruit` increments
    // state.controls.recruitQueue by action.count, clamped to
    // BALANCE.recruitMaxQueueSize. Cost is paid at spawn time (not here).
    if (step.action.type === "recruit") {
      state.controls ??= {};
      const requested = Math.max(1, Math.min(10, Number(step.action.count ?? 1) | 0));
      const maxQueue = Number(BALANCE.recruitMaxQueueSize ?? 12);
      const before = Math.max(0, Number(state.controls.recruitQueue ?? 0) | 0);
      const after = Math.min(maxQueue, before + requested);
      state.controls.recruitQueue = after;
      step.status = "completed";
      step.actualEnqueued = after - before;
      state.metrics ??= {};
      state.metrics.recruitEnqueued = Math.max(0, Number(state.metrics.recruitEnqueued ?? 0)) + (after - before);
      executed.push(step);
      continue;
    }

    // v0.8.4 (Agent B) — `demolish` action: resolved into a built/RUINS tile
    // by groundPlanStep. Routes through buildSystem.placeToolAt with the
    // erase tool (Agent A's BuildSystem will redirect to the demolish-overlay
    // path once that lands; the legacy instant-erase path is exercised
    // until then). Cost is BALANCE.demolishToolCost (1 wood). We bump
    // state.metrics.demolishCount so the bench harness can chart how often
    // the AI uses this lever.
    if (step.action.type === "demolish") {
      const cost = BALANCE.demolishToolCost ?? { wood: 1 };
      if (!canAfford(state.resources ?? {}, cost)) {
        step.status = "waiting_resources";
        continue;
      }
      if (!step.groundedTile) {
        step.status = "failed";
        step.failureReason = "no_demolish_target";
        executed.push(step);
        continue;
      }
      const tile = step.groundedTile;
      const owner = step.owner ?? "ai-llm";
      const result = buildSystem.placeToolAt(
        state, "erase", tile.ix, tile.iz,
        { recordHistory: false, services, owner }
      );
      step.status = result.ok ? "completed" : "failed";
      step.actualTile = result.ok ? tile : null;
      if (result.ok) {
        state.buildings = rebuildBuildingStats(state.grid);
        state.metrics ??= {};
        state.metrics.demolishCount = Math.max(0, Number(state.metrics.demolishCount ?? 0)) + 1;
      } else {
        step.failureReason = result.reason ?? "demolish_failed";
      }
      executed.push(step);
      continue;
    }

    // Check affordability
    const cost = step.action.skill
      ? _skillTotalCost(step.action.skill)
      : (BUILD_COST[step.action.type] ?? {});
    if (!canAfford(state.resources ?? {}, cost)) {
      step.status = "waiting_resources";
      continue;
    }

    // Execute
    if (step.action.skill && step.skillSubSteps) {
      const result = _executeSkillSubSteps(step, state, buildSystem, services);
      step.status = result.placed > 0 ? "completed" : "failed";
      step.placedCount = result.placed;
      step.failedCount = result.failed;
    } else if (step.groundedTile) {
      const tile = step.groundedTile;
      const result = buildSystem.placeToolAt(
        state, step.action.type, tile.ix, tile.iz, { recordHistory: false, services }
      );
      step.status = result.ok ? "completed" : "failed";
      step.actualTile = result.ok ? tile : null;
      if (result.ok) {
        state.buildings = rebuildBuildingStats(state.grid);
      }
    } else {
      step.status = "failed";
    }

    executed.push(step);
  }

  return executed;
}

/** Execute a skill's sub-steps sequentially. */
function _executeSkillSubSteps(step, state, buildSystem, services = null) {
  let placed = 0;
  let failed = 0;

  for (const subStep of step.skillSubSteps) {
    const cost = BUILD_COST[subStep.type] ?? {};
    if (!canAfford(state.resources ?? {}, cost)) {
      failed++;
      continue;
    }

    const result = buildSystem.placeToolAt(
      state, subStep.type, subStep.ix, subStep.iz, { recordHistory: false, services }
    );
    if (result.ok) {
      state.buildings = rebuildBuildingStats(state.grid);
      placed++;
    } else {
      failed++;
    }
  }

  return { placed, failed };
}

// ── Plan Status Queries ──────────────────────────────────────────────

/**
 * Check if all plan steps are completed or failed.
 */
export function isPlanComplete(plan) {
  return plan.steps.every(s => s.status === "completed" || s.status === "failed");
}

/**
 * Check if a plan is blocked — no steps can make progress.
 */
export function isPlanBlocked(plan, state) {
  for (const step of plan.steps) {
    if (step.status === "completed" || step.status === "failed") continue;

    // Check dependencies
    const depsComplete = (step.depends_on ?? []).every(depId =>
      plan.steps.find(s => s.id === depId)?.status === "completed"
    );
    if (!depsComplete) continue;

    // v0.8.4 (Agent B) — `demolish` carries a tile and the small
    // BALANCE.demolishToolCost (1 wood). Treat it as making progress when
    // both are present.
    if (step.action.type === "demolish") {
      const dCost = BALANCE.demolishToolCost ?? { wood: 1 };
      if (canAfford(state.resources ?? {}, dCost) && step.groundedTile) {
        return false;
      }
      continue;
    }

    // If at least one unblocked step can afford its cost, plan is not blocked
    const cost = step.action.skill
      ? _skillTotalCost(step.action.skill)
      : (BUILD_COST[step.action.type] ?? {});
    if (canAfford(state.resources ?? {}, cost) && step.groundedTile) {
      return false;
    }
  }
  return true;
}

/**
 * Get a summary of plan execution progress.
 */
export function getPlanProgress(plan) {
  let completed = 0;
  let failed = 0;
  let pending = 0;
  let waiting = 0;

  for (const step of plan.steps) {
    if (step.status === "completed") completed++;
    else if (step.status === "failed") failed++;
    else if (step.status === "waiting_resources") waiting++;
    else pending++;
  }

  return {
    total: plan.steps.length,
    completed,
    failed,
    pending,
    waiting,
    ratio: plan.steps.length > 0 ? completed / plan.steps.length : 0,
  };
}

// ── Utilities ────────────────────────────────────────────────────────

/** Topological sort of steps by depends_on. */
function _topologicalSort(steps) {
  const byId = new Map(steps.map(s => [s.id, s]));
  const visited = new Set();
  const result = [];

  function visit(step) {
    if (visited.has(step.id)) return;
    visited.add(step.id);
    for (const depId of (step.depends_on ?? [])) {
      const dep = byId.get(depId);
      if (dep) visit(dep);
    }
    result.push(step);
  }

  for (const step of steps) visit(step);
  return result;
}
