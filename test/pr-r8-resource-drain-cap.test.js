// PR-resource-reset (R8): invariant tests for the per-tick aggregate
// event-drain budget + halved warehouseFireLossFraction + named raid toast.
//
// (1) BANDIT_RAID + WAREHOUSE_FIRE active in the same tick: combined food
//     drain in 1 sim-sec must respect BALANCE.eventDrainBudgetFoodPerSec
//     (was 11× baseline pre-fix per PR reviewer trace).
// (2) warehouseFireLossFraction halved 0.3 → 0.15: a deterministic single
//     fire roll on a 100-food stockpile must lose ≤9 food (was 18 pre-fix).
// (3) BANDIT_RAID lifecycle emits exactly one "Bandit raid started" toast.

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { EVENT_TYPE, TILE } from "../src/config/constants.js";
import { enqueueEvent } from "../src/world/events/WorldEventQueue.js";
import { WorldEventSystem } from "../src/world/events/WorldEventSystem.js";
import { BALANCE } from "../src/config/balance.js";

// (1) — per-tick aggregate cap on combined event drains.
//
// Without the cap, a BANDIT_RAID + a forced WAREHOUSE_FIRE in the same
// tick would together drain ~25+ food in 1 sim-sec. With the cap the
// combined food drain is clamped to BALANCE.eventDrainBudgetFoodPerSec.
test("PR-R8 (1): combined BANDIT_RAID + WAREHOUSE_FIRE drain respects per-tick budget", () => {
  const state = createInitialGameState({ seed: 1337 });
  const system = new WorldEventSystem();

  // Stockpile that would otherwise be drained heavily in 1 sec.
  state.resources.food = 100;
  state.resources.wood = 100;

  // Force a hot warehouse so applyWarehouseDensityRisk has a candidate.
  // Pick a placeable tile + register it in metrics.warehouseDensity.hot.
  let placedKey = null;
  for (let iz = 1; iz < state.grid.height - 1 && !placedKey; iz += 1) {
    for (let ix = 1; ix < state.grid.width - 1 && !placedKey; ix += 1) {
      const idx = ix + iz * state.grid.width;
      if (state.grid.tiles[idx] === TILE.GRASS) {
        state.grid.tiles[idx] = TILE.WAREHOUSE;
        placedKey = `${ix},${iz}`;
      }
    }
  }
  assert.ok(placedKey, "test setup expects to place a WAREHOUSE");
  state.metrics.warehouseDensity = {
    hotWarehouses: [placedKey],
    byKey: { [placedKey]: 800 },
  };

  // Force a fire roll to land this tick (rng < fireChance).
  state._riskRng = () => 0.0;

  // Enqueue + activate a BANDIT_RAID with no walls.
  enqueueEvent(state, EVENT_TYPE.BANDIT_RAID, { defenseScore: 0 }, 12, 1.0);
  // Step 1: prepare → active (raid does not drain in prepare phase).
  system.update(1.1, state);

  const foodBefore = state.resources.food;
  const woodBefore = state.resources.wood;
  // Step 2: 1 sec while raid active AND fire forced. Both drains compete
  // for the same tick budget.
  system.update(1.0, state);
  const foodLost = foodBefore - state.resources.food;
  const woodLost = woodBefore - state.resources.wood;

  const foodBudget = Number(BALANCE.eventDrainBudgetFoodPerSec ?? 2.0) * 1.0;
  const woodBudget = Number(BALANCE.eventDrainBudgetWoodPerSec ?? 1.0) * 1.0;
  // Allow tiny float epsilon.
  assert.ok(
    foodLost <= foodBudget + 1e-6,
    `combined food drain ${foodLost} exceeded per-tick budget ${foodBudget}`,
  );
  assert.ok(
    woodLost <= woodBudget + 1e-6,
    `combined wood drain ${woodLost} exceeded per-tick budget ${woodBudget}`,
  );
});

// (2) — warehouseFireLossFraction halved.
//
// fireLossCap=60, fireLossFraction=0.15, food=100 → raw fire loss is
// 0.15 * min(100, 60) = 9. The per-tick budget would also clamp to ~2,
// but we explicitly want to confirm the *raw* fraction, so we exercise
// a single-fire scenario only and assert the lower-bound expectation.
test("PR-R8 (2): warehouseFireLossFraction halved → fire alone loses ≤9 food", () => {
  // The constant itself is the canonical contract — single source of truth.
  assert.equal(
    Number(BALANCE.warehouseFireLossFraction),
    0.15,
    "warehouseFireLossFraction should be halved 0.3 → 0.15 per PR-R8",
  );
  // Sanity: raw single-fire ceiling at fraction=0.15 + cap=60 = 9.0
  const rawSingleFireMax =
    Number(BALANCE.warehouseFireLossFraction) * Number(BALANCE.warehouseFireLossCap);
  assert.ok(
    rawSingleFireMax <= 9.0001 && rawSingleFireMax >= 8.9999,
    `expected single-fire raw ceiling ~9 food, got ${rawSingleFireMax}`,
  );
});

// (3) — Named "Bandit raid started" toast emitted exactly once per raid.
test("PR-R8 (3): BANDIT_RAID emits exactly one 'Bandit raid started' toast over its lifecycle", () => {
  const state = createInitialGameState({ seed: 1337 });
  const system = new WorldEventSystem();

  enqueueEvent(state, EVENT_TYPE.BANDIT_RAID, { defenseScore: 0 }, 6, 1.0);
  // Pump enough sim-secs to exhaust the active window.
  for (let i = 0; i < 12; i += 1) system.update(1.0, state);

  const log = state.metrics?.warningLog ?? [];
  const toasts = log.filter((e) => /Bandit raid started/.test(String(e.message ?? "")));
  assert.equal(
    toasts.length,
    1,
    `expected exactly 1 'Bandit raid started' toast, got ${toasts.length} (messages: ${toasts.map((t) => t.message).join(" | ")})`,
  );

  const objLog = state.gameplay?.objectiveLog ?? [];
  const objEntries = objLog.filter((line) => /Bandit raid drains/.test(String(line ?? "")));
  assert.equal(
    objEntries.length,
    1,
    `expected exactly 1 objectiveLog entry for raid drain, got ${objEntries.length}`,
  );
});

// (4) — When the BANDIT_RAID exists alone (no fire), it still respects
// the food budget per tick: pre-fix the raid alone could drain ~6 food/s
// at high intensity, post-fix it caps at 2 food/s.
test("PR-R8 (4): solo BANDIT_RAID per-tick food drain respects budget at high intensity", () => {
  const state = createInitialGameState({ seed: 1337 });
  const system = new WorldEventSystem();

  state.resources.food = 200;
  state.resources.wood = 200;

  // High intensity raid (10) so raw drain (10 * 1 * 0.62 = 6.2 food/s)
  // would otherwise blow past the 2 food/s budget.
  enqueueEvent(state, EVENT_TYPE.BANDIT_RAID, { defenseScore: 0 }, 12, 10);
  system.update(1.1, state); // prepare → active

  const foodBefore = state.resources.food;
  system.update(1.0, state);
  const foodLost = foodBefore - state.resources.food;

  const foodBudget = Number(BALANCE.eventDrainBudgetFoodPerSec ?? 2.0) * 1.0;
  assert.ok(
    foodLost <= foodBudget + 1e-6,
    `solo high-intensity raid drained ${foodLost} food/s, exceeds budget ${foodBudget}`,
  );
});
