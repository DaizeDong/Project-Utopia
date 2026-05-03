// src/simulation/ai/colony/proposers/ProcessingProposer.js
//
// v0.10.1 R6 wave-2 (C1-code-architect refactor):
// Ported verbatim from ColonyDirectorSystem.js:189-222 (parent commit
// 93497ba) — processing-chain phase block (8 sub-rules: quarry, herb
// garden, kitchen, smithy, road, clinic, wall, plus the early-game
// quarry/herb_garden boost).
//
// Sub-rules are INDEPENDENT. Two of them — `quarry` and `herb_garden` —
// also depend on a worksite-accessibility check that walks the grid:
//
//   needQuarry      = b.quarries < 2 OR no QUARRY tile within 12 of any warehouse
//   needHerbGarden  = b.herbGardens < 2 OR no HERB_GARDEN tile within 12 of any warehouse
//
// The original `hasAccessibleWorksite(state, [TILE.X])` helper is
// re-implemented here so the proposer stays self-contained. It walks
// listTilesByType for X + WAREHOUSE and applies a Manhattan ≤ 12
// reachability test.
//
// Early-game quarry boost (lines 198-200 of original): when
// state.metrics.timeSec < 300, both quarry and herb_garden get
// +BALANCE.autopilotQuarryEarlyBoost added to their priority. The
// boost number is sourced from BALANCE so future tuning changes still
// work (the original used `BALANCE.autopilotQuarryEarlyBoost ?? 0`).
//
// Caller responsibility: skipped during recoveryMode.

import { TILE } from "../../../../config/constants.js";
import { BALANCE } from "../../../../config/balance.js";
import { listTilesByType } from "../../../../world/grid/Grid.js";

const PROCESSING_TARGETS = Object.freeze({
  quarries: 2,
  herbGardens: 2,
  kitchens: 1,
  smithies: 1,
  roads: 30,
});
const FORTIFICATION_PARTIAL = Object.freeze({
  walls: 12,
  clinics: 1,
});

function hasAccessibleWorksite(state, tileTypes, maxDistance = 12) {
  const tiles = listTilesByType(state.grid, tileTypes);
  if (tiles.length === 0) return false;
  const warehouses = listTilesByType(state.grid, [TILE.WAREHOUSE]);
  if (warehouses.length === 0) return false;
  return tiles.some((t) =>
    warehouses.some((w) => Math.abs(w.ix - t.ix) + Math.abs(w.iz - t.iz) <= maxDistance),
  );
}

/** @type {import("../BuildProposer.js").BuildProposer} */
export const ProcessingProposer = Object.freeze({
  name: "processing",
  evaluate(state, ctx) {
    const b = ctx.buildings ?? {};
    const out = [];

    const needQuarry = (b.quarries ?? 0) < PROCESSING_TARGETS.quarries
      || !hasAccessibleWorksite(state, [TILE.QUARRY]);
    const needHerbGarden = (b.herbGardens ?? 0) < PROCESSING_TARGETS.herbGardens
      || !hasAccessibleWorksite(state, [TILE.HERB_GARDEN]);

    const earlyBoost = Number(ctx.timeSec ?? 0) < 300
      ? Number(BALANCE.autopilotQuarryEarlyBoost ?? 0)
      : 0;

    if (needQuarry) {
      out.push({ type: "quarry", priority: 77 + earlyBoost, reason: "processing: need accessible quarry" });
    }
    if (needHerbGarden) {
      out.push({ type: "herb_garden", priority: 76 + earlyBoost, reason: "processing: need accessible herb garden" });
    }
    if ((b.kitchens ?? 0) < PROCESSING_TARGETS.kitchens) {
      out.push({ type: "kitchen", priority: 72, reason: "processing: need kitchen" });
    }
    if ((b.smithies ?? 0) < PROCESSING_TARGETS.smithies) {
      out.push({ type: "smithy", priority: 74, reason: "processing: need smithy for tools" });
    }
    if ((b.roads ?? 0) < PROCESSING_TARGETS.roads) {
      out.push({ type: "road", priority: 55, reason: "processing: expand road network" });
    }
    if ((b.clinics ?? 0) < FORTIFICATION_PARTIAL.clinics) {
      out.push({ type: "clinic", priority: 68, reason: "processing: need clinic" });
    }
    if ((b.walls ?? 0) < FORTIFICATION_PARTIAL.walls) {
      out.push({ type: "wall", priority: 45, reason: "fortification: need walls" });
    }
    return out;
  },
});
