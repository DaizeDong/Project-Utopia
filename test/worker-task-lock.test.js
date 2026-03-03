import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";

test("Worker task lock is only applied on task-state entry and does not block post-expiry transitions", () => {
  const state = createInitialGameState({ seed: 1337 });
  const services = createServices(state.world.mapSeed);
  const system = new WorkerAISystem();
  const worker = state.agents.find((agent) => agent.type === "WORKER");
  assert.ok(worker, "worker should exist");

  worker.hunger = 0.9;
  worker.carry.food = 3;
  worker.carry.wood = 0;
  worker.blackboard ??= {};
  worker.blackboard.fsm = {
    state: "harvest",
    previousState: "seek_task",
    changedAtSec: 5,
    reason: "test-lock",
    history: [],
    path: [],
  };
  worker.blackboard.taskLock = {
    state: "harvest",
    untilSec: 10.4,
  };
  worker.stateLabel = "Harvest";

  state.buildings.warehouses = Math.max(1, Number(state.buildings.warehouses ?? 0));
  state.buildings.farms = Math.max(1, Number(state.buildings.farms ?? 0));

  state.metrics.timeSec = 10.0;
  state.metrics.tick = 1;
  system.update(1 / 30, state, services);

  assert.equal(worker.blackboard?.fsm?.state, "harvest");
  assert.equal(worker.blackboard?.taskLock?.state, "harvest");
  assert.equal(worker.blackboard?.taskLock?.untilSec, 10.4);

  state.metrics.timeSec = 10.6;
  state.metrics.tick = 2;
  system.update(1 / 30, state, services);

  assert.equal(
    worker.blackboard?.fsm?.state,
    "deliver",
    "worker should leave harvest after lock expiry when carry is ready to deliver",
  );
});

