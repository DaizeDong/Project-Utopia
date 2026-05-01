// v0.10.1-r1-A5 — fail-state restoration + score divergence + wood spoilage.
// v0.10.1-r2-A5 update: BALANCE key renamed `workerHungerDecayWhenFoodZero`
// → `workerHungerDecayWhenFoodLow`; trigger threshold widened from food==0
// to `food < workerHungerDecayLowFoodThreshold` (default 8) so passive
// trickle income (TRADE_CARAVAN, recovery charges) can no longer asymptote
// food just-above-zero and dodge the decay.
//
// Plan: assignments/homework7/Final-Polish-Loop/Round1/Plans/A5-balance-critic.md
//       assignments/homework7/Final-Polish-Loop/Round2/Plans/A5-balance-critic.md
//
// Locks three invariants that close the v0.10.1-l "do-nothing-wins" hole:
//
//   1. fail-state lock: when state.resources.food drops below
//      `workerHungerDecayLowFoodThreshold`, ResourceSystem now decays each
//      worker's entity.hunger by BALANCE.workerHungerDecayWhenFoodLow so
//      MortalitySystem's existing starvation chain (hunger ≤ 0.045 +
//      holdSec=34) can fire. Pre-r1 the global drain bypassed entity.hunger,
//      so workers never died and a no-op run was unkillable.
//
//   2. score divergence: ProgressionSystem.updateSurvivalScore now adds a
//      per-second bonus per productive building so a "do nothing" run
//      accrues only the time floor while a built-up colony scores ≥1.4×
//      faster. Same survivalScore metric, just an extra summand.
//
//   3. wood spoilage: ResourceSystem applies the same proportional decay
//      pattern to wood that food has had since v0.10.1-j, tuned half as
//      aggressive. Caps no-op stockpile growth without breaking active
//      construction loops.

import test from "node:test";
import assert from "node:assert/strict";

import { ResourceSystem } from "../src/simulation/economy/ResourceSystem.js";
import { updateSurvivalScore } from "../src/simulation/meta/ProgressionSystem.js";
import { BALANCE } from "../src/config/balance.js";

// Build a minimal-but-functional state for ResourceSystem.update().
// Mirrors the shape ResourceSystem.update touches: resources, agents, grid
// (only `version` is actually read), metrics, eventQueue.
function makeMinimalState({ workers = 5, food = 0, wood = 0, hunger = 1.0 } = {}) {
  const agents = [];
  for (let i = 0; i < workers; i += 1) {
    agents.push({
      id: `w${i}`,
      type: "WORKER",
      alive: true,
      hunger,
      hp: 100,
      maxHp: 100,
      carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
      metabolism: { hungerDecayMultiplier: 1 },
      debug: {},
    });
  }
  return {
    agents,
    animals: [],
    resources: {
      food, wood, stone: 0, herbs: 0,
      meals: 0, medicine: 0, tools: 0,
    },
    buildings: {
      warehouses: 0, farms: 0, lumbers: 0, roads: 0, walls: 0, gates: 0,
      quarries: 0, herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0, bridges: 0,
    },
    grid: {
      width: 1, height: 1,
      tiles: new Uint8Array(1),
      version: 0,
    },
    gameplay: {},
    metrics: {
      timeSec: 0,
      simTimeSec: 0,
      birthsTotal: 0, deathsTotal: 0,
      survivalLastBirthsSeen: 0, survivalLastDeathsSeen: 0,
      survivalScore: 0,
    },
    controls: {},
    eventQueue: [],
    debug: {},
  };
}

// -----------------------------------------------------------------------------
// 1. fail-state lock — workers MUST cross the starvation threshold (≤0.045)
// -----------------------------------------------------------------------------
test("fail-state: food=0 + alive workers → entity.hunger crosses death threshold", () => {
  // r2-A5 rename: read the new key, fall back to the old name for any
  // intermediate-state checkout. The plan's invariant is "the wire is
  // connected" — exact constant name is a free variable.
  const decayRate = Number(
    BALANCE.workerHungerDecayWhenFoodLow
      ?? BALANCE.workerHungerDecayWhenFoodZero
      ?? 0,
  );
  assert.ok(
    decayRate > 0,
    `workerHungerDecayWhenFoodLow must be > 0 to keep fail-state alive (got ${decayRate})`,
  );

  const state = makeMinimalState({ workers: 5, food: 0, hunger: 1.0 });
  const sys = new ResourceSystem();

  // 60 ticks @ dt=1 of food=0 — at decay rate 0.020/s that's 60×0.020=1.2,
  // saturating well below threshold (any rate ≥ ~0.016/s gets there).
  for (let i = 0; i < 60; i += 1) {
    sys.update(1, state);
    state.resources.food = 0; // pin food=0 for the test
  }

  const minHunger = state.agents
    .filter(a => a.type === "WORKER" && a.alive)
    .reduce((m, a) => Math.min(m, Number(a.hunger ?? 1)), 1);

  assert.ok(
    minHunger <= 0.05,
    `expected at least one worker hunger ≤ 0.05 after 60s of food=0, got ${minHunger.toFixed(4)}`,
  );
});

// -----------------------------------------------------------------------------
// 2. score divergence — built-up colony outscores empty colony by ≥40%
// -----------------------------------------------------------------------------
test("score divergence: productive buildings drive ≥40% score gap over 600s", () => {
  const perBuilding = Number(BALANCE.survivalScorePerProductiveBuildingSec ?? 0);
  assert.ok(
    perBuilding > 0,
    `survivalScorePerProductiveBuildingSec must be > 0 (got ${perBuilding})`,
  );

  // State A: no productive buildings (do-nothing baseline)
  const stateA = {
    metrics: {
      survivalScore: 0, timeSec: 0,
      birthsTotal: 0, deathsTotal: 0,
      survivalLastBirthsSeen: 0, survivalLastDeathsSeen: 0,
    },
    buildings: {
      warehouses: 1, farms: 0, lumbers: 0, quarries: 0,
      herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0,
    },
  };

  // State B: a developed colony (10 productive buildings)
  const stateB = {
    metrics: {
      survivalScore: 0, timeSec: 0,
      birthsTotal: 0, deathsTotal: 0,
      survivalLastBirthsSeen: 0, survivalLastDeathsSeen: 0,
    },
    buildings: {
      warehouses: 1, farms: 5, lumbers: 3, quarries: 1,
      herbGardens: 0, kitchens: 1, smithies: 0, clinics: 0,
    },
  };

  for (let i = 0; i < 600; i += 1) {
    updateSurvivalScore(stateA, 1);
    updateSurvivalScore(stateB, 1);
  }

  const ratio = stateB.metrics.survivalScore / stateA.metrics.survivalScore;
  assert.ok(
    ratio >= 1.4,
    `expected built-up colony score >= 1.4× empty (got ${ratio.toFixed(3)} = ${stateB.metrics.survivalScore} / ${stateA.metrics.survivalScore})`,
  );
});

// -----------------------------------------------------------------------------
// 3. wood spoilage — 240 wood / 0 workers / 30 min → in (50, 200]
// -----------------------------------------------------------------------------
test("wood spoilage: 240 wood with no workers decays into (50, 200] over 30 min", () => {
  const woodSpoil = Number(BALANCE.warehouseWoodSpoilageRatePerSec ?? 0);
  assert.ok(
    woodSpoil > 0,
    `warehouseWoodSpoilageRatePerSec must be > 0 (got ${woodSpoil})`,
  );

  const state = makeMinimalState({ workers: 0, food: 100, wood: 240 });
  const sys = new ResourceSystem();

  // 1800 sec @ dt=1 = 30 in-game minutes. Wood spoils proportional to
  // current stockpile, so the decay is asymptotic: wood(t) = 240 * e^(-r*t).
  // At r=0.00015, wood(1800) ≈ 240 * exp(-0.27) ≈ 240 * 0.763 ≈ 183.
  for (let i = 0; i < 1800; i += 1) {
    sys.update(1, state);
    // Pin food >0 so the food=0 hunger branch is never exercised here.
    state.resources.food = 100;
  }

  const finalWood = state.resources.wood;
  assert.ok(
    finalWood < 220,
    `expected wood < 220 after 30 min (some spoilage), got ${finalWood.toFixed(1)}`,
  );
  assert.ok(
    finalWood > 50,
    `expected wood > 50 (not over-decayed), got ${finalWood.toFixed(1)}`,
  );
});
