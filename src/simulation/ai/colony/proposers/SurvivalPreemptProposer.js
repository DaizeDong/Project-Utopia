// src/simulation/ai/colony/proposers/SurvivalPreemptProposer.js
//
// v0.10.1 R6 wave-2 (C1-code-architect refactor):
// Ported verbatim from AgentDirectorSystem.js:204-228 (parent commit
// 93497ba) — survivalPreempt boolean expression that decides whether
// to fire the rule-based fallback director ahead of the LLM plan
// executor.
//
// Original shape:
//
//   const survivalPreempt = (sFarms === 0 && nowSec < 180)
//     || (sFood < 30 && sFarms < 3)
//     || (sQuarries === 0 && sStone < 8);
//   if (survivalPreempt) { this._fallback.update(dt, state, services); }
//
// New shape: SurvivalPreemptProposer.evaluate returns a single
// {kind, priority, reason} record when ANY of the three sub-conditions
// is true, and [] otherwise. AgentDirectorSystem checks
// `runProposers([SurvivalPreemptProposer], state, ctx).length > 0` to
// trigger the fallback. The shape is intentionally a BuildNeed-like
// record so the same `runProposers` walker from BuildProposer.js works
// for both build proposals and survival preempt — the caller decides
// whether to interpret the output as needs (build) or as a fire signal
// (preempt).
//
// `kind: "survival-preempt"` differentiates the record from regular
// build-need types so any downstream consumer that accidentally
// concatenates these into a build queue immediately fails open
// (placement code keys on `type`, which is undefined here).

const ZERO_FARM_TIME_BUDGET_SEC = 180;

/** @type {import("../BuildProposer.js").BuildProposer} */
export const SurvivalPreemptProposer = Object.freeze({
  name: "survivalPreempt",
  evaluate(_state, ctx) {
    const buildings = ctx.buildings ?? {};
    const resources = ctx.resources ?? {};
    const farms = Number(buildings.farms ?? 0);
    const quarries = Number(buildings.quarries ?? 0);
    const food = Number(resources.food ?? 0);
    const stone = Number(resources.stone ?? 0);
    const nowSec = Number(ctx.timeSec ?? 0);

    const zeroFarm = farms === 0 && nowSec < ZERO_FARM_TIME_BUDGET_SEC;
    const foodCrisis = food < 30 && farms < 3;
    const stoneCrisis = quarries === 0 && stone < 8;

    if (!zeroFarm && !foodCrisis && !stoneCrisis) return [];

    const reasons = [];
    if (zeroFarm) reasons.push("zero-farm");
    if (foodCrisis) reasons.push("food-crisis");
    if (stoneCrisis) reasons.push("stone-crisis");
    return [{
      kind: "survival-preempt",
      priority: 100,
      reason: `survival-preempt: ${reasons.join("+")}`,
    }];
  },
});
