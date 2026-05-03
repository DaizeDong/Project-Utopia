// src/simulation/ai/colony/proposers/WarehouseNeedProposer.js
//
// v0.10.1 R6 PK-perf-and-warehouse — sub-fix (b):
// "no warehouse access point" autopilot blind-spot. Inspector's Food
// Diagnosis already names the wipe pattern verbatim ("reachable food but
// no warehouse access"), but the wave-1 proposers
// (ZeroFarm/ZeroLumber/ZeroQuarry/EmergencyShortage) only fire when food
// drops below a threshold; none observe the *route-broken* condition where
// the colony has food on the ground (carry / farm yieldPool / unreachable
// stockpile) but no warehouse a worker can deposit into and eat from. The
// EmergencyShortage food-logistics rule needs `warehouseCount > 0` to
// trigger its bottleneck branch; on a 0-warehouse + critical-hunger map
// nothing fires at all.
//
// Trigger: hunger crisis (criticalHungerRatio > 0.5 OR food < 60) AND
// either no warehouse exists OR existing warehouses are saturated
// (food/cap >= 0.95 → next deposit will overflow / be wasted). Emits a
// single warehouse build need at priority 90 — slotted just under the
// emergencyShortage @100 family but above recovery-warehouse @96, so it
// races farm/lumber emergency builds without starving them.
//
// Self-contained: walks `state.agents` once for criticalHungerRatio rather
// than depending on a precomputed `foodDiagnosis` field (none currently
// flows into proposerCtx). Walk is O(workers) and only happens during the
// hunger-crisis branch — no cost on a healthy colony.

const HUNGER_CRITICAL_THRESHOLD = 0.20;
const CRITICAL_HUNGER_RATIO_FIRE = 0.50;
const FOOD_FLOOR_FIRE = 60;
const SATURATION_RATIO = 0.95;
const ASSUMED_WAREHOUSE_CAPACITY = 200;

function computeCriticalHungerRatio(state) {
  const agents = Array.isArray(state?.agents) ? state.agents : [];
  let alive = 0;
  let critical = 0;
  for (const a of agents) {
    if (!a || a.type !== "WORKER" || a.alive === false) continue;
    alive++;
    if (Number(a.hunger ?? 1) < HUNGER_CRITICAL_THRESHOLD) critical++;
  }
  if (alive === 0) return 0;
  return critical / alive;
}

/** @type {import("../BuildProposer.js").BuildProposer} */
export const WarehouseNeedProposer = Object.freeze({
  name: "warehouseNeed",
  evaluate(state, ctx) {
    const food = Number(ctx.food ?? 0);
    const warehouses = Number(ctx.buildings?.warehouses ?? 0);
    // Capacity model: 200 food per warehouse is the canonical stockpile
    // headroom used in BALANCE.warehouseCapacity. We approximate cap from
    // count rather than reading the live grid stockpile per-tile, since the
    // proposer interface intentionally hides grid walks behind ctx.
    const cap = warehouses * ASSUMED_WAREHOUSE_CAPACITY;
    const overSaturated = warehouses > 0 && cap > 0
      && (food / cap) >= SATURATION_RATIO;
    const noAccess = warehouses === 0;
    if (!noAccess && !overSaturated) return [];

    const critRatio = computeCriticalHungerRatio(state);
    const hungerCrisis = critRatio > CRITICAL_HUNGER_RATIO_FIRE
      || food < FOOD_FLOOR_FIRE;
    if (!hungerCrisis) return [];

    return [{
      type: "warehouse",
      priority: 90,
      reason: noAccess
        ? "warehouse-need: no warehouse access point"
        : "warehouse-need: existing warehouses saturated",
    }];
  },
});
