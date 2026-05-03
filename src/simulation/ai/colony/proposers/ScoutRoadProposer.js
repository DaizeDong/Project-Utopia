// src/simulation/ai/colony/proposers/ScoutRoadProposer.js
//
// v0.10.1 R6 wave-2 (C1-code-architect refactor):
// Extracted verbatim from ColonyDirectorSystem.js#proposeScoutRoadTowardFoggedStone
// (parent commit 93497ba, lines 548-651).
//
// Same shape caveat as BridgeProposer.js: this is a side-effecting
// function (places a road blueprint, mutates state.buildings), not a
// pure {evaluate} proposer. Extracted for locality but NOT registered
// in WAVE_2_BUILD_PROPOSERS — kept as a standalone export the caller
// invokes directly. See BridgeProposer.js header for the rationale.
//
// Behaviour preserved exactly: 30-sim-second throttle via
// director.lastStoneScoutProposalSec, the stone-deficit gate
// (`stoneStock < 15`), the visible-stone short-circuit, the
// frontier-tile enumeration adjacent to WAREHOUSE/ROAD/BRIDGE, and the
// closest-fogged-stone scoring tie-breaker.

import { BUILD_COST } from "../../../../config/balance.js";
import { FOG_STATE, TILE } from "../../../../config/constants.js";
import { inBounds, listTilesByType, rebuildBuildingStats } from "../../../../world/grid/Grid.js";
import { canAfford } from "../../../construction/BuildAdvisor.js";

const STONE_FLAG = 2; // NODE_FLAGS.STONE
const NEIGHBOURS = Object.freeze([
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
]);

/**
 * @param {object} state — game state
 * @param {object} buildSystem — BuildSystem instance
 * @param {object} director — state.ai.colonyDirector (already ensured by caller)
 * @param {object} [services] — service container
 * @returns {number} — count of scout roads placed this tick (0 or 1)
 */
export function proposeScoutRoadTowardFoggedStone(state, buildSystem, director, services = null) {
  const grid = state.grid;
  if (!grid) return 0;
  const nowSec = Number(state.metrics?.timeSec ?? 0);
  const lastSec = Number(director.lastStoneScoutProposalSec ?? -Infinity);
  if (nowSec - lastSec < 30) return 0;

  const stoneStock = Number(state.resources?.stone ?? 0);
  if (stoneStock >= 15) return 0;

  const cost = BUILD_COST.road ?? {};
  if (!canAfford(state.resources ?? {}, cost)) return 0;

  const fogVis = state.fog?.visibility instanceof Uint8Array ? state.fog.visibility : null;
  const w = Number(grid.width ?? 0);
  let visibleStoneExists = false;
  const hiddenStone = [];
  if (grid.tileState) {
    for (const [idx, entry] of grid.tileState) {
      const flags = Number(entry?.nodeFlags ?? 0) | 0;
      if ((flags & STONE_FLAG) === 0) continue;
      if (Number(grid.tiles[idx]) !== TILE.GRASS) continue;
      const fogState = fogVis ? fogVis[idx] : FOG_STATE.VISIBLE;
      if (fogState !== FOG_STATE.HIDDEN) {
        visibleStoneExists = true;
        break;
      }
      const ix = idx % w;
      const iz = Math.floor(idx / w);
      hiddenStone.push({ ix, iz });
    }
  }
  if (visibleStoneExists) return 0;
  if (hiddenStone.length === 0) return 0;

  const anchors = listTilesByType(grid, [TILE.WAREHOUSE, TILE.ROAD, TILE.BRIDGE]);
  if (anchors.length === 0) return 0;

  const candidates = [];
  const seen = new Set();
  for (const anchor of anchors) {
    for (const n of NEIGHBOURS) {
      const ix = anchor.ix + n.dx;
      const iz = anchor.iz + n.dz;
      if (!inBounds(ix, iz, grid)) continue;
      const key = `${ix},${iz}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const idx = ix + iz * w;
      if (Number(grid.tiles[idx]) !== TILE.GRASS) continue;
      const fogState = fogVis ? fogVis[idx] : FOG_STATE.VISIBLE;
      if (fogState === FOG_STATE.HIDDEN) continue;
      let best = Infinity;
      for (const stone of hiddenStone) {
        const d = Math.abs(stone.ix - ix) + Math.abs(stone.iz - iz);
        if (d < best) best = d;
      }
      candidates.push({ ix, iz, dist: best });
    }
  }
  if (candidates.length === 0) return 0;
  candidates.sort((a, b) => a.dist - b.dist);

  for (const c of candidates) {
    const preview = buildSystem.previewToolAt(state, "road", c.ix, c.iz, services);
    if (!preview.ok) continue;
    const result = buildSystem.placeToolAt(state, "road", c.ix, c.iz, {
      recordHistory: false,
      services,
      owner: "autopilot",
      reason: "ai scout — extend road toward fogged stone deposit",
    });
    if (result.ok) {
      state.buildings = rebuildBuildingStats(state.grid);
      director.lastStoneScoutProposalSec = nowSec;
      return 1;
    }
  }
  return 0;
}
