// v0.8.4 building-construction (Agent A) — test helper for instant placement.
//
// In production, BuildSystem.placeToolAt now defaults to blueprint mode
// (overlay → workers labour → ConstructionSystem completes the tile). Tests
// that want the legacy "tile mutates immediately" semantics should opt in
// via this helper, which routes through `{ instant: true }`.
//
// Usage:
//   import { placeBuildingInstant } from "./helpers/build.js";
//   placeBuildingInstant(buildSystem, state, "warehouse", 5, 5);
//
// The helper intentionally accepts the buildSystem instance so callers
// keep a single source of authority for build history / event listeners.

/**
 * Place a building immediately (test/migration shim).
 *
 * @param {object} buildSystem — a BuildSystem instance
 * @param {object} state — the game state
 * @param {string} tool — build tool name (e.g. "warehouse", "wall")
 * @param {number} ix
 * @param {number} iz
 * @param {object} [options] — extra placeToolAt options
 * @returns {object} BuildSystem.placeToolAt return value
 */
export function placeBuildingInstant(buildSystem, state, tool, ix, iz, options = {}) {
  return buildSystem.placeToolAt(state, tool, ix, iz, { ...options, instant: true });
}
