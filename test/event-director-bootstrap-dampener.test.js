// v0.10.2 PJ-followup-cadence-dampener R7 (Round-7 Final-Polish-Loop).
//
// EventDirectorSystem opening-crisis safety net: while the colony has no farms
// AND we're still in the bootstrap window (state.metrics.timeSec < 180), the
// effective dispatch interval is multiplied by 2.5× (from 90s baseline to 225s)
// so saboteur-draft / wildlife events don't pull workers off harvest during
// the food crash window. The dampener disengages the moment EITHER condition
// flips (farms > 0 OR timeSec >= 180).
//
// This test file exercises three cases:
//   1. farms=0 ∧ t=60 → no dispatch until t ≥ effective half-interval (~112.5s)
//   2. farms=1 ∧ t=60 → first dispatch fires at baseline half-interval (~45s)
//   3. dampener engaged at t=120 (farms=0), then farms=2 set at t=150 →
//      next dispatch fires at baseline 90s cadence from t=150, NOT 225s.

import test from "node:test";
import assert from "node:assert/strict";

import { EventDirectorSystem } from "../src/simulation/meta/EventDirectorSystem.js";
import { BALANCE } from "../src/config/balance.js";

function makeStubState({ farms = 0 } = {}) {
  return {
    metrics: { tick: 0, timeSec: 0 },
    events: { queue: [], active: [], log: [], listeners: new Map() },
    buildings: { farms },
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

test("PJ-followup-dampener: farms=0 ∧ t<180 → no dispatch until effective half-interval (~112s)", () => {
  const sys = new EventDirectorSystem();
  const state = makeStubState({ farms: 0 });
  const intervalSec = Number(BALANCE.eventDirectorBaseIntervalSec); // 90
  const effectiveInterval = intervalSec * 2.5; // 225
  const services = { rng: makeStubRng([0.20]) };

  // Boot tick at t=0 with farms=0 → anchor uses effectiveInterval (×2.5).
  state.metrics.timeSec = 0;
  sys.update(0.5, state, services);
  assert.equal(state.events.queue.length, 0, "first tick must not dispatch (anchor only)");
  assert.equal(
    state.gameplay.eventDirector.lastDispatchSec,
    -effectiveInterval * 0.5,
    "anchor should be seeded to nowSec - effectiveIntervalSec*0.5 (-112.5)",
  );

  // At t=60 (still in bootstrap), elapsed = 60 - (-112.5) = 172.5 < 225 → no dispatch.
  state.metrics.timeSec = 60;
  sys.update(0.5, state, services);
  assert.equal(state.events.queue.length, 0, "at t=60, dampener still active → no dispatch");

  // At t=baseline half-interval (45s), the legacy non-dampened path WOULD dispatch.
  // Confirm dampener suppresses: elapsed = 45 - (-112.5) = 157.5 < 225 → no dispatch.
  state.metrics.timeSec = intervalSec * 0.5; // 45
  sys.update(0.5, state, services);
  assert.equal(state.events.queue.length, 0, "at t=baseline-half (45), dampener still suppresses");

  // At t=effectiveInterval/2 + 1 (113.5s), elapsed = 113.5 - (-112.5) = 226 ≥ 225 → dispatch.
  state.metrics.timeSec = effectiveInterval * 0.5 + 1; // 113.5
  sys.update(0.5, state, services);
  assert.equal(
    state.events.queue.length,
    1,
    `at t=effective-half+1 (113.5), dispatch must fire — got ${state.events.queue.length}`,
  );
});

test("PJ-followup-dampener: farms=1 ∧ t<180 → first dispatch fires at baseline half-interval (~45s)", () => {
  const sys = new EventDirectorSystem();
  const state = makeStubState({ farms: 1 });
  const intervalSec = Number(BALANCE.eventDirectorBaseIntervalSec); // 90
  const services = { rng: makeStubRng([0.20]) };

  // Boot at t=0 with farms=1 → dampener disengages, anchor uses baseline interval.
  state.metrics.timeSec = 0;
  sys.update(0.5, state, services);
  assert.equal(state.events.queue.length, 0, "first tick must not dispatch (anchor only)");
  assert.equal(
    state.gameplay.eventDirector.lastDispatchSec,
    -intervalSec * 0.5,
    "anchor should be seeded to baseline -intervalSec*0.5 (-45) since farms>0",
  );

  // At t=baseline half-interval + 1 (46s), elapsed = 46 - (-45) = 91 ≥ 90 → dispatch.
  state.metrics.timeSec = intervalSec * 0.5 + 1; // 46
  sys.update(0.5, state, services);
  assert.equal(
    state.events.queue.length,
    1,
    `at t=46 with farms=1, baseline cadence dispatches — got ${state.events.queue.length}`,
  );
});

test("PJ-followup-dampener: dampener disengages mid-run when farms appear → baseline cadence resumes", () => {
  const sys = new EventDirectorSystem();
  const state = makeStubState({ farms: 0 });
  const intervalSec = Number(BALANCE.eventDirectorBaseIntervalSec); // 90
  const effectiveInterval = intervalSec * 2.5; // 225
  const services = { rng: makeStubRng([0.20, 0.20]) };

  // Boot at t=120 with farms=0 → dampener engaged, anchor uses effective interval.
  state.metrics.timeSec = 120;
  sys.update(0.5, state, services);
  assert.equal(state.events.queue.length, 0);
  assert.equal(
    state.gameplay.eventDirector.lastDispatchSec,
    120 - effectiveInterval * 0.5, // 120 - 112.5 = 7.5
    "anchor at t=120 with farms=0 uses effectiveInterval offset",
  );

  // At t=150, farms=2 (autopilot/PL guarantee built one). Dampener now disengages.
  // Elapsed = 150 - 7.5 = 142.5 < baseline 90? No, 142.5 >= 90 → dispatches now.
  // (Once farms>0 the gate uses baseline 90s; the elapsed since anchor is already
  // past 90s, so first dispatch fires at t=150 itself.)
  state.buildings.farms = 2;
  state.metrics.timeSec = 150;
  sys.update(0.5, state, services);
  assert.equal(
    state.events.queue.length,
    1,
    `at t=150 with farms=2, baseline cadence resumes and dispatches — got ${state.events.queue.length}`,
  );

  // Confirm next dispatch follows baseline 90s, not 225s, from this point.
  // lastDispatch is now 150. Next eligible at 150+90=240.
  state.metrics.timeSec = 235; // elapsed=85 < 90 → no dispatch yet
  sys.update(0.5, state, services);
  assert.equal(state.events.queue.length, 1, "at t=235, baseline interval not yet elapsed");

  state.metrics.timeSec = 241; // elapsed=91 >= 90 → dispatch
  sys.update(0.5, state, services);
  assert.equal(
    state.events.queue.length,
    2,
    `at t=241, baseline 90s cadence fires second dispatch — got ${state.events.queue.length}`,
  );
});

test("PJ-followup-dampener: dampener disengages at t=180 even if farms still 0", () => {
  const sys = new EventDirectorSystem();
  const state = makeStubState({ farms: 0 });
  const intervalSec = Number(BALANCE.eventDirectorBaseIntervalSec); // 90
  const effectiveInterval = intervalSec * 2.5; // 225
  const services = { rng: makeStubRng([0.20, 0.20]) };

  // Boot at t=100 with farms=0 → dampener engaged.
  state.metrics.timeSec = 100;
  sys.update(0.5, state, services);
  assert.equal(state.events.queue.length, 0);
  // Anchor: 100 - 112.5 = -12.5
  assert.equal(state.gameplay.eventDirector.lastDispatchSec, 100 - effectiveInterval * 0.5);

  // At t=185 (past 180s window), bootstrap window flips off. Elapsed since anchor
  // = 185 - (-12.5) = 197.5; with dampener gone, gate is baseline 90 → dispatches.
  state.metrics.timeSec = 185;
  sys.update(0.5, state, services);
  assert.equal(
    state.events.queue.length,
    1,
    `at t=185 (past bootstrap window), baseline cadence resumes — got ${state.events.queue.length}`,
  );
});
