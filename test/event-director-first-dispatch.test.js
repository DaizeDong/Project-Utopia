// v0.10.2 PJ-pacing P0 (Round-6 Final-Polish-Loop pacing implementer).
//
// EventDirectorSystem first-anchor offset: prior to this change the first
// dispatch landed at t=intervalSec (a full 6 sim-min on the old 360s cadence,
// 90s under the new cadence). Reviewer offset the boot anchor backward by
// intervalSec*0.5 so the very first event lands at ~intervalSec/2, halving
// the "dead zone" players experience after spawn.
//
// This test simulates boot, ticks the system to intervalSec*0.5 + 1 game-sec,
// and asserts that exactly one event has been dispatched into state.events.queue.

import test from "node:test";
import assert from "node:assert/strict";

import { EventDirectorSystem } from "../src/simulation/meta/EventDirectorSystem.js";
import { BALANCE } from "../src/config/balance.js";
import { EVENT_TYPES as BUS_EVENT_TYPES } from "../src/simulation/meta/GameEventBus.js";

function makeStubState() {
  return {
    metrics: { tick: 0, timeSec: 0 },
    events: { queue: [], active: [], log: [], listeners: new Map() },
    gameplay: {
      raidEscalation: { tier: 0, intervalTicks: 3600, intensityMultiplier: 1, devIndexSample: 0 },
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

test("PJ-pacing: first-anchor offset — first dispatch fires at intervalSec/2 + 1 sim-sec post-boot", () => {
  const sys = new EventDirectorSystem();
  const state = makeStubState();
  const intervalSec = Number(BALANCE.eventDirectorBaseIntervalSec);
  // Use a non-raid roll so we avoid cooldown-downgrade noise (animalMigration is the highest weight).
  const services = { rng: makeStubRng([0.20]) };

  // Boot tick at t=0 — anchors lastDispatchSec to 0 - intervalSec*0.5.
  state.metrics.timeSec = 0;
  sys.update(0.5, state, services);
  assert.equal(state.events.queue.length, 0, "first tick must not dispatch (anchor only)");
  assert.equal(
    state.gameplay.eventDirector.lastDispatchSec,
    -intervalSec * 0.5,
    "anchor should be seeded to nowSec - intervalSec*0.5",
  );

  // Advance to one sim-sec before the half-interval boundary. Elapsed =
  // (intervalSec/2 - 1) - (-intervalSec/2) = intervalSec - 1, which is still
  // < intervalSec, so dispatch must NOT fire yet.
  state.metrics.timeSec = intervalSec * 0.5 - 1;
  sys.update(0.5, state, services);
  assert.equal(
    state.events.queue.length,
    0,
    `at t=intervalSec/2-1 (elapsed=intervalSec-1), no dispatch yet — got ${state.events.queue.length}`,
  );

  // Advance just past the half-interval boundary — elapsed = intervalSec + 1
  // which is >= intervalSec, so the first dispatch fires here. Without the
  // anchor offset it would have needed t=intervalSec instead.
  state.metrics.timeSec = intervalSec * 0.5 + 1;
  sys.update(0.5, state, services);
  assert.equal(
    state.events.queue.length,
    1,
    `at t=intervalSec/2+1 (elapsed=intervalSec+1), exactly one event must dispatch — got ${state.events.queue.length}`,
  );
});

test("PJ-pacing: event_started log entry is emitted alongside the queue push", () => {
  const sys = new EventDirectorSystem();
  const state = makeStubState();
  const intervalSec = Number(BALANCE.eventDirectorBaseIntervalSec);
  const services = { rng: makeStubRng([0.20]) };

  // Boot tick anchors.
  sys.update(0.5, state, services);
  // Advance just past the half-interval boundary so first dispatch fires.
  state.metrics.timeSec = intervalSec * 0.5 + 1;
  sys.update(0.5, state, services);

  assert.equal(state.events.queue.length, 1, "queue should contain one dispatched event");
  const startedEntries = (state.events.log ?? []).filter(
    (e) => e.type === BUS_EVENT_TYPES.EVENT_STARTED,
  );
  assert.equal(
    startedEntries.length,
    1,
    `event_started log entry should be emitted exactly once, got ${startedEntries.length}`,
  );
  const detail = startedEntries[0].detail ?? {};
  assert.equal(detail.kind, "event_started", "log entry must carry kind=event_started discriminator");
  assert.ok(detail.eventType, "log entry must include eventType field");
});
