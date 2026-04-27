import { FOG_STATE } from "../../config/constants.js";

/**
 * Minimap — Phase 3 / M1b thin 2D minimap renderer with fog tint.
 *
 * A canvas-based minimap that reads state.grid + state.fog.visibility and
 * paints a darkened overlay over HIDDEN tiles (and a milder one over EXPLORED).
 * Kept deliberately small; the full HUD minimap (zoom/pan/icons) is outside
 * this phase's scope.
 */
export class Minimap {
  constructor(canvas = null) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext?.("2d") ?? null;
  }

  /**
   * Render the minimap to `this.canvas`. Tiles flagged HIDDEN get a dark
   * tint; EXPLORED get a milder tint; VISIBLE render unmodified.
   * @param {object} state Game state (with grid, optional fog.visibility).
   */
  render(state) {
    if (!this.ctx || !this.canvas || !state?.grid) return;
    const grid = state.grid;
    const width = Number(grid.width ?? 0);
    const height = Number(grid.height ?? 0);
    if (width <= 0 || height <= 0) return;
    const cellW = this.canvas.width / width;
    const cellH = this.canvas.height / height;
    const vis = state.fog?.visibility ?? null;
    if (!(vis instanceof Uint8Array)) return;
    for (let iz = 0; iz < height; iz += 1) {
      for (let ix = 0; ix < width; ix += 1) {
        const fs = vis[ix + iz * width];
        if (fs === FOG_STATE.HIDDEN) {
          this.ctx.fillStyle = "rgba(0,0,0,0.9)";
        } else if (fs === FOG_STATE.EXPLORED) {
          this.ctx.fillStyle = "rgba(0,0,0,0.45)";
        } else {
          continue;
        }
        this.ctx.fillRect(ix * cellW, iz * cellH, cellW + 1, cellH + 1);
      }
    }
  }
}
