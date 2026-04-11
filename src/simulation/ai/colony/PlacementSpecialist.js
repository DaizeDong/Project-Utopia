/**
 * PlacementSpecialist — LLM-powered precise building placement.
 *
 * For key buildings (warehouse, farm, smithy, kitchen, clinic, herb_garden),
 * generates a detailed candidate tile table and optionally calls an LLM to
 * choose the best placement with reasoning.
 *
 * For simple buildings (road, wall, bridge), falls back to algorithmic terrain ranking.
 *
 * Part of the Hierarchical Agent Planning system (P3).
 */

import { TILE, MOVE_DIRECTIONS_4 } from "../../../config/constants.js";
import { BUILD_COST, TERRAIN_MECHANICS } from "../../../config/balance.js";
import { inBounds, getTile, listTilesByType, toIndex } from "../../../world/grid/Grid.js";
import { callLLM } from "./ColonyPlanner.js";

// ── Constants ────────────────────────────────────────────────────────

/** Building types that warrant LLM placement (high strategic impact) */
const LLM_PLACEMENT_TYPES = new Set([
  "warehouse", "farm", "quarry", "herb_garden", "kitchen", "smithy", "clinic",
]);

/** Max candidate tiles to present to LLM */
const MAX_CANDIDATES = 8;

/** Max candidate tiles to evaluate for scoring */
const MAX_EVALUATE = 40;

const WAREHOUSE_COVERAGE_RADIUS = 12;

const PLACEMENT_SYSTEM_PROMPT = `You are a placement specialist for a colony simulation.
Given a building type and a list of candidate tiles with detailed terrain info,
choose the BEST tile and explain why. Return strict JSON only.

## Output Format
{
  "chosen_index": <number (0-based index in the candidate list)>,
  "reasoning": "why this tile is best (max 100 chars)",
  "confidence": <0.0-1.0>
}

## Placement Principles
- farm: high moisture = higher fertility cap; adjacent herb_gardens boost yield; avoid quarry adjacency
- quarry: keep away from farms (dust -fertility); higher elevation is fine
- herb_garden: place adjacent to farms for +fertility synergy; needs moisture > 0.4
- warehouse: spacing >= 5 from others; central to planned production area
- kitchen: adjacent to farms for compost bonus; needs food surplus nearby
- smithy: near quarry for stone access; elevation doesn't matter much
- clinic: near herb_garden for herb access; moderate moisture preferred
- Worker reachability: closer to workers = faster servicing
- Warehouse coverage: production buildings within 12 tiles of warehouse
- Season: during drought, avoid low-moisture tiles for farm/lumber (fire risk)
Valid JSON only, no commentary.`;

// ── Candidate Analysis ─────────────────────────────────────��────────

/**
 * Generate detailed candidate tile info for a building type.
 * @param {Array<{ ix: number, iz: number }>} candidates — pre-filtered grass tiles
 * @param {string} buildType — building type name
 * @param {object} grid — game grid
 * @param {object} state — full game state
 * @returns {Array<object>} scored candidate tiles with details
 */
export function analyzeCandidateTiles(candidates, buildType, grid, state) {
  const warehouseTiles = listTilesByType(grid, [TILE.WAREHOUSE]);
  const workers = (state.agents ?? []).filter(a => a.type === "WORKER" && a.alive !== false);

  // Precompute worker positions
  const workerPositions = workers.map(w => ({
    ix: Math.floor(w.x / (grid.tileSize ?? 1) + grid.width / 2),
    iz: Math.floor(w.z / (grid.tileSize ?? 1) + grid.height / 2),
  }));

  const analyzed = [];
  const limit = Math.min(candidates.length, MAX_EVALUATE);

  for (let i = 0; i < limit; i++) {
    const { ix, iz } = candidates[i];
    const idx = toIndex(ix, iz, grid.width);

    // Terrain data
    const moisture = grid.moisture ? (grid.moisture[idx] ?? 128) / 255 : 0.5;
    const elevation = grid.elevation ? (grid.elevation[idx] ?? 128) / 255 : 0.5;

    // Warehouse distance
    let minWhDist = Infinity;
    for (const wh of warehouseTiles) {
      const dist = Math.abs(ix - wh.ix) + Math.abs(iz - wh.iz);
      if (dist < minWhDist) minWhDist = dist;
    }
    const withinCoverage = minWhDist <= WAREHOUSE_COVERAGE_RADIUS;

    // Worker distance
    let minWorkerDist = Infinity;
    for (const wp of workerPositions) {
      const dist = Math.abs(ix - wp.ix) + Math.abs(iz - wp.iz);
      if (dist < minWorkerDist) minWorkerDist = dist;
    }

    // Adjacent building analysis
    const adjacentBuildings = [];
    for (const { dx, dz } of MOVE_DIRECTIONS_4) {
      const nx = ix + dx;
      const nz = iz + dz;
      if (!inBounds(nx, nz, grid)) continue;
      const nTile = grid.tiles[toIndex(nx, nz, grid.width)];
      if (nTile !== TILE.GRASS && nTile !== TILE.WATER) {
        const tileName = _tileIdToName(nTile);
        if (tileName) adjacentBuildings.push(tileName);
      }
    }

    // Compute composite score (used for pre-ranking)
    const score = _scoreTile(buildType, moisture, elevation, minWhDist, minWorkerDist, adjacentBuildings);

    // Notes (warnings/bonuses)
    const notes = [];
    if (!withinCoverage) notes.push("outside warehouse coverage!");
    if (moisture < TERRAIN_MECHANICS.fireMoistureThreshold && (buildType === "farm" || buildType === "lumber")) {
      notes.push("fire risk (low moisture)");
    }
    if (adjacentBuildings.includes("quarry") && (buildType === "farm" || buildType === "herb_garden")) {
      notes.push("quarry dust -fertility!");
    }
    if (adjacentBuildings.includes("herb_garden") && buildType === "farm") {
      notes.push("+fertility from herb_garden");
    }
    if (adjacentBuildings.includes("farm") && buildType === "herb_garden") {
      notes.push("+fertility synergy with farm");
    }
    if (adjacentBuildings.includes("farm") && buildType === "kitchen") {
      notes.push("+compost from adjacent farm");
    }
    if (elevation > 0.7 && buildType === "wall") {
      notes.push("+50% defense bonus");
    }
    // Fertility cap for farms
    if (buildType === "farm" || buildType === "herb_garden") {
      const fertCap = Math.min(1.0, moisture * TERRAIN_MECHANICS.moistureFertilityCap.scale + TERRAIN_MECHANICS.moistureFertilityCap.base);
      notes.push(`fert_cap=${fertCap.toFixed(2)}`);
    }

    analyzed.push({
      ix, iz,
      moisture: Math.round(moisture * 100) / 100,
      elevation: Math.round(elevation * 100) / 100,
      distToWarehouse: minWhDist === Infinity ? -1 : minWhDist,
      withinCoverage,
      distToWorker: minWorkerDist === Infinity ? -1 : Math.round(minWorkerDist),
      adjacentBuildings,
      notes,
      score: Math.round(score * 1000) / 1000,
    });
  }

  // Sort by score descending
  analyzed.sort((a, b) => b.score - a.score);
  return analyzed;
}

/**
 * Format candidate tiles as a text table for LLM consumption.
 * @param {Array<object>} candidates — from analyzeCandidateTiles
 * @param {string} buildType
 * @param {object} context — { strategy, season, weather }
 * @returns {string}
 */
export function formatCandidatesForLLM(candidates, buildType, context = {}) {
  const top = candidates.slice(0, MAX_CANDIDATES);
  const lines = [];

  lines.push(`Build: ${buildType} (cost: ${_formatCost(BUILD_COST[buildType])})`);
  if (context.strategyGoal) lines.push(`Strategy: ${context.strategyGoal}`);
  if (context.season) lines.push(`Season: ${context.season}${context.weather === "drought" ? " ⚠ DROUGHT active" : ""}`);
  lines.push("");
  lines.push("## Candidate Tiles (sorted by terrain score)");
  lines.push("| # | ix | iz | moisture | elevation | wh_dist | worker_dist | adjacent | notes |");
  lines.push("|---|----|----|----------|-----------|---------|-------------|----------|-------|");

  for (let i = 0; i < top.length; i++) {
    const c = top[i];
    const adj = c.adjacentBuildings.length > 0 ? c.adjacentBuildings.join(",") : "none";
    const noteStr = c.notes.length > 0 ? c.notes.join("; ") : "";
    lines.push(`| ${i} | ${c.ix} | ${c.iz} | ${c.moisture} | ${c.elevation} | ${c.distToWarehouse} | ${c.distToWorker} | ${adj} | ${noteStr} |`);
  }

  return lines.join("\n");
}

// ── PlacementSpecialist Class ───────────────────────────────────────

export class PlacementSpecialist {
  /**
   * @param {object} [options]
   * @param {string} [options.apiKey]
   * @param {string} [options.baseUrl]
   * @param {string} [options.model]
   * @param {boolean} [options.enableLLM=true] — set false to use algorithmic-only
   */
  constructor(options = {}) {
    this._apiKey = options.apiKey ?? null;
    this._baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this._model = options.model ?? "gpt-4o-mini";
    this._enableLLM = options.enableLLM !== false;
    this._stats = {
      llmCalls: 0,
      llmSuccesses: 0,
      fallbacks: 0,
    };
  }

  get stats() { return { ...this._stats }; }

  /**
   * Choose the best tile for a building from candidates.
   * Uses LLM for key buildings, algorithmic fallback for simple ones.
   *
   * @param {Array<{ ix: number, iz: number }>} candidates — pre-filtered buildable tiles
   * @param {string} buildType — building type name
   * @param {object} grid — game grid
   * @param {object} state — full game state
   * @returns {Promise<{ tile: { ix: number, iz: number } | null, source: "llm"|"algorithmic", reasoning: string }>}
   */
  async chooseTile(candidates, buildType, grid, state) {
    if (candidates.length === 0) {
      return { tile: null, source: "algorithmic", reasoning: "no candidates" };
    }

    const analyzed = analyzeCandidateTiles(candidates, buildType, grid, state);
    if (analyzed.length === 0) {
      return { tile: null, source: "algorithmic", reasoning: "no valid candidates after analysis" };
    }

    // For simple building types or when LLM is disabled, use top-scored tile
    if (!LLM_PLACEMENT_TYPES.has(buildType) || !this._enableLLM || !this._apiKey) {
      this._stats.fallbacks++;
      const best = analyzed[0];
      return { tile: { ix: best.ix, iz: best.iz }, source: "algorithmic", reasoning: `terrain score ${best.score}` };
    }

    // Build LLM prompt
    const context = {
      strategyGoal: state.ai?.strategy?.primaryGoal ?? "",
      season: state.weather?.season ?? null,
      weather: state.weather?.current ?? "clear",
    };
    const userPrompt = formatCandidatesForLLM(analyzed, buildType, context);

    this._stats.llmCalls++;
    const result = await callLLM(PLACEMENT_SYSTEM_PROMPT, userPrompt, {
      apiKey: this._apiKey,
      baseUrl: this._baseUrl,
      model: this._model,
      timeoutMs: 10000,
    });

    if (result.ok && result.data) {
      const chosen = result.data;
      const idx = Number(chosen.chosen_index);
      if (Number.isFinite(idx) && idx >= 0 && idx < analyzed.length) {
        this._stats.llmSuccesses++;
        const tile = analyzed[idx];
        return {
          tile: { ix: tile.ix, iz: tile.iz },
          source: "llm",
          reasoning: chosen.reasoning ?? "LLM choice",
        };
      }
    }

    // LLM failed — fallback to top-scored
    this._stats.fallbacks++;
    const best = analyzed[0];
    return { tile: { ix: best.ix, iz: best.iz }, source: "algorithmic", reasoning: `fallback: terrain score ${best.score}` };
  }
}

// ── Private Helpers ─────────────────────────────────────────────────

function _scoreTile(buildType, moisture, elevation, whDist, workerDist, adjacentBuildings) {
  let score = 0.5;

  // Moisture preference by type
  const moistureWeights = { farm: 1.0, herb_garden: 0.8, clinic: 0.4, kitchen: 0.3, lumber: 0.3, warehouse: 0.2, quarry: -0.1, wall: 0, smithy: 0 };
  score += (moistureWeights[buildType] ?? 0) * moisture;

  // Elevation preference
  const elevWeights = { farm: -0.3, herb_garden: -0.2, lumber: -0.2, quarry: 0.4, wall: 0.6, warehouse: -0.1, smithy: 0.2 };
  score += (elevWeights[buildType] ?? 0) * elevation;

  // Warehouse proximity (closer is better for production)
  if (whDist !== Infinity && whDist > 0) {
    const coverage = whDist <= WAREHOUSE_COVERAGE_RADIUS ? 1 : 0;
    score += coverage * 0.3;
    score -= (whDist / 24) * 0.1; // slight penalty for distance
  }

  // Worker proximity
  if (workerDist !== Infinity && workerDist > 0) {
    score += Math.max(0, 0.2 - workerDist * 0.01);
  }

  // Adjacency bonuses/penalties
  for (const adj of adjacentBuildings) {
    if (buildType === "farm" && adj === "herb_garden") score += 0.25;
    if (buildType === "herb_garden" && adj === "farm") score += 0.25;
    if (buildType === "kitchen" && adj === "farm") score += 0.15;
    if ((buildType === "farm" || buildType === "herb_garden") && adj === "quarry") score -= 0.3;
  }

  return Math.max(0, score);
}

function _tileIdToName(tileId) {
  const names = {
    [TILE.ROAD]: "road", [TILE.FARM]: "farm", [TILE.LUMBER]: "lumber",
    [TILE.WAREHOUSE]: "warehouse", [TILE.WALL]: "wall", [TILE.RUINS]: "ruins",
    [TILE.QUARRY]: "quarry", [TILE.HERB_GARDEN]: "herb_garden",
    [TILE.KITCHEN]: "kitchen", [TILE.SMITHY]: "smithy", [TILE.CLINIC]: "clinic",
    [TILE.BRIDGE]: "bridge",
  };
  return names[tileId] ?? null;
}

function _formatCost(cost) {
  if (!cost) return "free";
  return Object.entries(cost).map(([r, n]) => `${n} ${r}`).join(" + ");
}
