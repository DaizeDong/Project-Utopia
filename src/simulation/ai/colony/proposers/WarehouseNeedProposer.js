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

// R9 PZ Plan-Recovery-Director Steps 2-3 — diagnostic-driven trigger.
// PZ verbatim: "the inspector pins 'no warehouse access point' in red while
// the autopilot queues a Lumber camp." The original R6 PK trigger only fires
// when criticalHungerRatio>0.5 OR food<60; the PZ trace never tripped that
// because workers were "only a bit hungry" — yet 30%+ of them already had
// `entity.debug.nutritionSourceType === "none"` for ≥10 s. NO_ACCESS_RATIO_FIRE
// catches that blind-spot via a per-worker diagnostic-state predicate, latched
// for NO_ACCESS_DWELL_SEC to suppress single-tick thrash.
const NO_ACCESS_RATIO_FIRE = 0.30;
const NO_ACCESS_DWELL_SEC = 10;

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

function computeNoAccessRatio(state) {
  const agents = Array.isArray(state?.agents) ? state.agents : [];
  let alive = 0;
  let noAccess = 0;
  for (const a of agents) {
    if (!a || a.type !== "WORKER" || a.alive === false) continue;
    alive++;
    if (String(a.debug?.nutritionSourceType ?? "") === "none") noAccess++;
  }
  if (alive === 0) return 0;
  return noAccess / alive;
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

    // Diagnostic-driven branch: ≥30% of WORKERs report
    // nutritionSourceType==="none" for ≥10 s. Latched on `state.ai` so a
    // single-tick clear of the diagnostic doesn't reset the dwell counter.
    const nowSec = Number(ctx.timeSec ?? state?.metrics?.timeSec ?? 0);
    const noAccessRatio = computeNoAccessRatio(state);
    if (state?.ai && typeof state.ai === "object") {
      if (noAccessRatio >= NO_ACCESS_RATIO_FIRE) {
        if (typeof state.ai.warehouseDiagnosticSinceSec !== "number") {
          state.ai.warehouseDiagnosticSinceSec = nowSec;
        }
      } else {
        // Reset the latch once the diagnostic clears below the firing band.
        if (typeof state.ai.warehouseDiagnosticSinceSec === "number") {
          state.ai.warehouseDiagnosticSinceSec = null;
        }
      }
    }
    const dwellSince = Number(state?.ai?.warehouseDiagnosticSinceSec ?? Infinity);
    const diagnosticDwellMet = noAccessRatio >= NO_ACCESS_RATIO_FIRE
      && (nowSec - dwellSince) >= NO_ACCESS_DWELL_SEC;

    if (diagnosticDwellMet) {
      return [{
        type: "warehouse",
        priority: 90,
        reason: "warehouse-need: 30%+ workers report no warehouse access (10s+ dwell)",
      }];
    }

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
