// v0.8.2 Round-6 Wave-2 (01d-mechanics-content) — EventDirectorSystem tests.
// Verify deterministic dispatch cadence + weight distribution + bandit-raid
// cooldown downgrade.

import test from "node:test";
import assert from "node:assert/strict";

import { EventDirectorSystem } from "../src/simulation/meta/EventDirectorSystem.js";
import { EVENT_TYPE } from "../src/config/constants.js";
import { BALANCE } from "../src/config/balance.js";

function makeStubState() {
  return {
    metrics: { tick: 0, timeSec: 0 },
    events: { queue: [], active: [] },
    gameplay: {
      raidEscalation: {
        tier: 0,
        intervalTicks: 3600,
        intensityMultiplier: 1,
        devIndexSample: 0,
      },
      lastRaidTick: -9999,
    },
    debug: { eventTrace: [] },
    agents: [],
    animals: [],
  };
}

function makeStubRng(values) {
  let i = 0;
  return {
    next: () => {
      const v = values[i % values.length];
      i += 1;
      return v;
    },
  };
}

test("EventDirector: first tick after init does not dispatch (anchor lastDispatchSec)", () => {
  const sys = new EventDirectorSystem();
  const state = makeStubState();
  state.metrics.timeSec = 12;
  const services = { rng: makeStubRng([0.1]) };
  sys.update(0.5, state, services);
  assert.equal(state.events.queue.length, 0, "no event should dispatch on first tick");
  // v0.10.2 PJ-pacing P0 — first-anchor offset: lastDispatchSec is seeded to
  // nowSec - intervalSec*0.5 so the first real dispatch lands at intervalSec/2
  // game-time rather than a full interval out.
  const intervalSec = Number(BALANCE.eventDirectorBaseIntervalSec);
  assert.equal(
    state.gameplay.eventDirector.lastDispatchSec,
    12 - intervalSec * 0.5,
    "anchor should offset back by half-interval",
  );
});

test("EventDirector: dispatches one event after intervalSec elapsed", () => {
  const sys = new EventDirectorSystem();
  const state = makeStubState();
  state.metrics.timeSec = 0;
  const services = { rng: makeStubRng([0.05]) }; // small roll → bandit_raid
  // First call anchors.
  sys.update(0.5, state, services);
  assert.equal(state.events.queue.length, 0);
  // Advance well past intervalSec.
  state.metrics.timeSec = Number(BALANCE.eventDirectorBaseIntervalSec) + 5;
  sys.update(0.5, state, services);
  assert.equal(state.events.queue.length, 1, "one event should dispatch after interval");
});

test("EventDirector: weights produce roughly correct distribution over 100 dispatches", () => {
  const sys = new EventDirectorSystem();
  const state = makeStubState();
  // Rng cycles over many values to hit each weighted band.
  const rngValues = [];
  for (let i = 0; i < 1000; i += 1) rngValues.push((i * 0.0179) % 1);
  const services = { rng: makeStubRng(rngValues) };
  // Anchor.
  sys.update(0.5, state, services);
  const intervalSec = Number(BALANCE.eventDirectorBaseIntervalSec);
  const counts = {};
  for (let n = 0; n < 100; n += 1) {
    state.metrics.timeSec = (n + 1) * (intervalSec + 1);
    // Allow raid to be re-eligible by faking lastRaidTick far back.
    state.metrics.tick = (n + 1) * 4000;
    state.gameplay.lastRaidTick = -99999;
    sys.update(0.5, state, services);
  }
  // Tally events.
  for (const ev of state.events.queue) {
    counts[ev.type] = (counts[ev.type] ?? 0) + 1;
  }
  // Sanity: total ≈ 100 ± 1 (anchor may suppress one).
  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  assert.ok(total >= 95 && total <= 100, `total dispatches ~100, got ${total}`);
  // Each weighted type must appear at least once over 100 rolls (sanity).
  const typesSeen = Object.keys(counts).length;
  assert.ok(typesSeen >= 4, `expected diverse type distribution, got ${typesSeen} types`);
});

test("EventDirector: bandit raid downgrades when cooldown active", () => {
  const sys = new EventDirectorSystem();
  const state = makeStubState();
  // Force raid cooldown active: lastRaidTick recent.
  state.metrics.tick = 100;
  state.gameplay.lastRaidTick = 50; // 50 < intervalTicks 3600 → on cooldown.
  state.metrics.timeSec = 0;
  const services = { rng: makeStubRng([0.0, 0.0]) }; // first roll → banditRaid (highest weight)
  sys.update(0.5, state, services); // anchor
  state.metrics.timeSec = Number(BALANCE.eventDirectorBaseIntervalSec) + 1;
  sys.update(0.5, state, services);
  assert.equal(state.events.queue.length, 1);
  const ev = state.events.queue[0];
  assert.notEqual(ev.type, EVENT_TYPE.BANDIT_RAID,
    `bandit_raid on cooldown should downgrade, got ${ev.type}`);
});

test("EventDirector: services.rng absent falls back to Math.random without throwing", () => {
  const sys = new EventDirectorSystem();
  const state = makeStubState();
  // Anchor and dispatch with no services.
  sys.update(0.5, state);
  state.metrics.timeSec = Number(BALANCE.eventDirectorBaseIntervalSec) + 1;
  sys.update(0.5, state);
  assert.equal(state.events.queue.length, 1);
});
