// v0.10.0-a — Worker FSM foundation tests. Phase 1 of 5 in the
// Priority-FSM rewrite per
// docs/superpowers/plans/2026-04-30-worker-fsm-rewrite-plan.md.
//
// Asserts the dispatcher contract end-to-end while phase-a state bodies
// are still no-op stubs:
//
//   1. WorkerFSM constructor accepts default behavior+transitions.
//   2. First tickWorker call initializes worker.fsm to
//      { state: "IDLE", enteredAtSec }.
//   3. With empty transitions, the worker stays in IDLE across ticks.
//   4. Manual transition: inject a custom table where IDLE has
//      [{ when: () => true, to: "EATING", priority: 0 }]; verify the
//      worker transitions to EATING on next tick + onEnter fires + the
//      EATING.onExit fires when a follow-up transition leaves it.
//   5. STATE enum has exactly 14 entries matching the plan.
//   6. FEATURE_FLAGS.USE_FSM is false by default; flipping via
//      _testSetFeatureFlag to true changes the dispatch path
//      (WorkerAISystem allocates _workerFSM and stops touching
//      _jobScheduler on subsequent ticks).
//
// Test-conventions precedent: test/job-layer-foundation.test.js (v0.9.0-a).

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";
import { BoidsSystem } from "../src/simulation/movement/BoidsSystem.js";
import { WorkerFSM } from "../src/simulation/npc/fsm/WorkerFSM.js";
import { STATE, STATE_BEHAVIOR } from "../src/simulation/npc/fsm/WorkerStates.js";
import { STATE_TRANSITIONS } from "../src/simulation/npc/fsm/WorkerTransitions.js";
import { FEATURE_FLAGS, _testSetFeatureFlag } from "../src/config/constants.js";

function aliveWorkers(state) {
  return state.agents.filter((a) => a.type === "WORKER" && a.alive !== false);
}

test("v0.10.0-a #1: WorkerFSM constructor accepts default behavior + transitions", () => {
  const fsm = new WorkerFSM();
  // Defaults wire to the production maps from WorkerStates / WorkerTransitions.
  // We don't snoop privates, but stats start at zero.
  const stats = fsm.getStats();
  assert.equal(stats.tickCount, 0, "no ticks yet");
  assert.equal(stats.transitionCount, 0, "no transitions yet");
  // Custom-injection form must also work.
  const customBehavior = { IDLE: { onEnter: () => {}, tick: () => {}, onExit: () => {} } };
  const customTransitions = { IDLE: [] };
  const fsm2 = new WorkerFSM(customBehavior, customTransitions);
  assert.deepEqual(fsm2.getStats(), { tickCount: 0, transitionCount: 0 });
});

test("v0.10.0-a #2: first tickWorker initializes worker.fsm to IDLE with enteredAtSec", () => {
  const state = createInitialGameState({ seed: 1337, bareInitial: true });
  state.session.phase = "active";
  state.metrics.timeSec = 12.5;
  const services = createServices(state.world.mapSeed);
  const fsm = new WorkerFSM();
  const worker = aliveWorkers(state)[0];
  assert.ok(worker, "expected at least one worker in bare-init");
  assert.equal(worker.fsm, undefined, "worker.fsm is unset on spawn");

  fsm.tickWorker(worker, state, services, 1 / 30);

  assert.ok(worker.fsm, "worker.fsm allocated by dispatcher");
  assert.equal(worker.fsm.state, "IDLE", "default state is IDLE");
  assert.equal(worker.fsm.enteredAtSec, 12.5, "enteredAtSec stamped from state.metrics.timeSec");
  assert.equal(fsm.getStats().tickCount, 1, "tickCount bumped");
});

test("v0.10.0-a #3: with empty transitions worker stays in IDLE across ticks", () => {
  const state = createInitialGameState({ seed: 1337, bareInitial: true });
  state.session.phase = "active";
  state.metrics.timeSec = 0;
  const services = createServices(state.world.mapSeed);
  const fsm = new WorkerFSM(); // production maps — phase-a empty transitions
  const worker = aliveWorkers(state)[0];

  for (let i = 0; i < 20; i++) {
    state.metrics.timeSec += 1 / 30;
    fsm.tickWorker(worker, state, services, 1 / 30);
  }

  assert.equal(worker.fsm.state, "IDLE", "worker stays in IDLE forever with empty transitions");
  assert.equal(fsm.getStats().transitionCount, 0, "no transitions fired");
  assert.equal(fsm.getStats().tickCount, 20, "exactly 20 ticks recorded");
});

test("v0.10.0-a #4: manual transition fires onExit (old) → onEnter (new) lifecycle hooks", () => {
  const state = createInitialGameState({ seed: 1337, bareInitial: true });
  state.session.phase = "active";
  state.metrics.timeSec = 0;
  const services = createServices(state.world.mapSeed);

  // Spy behaviour map. Each hook records the worker.fsm.state observed
  // when it was called so we can verify ordering (onExit must see the
  // *old* state, onEnter the *new* state — the dispatcher swaps before
  // calling onEnter, but onExit precedes the swap).
  const calls = [];
  const makeSpy = (label) => Object.freeze({
    onEnter: (w) => calls.push(`${label}:onEnter:${w.fsm.state}`),
    tick: (w) => calls.push(`${label}:tick:${w.fsm.state}`),
    onExit: (w) => calls.push(`${label}:onExit:${w.fsm.state}`),
  });
  const behavior = Object.freeze({
    IDLE: makeSpy("IDLE"),
    EATING: makeSpy("EATING"),
    SEEKING_FOOD: makeSpy("SEEKING_FOOD"),
  });

  // Tick 1: IDLE → EATING (always-true predicate).
  // Tick 2: EATING → SEEKING_FOOD (toggle to verify onExit fires on a
  // *second* transition, not just the initial setup).
  let allowEatingExit = false;
  const transitions = Object.freeze({
    IDLE: Object.freeze([
      { priority: 0, to: "EATING", when: () => true },
    ]),
    EATING: Object.freeze([
      { priority: 0, to: "SEEKING_FOOD", when: () => allowEatingExit },
    ]),
    SEEKING_FOOD: Object.freeze([]),
  });

  const fsm = new WorkerFSM(behavior, transitions);
  const worker = aliveWorkers(state)[0];

  // First tick: dispatcher allocates worker.fsm → IDLE → onEnter(IDLE).
  // Then walks IDLE.transitions, sees `when() => true`, switches:
  // onExit(IDLE) → state := EATING → onEnter(EATING). Then ticks EATING.
  fsm.tickWorker(worker, state, services, 1 / 30);

  assert.equal(worker.fsm.state, "EATING", "transitioned to EATING on first tick");
  // Expected sequence:
  //   IDLE:onEnter:IDLE   (initial allocation)
  //   IDLE:onExit:IDLE    (onExit called BEFORE swap, so old name still IDLE)
  //   EATING:onEnter:EATING (after swap)
  //   EATING:tick:EATING  (post-transition tick on the new state)
  assert.deepEqual(calls, [
    "IDLE:onEnter:IDLE",
    "IDLE:onExit:IDLE",
    "EATING:onEnter:EATING",
    "EATING:tick:EATING",
  ], "lifecycle hook ordering matches §3.2 contract");
  assert.equal(fsm.getStats().transitionCount, 1, "one transition recorded");

  // Second tick: EATING.tick fires (no transition yet — predicate false).
  fsm.tickWorker(worker, state, services, 1 / 30);
  assert.equal(worker.fsm.state, "EATING", "still EATING — predicate false");

  // Flip predicate. Third tick: EATING → SEEKING_FOOD.
  allowEatingExit = true;
  state.metrics.timeSec += 1 / 30;
  fsm.tickWorker(worker, state, services, 1 / 30);
  assert.equal(worker.fsm.state, "SEEKING_FOOD", "transitioned to SEEKING_FOOD on third tick");

  // The onExit for EATING must appear before SEEKING_FOOD.onEnter.
  const exitIdx = calls.findIndex((c) => c === "EATING:onExit:EATING");
  const enterIdx = calls.findIndex((c) => c === "SEEKING_FOOD:onEnter:SEEKING_FOOD");
  assert.ok(exitIdx >= 0, "EATING.onExit fired");
  assert.ok(enterIdx >= 0, "SEEKING_FOOD.onEnter fired");
  assert.ok(exitIdx < enterIdx, "onExit precedes onEnter");
  assert.equal(fsm.getStats().transitionCount, 2, "two transitions recorded total");
});

test("v0.10.0-a #5: STATE enum has exactly 14 entries matching the plan", () => {
  const expected = [
    "IDLE", "SEEKING_FOOD", "EATING", "SEEKING_REST", "RESTING", "FIGHTING",
    "SEEKING_HARVEST", "HARVESTING", "DELIVERING", "DEPOSITING",
    "SEEKING_BUILD", "BUILDING", "SEEKING_PROCESS", "PROCESSING",
  ];
  const actual = Object.keys(STATE);
  assert.equal(actual.length, 14, "STATE enum must have exactly 14 entries");
  assert.deepEqual(actual.sort(), expected.slice().sort(), "STATE keys match the plan §3.1 list");
  for (const name of expected) {
    assert.equal(STATE[name], name, `STATE.${name} stringifies to "${name}"`);
  }
  // STATE_BEHAVIOR / STATE_TRANSITIONS must cover every STATE. Phase-b
  // populates STATE_TRANSITIONS so we no longer assert empty lists; we
  // only assert each list is a frozen array (potentially non-empty).
  for (const name of expected) {
    assert.ok(STATE_BEHAVIOR[name], `STATE_BEHAVIOR has entry for ${name}`);
    assert.ok(STATE_TRANSITIONS[name], `STATE_TRANSITIONS has entry for ${name}`);
    assert.ok(Array.isArray(STATE_TRANSITIONS[name]), `STATE_TRANSITIONS[${name}] is an array`);
  }
  // STATE itself must be frozen.
  assert.ok(Object.isFrozen(STATE), "STATE is frozen");
  assert.ok(Object.isFrozen(STATE_BEHAVIOR), "STATE_BEHAVIOR is frozen");
  assert.ok(Object.isFrozen(STATE_TRANSITIONS), "STATE_TRANSITIONS is frozen");
});

test("v0.10.0-a #6: USE_FSM defaults to false; flipping it changes WorkerAISystem dispatch", () => {
  // Default: flag OFF → JobScheduler path. _workerFSM stays null; the
  // existing v0.9.x _jobScheduler is allocated.
  assert.equal(FEATURE_FLAGS.USE_FSM, false, "USE_FSM defaults to false");

  const state1 = createInitialGameState({ seed: 1337, bareInitial: true });
  state1.session.phase = "active";
  state1.resources.food = 9999;
  const services1 = createServices(state1.world.mapSeed);
  const sys1 = new WorkerAISystem();
  const boids1 = new BoidsSystem();

  state1.metrics.timeSec = (state1.metrics.timeSec ?? 0) + 1 / 30;
  state1.metrics.tick = (state1.metrics.tick ?? 0) + 1;
  sys1.update(1 / 30, state1, services1);
  boids1.update(1 / 30, state1, services1);

  assert.equal(sys1._workerFSM, null, "USE_FSM=false: _workerFSM stays null");
  assert.ok(sys1._jobScheduler, "USE_FSM=false: _jobScheduler is allocated (v0.9.x path)");

  // Flip flag ON, run a fresh harness, verify the dispatch path swaps.
  _testSetFeatureFlag("USE_FSM", true);
  try {
    assert.equal(FEATURE_FLAGS.USE_FSM, true, "USE_FSM flipped to true");

    const state2 = createInitialGameState({ seed: 1337, bareInitial: true });
    state2.session.phase = "active";
    state2.resources.food = 9999;
    const services2 = createServices(state2.world.mapSeed);
    const sys2 = new WorkerAISystem();
    const boids2 = new BoidsSystem();

    state2.metrics.timeSec = (state2.metrics.timeSec ?? 0) + 1 / 30;
    state2.metrics.tick = (state2.metrics.tick ?? 0) + 1;
    sys2.update(1 / 30, state2, services2);
    boids2.update(1 / 30, state2, services2);

    assert.ok(sys2._workerFSM, "USE_FSM=true: _workerFSM allocated");
    assert.equal(sys2._jobScheduler, null, "USE_FSM=true: _jobScheduler not allocated");

    // Stats counter proves WorkerFSM.tickWorker actually ran for at
    // least one worker. Phase-a dispatcher pins everyone in IDLE so
    // transitionCount stays 0, but tickCount is the worker count.
    const stats = sys2._workerFSM.getStats();
    assert.ok(stats.tickCount >= 1, `WorkerFSM.tickWorker ran (tickCount=${stats.tickCount})`);
    assert.equal(stats.transitionCount, 0, "phase-a empty transitions: no transitions fire");

    // Every alive worker should now be in IDLE (the default state with
    // an empty IDLE.transitions list — no escape).
    for (const w of aliveWorkers(state2).filter((w) => !w.isStressWorker)) {
      assert.equal(w.fsm?.state, "IDLE", `worker ${w.id} pinned in IDLE`);
    }
  } finally {
    // Restore default to keep tests isolated (precedent: v0.9.0-a tests).
    _testSetFeatureFlag("USE_FSM", false);
  }
  assert.equal(FEATURE_FLAGS.USE_FSM, false, "flag restored to default after test");
});
