// src/simulation/ai/colony/proposers/ZeroFarmProposer.js
//
// v0.10.1 R5 wave-1 (C1-build-proposer refactor):
// Ported verbatim from ColonyDirectorSystem.js:101-111 (parent commit
// d08a60f) — zero-farm safety net.
//
// Original commentary preserved (v0.10.1-r3-A5 P0-1):
//   Without this, the autopilot's bootstrap phase emits warehouse@82
//   ahead of farm@80 — at t=0 wood=34 affords ~2 warehouses then drains,
//   leaving the first farm un-placed until food runway flips unsafe
//   (~60-90s) and the recovery branch fires. Pushing farm@99 the moment
//   we see "0 farms exist" guarantees the colony never starts a run
//   without a single grain producer. Confined to the first 180 sim-sec
//   so the late-game expansion logic still owns farm pacing once the
//   bootstrap is done.

/** @type {import("../BuildProposer.js").BuildProposer} */
export const ZeroFarmProposer = Object.freeze({
  name: "zeroFarm",
  evaluate(_state, ctx) {
    const currentFarms = ctx.buildings?.farms ?? 0;
    const timeSec = Number(ctx.timeSec ?? 0);
    if (currentFarms === 0 && timeSec < 180) {
      return [{
        type: "farm",
        priority: 99,
        reason: "bootstrap: zero-farm safety net",
      }];
    }
    return [];
  },
});
