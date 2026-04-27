import test from "node:test";
import assert from "node:assert/strict";

import { DecisionScheduler } from "../src/simulation/ai/strategic/DecisionScheduler.js";

function makeState({ timeSec, workers, food, wood, threat, prosperity, deaths, objIdx, phase }) {
  return {
    metrics: { timeSec, deathsTotal: deaths ?? 0, populationStats: { workers: workers ?? 12 } },
    resources: { food: food ?? 50, wood: wood ?? 50 },
    gameplay: { prosperity: prosperity ?? 40, threat: threat ?? 50, objectiveIndex: objIdx ?? 0 },
    session: { phase: phase ?? "active" },
  };
}

test("triggers on first call (never initialized)", () => {
  const scheduler = new DecisionScheduler();
  const state = makeState({ timeSec: 10 });
  assert.equal(scheduler.shouldTrigger(state), true);
});

test("triggers on heartbeat expiry", () => {
  const scheduler = new DecisionScheduler({ heartbeatSec: 90 });
  const state0 = makeState({ timeSec: 0 });
  scheduler.recordDecision(state0);

  const state1 = makeState({ timeSec: 91 });
  assert.equal(scheduler.shouldTrigger(state1), true);
});

test("does NOT trigger before heartbeat if nothing changed", () => {
  const scheduler = new DecisionScheduler({ heartbeatSec: 90, cooldownSec: 15 });
  const state0 = makeState({ timeSec: 0 });
  scheduler.recordDecision(state0);

  const state1 = makeState({ timeSec: 50 });
  assert.equal(scheduler.shouldTrigger(state1), false);
});

test("triggers immediately on workers === 0 (past cooldown)", () => {
  const scheduler = new DecisionScheduler({ cooldownSec: 15 });
  const state0 = makeState({ timeSec: 0 });
  scheduler.recordDecision(state0);

  const state1 = makeState({ timeSec: 20, workers: 0 });
  assert.equal(scheduler.shouldTrigger(state1), true);
});

test("triggers on resource critical (food <= 5)", () => {
  const scheduler = new DecisionScheduler({ cooldownSec: 15 });
  const state0 = makeState({ timeSec: 0 });
  scheduler.recordDecision(state0);

  const state1 = makeState({ timeSec: 20, food: 3 });
  assert.equal(scheduler.shouldTrigger(state1), true);
});

test("triggers on resource critical (wood <= 5)", () => {
  const scheduler = new DecisionScheduler({ cooldownSec: 15 });
  const state0 = makeState({ timeSec: 0 });
  scheduler.recordDecision(state0);

  const state1 = makeState({ timeSec: 20, wood: 2 });
  assert.equal(scheduler.shouldTrigger(state1), true);
});

test("triggers on threat spike (>= 85)", () => {
  const scheduler = new DecisionScheduler({ cooldownSec: 15 });
  const state0 = makeState({ timeSec: 0 });
  scheduler.recordDecision(state0);

  const state1 = makeState({ timeSec: 20, threat: 90 });
  assert.equal(scheduler.shouldTrigger(state1), true);
});

test("respects cooldown — event within cooldownSec does NOT trigger", () => {
  const scheduler = new DecisionScheduler({ cooldownSec: 15 });
  const state0 = makeState({ timeSec: 0 });
  scheduler.recordDecision(state0);

  // Critical event but within cooldown window
  const state1 = makeState({ timeSec: 10, workers: 0 });
  assert.equal(scheduler.shouldTrigger(state1), false);
});

test("triggers on objective index change", () => {
  const scheduler = new DecisionScheduler({ cooldownSec: 15 });
  const state0 = makeState({ timeSec: 0, objIdx: 0 });
  scheduler.recordDecision(state0);

  const state1 = makeState({ timeSec: 20, objIdx: 1 });
  assert.equal(scheduler.shouldTrigger(state1), true);
});

test("does NOT trigger when phase is menu", () => {
  const scheduler = new DecisionScheduler();
  const state = makeState({ timeSec: 10, phase: "menu" });
  assert.equal(scheduler.shouldTrigger(state), false);
});

test("does NOT trigger when phase is end", () => {
  const scheduler = new DecisionScheduler();
  const state = makeState({ timeSec: 10, phase: "end" });
  assert.equal(scheduler.shouldTrigger(state), false);
});

test("triggers on prosperity drop > 15 points", () => {
  const scheduler = new DecisionScheduler({ cooldownSec: 15 });
  const state0 = makeState({ timeSec: 0, prosperity: 60 });
  scheduler.recordDecision(state0);

  const state1 = makeState({ timeSec: 20, prosperity: 40 });
  assert.equal(scheduler.shouldTrigger(state1), true);
});

test("triggers on prosperity rise > 15 points", () => {
  const scheduler = new DecisionScheduler({ cooldownSec: 15 });
  const state0 = makeState({ timeSec: 0, prosperity: 30 });
  scheduler.recordDecision(state0);

  const state1 = makeState({ timeSec: 20, prosperity: 50 });
  assert.equal(scheduler.shouldTrigger(state1), true);
});

test("triggers on deaths increase (significant event past cooldown)", () => {
  const scheduler = new DecisionScheduler({ cooldownSec: 15 });
  const state0 = makeState({ timeSec: 0, deaths: 2 });
  scheduler.recordDecision(state0);

  const state1 = makeState({ timeSec: 20, deaths: 5 });
  assert.equal(scheduler.shouldTrigger(state1), true);
});
