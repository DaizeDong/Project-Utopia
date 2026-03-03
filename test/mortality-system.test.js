import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState, createAnimal, createWorker } from "../src/entities/EntityFactory.js";
import { ANIMAL_KIND } from "../src/config/constants.js";
import { MortalitySystem } from "../src/simulation/lifecycle/MortalitySystem.js";

test("MortalitySystem removes starved worker permanently", () => {
  const state = createInitialGameState();
  const worker = createWorker(0, 0, () => 0.5);
  worker.hunger = 0;
  worker.starvationSec = 30;
  state.agents = [worker];
  state.animals = [];

  const system = new MortalitySystem();
  system.update(1 / 30, state);

  assert.equal(state.agents.length, 0);
  assert.equal(state.metrics.deathsTotal, 1);
  assert.equal(state.metrics.deathsByReason.starvation, 1);
});

test("MortalitySystem removes predated herbivore", () => {
  const state = createInitialGameState();
  const herbivore = createAnimal(0, 0, ANIMAL_KIND.HERBIVORE, () => 0.5);
  herbivore.hp = 0;
  herbivore.deathReason = "predation";
  state.agents = [];
  state.animals = [herbivore];

  const system = new MortalitySystem();
  system.update(1 / 30, state);

  assert.equal(state.animals.length, 0);
  assert.equal(state.metrics.deathsTotal, 1);
  assert.equal(state.metrics.deathsByReason.predation, 1);
});
