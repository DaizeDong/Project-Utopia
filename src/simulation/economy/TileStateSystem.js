import { TILE } from "../../config/constants.js";
import { BALANCE, TERRAIN_MECHANICS } from "../../config/balance.js";
import { createTileStateEntry } from "../../world/grid/Grid.js";
import { emitEvent, EVENT_TYPES } from "../meta/GameEventBus.js";

const FERTILITY_RECOVERY_PER_SEC = 0.002;
const FERTILITY_HARVEST_DRAIN = 0.08;
const WEAR_INCREASE_PER_SEC = 0.0008;
const WEAR_STORM_MULTIPLIER = 2.5;
const WEAR_TRAFFIC_BONUS = 0.001;
const UPDATE_INTERVAL_SEC = 2.0;

const PRODUCTION_TILES = new Set([TILE.FARM, TILE.HERB_GARDEN, TILE.LUMBER]);
const WEAR_TILES = new Set([TILE.ROAD, TILE.BRIDGE, TILE.WALL, TILE.QUARRY, TILE.KITCHEN, TILE.SMITHY, TILE.CLINIC]);
const FLAMMABLE_TILES = new Set([TILE.FARM, TILE.LUMBER, TILE.HERB_GARDEN]);
const FIREBREAK_TILES = new Set([TILE.ROAD, TILE.BRIDGE, TILE.WATER, TILE.WALL]);

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

  update(dt, state, services = null) {
    const grid = state.grid;
    if (!grid.tileState) {
      grid.tileState = new Map();
      grid.tileStateVersion = 1;
    }

    // --- M1 soil maintenance (runs every tick, before the 2s interval gate) ---
    // Slow per-tick salinization decay, fallow-expiry restoration, and farm
    // yieldPool regen/initialization. Kept out of the interval gate so that
    // simulations that advance `state.metrics.tick` directly (tests, fast
    // benchmarks) observe recovery without needing to push timeSec forward.
    this._updateSoil(state);

    const nowSec = Number(state.metrics?.timeSec ?? 0);
    if (nowSec < this._nextUpdateSec) return;
    this._nextUpdateSec = nowSec + UPDATE_INTERVAL_SEC;

    const isStorm = state.weather?.current === "storm";
    const weatherMult = isStorm ? WEAR_STORM_MULTIPLIER : 1;
    const elapsed = UPDATE_INTERVAL_SEC;
    // Fire RNG: prefer seeded services.rng for benchmark determinism
    // (silent-failure C2); fall back to Math.random when unavailable.
    const rngFn = (typeof services?.rng?.next === "function")
      ? () => services.rng.next()
      : Math.random;

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
          // Roads/bridges: traffic accelerates wear
          let trafficMult = 1;
          if (type === TILE.ROAD || type === TILE.BRIDGE) {
            const tKey = `${ix},${iz}`;
            const load = Number(state.metrics?.traffic?.loadByKey?.[tKey] ?? 0);
            trafficMult = 1 + load * 0.3; // Each worker on tile adds 30% wear rate
          }
          entry.wear = Math.min(1.0, entry.wear + WEAR_INCREASE_PER_SEC * elapsed * weatherMult * trafficMult);
          grid.tileStateVersion = (grid.tileStateVersion ?? 0) + 1;
        }
      }
    }

    // E1: Drought wildfire system
    const isDrought = state.weather?.current === "drought";
    if (isDrought && grid.moisture) {
      this._updateFire(grid, rngFn, state);
    }
  }

  _updateSoil(state) {
    const grid = state.grid;
    const tick = Number(state.metrics?.tick ?? 0);
    const decay = Number(BALANCE.soilSalinizationDecayPerTick ?? 0);
    const poolRegen = Number(BALANCE.farmYieldPoolRegenPerTick ?? 0);
    const poolMax = Number(BALANCE.farmYieldPoolMax ?? 180);
    const poolInit = Number(BALANCE.farmYieldPoolInitial ?? 120);

    for (const [idx, entry] of grid.tileState) {
      const type = grid.tiles[idx];
      if (!PRODUCTION_TILES.has(type)) continue;

      // Fallow expiry: restore fertility + reset salinized + refill yieldPool.
      const fallowUntil = Number(entry.fallowUntil ?? 0);
      if (fallowUntil > 0 && tick >= fallowUntil) {
        entry.fertility = 0.9;
        entry.salinized = 0;
        entry.fallowUntil = 0;
        entry.yieldPool = poolInit;
        grid.tileStateVersion = (grid.tileStateVersion ?? 0) + 1;
        continue;
      }

      // During active fallow, hard-cap fertility at 0 (harvests will return 0).
      if (fallowUntil > 0 && tick < fallowUntil) {
        entry.fertility = 0;
        continue;
      }

      // Slow passive salinization decay (applied unconditionally — it's tiny
      // and self-limiting vs. the per-harvest increment).
      if ((entry.salinized ?? 0) > 0 && decay > 0) {
        entry.salinized = Math.max(0, Number(entry.salinized) - decay);
      }

      // FARM-only yieldPool: initialise a freshly-placed farm and passively regen.
      if (type === TILE.FARM) {
        if ((entry.yieldPool ?? 0) <= 0 && Number(entry.fertility ?? 0) > 0 && fallowUntil === 0) {
          entry.yieldPool = poolInit;
          grid.tileStateVersion = (grid.tileStateVersion ?? 0) + 1;
        } else if ((entry.yieldPool ?? 0) < poolMax) {
          entry.yieldPool = Math.min(poolMax, Number(entry.yieldPool ?? 0) + poolRegen);
        }
      }
    }
  }

  _updateFire(grid, rngFn = Math.random, state = null) {
    const w = grid.width;
    const h = grid.height;
    const newFires = [];

    for (let iz = 0; iz < h; iz++) {
      for (let ix = 0; ix < w; ix++) {
        const idx = ix + iz * w;
        const entry = grid.tileState.get(idx);

        // Advance existing fires
        if (entry?.onFire) {
          entry.wear = Math.min(1.0, entry.wear + TERRAIN_MECHANICS.fireWearPerTick);
          if (entry.wear >= 1.0) {
            // Burn down to grass — preserve M1a nodeFlags so wildfire does not
            // silently eat the map's resource layer (silent-failure H1). We
            // also emit a NODE_DESTROYED event so listeners can react.
            const preservedFlags = Number(entry.nodeFlags ?? 0) | 0;
            grid.tiles[idx] = TILE.GRASS;
            if (preservedFlags !== 0) {
              grid.tileState.set(idx, createTileStateEntry({ nodeFlags: preservedFlags }));
            } else {
              grid.tileState.delete(idx);
            }
            grid.tileStateVersion = (grid.tileStateVersion ?? 0) + 1;
            grid.version = (grid.version ?? 0) + 1;
            if (state) emitEvent(state, EVENT_TYPES.BUILDING_DESTROYED, { ix, iz, cause: "wildfire" });
            continue;
          }
          // Try to spread (limited by fireAge)
          if ((entry.fireAge ?? 0) < TERRAIN_MECHANICS.fireMaxSpread) {
            for (const [dx, dz] of DIR4) {
              const nx = ix + dx;
              const nz = iz + dz;
              if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
              const nIdx = nx + nz * w;
              const nType = grid.tiles[nIdx];
              if (FIREBREAK_TILES.has(nType)) continue;
              if (!FLAMMABLE_TILES.has(nType)) continue;
              const nMoist = grid.moisture[nIdx] ?? 0.5;
              if (nMoist >= TERRAIN_MECHANICS.fireMoistureThreshold) continue;
              const nEntry = grid.tileState.get(nIdx);
              if (nEntry?.onFire) continue;
              if (rngFn() < TERRAIN_MECHANICS.fireIgniteChance * 2) {
                newFires.push({ idx: nIdx, fireAge: (entry.fireAge ?? 0) + 1 });
              }
            }
          }
          grid.tileStateVersion = (grid.tileStateVersion ?? 0) + 1;
          continue;
        }

        // Spontaneous ignition on low-moisture flammable tiles
        const type = grid.tiles[idx];
        if (!FLAMMABLE_TILES.has(type)) continue;
        const moist = grid.moisture[idx] ?? 0.5;
        if (moist >= TERRAIN_MECHANICS.fireMoistureThreshold) continue;
        // Check water adjacency immunity
        let waterAdjacent = false;
        for (const [dx, dz] of DIR4) {
          const nx = ix + dx;
          const nz = iz + dz;
          if (nx >= 0 && nz >= 0 && nx < w && nz < h && grid.tiles[nx + nz * w] === TILE.WATER) {
            waterAdjacent = true;
            break;
          }
        }
        if (waterAdjacent) continue;
        if (rngFn() < TERRAIN_MECHANICS.fireIgniteChance) {
          let e = grid.tileState.get(idx);
          if (!e) {
            e = createTileStateEntry({ fertility: 0.85 });
            grid.tileState.set(idx, e);
          }
          e.onFire = true;
          e.fireAge = 0;
          grid.tileStateVersion = (grid.tileStateVersion ?? 0) + 1;
        }
      }
    }

    // Apply spread fires
    for (const { idx, fireAge } of newFires) {
      let e = grid.tileState.get(idx);
      if (!e) {
        e = createTileStateEntry({ fertility: 0.85 });
        grid.tileState.set(idx, e);
      }
      if (!e.onFire) {
        e.onFire = true;
        e.fireAge = fireAge;
        grid.tileStateVersion = (grid.tileStateVersion ?? 0) + 1;
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
