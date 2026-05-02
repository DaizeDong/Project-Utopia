/**
 * ColonyPerceiver — Builds a structured world model (observation) from raw game state.
 *
 * Part of the Agent-Based Colony Planning system (Phase 1).
 * Transforms raw game state into a compact, information-dense observation
 * optimized for downstream planning (LLM or algorithmic).
 *
 * Key capabilities:
 * - BFS-based infrastructure cluster detection from warehouses
 * - Sliding-window resource rate estimation with trend detection
 * - Expansion frontier analysis (directional grass availability + terrain quality)
 * - Workforce allocation summary
 * - Defense & threat assessment
 * - Weather/season context
 * - Objective progress tracking
 *
 * References:
 * - Inner Monologue [3] — grounded scene description
 * - SayCan [7] — affordance-aware observation
 */

import { TILE, MOVE_DIRECTIONS_4, DEFAULT_GRID, FOG_STATE, NODE_FLAGS } from "../../../config/constants.js";
import { BUILD_COST, WEATHER_MODIFIERS, BALANCE } from "../../../config/balance.js";
import { inBounds, getTile, listTilesByType, toIndex } from "../../../world/grid/Grid.js";
import { canAfford } from "../../construction/BuildAdvisor.js";
import { getScenarioRuntime } from "../../../world/scenarios/ScenarioFactory.js";
import { MIN_FOOD_FOR_GROWTH } from "../../population/PopulationGrowthSystem.js";

// ── v0.8.0 Phase 5 Patch constants ──────────────────────────────────────
// Match SimulationClock: dt ≈ 1/30, so 30 ticks per simulated second.
const TICKS_PER_SEC = 30;
// Population window for avgPopulationWindow (trailing buffer, seconds).
const POPULATION_WINDOW_SEC = 120;
// DevIndex saturation threshold: all dims above this → saturationIndicator = true.
const DEV_INDEX_SATURATION_DIM = 80;
// Depletion pessimistic drain rate (yieldPool/sec) per node-type for
// `nextExhaustionMinutes`. These are upper-bound estimates matching the
// per-harvest-tick debits in TileStateSystem (conservative → plans err early).
const PESSIMISTIC_DRAIN_PER_SEC = Object.freeze({
  forest: 0.6,
  stone: 0.4,
  herb: 0.3,
  farm: 0.8,
});

// ── Season definitions (must match WeatherSystem) ───────────────────────
const SEASON_DURATION = { spring: 60, summer: 60, autumn: 50, winter: 50 };
const SEASON_ORDER = ["spring", "summer", "autumn", "winter"];

// ── Constants ────────────────────────────────────────────────────────────

const CLUSTER_MAX_HOP = 12;
const RATE_WINDOW_SEC = 30;
const RATE_SAMPLE_INTERVAL_SEC = 2;
const MAX_RATE_SAMPLES = Math.ceil(RATE_WINDOW_SEC / RATE_SAMPLE_INTERVAL_SEC) + 1;
const FRONTIER_SCAN_DEPTH = 12;
const WAREHOUSE_COVERAGE_RADIUS = 12;

// ── Cluster Detection (BFS from warehouses) ─────────────────────────────

/**
 * Detect infrastructure clusters using BFS flood-fill from warehouses.
 * A cluster is a connected component of buildings reachable within
 * CLUSTER_MAX_HOP Manhattan steps along passable tiles.
 *
 * @param {object} grid
 * @param {Array} agents — worker agents
 * @returns {Array<object>} clusters with spatial summaries
 */
export function detectClusters(grid, agents = []) {
  const warehouseTiles = listTilesByType(grid, [TILE.WAREHOUSE]);
  if (warehouseTiles.length === 0) return [];

  const { width, height } = grid;
  const visited = new Uint8Array(width * height);
  const clusterIds = new Int16Array(width * height).fill(-1);
  const clusters = [];

  // Infrastructure tile types that belong to a cluster
  const INFRA_TYPES = new Set([
    TILE.ROAD, TILE.WAREHOUSE, TILE.FARM, TILE.LUMBER,
    TILE.QUARRY, TILE.HERB_GARDEN, TILE.KITCHEN, TILE.SMITHY,
    TILE.CLINIC, TILE.BRIDGE,
  ]);

  // BFS from each unvisited warehouse
  for (const wh of warehouseTiles) {
    const startIdx = toIndex(wh.ix, wh.iz, width);
    if (visited[startIdx]) continue;

    const clusterId = clusters.length;
    const cluster = {
      id: `cluster_${clusterId}`,
      warehouses: 0,
      farms: 0,
      lumbers: 0,
      quarries: 0,
      herbGardens: 0,
      kitchens: 0,
      smithies: 0,
      clinics: 0,
      roads: 0,
      walls: 0,
      bridges: 0,
      tiles: [],
      sumIx: 0,
      sumIz: 0,
      sumElevation: 0,
      sumMoisture: 0,
      tileCount: 0,
    };

    // BFS queue: [ix, iz, hops]
    const queue = [[wh.ix, wh.iz, 0]];
    visited[startIdx] = 1;
    clusterIds[startIdx] = clusterId;

    while (queue.length > 0) {
      const [ix, iz, hops] = queue.shift();
      const idx = toIndex(ix, iz, width);
      const tile = grid.tiles[idx];

      // Count building types
      if (tile === TILE.WAREHOUSE) cluster.warehouses++;
      else if (tile === TILE.FARM) cluster.farms++;
      else if (tile === TILE.LUMBER) cluster.lumbers++;
      else if (tile === TILE.QUARRY) cluster.quarries++;
      else if (tile === TILE.HERB_GARDEN) cluster.herbGardens++;
      else if (tile === TILE.KITCHEN) cluster.kitchens++;
      else if (tile === TILE.SMITHY) cluster.smithies++;
      else if (tile === TILE.CLINIC) cluster.clinics++;
      else if (tile === TILE.ROAD) cluster.roads++;
      else if (tile === TILE.WALL) cluster.walls++;
      else if (tile === TILE.BRIDGE) cluster.bridges++;

      cluster.tiles.push({ ix, iz });
      cluster.sumIx += ix;
      cluster.sumIz += iz;
      cluster.sumElevation += (grid.elevation?.[idx] ?? 128) / 255;
      cluster.sumMoisture += (grid.moisture?.[idx] ?? 128) / 255;
      cluster.tileCount++;

      if (hops >= CLUSTER_MAX_HOP) continue;

      // Expand to 4-neighbors
      for (const { dx, dz } of MOVE_DIRECTIONS_4) {
        const nx = ix + dx;
        const nz = iz + dz;
        if (!inBounds(nx, nz, grid)) continue;
        const nIdx = toIndex(nx, nz, width);
        if (visited[nIdx]) continue;
        const nTile = grid.tiles[nIdx];
        // Only follow infrastructure and passable tiles (not walls/water)
        if (!INFRA_TYPES.has(nTile) && nTile !== TILE.GRASS) continue;
        // Only include non-grass tiles in the cluster, but traverse through grass
        visited[nIdx] = 1;
        clusterIds[nIdx] = clusterId;
        if (INFRA_TYPES.has(nTile) || nTile === TILE.WALL) {
          queue.push([nx, nz, hops + 1]);
        } else {
          // Grass: allow traversal but don't expand further from grass
          queue.push([nx, nz, hops + 1]);
        }
      }
    }

    clusters.push(cluster);
  }

  // Merge overlapping clusters (shared tiles via later BFS waves)
  // Already handled by the visited array — first warehouse claims the cluster

  // Compute final cluster summaries
  const workerPositions = agents
    .filter(a => a.type === "WORKER" && a.alive !== false)
    .map(a => ({
      ix: Math.floor(a.x / (grid.tileSize ?? 1) + width / 2),
      iz: Math.floor(a.z / (grid.tileSize ?? 1) + height / 2),
    }));

  return clusters.map(c => {
    const center = {
      ix: c.tileCount > 0 ? Math.round(c.sumIx / c.tileCount) : 0,
      iz: c.tileCount > 0 ? Math.round(c.sumIz / c.tileCount) : 0,
    };

    // v0.8.7.1 P4 — compute cluster bounding box once. Worker coverage check
    // first rejects against cluster bbox (+ 3-tile margin) before the inner
    // tile-vs-worker scan, replacing an O(W × T) per-cluster scan with the
    // bbox reject for distant workers.
    let bboxMinIx = Infinity, bboxMinIz = Infinity;
    let bboxMaxIx = -Infinity, bboxMaxIz = -Infinity;
    for (const t of c.tiles) {
      if (t.ix < bboxMinIx) bboxMinIx = t.ix;
      if (t.ix > bboxMaxIx) bboxMaxIx = t.ix;
      if (t.iz < bboxMinIz) bboxMinIz = t.iz;
      if (t.iz > bboxMaxIz) bboxMaxIz = t.iz;
    }

    // Count workers within cluster coverage. bbox reject (+3 margin) skips
    // most distant workers before the inner tile scan.
    let workerCount = 0;
    for (const w of workerPositions) {
      if (w.ix < bboxMinIx - 3 || w.ix > bboxMaxIx + 3
          || w.iz < bboxMinIz - 3 || w.iz > bboxMaxIz + 3) continue;
      let nearAny = false;
      for (const t of c.tiles) {
        if (Math.abs(w.ix - t.ix) + Math.abs(w.iz - t.iz) <= 3) { nearAny = true; break; }
      }
      if (nearAny) workerCount += 1;
    }

    // Compute warehouse coverage ratio (production tiles within WAREHOUSE_COVERAGE_RADIUS of a warehouse)
    const prodTiles = c.tiles.filter(t => {
      const idx = toIndex(t.ix, t.iz, width);
      const tt = grid.tiles[idx];
      return tt === TILE.FARM || tt === TILE.LUMBER || tt === TILE.QUARRY || tt === TILE.HERB_GARDEN;
    });
    const whTiles = c.tiles.filter(t => grid.tiles[toIndex(t.ix, t.iz, width)] === TILE.WAREHOUSE);
    let covered = 0;
    let totalDist = 0;
    let distCount = 0;
    for (const pt of prodTiles) {
      if (whTiles.length === 0) break;
      // Single pass: track min distance for both coverage + avg dist.
      let minDist = Infinity;
      for (const w of whTiles) {
        const d = Math.abs(w.ix - pt.ix) + Math.abs(w.iz - pt.iz);
        if (d < minDist) minDist = d;
        if (minDist === 0) break;
      }
      if (minDist <= WAREHOUSE_COVERAGE_RADIUS) covered++;
      totalDist += minDist;
      distCount++;
    }
    const coverageRatio = prodTiles.length > 0 ? covered / prodTiles.length : 1.0;

    return {
      id: c.id,
      center,
      warehouses: c.warehouses,
      farms: c.farms,
      lumbers: c.lumbers,
      quarries: c.quarries,
      herbGardens: c.herbGardens,
      kitchens: c.kitchens,
      smithies: c.smithies,
      clinics: c.clinics,
      roads: c.roads,
      walls: c.walls,
      bridges: c.bridges,
      workerCount,
      coverageRatio: Math.round(coverageRatio * 100) / 100,
      avgWarehouseDistance: distCount > 0 ? Math.round(totalDist / distCount * 10) / 10 : 0,
      avgElevation: c.tileCount > 0 ? Math.round(c.sumElevation / c.tileCount * 100) / 100 : 0.5,
      avgMoisture: c.tileCount > 0 ? Math.round(c.sumMoisture / c.tileCount * 100) / 100 : 0.5,
      tileCount: c.tileCount,
    };
  });
}

// ── Resource Rate Estimation ─────────────────────────────────────────────

/**
 * Sliding-window resource rate estimator.
 * Tracks resource values at regular intervals and computes rate via linear regression.
 */
export class ResourceRateTracker {
  constructor() {
    /** @type {Map<string, Array<{t: number, v: number}>>} */
    this._samples = new Map();
    this._lastSampleSec = -Infinity;
  }

  /**
   * Record a resource snapshot if enough time has passed.
   * @param {number} timeSec
   * @param {object} resources — { food, wood, stone, herbs, meals, tools, medicine }
   */
  sample(timeSec, resources) {
    if (timeSec - this._lastSampleSec < RATE_SAMPLE_INTERVAL_SEC) return;
    this._lastSampleSec = timeSec;

    for (const [key, value] of Object.entries(resources)) {
      const v = Number(value) || 0;
      let arr = this._samples.get(key);
      if (!arr) {
        arr = [];
        this._samples.set(key, arr);
      }
      arr.push({ t: timeSec, v });
      // Trim to window
      while (arr.length > MAX_RATE_SAMPLES) arr.shift();
    }
  }

  /**
   * Compute rate (units/sec) for a resource via linear regression.
   * @param {string} key — resource name
   * @returns {{ rate: number, trend: string, projectedZeroSec: number|null }}
   */
  getRate(key) {
    const arr = this._samples.get(key);
    if (!arr || arr.length < 2) return { rate: 0, trend: "unknown", projectedZeroSec: null };

    // Simple linear regression: rate = Σ((t-t̄)(v-v̄)) / Σ((t-t̄)²)
    const n = arr.length;
    let sumT = 0, sumV = 0;
    for (const s of arr) { sumT += s.t; sumV += s.v; }
    const meanT = sumT / n;
    const meanV = sumV / n;

    let num = 0, den = 0;
    for (const s of arr) {
      const dt = s.t - meanT;
      num += dt * (s.v - meanV);
      den += dt * dt;
    }
    const rate = den > 0 ? num / den : 0;
    const roundedRate = Math.round(rate * 100) / 100;

    // Trend
    let trend = "stable";
    if (roundedRate > 0.1) trend = "rising";
    else if (roundedRate < -0.1) trend = "declining";

    // Project time to zero
    let projectedZeroSec = null;
    if (rate < -0.01) {
      const currentV = arr[arr.length - 1].v;
      if (currentV > 0) {
        projectedZeroSec = Math.round(currentV / Math.abs(rate));
      }
    }

    return { rate: roundedRate, trend, projectedZeroSec };
  }

  /**
   * Get rates for all tracked resources.
   * @returns {object} keyed by resource name
   */
  getAllRates() {
    const result = {};
    for (const key of this._samples.keys()) {
      result[key] = this.getRate(key);
    }
    return result;
  }
}

// ── Expansion Frontier Analysis ──────────────────────────────────────────

/**
 * Analyze potential expansion directions from colony center.
 * Divides the map into quadrants and scores available grass, moisture, elevation.
 *
 * @param {object} grid
 * @param {Array<object>} clusters
 * @returns {Array<object>} frontiers sorted by desirability
 */
export function analyzeExpansionFrontiers(grid, clusters) {
  if (clusters.length === 0) return [];

  const { width, height } = grid;

  // Find colony centroid across all clusters
  let totalIx = 0, totalIz = 0, totalWeight = 0;
  for (const c of clusters) {
    const w = c.warehouses + 1;
    totalIx += c.center.ix * w;
    totalIz += c.center.iz * w;
    totalWeight += w;
  }
  const cx = Math.round(totalIx / totalWeight);
  const cz = Math.round(totalIz / totalWeight);

  // Quadrant definitions
  const directions = [
    { name: "north", filter: (ix, iz) => iz < cz - 2 },
    { name: "south", filter: (ix, iz) => iz > cz + 2 },
    { name: "east", filter: (ix, iz) => ix > cx + 2 },
    { name: "west", filter: (ix, iz) => ix < cx - 2 },
  ];

  // Scan edges of current infrastructure
  const frontiers = [];
  for (const dir of directions) {
    let grassCount = 0;
    let totalMoisture = 0;
    let totalElevation = 0;
    let scanned = 0;

    // Scan a band in each direction from colony center
    const scanRange = FRONTIER_SCAN_DEPTH;
    for (let iz = Math.max(0, cz - scanRange); iz < Math.min(height, cz + scanRange); iz++) {
      for (let ix = Math.max(0, cx - scanRange); ix < Math.min(width, cx + scanRange); ix++) {
        if (!dir.filter(ix, iz)) continue;
        const idx = toIndex(ix, iz, width);
        const tile = grid.tiles[idx];
        scanned++;
        if (tile === TILE.GRASS || tile === TILE.RUINS) {
          grassCount++;
          totalMoisture += (grid.moisture?.[idx] ?? 128) / 255;
          totalElevation += (grid.elevation?.[idx] ?? 128) / 255;
        }
      }
    }

    if (scanned === 0) continue;
    frontiers.push({
      direction: dir.name,
      availableGrass: grassCount,
      avgMoisture: grassCount > 0 ? Math.round(totalMoisture / grassCount * 100) / 100 : 0,
      avgElevation: grassCount > 0 ? Math.round(totalElevation / grassCount * 100) / 100 : 0.5,
      density: Math.round(grassCount / scanned * 100) / 100,
    });
  }

  // Sort by desirability: more grass with higher moisture is better
  frontiers.sort((a, b) => {
    const scoreA = a.availableGrass * (0.5 + a.avgMoisture * 0.5);
    const scoreB = b.availableGrass * (0.5 + b.avgMoisture * 0.5);
    return scoreB - scoreA;
  });

  return frontiers;
}

// ── Affordance Scoring ───────────────────────────────────────────────────

/**
 * Compute which building types are currently affordable.
 * Returns a map of type → boolean.
 * @param {object} resources
 * @returns {object}
 */
export function computeAffordability(resources) {
  const result = {};
  for (const [type, cost] of Object.entries(BUILD_COST)) {
    if (type === "erase") continue;
    result[type] = canAfford(resources, cost);
  }
  return result;
}

// ── Resource Chain Analysis ──────────────────────────────────────────────

/**
 * Analyze the status and ROI of each resource processing chain.
 * Provides structured chain information for LLM decision-making.
 * @param {object} state — game state
 * @returns {Array<object>} chain status objects
 */
export function analyzeResourceChains(state) {
  const buildings = state.buildings ?? {};
  const resources = state.resources ?? {};
  const chains = [];

  // FOOD CHAIN: farm → kitchen → meals
  const farms = buildings.farms ?? 0;
  const kitchens = buildings.kitchens ?? 0;
  const foodChain = {
    name: "food",
    stages: [
      { building: "farm", count: farms, status: farms > 0 ? "active" : "missing", cost: "5w" },
      { building: "kitchen", count: kitchens, status: kitchens > 0 ? "active" : (farms >= 6 ? "ready" : "blocked"), cost: "8w+3s", prereq: "6+ farms and food surplus" },
    ],
    bottleneck: null,
    nextAction: null,
  };
  if (farms === 0) { foodChain.bottleneck = "no farms"; foodChain.nextAction = "build farm (5w)"; }
  else if (farms < 6 && kitchens === 0) { foodChain.bottleneck = `only ${farms} farms (need 6 for kitchen)`; foodChain.nextAction = "build more farms"; }
  else if (kitchens === 0 && farms >= 6) { foodChain.bottleneck = "no kitchen"; foodChain.nextAction = "build kitchen (8w+3s) — converts food→meals at 2x efficiency"; }
  chains.push(foodChain);

  // TOOL CHAIN: quarry → smithy → tools → +15% all production
  const quarries = buildings.quarries ?? 0;
  const smithies = buildings.smithies ?? 0;
  const tools = resources.tools ?? 0;
  const toolChain = {
    name: "tools",
    stages: [
      { building: "quarry", count: quarries, status: quarries > 0 ? "active" : "missing", cost: "6w" },
      { building: "smithy", count: smithies, status: smithies > 0 ? "active" : (quarries > 0 ? "ready" : "blocked"), cost: "6w+5s", prereq: "stable stone income" },
    ],
    bottleneck: null,
    nextAction: null,
    impact: `tools boost ALL harvest +${Math.round(BALANCE.toolHarvestSpeedBonus * 100)}% (current tools: ${Math.round(tools)})`,
  };
  if (quarries === 0) { toolChain.bottleneck = "no quarry"; toolChain.nextAction = "build quarry (6w) — stone income enables smithy"; }
  else if (smithies === 0) { toolChain.bottleneck = "no smithy"; toolChain.nextAction = `build smithy (6w+5s) — unlocks tools for +${Math.round(BALANCE.toolHarvestSpeedBonus * 100)}% production`; }
  chains.push(toolChain);

  // MEDICAL CHAIN: herb_garden → clinic → medicine → lower mortality
  const herbGardens = buildings.herbGardens ?? 0;
  const clinics = buildings.clinics ?? 0;
  const medChain = {
    name: "medical",
    stages: [
      { building: "herb_garden", count: herbGardens, status: herbGardens > 0 ? "active" : "missing", cost: "4w" },
      { building: "clinic", count: clinics, status: clinics > 0 ? "active" : (herbGardens > 0 ? "ready" : "blocked"), cost: "6w+4h", prereq: "herb surplus" },
    ],
    bottleneck: null,
    nextAction: null,
  };
  if (herbGardens === 0) { medChain.bottleneck = "no herb_garden"; medChain.nextAction = "build herb_garden (4w) — herbs enable clinic"; }
  else if (clinics === 0) { medChain.bottleneck = "no clinic"; medChain.nextAction = "build clinic (6w+4h) — medicine reduces colonist mortality"; }
  chains.push(medChain);

  return chains;
}

// v0.8.2 Round-5 Wave-2 (02b-casual Step 1): HUD-facing adapter that
// flattens `analyzeResourceChains` plus the raw-input chains (wood,
// stone, herbs) into a per-resource `{ bottleneck, nextAction, severity }`
// shape. Consumed by HUDController's 7 resource rate badges so a
// `0.0/min` value gains a tooltip such as "no lumber mill yet — build
// lumber (5w)" instead of being an opaque number.
//
// Uses `state.metrics.populationStats` (cooks/smiths/herbalists/loggers/
// miners/farmers/haulers) where available; guards all reads with `?? 0`
// so headless test fixtures and pre-first-tick states render cleanly.

/**
 * Produce a per-resource stall report for casual-profile HUD tooltips.
 * @param {object} state - Game state.
 * @returns {{
 *   food: {bottleneck: string|null, nextAction: string|null, severity: "stalled"|"slow"|"ok"},
 *   wood: {bottleneck: string|null, nextAction: string|null, severity: string},
 *   stone: {bottleneck: string|null, nextAction: string|null, severity: string},
 *   herbs: {bottleneck: string|null, nextAction: string|null, severity: string},
 *   meals: {bottleneck: string|null, nextAction: string|null, severity: string},
 *   tools: {bottleneck: string|null, nextAction: string|null, severity: string},
 *   medicine: {bottleneck: string|null, nextAction: string|null, severity: string},
 * }}
 */
export function getResourceChainStall(state) {
  const buildings = state?.buildings ?? {};
  const pop = state?.metrics?.populationStats ?? {};
  const rates = state?.metrics?.resourceRates ?? state?.metrics?.perMinRates ?? {};

  const loggerCount = Number(pop.loggers ?? 0);
  const minerCount = Number(pop.stoneMiners ?? pop.miners ?? 0);
  const gathererCount = Number(pop.herbGatherers ?? pop.herbalistsRaw ?? 0);
  const farmerCount = Number(pop.farmers ?? 0);
  const cookCount = Number(pop.cooks ?? 0);
  const smithCount = Number(pop.smiths ?? 0);
  const herbalistCount = Number(pop.herbalists ?? 0);

  const lumbers = Number(buildings.lumbers ?? 0);
  const quarries = Number(buildings.quarries ?? 0);
  const herbGardens = Number(buildings.herbGardens ?? 0);
  const farms = Number(buildings.farms ?? 0);
  const kitchens = Number(buildings.kitchens ?? 0);
  const smithies = Number(buildings.smithies ?? 0);
  const clinics = Number(buildings.clinics ?? 0);

  // Build per-chain records. Severity defaults to "ok" when a positive
  // rate is observed; otherwise we classify "stalled" (source missing)
  // or "slow" (source exists but no assigned worker).
  const makeEntry = (bottleneck, nextAction, severity = "ok") => ({
    bottleneck: bottleneck ?? null,
    nextAction: nextAction ?? null,
    severity,
  });

  // FOOD — delegate to analyzeResourceChains for farm/kitchen staging.
  const chains = analyzeResourceChains(state);
  const foodChain = chains.find((c) => c.name === "food") ?? {};
  let foodEntry = makeEntry(null, null, "ok");
  if (foodChain.bottleneck) {
    foodEntry = makeEntry(foodChain.bottleneck, foodChain.nextAction, "stalled");
  } else if (farms > 0 && farmerCount === 0) {
    foodEntry = makeEntry("no farmers assigned", "raise worker count or farmRatio slider", "slow");
  }

  // WOOD — lumber mill → loggers → warehouse.
  let woodEntry = makeEntry(null, null, "ok");
  if (lumbers === 0) {
    woodEntry = makeEntry("no lumber mill yet", "build lumber (5w)", "stalled");
  } else if (loggerCount === 0) {
    woodEntry = makeEntry("no loggers assigned", "raise wood quota in Management", "slow");
  }

  // STONE — quarry → stone miners → warehouse.
  let stoneEntry = makeEntry(null, null, "ok");
  if (quarries === 0) {
    stoneEntry = makeEntry("no quarry yet", "build quarry (6w)", "stalled");
  } else if (minerCount === 0) {
    stoneEntry = makeEntry("no stone miners assigned", "raise stone quota in Management", "slow");
  }

  // HERBS — herb_garden → herb gatherers → warehouse.
  let herbsEntry = makeEntry(null, null, "ok");
  if (herbGardens === 0) {
    herbsEntry = makeEntry("no herb garden yet", "build herb_garden (4w)", "stalled");
  } else if (gathererCount === 0) {
    herbsEntry = makeEntry("no herb gatherers assigned", "raise herbs quota in Management", "slow");
  }

  // MEALS — kitchen + cook produce from food.
  let mealsEntry = makeEntry(null, null, "ok");
  if (kitchens === 0) {
    mealsEntry = makeEntry("no kitchen yet", "build kitchen (8w+3s)", "stalled");
  } else if (cookCount === 0) {
    mealsEntry = makeEntry("no cooks assigned", "raise cook quota in Management", "slow");
  }

  // TOOLS — smithy + smith produce from wood+stone.
  let toolsEntry = makeEntry(null, null, "ok");
  if (smithies === 0) {
    toolsEntry = makeEntry("no smithy yet", "build smithy (6w+5s)", "stalled");
  } else if (smithCount === 0) {
    toolsEntry = makeEntry("no smiths assigned", "raise smith quota in Management", "slow");
  }

  // MEDICINE — clinic + herbalist produce from herbs.
  let medicineEntry = makeEntry(null, null, "ok");
  if (clinics === 0) {
    medicineEntry = makeEntry("no clinic yet", "build clinic (6w+4h)", "stalled");
  } else if (herbalistCount === 0) {
    medicineEntry = makeEntry("no herbalists assigned", "raise herbalist quota in Management", "slow");
  }

  return {
    food: foodEntry,
    wood: woodEntry,
    stone: stoneEntry,
    herbs: herbsEntry,
    meals: mealsEntry,
    tools: toolsEntry,
    medicine: medicineEntry,
  };
}

/**
 * Forecast the impact of current and upcoming seasons.
 * @param {object} weather — state.weather
 * @returns {object} forecast with current + next season info
 */
export function forecastSeasonImpact(weather) {
  if (!weather || !weather.season) return null;

  const current = weather.season;
  const progress = weather.seasonProgress ?? 0;
  const currentIdx = SEASON_ORDER.indexOf(current);
  const nextIdx = (currentIdx + 1) % 4;
  const nextSeason = SEASON_ORDER[nextIdx];
  const currentDuration = SEASON_DURATION[current] ?? 55;
  const remainingSec = Math.round(currentDuration * (1 - progress));

  const impacts = {
    spring: { farmMod: "normal", lumberMod: "normal", risk: "none", advice: "favorable for farming" },
    summer: { farmMod: "drought risk -45%", lumberMod: "normal", risk: "drought + fire on low-moisture tiles", advice: "stockpile food, avoid low-moisture lumber" },
    autumn: { farmMod: "normal", lumberMod: "normal", risk: "storms possible", advice: "good expansion window" },
    winter: { farmMod: "-35%", lumberMod: "-15%", risk: "reduced production", advice: "ensure food reserves before winter" },
  };

  return {
    current,
    currentProgress: Math.round(progress * 100),
    remainingSec,
    next: nextSeason,
    nextInSec: remainingSec,
    currentImpact: impacts[current],
    nextImpact: impacts[nextSeason],
    weatherNow: weather.current ?? "clear",
    weatherRemaining: Math.round(weather.timeLeftSec ?? 0),
  };
}

/**
 * Summarize recent plan history for LLM context.
 * @param {Array} planHistory — from agentDirector state
 * @param {number} maxEntries — max entries to include
 * @returns {object} summary with patterns
 */
export function summarizePlanHistory(planHistory, maxEntries = 5) {
  if (!planHistory || planHistory.length === 0) return null;

  const recent = planHistory.slice(-maxEntries);
  const total = planHistory.length;
  const successes = planHistory.filter(p => p.success).length;
  const avgScore = planHistory.reduce((a, p) => a + (p.score ?? 0), 0) / total;

  // Detect patterns
  const failReasons = {};
  for (const p of planHistory) {
    if (!p.success && p.failReason) {
      failReasons[p.failReason] = (failReasons[p.failReason] ?? 0) + 1;
    }
  }
  const topFailReason = Object.entries(failReasons).sort((a, b) => b[1] - a[1])[0];

  return {
    recent,
    totalPlans: total,
    successRate: Math.round(successes / total * 100),
    avgScore: Math.round(avgScore * 100) / 100,
    topFailReason: topFailReason ? `${topFailReason[0]} (${topFailReason[1]}x)` : null,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// v0.8.0 Phase 5 — Patches 1-7: M1–M4 perception extensions
// ══════════════════════════════════════════════════════════════════════════

// PRODUCER_TILE_SET — tiles that count toward warehouse-density saturation
// (mirrors the set used by ResourceSystem when computing the density metric).
const PRODUCER_TILE_SET = new Set([
  TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN,
  TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC,
]);

/**
 * Patch 1 — Tile-state sampling.
 * Walks grid.tileState once and emits aggregate counters the planner can
 * use for depletion/soil-health decisions.
 * @param {object} grid
 * @returns {{salinizedCount:number, fallowCount:number, depletedTileCount:number,
 *   avgYieldPool:{farm:number, lumber:number, quarry:number, herb:number}}}
 */
export function sampleTileStateAggregates(grid) {
  const out = {
    salinizedCount: 0,
    fallowCount: 0,
    depletedTileCount: 0,
    avgYieldPool: { farm: 0, lumber: 0, quarry: 0, herb: 0 },
  };
  if (!grid?.tileState) return out;

  const sums = { farm: 0, lumber: 0, quarry: 0, herb: 0 };
  const counts = { farm: 0, lumber: 0, quarry: 0, herb: 0 };
  const width = grid.width;

  for (const [idx, entry] of grid.tileState) {
    if (!entry) continue;
    if ((entry.salinized ?? 0) > 0) out.salinizedCount++;
    if ((entry.fallowUntil ?? 0) > 0) out.fallowCount++;
    const pool = Number(entry.yieldPool ?? 0);
    if (pool <= 0) out.depletedTileCount++;

    // Categorize by tile type for avg pool
    const tile = grid.tiles?.[idx];
    if (tile === TILE.FARM) {
      sums.farm += pool;
      counts.farm++;
    } else if (tile === TILE.LUMBER) {
      sums.lumber += pool;
      counts.lumber++;
    } else if (tile === TILE.QUARRY) {
      sums.quarry += pool;
      counts.quarry++;
    } else if (tile === TILE.HERB_GARDEN) {
      sums.herb += pool;
      counts.herb++;
    }
  }

  out.avgYieldPool.farm = counts.farm > 0 ? Math.round(sums.farm / counts.farm * 10) / 10 : 0;
  out.avgYieldPool.lumber = counts.lumber > 0 ? Math.round(sums.lumber / counts.lumber * 10) / 10 : 0;
  out.avgYieldPool.quarry = counts.quarry > 0 ? Math.round(sums.quarry / counts.quarry * 10) / 10 : 0;
  out.avgYieldPool.herb = counts.herb > 0 ? Math.round(sums.herb / counts.herb * 10) / 10 : 0;
  return out;
}

/**
 * Patch 2 — Warehouse density sampling.
 * For each WAREHOUSE tile, count producer-type tiles inside the density
 * radius; emit the max and a boolean risk indicator. Radius and threshold
 * fall back to sensible defaults when balance keys are absent.
 * @param {object} grid
 * @returns {{maxWarehouseDensity:number, densityRiskActive:boolean, perWarehouse:Array}}
 */
export function sampleWarehouseDensity(grid) {
  const radius = Number(BALANCE.warehouseDensityRadius ?? 6);
  const threshold = Number(BALANCE.warehouseDensityRiskThreshold ?? 400);
  const warehouses = listTilesByType(grid, [TILE.WAREHOUSE]);
  let max = 0;
  const per = [];

  for (const wh of warehouses) {
    let count = 0;
    // Box scan inside Manhattan-radius
    const x0 = Math.max(0, wh.ix - radius);
    const x1 = Math.min(grid.width - 1, wh.ix + radius);
    const z0 = Math.max(0, wh.iz - radius);
    const z1 = Math.min(grid.height - 1, wh.iz + radius);
    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = x0; ix <= x1; ix++) {
        if (Math.abs(ix - wh.ix) + Math.abs(iz - wh.iz) > radius) continue;
        const t = grid.tiles[toIndex(ix, iz, grid.width)];
        if (PRODUCER_TILE_SET.has(t)) count++;
      }
    }
    // Spec aligns with ResourceSystem scoring: each producer contributes
    // ~50 units to the density score (so 8 producers → ~400). Multiply so the
    // risk threshold (400) is comparable to the underlying system.
    const score = count * 50;
    per.push({ ix: wh.ix, iz: wh.iz, producers: count, score });
    if (score > max) max = score;
  }

  return {
    maxWarehouseDensity: max,
    densityRiskActive: max >= threshold,
    perWarehouse: per,
  };
}

/**
 * Patch 3 — Carry spoilage risk.
 * Samples worker carry ages from state.agents and reads a last-minute
 * spoiled-in-transit counter from state.metrics if the ResourceSystem tracks
 * it. Both fields fall back to 0 when not present (backward-compatible).
 * @param {Array} workers
 * @param {object} metrics
 */
export function sampleCarrySpoilageRisk(workers, metrics) {
  let totalAge = 0;
  let count = 0;
  for (const w of workers) {
    const carryTotal = (w.carry?.food ?? 0) + (w.carry?.wood ?? 0)
      + (w.carry?.stone ?? 0) + (w.carry?.herbs ?? 0);
    if (carryTotal <= 0) continue;
    const age = Number(w.blackboard?.carryAgeSec ?? 0);
    totalAge += age;
    count++;
  }
  const avgCarryAgeTicks = count > 0 ? Math.round(totalAge / count * TICKS_PER_SEC) : 0;
  const spoilageInTransitLastMinute = Number(metrics?.spoilageInTransitLastMinute
    ?? metrics?.spoiledInTransitLastMinute ?? 0);
  return { avgCarryAgeTicks, spoilageInTransitLastMinute };
}

/**
 * Patch 4 — Survival stats bundle.
 * Threat tier, seconds-until-next-raid, refined-goods totals, population
 * rolling-window average, and time since last birth.
 *
 * Uses `state.ai.perceptionScratch` (created on demand) for the population
 * trailing buffer. Nothing is mutated outside that scratch object, so the
 * existing callers remain unaffected.
 * @param {object} state
 * @param {number} workerCount
 * @param {number} timeSec
 */
export function sampleSurvivalStats(state, workerCount, timeSec) {
  const gp = state.gameplay ?? {};
  const esc = gp.raidEscalation ?? null;
  const currentThreatTier = Number(esc?.tier ?? 0);

  const lastRaidTick = Number(gp.lastRaidTick ?? -9999);
  const currentTick = Number(state.metrics?.tick ?? Math.round(timeSec * TICKS_PER_SEC));
  const intervalTicks = Number(esc?.intervalTicks ?? BALANCE.raidIntervalBaseTicks ?? 3600);
  const ticksRemaining = Math.max(0, intervalTicks - (currentTick - lastRaidTick));
  const secondsUntilNextRaid = Math.round(ticksRemaining / TICKS_PER_SEC);

  const refinedGoodsProducedTotal = Number(state.metrics?.refinedGoodsProducedTotal ?? 0);

  // Population rolling window — stored in state.ai.perceptionScratch
  state.ai ??= {};
  state.ai.perceptionScratch ??= { populationSamples: [] };
  const samples = state.ai.perceptionScratch.populationSamples;
  samples.push({ t: timeSec, n: workerCount });
  while (samples.length > 0 && timeSec - samples[0].t > POPULATION_WINDOW_SEC) {
    samples.shift();
  }
  let sum = 0;
  for (const s of samples) sum += s.n;
  const avgPopulationWindow = samples.length > 0
    ? Math.round(sum / samples.length * 10) / 10
    : workerCount;

  // Hours since last birth
  const lastBirthGameSec = Number(state.metrics?.lastBirthGameSec ?? -1);
  const hoursSinceLastBirth = lastBirthGameSec < 0
    ? -1
    : Math.round((timeSec - lastBirthGameSec) / 3600 * 100) / 100;

  return {
    currentThreatTier,
    secondsUntilNextRaid,
    refinedGoodsProducedTotal,
    avgPopulationWindow,
    hoursSinceLastBirth,
  };
}

/**
 * Patch 5 — Node inventory (M1a).
 * Walks `grid.tileState` entries looking for tiles with FOREST/STONE/HERB
 * node flags or active producer buildings, and groups them into per-type
 * arrays with `{ix, iz, yieldPool, depleted}`. Also emits:
 *   - nodeUtilizationRatio: built producers ÷ discovered nodes
 *   - nextExhaustionMinutes: {forest, stone, herb} — min yieldPool ÷ drain
 */
export function sampleNodeInventory(grid) {
  const knownNodes = { forest: [], stone: [], herb: [] };
  const builtCount = { forest: 0, stone: 0, herb: 0 };
  if (!grid?.tileState) {
    return {
      knownNodes,
      nodeUtilizationRatio: 0,
      nextExhaustionMinutes: { forest: Infinity, stone: Infinity, herb: Infinity },
    };
  }

  const width = grid.width;
  for (const [idx, entry] of grid.tileState) {
    if (!entry) continue;
    const ix = idx % width;
    const iz = Math.floor(idx / width);
    const flags = Number(entry.nodeFlags ?? 0);
    const pool = Number(entry.yieldPool ?? 0);
    const depleted = pool <= 0;
    const tile = grid.tiles?.[idx];

    if ((flags & NODE_FLAGS.FOREST) || tile === TILE.LUMBER) {
      knownNodes.forest.push({ ix, iz, yieldPool: pool, depleted });
      if (tile === TILE.LUMBER) builtCount.forest++;
    }
    if ((flags & NODE_FLAGS.STONE) || tile === TILE.QUARRY) {
      knownNodes.stone.push({ ix, iz, yieldPool: pool, depleted });
      if (tile === TILE.QUARRY) builtCount.stone++;
    }
    if ((flags & NODE_FLAGS.HERB) || tile === TILE.HERB_GARDEN) {
      knownNodes.herb.push({ ix, iz, yieldPool: pool, depleted });
      if (tile === TILE.HERB_GARDEN) builtCount.herb++;
    }
  }

  const totalDiscovered = knownNodes.forest.length + knownNodes.stone.length + knownNodes.herb.length;
  const totalBuilt = builtCount.forest + builtCount.stone + builtCount.herb;
  const nodeUtilizationRatio = totalDiscovered > 0
    ? Math.round(totalBuilt / totalDiscovered * 100) / 100
    : 0;

  function minsUntilExhaustion(nodes, type) {
    // v0.8.0 Phase 5 iteration C1 (code-reviewer MUST-FIX, silent-failure CRITICAL 4):
    // if every node of this type is discovered but depleted, the honest answer
    // is "0 minutes until exhaustion" — not Infinity. Returning Infinity (the
    // prior behaviour) inverted the signal: the planner read "no urgency"
    // exactly when urgency was maximal. Also return 0 when there are no
    // discovered nodes so the LLM treats "nothing to drain" as a relocate
    // trigger, not as "fine forever".
    if (!Array.isArray(nodes) || nodes.length === 0) return 0;
    let minPool = Infinity;
    let anyLive = false;
    for (const n of nodes) {
      if (!n.depleted) {
        anyLive = true;
        if (n.yieldPool < minPool) minPool = n.yieldPool;
      }
    }
    if (!anyLive) return 0;
    if (!Number.isFinite(minPool)) return 0;
    const drain = PESSIMISTIC_DRAIN_PER_SEC[type] ?? 0.5;
    return Math.round(minPool / drain / 60 * 10) / 10;
  }

  return {
    knownNodes,
    nodeUtilizationRatio,
    nextExhaustionMinutes: {
      forest: minsUntilExhaustion(knownNodes.forest, "forest"),
      stone: minsUntilExhaustion(knownNodes.stone, "stone"),
      herb: minsUntilExhaustion(knownNodes.herb, "herb"),
    },
  };
}

/**
 * Patch 6 — Fog state (M1b).
 * Emits revealed fraction, fog-boundary length (EXPLORED tiles adjacent to
 * HIDDEN tiles), and a conservative suspected-node-candidate count (HIDDEN
 * tiles bordering any discovered node tile).
 * Returns zeros when fog is not active.
 */
export function sampleFogState(state, discoveredNodeIndices = null) {
  const vis = state.fog?.visibility;
  if (!(vis instanceof Uint8Array)) {
    // v0.8.0 Phase 5 iteration C3 (silent-failure CRITICAL 3): the previous
    // implementation silently reported the whole map as revealed when
    // VisibilitySystem had not initialised. That masked a broken fog feature
    // as a disabled one. Emit an explicit sentinel so the planner/LLM can
    // distinguish "fog off" from "fog array missing".
    return {
      revealedFraction: null,
      fogActive: false,
      fogBoundaryLength: 0,
      suspectedNodeCandidates: 0,
      reason: "fog_array_missing",
    };
  }
  const grid = state.grid;
  const { width, height } = grid;
  let revealed = 0;
  let boundary = 0;
  let suspected = 0;
  const total = width * height;

  // Build a set of discovered node indices if not supplied (fall back scan)
  let nodeIdxSet = discoveredNodeIndices;
  if (!nodeIdxSet && grid.tileState) {
    nodeIdxSet = new Set();
    for (const [idx, entry] of grid.tileState) {
      const flags = Number(entry?.nodeFlags ?? 0);
      if (flags !== 0) nodeIdxSet.add(idx);
    }
  }
  if (!nodeIdxSet) nodeIdxSet = new Set();

  for (let iz = 0; iz < height; iz++) {
    for (let ix = 0; ix < width; ix++) {
      const idx = toIndex(ix, iz, width);
      const v = vis[idx];
      if (v >= FOG_STATE.EXPLORED) revealed++;

      if (v === FOG_STATE.EXPLORED) {
        // Boundary tile: adjacent to any HIDDEN tile?
        for (const { dx, dz } of MOVE_DIRECTIONS_4) {
          const nx = ix + dx;
          const nz = iz + dz;
          if (!inBounds(nx, nz, grid)) continue;
          const nIdx = toIndex(nx, nz, width);
          if (vis[nIdx] === FOG_STATE.HIDDEN) {
            boundary++;
            break;
          }
        }
      } else if (v === FOG_STATE.HIDDEN) {
        // Conservative suspected node: HIDDEN tile adjacent to a discovered node
        for (const { dx, dz } of MOVE_DIRECTIONS_4) {
          const nx = ix + dx;
          const nz = iz + dz;
          if (!inBounds(nx, nz, grid)) continue;
          const nIdx = toIndex(nx, nz, width);
          if (nodeIdxSet.has(nIdx)) {
            suspected++;
            break;
          }
        }
      }
    }
  }

  return {
    revealedFraction: total > 0 ? Math.round(revealed / total * 1000) / 1000 : 1,
    fogBoundaryLength: boundary,
    suspectedNodeCandidates: suspected,
  };
}

/**
 * Patch 7 — DevIndex dimensions.
 * Surfaces the 6 per-dim values + composite + smoothed composite + boolean
 * saturation flag. All fields default to safe zeros when DevIndexSystem has
 * not yet run (test scaffolds, early ticks).
 * @param {object} state
 */
export function sampleDevIndexDims(state) {
  const g = state.gameplay ?? {};
  const dims = g.devIndexDims ?? null;
  const devIndex = Number(g.devIndex ?? 0);
  const devIndexSmoothed = Number(g.devIndexSmoothed ?? devIndex);
  if (!dims) {
    return {
      dims: { population: 0, economy: 0, infrastructure: 0, production: 0, defense: 0, resilience: 0 },
      devIndex,
      devIndexSmoothed,
      saturationIndicator: false,
    };
  }
  const d = {
    population: Number(dims.population ?? 0),
    economy: Number(dims.economy ?? 0),
    infrastructure: Number(dims.infrastructure ?? 0),
    production: Number(dims.production ?? 0),
    defense: Number(dims.defense ?? 0),
    resilience: Number(dims.resilience ?? 0),
  };
  const minDim = Math.min(d.population, d.economy, d.infrastructure, d.production, d.defense, d.resilience);
  return {
    dims: d,
    devIndex,
    devIndexSmoothed,
    saturationIndicator: minDim > DEV_INDEX_SATURATION_DIM,
  };
}

// ── v0.8.2: Terrain, Soil, Node Depletion, Connectivity helpers ──────

/**
 * sampleTerrainAggregates — compute global elevation/moisture stats.
 * Skips WATER tiles so ocean/river tiles don't dilute land averages.
 * @param {object} grid
 * @returns {{avgElevation:number, avgMoisture:number, highElevationRatio:number, lowMoistureRatio:number}}
 */
export function sampleTerrainAggregates(grid) {
  const out = {
    avgElevation: 0.5,
    avgMoisture: 0.5,
    highElevationRatio: 0,
    lowMoistureRatio: 0,
  };
  if (!grid?.tiles) return out;

  const width = grid.width;
  const total = grid.tiles.length;
  let sumElev = 0, sumMoist = 0, highCount = 0, lowMoistCount = 0, passable = 0;

  for (let idx = 0; idx < total; idx++) {
    if (grid.tiles[idx] === TILE.WATER) continue;
    passable++;
    const elev = (grid.elevation?.[idx] ?? 128) / 255;
    const moist = (grid.moisture?.[idx] ?? 128) / 255;
    sumElev += elev;
    sumMoist += moist;
    if (elev > 0.6) highCount++;
    if (moist < 0.3) lowMoistCount++;
  }

  if (passable === 0) return out;
  return {
    avgElevation: Math.round(sumElev / passable * 100) / 100,
    avgMoisture: Math.round(sumMoist / passable * 100) / 100,
    highElevationRatio: Math.round(highCount / passable * 100) / 100,
    lowMoistureRatio: Math.round(lowMoistCount / passable * 100) / 100,
  };
}

/**
 * sampleSoilAggregates — walk FARM tiles and aggregate salinization.
 * @param {object} grid
 * @returns {{salinizedFarmCount:number, criticalSalinized:number, avgFarmSalinization:number}}
 */
export function sampleSoilAggregates(grid) {
  const out = { salinizedFarmCount: 0, criticalSalinized: 0, avgFarmSalinization: 0 };
  if (!grid?.tileState || !grid?.tiles) return out;

  let sumSalin = 0, farmCount = 0;
  const width = grid.width;

  for (const [idx, entry] of grid.tileState) {
    if (!entry) continue;
    if (grid.tiles[idx] !== TILE.FARM) continue;
    farmCount++;
    const salin = Number(entry.salinized ?? 0);
    sumSalin += salin;
    if (salin > 0.6) out.salinizedFarmCount++;
    if (salin > 0.9) out.criticalSalinized++;
  }

  out.avgFarmSalinization = farmCount > 0 ? Math.round(sumSalin / farmCount * 100) / 100 : 0;
  return out;
}

/**
 * sampleNodeDepletionCounts — count depleted and at-risk resource nodes.
 * A LUMBER tile is "depleted" if its yieldPool < 20; "at-risk" if < 60.
 * Same thresholds for QUARRY and HERB_GARDEN.
 * @param {object} grid
 * @returns {{depletedForestCount:number, depletedStoneCount:number, atRiskNodeCount:number}}
 */
export function sampleNodeDepletionCounts(grid) {
  const out = { depletedForestCount: 0, depletedStoneCount: 0, atRiskNodeCount: 0 };
  if (!grid?.tileState || !grid?.tiles) return out;

  const DEPLETED_THRESHOLD = 20;
  const AT_RISK_THRESHOLD = 60;

  for (const [idx, entry] of grid.tileState) {
    if (!entry) continue;
    const pool = Number(entry.yieldPool ?? 0);
    const tile = grid.tiles[idx];

    if (tile === TILE.LUMBER) {
      if (pool < DEPLETED_THRESHOLD) out.depletedForestCount++;
      else if (pool < AT_RISK_THRESHOLD) out.atRiskNodeCount++;
    } else if (tile === TILE.QUARRY) {
      if (pool < DEPLETED_THRESHOLD) out.depletedStoneCount++;
      else if (pool < AT_RISK_THRESHOLD) out.atRiskNodeCount++;
    } else if (tile === TILE.HERB_GARDEN) {
      if (pool < AT_RISK_THRESHOLD) out.atRiskNodeCount++;
    }
  }

  return out;
}

// v0.8.7.1 P4 — single-pass connected-components labeling for water
// connectivity. The previous implementation ran a BFS PER producer tile,
// which on dense maps was N × O(BFS) ≈ O(N × R²) per perceiver tick.
// This labels every passable cell once and tags components that contain a
// warehouse. Producer queries become O(1) bitmask lookups.
const _waterConnectivityCache = new WeakMap();
function getWaterConnectivityLabels(grid) {
  const cached = _waterConnectivityCache.get(grid);
  if (cached && cached.version === grid.version) return cached;
  const { width, height } = grid;
  const total = width * height;
  const labels = new Int32Array(total).fill(-1);
  const componentHasWarehouse = []; // index = label
  let nextLabel = 0;
  const queue = new Int32Array(total);
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const startIdx = ix + iz * width;
      if (labels[startIdx] !== -1) continue;
      if (grid.tiles[startIdx] === TILE.WATER) continue;
      const label = nextLabel++;
      let head = 0;
      let tail = 0;
      queue[tail++] = startIdx;
      labels[startIdx] = label;
      let hasWh = grid.tiles[startIdx] === TILE.WAREHOUSE;
      while (head < tail) {
        const idx = queue[head++];
        const cx = idx % width;
        const cz = (idx - cx) / width;
        if (grid.tiles[idx] === TILE.WAREHOUSE) hasWh = true;
        if (cx > 0) {
          const n = idx - 1;
          if (labels[n] === -1 && grid.tiles[n] !== TILE.WATER) {
            labels[n] = label;
            queue[tail++] = n;
          }
        }
        if (cx < width - 1) {
          const n = idx + 1;
          if (labels[n] === -1 && grid.tiles[n] !== TILE.WATER) {
            labels[n] = label;
            queue[tail++] = n;
          }
        }
        if (cz > 0) {
          const n = idx - width;
          if (labels[n] === -1 && grid.tiles[n] !== TILE.WATER) {
            labels[n] = label;
            queue[tail++] = n;
          }
        }
        if (cz < height - 1) {
          const n = idx + width;
          if (labels[n] === -1 && grid.tiles[n] !== TILE.WATER) {
            labels[n] = label;
            queue[tail++] = n;
          }
        }
      }
      componentHasWarehouse[label] = hasWh;
    }
  }
  const entry = { version: grid.version, labels, componentHasWarehouse };
  _waterConnectivityCache.set(grid, entry);
  return entry;
}

/**
 * sampleWaterConnectivity — detect production tiles isolated by water.
 * v0.8.7.1 P4 — uses single-pass connected-component labeling cached against
 * grid.version, replacing the per-producer BFS that ran O(N × BFS_RADIUS²).
 * @param {object} state
 * @returns {{waterIsolatedResources:number, bridgeRecommended:boolean, bridgeCoord:{ix:number,iz:number}|null}}
 */
export function sampleWaterConnectivity(state) {
  const out = { waterIsolatedResources: 0, bridgeRecommended: false, bridgeCoord: null };
  const grid = state?.grid;
  if (!grid?.tiles) return out;

  const { width, height } = grid;
  const PRODUCER_TYPES = new Set([TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN]);
  const cc = getWaterConnectivityLabels(grid);
  const labels = cc.labels;
  const componentHasWarehouse = cc.componentHasWarehouse;

  for (let iz = 0; iz < height; iz++) {
    for (let ix = 0; ix < width; ix++) {
      const idx = toIndex(ix, iz, width);
      const tileType = grid.tiles[idx];
      if (!PRODUCER_TYPES.has(tileType)) continue;

      const label = labels[idx];
      const reachable = label >= 0 && componentHasWarehouse[label];

      if (!reachable) {
        out.waterIsolatedResources++;
        if (!out.bridgeCoord) {
          for (const { dx, dz } of MOVE_DIRECTIONS_4) {
            const nx = ix + dx;
            const nz = iz + dz;
            if (!inBounds(nx, nz, grid)) continue;
            if (grid.tiles[toIndex(nx, nz, width)] === TILE.WATER) {
              out.bridgeCoord = { ix: nx, iz: nz };
              break;
            }
          }
        }
      }
    }
  }

  out.bridgeRecommended = out.waterIsolatedResources > 0;
  return out;
}

// ── ColonyPerceiver Class ────────────────────────────────────────────────

/**
 * Main perceiver class — transforms game state into structured observations.
 */
export class ColonyPerceiver {
  constructor() {
    this._rateTracker = new ResourceRateTracker();
    this._lastObservation = null;
    this._observeCount = 0;
    this._prevSnapshot = null; // for delta computation
  }

  /**
   * Generate a full structured observation from game state.
   * @param {object} state — full game state
   * @returns {object} observation (see design doc §4.1.1)
   */
  observe(state) {
    const { grid, resources, agents, animals, weather, gameplay } = state;
    const timeSec = state.metrics?.timeSec ?? 0;

    // Sample resource rates
    this._rateTracker.sample(timeSec, resources ?? {});
    const rates = this._rateTracker.getAllRates();

    // Workers
    const workers = (agents ?? []).filter(a => a.type === "WORKER" && a.alive !== false);
    const herbivores = (animals ?? []).filter(a => a.kind === "HERBIVORE" && a.alive !== false);
    const predators = (animals ?? []).filter(a => a.kind === "PREDATOR" && a.alive !== false);
    const saboteurs = (agents ?? []).filter(a => a.type === "VISITOR" && a.kind === "SABOTEUR" && a.alive !== false);

    // Cluster detection
    const clusters = detectClusters(grid, agents ?? []);

    // Expansion frontiers
    const frontiers = analyzeExpansionFrontiers(grid, clusters);

    // Workforce allocation
    const allocation = {};
    for (const w of workers) {
      const role = (w.role ?? "FARM").toLowerCase();
      allocation[role] = (allocation[role] ?? 0) + 1;
    }

    // Avg hunger
    let totalHunger = 0;
    for (const w of workers) totalHunger += w.hunger ?? 0;
    const avgHunger = workers.length > 0 ? Math.round(totalHunger / workers.length * 100) / 100 : 0;

    // Worker efficiency: fraction of workers that are actively working (not idle/eating)
    let activeWorkers = 0;
    for (const w of workers) {
      const label = (w.stateLabel ?? "").toLowerCase();
      if (label !== "idle" && label !== "eating" && label !== "dead") activeWorkers++;
    }
    const workerEfficiency = workers.length > 0 ? Math.round(activeWorkers / workers.length * 100) / 100 : 0;

    // Population cap estimate
    const buildings = state.buildings ?? {};
    const wh = buildings.warehouses ?? 0;
    const fm = buildings.farms ?? 0;
    const lm = buildings.lumbers ?? 0;
    const qu = buildings.quarries ?? 0;
    const ki = buildings.kitchens ?? 0;
    const sm = buildings.smithies ?? 0;
    const cl = buildings.clinics ?? 0;
    const hg = buildings.herbGardens ?? 0;
    // v0.10.1-iter4 (HW7 hotfix Batch E — Issue #9): legacy `Math.min(80, ...)`
    // hard cap removed so the LLM/perceiver pop-cap estimate scales with
    // built infrastructure rather than being clamped to a global ceiling.
    // Per-building contributions (the soft cap) are unchanged.
    const popCap = 8 + wh * 4 + Math.floor(fm * 0.8)
      + Math.floor(lm * 0.5) + qu * 2 + ki * 2 + sm * 2 + cl * 2 + hg;

    // Growth blockers
    const growthBlockers = [];
    if ((resources?.food ?? 0) < MIN_FOOD_FOR_GROWTH) growthBlockers.push(`food < ${MIN_FOOD_FOR_GROWTH}`);
    if (workers.length >= popCap) growthBlockers.push("at pop cap");

    // Defense
    const threat = gameplay?.threat ?? 0;
    const wallTiles = listTilesByType(grid, [TILE.WALL]);
    const wallCoverage = wallTiles.length > 0 ? Math.round(wallTiles.length / 24 * 100) / 100 : 0;

    // Prosperity
    const prosperity = Math.round(gameplay?.prosperity ?? 0);

    // Objectives
    let objective = null;
    const objectives = gameplay?.objectives ?? [];
    const objIdx = gameplay?.objectiveIndex ?? 0;
    const currentObj = objectives[objIdx];
    if (currentObj) {
      const rawProgress = currentObj.progress ?? 0;
      // Normalize: if progress > 1, it's already a percentage; otherwise treat as fraction
      const normalizedProgress = rawProgress > 1 ? Math.min(100, Math.round(rawProgress)) : Math.round(rawProgress * 100);
      objective = {
        id: currentObj.id,
        title: currentObj.title,
        progress: normalizedProgress,
        completed: currentObj.completed ?? false,
      };
    }

    // Affordability
    const affordable = computeAffordability(resources ?? {});

    // Build resource economy section with rates
    const economy = {};
    for (const key of ["food", "wood", "stone", "herbs", "meals", "tools", "medicine"]) {
      const r = rates[key] ?? { rate: 0, trend: "unknown", projectedZeroSec: null };
      economy[key] = {
        stock: Math.round(resources?.[key] ?? 0),
        rate: r.rate,
        trend: r.trend,
        projectedZeroSec: r.projectedZeroSec,
      };
    }

    // Season/weather
    const environment = {
      season: weather?.season ?? null,
      seasonProgress: weather?.seasonProgress ?? null,
      weather: weather?.current ?? "clear",
      weatherRemainingSec: Math.round(weather?.timeLeftSec ?? 0),
      pressureScore: weather?.pressureScore ?? 0,
    };

    // Disconnected worksites: dynamically computed from actual warehouse positions
    const worksiteStats = this._analyzeWorksiteCoverage(grid);

    // Logistics bottleneck detection
    const logisticsBottleneck = this._detectLogisticsBottleneck(buildings, workers.length, worksiteStats.disconnected);

    const totalBuildings = this._countTotalBuildings(buildings);

    // Delta tracking: changes since last observation
    const prev = this._prevSnapshot;
    const delta = prev ? {
      timeDeltaSec: Math.round(timeSec) - prev.timeSec,
      workers: workers.length - prev.workers,
      buildings: totalBuildings - prev.buildings,
      prosperity: prosperity - prev.prosperity,
      food: Math.round(resources?.food ?? 0) - prev.food,
      wood: Math.round(resources?.wood ?? 0) - prev.wood,
    } : null;

    // Resource chain analysis
    const resourceChains = analyzeResourceChains(state);

    // Season forecast
    const seasonForecast = forecastSeasonImpact(weather);

    // Strategy context (from StrategicDirector, if available)
    const strategy = state.ai?.strategy ?? null;

    // Plan history (from AgentDirector, if available)
    const planHistory = state.ai?.agentDirector?.planHistory ?? null;
    const planHistorySummary = summarizePlanHistory(planHistory);

    // ── v0.8.0 Phase 5 (patches 1-7) ───────────────────────────────────
    const tileAgg = sampleTileStateAggregates(grid);
    const whDensity = sampleWarehouseDensity(grid);
    const spoilage = sampleCarrySpoilageRisk(workers, state.metrics ?? {});
    const survival = sampleSurvivalStats(state, workers.length, timeSec);
    const nodeInv = sampleNodeInventory(grid);
    const fog = sampleFogState(state);
    const devIdx = sampleDevIndexDims(state);

    // ── v0.8.2: terrain + soil + node counts + connectivity ────────────
    const terrainAgg = sampleTerrainAggregates(grid);
    const soilAgg = sampleSoilAggregates(grid);
    const nodeCountAgg = sampleNodeDepletionCounts(grid);
    const connectivityAgg = sampleWaterConnectivity(state);

    const observation = {
      timeSec: Math.round(timeSec),
      observeCount: ++this._observeCount,

      economy,

      resourceChains,

      topology: {
        clusters,
        worksiteTotal: worksiteStats.total,
        disconnectedWorksites: worksiteStats.disconnected,
        coveragePercent: worksiteStats.coveragePercent,
        logisticsBottleneck,
        roadNetworkSize: buildings.roads ?? 0,
        expansionFrontiers: frontiers,
        totalBuildings,
      },

      workforce: {
        total: workers.length,
        allocation,
        popCap,
        growthBlockers,
        avgHunger,
        workerEfficiency,
      },

      wildlife: {
        herbivores: herbivores.length,
        predators: predators.length,
      },

      defense: {
        threat: Math.round(threat),
        wallCoverage: Math.min(1, wallCoverage),
        activeSaboteurs: saboteurs.length,
      },

      environment,

      seasonForecast,

      strategy,

      planHistorySummary,

      prosperity,

      objective,

      affordable,

      buildings: {
        warehouses: wh,
        farms: fm,
        lumbers: lm,
        quarries: qu,
        herbGardens: hg,
        kitchens: ki,
        smithies: sm,
        clinics: cl,
        roads: buildings.roads ?? 0,
        walls: buildings.walls ?? 0,
        bridges: buildings.bridges ?? 0,
      },

      // ── v0.8.0 Phase 5 (patches 1-7): additive M1-M4 perception fields ──
      // These are new, backward-compatible fields. Existing readers that
      // don't know about them keep functioning; the planner & evaluator
      // use them for depletion/density/isolation-aware decisions.
      tileState: {
        salinizedCount: tileAgg.salinizedCount,
        fallowCount: tileAgg.fallowCount,
        depletedTileCount: tileAgg.depletedTileCount,
        avgYieldPool: tileAgg.avgYieldPool,
      },
      warehouseDensity: {
        maxWarehouseDensity: whDensity.maxWarehouseDensity,
        densityRiskActive: whDensity.densityRiskActive,
        perWarehouse: whDensity.perWarehouse,
      },
      spoilage: {
        avgCarryAgeTicks: spoilage.avgCarryAgeTicks,
        spoilageInTransitLastMinute: spoilage.spoilageInTransitLastMinute,
      },
      survival: {
        currentThreatTier: survival.currentThreatTier,
        secondsUntilNextRaid: survival.secondsUntilNextRaid,
        refinedGoodsProducedTotal: survival.refinedGoodsProducedTotal,
        avgPopulationWindow: survival.avgPopulationWindow,
        hoursSinceLastBirth: survival.hoursSinceLastBirth,
      },
      nodes: {
        knownNodes: nodeInv.knownNodes,
        nodeUtilizationRatio: nodeInv.nodeUtilizationRatio,
        nextExhaustionMinutes: nodeInv.nextExhaustionMinutes,
      },
      fog: {
        revealedFraction: fog.revealedFraction,
        fogBoundaryLength: fog.fogBoundaryLength,
        suspectedNodeCandidates: fog.suspectedNodeCandidates,
      },
      devIndex: {
        dims: devIdx.dims,
        devIndex: devIdx.devIndex,
        devIndexSmoothed: devIdx.devIndexSmoothed,
        saturationIndicator: devIdx.saturationIndicator,
      },

      // ── v0.8.2: terrain, soil, node depletion counts, connectivity ──
      terrain: terrainAgg,
      soil: soilAgg,
      nodeDepletion: nodeCountAgg,
      connectivity: connectivityAgg,

      delta,
    };

    // Store snapshot for next delta
    this._prevSnapshot = {
      timeSec: Math.round(timeSec),
      workers: workers.length,
      buildings: totalBuildings,
      prosperity,
      food: Math.round(resources?.food ?? 0),
      wood: Math.round(resources?.wood ?? 0),
    };

    this._lastObservation = observation;
    return observation;
  }

  /**
   * Get the most recent observation without recomputing.
   * @returns {object|null}
   */
  getLastObservation() {
    return this._lastObservation;
  }

  /**
   * Get the resource rate tracker for external use.
   * @returns {ResourceRateTracker}
   */
  getRateTracker() {
    return this._rateTracker;
  }

  // ── Private helpers ──────────────────────────────────────────────────

  _analyzeWorksiteCoverage(grid) {
    const allWorksites = listTilesByType(grid, [TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN]);
    const warehouseTiles = listTilesByType(grid, [TILE.WAREHOUSE]);
    const total = allWorksites.length;
    if (total === 0) return { total: 0, disconnected: 0, coveragePercent: 100 };
    if (warehouseTiles.length === 0) return { total, disconnected: total, coveragePercent: 0 };

    let disconnected = 0;
    for (const ws of allWorksites) {
      let covered = false;
      for (const wh of warehouseTiles) {
        if (Math.abs(ws.ix - wh.ix) + Math.abs(ws.iz - wh.iz) <= WAREHOUSE_COVERAGE_RADIUS) {
          covered = true;
          break;
        }
      }
      if (!covered) disconnected++;
    }
    const coveragePercent = Math.round((total - disconnected) / total * 100);
    return { total, disconnected, coveragePercent };
  }

  _detectLogisticsBottleneck(buildings, workerCount, disconnectedWorksites) {
    const wh = buildings.warehouses ?? 0;
    const farms = buildings.farms ?? 0;
    const lumbers = buildings.lumbers ?? 0;
    const prodTotal = farms + lumbers + (buildings.quarries ?? 0) + (buildings.herbGardens ?? 0);

    const bottlenecks = [];
    // Farm:warehouse ratio too high
    if (wh > 0 && farms / wh > 3) {
      bottlenecks.push(`farm:warehouse ratio ${(farms / wh).toFixed(1)} (target ≤3)`);
    }
    // Production:warehouse ratio too high
    if (wh > 0 && prodTotal / wh > 6) {
      bottlenecks.push(`production:warehouse ratio ${(prodTotal / wh).toFixed(1)} (target ≤6)`);
    }
    // Too many disconnected worksites
    if (disconnectedWorksites > 0 && prodTotal > 0 && disconnectedWorksites / prodTotal > 0.2) {
      bottlenecks.push(`${disconnectedWorksites} disconnected worksites (${Math.round(disconnectedWorksites / prodTotal * 100)}%)`);
    }
    // Workers per warehouse too high
    if (wh > 0 && workerCount / wh > 8) {
      bottlenecks.push(`workers:warehouse ratio ${(workerCount / wh).toFixed(1)} (target ≤8)`);
    }

    return bottlenecks.length > 0 ? bottlenecks : null;
  }

  _countTotalBuildings(buildings) {
    return (buildings.farms ?? 0) + (buildings.lumbers ?? 0) + (buildings.warehouses ?? 0)
      + (buildings.quarries ?? 0) + (buildings.herbGardens ?? 0) + (buildings.kitchens ?? 0)
      + (buildings.smithies ?? 0) + (buildings.clinics ?? 0) + (buildings.roads ?? 0)
      + (buildings.walls ?? 0) + (buildings.bridges ?? 0);
  }
}

/**
 * Format an observation as a compact text summary for LLM consumption.
 * @param {object} obs — observation from ColonyPerceiver.observe()
 * @returns {string}
 */
function signedNum(v) {
  return (v >= 0 ? "+" : "") + v;
}

export function formatObservationForLLM(obs) {
  const lines = [];
  lines.push("## Colony State at t=" + obs.timeSec + "s");
  if (obs.delta) {
    const d = obs.delta;
    lines.push("*Delta (" + d.timeDeltaSec + "s): workers " + signedNum(d.workers) + ", buildings " + signedNum(d.buildings) + ", prosperity " + signedNum(d.prosperity) + ", food " + signedNum(d.food) + ", wood " + signedNum(d.wood) + "*");
  }
  lines.push("");

  // Economy with prominent depletion warnings
  lines.push("### Economy");
  const depletionWarnings = [];
  for (const [key, val] of Object.entries(obs.economy)) {
    let line = `- ${key}: ${val.stock}`;
    if (val.rate !== 0) line += ` (${val.rate > 0 ? "+" : ""}${val.rate}/s, ${val.trend})`;
    if (val.projectedZeroSec != null) {
      if (val.projectedZeroSec < 30) {
        line += ` ⚠ CRITICAL: depletes in ~${val.projectedZeroSec}s!`;
        depletionWarnings.push(`${key} depletes in ${val.projectedZeroSec}s`);
      } else {
        line += ` [depleted in ~${val.projectedZeroSec}s]`;
      }
    }
    lines.push(line);
  }
  if (depletionWarnings.length > 0) {
    lines.push(`- **URGENT**: ${depletionWarnings.join("; ")}`);
  }

  // Resource Chains — shows the LLM what to build next in each processing chain
  if (obs.resourceChains) {
    lines.push("");
    lines.push("### Resource Chains (build order guidance)");
    for (const chain of obs.resourceChains) {
      const stageStr = chain.stages.map(s => {
        const icon = s.status === "active" ? "✅" : s.status === "ready" ? "🔓" : "❌";
        return `${icon}${s.building}(${s.count})`;
      }).join(" → ");
      lines.push(`- ${chain.name.toUpperCase()}: ${stageStr}`);
      if (chain.bottleneck) lines.push(`  Bottleneck: ${chain.bottleneck}`);
      if (chain.nextAction) lines.push(`  → Next: ${chain.nextAction}`);
      if (chain.impact) lines.push(`  Impact: ${chain.impact}`);
    }
  }

  // Topology
  lines.push("");
  lines.push("### Infrastructure");
  const b = obs.buildings;
  lines.push("- Buildings (" + obs.topology.totalBuildings + "): WH=" + b.warehouses + " F=" + b.farms + " L=" + b.lumbers + " Q=" + b.quarries + " HG=" + b.herbGardens + " K=" + b.kitchens + " S=" + b.smithies + " C=" + b.clinics + " R=" + b.roads + " W=" + b.walls);

  lines.push("- Worksite coverage: " + (obs.topology.coveragePercent ?? 0) + "% (" + (obs.topology.disconnectedWorksites ?? 0) + "/" + (obs.topology.worksiteTotal ?? 0) + " disconnected)");
  if (obs.topology.clusters.length > 0) {
    lines.push(`- Clusters (${obs.topology.clusters.length}):`);
    for (const c of obs.topology.clusters) {
      lines.push(`  - ${c.id}: center=(${c.center.ix},${c.center.iz}), WH=${c.warehouses}, F=${c.farms}, L=${c.lumbers}, Q=${c.quarries}, HG=${c.herbGardens}, K=${c.kitchens}, S=${c.smithies}, C=${c.clinics}, coverage=${c.coverageRatio}, workers=${c.workerCount}, avgMoisture=${c.avgMoisture}`);
    }
  }

  // Frontiers
  if (obs.topology.expansionFrontiers.length > 0) {
    lines.push(`- Expansion frontiers:`);
    for (const f of obs.topology.expansionFrontiers) {
      lines.push(`  - ${f.direction}: grass=${f.availableGrass}, moisture=${f.avgMoisture}, elevation=${f.avgElevation}, density=${f.density}`);
    }
  }

  // Workforce
  lines.push("");
  lines.push("### Workforce");
  lines.push(`- Total: ${obs.workforce.total} / ${obs.workforce.popCap} cap`);
  lines.push(`- Allocation: ${JSON.stringify(obs.workforce.allocation)}`);
  lines.push(`- Efficiency: ${obs.workforce.workerEfficiency}, Avg hunger: ${obs.workforce.avgHunger}`);
  if (obs.workforce.growthBlockers.length > 0) {
    lines.push(`- Growth blocked: ${obs.workforce.growthBlockers.join(", ")}`);
  }

  // Logistics bottlenecks
  if (obs.topology.logisticsBottleneck) {
    lines.push(`- **Logistics bottlenecks:**`);
    for (const lb of obs.topology.logisticsBottleneck) lines.push(`  - ⚠ ${lb}`);
  }

  // ── v0.8.0 Phase 5: M1-M4 living-world signals ──────────────────────
  // Render new perceiver fields so the LLM can reason about tile depletion,
  // warehouse density/fire risk, spoilage pressure, survival tier, node
  // exhaustion, fog frontier, and DevIndex dimensions. Without this block
  // the upstream patches would be dead weight (data on the bus with no
  // consumer).
  if (obs.tileState || obs.warehouseDensity || obs.spoilage || obs.survival || obs.nodes || obs.fog || obs.devIndex) {
    lines.push("");
    lines.push("### Living-World Signals (M1-M4)");
    if (obs.tileState) {
      const ts = obs.tileState;
      const avg = ts.avgYieldPool ?? {};
      lines.push(`- Tile state: salinized=${ts.salinizedCount ?? 0}, fallow=${ts.fallowCount ?? 0}, depleted=${ts.depletedTileCount ?? 0}`);
      lines.push(`  avgYieldPool: farm=${avg.farm ?? 0}, lumber=${avg.lumber ?? 0}, quarry=${avg.quarry ?? 0}, herb=${avg.herb ?? 0}`);
    }
    if (obs.warehouseDensity) {
      const wd = obs.warehouseDensity;
      const risk = wd.densityRiskActive ? " ⚠ DENSITY RISK — expand, don't pile" : "";
      lines.push(`- Warehouse density: max=${wd.maxWarehouseDensity ?? 0}${risk}`);
    }
    if (obs.spoilage) {
      const sp = obs.spoilage;
      if ((sp.spoilageInTransitLastMinute ?? 0) > 0 || (sp.avgCarryAgeTicks ?? 0) > 0) {
        lines.push(`- Spoilage: avgCarryAge=${sp.avgCarryAgeTicks ?? 0} ticks, lost-in-transit/min=${sp.spoilageInTransitLastMinute ?? 0}`);
      }
    }
    if (obs.survival) {
      const sv = obs.survival;
      const tierIcon = (sv.currentThreatTier ?? 0) >= 2 ? "⚠" : "·";
      lines.push(`- Survival: ${tierIcon} threatTier=${sv.currentThreatTier ?? 0}, nextRaid~${sv.secondsUntilNextRaid ?? "?"}s, avgPop=${sv.avgPopulationWindow ?? 0}, hoursSinceBirth=${sv.hoursSinceLastBirth ?? 0}`);
    }
    if (obs.nodes) {
      const n = obs.nodes;
      const util = n.nodeUtilizationRatio ?? {};
      const nxt = n.nextExhaustionMinutes ?? {};
      const fmtMin = (m) => (Number.isFinite(m) ? `${m}min` : "∞");
      lines.push(`- Nodes: forest=${(n.knownNodes?.forest ?? 0)} (util ${util.forest ?? 0}, exhaust ${fmtMin(nxt.forest)}), stone=${(n.knownNodes?.stone ?? 0)} (util ${util.stone ?? 0}, exhaust ${fmtMin(nxt.stone)}), herb=${(n.knownNodes?.herb ?? 0)} (util ${util.herb ?? 0}, exhaust ${fmtMin(nxt.herb)})`);
      for (const type of ["forest", "stone", "herb"]) {
        const m = nxt[type];
        if (Number.isFinite(m) && m > 0 && m < 10) {
          lines.push(`  ⚠ ${type} node exhausts in ~${m}min — relocate or rotate`);
        }
      }
    }
    if (obs.fog) {
      const f = obs.fog;
      if (f.revealedFraction != null) {
        lines.push(`- Fog: revealed=${Math.round(100 * f.revealedFraction)}%, boundary=${f.fogBoundaryLength ?? 0} tiles, suspectedNodes=${f.suspectedNodeCandidates ?? 0}`);
      }
    }
    if (obs.devIndex) {
      const di = obs.devIndex;
      const dims = di.dims ?? {};
      const dimStr = Object.keys(dims).sort().map((k) => `${k}=${dims[k]}`).join(", ");
      lines.push(`- DevIndex: ${di.devIndex ?? 0}/100 (smoothed ${di.devIndexSmoothed ?? 0}, saturation=${di.saturationIndicator ?? "none"})`);
      if (dimStr) lines.push(`  dims: ${dimStr}`);
    }
  }

  // ── v0.8.2: terrain + soil + node depletion + connectivity ──────────
  if (obs.terrain || obs.soil || obs.nodeDepletion || obs.connectivity) {
    lines.push("");
    lines.push("### Terrain & Soil Health");
    if (obs.terrain) {
      const t = obs.terrain;
      lines.push(`- Terrain: avgElev=${t.avgElevation}, avgMoist=${t.avgMoisture}, highElevRatio=${t.highElevationRatio}, lowMoistRatio=${t.lowMoistureRatio}`);
      if ((t.lowMoistureRatio ?? 0) > 0.4) {
        lines.push(`  ⚠ Dry terrain: ${Math.round(t.lowMoistureRatio * 100)}% of land is low-moisture — herb gardens and farms may underperform`);
      }
    }
    if (obs.soil) {
      const s = obs.soil;
      if ((s.criticalSalinized ?? 0) > 0) {
        lines.push(`  ⚠ SOIL CRISIS: ${s.criticalSalinized} farm(s) critically salinized (>90%) — need immediate fallow`);
      }
      if ((s.salinizedFarmCount ?? 0) > 0) {
        lines.push(`  ⚠ Soil health: ${s.salinizedFarmCount} farm(s) above 60% salinization (avg=${s.avgFarmSalinization})`);
      }
    }
    if (obs.nodeDepletion) {
      const n = obs.nodeDepletion;
      if ((n.depletedForestCount ?? 0) > 0) {
        lines.push(`  ⚠ LUMBER CRISIS: ${n.depletedForestCount} lumber mill(s) on depleted nodes (pool<20)`);
      }
      if ((n.depletedStoneCount ?? 0) > 0) {
        lines.push(`  ⚠ QUARRY CRISIS: ${n.depletedStoneCount} quarry/quarries on depleted nodes`);
      }
      if ((n.atRiskNodeCount ?? 0) > 0) {
        lines.push(`  ⚠ Node risk: ${n.atRiskNodeCount} node(s) below 60% yield capacity`);
      }
    }
    if (obs.connectivity) {
      const c = obs.connectivity;
      if (c.waterIsolatedResources > 0) {
        const coord = c.bridgeCoord;
        const loc = coord ? ` at tile (${coord.ix},${coord.iz})` : "";
        lines.push(`  ⚠ WATER BARRIER: ${c.waterIsolatedResources} resource tile(s) cut off by water — build bridge${loc}`);
      }
    }
  }

  // Postcondition violations from the most recent plan evaluation (H7).
  // These are surfaced by PlanEvaluator via memoryStore; ColonyPlanner passes
  // them through obs._postconditionViolations when building the prompt. We
  // render them here so the LLM reliably sees what tripped the evaluator.
  if (Array.isArray(obs.postconditionViolations) && obs.postconditionViolations.length > 0) {
    lines.push("");
    lines.push("### Last Plan Postcondition Violations (avoid repeating)");
    for (const v of obs.postconditionViolations) {
      lines.push(`- ⚠ ${v}`);
    }
  }

  // Defense
  lines.push("");
  lines.push("### Defense & Prosperity");
  lines.push(`- Prosperity: ${obs.prosperity ?? 0}`);
  lines.push(`- Threat: ${obs.defense.threat}, Wall coverage: ${obs.defense.wallCoverage}`);
  if (obs.defense.activeSaboteurs > 0) {
    lines.push(`- Active saboteurs: ${obs.defense.activeSaboteurs}`);
  }

  // Environment with season forecast
  lines.push("");
  lines.push("### Environment");
  lines.push(`- Weather: ${obs.environment.weather} (${obs.environment.weatherRemainingSec}s remaining)`);
  if (obs.seasonForecast) {
    const sf = obs.seasonForecast;
    lines.push(`- Season: ${sf.current} (${sf.currentProgress}%, ~${sf.remainingSec}s left)`);
    lines.push(`  Current impact: farm=${sf.currentImpact.farmMod}, lumber=${sf.currentImpact.lumberMod}`);
    if (sf.currentImpact.risk !== "none") lines.push(`  ⚠ Risk: ${sf.currentImpact.risk}`);
    lines.push(`  Next season: ${sf.next} in ~${sf.nextInSec}s — ${sf.nextImpact.advice}`);
  } else if (obs.environment.season) {
    lines.push(`- Season: ${obs.environment.season} (${Math.round((obs.environment.seasonProgress ?? 0) * 100)}%)`);
  }

  // Strategy context (from StrategicDirector)
  if (obs.strategy) {
    lines.push("");
    lines.push("### Current Strategy (from Strategic Advisor) — FOLLOW THIS");
    if (obs.strategy.phase) lines.push(`- Phase: ${obs.strategy.phase}`);
    if (obs.strategy.primaryGoal) lines.push(`- Goal: ${obs.strategy.primaryGoal}`);
    lines.push(`- Priority: ${obs.strategy.priority}, Focus: ${obs.strategy.resourceFocus}`);
    lines.push(`- Defense posture: ${obs.strategy.defensePosture}, Risk tolerance: ${obs.strategy.riskTolerance}`);
    if (obs.strategy.workerFocus !== "balanced") lines.push(`- Worker focus: ${obs.strategy.workerFocus}`);
    if (obs.strategy.constraints && obs.strategy.constraints.length > 0) {
      lines.push("- **Constraints (must follow):**");
      for (const c of obs.strategy.constraints) lines.push(`  - ${c}`);
    }
    if (obs.strategy.resourceBudget) {
      const rb = obs.strategy.resourceBudget;
      lines.push(`- Resource reserves: keep wood >= ${rb.reserveWood}, food >= ${rb.reserveFood}`);
    }
  }

  // Plan history summary
  if (obs.planHistorySummary) {
    const ph = obs.planHistorySummary;
    lines.push("");
    lines.push("### Recent Plan Performance");
    lines.push(`- ${ph.totalPlans} plans total, ${ph.successRate}% success, avg score ${ph.avgScore}`);
    if (ph.topFailReason) lines.push(`- Most common failure: ${ph.topFailReason}`);
    for (const p of ph.recent) {
      const icon = p.success ? "✓" : "✗";
      let entry = `  ${icon} "${p.goal}" — ${p.completed}/${p.total} steps, score ${(p.score ?? 0).toFixed(2)}`;
      if (p.failReason) entry += ` (${p.failReason})`;
      lines.push(entry);
    }
  }

  // Objective
  if (obs.objective) {
    lines.push("");
    lines.push("### Objective");
    lines.push(`- ${obs.objective.id}: ${obs.objective.title ?? ""} (${obs.objective.progress}%)`);
  }

  // Affordability
  const affordableTypes = Object.entries(obs.affordable)
    .filter(([, v]) => v)
    .map(([k]) => k);
  lines.push("");
  lines.push(`### Affordable: ${affordableTypes.join(", ") || "none"}`);

  return lines.join("\n");
}
