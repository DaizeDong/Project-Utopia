import { FOG_STATE } from "../config/constants.js";

/**
 * FogOverlay — Phase 3 / M1b shader-based fog-of-war layer.
 *
 * Reads `state.fog.visibility` once per frame and tints the tile plane:
 *   VISIBLE  → 0.00 opacity (transparent, full color)
 *   EXPLORED → 0.45 opacity (dimmed, remembered)
 *   HIDDEN   → 0.90 opacity (near-black)
 *
 * NOTE: The full shader pipeline (data-texture upload + custom material with
 * a tile-indexed fragment sampler) is deferred to Phase 7. For now this class
 * is a wiring stub that downstream code can call without crashing. The minimap
 * already renders the player-facing fog tint in the 2D UI layer.
 *
 * TODO (Phase 7): replace the stub with:
 *   1. A THREE.DataTexture backed by a Uint8Array sized grid.width × grid.height.
 *   2. A ShaderMaterial that samples the data texture per fragment and blends
 *      a dark overlay over the base scene using the three FOG_STATE values.
 *   3. Dirty-flag driven `needsUpdate` using `state.fog.version`.
 */
export class FogOverlay {
  constructor() {
    this.name = "FogOverlay";
    this.mesh = null;
    this.lastFogVersion = -1;
    this.lastVisibilityLength = 0;
  }

  /**
   * Attach the fog mesh to the scene. Stub — creates no Three.js objects yet
   * so it is safe to call from headless / test contexts.
   * @param {object} _scene Three.js Scene (ignored in stub)
   */
  attach(_scene) {
    // TODO (Phase 7): construct PlaneGeometry + ShaderMaterial, add to scene.
  }

  /**
   * Called once per render frame. Reads the fog array from state and marks
   * the overlay for a GPU upload when the version changes.
   * @param {object} state GameState with optional state.fog.visibility.
   */
  update(state) {
    const fog = state?.fog;
    if (!fog || !(fog.visibility instanceof Uint8Array)) return;
    const version = Number(fog.version ?? 0);
    if (version === this.lastFogVersion && fog.visibility.length === this.lastVisibilityLength) {
      return;
    }
    this.lastFogVersion = version;
    this.lastVisibilityLength = fog.visibility.length;
    // TODO (Phase 7): upload `fog.visibility` into the data texture here.
    // A single fragment check vs FOG_STATE yields the three opacity bands.
    void FOG_STATE;
  }

  /**
   * Detach and release GPU resources. Stub.
   */
  dispose() {
    this.mesh = null;
  }
}
