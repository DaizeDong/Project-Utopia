/**
 * TileMutationHooks — centralized cleanup that must fire whenever a tile's
 * type changes mid-simulation (sabotage RUINS, demolition, wildfire, build,
 * LLM-placed structures, etc.).
 *
 * Background: tile mutations cascade into many subsystems — building counts,
 * worker reservations, worker target/path, A* path cache, tileState fertility,
 * and ProcessingSystem cooldown timers. Without a single cleanup pass, a
 * Saboteur turning a FARM into RUINS leaves workers frozen with stale paths
 * and stale reservations on the destroyed tile, while ResourceSystem (which
 * rebuilds buildings counts next tick) runs AFTER WorkerAISystem in
 * SYSTEM_ORDER — so within the sabotage tick workers see stale farm counts.
 *
 * Use `mutateTile(state, ix, iz, newTile)` whenever you change a tile during
 * the simulation. It calls setTile() (which already handles tileState +
 * grid.version + tileStateVersion) and then runs the cascade cleanup.
 */
import { TILE } from "../../config/constants.js";
import { BALANCE } from "../../config/balance.js";
import { setTile, rebuildBuildingStats } from "../../world/grid/Grid.js";

/**
 * Tiles that block pathfinding (or that, when arrived at, no longer match a
 * worker's expected target type). Mutating to one of these requires path /
 * target invalidation. Mutating to anything else (e.g. GRASS→FARM, GRASS→ROAD)
 * leaves the path physically walkable — the worker either keeps walking or
 * re-paths lazily on the next tick via grid.version mismatch. Doing aggressive
 * path-nuking here triggered a long-horizon DevIndex regression because
 * workers re-pathed every time a road or building was placed nearby.
 */
const BLOCKING_TILES = new Set([TILE.RUINS, TILE.WALL, TILE.WATER]);

/**
 * Apply cascade cleanup after a tile changes type. Idempotent — safe to call
 * even if oldTile === newTile (will early-return).
 *
 * @param {import("../../app/types.js").GameState} state
 * @param {number} ix
 * @param {number} iz
 * @param {number} oldTile
 * @param {number} newTile
 */
export function onTileMutated(state, ix, iz, oldTile, newTile) {
  if (oldTile === newTile) return;
  if (!state || !state.grid) return;

  // 1. Rebuild building counts synchronously so any system that runs LATER in
  //    the SAME tick (e.g. WorkerAISystem after WorldEventSystem) sees the
  //    new counts and doesn't pick the destroyed tile as a target.
  state.buildings = rebuildBuildingStats(state.grid);

  // 2. Release any worker reservation on this tile.
  const reservation = state._jobReservation;
  if (reservation && typeof reservation.releaseTile === "function") {
    reservation.releaseTile(ix, iz);
  }

  // 3. Invalidate worker target/path. Two distinct cases:
  //    (a) targetTile points at THIS tile and the new type is not a worker
  //        work-site (was FARM → now RUIN/GRASS) — the worker's intent is
  //        invalidated, force retarget next tick.
  //    (b) path passes through THIS tile AND the new tile is impassable
  //        (RUIN/WALL/WATER) — the worker can't physically walk through.
  //
  //    For non-blocking transitions (GRASS→ROAD, GRASS→FARM), we deliberately
  //    skip path invalidation: setTile() already bumped grid.version so the
  //    next hasActivePath() call refreshes lazily, and the path is still
  //    physically walkable in the meantime. Aggressive eager invalidation
  //    here caused workers to re-path every time a tile was built nearby,
  //    measurably degrading long-horizon throughput.
  const newBlocks = BLOCKING_TILES.has(newTile);
  const agents = Array.isArray(state.agents) ? state.agents : [];
  for (const agent of agents) {
    if (!agent || agent.alive === false) continue;
    const target = agent.targetTile;
    const targetMatches = target && target.ix === ix && target.iz === iz;
    let pathBlockedHere = false;
    if (newBlocks && Array.isArray(agent.path)) {
      for (let i = 0; i < agent.path.length; i += 1) {
        const step = agent.path[i];
        if (step && step.ix === ix && step.iz === iz) {
          pathBlockedHere = true;
          break;
        }
      }
    }
    if (targetMatches || pathBlockedHere) {
      if (targetMatches) agent.targetTile = null;
      agent.path = null;
      agent.pathIndex = 0;
      agent.pathGridVersion = -1;
      agent.pathTrafficVersion = 0;
      // v0.8.6 Tier 2 F5: also zero the agent's desired velocity. Without
      // this the agent kept drifting toward the now-invalid path's last
      // computed direction for ≥1 tick (300ms+), occasionally walking onto
      // the just-mutated blocking tile and getting wedged.
      if (agent.desiredVel) {
        agent.desiredVel.x = 0;
        agent.desiredVel.z = 0;
      } else {
        agent.desiredVel = { x: 0, z: 0 };
      }
      if (agent.blackboard) {
        agent.blackboard.pendingPathWorkerKey = "";
        agent.blackboard.pendingPathTargetTile = null;
      }
    }
  }

  // 4. Mark this tile-key as destroyed so ProcessingSystem (and any other
  //    keyed-by-tile cache) can lazily drop its entry on next tick. We use a
  //    Set rather than direct mutation because ProcessingSystem instances are
  //    not stored on state. ProcessingSystem drains this set each tick.
  const tileKey = `${ix},${iz}`;
  if (!state._tileMutationDirtyKeys) {
    state._tileMutationDirtyKeys = new Set();
  }
  state._tileMutationDirtyKeys.add(tileKey);

  // 5. v0.8.4 strategic walls + GATE (Agent C) — wallHp / gateHp lifecycle.
  //    When a tile *becomes* a WALL or GATE, seed the per-tile hp pool so
  //    AnimalAISystem / VisitorAISystem can attack it. When a tile *was* a
  //    WALL or GATE and is no longer, clear the pool so a future build on
  //    the same coords doesn't inherit stale hp. Per-tile state lives on
  //    grid.tileState.get(idx) — the same map setTile() seeds with
  //    fertility / yieldPool / nodeFlags.
  //
  //    setTile preserves a tileState entry for WALL (lumped with ROAD/
  //    BRIDGE) but does NOT have a branch for GATE (a v0.8.4 addition); a
  //    GATE placement currently falls through to the delete branch unless
  //    nodeFlags/yieldPool happen to be non-zero. To keep this hook
  //    self-contained — and to avoid editing Grid.js (broad ownership) —
  //    we lazily create a tileState entry here when wallHp needs to be
  //    seeded. Same `Map<idx, entry>` shape; downstream consumers
  //    (rendering, attack logic, save/load) read wallHp via .get(idx).
  const idx = ix + iz * state.grid.width;
  if (newTile === TILE.WALL || newTile === TILE.GATE) {
    const tileState = state.grid.tileState;
    if (tileState) {
      let entry = tileState.get(idx);
      if (!entry) {
        // Lazily create a minimal entry shape so wallHp has a place to live.
        // Mirrors createTileStateEntry's defaults so nothing downstream
        // reads `undefined` on the previously-empty fields.
        entry = {
          fertility: 0,
          wear: 0,
          growthStage: 0,
          salinized: 0,
          fallowUntil: 0,
          yieldPool: 0,
          nodeFlags: 0,
          lastHarvestTick: -1,
        };
        tileState.set(idx, entry);
      }
      // v0.8.5 Tier 3: gates use gateMaxHp (75) for differentiated HP from walls (50).
      entry.wallHp = newTile === TILE.GATE
        ? Number(BALANCE.gateMaxHp ?? BALANCE.wallMaxHp ?? 50)
        : Number(BALANCE.wallMaxHp ?? 50);
    }
  } else if (oldTile === TILE.WALL || oldTile === TILE.GATE) {
    const tileState = state.grid.tileState;
    if (tileState) {
      const entry = tileState.get(idx);
      if (entry && entry.wallHp != null) {
        // Drop the wallHp field (back to undefined). The rest of the
        // tileState entry stays intact (nodeFlags, yieldPool, etc.) per the
        // setTile preservation pass.
        delete entry.wallHp;
      }
      // v0.8.5 Tier 2 S2: also drop the regen damage timestamp when the
      // wall/gate is removed so a fresh build doesn't inherit stale state.
      if (entry && entry.lastWallDamageTick != null) {
        delete entry.lastWallDamageTick;
      }
    }
  }
}

/**
 * Mutate a tile + run cleanup cascade. Returns true if the tile actually
 * changed type, false if it was already the requested type or out-of-bounds.
 *
 * Prefer this over calling `setTile` directly during simulation. Scenario
 * generation (pre-state-init) can use raw setTile since no agents exist yet.
 *
 * @param {import("../../app/types.js").GameState} state
 * @param {number} ix
 * @param {number} iz
 * @param {number} newTile
 * @returns {boolean}
 */
export function mutateTile(state, ix, iz, newTile) {
  const grid = state?.grid;
  if (!grid) return false;
  const idx = ix + iz * grid.width;
  const oldTile = grid.tiles[idx];
  const changed = setTile(grid, ix, iz, newTile);
  if (!changed) return false;
  onTileMutated(state, ix, iz, oldTile, newTile);
  return true;
}
