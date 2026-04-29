// v0.8.4 strategic walls + GATE — Agent C
//
// Faction-aware passability. Walls and gates have always been on the map but
// pre-v0.8.4 they blocked everyone symmetrically — workers couldn't enter
// their own walled compound, raiders couldn't either. The gate tile fixes
// the colony side: gates are passable for the colony faction and blocked
// for hostile/neutral factions. Walls remain impassable for everyone.
//
// `getEntityFaction(entity)` derives a stable faction tag from the
// canonical entity fields:
//   - WORKER (any role, including GUARD)               → "colony"
//   - VISITOR (TRADER subtype)                          → "colony"
//   - VISITOR (SABOTEUR subtype)                        → "hostile"
//   - ANIMAL  (HERBIVORE)                               → "neutral"
//   - ANIMAL  (PREDATOR, incl. raider_beast)            → "hostile"
//   - any unknown shape                                 → "colony" (safe default)
//
// `isTilePassableForFaction(tileType, faction)` is the gate the AStar
// neighbour-loop calls. It enforces:
//   - WALL: never passable for any faction.
//   - GATE: passable only for "colony" faction.
//   - WATER: always blocked (delegated to TILE_INFO.passable, which is
//     `false`). The caller still consults TILE_INFO.passable separately
//     for non-faction-aware blocks; this helper layers faction checks on
//     top.
//
// Wiring lives in:
//   - AStar.js: passes options.faction (default "colony") through the
//     neighbour loop.
//   - Navigation.js: derives faction via getEntityFaction(entity) and
//     threads it into AStar + PathCache + worker pool.
//   - PathCache.js: caches paths keyed by faction so colony/hostile
//     searches never collide.
//   - PathWorkerPool.js / pathWorker.js: faction propagated through
//     payloads.
//
// See docs/superpowers/plans/2026-04-28-building-construction-walls-recruit.md
// § 4 for the full design contract.
import { TILE } from "../../config/constants.js";

export const FACTION = Object.freeze({
  COLONY: "colony",
  HOSTILE: "hostile",
  NEUTRAL: "neutral",
});

/**
 * @param {object|null|undefined} entity
 * @returns {"colony" | "hostile" | "neutral"}
 */
export function getEntityFaction(entity) {
  if (!entity) return FACTION.COLONY;
  const entityType = String(entity.type ?? "");
  if (entityType === "WORKER") return FACTION.COLONY;
  if (entityType === "VISITOR") {
    const kind = String(entity.kind ?? "");
    return kind === "SABOTEUR" ? FACTION.HOSTILE : FACTION.COLONY;
  }
  if (entityType === "ANIMAL") {
    const kind = String(entity.kind ?? "");
    return kind === "PREDATOR" ? FACTION.HOSTILE : FACTION.NEUTRAL;
  }
  return FACTION.COLONY;
}

/**
 * Faction-aware passability check. WALL is always blocked. GATE is only
 * passable for the colony faction. All other tiles defer to the caller's
 * `TILE_INFO.passable` check (for things like water).
 *
 * Note: callers should still consult `TILE_INFO.passable` first for
 * non-faction blocks (water, etc.). This helper only encodes the
 * faction-specific delta.
 *
 * @param {number} tileType
 * @param {string} faction — typically the result of `getEntityFaction`
 * @returns {boolean}
 */
export function isTilePassableForFaction(tileType, faction) {
  if (tileType === TILE.WALL) return false;
  if (tileType === TILE.GATE) return faction === FACTION.COLONY;
  return true;
}
