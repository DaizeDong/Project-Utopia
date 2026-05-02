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
  // R5 PB-combat-plumbing — clear bootstrap wildlife so the broadened
  // COMBAT_PREEMPT (priority-0 row in DEPOSITING) doesn't fire FIGHTING
  // for this non-GUARD worker. Bootstrap places a bear/wolf at ~6.3 world
  // units from the warehouse on seed=1337, which is inside the default
  // guardAggroRadius (12 world units) — pre-fix, the GUARD-role short-
  // circuit kept FARM workers depositing; post-fix, any worker engages
  // a nearby hostile (the user-reported "worker 不主动攻击" repro fix).
  // This test is specifically about congested warehouse unload, so we
  // strip wildlife to isolate that pathway.
  state.animals = [];

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
  // v0.10.0-d — Priority-FSM is the only worker dispatcher. Pin the
  // worker into DEPOSITING so the FSM tick routes through handleDeliver
  // (the legacy display-FSM `blackboard.fsm.state="deliver"` above is
  // ignored by the dispatcher). worker.fsm is the truth field.
  worker.fsm = { state: "DEPOSITING", enteredAtSec: 0, target: { ix: warehouse.ix, iz: warehouse.iz }, payload: undefined };

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
