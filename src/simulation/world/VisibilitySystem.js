import { BALANCE } from "../../config/balance.js";
import { FOG_STATE } from "../../config/constants.js";
import { worldToTile } from "../../world/grid/Grid.js";

/**
 * VisibilitySystem — Phase 3 / M1b fog of war.
 *
 * Maintains a per-tile visibility array (`state.fog.visibility`) with three
 * states (HIDDEN → EXPLORED → VISIBLE). VISIBLE is a one-tick state (only
 * tiles inside an actor's reveal radius during the current tick). EXPLORED is
 * sticky memory of anything previously revealed but currently out of sight.
 *
 * Runs immediately after SimulationClock so downstream systems read a
 * freshly-updated fog array.
 *
 * State shape:
 *   state.fog = {
 *     visibility: Uint8Array(width × height),
 *     version: number, // incremented whenever any tile changes state
 *   }
 */
/**
 * R13 Plan-R13-fog-aware-build (#5+#7) — fog-respect helper exported as a
 * standalone function for proposers/autopilot pickers that don't need a
 * VisibilitySystem instance. Mirrors `VisibilitySystem.isTileExplored`.
 */
export function isTileExplored(state, ix, iz) {
  const fog = state?.fog;
  if (!fog?.visibility) return true;
  const w = Number(state?.grid?.width ?? 0);
  const h = Number(state?.grid?.height ?? 0);
  if (ix < 0 || iz < 0 || ix >= w || iz >= h) return false;
  const idx = ix + iz * w;
  if (idx < 0 || idx >= fog.visibility.length) return false;
  const v = fog.visibility[idx];
  return v === FOG_STATE.EXPLORED || v === FOG_STATE.VISIBLE;
}

export class VisibilitySystem {
  constructor() {
    this.name = "VisibilitySystem";
  }

  update(_dt, state, _services) {
    const grid = state?.grid;
    if (!grid) return;
    const width = Number(grid.width ?? 0);
    const height = Number(grid.height ?? 0);
    if (width <= 0 || height <= 0) return;

    const enabled = Boolean(BALANCE.fogEnabled ?? true);
    const radius = Math.max(0, Number(BALANCE.fogRevealRadius ?? 5));
    const initialRadius = Math.max(0, Number(BALANCE.fogInitialRevealRadius ?? 4));

    const fog = state.fog ?? (state.fog = { visibility: null, version: 0 });
    if (!(fog.visibility instanceof Uint8Array) || fog.visibility.length !== width * height) {
      fog.visibility = new Uint8Array(width * height);
      fog.version = Number(fog.version ?? 0) + 1;

      if (!enabled) {
        // Master toggle off: reveal everything once and skip per-tick work.
        fog.visibility.fill(FOG_STATE.VISIBLE);
        return;
      }

      // Seed initial reveal around the colony spawn (fallback: map center).
      const spawn = this.#resolveSpawn(state, width, height);
      this.#seedInitialReveal(fog.visibility, width, height, spawn, initialRadius);
    }

    if (!enabled) {
      // Fog disabled mid-run: leave visibility as-is, don't downgrade.
      return;
    }

    const vis = fog.visibility;
    let changed = false;

    // Pass 1 — collect current VISIBLE tiles and downgrade to EXPLORED. Any
    // tile touched by an actor this tick will be re-upgraded to VISIBLE below.
    for (let i = 0; i < vis.length; i += 1) {
      if (vis[i] === FOG_STATE.VISIBLE) {
        vis[i] = FOG_STATE.EXPLORED;
        changed = true;
      }
    }

    // Pass 2 — reveal a Manhattan square around every live actor.
    for (const agent of state.agents ?? []) {
      if (!agent || agent.alive === false) continue;
      if (!Number.isFinite(agent.x) || !Number.isFinite(agent.z)) continue;
      const { ix, iz } = worldToTile(agent.x, agent.z, grid);
      if (!Number.isFinite(ix) || !Number.isFinite(iz)) continue;
      const minZ = Math.max(0, iz - radius);
      const maxZ = Math.min(height - 1, iz + radius);
      const minX = Math.max(0, ix - radius);
      const maxX = Math.min(width - 1, ix + radius);
      for (let z = minZ; z <= maxZ; z += 1) {
        const dz = Math.abs(z - iz);
        const rowMinX = Math.max(minX, ix - (radius - dz));
        const rowMaxX = Math.min(maxX, ix + (radius - dz));
        for (let x = rowMinX; x <= rowMaxX; x += 1) {
          const idx = x + z * width;
          const before = vis[idx];
          if (before !== FOG_STATE.VISIBLE) {
            vis[idx] = FOG_STATE.VISIBLE;
            changed = true;
          }
        }
      }
    }

    if (changed) fog.version = Number(fog.version ?? 0) + 1;
  }

  #resolveSpawn(state, width, height) {
    const sp = state?.world?.spawn;
    if (sp && Number.isFinite(sp.ix) && Number.isFinite(sp.iz)) {
      return { ix: Math.max(0, Math.min(width - 1, Math.floor(sp.ix))), iz: Math.max(0, Math.min(height - 1, Math.floor(sp.iz))) };
    }
    const anchors = state?.gameplay?.scenario?.anchors ?? {};
    const core = anchors.coreWarehouse;
    if (core && Number.isFinite(core.ix) && Number.isFinite(core.iz)) {
      return { ix: Math.max(0, Math.min(width - 1, Math.floor(core.ix))), iz: Math.max(0, Math.min(height - 1, Math.floor(core.iz))) };
    }
    return { ix: Math.floor(width / 2), iz: Math.floor(height / 2) };
  }

  /**
   * R13 Plan-R13-fog-aware-build (#5+#7) — fog-respect helper.
   *
   * Returns true iff the tile is EXPLORED or VISIBLE (i.e. the autopilot /
   * proposer chain has "knowledge" of it). Returns true when fog is disabled
   * (no fog state present) so callers don't need to special-case the master
   * toggle. Returns false for out-of-bounds indices.
   *
   * Used by autopilot tile-pickers to skip HIDDEN candidates (they would
   * be rejected later by `evaluateBuildPreview` with reason "hidden_tile",
   * but checking here lets the picker keep searching instead of returning
   * a guaranteed-fail tile and aborting the build slot).
   */
  static isTileExplored(state, ix, iz) {
    const fog = state?.fog;
    if (!fog?.visibility) return true;
    const w = Number(state?.grid?.width ?? 0);
    const h = Number(state?.grid?.height ?? 0);
    if (ix < 0 || iz < 0 || ix >= w || iz >= h) return false;
    const idx = ix + iz * w;
    if (idx < 0 || idx >= fog.visibility.length) return false;
    const v = fog.visibility[idx];
    return v === FOG_STATE.EXPLORED || v === FOG_STATE.VISIBLE;
  }

  #seedInitialReveal(vis, width, height, center, radius) {
    const minZ = Math.max(0, center.iz - radius);
    const maxZ = Math.min(height - 1, center.iz + radius);
    const minX = Math.max(0, center.ix - radius);
    const maxX = Math.min(width - 1, center.ix + radius);
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        // Box reveal — use Chebyshev (square) so the result is exactly
        // (2r+1)² tiles with r=fogInitialRevealRadius, as the spec describes.
        if (Math.max(Math.abs(x - center.ix), Math.abs(z - center.iz)) > radius) continue;
        vis[x + z * width] = FOG_STATE.EXPLORED;
      }
    }
  }
}
