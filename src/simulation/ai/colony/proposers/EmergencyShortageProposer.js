// src/simulation/ai/colony/proposers/EmergencyShortageProposer.js
//
// v0.10.1 R5 wave-1 (C1-build-proposer refactor):
// Ported verbatim from ColonyDirectorSystem.js:149-161 (parent commit
// d08a60f) — emergency food/wood shortage block (4 sub-rules).
//
// Behaviour preserved exactly:
//   1. food-bottleneck warehouse @100 — fires when food<30 AND
//      currentFarms >= 3 AND warehouseCount > 0 AND
//      currentFarms / warehouseCount > 3.
//   2. food-shortage farm @100 — fires when (1) does NOT fire, food<30,
//      currentFarms < maxFarmsEmergency.
//   3. food-logistics warehouse @100 — fires when (1) and (2) do NOT
//      fire, food<30, warehouseCount < floor(workers/5)+2.
//   4. wood-shortage lumber @95 — fires independently of (1)/(2)/(3)
//      when wood<15 AND lumbers<6.
//
// Sub-rules (1)/(2)/(3) form an if/else-if/else-if chain — at most one
// of those three can fire per evaluate() call. Sub-rule (4) is a
// separate top-level if — it can fire alongside any of (1)/(2)/(3).
//
// `maxFarmsEmergency = max(5, workers)` is computed locally — same
// expression as the original code (line 98).

/** @type {import("../BuildProposer.js").BuildProposer} */
export const EmergencyShortageProposer = Object.freeze({
  name: "emergencyShortage",
  evaluate(_state, ctx) {
    const food = Number(ctx.food ?? 0);
    const wood = Number(ctx.wood ?? 0);
    const workers = Number(ctx.workers ?? 0);
    const buildings = ctx.buildings ?? {};
    const currentFarms = buildings.farms ?? 0;
    const warehouseCount = buildings.warehouses ?? 0;
    const lumberCount = buildings.lumbers ?? 0;
    const maxFarmsEmergency = Math.max(5, workers);

    const out = [];

    // food-bottleneck / food-shortage / food-logistics — mutually
    // exclusive (if/else-if/else-if chain in original).
    if (food < 30 && currentFarms >= 3 && warehouseCount > 0
      && currentFarms / warehouseCount > 3) {
      out.push({
        type: "warehouse",
        priority: 100,
        reason: "emergency: food logistics bottleneck",
      });
    } else if (food < 30 && currentFarms < maxFarmsEmergency) {
      out.push({
        type: "farm",
        priority: 100,
        reason: "emergency food shortage",
      });
    } else if (food < 30 && warehouseCount < Math.floor(workers / 5) + 2) {
      out.push({
        type: "warehouse",
        priority: 100,
        reason: "emergency: need more warehouses",
      });
    }

    // wood-shortage — independent of food chain above.
    if (wood < 15 && lumberCount < 6) {
      out.push({
        type: "lumber",
        priority: 95,
        reason: "emergency wood shortage",
      });
    }

    return out;
  },
});
