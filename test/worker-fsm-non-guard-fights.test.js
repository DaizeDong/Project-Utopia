// R5 PB-combat-plumbing Step 6 — assert a non-GUARD worker (FARM, HAUL,
// COOK, etc.) transitions IDLE → FIGHTING when a hostile (wolf) is within
// `BALANCE.guardAggroRadius`.
//
// Pre-fix (PB-combat-engagement P0-3): `hostileInAggroRadiusForGuard`
// short-circuited on `role !== GUARD`, so a FARM worker being eaten by a
// wolf reported `IDLE / Wander` and never entered FIGHTING. The user-
// reported "worker 不主动攻击" repro followed.
//
// Post-fix: predicate renamed to `hostileInAggroRadius` and the GUARD
// short-circuit dropped. The priority-0 COMBAT_PREEMPT row in IDLE's
// transition list now fires for any worker, regardless of role, with a
// hostile in aggro range.

import test from "node:test";
import assert from "node:assert/strict";

import { ANIMAL_KIND, ANIMAL_SPECIES, ROLE } from "../src/config/constants.js";
import { BALANCE } from "../src/config/balance.js";
import { createInitialGameState, createWorker, createAnimal } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { WorkerFSM } from "../src/simulation/npc/fsm/WorkerFSM.js";
import { STATE } from "../src/simulation/npc/fsm/WorkerStates.js";
import { findNearestHostile, hostileInAggroRadius } from "../src/simulation/npc/fsm/WorkerConditions.js";

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test("hostileInAggroRadius: returns true for FARM worker with wolf adjacent (no GUARD short-circuit)", () => {
  const state = createInitialGameState({ seed: 4711, bareInitial: true });
  state.animals = [];
  state.agents = [];

  const worker = createWorker(0, 0, rng(3));
  worker.role = ROLE.FARM;
  worker.alive = true;
  worker.hp = worker.maxHp;
  worker.hunger = 1;
  state.agents.push(worker);

  // Wolf 1 world unit away — well within BALANCE.guardAggroRadius (default 6).
  const wolf = createAnimal(1, 0, ANIMAL_KIND.PREDATOR, rng(5), ANIMAL_SPECIES.WOLF);
  wolf.alive = true;
  wolf.hp = wolf.maxHp ?? 80;
  state.animals.push(wolf);

  // Sanity — predicate fires for non-GUARD role (used to short-circuit to false).
  assert.equal(findNearestHostile(worker, state), wolf,
    "findNearestHostile finds the adjacent wolf");
  assert.equal(hostileInAggroRadius(worker, state, null), true,
    "hostileInAggroRadius returns true for FARM worker (no GUARD gate)");
  assert.ok(Number(BALANCE.guardAggroRadius ?? 6) >= 1, "guardAggroRadius covers distance 1");
});

test("WorkerFSM: FARM worker with adjacent wolf transitions IDLE → FIGHTING within 2 dispatcher passes", () => {
  const state = createInitialGameState({ seed: 4711, bareInitial: true });
  state.session.phase = "active";
  state.metrics.timeSec = 1;
  state.animals = [];
  state.agents = [];

  const worker = createWorker(0, 0, rng(3));
  worker.role = ROLE.FARM;
  worker.alive = true;
  worker.hp = worker.maxHp;
  worker.hunger = 1; // not hungry — survival preempt won't fire
  worker.rest = 1;   // not tired — SURVIVAL_REST won't fire
  worker.starvationSec = 0;
  worker.fsm = { state: STATE.IDLE, enteredAtSec: 1, target: null, payload: undefined };
  state.agents.push(worker);

  // Wolf 1 world unit away — inside guardAggroRadius.
  const wolf = createAnimal(1, 0, ANIMAL_KIND.PREDATOR, rng(5), ANIMAL_SPECIES.WOLF);
  wolf.alive = true;
  wolf.hp = wolf.maxHp ?? 80;
  state.animals.push(wolf);

  const services = createServices(state.world.mapSeed);
  const fsm = new WorkerFSM();

  // First dispatcher pass: walks IDLE_TRANSITIONS, COMBAT_PREEMPT (priority 0)
  // matches → onExit IDLE, onEnter FIGHTING, then ticks FIGHTING.
  fsm.tickWorker(worker, state, services, 1 / 30);

  // Optional second pass to give the FSM another chance if onEnter set up
  // target on first pass and label was applied on second.
  if (worker.fsm.state !== STATE.FIGHTING) {
    fsm.tickWorker(worker, state, services, 1 / 30);
  }

  assert.equal(worker.fsm.state, STATE.FIGHTING,
    `expected FARM worker to be in FIGHTING after ≤2 passes; got ${worker.fsm.state}`);
  assert.equal(worker.stateLabel, "Engage",
    `expected stateLabel='Engage' (DISPLAY_LABEL[FIGHTING]); got ${worker.stateLabel}`);
});
