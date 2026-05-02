// src/simulation/ai/colony/proposers/ZeroQuarryProposer.js
//
// v0.10.1 R5 wave-1 (C1-build-proposer refactor):
// Ported verbatim from ColonyDirectorSystem.js:130-147 (parent commit
// d08a60f) — stone-deficit / zero-quarry safety net.
//
// Original commentary preserved (v0.10.1-hotfix-B issue #7):
//   Stone gates the entire kitchen/smithy/clinic/bridge chain — without
//   quarry coverage the processing tier never lands. Late-game user
//   reports "后期一直缺石头, AI 不建造也不会去探索迷雾找资源点" trace
//   back to: (a) zero quarry + farm@80 spam outranks the existing
//   quarry@77; (b) quarries exist but their nodes are exhausted and no
//   rule forces relocation. Push quarry@95 (above bootstrap@82, below
//   food@99/100) when stone is critical AND no quarry exists, OR when
//   stone is bone-dry (<5) regardless of quarry count to force a
//   relocation build onto the next-best node tile. findPlacementTile
//   already prefers nodeFlag tiles (findNodeFlagTiles scans the WHOLE
//   grid including hidden-fog tiles), so the priority bump alone is
//   enough to draw a worker to a fog-occluded stone node — walking
//   there reveals the fog implicitly.

/** @type {import("../BuildProposer.js").BuildProposer} */
export const ZeroQuarryProposer = Object.freeze({
  name: "zeroQuarry",
  evaluate(_state, ctx) {
    const stoneStock = Number(ctx.resources?.stone ?? 0);
    const currentQuarries = ctx.buildings?.quarries ?? 0;
    if ((currentQuarries === 0 && stoneStock < 15) || stoneStock < 5) {
      return [{
        type: "quarry",
        priority: 95,
        reason: "safety net: stone deficit",
      }];
    }
    return [];
  },
});
