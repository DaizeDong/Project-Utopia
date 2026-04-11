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
import { TERRAIN_MECHANICS } from "../../../config/balance.js";

const ROAD_PASSABLE = new Set([TILE.GRASS, TILE.ROAD, TILE.BRIDGE, TILE.WAREHOUSE]);

/**
 * Lightweight A* for road planning — finds shortest path between two tiles
 * on GRASS/ROAD/BRIDGE/WAREHOUSE tiles only.
 * Returns array of {ix, iz} from start to end (inclusive), or null if no path.
 */
function roadAStar(grid, startIx, startIz, endIx, endIz) {
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
      return reconstructPath(cameFrom, current.key, width);
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
      if (!ROAD_PASSABLE.has(nTile) && !endpoints.has(nKey)) continue;

      // Cost: existing roads are free, grass costs more
      let stepCost = nTile === TILE.ROAD || nTile === TILE.BRIDGE || nTile === TILE.WAREHOUSE
        ? 0.1 : 1.0;

      // Elevation penalty for road building
      if (grid.elevation) {
        stepCost += (grid.elevation[nKey] ?? 0.5) * (TERRAIN_MECHANICS?.elevationMovePenalty ?? 0.3);
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

function reconstructPath(cameFrom, endKey, width) {
  const path = [];
  let key = endKey;
  while (key !== undefined) {
    path.push({ ix: key % width, iz: Math.floor(key / width) });
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

    const path = roadAStar(grid, building.ix, building.iz, nearestWH.ix, nearestWH.iz);
    if (!path) continue;

    // Count tiles that need to become roads (skip existing roads/warehouses)
    let tilesNeeded = 0;
    const roadSteps = [];
    for (const step of path) {
      const t = getTile(grid, step.ix, step.iz);
      if (t === TILE.GRASS) {
        tilesNeeded++;
        roadSteps.push(step);
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
      steps.push({
        type: "road",
        ix: tile.ix,
        iz: tile.iz,
        priority: plan.tilesNeeded <= 3 ? "high" : "medium",
        reason: `Connect building at (${plan.from.ix},${plan.from.iz}) to warehouse at (${plan.to.ix},${plan.to.iz})`,
      });
    }
  }
  return steps;
}
