import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { TILE } from "../src/config/constants.js";
import { tileToWorld } from "../src/world/grid/Grid.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";

function setTile(state, ix, iz, tileType) {
  state.grid.tiles[ix + iz * state.grid.width] = tileType;
}

test("worker delivery targeting can favor a frontier warehouse when policy priorities demand route relief", () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
  const worker = state.agents.find((agent) => agent.type === "WORKER");
  assert.ok(worker, "expected a worker");
  state.agents = [worker];
  state.animals = [];

  const core = state.gameplay.scenario.anchors.coreWarehouse;
  const frontierWarehouse = state.gameplay.scenario.routeLinks[0]?.gapTiles?.[0];
  assert.ok(core && frontierWarehouse, "expected authored frontier route data");

  setTile(state, frontierWarehouse.ix, frontierWarehouse.iz, TILE.WAREHOUSE);
  state.grid.version += 1;

  const pos = tileToWorld(core.ix, core.iz, state.grid);
  worker.x = pos.x;
  worker.z = pos.z;
  worker.hunger = 0.95;
  worker.carry.food = 3;
  worker.carry.wood = 1;
  worker.targetTile = null;
  worker.path = null;
  worker.pathIndex = 0;
  worker.pathGridVersion = -1;
  worker.blackboard = {
    fsm: {
      state: "deliver",
      previousState: "seek_task",
      changedAtSec: 0,
      reason: "test",
      history: [],
      path: [],
    },
  };
  worker.policy = {
    groupId: "workers",
    intentWeights: { farm: 0.6, wood: 0.4, deliver: 1.9, eat: 0.8, wander: 0.1 },
    riskTolerance: 0.25,
    targetPriorities: { warehouse: 0.6, farm: 1, lumber: 1, road: 2.2, depot: 2.6, frontier: 3, safety: 1.2 },
    ttlSec: 18,
    focus: "frontier cargo relief",
    summary: "Use the forward warehouse to shorten the broken route.",
    steeringNotes: ["Favor frontier depots."],
  };

  const system = new WorkerAISystem();
  system.update(0.2, state, createServices(state.world.mapSeed));

  assert.equal(worker.targetTile?.ix, frontierWarehouse.ix);
  assert.equal(worker.targetTile?.iz, frontierWarehouse.iz);
  assert.ok(Number(worker.debug?.policyTargetFrontier ?? 0) > 0);
});
