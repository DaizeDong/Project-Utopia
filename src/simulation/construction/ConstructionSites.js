/**
 * ConstructionSites — helpers for the v0.8.4 construction-in-progress system.
 *
 * Authoritative state for any in-progress build/demolish lives on the
 * tile's `tileState.construction` overlay (see plan §1.3). This module
 * mirrors that into `state.constructionSites`, an indexed array used by
 *   - WorkerAISystem.handleConstruct → quickly find/assign a builder site
 *   - ConstructionSystem.update      → tick completion checks
 *   - SceneRenderer                  → draw blueprint meshes
 *   - RoleAssignmentSystem           → size the BUILDER quota
 *
 * The mirror is recomputed via small mutators (push/splice) plus a full
 * rebuild that scans tileState (used after snapshot load).
 */
import { BALANCE } from "../../config/balance.js";
import { TILE } from "../../config/constants.js";
import { getTileState, setTileField, toIndex } from "../../world/grid/Grid.js";

/**
 * Returns the BALANCE work-time (seconds) required for the given build
 * tool, or a sensible default. Roads / light tiles complete fast, large
 * buildings take longer.
 *
 * @param {string} tool
 * @returns {number}
 */
export function getBuildWorkSec(tool) {
  const table = BALANCE.constructionWorkSec ?? {};
  const v = Number(table[tool]);
  if (Number.isFinite(v) && v > 0) return v;
  return Number(table.default ?? 4.0);
}

/**
 * Returns the BALANCE work-time (seconds) required to demolish the given
 * old tile. Ruins clear fastest; walls/gates are intermediate; built
 * structures fall back to `default`.
 *
 * @param {number} oldTile — TILE.* the demolisher is removing
 * @returns {number}
 */
export function getDemolishWorkSec(oldTile) {
  const table = BALANCE.demolishWorkSec ?? {};
  if (oldTile === TILE.RUINS) return Number(table.ruins ?? 1.5);
  if (oldTile === TILE.WALL) return Number(table.wall ?? 2.5);
  if (oldTile === TILE.GATE) return Number(table.gate ?? 2.5);
  return Number(table.default ?? 3.0);
}

/**
 * Push a new construction-site index entry. Caller is responsible for
 * having already written the authoritative overlay to
 * `tileState.get(idx).construction`. We just maintain the mirror.
 *
 * @param {object} state
 * @param {object} entry — { ix, iz, kind, tool, ... }
 */
export function pushConstructionSite(state, entry) {
  state.constructionSites ??= [];
  state.constructionSites.push(entry);
}

/**
 * Remove the construction-site index entry at (ix, iz), if any. The
 * authoritative overlay on tileState should already be cleared by the
 * caller (or be on its way out).
 *
 * @param {object} state
 * @param {number} ix
 * @param {number} iz
 * @returns {object|null} the removed entry, or null if none
 */
export function spliceConstructionSite(state, ix, iz) {
  const arr = Array.isArray(state.constructionSites) ? state.constructionSites : null;
  if (!arr) return null;
  for (let i = 0; i < arr.length; i += 1) {
    const s = arr[i];
    if (s && s.ix === ix && s.iz === iz) {
      arr.splice(i, 1);
      return s;
    }
  }
  return null;
}

/**
 * Find an existing site at (ix, iz). Returns null if none.
 *
 * @param {object} state
 * @param {number} ix
 * @param {number} iz
 * @returns {object|null}
 */
export function findConstructionSite(state, ix, iz) {
  const arr = Array.isArray(state.constructionSites) ? state.constructionSites : null;
  if (!arr) return null;
  for (const s of arr) {
    if (s && s.ix === ix && s.iz === iz) return s;
  }
  return null;
}

/**
 * Rebuild the entire `state.constructionSites` array from `tileState`.
 * Used after snapshot restore (the overlay survives, but the index does
 * not).
 *
 * @param {object} state
 */
export function rebuildConstructionSites(state) {
  const out = [];
  const grid = state?.grid;
  if (grid?.tileState?.forEach) {
    grid.tileState.forEach((entry, idx) => {
      const overlay = entry?.construction;
      if (!overlay) return;
      const ix = idx % grid.width;
      const iz = (idx - ix) / grid.width;
      out.push({
        ix,
        iz,
        kind: overlay.kind,
        tool: overlay.tool,
        builderId: overlay.builderId ?? null,
        workAppliedSec: Number(overlay.workAppliedSec ?? 0),
        workTotalSec: Number(overlay.workTotalSec ?? 0),
      });
    });
  }
  state.constructionSites = out;
}

/**
 * Read the canonical construction overlay for a tile (or null if none).
 * Centralised here so callers don't accidentally read a stale mirror.
 *
 * @param {object} state
 * @param {number} ix
 * @param {number} iz
 * @returns {object|null}
 */
export function getConstructionOverlay(state, ix, iz) {
  const entry = getTileState(state.grid, ix, iz);
  return entry?.construction ?? null;
}

/**
 * Find an unassigned construction site for `worker`, or return the site
 * already reserved by this builder if it still exists. Mutates: assigns
 * `builderId` on both the index entry and the authoritative overlay so
 * that subsequent ticks (and other workers) respect the reservation.
 *
 * Selection heuristic: prefer the site already reserved by this worker;
 * otherwise pick the unassigned site whose Manhattan distance from the
 * worker is smallest.
 *
 * @param {object} state
 * @param {object} worker
 * @returns {object|null} site index entry, or null
 */
export function findOrReserveBuilderSite(state, worker) {
  const arr = Array.isArray(state.constructionSites) ? state.constructionSites : null;
  if (!arr || arr.length === 0) return null;
  const wx = Number(worker.x ?? 0);
  const wz = Number(worker.z ?? 0);
  const grid = state.grid;
  // Prefer worker's existing reservation
  for (const site of arr) {
    if (!site) continue;
    if (site.builderId && site.builderId === worker.id) {
      // Re-sync mirror with overlay to keep the FSM honest
      const overlay = getConstructionOverlay(state, site.ix, site.iz);
      if (overlay) {
        site.workAppliedSec = Number(overlay.workAppliedSec ?? 0);
        site.workTotalSec = Number(overlay.workTotalSec ?? 0);
      }
      return site;
    }
  }
  // Otherwise pick nearest unassigned site
  let best = null;
  let bestDist = Infinity;
  for (const site of arr) {
    if (!site) continue;
    if (site.builderId && site.builderId !== worker.id) continue;
    if (!grid) continue;
    // Approximate distance via tileToWorld math: tile centre offset from
    // worker — Manhattan in tile units is fine for selection.
    const tileCenterX = (site.ix - grid.width / 2 + 0.5) * grid.tileSize;
    const tileCenterZ = (site.iz - grid.height / 2 + 0.5) * grid.tileSize;
    const d = Math.abs(tileCenterX - wx) + Math.abs(tileCenterZ - wz);
    if (d < bestDist) {
      bestDist = d;
      best = site;
    }
  }
  if (!best) return null;
  best.builderId = worker.id;
  // Reflect on the overlay so the next system tick (or another worker)
  // sees the reservation.
  const overlay = getConstructionOverlay(state, best.ix, best.iz);
  if (overlay) overlay.builderId = worker.id;
  return best;
}

/**
 * Release any builder reservation held by this worker (e.g. on death,
 * role change, or completion).
 *
 * @param {object} state
 * @param {object} worker
 */
export function releaseBuilderSite(state, worker) {
  const arr = Array.isArray(state.constructionSites) ? state.constructionSites : null;
  if (!arr) return;
  for (const site of arr) {
    if (!site) continue;
    if (site.builderId === worker.id) {
      site.builderId = null;
      const overlay = getConstructionOverlay(state, site.ix, site.iz);
      if (overlay) overlay.builderId = null;
    }
  }
}

/**
 * Increment workAppliedSec on the overlay AND mirror entry by `dt`. We
 * write to the overlay via direct property mutation (the tileState entry
 * is a plain object; setTileField is for typed fields tracked by the
 * change-version machinery, but the overlay ticks every frame and we
 * don't want to inflate `tileStateVersion` on each accumulation).
 *
 * @param {object} state
 * @param {number} ix
 * @param {number} iz
 * @param {number} dt — seconds to add
 * @returns {object|null} updated overlay, or null if missing
 */
export function applyConstructionWork(state, ix, iz, dt) {
  const overlay = getConstructionOverlay(state, ix, iz);
  if (!overlay) return null;
  overlay.workAppliedSec = Math.max(0, Number(overlay.workAppliedSec ?? 0)) + Math.max(0, Number(dt) || 0);
  // Mirror the per-frame progress into the index entry so renderer reads
  // are cheap (no tileState lookup per blueprint).
  const arr = Array.isArray(state.constructionSites) ? state.constructionSites : null;
  if (arr) {
    for (const site of arr) {
      if (site && site.ix === ix && site.iz === iz) {
        site.workAppliedSec = overlay.workAppliedSec;
        site.workTotalSec = Number(overlay.workTotalSec ?? site.workTotalSec ?? 0);
        break;
      }
    }
  }
  return overlay;
}

/**
 * Write the construction overlay onto a tile's tileState. Resources have
 * already been spent by the caller (BuildSystem.placeToolAt); this just
 * persists the metadata + bumps the tileState change version.
 *
 * @param {object} state
 * @param {number} ix
 * @param {number} iz
 * @param {object} overlay
 */
export function setConstructionOverlay(state, ix, iz, overlay) {
  setTileField(state.grid, ix, iz, "construction", overlay);
}

/**
 * Clear the overlay on a tile (called on completion or cancel).
 *
 * @param {object} state
 * @param {number} ix
 * @param {number} iz
 */
export function clearConstructionOverlay(state, ix, iz) {
  // Use setTileField with `null` so the change-version still bumps and
  // any downstream cache (renderer signature) re-evaluates.
  setTileField(state.grid, ix, iz, "construction", null);
  const grid = state?.grid;
  if (!grid?.tileState) return;
  const idx = toIndex(ix, iz, grid.width);
  const entry = grid.tileState.get(idx);
  if (entry && "construction" in entry) {
    delete entry.construction;
  }
}
