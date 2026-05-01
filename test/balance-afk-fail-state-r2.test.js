// v0.10.1-r2-A5 — AFK fail-state + raid gate verification.
//
// Plan: assignments/homework7/Final-Polish-Loop/Round2/Plans/A5-balance-critic.md
//
// Two invariants this file pins down:
//
//   1. AFK starvation: a "do-nothing" colony (no farms, no autopilot)
//      MUST eventually accumulate at least one death. R1 wired
//      entity.hunger decay at strict food==0; R2 widens the trigger to
//      `food < workerHungerDecayLowFoodThreshold` and slashes
//      TRADE_CARAVAN food/wood yields so passive trickle income can no
//      longer asymptote food just-above-zero. Combined: AFK is now killable.
//
//   2. raidsRepelled gate: a BANDIT_RAID that resolves with zero defense
//      score and `blockedByWalls=false` MUST NOT increment
//      `state.metrics.raidsRepelled`. Pre-r2 the counter ticked any time
//      a raid lifecycle reached `resolve`, so a 0-wall colony got
//      "credited" a repel just for surviving the active window.
//
// These tests use minimal fixtures (no full createInitialGameState) — the
// goal is to exercise the *threshold logic*, not the whole sim. Long-horizon
// AFK regressions live in the benchmark harness; this file is the unit-level
// guard for the specific code paths edited by the R2 plan.

import test from "node:test";
import assert from "node:assert/strict";

import { ResourceSystem } from "../src/simulation/economy/ResourceSystem.js";
import { WorldEventSystem } from "../src/world/events/WorldEventSystem.js";
import { EVENT_TYPE } from "../src/config/constants.js";
import { BALANCE } from "../src/config/balance.js";

// -----------------------------------------------------------------------------
// 1. AFK fail-state — entity.hunger MUST cross the death threshold even when
//    food never quite hits zero (TRADE_CARAVAN-style trickle income).
// -----------------------------------------------------------------------------
test("AFK fail-state: hunger decays even when food trickles in below threshold", () => {
  const lowThreshold = Number(BALANCE.workerHungerDecayLowFoodThreshold ?? 8);
  const decayRate = Number(BALANCE.workerHungerDecayWhenFoodLow ?? 0);
  assert.ok(
    lowThreshold > 0,
    `workerHungerDecayLowFoodThreshold must be > 0 (got ${lowThreshold})`,
  );
  assert.ok(
    decayRate > 0,
    `workerHungerDecayWhenFoodLow must be > 0 (got ${decayRate})`,
  );

  // 5 workers, food pinned just above zero (simulating trickle income that
  // never lets food == 0 strictly). Pre-r2 this would skip the hunger
  // decay branch entirely and workers would live forever.
  const agents = [];
  for (let i = 0; i < 5; i += 1) {
    agents.push({
      id: `w${i}`,
      type: "WORKER",
      alive: true,
      hunger: 1.0,
      hp: 100,
      maxHp: 100,
      carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
      metabolism: { hungerDecayMultiplier: 1 },
      debug: {},
    });
  }
  const state = {
    agents,
    animals: [],
    resources: {
      food: 1, wood: 0, stone: 0, herbs: 0,
      meals: 0, medicine: 0, tools: 0,
    },
    buildings: {
      warehouses: 0, farms: 0, lumbers: 0, roads: 0, walls: 0, gates: 0,
      quarries: 0, herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0, bridges: 0,
    },
    grid: { width: 1, height: 1, tiles: new Uint8Array(1), version: 0 },
    gameplay: {},
    metrics: {
      timeSec: 0, simTimeSec: 0,
      birthsTotal: 0, deathsTotal: 0,
      survivalLastBirthsSeen: 0, survivalLastDeathsSeen: 0,
      survivalScore: 0,
    },
    controls: {},
    eventQueue: [],
    debug: {},
  };

  const sys = new ResourceSystem();
  // 90 sec @ dt=1 — at decay rate 0.020/s that's 90×0.020=1.8, well past
  // the death threshold (≤0.045). Food is pinned at 1 (below threshold=8)
  // each tick to simulate caravan-style trickle income that prevents
  // strict food==0.
  for (let i = 0; i < 90; i += 1) {
    sys.update(1, state);
    state.resources.food = 1;
  }

  const minHunger = state.agents
    .filter((a) => a.type === "WORKER" && a.alive)
    .reduce((m, a) => Math.min(m, Number(a.hunger ?? 1)), 1);

  assert.ok(
    minHunger <= 0.05,
    `expected at least one worker hunger ≤ 0.05 after 90s of food=1 (low band), got ${minHunger.toFixed(4)}`,
  );
});

// -----------------------------------------------------------------------------
// 2. raidsRepelled MUST NOT count a 0-wall, 0-defense raid as "repelled".
// -----------------------------------------------------------------------------
test("raidsRepelled gate: 0-wall raid resolve does not increment counter", () => {
  // Minimal state for the section of WorldEventSystem.update that walks
  // active events and tallies raid-repelled. We hand-craft an active raid
  // that's about to roll over to `resolve` on the next advanceLifecycle
  // call, with `defenseScore=0` and `blockedByWalls=false` — i.e. raw
  // survival, no actual defense.
  const state = {
    agents: [],
    animals: [],
    resources: { food: 100, wood: 100, stone: 0, herbs: 0, meals: 0, medicine: 0, tools: 0 },
    buildings: {
      warehouses: 1, farms: 0, lumbers: 0, roads: 0, walls: 0, gates: 0,
      quarries: 0, herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0, bridges: 0,
    },
    grid: { width: 4, height: 4, tiles: new Uint8Array(16), version: 0 },
    gameplay: {},
    metrics: {
      timeSec: 0, tick: 0,
      birthsTotal: 0, deathsTotal: 0,
      raidsRepelled: 0,
    },
    controls: {},
    events: {
      queue: [],
      active: [{
        id: "raid-test",
        type: EVENT_TYPE.BANDIT_RAID,
        status: "active",
        // duration almost up — next tick of dt=1 will push elapsedSec
        // past durationSec and flip status to `resolve`.
        elapsedSec: 9.5,
        durationSec: 10,
        intensity: 1,
        payload: {
          targetTiles: [{ ix: 0, iz: 0 }],
          targetKind: "depot",
          targetRefId: "test-depot",
          // Critical: defenseScore=0, blockedByWalls=false — no defense.
          defenseScore: 0,
          blockedByWalls: false,
          // Avoid impact-side-effects in this test.
          sabotageApplied: true,
          impactTile: null,
          secondaryImpactTile: null,
        },
      }],
    },
    eventQueue: [],
    ai: {},
    debug: {},
  };

  const sys = new WorldEventSystem();
  // One tick of dt=1 advances elapsedSec from 9.5 → 10.5, crossing
  // durationSec=10, so advanceLifecycle returns active→resolve.
  sys.update(1, state);

  assert.equal(
    state.metrics.raidsRepelled,
    0,
    `expected raidsRepelled to stay 0 for a 0-defense raid resolve, got ${state.metrics.raidsRepelled}`,
  );
});

// -----------------------------------------------------------------------------
// 3. Counter-test: a raid with non-trivial defense DOES count as repelled.
//    Locks in that the gate is correctly permissive when defense is real.
// -----------------------------------------------------------------------------
test("raidsRepelled gate: defenseScore≥1 raid resolve DOES increment counter", () => {
  const state = {
    agents: [],
    animals: [],
    resources: { food: 100, wood: 100, stone: 0, herbs: 0, meals: 0, medicine: 0, tools: 0 },
    buildings: {
      warehouses: 1, farms: 0, lumbers: 0, roads: 0, walls: 4, gates: 0,
      quarries: 0, herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0, bridges: 0,
    },
    grid: { width: 4, height: 4, tiles: new Uint8Array(16), version: 0 },
    gameplay: {},
    metrics: {
      timeSec: 0, tick: 0,
      birthsTotal: 0, deathsTotal: 0,
      raidsRepelled: 0,
    },
    controls: {},
    events: {
      queue: [],
      active: [{
        id: "raid-defended",
        type: EVENT_TYPE.BANDIT_RAID,
        status: "active",
        elapsedSec: 9.5,
        durationSec: 10,
        intensity: 1,
        payload: {
          targetTiles: [{ ix: 0, iz: 0 }],
          targetKind: "depot",
          targetRefId: "test-depot",
          defenseScore: 4,         // strong wall coverage
          blockedByWalls: true,
          sabotageApplied: true,
          impactTile: null,
          secondaryImpactTile: null,
        },
      }],
    },
    eventQueue: [],
    ai: {},
    debug: {},
  };

  const sys = new WorldEventSystem();
  sys.update(1, state);

  assert.equal(
    state.metrics.raidsRepelled,
    1,
    `expected raidsRepelled=1 for a defended raid resolve, got ${state.metrics.raidsRepelled}`,
  );
});
