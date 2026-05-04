// R13 user issue #1 Plan-R13-recruit-prob (P1) — Fast-track recruit cooldown
// drains 2× faster when foodHeadroomSec >= recruitFastTrackHeadroomSec AND
// state.constructionSites.length >= recruitFastTrackPendingJobs.
//
// Tests:
//   1. Baseline (low headroom, no jobs): drain at 1×.
//   2. Headroom OK but no jobs: drain at 1× (gate AND).
//   3. Jobs but no headroom: drain at 1× (gate AND).
//   4. Both gates fire: drain at 2× (with default mult=0.5).
//   5. Mid-tick toggle: jobs drop below threshold → drain reverts to 1×.

import test from "node:test";
import assert from "node:assert/strict";

import { BALANCE } from "../src/config/balance.js";
import { RecruitmentSystem } from "../src/simulation/population/PopulationGrowthSystem.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";

const COOLDOWN_MULT = Number(BALANCE.recruitFastTrackCooldownMult ?? 0.5);
const FAST_TRACK_JOBS = Number(BALANCE.recruitFastTrackPendingJobs ?? 3);
const FAST_TRACK_HEADROOM = Number(BALANCE.recruitFastTrackHeadroomSec ?? 120);

function deterministicServices() {
  return { rng: { next: () => 0.5 } };
}

/** Configure state so computeFoodHeadroomSec returns a target value.
 * headroom = food / (workers * eatPerWorker - producedPerSec)
 * With workers=1, eatPerWorker=0.6, producedPerMin=0 → drainRate=0.6/s
 * → food=72 yields ~120s, food=180 yields 300s, food=18 yields 30s.
 */
function setHeadroom(state, foodForHeadroomSec) {
  state.resources.food = foodForHeadroomSec;
  state.metrics.foodProducedPerMin = 0;
}

function setPendingJobs(state, count) {
  state.constructionSites = new Array(count).fill(null).map((_, i) => ({
    id: `site_${i}`,
    ix: i,
    iz: 0,
    progress: 0,
  }));
}

function tickAndMeasureDrain(state, dt) {
  const before = Number(state.controls.recruitCooldownSec);
  const sys = new RecruitmentSystem();
  sys._timer = 1; // skip the 1Hz spawn/enqueue branch — we only test cooldown drain
  sys.update(dt, state, deterministicServices());
  const after = Number(state.controls.recruitCooldownSec);
  return before - after;
}

test("R13 P1: baseline (no headroom, no jobs) drains cooldown 1×", () => {
  const state = createInitialGameState();
  state.controls.recruitCooldownSec = 10;
  setHeadroom(state, 18); // ~30s headroom (well below 120)
  setPendingJobs(state, 0);
  const drained = tickAndMeasureDrain(state, 1);
  assert.equal(drained, 1, `expected 1× drain (1.0); got ${drained}`);
  assert.equal(state.metrics.recruitFastTrackArmed, false);
});

test("R13 P1: headroom OK but no pending jobs drains cooldown 1× (AND gate)", () => {
  const state = createInitialGameState();
  state.controls.recruitCooldownSec = 10;
  // Strip workers down to 1 so headroom math is predictable.
  state.agents = state.agents.filter((a) => a.type === "WORKER").slice(0, 1);
  setHeadroom(state, 180); // ~300s, above the 120s gate
  setPendingJobs(state, 0);
  const drained = tickAndMeasureDrain(state, 1);
  assert.equal(drained, 1, `expected 1× drain; got ${drained}`);
  assert.equal(state.metrics.recruitFastTrackArmed, false);
});

test("R13 P1: pending jobs OK but no headroom drains cooldown 1× (AND gate)", () => {
  const state = createInitialGameState();
  state.controls.recruitCooldownSec = 10;
  state.agents = state.agents.filter((a) => a.type === "WORKER").slice(0, 1);
  setHeadroom(state, 18); // ~30s, below 120s gate
  setPendingJobs(state, FAST_TRACK_JOBS + 2); // above jobs gate
  const drained = tickAndMeasureDrain(state, 1);
  assert.equal(drained, 1, `expected 1× drain; got ${drained}`);
  assert.equal(state.metrics.recruitFastTrackArmed, false);
});

test("R13 P1: both gates fire → cooldown drains 2× (mult=0.5)", () => {
  const state = createInitialGameState();
  state.controls.recruitCooldownSec = 10;
  state.agents = state.agents.filter((a) => a.type === "WORKER").slice(0, 1);
  setHeadroom(state, 180); // ~300s, above 120s gate
  setPendingJobs(state, FAST_TRACK_JOBS + 2); // above jobs gate
  const drained = tickAndMeasureDrain(state, 1);
  const expected = 1 / COOLDOWN_MULT; // 2.0 with default 0.5
  assert.equal(drained, expected,
    `expected ${expected}× drain when both gates armed; got ${drained}`);
  assert.equal(state.metrics.recruitFastTrackArmed, true);
});

test("R13 P1: mid-tick toggle (jobs drop below threshold) reverts drain to 1×", () => {
  const state = createInitialGameState();
  state.controls.recruitCooldownSec = 20;
  state.agents = state.agents.filter((a) => a.type === "WORKER").slice(0, 1);
  setHeadroom(state, 180);
  setPendingJobs(state, FAST_TRACK_JOBS + 2);
  // First tick: armed
  const drained1 = tickAndMeasureDrain(state, 1);
  assert.equal(drained1, 1 / COOLDOWN_MULT, "armed first tick");
  assert.equal(state.metrics.recruitFastTrackArmed, true);
  // Drop pending jobs below threshold mid-run.
  setPendingJobs(state, FAST_TRACK_JOBS - 1);
  const drained2 = tickAndMeasureDrain(state, 1);
  assert.equal(drained2, 1, `expected revert to 1× after gate fails; got ${drained2}`);
  assert.equal(state.metrics.recruitFastTrackArmed, false);
});
