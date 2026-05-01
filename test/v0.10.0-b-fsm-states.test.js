// v0.10.0-b — Worker FSM state-bodies + transition-table tests. Phase 2 of
// 5 in the Priority-FSM rewrite per
// docs/superpowers/plans/2026-04-30-worker-fsm-rewrite-plan.md.
//
// 16 cases — covering (v0.10.1-l: removed #16 SURVIVAL_FOOD and #18 EATING tests):
//   1-12. Each STATE has non-stub onEnter/tick/onExit (smoke).
//   13. Transition table: each non-FIGHTING state has COMBAT_PREEMPT at
//       index 0 (the §3.5 priority-0 row).
//   14. SEEKING_HARVEST.onEnter calls tryReserve; onExit releases.
//   15. IDLE → SEEKING_HARVEST when role=FARM and farms exist.
//   16. Determinism: same seed produces identical state-transition
//       sequence for one worker over 60 ticks.
//
// Test conventions follow test/job-layer-foundation.test.js and
// test/v0.10.0-a-fsm-foundation.test.js.

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { WorkerFSM } from "../src/simulation/npc/fsm/WorkerFSM.js";
import { STATE, STATE_BEHAVIOR } from "../src/simulation/npc/fsm/WorkerStates.js";
import { STATE_TRANSITIONS, _TRANSITION_ROWS } from "../src/simulation/npc/fsm/WorkerTransitions.js";
import { JobReservation } from "../src/simulation/npc/JobReservation.js";
import { ROLE, TILE } from "../src/config/constants.js";
import { setTile } from "../src/world/grid/Grid.js";

// All 12 expected state names per §3.1 (SEEKING_FOOD and EATING removed in v0.10.1-l).
const ALL_STATES = [
  "IDLE", "SEEKING_REST", "RESTING", "FIGHTING",
  "SEEKING_HARVEST", "HARVESTING", "DELIVERING", "DEPOSITING",
  "SEEKING_BUILD", "BUILDING", "SEEKING_PROCESS", "PROCESSING",
];

function aliveWorkers(state) {
  return state.agents.filter((a) => a.type === "WORKER" && a.alive !== false);
}

// -----------------------------------------------------------------------------
// 1-14. Each state has a real (non-stub) onEnter/tick/onExit triple.
// -----------------------------------------------------------------------------

for (let i = 0; i < ALL_STATES.length; i++) {
  const name = ALL_STATES[i];
  test(`v0.10.0-b #${i + 1}: STATE_BEHAVIOR.${name} has non-stub onEnter/tick/onExit`, () => {
    const beh = STATE_BEHAVIOR[name];
    assert.ok(beh, `STATE_BEHAVIOR[${name}] exists`);
    assert.equal(typeof beh.onEnter, "function", `${name}.onEnter is a function`);
    assert.equal(typeof beh.tick, "function", `${name}.tick is a function`);
    assert.equal(typeof beh.onExit, "function", `${name}.onExit is a function`);
    // The phase-a stub was a single shared `noOpBehavior` frozen object. In
    // phase-b each state has its own behavior object, so no two states should
    // be the SAME reference (smoke for "stubs leaked").
    for (const other of ALL_STATES) {
      if (other === name) continue;
      assert.notEqual(beh, STATE_BEHAVIOR[other],
        `${name} and ${other} must not share the phase-a no-op singleton`);
    }
  });
}

// -----------------------------------------------------------------------------
// 15. Transition table: every non-FIGHTING state has COMBAT_PREEMPT at index 0.
//     FIGHTING's priority-0 entry is the noHostileInRange exit (per §3.5).
// -----------------------------------------------------------------------------

test("v0.10.0-b #15: each state's priority-0 entry is COMBAT_PREEMPT (where applicable)", () => {
  for (const name of ALL_STATES) {
    const list = STATE_TRANSITIONS[name];
    assert.ok(Array.isArray(list), `${name} transitions is an array`);
    if (name === "FIGHTING") {
      // FIGHTING's priority-0 is the noHostileInRange → IDLE row, not COMBAT_PREEMPT.
      assert.equal(list[0]?.to, STATE.IDLE,
        "FIGHTING's priority-0 entry transitions back to IDLE on no-hostile");
      continue;
    }
    assert.ok(list.length >= 1, `${name} has ≥1 transition`);
    assert.equal(list[0], _TRANSITION_ROWS.COMBAT_PREEMPT,
      `${name} transitions[0] is the shared COMBAT_PREEMPT row`);
  }
});

// -----------------------------------------------------------------------------
// 17. SEEKING_HARVEST.onEnter calls tryReserve (mock); onExit releases.
// -----------------------------------------------------------------------------

test("v0.10.0-b #17: SEEKING_HARVEST.onEnter calls tryReserve, onExit calls releaseAll", () => {
  // Build a minimal scenario: place a FARM tile next to the worker so
  // chooseWorkerTarget returns a valid target.
  const state = createInitialGameState({ seed: 1337, bareInitial: true });
  state.session.phase = "active";
  state.metrics.timeSec = 5;
  state.buildings.farms = 1;
  // Place a FARM tile near the colony center.
  setTile(state.grid, 48, 36, TILE.FARM);
  const services = createServices(state.world.mapSeed);
  const worker = aliveWorkers(state)[0];
  worker.role = ROLE.FARM;
  worker.x = 0; worker.z = 0; // near tile (48,36) given grid centering

  // Spy reservation.
  const reserveCalls = [];
  const releaseCalls = [];
  state._jobReservation = {
    tryReserve(workerId, ix, iz, intent, nowSec) {
      reserveCalls.push({ workerId, ix, iz, intent, nowSec });
      return true;
    },
    releaseAll(workerId) { releaseCalls.push({ workerId }); },
    cleanupStale() {},
    getOccupant() { return null; },
    isReserved() { return false; },
  };

  // Manually call SEEKING_HARVEST onEnter.
  worker.fsm = {
    state: STATE.SEEKING_HARVEST,
    enteredAtSec: 5,
    target: null,
    payload: undefined,
  };
  STATE_BEHAVIOR[STATE.SEEKING_HARVEST].onEnter(worker, state, services);

  assert.ok(reserveCalls.length >= 1, "tryReserve called at least once");
  assert.equal(reserveCalls[0].workerId, worker.id, "reserve called with this worker's id");

  // onExit releases.
  STATE_BEHAVIOR[STATE.SEEKING_HARVEST].onExit(worker, state, services);
  assert.ok(releaseCalls.length >= 1, "releaseAll called by onExit");
  assert.equal(releaseCalls[0].workerId, worker.id, "releaseAll called for this worker");
});

// -----------------------------------------------------------------------------
// 19. IDLE → SEEKING_HARVEST when role=FARM and farms exist.
// -----------------------------------------------------------------------------

test("v0.10.0-b #19: IDLE → SEEKING_HARVEST when role=FARM and farms exist", () => {
  const state = createInitialGameState({ seed: 1337, bareInitial: true });
  state.session.phase = "active";
  state.metrics.timeSec = 5;
  state.buildings.farms = 1;
  setTile(state.grid, 48, 36, TILE.FARM);
  const services = createServices(state.world.mapSeed);
  const worker = aliveWorkers(state)[0];
  worker.role = ROLE.FARM;
  worker.hunger = 1.0; // not hungry
  worker.rest = 1.0;   // not tired
  worker.carry = { food: 0, wood: 0, stone: 0, herbs: 0 };
  // Ensure no construction sites exist.
  state.constructionSites = [];

  const fsm = new WorkerFSM();
  fsm.tickWorker(worker, state, services, 1 / 30);

  // First tick: dispatcher allocates fsm → IDLE, then walks IDLE
  // transitions and finds harvestAvailableForRole → SEEKING_HARVEST.
  assert.equal(worker.fsm.state, STATE.SEEKING_HARVEST,
    `IDLE → SEEKING_HARVEST for FARM worker (got ${worker.fsm.state})`);
});

// -----------------------------------------------------------------------------
// 20. Determinism: same seed produces identical state sequence over 60 ticks.
// -----------------------------------------------------------------------------

test("v0.10.0-b #20: determinism — same seed produces identical state sequence over 60 ticks", () => {
  function runOnce() {
    const state = createInitialGameState({ seed: 1337, bareInitial: true });
    state.session.phase = "active";
    state.metrics.timeSec = 0;
    state.resources.food = 50;
    state.buildings.warehouses = 1;
    const services = createServices(state.world.mapSeed);
    const fsm = new WorkerFSM();
    const worker = aliveWorkers(state)[0];
    worker.role = ROLE.FARM;
    worker.hunger = 0.5;
    worker.rest = 0.8;

    const sequence = [];
    for (let i = 0; i < 60; i++) {
      state.metrics.timeSec += 1 / 30;
      fsm.tickWorker(worker, state, services, 1 / 30);
      sequence.push(worker.fsm.state);
    }
    return sequence;
  }
  const a = runOnce();
  const b = runOnce();
  assert.deepEqual(a, b, "identical seed + state ⇒ identical state-transition sequence");
});
