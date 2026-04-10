import { TILE } from "../../config/constants.js";
import { TERRAIN_MECHANICS } from "../../config/balance.js";

const FERTILITY_RECOVERY_PER_SEC = 0.002;
const FERTILITY_HARVEST_DRAIN = 0.08;
const WEAR_INCREASE_PER_SEC = 0.0008;
const WEAR_STORM_MULTIPLIER = 2.5;
const WEAR_TRAFFIC_BONUS = 0.001;
const UPDATE_INTERVAL_SEC = 2.0;

const PRODUCTION_TILES = new Set([TILE.FARM, TILE.HERB_GARDEN, TILE.LUMBER]);
const WEAR_TILES = new Set([TILE.ROAD, TILE.BRIDGE, TILE.WALL, TILE.QUARRY, TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC]);

// D1: Adjacency fertility bonuses per neighbor tile type → target tile type
const ADJACENCY_EFFECTS = Object.freeze({
  [TILE.HERB_GARDEN]: { [TILE.FARM]: 0.003, [TILE.LUMBER]: 0.002 },
  [TILE.KITCHEN]: { [TILE.FARM]: 0.001 },
  [TILE.QUARRY]: { [TILE.FARM]: -0.004, [TILE.HERB_GARDEN]: -0.003 },
  [TILE.LUMBER]: { [TILE.HERB_GARDEN]: 0.002 },
});
const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class TileStateSystem {
  constructor() {
    this.name = "TileStateSystem";
    this._nextUpdateSec = 0;
  }

  update(dt, state) {
    const grid = state.grid;
    if (!grid.tileState) {
      grid.tileState = new Map();
      grid.tileStateVersion = 1;
    }

    const nowSec = Number(state.metrics?.timeSec ?? 0);
    if (nowSec < this._nextUpdateSec) return;
    this._nextUpdateSec = nowSec + UPDATE_INTERVAL_SEC;

    const isStorm = state.weather?.current === "storm";
    const weatherMult = isStorm ? WEAR_STORM_MULTIPLIER : 1;
    const elapsed = UPDATE_INTERVAL_SEC;

    for (let iz = 0; iz < grid.height; iz++) {
      for (let ix = 0; ix < grid.width; ix++) {
        const idx = ix + iz * grid.width;
        const type = grid.tiles[idx];

        if (PRODUCTION_TILES.has(type)) {
          let entry = grid.tileState.get(idx);
          if (!entry) {
            entry = { fertility: 0.85, wear: 0, growthStage: 0, exhaustion: 0 };
            grid.tileState.set(idx, entry);
          }
          // Exhaustion decays when tile is not being harvested
          if (entry.exhaustion > 0) {
            entry.exhaustion = Math.max(0, entry.exhaustion - TERRAIN_MECHANICS.soilExhaustionDecayPerTick);
          }
          // D1: Adjacency fertility modifier
          let adjBonus = 0;
          for (const [dx, dz] of DIR4) {
            const nx = ix + dx;
            const nz = iz + dz;
            if (nx < 0 || nz < 0 || nx >= grid.width || nz >= grid.height) continue;
            const neighborType = grid.tiles[nx + nz * grid.width];
            const effects = ADJACENCY_EFFECTS[neighborType];
            if (effects && effects[type] !== undefined) adjBonus += effects[type];
          }
          adjBonus = Math.max(-TERRAIN_MECHANICS.adjacencyFertilityMax, Math.min(TERRAIN_MECHANICS.adjacencyFertilityMax, adjBonus));

          // Fertility slowly recovers toward moisture-based cap
          const moistCap = grid.moisture
            ? Math.min(1.0, grid.moisture[idx] * TERRAIN_MECHANICS.moistureFertilityCap.scale + TERRAIN_MECHANICS.moistureFertilityCap.base)
            : 1.0;
          entry.fertility = Math.min(moistCap, entry.fertility + FERTILITY_RECOVERY_PER_SEC * elapsed + adjBonus);
          // Growth stage cycles: 0→1→2→3→0 based on fertility
          const prevStage = entry.growthStage ?? 0;
          entry.growthStage = Math.min(3, Math.floor(entry.fertility * 4));
          if (entry.growthStage !== prevStage) {
            grid.tileStateVersion = (grid.tileStateVersion ?? 0) + 1;
          }
          grid.tileStateVersion = (grid.tileStateVersion ?? 0) + 1;
        } else if (WEAR_TILES.has(type)) {
          let entry = grid.tileState.get(idx);
          if (!entry) {
            entry = { fertility: 0, wear: 0, growthStage: 0 };
            grid.tileState.set(idx, entry);
          }
          // Wear increases over time, faster during storms
          entry.wear = Math.min(1.0, entry.wear + WEAR_INCREASE_PER_SEC * elapsed * weatherMult);
          grid.tileStateVersion = (grid.tileStateVersion ?? 0) + 1;
        }
      }
    }
  }
}

export function drainFertility(grid, ix, iz) {
  if (!grid.tileState) return;
  const idx = ix + iz * grid.width;
  const entry = grid.tileState.get(idx);
  if (entry) {
    const drain = FERTILITY_HARVEST_DRAIN * (1 + (entry.exhaustion ?? 0) * TERRAIN_MECHANICS.soilExhaustionDrainScale);
    entry.fertility = Math.max(0, entry.fertility - drain);
    entry.exhaustion = Math.min(TERRAIN_MECHANICS.soilExhaustionMax, (entry.exhaustion ?? 0) + 1);
    grid.tileStateVersion = (grid.tileStateVersion ?? 0) + 1;
  }
}

export function getTileFertility(grid, ix, iz) {
  if (!grid.tileState) return 1.0;
  const idx = ix + iz * grid.width;
  const entry = grid.tileState.get(idx);
  return entry?.fertility ?? 1.0;
}
