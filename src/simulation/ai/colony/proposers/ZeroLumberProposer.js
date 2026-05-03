// src/simulation/ai/colony/proposers/ZeroLumberProposer.js
//
// v0.10.1 R5 wave-1 (C1-build-proposer refactor):
// Ported verbatim from ColonyDirectorSystem.js:113-128 (parent commit
// d08a60f) — zero-lumber safety net.
//
// Original commentary preserved (v0.10.1-r4-A5 P0-2):
//   Analog to zero-farm @99. A5 R3 audit: 14 sim-min autopilot run
//   completed with 0 Lumber tiles placed — wood drained to 0 and the
//   build queue stalled because the bootstrap branch only emits
//   lumber@78 (below warehouse@82) and the emergency branch (the
//   wood-shortage rule in EmergencyShortageProposer) requires wood<15
//   AND <6 lumbers — but with zero lumbers wood never replenishes after
//   the initial 35-pool drains, and the planner picked warehouses+farms
//   ahead of any lumber. Mirror the zero-farm pattern: when zero
//   lumbers exist push lumber@95 (below food@99/100, above quarry@95
//   ties resolved by sort stability) for the first 240 sim-sec so every
//   run lands at least one wood producer before the bootstrap window
//   closes. After 240s late-game expansion logic (logistics @66 /
//   phase-3 @55) owns lumber pacing.
//
// v0.10.1-n R12 Plan-R12-wood-food-balance (A5-balance-critic finding 1):
//   The R4 priority of 95 over-corrected. A5 R12 measured wood ramping
//   22× starting (peaks 685+ on day 3) while food collapsed to 0 in
//   every run across 3 maps × 3 seeds — the lumber safety net was
//   beating the food-emergency setup on maps where food was already
//   the actual crisis. Two changes:
//     1. Bootstrap priority dropped 95 → 75. Still beats logistics@66
//        and phase-3@55 (so the safety net still lands a lumber camp
//        before routine expansion), but loses to food@99/100,
//        warehouse@82, and farm@70 emergency rules so food crises
//        always preempt the lumber bootstrap.
//     2. Wood/food ratio gate (BALANCE.maxWoodPerFarmRatio = 5) —
//        defence-in-depth. Even inside the 240-sec window with zero
//        lumbers, if wood is already ≥5× food the colony is
//        wood-saturated and adding more lumber will worsen the
//        snowball. Skip and let food rules drive. Guarded by food > 0
//        so the gate never fires on a fresh boot (food=80, wood=30).

import { BALANCE } from "../../../../config/balance.js";

/** @type {import("../BuildProposer.js").BuildProposer} */
export const ZeroLumberProposer = Object.freeze({
  name: "zeroLumber",
  evaluate(state, ctx) {
    const currentLumbers = ctx.buildings?.lumbers ?? 0;
    const timeSec = Number(ctx.timeSec ?? 0);
    if (currentLumbers === 0 && timeSec < 240) {
      // R12 A5 #1 ratio gate: wood-saturated colonies should not get a
      // bootstrap lumber proposal — let food rules drive.
      const wood = Number(state?.resources?.wood ?? 0);
      const food = Number(state?.resources?.food ?? 0);
      const ratioCap = Number(BALANCE.maxWoodPerFarmRatio ?? 5);
      if (food > 0 && wood > food * ratioCap) {
        return [];
      }
      return [{
        type: "lumber",
        priority: 75, // was 95 — R12 A5 #1: food@99/100 / warehouse@82 / farm@70 now preempt
        reason: "bootstrap: zero-lumber safety net (analog to zero-farm @99) — R12 priority lowered + ratio-gated",
      }];
    }
    return [];
  },
});
