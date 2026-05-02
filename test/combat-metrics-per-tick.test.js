// R5 PB-combat-plumbing Step 5 — assert MortalitySystem now refreshes
// `state.metrics.combat` on EVERY tick, not only on death-ticks.
//
// Pre-fix (PB-combat-engagement P0-1): MortalitySystem.update early-returned
// when `deadIds.size === 0`, skipping the call to `recomputeCombatMetrics`,
// so a live saboteur or raider stayed invisible in `state.metrics.combat`
// until somebody died. Downstream (RoleAssignmentSystem GUARD draft,
// ProgressionSystem milestone, ColonyPlanner threat read) all read stale
// data → user reported "worker 不主动攻击" repro.
//
// Post-fix: `recomputeCombatMetrics(state)` is hoisted out of the early-
// return so it runs every tick. This test plants a live SABOTEUR within
// range of one alive worker, ticks once with no deaths, and asserts the
// metrics object reflects the live threat.

import test from "node:test";
import assert from "node:assert/strict";

import { ANIMAL_KIND, ANIMAL_SPECIES, ENTITY_TYPE, VISITOR_KIND } from "../src/config/constants.js";
import { createInitialGameState, createWorker, createVisitor, createAnimal } from "../src/entities/EntityFactory.js";
import { MortalitySystem } from "../src/simulation/lifecycle/MortalitySystem.js";

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test("recomputeCombatMetrics: live SABOTEUR is visible in state.metrics.combat WITHOUT a death this tick", () => {
  const state = createInitialGameState({ seed: 9001, bareInitial: true });
  // Strip wildlife/visitor noise from the bootstrap state — the test needs
  // a single worker + single saboteur and nothing else so the assertions
  // count only the planted threat.
  state.animals = [];
  state.agents = [];

  const worker = createWorker(0, 0, rng(7));
  worker.hp = worker.maxHp;
  worker.alive = true;
  worker.hunger = 1; // fed — won't die from starvation
  worker.starvationSec = 0;
  state.agents.push(worker);

  // Saboteur 2 world units away (well within guardAggroRadius = 6).
  const saboteur = createVisitor(2, 0, VISITOR_KIND.SABOTEUR, rng(11));
  saboteur.alive = true;
  saboteur.hp = saboteur.maxHp;
  state.agents.push(saboteur);

  // Sanity — combat metrics start empty.
  state.metrics ??= {};
  state.metrics.combat = {};

  const sys = new MortalitySystem();
  sys.update(1 / 30, state);

  assert.ok(state.metrics?.combat, "combat metrics object exists post-tick");
  assert.equal(state.metrics.combat.activeSaboteurs, 1,
    `expected activeSaboteurs=1 with no deaths this tick; got ${state.metrics.combat.activeSaboteurs}`);
  assert.equal(state.metrics.combat.workerCount, 1, "workerCount must include the live worker");
  assert.ok(state.metrics.combat.nearestThreatDistance > 0,
    "nearestThreatDistance must be a positive distance to the saboteur");
  assert.ok(state.metrics.combat.nearestThreatDistance <= 6,
    `nearestThreatDistance ≤ 6 expected; got ${state.metrics.combat.nearestThreatDistance}`);
});

test("recomputeCombatMetrics: live PREDATOR (wolf) populates activePredators per-tick", () => {
  const state = createInitialGameState({ seed: 9002, bareInitial: true });
  state.animals = [];
  state.agents = [];

  const worker = createWorker(0, 0, rng(13));
  worker.hp = worker.maxHp;
  worker.alive = true;
  worker.hunger = 1;
  worker.starvationSec = 0;
  state.agents.push(worker);

  const wolf = createAnimal(1, 0, ANIMAL_KIND.PREDATOR, rng(19), ANIMAL_SPECIES.WOLF);
  wolf.alive = true;
  wolf.hp = wolf.maxHp ?? 80;
  state.animals.push(wolf);

  state.metrics ??= {};
  state.metrics.combat = {};

  const sys = new MortalitySystem();
  sys.update(1 / 30, state);

  assert.ok(state.metrics?.combat, "combat metrics object exists post-tick");
  assert.equal(state.metrics.combat.activePredators, 1,
    `expected activePredators=1 (no death this tick); got ${state.metrics.combat.activePredators}`);
  assert.ok(state.metrics.combat.nearestThreatDistance > 0,
    "nearestThreatDistance must be > 0 with a live predator near a worker");
});
