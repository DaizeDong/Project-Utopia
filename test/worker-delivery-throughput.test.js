import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { findNearestTileOfTypes, tileToWorld } from "../src/world/grid/Grid.js";
import { TILE } from "../src/config/constants.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";

test("WorkerAISystem unloads gradually when the target warehouse is congested", () => {
  const state = createInitialGameState({ seed: 1337 });
  const services = createServices(state.world.mapSeed);
  const system = new WorkerAISystem();
  const worker = state.agents.find((agent) => agent.type === "WORKER");
  const warehouse = findNearestTileOfTypes(state.grid, worker, [TILE.WAREHOUSE]);
  assert.ok(worker, "worker should exist");
  assert.ok(warehouse, "warehouse should exist");

  const pos = tileToWorld(warehouse.ix, warehouse.iz, state.grid);
  worker.x = pos.x;
  worker.z = pos.z;
  worker.targetTile = warehouse;
  worker.path = [];
  worker.pathIndex = 0;
  worker.pathGridVersion = state.grid.version;
  worker.hunger = 0.9;
  worker.carry.food = 3;
  worker.carry.wood = 2;
  worker.blackboard ??= {};
  worker.blackboard.fsm = {
    state: "deliver",
    previousState: "seek_task",
    changedAtSec: 0,
    reason: "test-deliver",
    history: [],
    path: [],
  };

  state.metrics.logistics = {
    warehouseLoadByKey: {
      [`${warehouse.ix},${warehouse.iz}`]: 4,
    },
  };

  const beforeFood = state.resources.food;
  const beforeWood = state.resources.wood;
  system.update(1, state, services);

  const remainingCarry = Number(worker.carry.food ?? 0) + Number(worker.carry.wood ?? 0);
  assert.ok(remainingCarry > 0, "congested unload should not empty the worker in one second");
  assert.ok(Number(state.resources.food) > beforeFood, "food should unload into stockpile");
  assert.ok(Number(state.resources.wood) >= beforeWood, "wood should never decrease during delivery");
  assert.equal(Number(worker.debug?.targetWarehouseLoad ?? 0), 4);
});
