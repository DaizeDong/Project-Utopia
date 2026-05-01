// v0.10.1 HW7 Final-Polish-Loop Round 1 wave-2 (C1-code-architect) —
// Generic dispatcher lock test for `src/simulation/npc/PriorityFSM.js`.
// Drives the dispatcher with synthetic stub behaviour + transitions
// tables (independent of WorkerStates / WorkerTransitions) so any
// future change to the worker behaviour table cannot mask a regression
// in the dispatcher kernel itself.
//
// Coverage:
//   (a) Bootstrap: tick on an entity with no `.fsm` allocates the
//       default state, fires onEnter, stamps enteredAtSec.
//   (b) Lifecycle ordering: priority-walk first-match-wins;
//       onExit (old) → fsm reset → onEnter (new); ticks the new
//       state's tick body (not the old one) on the same dispatcher
//       pass.
//   (c) `entity.stateLabel` is single-written by the dispatcher every
//       tick from `displayLabel[fsm.state]` (not by state bodies).
//   (d) `_enterState` resets target + payload on every transition.
//   (e) Self-transition (oldName === newName) is a no-op and does not
//       bump transitionCount.
//   (f) Construction without a behavior/transitions argument is safe
//       (defaults to empty maps; tick on a fresh entity is a no-op
//       beyond bootstrap allocation).

import test from "node:test";
import assert from "node:assert/strict";
import { PriorityFSM } from "../src/simulation/npc/PriorityFSM.js";

function makeState(timeSec = 0) {
  return { metrics: { timeSec } };
}

test("PriorityFSM: bootstrap allocates default state and fires onEnter", () => {
  const calls = [];
  const fsm = new PriorityFSM({
    behavior: {
      IDLE: {
        onEnter: () => calls.push("enter:IDLE"),
        tick: () => calls.push("tick:IDLE"),
      },
    },
    transitions: { IDLE: [] },
    displayLabel: { IDLE: "Idle" },
    defaultState: "IDLE",
  });
  const entity = {};
  fsm.tick(entity, makeState(5), {}, 0.016);
  assert.equal(entity.fsm.state, "IDLE");
  assert.equal(entity.fsm.enteredAtSec, 5);
  assert.equal(entity.fsm.target, null);
  assert.equal(entity.fsm.payload, undefined);
  assert.deepEqual(calls, ["enter:IDLE", "tick:IDLE"]);
  assert.equal(entity.stateLabel, "Idle");
  assert.equal(fsm.getStats().tickCount, 1);
  assert.equal(fsm.getStats().transitionCount, 0);
});

test("PriorityFSM: priority walk fires first-match transition then ticks new state", () => {
  const calls = [];
  const transitions = {
    IDLE: [
      { priority: 1, to: "WORK", when: () => true },
      // Should never fire — first match wins.
      { priority: 2, to: "REST", when: () => true },
    ],
    WORK: [],
    REST: [],
  };
  const fsm = new PriorityFSM({
    behavior: {
      IDLE: {
        onEnter: () => calls.push("enter:IDLE"),
        onExit: () => calls.push("exit:IDLE"),
        tick: () => calls.push("tick:IDLE"),
      },
      WORK: {
        onEnter: () => calls.push("enter:WORK"),
        tick: () => calls.push("tick:WORK"),
      },
      REST: {
        onEnter: () => calls.push("enter:REST"),
        tick: () => calls.push("tick:REST"),
      },
    },
    transitions,
    displayLabel: { IDLE: "Idle", WORK: "Working", REST: "Resting" },
    defaultState: "IDLE",
  });
  const entity = {};
  // First tick bootstraps to IDLE then transitions to WORK on the SAME
  // pass and ticks WORK (per the contract — priority walk happens
  // before the tick body).
  fsm.tick(entity, makeState(0), {}, 0.016);
  assert.equal(entity.fsm.state, "WORK");
  assert.deepEqual(calls, [
    "enter:IDLE",
    "exit:IDLE",
    "enter:WORK",
    "tick:WORK",
  ]);
  assert.equal(entity.stateLabel, "Working");
  assert.equal(fsm.getStats().transitionCount, 1);
});

test("PriorityFSM: stateLabel is single-written by the dispatcher", () => {
  // State body tries to overwrite stateLabel; dispatcher must clobber
  // it back from displayLabel post-tick.
  const fsm = new PriorityFSM({
    behavior: {
      A: {
        tick: (entity) => {
          entity.stateLabel = "Hijacked";
        },
      },
    },
    transitions: { A: [] },
    displayLabel: { A: "Canonical-A" },
    defaultState: "A",
  });
  const entity = {};
  fsm.tick(entity, makeState(0), {}, 0.016);
  assert.equal(entity.stateLabel, "Canonical-A");
});

test("PriorityFSM: _enterState resets target and payload on every transition", () => {
  const transitions = {
    A: [{ priority: 1, to: "B", when: () => true }],
    B: [],
  };
  const fsm = new PriorityFSM({
    behavior: {
      A: {
        onEnter: (entity) => {
          entity.fsm.target = { ix: 1, iz: 2 };
          entity.fsm.payload = { stash: 7 };
        },
      },
      B: {},
    },
    transitions,
    defaultState: "A",
  });
  const entity = {};
  // First tick: bootstrap A (sets target+payload via onEnter), then
  // transition A→B (must reset target+payload to null/undefined).
  fsm.tick(entity, makeState(0), {}, 0.016);
  assert.equal(entity.fsm.state, "B");
  assert.equal(entity.fsm.target, null);
  assert.equal(entity.fsm.payload, undefined);
});

test("PriorityFSM: self-transition is a no-op (does not bump transitionCount or fire onExit/onEnter)", () => {
  const calls = [];
  const fsm = new PriorityFSM({
    behavior: {
      X: {
        onEnter: () => calls.push("enter:X"),
        onExit: () => calls.push("exit:X"),
        tick: () => calls.push("tick:X"),
      },
    },
    // X transitions to X — must be a no-op per contract.
    transitions: { X: [{ priority: 1, to: "X", when: () => true }] },
    defaultState: "X",
  });
  const entity = {};
  fsm.tick(entity, makeState(0), {}, 0.016);
  fsm.tick(entity, makeState(1), {}, 0.016);
  assert.equal(fsm.getStats().transitionCount, 0);
  // Bootstrap onEnter fires once on first tick; no exit/enter on
  // subsequent self-transition attempts.
  assert.deepEqual(calls, ["enter:X", "tick:X", "tick:X"]);
});

test("PriorityFSM: empty constructor is safe; tick bootstraps fallback default state", () => {
  const fsm = new PriorityFSM();
  const entity = {};
  // No behavior / no transitions → bootstrap to fallback "IDLE", no
  // hooks fire, no labels written, no crash.
  fsm.tick(entity, makeState(3), {}, 0.016);
  assert.equal(entity.fsm.state, "IDLE");
  assert.equal(entity.fsm.enteredAtSec, 3);
  assert.equal(entity.stateLabel, undefined);
  assert.equal(fsm.getStats().tickCount, 1);
});
