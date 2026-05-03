// src/simulation/ai/colony/proposers/RecoveryProposer.js
//
// v0.10.1 R6 wave-2 (C1-code-architect refactor):
// Ported verbatim from ColonyDirectorSystem.js:130-148 (parent commit
// 93497ba) — recovery branch (4 sub-rules + early-return + filter).
//
// IMPORTANT: in the original code, recovery mode SHORT-CIRCUITED
// `assessColonyNeeds` — once `recoveryMode` was true, the function
// pushed a small set of recovery needs, applied a sort + filter via
// `RECOVERY_ESSENTIAL_TYPES` whitelist, and RETURNED. Pure proposers
// cannot short-circuit the orchestrator, so this proposer only returns
// the recovery NEEDS (4 sub-rules); the caller (ColonyDirectorSystem)
// is still responsible for detecting recovery mode and gating the rest
// of the proposer chain on `!recoveryMode`. This keeps the proposer
// interface read-only and preserves byte-identical behaviour.
//
// The 4 sub-rules port one-to-one from the original:
//   1. farm @98       — currentFarms < maxFarmsEmergency  (recovery: restore food runway)
//   2. warehouse @96  — warehouseCount < floor(workers/5) + 2  (recovery: restore food logistics)
//   3. lumber @92     — wood < 10 AND lumbers < 4  (recovery: wood floor for farm builds)
//   4. road @88       — roads < max(6, workers)  (recovery: reconnect food routes)

import { isFoodRunwayUnsafe } from "../../../economy/ResourceSystem.js";

/**
 * Detect "recovery mode" using the same gate as the original
 * assessColonyNeeds line 130:
 *
 *   const recoveryMode = Boolean(state.ai?.foodRecoveryMode)
 *                        || isFoodRunwayUnsafe(state);
 *
 * Exported so ColonyDirectorSystem can reuse the exact same boolean
 * for its short-circuit / sort+filter logic without duplicating the
 * import.
 *
 * @param {object} state — game state
 * @returns {boolean}
 */
export function isRecoveryMode(state) {
  return Boolean(state?.ai?.foodRecoveryMode) || isFoodRunwayUnsafe(state);
}

/** @type {import("../BuildProposer.js").BuildProposer} */
export const RecoveryProposer = Object.freeze({
  name: "recovery",
  evaluate(state, ctx) {
    if (!isRecoveryMode(state)) return [];

    const workers = Number(ctx.workers ?? 0);
    const buildings = ctx.buildings ?? {};
    const wood = Number(ctx.wood ?? state?.resources?.wood ?? 0);
    const currentFarms = buildings.farms ?? 0;
    const warehouseCount = buildings.warehouses ?? 0;
    const lumberCount = buildings.lumbers ?? 0;
    const roadCount = buildings.roads ?? 0;
    const maxFarmsEmergency = Math.max(5, workers);

    const out = [];
    if (currentFarms < maxFarmsEmergency) {
      out.push({ type: "farm", priority: 98, reason: "recovery: restore food runway" });
    }
    if (warehouseCount < Math.floor(workers / 5) + 2) {
      out.push({ type: "warehouse", priority: 96, reason: "recovery: restore food logistics" });
    }
    if (wood < 10 && lumberCount < 4) {
      out.push({ type: "lumber", priority: 92, reason: "recovery: wood floor for farm builds" });
    }
    if (roadCount < Math.max(6, workers)) {
      out.push({ type: "road", priority: 88, reason: "recovery: reconnect food routes" });
    }
    return out;
  },
});
