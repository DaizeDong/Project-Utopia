import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState, createWorker } from "../src/entities/EntityFactory.js";
import { ANIMAL_KIND } from "../src/config/constants.js";
import { MortalitySystem } from "../src/simulation/lifecycle/MortalitySystem.js";
import { JobReservation } from "../src/simulation/npc/JobReservation.js";

// v0.8.3 entity-death-cleanup audit fixes
// -----------------------------------------------------------------------
// Bug A: JobReservation lingers after worker death.
// Bug D: Worker carry resources vanish on death (should refund + telemetry).
// Bug C: Combat metrics include dead raiders until next AnimalAISystem tick.

function killWorker(worker) {
  worker.hp = 0;
  worker.deathReason = "test";
}

test("Bug A — JobReservation is released the moment a worker dies (no 30s grace)", () => {
  const state = createInitialGameState();
  state.resources.food = 0;
  state.buildings.warehouses = 0;
  state.buildings.farms = 0;
  state.animals = [];

  const worker = createWorker(0, 0, () => 0.5);
  worker.hunger = 0;
  worker.starvationSec = 60;
  state.agents = [worker];

  state._jobReservation = new JobReservation();
  state._jobReservation.reserve(worker.id, 5, 5, "farm", state.metrics.timeSec ?? 0);
  assert.equal(state._jobReservation.getReservationCount(5, 5), 1, "reservation should exist before death");

  new MortalitySystem().update(1 / 30, state);

  assert.equal(state.agents.length, 0, "dead worker must be filtered out");
  assert.equal(state._jobReservation.getReservationCount(5, 5), 0,
    "reservation must be released the moment alive flips to false");
  assert.equal(state._jobReservation.getWorkerReservation(worker.id), null,
    "reverse worker→tile mapping must be cleared");
});

test("Bug A — visitor death also releases their reservation", () => {
  const state = createInitialGameState();
  state.animals = [];

  const visitor = createWorker(0, 0, () => 0.5);
  visitor.type = "VISITOR";
  visitor.hp = 0;
  visitor.deathReason = "test";
  state.agents = [visitor];

  state._jobReservation = new JobReservation();
  state._jobReservation.reserve(visitor.id, 7, 7, "visit", 0);

  new MortalitySystem().update(1 / 30, state);

  assert.equal(state._jobReservation.getReservationCount(7, 7), 0);
});

test("Bug D — worker carry (food/wood/stone/herbs) refunds to colony stockpile on death", () => {
  const state = createInitialGameState();
  state.animals = [];
  // Ensure starting stockpile is known.
  state.resources.food = 10;
  state.resources.wood = 10;
  state.resources.stone = 10;
  state.resources.herbs = 10;

  const worker = createWorker(0, 0, () => 0.5);
  worker.carry = { food: 3, wood: 4, stone: 2, herbs: 5 };
  killWorker(worker);
  state.agents = [worker];

  new MortalitySystem().update(1 / 30, state);

  assert.equal(state.resources.food, 13, "food carry refunded");
  assert.equal(state.resources.wood, 14, "wood carry refunded");
  assert.equal(state.resources.stone, 12, "stone carry refunded");
  assert.equal(state.resources.herbs, 15, "herbs carry refunded");
  // Carry zeroed on the corpse so a re-run wouldn't double-refund.
  assert.equal(worker.carry.food, 0);
  assert.equal(worker.carry.wood, 0);
  assert.equal(worker.carry.stone, 0);
  assert.equal(worker.carry.herbs, 0);
});

test("Bug D — recordResourceFlow telemetry receives a 'recovered' entry", () => {
  const state = createInitialGameState();
  state.animals = [];
  const worker = createWorker(0, 0, () => 0.5);
  worker.carry = { food: 2, wood: 0, stone: 0, herbs: 0 };
  killWorker(worker);
  state.agents = [worker];

  new MortalitySystem().update(1 / 30, state);

  const accum = state._resourceFlowAccum;
  assert.ok(accum, "resource flow accumulator initialised");
  assert.equal(Number(accum.food?.recovered ?? 0), 2,
    "recovered bucket records the refund amount distinctly from produced/consumed/spoiled");
  assert.equal(Number(accum.food?.produced ?? 0), 0,
    "refund must NOT inflate the production counter");
});

test("Bug A + D — combined: kill a worker holding both a reservation and carry", () => {
  const state = createInitialGameState();
  state.animals = [];
  state.resources.food = 5;
  const worker = createWorker(0, 0, () => 0.5);
  worker.carry = { food: 7, wood: 0, stone: 0, herbs: 0 };
  killWorker(worker);
  state.agents = [worker];

  state._jobReservation = new JobReservation();
  state._jobReservation.reserve(worker.id, 12, 12, "farm", 0);

  new MortalitySystem().update(1 / 30, state);

  assert.equal(state.resources.food, 12, "carry refunded");
  assert.equal(state._jobReservation.getReservationCount(12, 12), 0, "reservation released");
  assert.equal(state.agents.length, 0, "worker filtered out");
});

test("Bug C — dead raider stops counting toward state.metrics.combat.activeRaiders", () => {
  const state = createInitialGameState();
  // Pre-seed combat metrics as if AnimalAISystem already ran this tick and
  // counted the raider as alive (it sets metrics BEFORE MortalitySystem runs).
  state.metrics.combat = {
    activeThreats: 1,
    activeRaiders: 1,
    activePredators: 1,
    guardCount: 0,
    workerCount: 0,
    nearestThreatDistance: 4.2,
  };

  const raider = {
    id: "raider-1",
    kind: ANIMAL_KIND.PREDATOR,
    species: "raider_beast",
    x: 0, z: 0,
    hp: 0,
    alive: true,
    deathReason: "killed",
  };
  state.animals = [raider];
  state.agents = [];

  new MortalitySystem().update(1 / 30, state);

  assert.equal(state.animals.length, 0, "raider filtered out");
  assert.equal(state.metrics.combat.activeRaiders, 0,
    "combat metrics must be re-emitted after the death pass");
  assert.equal(state.metrics.combat.activeThreats, 0);
  assert.equal(state.metrics.combat.activePredators, 0);
  assert.equal(state.metrics.combat.nearestThreatDistance, -1);
});
