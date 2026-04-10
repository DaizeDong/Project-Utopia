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

import { TILE, MOVE_DIRECTIONS_4, DEFAULT_GRID } from "../../../config/constants.js";
import { BUILD_COST, WEATHER_MODIFIERS } from "../../../config/balance.js";
import { inBounds, getTile, listTilesByType, toIndex } from "../../../world/grid/Grid.js";
import { canAfford } from "../../construction/BuildAdvisor.js";
import { getScenarioRuntime } from "../../../world/scenarios/ScenarioFactory.js";

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

    // Count workers within cluster coverage
    const workerCount = workerPositions.filter(w => {
      return c.tiles.some(t => Math.abs(w.ix - t.ix) + Math.abs(w.iz - t.iz) <= 3);
    }).length;

    // Compute warehouse coverage ratio (production tiles within WAREHOUSE_COVERAGE_RADIUS of a warehouse)
    const prodTiles = c.tiles.filter(t => {
      const idx = toIndex(t.ix, t.iz, width);
      const tt = grid.tiles[idx];
      return tt === TILE.FARM || tt === TILE.LUMBER || tt === TILE.QUARRY || tt === TILE.HERB_GARDEN;
    });
    const whTiles = c.tiles.filter(t => grid.tiles[toIndex(t.ix, t.iz, width)] === TILE.WAREHOUSE);
    let covered = 0;
    for (const pt of prodTiles) {
      const isCovered = whTiles.some(w =>
        Math.abs(w.ix - pt.ix) + Math.abs(w.iz - pt.iz) <= WAREHOUSE_COVERAGE_RADIUS);
      if (isCovered) covered++;
    }
    const coverageRatio = prodTiles.length > 0 ? covered / prodTiles.length : 1.0;

    // Compute avg warehouse distance for production tiles
    let totalDist = 0;
    let distCount = 0;
    for (const pt of prodTiles) {
      if (whTiles.length === 0) break;
      const minDist = Math.min(...whTiles.map(w =>
        Math.abs(w.ix - pt.ix) + Math.abs(w.iz - pt.iz)));
      totalDist += minDist;
      distCount++;
    }

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
    const popCap = Math.min(80, 8 + wh * 4 + Math.floor(fm * 0.8)
      + Math.floor(lm * 0.5) + qu * 2 + ki * 2 + sm * 2 + cl * 2 + hg);

    // Growth blockers
    const growthBlockers = [];
    if ((resources?.food ?? 0) < 20) growthBlockers.push("food < 20");
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

    const observation = {
      timeSec: Math.round(timeSec),
      observeCount: ++this._observeCount,

      economy,

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

  // Economy
  lines.push("### Economy");
  for (const [key, val] of Object.entries(obs.economy)) {
    let line = `- ${key}: ${val.stock}`;
    if (val.rate !== 0) line += ` (${val.rate > 0 ? "+" : ""}${val.rate}/s, ${val.trend})`;
    if (val.projectedZeroSec != null) line += ` [depleted in ~${val.projectedZeroSec}s]`;
    lines.push(line);
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
      lines.push(`  - ${c.id}: center=(${c.center.ix},${c.center.iz}), WH=${c.warehouses}, F=${c.farms}, L=${c.lumbers}, coverage=${c.coverageRatio}, workers=${c.workerCount}`);
    }
  }

  // Frontiers
  if (obs.topology.expansionFrontiers.length > 0) {
    lines.push(`- Expansion frontiers:`);
    for (const f of obs.topology.expansionFrontiers) {
      lines.push(`  - ${f.direction}: grass=${f.availableGrass}, moisture=${f.avgMoisture}, density=${f.density}`);
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
    for (const b of obs.topology.logisticsBottleneck) lines.push(`  - ⚠ ${b}`);
  }

  // Defense
  lines.push("");
  lines.push("### Defense & Prosperity");
  lines.push(`- Prosperity: ${obs.prosperity ?? 0}`);
  lines.push(`- Threat: ${obs.defense.threat}, Wall coverage: ${obs.defense.wallCoverage}`);
  if (obs.defense.activeSaboteurs > 0) {
    lines.push(`- Active saboteurs: ${obs.defense.activeSaboteurs}`);
  }

  // Environment
  lines.push("");
  lines.push("### Environment");
  lines.push(`- Weather: ${obs.environment.weather} (${obs.environment.weatherRemainingSec}s remaining)`);
  if (obs.environment.season) {
    lines.push(`- Season: ${obs.environment.season} (${Math.round((obs.environment.seasonProgress ?? 0) * 100)}%)`);
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
