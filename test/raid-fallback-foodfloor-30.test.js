// v0.10.2 PD P0-3 (Round-5 PD-late-game-escalation implementer).
//
// raidFallbackFoodFloor was 60 — an 80-worker colony churning meals bounces
// food 8-56 most of the time, so the fallback fire was vetoed and raid cadence
// stretched 2-4× past nominal. Lowered to 30. This test confirms the fallback
// fires at food=35 (above 30, was blocked at 60).

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { RaidEscalatorSystem } from "../src/simulation/meta/RaidEscalatorSystem.js";
import { BALANCE } from "../src/config/balance.js";
import { EVENT_TYPE } from "../src/config/constants.js";

function primeStateForFallback(state, { tier = 2, food = 200, pop = 30, elapsedSinceLastRaid = null } = {}) {
  const perTier = Number(BALANCE.devIndexPerRaidTier ?? 15);
  state.gameplay.devIndexSmoothed = tier * perTier;
  state.metrics.timeSec = Number(BALANCE.raidFallbackGraceSec ?? 360) + 60;
  state.metrics.tick = 100000;
  const intervalTicks = Math.max(1, Number(BALANCE.raidIntervalBaseTicks ?? 3600)
    - tier * Number(BALANCE.raidIntervalReductionPerTier ?? 300));
  state.gameplay.lastRaidTick = elapsedSinceLastRaid === null
    ? state.metrics.tick - intervalTicks - 5
    : state.metrics.tick - elapsedSinceLastRaid;
  state.resources.food = food;
  state.agents = state.agents ?? [];
  while (state.agents.length < pop) {
    state.agents.push({ id: `mock${state.agents.length}`, type: "WORKER", alive: true });
  }
  for (const a of state.agents) a.alive = true;
  state.events = state.events ?? { queue: [], active: [] };
  state.events.queue = [];
  state.events.active = [];
}

test("PD P0-3: foodFloor knob is 30 (was 60)", () => {
  // Sanity-check the BALANCE knob itself.
  assert.equal(BALANCE.raidFallbackFoodFloor, 30,
    `PD P0-3: BALANCE.raidFallbackFoodFloor must be 30, got ${BALANCE.raidFallbackFoodFloor}`);
  assert.equal(BALANCE.raidFallbackScheduler.foodFloor, 30,
    `PD P0-3: nested raidFallbackScheduler.foodFloor must be 30, got ${BALANCE.raidFallbackScheduler.foodFloor}`);
});

test("PD P0-3: fallback raid fires at food=35 (above the new floor of 30, was blocked at 60)", () => {
  const state = createInitialGameState({ seed: 7090 });
  const services = createServices(state.world.mapSeed);
  primeStateForFallback(state, { tier: 2, food: 35, pop: 30 });
  const sys = new RaidEscalatorSystem();
  sys.update(1 / 30, state, services);
  const queued = state.events.queue.filter((e) => e.type === EVENT_TYPE.BANDIT_RAID);
  assert.equal(queued.length, 1,
    `PD P0-3: with food=35 (> new floor 30, < old floor 60), fallback raid must fire — got ${queued.length}`);
  assert.equal(queued[0].payload?.source, "raid_fallback_scheduler");
});

test("PD P0-3: fallback raid still vetoed at food=20 (below the new floor of 30)", () => {
  const state = createInitialGameState({ seed: 7091 });
  const services = createServices(state.world.mapSeed);
  primeStateForFallback(state, { tier: 2, food: 20, pop: 30 });
  const sys = new RaidEscalatorSystem();
  sys.update(1 / 30, state, services);
  const queued = state.events.queue.filter((e) => e.type === EVENT_TYPE.BANDIT_RAID);
  assert.equal(queued.length, 0,
    `PD P0-3: at food=20 (below new floor 30), fallback must still veto — got ${queued.length}`);
});
