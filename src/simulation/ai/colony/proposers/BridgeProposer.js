// src/simulation/ai/colony/proposers/BridgeProposer.js
//
// v0.10.1 R6 wave-2 (C1-code-architect refactor):
// Extracted verbatim from ColonyDirectorSystem.js#proposeBridgesForReachability
// (parent commit 93497ba, lines 477-530).
//
// NOTE on shape: this is NOT a pure {name, evaluate} proposer in the
// wave-1 sense — it performs SIDE EFFECTS (places a bridge blueprint
// via buildSystem.placeToolAt and mutates state.buildings via
// rebuildBuildingStats). The wave-1 BuildProposer interface mandates
// `evaluate(state, ctx) => BuildNeed[]` with read-only state access;
// shoehorning a side-effecting placement into that contract would
// either break the read-only invariant locked by
// `test/build-proposer-interface.test.js` or require pushing the
// placement loop back into the orchestrator (a much bigger refactor
// than the C1 wave-2 scope budget allows).
//
// Resolution: extract the function into the proposers/ directory for
// code-locality (one file per safety-net proposer-like unit), but
// expose it as a standalone function called directly from
// ColonyDirectorSystem.update. It is NOT registered in
// WAVE_2_BUILD_PROPOSERS — the registered proposers there are the four
// pure {evaluate} ones (Recovery / Bootstrap / Logistics / Processing).
// This deviation from the plan's "WAVE_2_BUILD_PROPOSERS = [..., Bridge,
// ScoutRoad]" line is documented in C1-code-architect.commit.md.
//
// Behaviour preserved exactly: 30-sim-second throttle via
// director.lastBridgeProposalSec, narrow-water heuristic (≥2 land
// neighbours on opposite axes), nearest-warehouse preference, and the
// affordability check via canAfford.

import { BUILD_COST } from "../../../../config/balance.js";
import { TILE } from "../../../../config/constants.js";
import { listTilesByType, rebuildBuildingStats } from "../../../../world/grid/Grid.js";
import { canAfford } from "../../../construction/BuildAdvisor.js";

/**
 * @param {object} state — game state
 * @param {object} buildSystem — BuildSystem instance
 * @param {object} director — state.ai.colonyDirector (already ensured by caller)
 * @param {object} [services] — service container
 * @returns {number} — count of bridges placed this tick (0 or 1)
 */
export function proposeBridgesForReachability(state, buildSystem, director, services = null) {
  const grid = state.grid;
  if (!grid) return 0;
  const nowSec = Number(state.metrics?.timeSec ?? 0);
  const lastSec = Number(director.lastBridgeProposalSec ?? -Infinity);
  if (nowSec - lastSec < 30) return 0; // throttle: at most one bridge / 30s

  const cost = BUILD_COST.bridge ?? {};
  if (!canAfford(state.resources ?? {}, cost)) return 0;

  // PDD R10 (Plan-PDD-smart-pathing) — generalised from 1-tile pinch-point
  // scan to multi-tile shoreline-pair scan. The old code required EVERY
  // candidate water tile to have land on opposite-axis neighbours (i.e. a
  // 1-tile-wide strait), which made 2+ tile straits structurally invisible
  // and left archipelago maps with zero proposed bridges. The new scan
  // collects shore tiles (land 4-adjacent to water), pairs them within
  // RADIUS_TILES, and queues their first water tile when the straight-line
  // crossing is shorter than DETOUR_RATIO_THRESHOLD × the Manhattan span
  // (a cheap proxy for "the land detour around this water is wasteful").
  // Existing 30s throttle and one-bridge-per-call cap retained — they now
  // act as a build-rate limiter; subsequent calls extend the run because
  // the placed bridge tile turns adjacent water into 1-tile-pinch candidates
  // re-discoverable via the same shoreline-pair logic.
  const w = Number(grid.width ?? 0);
  const h = Number(grid.height ?? 0);
  const RADIUS_TILES = 8;
  const DETOUR_RATIO_THRESHOLD = 1.5;
  const SHORE_STRIDE = 2; // sample every Nth shore tile to keep pair scan affordable

  // Collect shore tiles: land tiles with at least one WATER 4-neighbour.
  const shoreTiles = [];
  for (let iz = 1; iz < h - 1; iz += 1) {
    for (let ix = 1; ix < w - 1; ix += 1) {
      const t = grid.tiles[ix + iz * w];
      if (t === TILE.WATER || t === undefined) continue;
      const N = grid.tiles[ix + (iz - 1) * w];
      const S = grid.tiles[ix + (iz + 1) * w];
      const E = grid.tiles[(ix + 1) + iz * w];
      const W = grid.tiles[(ix - 1) + iz * w];
      if (N === TILE.WATER || S === TILE.WATER || E === TILE.WATER || W === TILE.WATER) {
        if (((ix + iz) % SHORE_STRIDE) === 0) shoreTiles.push({ ix, iz });
      }
    }
  }
  if (shoreTiles.length < 2) return 0;

  const warehouses = listTilesByType(grid, [TILE.WAREHOUSE]);
  const distToNearestWh = (ix, iz) => warehouses.length > 0
    ? Math.min(...warehouses.map((wh) => Math.abs(wh.ix - ix) + Math.abs(wh.iz - iz)))
    : 999;

  // Walk the straight line between two shore tiles, counting WATER tiles.
  // Returns { count, firstWater } — `firstWater` is the entry water tile
  // suitable for queuing a bridge blueprint at. count===0 means the pair is
  // already land-connected on a straight line (no crossing needed).
  function straightLineWaterRun(a, b) {
    const dx = b.ix - a.ix;
    const dz = b.iz - a.iz;
    const steps = Math.max(Math.abs(dx), Math.abs(dz));
    if (steps === 0) return { count: 0, firstWater: null };
    let count = 0;
    let firstWater = null;
    for (let s = 1; s < steps; s += 1) {
      const ix = a.ix + Math.round((dx * s) / steps);
      const iz = a.iz + Math.round((dz * s) / steps);
      if (ix < 0 || iz < 0 || ix >= w || iz >= h) continue;
      if (grid.tiles[ix + iz * w] === TILE.WATER) {
        count += 1;
        if (firstWater === null) firstWater = { ix, iz };
      }
    }
    return { count, firstWater };
  }

  // Cheap land-detour reachability check: BFS on land tiles (no water) from
  // a single shore tile, returning the distance to every reachable shore
  // tile (or Infinity for unreachable ones). Cached per source. We reuse
  // the BFS frontier to avoid an O(N²) A* in the inner pair loop.
  const LAND_PASSABLE = (t) => t !== TILE.WATER && t !== undefined;
  const landDetourCache = new Map(); // sourceKey -> Map<targetKey, dist>
  function landDetourFrom(source) {
    const sourceKey = source.ix + source.iz * w;
    if (landDetourCache.has(sourceKey)) return landDetourCache.get(sourceKey);
    const dist = new Map();
    dist.set(sourceKey, 0);
    const queue = [sourceKey];
    let head = 0;
    while (head < queue.length) {
      const key = queue[head++];
      const cx = key % w;
      const cz = Math.floor(key / w);
      const d = dist.get(key);
      // Bound BFS to a reasonable radius so giant maps don't blow up.
      if (d > RADIUS_TILES * 4) continue;
      const neighbours = [
        { x: cx + 1, z: cz }, { x: cx - 1, z: cz },
        { x: cx, z: cz + 1 }, { x: cx, z: cz - 1 },
      ];
      for (const n of neighbours) {
        if (n.x < 0 || n.z < 0 || n.x >= w || n.z >= h) continue;
        const nKey = n.x + n.z * w;
        if (dist.has(nKey)) continue;
        if (!LAND_PASSABLE(grid.tiles[nKey])) continue;
        dist.set(nKey, d + 1);
        queue.push(nKey);
      }
    }
    landDetourCache.set(sourceKey, dist);
    return dist;
  }

  const candidates = [];
  for (let i = 0; i < shoreTiles.length; i += 1) {
    const a = shoreTiles[i];
    for (let j = i + 1; j < shoreTiles.length; j += 1) {
      const b = shoreTiles[j];
      const manhattan = Math.abs(a.ix - b.ix) + Math.abs(a.iz - b.iz);
      if (manhattan === 0 || manhattan > RADIUS_TILES) continue;
      const { count, firstWater } = straightLineWaterRun(a, b);
      if (count <= 0 || firstWater === null) continue;
      // True detour heuristic: bridge cost = water-crossing length + 1
      // (the bridge tiles you'd build); land detour = BFS distance on land
      // only (Infinity if disconnected). Bridge is a worthwhile shortcut
      // when landDetour / bridgeLen >= DETOUR_RATIO_THRESHOLD. Disconnected
      // (Infinity) always qualifies — that's the archipelago case.
      const detour = landDetourFrom(a).get(b.ix + b.iz * w) ?? Infinity;
      const bridgeLen = count + 1;
      if (detour !== Infinity && detour / bridgeLen < DETOUR_RATIO_THRESHOLD) continue;
      const savings = (detour === Infinity ? 1000 : detour) - bridgeLen;
      // distWh measures the FIRST water tile (where the bridge will land),
      // not the shore endpoints — otherwise a far-away crossing whose
      // shore happens to be near the warehouse beats a closer crossing.
      const distWh = distToNearestWh(firstWater.ix, firstWater.iz);
      candidates.push({ ix: firstWater.ix, iz: firstWater.iz, distWh, savings });
    }
  }
  if (candidates.length === 0) return 0;
  // Sort: warehouse-proximity primary (the bridge should unlock production
  // tiles reachable to the existing colony, not random distant crossings),
  // savings secondary (among nearby candidates, prefer ones that actually
  // shorten travel a lot). This matches the legacy 1-tile-pinch ordering
  // while letting the new multi-tile candidates compete for the slot.
  candidates.sort((a, b) => (a.distWh - b.distWh) || (b.savings - a.savings));

  for (const c of candidates) {
    const preview = buildSystem.previewToolAt(state, "bridge", c.ix, c.iz, services);
    if (!preview.ok) continue;
    const result = buildSystem.placeToolAt(state, "bridge", c.ix, c.iz, {
      recordHistory: false, services, owner: "autopilot", reason: "ai bridge — connect across narrow water",
    });
    if (result.ok) {
      state.buildings = rebuildBuildingStats(state.grid);
      director.lastBridgeProposalSec = nowSec;
      return 1;
    }
  }
  return 0;
}
