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

/** @type {import("../BuildProposer.js").BuildProposer} */
export const ZeroLumberProposer = Object.freeze({
  name: "zeroLumber",
  evaluate(_state, ctx) {
    const currentLumbers = ctx.buildings?.lumbers ?? 0;
    const timeSec = Number(ctx.timeSec ?? 0);
    if (currentLumbers === 0 && timeSec < 240) {
      return [{
        type: "lumber",
        priority: 95,
        reason: "bootstrap: zero-lumber safety net (analog to zero-farm @99)",
      }];
    }
    return [];
  },
});
