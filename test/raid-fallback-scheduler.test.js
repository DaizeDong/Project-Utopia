// v0.8.2 Round-6 Wave-2 (02a-rimworld-veteran Steps 5-6) — RaidEscalator
// fallback scheduler.
//
// The RaidEscalatorSystem.update method now self-fires BANDIT_RAID when the
// LLM directive path is unavailable (100% of fallback sessions). This test
// validates the four floors that protect the 4-seed bench gate:
//   (a) tier=0 never triggers (DI hasn't grown yet)
//   (b) tier ≥ 1 + elapsed ≥ intervalTicks + all floors satisfied → enqueues 1
//   (c) elapsed < intervalTicks does not trigger
//   (d) food < foodFloor does not trigger (don't kick a starving colony)

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { RaidEscalatorSystem } from "../src/simulation/meta/RaidEscalatorSystem.js";
import { BALANCE } from "../src/config/balance.js";
import { EVENT_TYPE } from "../src/config/constants.js";

function primeStateForFallback(state, { tier = 2, food = 200, pop = 30, elapsedSinceLastRaid = null } = {}) {
  // DevIndex bigger than tier * devIndexPerRaidTier so RaidEscalator computes
  // tier ≥ requested.
  const perTier = Number(BALANCE.devIndexPerRaidTier ?? 15);
  state.gameplay.devIndexSmoothed = tier * perTier;
  // Set timeSec well past graceSec so the boot grace floor passes.
  state.metrics.timeSec = Number(BALANCE.raidFallbackGraceSec ?? 360) + 60;
  state.metrics.tick = 100000;
  // Position lastRaidTick so elapsed is configurable.
  const intervalTicks = Math.max(1, Number(BALANCE.raidIntervalBaseTicks ?? 3600)
    - tier * Number(BALANCE.raidIntervalReductionPerTier ?? 300));
  state.gameplay.lastRaidTick = elapsedSinceLastRaid === null
    ? state.metrics.tick - intervalTicks - 5
    : state.metrics.tick - elapsedSinceLastRaid;
  state.resources.food = food;
  // Synthesize a population large enough to clear popFloor.
  state.agents = state.agents ?? [];
  while (state.agents.length < pop) {
    state.agents.push({ id: `mock${state.agents.length}`, type: "WORKER", alive: true });
  }
  for (const a of state.agents) a.alive = true;
  state.events = state.events ?? { queue: [], active: [] };
  state.events.queue = [];
  state.events.active = [];
}

test("RaidFallbackScheduler: tier=0 never triggers", () => {
  const state = createInitialGameState({ seed: 401 });
  const services = createServices(state.world.mapSeed);
  primeStateForFallback(state, { tier: 0 });
  const sys = new RaidEscalatorSystem();
  sys.update(1 / 30, state, services);
  const queued = state.events.queue.filter((e) => e.type === EVENT_TYPE.BANDIT_RAID);
  assert.equal(queued.length, 0, "tier 0 must not enqueue a fallback raid");
});

test("RaidFallbackScheduler: tier>=1 + elapsed>=interval + floors met → enqueues 1 BANDIT_RAID", () => {
  const state = createInitialGameState({ seed: 402 });
  const services = createServices(state.world.mapSeed);
  primeStateForFallback(state, { tier: 2, food: 300, pop: 30 });
  const sys = new RaidEscalatorSystem();
  sys.update(1 / 30, state, services);
  const queued = state.events.queue.filter((e) => e.type === EVENT_TYPE.BANDIT_RAID);
  assert.equal(queued.length, 1, `expected exactly 1 fallback raid, got ${queued.length}`);
  assert.equal(queued[0].payload?.source, "raid_fallback_scheduler",
    "raid payload must mark source=raid_fallback_scheduler");
});

test("RaidFallbackScheduler: elapsed < intervalTicks does not trigger", () => {
  const state = createInitialGameState({ seed: 403 });
  const services = createServices(state.world.mapSeed);
  // elapsedSinceLastRaid = 100 (much less than intervalTicks for tier 2).
  primeStateForFallback(state, { tier: 2, food: 300, pop: 30, elapsedSinceLastRaid: 100 });
  const sys = new RaidEscalatorSystem();
  sys.update(1 / 30, state, services);
  const queued = state.events.queue.filter((e) => e.type === EVENT_TYPE.BANDIT_RAID);
  assert.equal(queued.length, 0, "must not trigger before intervalTicks elapsed");
});

test("RaidFallbackScheduler: food < foodFloor does not trigger", () => {
  const state = createInitialGameState({ seed: 404 });
  const services = createServices(state.world.mapSeed);
  // food = floor - 10 (below threshold).
  const lowFood = Math.max(0, Number(BALANCE.raidFallbackFoodFloor ?? 60) - 10);
  primeStateForFallback(state, { tier: 2, food: lowFood, pop: 30 });
  const sys = new RaidEscalatorSystem();
  sys.update(1 / 30, state, services);
  const queued = state.events.queue.filter((e) => e.type === EVENT_TYPE.BANDIT_RAID);
  assert.equal(queued.length, 0, "must not kick a starving colony");
});

test("RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)", () => {
  const state = createInitialGameState({ seed: 405 });
  const services = createServices(state.world.mapSeed);
  // pop = floor - 2 (below threshold).
  const lowPop = Math.max(1, Number(BALANCE.raidFallbackPopFloor ?? 18) - 2);
  primeStateForFallback(state, { tier: 2, food: 300, pop: lowPop });
  const sys = new RaidEscalatorSystem();
  sys.update(1 / 30, state, services);
  const queued = state.events.queue.filter((e) => e.type === EVENT_TYPE.BANDIT_RAID);
  assert.equal(queued.length, 0, "must not kick a sub-popFloor colony");
});

test("RaidFallbackScheduler: existing queued/active raid suppresses (no double-stack)", () => {
  const state = createInitialGameState({ seed: 406 });
  const services = createServices(state.world.mapSeed);
  primeStateForFallback(state, { tier: 2, food: 300, pop: 30 });
  // Pre-queue a raid; scheduler must not enqueue a second.
  state.events.queue.push({ id: "preexisting", type: EVENT_TYPE.BANDIT_RAID, status: "prepare", elapsedSec: 0, durationSec: 18, intensity: 1, payload: {} });
  const sys = new RaidEscalatorSystem();
  sys.update(1 / 30, state, services);
  const queued = state.events.queue.filter((e) => e.type === EVENT_TYPE.BANDIT_RAID);
  assert.equal(queued.length, 1, "must not double-stack on top of an existing queued raid");
});
