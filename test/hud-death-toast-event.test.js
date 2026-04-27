import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { ResourceSystem } from "../src/simulation/economy/ResourceSystem.js";
import { MortalitySystem } from "../src/simulation/lifecycle/MortalitySystem.js";
import { EVENT_TYPES } from "../src/simulation/meta/GameEventBus.js";

test("ResourceSystem tracks consecutive empty food and wood seconds", () => {
  const state = createInitialGameState({ seed: 820 });
  const resources = new ResourceSystem();

  state.resources.food = 0;
  state.resources.wood = 0;
  resources.update(1.5, state);
  resources.update(2.0, state);

  assert.equal(state.metrics.resourceEmptySec.food, 3.5);
  assert.equal(state.metrics.resourceEmptySec.wood, 3.5);

  state.resources.food = 12;
  resources.update(0.5, state);
  assert.equal(state.metrics.resourceEmptySec.food, 0);
  assert.equal(state.metrics.resourceEmptySec.wood, 4.0);
});

test("MortalitySystem death event includes tile, world coordinates, and empty-food duration", () => {
  const state = createInitialGameState({ seed: 821 });
  const mortality = new MortalitySystem();
  const worker = state.agents.find((agent) => agent.type === "WORKER");
  assert.ok(worker, "expected a worker");

  state.metrics.resourceEmptySec.food = 31;
  worker.alive = false;
  worker.deathReason = "starvation";
  worker.deathContext = {
    targetTile: { ix: 17, iz: 19 },
  };
  worker.x = 17.5;
  worker.z = 19.25;

  mortality.update(0.1, state, {});

  const event = state.events.log.find((entry) => entry.type === EVENT_TYPES.WORKER_STARVED);
  assert.ok(event, "expected WORKER_STARVED event");
  assert.equal(event.detail.tile.ix, 17);
  assert.equal(event.detail.tile.iz, 19);
  assert.equal(event.detail.worldX, 17.5);
  assert.equal(event.detail.worldZ, 19.25);
  assert.equal(event.detail.foodEmptySec, 31);
  assert.equal(event.detail.entityName, worker.displayName ?? worker.id);
});
