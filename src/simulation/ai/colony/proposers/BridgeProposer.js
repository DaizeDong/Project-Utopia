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

  // Find narrow water crossings: WATER tiles with passable land on at
  // least two opposite-axis neighbours. A 1-tile bridge there connects
  // two land regions across a river/strait.
  const w = Number(grid.width ?? 0);
  const h = Number(grid.height ?? 0);
  const candidates = [];
  for (let iz = 1; iz < h - 1; iz += 1) {
    for (let ix = 1; ix < w - 1; ix += 1) {
      if (grid.tiles[ix + iz * w] !== TILE.WATER) continue;
      const N = grid.tiles[ix + (iz - 1) * w];
      const S = grid.tiles[ix + (iz + 1) * w];
      const E = grid.tiles[(ix + 1) + iz * w];
      const W = grid.tiles[(ix - 1) + iz * w];
      const isLand = (t) => t !== TILE.WATER && t !== undefined;
      const NS = isLand(N) && isLand(S);
      const EW = isLand(E) && isLand(W);
      if (!NS && !EW) continue;
      // Distance to nearest warehouse — prefer crossings near the colony
      // so the bridge actually unlocks reachable production tiles.
      const warehouses = listTilesByType(grid, [TILE.WAREHOUSE]);
      const distWh = warehouses.length > 0
        ? Math.min(...warehouses.map((wh) => Math.abs(wh.ix - ix) + Math.abs(wh.iz - iz)))
        : 999;
      candidates.push({ ix, iz, distWh });
    }
  }
  if (candidates.length === 0) return 0;
  candidates.sort((a, b) => a.distWh - b.distWh);

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
