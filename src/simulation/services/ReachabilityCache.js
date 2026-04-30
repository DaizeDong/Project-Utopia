// v0.8.13 — ReachabilityCache service (audit A2).
//
// Promotes "is there an A* path from worker tile X to nearest tile of types Y"
// from a 2.5-s TTL inside MortalitySystem to a per-(workerTile, tileTypes)
// cache keyed on grid.version. AI feasibility, planner gates, mortality
// probes, and consumeEmergencyRation all read the same fresh result so
// decisions agree within the same tick.
//
// v0.10.0 (FSM): the FSM `hungryAndFoodAvailable` condition + carry-eat
// fallback in SEEKING_FOOD.onEnter use this cache to skip orbit-on-
// unreachable-warehouse loops. The v0.9.x Job-layer target-finder that
// originally also drove this service was retired in v0.10.0-d.

import { aStar } from "../navigation/AStar.js";
import { listTilesByType, worldToTile } from "../../world/grid/Grid.js";
import { getEntityFaction } from "../navigation/Faction.js";

const DEFAULT_PROBE_BUDGET_PER_TICK = 8;

function tileTypesKey(targetTileTypes) {
  // Stable key independent of caller order. Numeric tile-type IDs sort
  // lexicographically the same way they sort numerically for our 0-13 range.
  const arr = Array.isArray(targetTileTypes)
    ? targetTileTypes.slice().sort((a, b) => Number(a) - Number(b))
    : [Number(targetTileTypes)];
  return arr.join(",");
}

function makeKey(workerTile, targetTileTypes) {
  return `${tileTypesKey(targetTileTypes)}|${workerTile.ix}_${workerTile.iz}`;
}

/**
 * Per-(workerTile, tileTypes) reachability cache.
 *
 * Cache entries store {reachable, sourceTile, gridVersion, computedAtTick}.
 * `isReachable` returns the cached entry if `state.grid.version` matches;
 * otherwise returns null so the caller can decide whether to probe.
 *
 * `probeAndCache` runs A* from the worker tile to the nearest matching tile
 * (via `findNearestTileOfTypes` + faction-aware aStar) and caches the result.
 * Honours a per-tick probe budget — read `state._reachabilityProbeBudget`
 * (default 8 per tick); skips and returns null when exhausted.
 */
export class ReachabilityCache {
  constructor() {
    this._cache = new Map();
    this._lastGridVersion = -1;
    this._stats = {
      hits: 0,
      misses: 0,
      probes: 0,
      gridInvalidations: 0,
      budgetSkips: 0,
    };
  }

  /**
   * Drop the cache when grid.version changes. Called automatically at the
   * top of `isReachable` and `probeAndCache`. Tracks invalidations in stats.
   */
  invalidateOnGridVersion(state) {
    const version = Number(state?.grid?.version ?? 0);
    if (version !== this._lastGridVersion) {
      if (this._cache.size > 0) {
        this._stats.gridInvalidations += 1;
      }
      this._cache.clear();
      this._lastGridVersion = version;
    }
  }

  /**
   * Returns the cached entry for (workerTile, targetTileTypes) when fresh,
   * or `null` when not yet probed (caller must decide whether to probe).
   *
   * Returned shape on hit: `{ reachable: boolean, sourceTile: {ix, iz} | null }`.
   */
  isReachable(workerTile, targetTileTypes, state /* , services */) {
    if (!workerTile) return null;
    this.invalidateOnGridVersion(state);
    const key = makeKey(workerTile, targetTileTypes);
    const entry = this._cache.get(key);
    if (entry && entry.gridVersion === this._lastGridVersion) {
      this._stats.hits += 1;
      return { reachable: entry.reachable, sourceTile: entry.sourceTile };
    }
    this._stats.misses += 1;
    return null;
  }

  /**
   * Run A* probe from worker tile to nearest matching tile, cache result,
   * return `{reachable, sourceTile}`. Honours `state._reachabilityProbeBudget`;
   * returns `null` when budget exhausted (caller should treat that as
   * "unknown" and either fall back to a stale snapshot or defer the
   * decision).
   *
   * `entity` is required for faction resolution (colony vs hostile gates).
   */
  probeAndCache(workerTile, targetTileTypes, state, services, entity = null) {
    if (!workerTile || !state?.grid) return null;
    this.invalidateOnGridVersion(state);

    // Per-tick probe budget — initialised to DEFAULT_PROBE_BUDGET_PER_TICK
    // when undefined. WorkerAISystem can lower this for high-load shedding.
    if (!Number.isFinite(state._reachabilityProbeBudget)) {
      state._reachabilityProbeBudget = DEFAULT_PROBE_BUDGET_PER_TICK;
    }
    if (state._reachabilityProbeBudget <= 0) {
      this._stats.budgetSkips += 1;
      return null;
    }

    // Inline nearest-tile-by-type search keyed on tile (ix, iz). The grid
    // helper expects entity-shaped {x, z} input, but the cache always
    // operates in tile coordinates — pulling the search inline avoids a
    // tile→world→tile round-trip.
    const tileList = listTilesByType(state.grid, targetTileTypes);
    let target = null;
    let bestDist = Infinity;
    for (let i = 0; i < tileList.length; i += 1) {
      const t = tileList[i];
      const d = Math.abs(t.ix - workerTile.ix) + Math.abs(t.iz - workerTile.iz);
      if (d < bestDist) {
        bestDist = d;
        target = t;
      }
    }
    if (!target) {
      const entry = {
        reachable: false,
        sourceTile: null,
        gridVersion: this._lastGridVersion,
        computedAtTick: Number(state.metrics?.tick ?? 0),
      };
      this._cache.set(makeKey(workerTile, targetTileTypes), entry);
      return { reachable: false, sourceTile: null };
    }

    if (target.ix === workerTile.ix && target.iz === workerTile.iz) {
      const entry = {
        reachable: true,
        sourceTile: target,
        gridVersion: this._lastGridVersion,
        computedAtTick: Number(state.metrics?.tick ?? 0),
      };
      this._cache.set(makeKey(workerTile, targetTileTypes), entry);
      return { reachable: true, sourceTile: target };
    }

    state._reachabilityProbeBudget -= 1;
    this._stats.probes += 1;

    // Faction-aware A* — matches what setTargetAndPath would actually
    // compute. v0.8.4 strategic walls + GATE.
    const faction = entity ? getEntityFaction(entity) : "colony";
    let path = services?.pathCache?.get?.(state.grid.version, workerTile, target, 0, faction) ?? null;
    if (!path) {
      path = aStar(state.grid, workerTile, target, state.weather?.moveCostMultiplier ?? 1, {
        tiles: state.weather?.hazardTileSet ?? null,
        penaltyMultiplier: state.weather?.hazardPenaltyMultiplier ?? 1,
      }, { faction });
      if (path) {
        services?.pathCache?.set?.(state.grid.version, workerTile, target, 0, faction, path);
      }
    }
    const reachable = Array.isArray(path) && path.length > 0;
    const entry = {
      reachable,
      sourceTile: reachable ? target : null,
      gridVersion: this._lastGridVersion,
      computedAtTick: Number(state.metrics?.tick ?? 0),
    };
    this._cache.set(makeKey(workerTile, targetTileTypes), entry);
    return { reachable, sourceTile: entry.sourceTile };
  }

  getStats() {
    return {
      hits: this._stats.hits,
      misses: this._stats.misses,
      probes: this._stats.probes,
      gridInvalidations: this._stats.gridInvalidations,
      budgetSkips: this._stats.budgetSkips,
      size: this._cache.size,
    };
  }
}

/**
 * Convenience helper used by callers that don't want to write the
 * "isReachable then probeAndCache" two-step every time. Returns
 * `{reachable, sourceTile}` (probing if necessary), or `null` when
 * the cache had no entry AND the probe budget was exhausted.
 *
 * Most call sites should use this; the two-step API is exposed for
 * cases where the caller cares whether a probe ran (e.g. tests).
 */
export function getOrProbeReachability(cache, workerTile, targetTileTypes, state, services, entity = null) {
  const cached = cache.isReachable(workerTile, targetTileTypes, state, services);
  if (cached) return cached;
  return cache.probeAndCache(workerTile, targetTileTypes, state, services, entity);
}

/**
 * Helper for callers that derive `workerTile` from an entity position.
 */
export function reachabilityForEntity(cache, entity, targetTileTypes, state, services) {
  if (!entity || !state?.grid) return null;
  const tile = worldToTile(entity.x, entity.z, state.grid);
  return getOrProbeReachability(cache, tile, targetTileTypes, state, services, entity);
}
