/**
 * LogisticsSystem — Tracks road-network connectivity between production
 * buildings and warehouses, computing per-tile logistics efficiency.
 *
 * Efficiency tiers:
 *   - Connected to warehouse via road: 1.0 + roadLogisticsBonus (e.g. 1.15)
 *   - Adjacent to road (but road not connected to warehouse): 1.0
 *   - No road adjacency: 0.85 (isolation penalty)
 *
 * Runs once per grid version change (lazy rebuild).
 */

import { TILE } from "../../config/constants.js";
import { BALANCE } from "../../config/balance.js";
import { listTilesByType, toIndex } from "../../world/grid/Grid.js";
import { RoadNetwork } from "../navigation/RoadNetwork.js";

const PRODUCTION_TILES = [
  TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN,
  TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC,
];

const ISOLATION_PENALTY = 0.85;

export class LogisticsSystem {
  constructor() {
    this.name = "LogisticsSystem";
    this._gridVersion = -1;
    /** @type {Map<string, number>} tileKey -> efficiency multiplier */
    this._efficiencyMap = new Map();
    this._stats = { connected: 0, adjacent: 0, isolated: 0 };
  }

  /**
   * Rebuild efficiency map if grid changed.
   * @param {object} state - Game state with grid and _roadNetwork
   */
  update(dt, state) {
    if (this._gridVersion === state.grid.version) return;
    this._gridVersion = state.grid.version;

    const roadNet = state._roadNetwork ?? (state._roadNetwork = new RoadNetwork());
    roadNet.rebuild(state.grid);

    this._efficiencyMap.clear();
    let connected = 0, adjacent = 0, isolated = 0;

    for (const tileType of PRODUCTION_TILES) {
      const tiles = listTilesByType(state.grid, [tileType]);
      for (const t of tiles) {
        const key = `${t.ix},${t.iz}`;
        if (roadNet.isAdjacentToConnectedRoad(t.ix, t.iz, state.grid)) {
          this._efficiencyMap.set(key, BALANCE.roadLogisticsBonus ?? 1.15);
          connected++;
        } else if (this._hasAnyRoadNeighbor(t.ix, t.iz, state.grid, roadNet)) {
          this._efficiencyMap.set(key, 1.0);
          adjacent++;
        } else {
          this._efficiencyMap.set(key, ISOLATION_PENALTY);
          isolated++;
        }
      }
    }

    this._stats = { connected, adjacent, isolated };

    // Expose logistics state for AI/UI
    state.metrics ??= {};
    state.metrics.logistics ??= {};
    state.metrics.logistics.buildingEfficiency = Object.fromEntries(this._efficiencyMap);
    state.metrics.logistics.logisticsStats = { ...this._stats };
  }

  /**
   * Check if tile has any road neighbor at all (even disconnected road).
   */
  _hasAnyRoadNeighbor(ix, iz, grid, roadNet) {
    const DIRS = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
    for (const d of DIRS) {
      const nx = ix + d.x;
      const nz = iz + d.z;
      if (nx < 0 || nz < 0 || nx >= grid.width || nz >= grid.height) continue;
      const idx = toIndex(nx, nz, grid.width);
      if (roadNet.isRoadTile(idx)) return true;
    }
    return false;
  }

  /**
   * Get logistics efficiency for a specific tile.
   * @returns {number} Multiplier (0.85 to ~1.15)
   */
  getEfficiency(ix, iz) {
    return this._efficiencyMap.get(`${ix},${iz}`) ?? 1.0;
  }

  get stats() {
    return { ...this._stats };
  }
}
