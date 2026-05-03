/**
 * RoadPlanner — Algorithmic road layout planning for the colony AI.
 *
 * Given a set of production buildings and warehouse locations, computes
 * optimal road paths using A* shortest path on passable terrain, then
 * merges overlapping paths into an MST-inspired network.
 *
 * Used by the AI agent to generate road build steps automatically
 * instead of pure LLM-based road placement.
 */

import { TILE, TILE_INFO, MOVE_DIRECTIONS_4 } from "../../../config/constants.js";
import { inBounds, getTile, toIndex, listTilesByType } from "../../../world/grid/Grid.js";
import { TERRAIN_MECHANICS, BALANCE, BUILD_COST } from "../../../config/balance.js";
import { RoadNetwork } from "../../navigation/RoadNetwork.js";

const ROAD_PASSABLE = new Set([TILE.GRASS, TILE.ROAD, TILE.BRIDGE, TILE.WAREHOUSE]);

// R6 PG-bridge-and-water — WATER is allowed as an A* neighbour but at a
// punitive step cost so a land path is preferred whenever one exists. The
// cost is the bridge build resource cost (wood + stone) which is also the
// rough opportunity cost the colony pays per water-step crossing. The
// reconstructed path tags water steps with `type: 'bridge'` and land steps
// with `type: 'road'`, which roadPlansToSteps + the ColonyPlanner
// consumer use to emit the right blueprint kind.
//
// PDD R10 (Plan-PDD-smart-pathing) — lowered 5.0 → 2.0 stopgap. A bridge
// step amortizes over expected lifetime traffic (workers cross it forever),
// so the build-cost floor was way too pessimistic. 2.0 keeps water 2× as
// expensive as a grass step (so land still wins ties on land-reachable
// plans) but lets a 1-tile bridge shortcut beat a ≥3-tile grass detour.
// The dual-search in `planRoadConnections` provides the safety net: even
// if A* picks a wasteful bridge, we compare against the land-only path
// and pick whichever scores lower on (build cost + amortized traversal).
const BRIDGE_STEP_COST = 2.0;

// Production-style buildings whose adjacency makes a road tile "compounding" —
// roads serving multiple worksites are worth a small cost discount because
// they share traffic. NOT a hard preference; see RESOURCE_RICH_WEIGHT below.
const RESOURCE_RICH_TILES = new Set([
  TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN,
]);

// Multiplicative cost factor applied to GRASS step cost when a candidate road
// tile sits within 1 Manhattan tile of a resource-producing building. <1
// rewards the path; >1 would penalize. Tuned to "soft pull" — 0.85 gives the
// A* a meaningful tie-breaker without redirecting paths that are clearly
// shorter without the bonus.
const RESOURCE_RICH_WEIGHT = 0.85;

/**
 * True iff the tile at (ix,iz) has a 4-neighbour resource-producing building.
 * Used by `roadAStar` to apply the resource-richness discount.
 */
function isAdjacentToResourceTile(grid, ix, iz) {
  for (const dir of MOVE_DIRECTIONS_4) {
    const nx = ix + dir.dx;
    const nz = iz + dir.dz;
    if (!inBounds(nx, nz, grid)) continue;
    const t = grid.tiles[toIndex(nx, nz, grid.width)];
    if (RESOURCE_RICH_TILES.has(t)) return true;
  }
  return false;
}

/**
 * Lightweight A* for road planning — finds shortest path between two tiles
 * on GRASS/ROAD/BRIDGE/WAREHOUSE tiles only.
 * Returns array of {ix, iz} from start to end (inclusive), or null if no path.
 *
 * PDD R10 — `options.allowBridge` (default true) gates water-tile expansion.
 * `false` produces a strictly land-only path (`null` if no land route exists);
 * used by `planRoadConnections`'s dual-search to pick by total-cost-of-ownership.
 */
function roadAStar(grid, startIx, startIz, endIx, endIz, { allowBridge = true } = {}) {
  const { tiles, width, height } = grid;
  const startKey = toIndex(startIx, startIz, width);
  const endKey = toIndex(endIx, endIz, width);
  if (startKey === endKey) return [{ ix: startIx, iz: startIz }];

  // Start and end tiles are always valid (they're the building/warehouse)
  const endpoints = new Set([startKey, endKey]);

  const gScore = new Map();
  const cameFrom = new Map();
  gScore.set(startKey, 0);

  // Simple priority queue (adequate for small grids)
  const open = [{ key: startKey, f: heuristic(startIx, startIz, endIx, endIz) }];
  const closed = new Set();

  while (open.length > 0) {
    // Pop lowest f-score
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const current = open[bestIdx];
    open[bestIdx] = open[open.length - 1];
    open.pop();

    if (current.key === endKey) {
      return reconstructPath(cameFrom, current.key, width, tiles);
    }

    if (closed.has(current.key)) continue;
    closed.add(current.key);

    const cix = current.key % width;
    const ciz = Math.floor(current.key / width);
    const currentG = gScore.get(current.key);

    for (const dir of MOVE_DIRECTIONS_4) {
      const nx = cix + dir.dx;
      const nz = ciz + dir.dz;
      if (!inBounds(nx, nz, grid)) continue;
      const nKey = toIndex(nx, nz, width);
      if (closed.has(nKey)) continue;

      const nTile = tiles[nKey];
      // R6 PG-bridge-and-water — WATER is allowed as a neighbour for the
      // A* expansion (with BRIDGE_STEP_COST punishment) so planRoadConnections
      // can produce a road→bridge→bridge→road sequence between islands.
      // Land tiles outside ROAD_PASSABLE (FARM, WALL, ...) still block.
      // PDD R10 — when `allowBridge:false`, water tiles are skipped entirely
      // so the search returns a strictly land-only path (or null).
      const isWaterStep = nTile === TILE.WATER;
      if (isWaterStep && !allowBridge) continue;
      if (!ROAD_PASSABLE.has(nTile) && !isWaterStep && !endpoints.has(nKey)) continue;

      // Cost: existing roads/bridges nearly free, grass costs 1, water
      // crossings pay the bridge resource cost (≥ 5).
      let stepCost;
      if (isWaterStep) {
        stepCost = BRIDGE_STEP_COST;
      } else if (nTile === TILE.ROAD || nTile === TILE.BRIDGE || nTile === TILE.WAREHOUSE) {
        stepCost = 0.1;
      } else {
        stepCost = 1.0;
      }

      // Elevation penalty for road building
      if (grid.elevation) {
        stepCost += (grid.elevation[nKey] ?? 0.5) * (TERRAIN_MECHANICS?.elevationMovePenalty ?? 0.3);
      }

      // Resource-richness bonus: prefer road tiles adjacent to other resource
      // buildings so a single road compounds across multiple worksites.
      // Only applies on GRASS (the tile we'd actually convert) — we don't want
      // to discount stepping over an existing road (already cheap) or the
      // endpoint warehouse. This is a SOFT pull, not a redirect.
      if (nTile === TILE.GRASS && isAdjacentToResourceTile(grid, nx, nz)) {
        stepCost *= RESOURCE_RICH_WEIGHT;
      }

      const tentativeG = currentG + stepCost;
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        gScore.set(nKey, tentativeG);
        cameFrom.set(nKey, current.key);
        const f = tentativeG + heuristic(nx, nz, endIx, endIz);
        open.push({ key: nKey, f });
      }
    }
  }

  return null; // No path
}

function heuristic(ax, az, bx, bz) {
  return Math.abs(ax - bx) + Math.abs(az - bz);
}

function reconstructPath(cameFrom, endKey, width, tiles) {
  const path = [];
  let key = endKey;
  while (key !== undefined) {
    const ix = key % width;
    const iz = Math.floor(key / width);
    // R6 PG-bridge-and-water — tag the build kind per step so downstream
    // step emitters (roadPlansToSteps + ColonyPlanner) can place a bridge
    // blueprint on water and a road blueprint on land.
    const t = tiles ? tiles[key] : TILE.GRASS;
    const stepType = t === TILE.WATER ? "bridge" : "road";
    path.push({ ix, iz, type: stepType });
    key = cameFrom.get(key);
  }
  path.reverse();
  return path;
}

/**
 * Find all production buildings that are NOT connected to any warehouse
 * via the road network.
 */
function findDisconnectedBuildings(grid, roadNetwork) {
  const PRODUCTION_TILES = [TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN, TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC];
  const disconnected = [];

  for (const tileType of PRODUCTION_TILES) {
    const tiles = listTilesByType(grid, [tileType]);
    for (const t of tiles) {
      if (!roadNetwork.isAdjacentToConnectedRoad(t.ix, t.iz, grid)) {
        disconnected.push(t);
      }
    }
  }
  return disconnected;
}

// PDD R10 — total-cost-of-ownership scorer for the dual-search in
// `planRoadConnections`. Sums per-tile build resource cost (bridges on
// water, roads on grass; existing roads/bridges/warehouses are free) and
// adds an amortized traversal term so a longer path with cheaper steps
// is fairly compared to a shorter one with bridges. The amortization
// constant assumes ~50 round-trip traversals over the path's lifetime —
// rough order-of-magnitude calibration, not a precise economic model.
const TRAFFIC_AMORTIZATION = 50;
function scorePath(path, grid) {
  if (!path || path.length === 0) return Infinity;
  const bridgeCost = (BUILD_COST?.bridge?.wood ?? 0) + (BUILD_COST?.bridge?.stone ?? 0);
  const roadCost = BUILD_COST?.road?.wood ?? 1;
  let buildCost = 0;
  for (const step of path) {
    const t = getTile(grid, step.ix, step.iz);
    if (t === TILE.WATER) buildCost += bridgeCost;
    else if (t === TILE.GRASS) buildCost += roadCost;
    // existing ROAD/BRIDGE/WAREHOUSE tiles are free — already built.
  }
  // Divide traversal term by 100 to bring it into parity-of-magnitude with
  // build-resource units; a 10-tile path contributes ~5 to the score, a
  // 30-tile detour contributes ~15.
  return buildCost + (path.length * TRAFFIC_AMORTIZATION) / 100;
}

/**
 * Plan road segments to connect disconnected production buildings
 * to the nearest warehouse.
 *
 * @param {object} grid - Game grid
 * @param {object} roadNetwork - RoadNetwork instance
 * @returns {Array<{ from: {ix,iz}, to: {ix,iz}, path: Array<{ix,iz}>, tilesNeeded: number }>}
 *   Each entry is a road segment plan. `path` includes tiles from `from` to `to`.
 *   `tilesNeeded` is the number of GRASS tiles that need to be converted to ROAD.
 */
export function planRoadConnections(grid, roadNetwork) {
  roadNetwork.rebuild(grid);
  const disconnected = findDisconnectedBuildings(grid, roadNetwork);
  if (disconnected.length === 0) return [];

  const warehouses = listTilesByType(grid, [TILE.WAREHOUSE]);
  if (warehouses.length === 0) return [];

  const plans = [];
  const alreadyPlanned = new Set();

  for (const building of disconnected) {
    // Find nearest warehouse
    let nearestWH = null;
    let nearestDist = Infinity;
    for (const wh of warehouses) {
      const dist = heuristic(building.ix, building.iz, wh.ix, wh.iz);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestWH = wh;
      }
    }
    if (!nearestWH) continue;

    const planKey = `${building.ix},${building.iz}->${nearestWH.ix},${nearestWH.iz}`;
    if (alreadyPlanned.has(planKey)) continue;
    alreadyPlanned.add(planKey);

    // PDD R10 — dual-search: compute land-only and bridge-allowed paths,
    // then pick by total-cost-of-ownership (build resources spent +
    // amortized traversal over expected lifetime traffic). On archipelago
    // maps the bridge variant typically wins; on contiguous land the
    // land-only variant matches and wins on the build-cost tiebreak.
    const pathLand = roadAStar(grid, building.ix, building.iz, nearestWH.ix, nearestWH.iz, { allowBridge: false });
    const pathBridge = roadAStar(grid, building.ix, building.iz, nearestWH.ix, nearestWH.iz, { allowBridge: true });
    const path = scorePath(pathBridge, grid) <= scorePath(pathLand, grid) ? pathBridge : pathLand;
    if (!path) continue;

    // Count tiles that need to become roads or bridges (skip existing
    // roads/warehouses/bridges). R6 PG-bridge-and-water — water steps
    // tagged by reconstructPath get emitted as bridge blueprints.
    let tilesNeeded = 0;
    const roadSteps = [];
    for (const step of path) {
      const t = getTile(grid, step.ix, step.iz);
      if (t === TILE.GRASS) {
        tilesNeeded++;
        roadSteps.push({ ...step, type: "road" });
      } else if (t === TILE.WATER) {
        tilesNeeded++;
        roadSteps.push({ ...step, type: "bridge" });
      }
    }

    if (tilesNeeded > 0) {
      plans.push({
        from: { ix: building.ix, iz: building.iz },
        to: { ix: nearestWH.ix, iz: nearestWH.iz },
        path: roadSteps,
        tilesNeeded,
      });
    }
  }

  // Sort by fewest tiles needed (cheapest connections first)
  plans.sort((a, b) => a.tilesNeeded - b.tilesNeeded);
  return plans;
}

/**
 * Convert road plans into AI build steps compatible with ColonyPlanner format.
 *
 * @param {Array} plans - Output from planRoadConnections
 * @param {number} maxSteps - Maximum road build steps to generate
 * @returns {Array<{ type: "road", ix: number, iz: number, priority: string, reason: string }>}
 */
export function roadPlansToSteps(plans, maxSteps = 12) {
  const steps = [];
  for (const plan of plans) {
    for (const tile of plan.path) {
      if (steps.length >= maxSteps) return steps;
      // R6 PG-bridge-and-water — honour per-step type tag from the planner
      // (road for land tiles, bridge for water crossings). Default to "road"
      // for legacy plans / older callers that didn't tag.
      const stepType = tile.type === "bridge" ? "bridge" : "road";
      steps.push({
        type: stepType,
        ix: tile.ix,
        iz: tile.iz,
        priority: plan.tilesNeeded <= 3 ? "high" : "medium",
        reason: `Connect building at (${plan.from.ix},${plan.from.iz}) to warehouse at (${plan.to.ix},${plan.to.iz})`,
      });
    }
  }
  return steps;
}

// ── Logistics-driven road planning entrypoint ─────────────────────────

/** Default trigger thresholds for `planLogisticsRoadSteps`. Tuned in v0.8.2
 * Phase 8 to fire as soon as a single worksite is unreachable or two carriers
 * are stranded — both states already block real production. */
export const LOGISTICS_ROAD_TRIGGERS = Object.freeze({
  isolatedThreshold: 1,
  strandedThreshold: 2,
  // Cap at 4 steps per plan: a single AgentDirector plan budgets ~8 steps and
  // road-only plans starve other priorities; 4 keeps a 1-tile-wide gap closeable
  // in one plan while leaving room for non-road steps.
  maxRoadStepsPerPlan: 4,
});

/**
 * Top-level helper: read `state.metrics.logistics` (computed by
 * ResourceSystem) and, when isolated worksites or stranded carriers exceed
 * the trigger thresholds, return an ordered list of road-build steps in the
 * shape `{ type: "road", hint: "<ix>,<iz>", priority, reason }` ready to be
 * spliced into a fallback plan or surfaced to the LLM.
 *
 * Returns `[]` when logistics signals don't warrant intervention OR when no
 * warehouse anchors exist (nothing to connect to).
 *
 * Pure function: does NOT mutate state.
 *
 * @param {object} state - game state
 * @param {object} [opts]
 * @param {number} [opts.isolatedThreshold] - default 1
 * @param {number} [opts.strandedThreshold] - default 2
 * @param {number} [opts.maxRoadStepsPerPlan] - default 4
 * @returns {Array<{type:"road", hint:string, priority:string, reason:string, ix:number, iz:number}>}
 */
export function planLogisticsRoadSteps(state, opts = {}) {
  if (!state || !state.grid || !state.grid.tiles) return [];

  const triggers = {
    isolatedThreshold: opts.isolatedThreshold ?? LOGISTICS_ROAD_TRIGGERS.isolatedThreshold,
    strandedThreshold: opts.strandedThreshold ?? LOGISTICS_ROAD_TRIGGERS.strandedThreshold,
    maxRoadStepsPerPlan: opts.maxRoadStepsPerPlan ?? LOGISTICS_ROAD_TRIGGERS.maxRoadStepsPerPlan,
  };

  const logistics = state.metrics?.logistics ?? null;
  const isolated = Number(logistics?.isolatedWorksites ?? 0);
  const stranded = Number(logistics?.strandedCarryWorkers ?? 0);

  // Trigger gate. When metrics haven't run yet (very early ticks) `logistics`
  // may be null — fall back to a structural probe that just looks for
  // disconnected production buildings, so the system is useful before the
  // economy loop has had a chance to count carriers.
  const metricTrigger =
    isolated >= triggers.isolatedThreshold || stranded >= triggers.strandedThreshold;

  if (logistics && !metricTrigger) return [];

  // Reuse the shared RoadNetwork instance; create a transient one if missing
  // (tests / harnesses that don't run the worker AI loop).
  const roadNetwork = state._roadNetwork ?? new RoadNetwork();
  const plans = planRoadConnections(state.grid, roadNetwork);
  if (plans.length === 0) return [];

  const rawSteps = roadPlansToSteps(plans, triggers.maxRoadStepsPerPlan);
  return rawSteps.map((s) => ({
    // R6 PG-bridge-and-water — propagate the per-step type (road/bridge)
    // so ColonyPlanner emits a bridge build step on water crossings.
    type: s.type === "bridge" ? "bridge" : "road",
    ix: s.ix,
    iz: s.iz,
    hint: `${s.ix},${s.iz}`,
    priority: s.priority,
    reason: s.reason,
  }));
}

/**
 * Format a one-line LLM hint summarising the current logistics deficit so
 * the LLM can prefer connecting existing worksites over building new ones
 * on top of an isolated cluster. Returns "" when nothing's wrong.
 */
export function formatLogisticsHintForLLM(state) {
  const log = state?.metrics?.logistics;
  if (!log) return "";
  const isolated = Number(log.isolatedWorksites ?? 0);
  const stranded = Number(log.strandedCarryWorkers ?? 0);
  const stretched = Number(log.stretchedWorksites ?? 0);
  if (isolated <= 0 && stranded <= 0 && stretched <= 0) return "";
  const parts = [];
  if (isolated > 0) parts.push(`${isolated} isolated worksite${isolated > 1 ? "s" : ""}`);
  if (stranded > 0) parts.push(`${stranded} stranded carrier${stranded > 1 ? "s" : ""}`);
  if (stretched > 0) parts.push(`${stretched} stretched worksite${stretched > 1 ? "s" : ""}`);
  return `Infrastructure deficit: ${parts.join(", ")}. Prefer roads connecting existing producers over new buildings.`;
}
