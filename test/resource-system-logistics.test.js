import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { findNearestTileOfTypes } from "../src/world/grid/Grid.js";
import { TILE } from "../src/config/constants.js";
import { ResourceSystem } from "../src/simulation/economy/ResourceSystem.js";

test("ResourceSystem publishes logistics bottleneck summary from workers and depots", () => {
  const state = createInitialGameState({ seed: 1337 });
  const system = new ResourceSystem();
  const worker = state.agents.find((agent) => agent.type === "WORKER");
  const warehouse = findNearestTileOfTypes(state.grid, worker, [TILE.WAREHOUSE]);
  assert.ok(worker, "worker should exist");
  assert.ok(warehouse, "warehouse should exist");

  worker.carry.food = 1.5;
  worker.carry.wood = 1.25;
  worker.targetTile = warehouse;
  state.metrics.timeSec = 1;
  system.update(0.1, state);

  assert.ok(state.metrics.logistics, "logistics metrics should be published");
  assert.equal(state.metrics.logistics.carryingWorkers >= 1, true);
  assert.equal(state.metrics.logistics.totalCarryInTransit > 0, true);
  assert.match(String(state.metrics.logistics.summary ?? ""), /Logistics:/);
  assert.equal(
    Number(state.metrics.logistics.warehouseLoadByKey?.[`${warehouse.ix},${warehouse.iz}`] ?? 0) >= 1,
    true,
  );
});
