import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState, createAnimal, createWorker } from "../src/entities/EntityFactory.js";
import { ANIMAL_KIND, TILE } from "../src/config/constants.js";
import { MortalitySystem } from "../src/simulation/lifecycle/MortalitySystem.js";
import { findNearestTileOfTypes, tileToWorld } from "../src/world/grid/Grid.js";

test("MortalitySystem removes starved worker permanently", () => {
  const state = createInitialGameState();
  state.resources.food = 0;
  state.buildings.warehouses = 0;
  state.buildings.farms = 0;
  const worker = createWorker(0, 0, () => 0.5);
  worker.hunger = 0;
  worker.starvationSec = 60;
  state.agents = [worker];
  state.animals = [];

  const system = new MortalitySystem();
  system.update(1 / 30, state);

  assert.equal(state.agents.length, 0);
  assert.equal(state.metrics.deathsTotal, 1);
  assert.equal(state.metrics.deathsByReason.starvation, 1);
});

test("MortalitySystem does not starve worker while global food is available", () => {
  const state = createInitialGameState();
  state.resources.food = 25;
  const warehouse = findNearestTileOfTypes(state.grid, { x: 0, z: 0 }, [TILE.WAREHOUSE]);
  const pos = warehouse ? tileToWorld(warehouse.ix, warehouse.iz, state.grid) : { x: 0, z: 0 };
  const worker = createWorker(pos.x, pos.z, () => 0.5);
  worker.hunger = 0;
  worker.starvationSec = 33;
  state.agents = [worker];
  state.animals = [];

  const system = new MortalitySystem();
  system.update(1 / 30, state, { pathCache: { get: () => null, set: () => {} } });

  assert.equal(state.agents.length, 1);
  assert.equal(state.metrics.deathsTotal, 0);
});

test("MortalitySystem starves worker if food exists but no reachable warehouse", () => {
  const state = createInitialGameState();
  state.resources.food = 25;
  state.buildings.warehouses = 0;
  state.buildings.farms = 0;
  const worker = createWorker(0, 0, () => 0.5);
  worker.hunger = 0;
  worker.starvationSec = 60;
  state.agents = [worker];
  state.animals = [];

  const system = new MortalitySystem();
  system.update(1 / 30, state, { pathCache: { get: () => null, set: () => {} } });

  assert.equal(state.agents.length, 0);
  assert.equal(state.metrics.deathsByReason.starvation, 1);
  assert.equal(state.metrics.deathByReasonAndReachability["starvation:unreachable"], 1);
});

test("MortalitySystem keeps worker alive when nearby farm supply is reachable", () => {
  const state = createInitialGameState();
  state.resources.food = 0;
  state.buildings.warehouses = 0;
  const farm = findNearestTileOfTypes(state.grid, { x: 0, z: 0 }, [TILE.FARM]);
  const pos = farm ? tileToWorld(farm.ix, farm.iz, state.grid) : { x: 0, z: 0 };
  const worker = createWorker(pos.x, pos.z, () => 0.5);
  worker.hunger = 0;
  worker.starvationSec = 33;
  state.agents = [worker];
  state.animals = [];

  const system = new MortalitySystem();
  system.update(1 / 30, state, { pathCache: { get: () => null, set: () => {} } });

  assert.equal(state.agents.length, 1);
  assert.equal(Number(state.metrics.deathsTotal ?? 0), 0);
  assert.equal(String(worker.debug?.nutritionSourceType ?? ""), "nearby-farm");
});

test("MortalitySystem writes enriched deathContext fields", () => {
  const state = createInitialGameState();
  state.resources.food = 0;
  state.buildings.warehouses = 0;
  state.buildings.farms = 0;
  const worker = createWorker(0, 0, () => 0.5);
  worker.hunger = 0;
  worker.starvationSec = 60;
  worker.blackboard.lastFeasibilityReject = {
    source: "policy",
    requestedState: "deliver",
    reason: "deliver requires carry>0",
    simSec: 9,
  };
  state.agents = [worker];
  state.animals = [];

  const system = new MortalitySystem();
  system.update(1 / 30, state, { pathCache: { get: () => null, set: () => {} } });

  assert.equal(state.agents.length, 0);
  assert.equal(Boolean(worker.deathContext), true);
  assert.equal(Boolean(worker.deathContext.nutritionReachable), false);
  assert.equal(typeof worker.deathContext.nutritionSourceType, "string");
  assert.equal(typeof worker.deathContext.starvationSecAtDeath, "number");
  assert.equal(typeof worker.deathContext.lastFeasibilityReject, "object");
});

test("MortalitySystem removes predated herbivore", () => {
  const state = createInitialGameState();
  const herbivore = createAnimal(0, 0, ANIMAL_KIND.HERBIVORE, () => 0.5);
  herbivore.hp = 0;
  herbivore.deathReason = "predation";
  state.agents = [];
  state.animals = [herbivore];

  const system = new MortalitySystem();
  system.update(1 / 30, state, { pathCache: { get: () => null, set: () => {} } });

  assert.equal(state.animals.length, 0);
  assert.equal(state.metrics.deathsTotal, 1);
  assert.equal(state.metrics.deathsByReason.predation, 1);
});

test("MortalitySystem records predated herbivores that were already marked dead by AI", () => {
  const state = createInitialGameState();
  const herbivore = createAnimal(0, 0, ANIMAL_KIND.HERBIVORE, () => 0.5);
  herbivore.alive = false;
  herbivore.deathReason = "predation";
  state.agents = [];
  state.animals = [herbivore];

  const system = new MortalitySystem();
  system.update(1 / 30, state, { pathCache: { get: () => null, set: () => {} } });

  assert.equal(state.animals.length, 0);
  assert.equal(state.metrics.deathsTotal, 1);
  assert.equal(state.metrics.deathsByReason.predation, 1);
  assert.equal(Number(state.metrics.ecologyPendingDeaths.predation ?? 0), 1);
});
