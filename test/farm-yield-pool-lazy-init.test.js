// Regression test for the farm harvest lazy-init bug in WorkerAISystem.
//
// Context: when a worker completes a FARM harvest tick, the code lazy-creates
// the tileState entry if missing (covers the 1-tick race where
// TileStateSystem._updateSoil has not yet seeded a newly-placed farm, or
// where the entry was wiped mid-harvest). The original lazy-init only set
// `fertility`, leaving `yieldPool` at its default of 0. The harvest branch
// then caps `effective = min(farmAmount, 0) = 0` and refunds the entire
// yield back out of `worker.carry.food`, destroying the food the worker
// just produced.
//
// The fix adds `yieldPool = farmYieldPoolInitial` to the lazy-create path,
// matching the semantics of `setTile` and `TileStateSystem._updateSoil`.
// This test locks in the invariant: if the AI chose a farm tile and harvest
// completes, `carry.food > 0`.

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { handleHarvest } from "../src/simulation/npc/WorkerAISystem.js";
import { BALANCE } from "../src/config/balance.js";
import { ROLE, TILE } from "../src/config/constants.js";
import { tileToWorld } from "../src/world/grid/Grid.js";

function placeFarmWorker(worker, state, ix, iz) {
  const pos = tileToWorld(ix, iz, state.grid);
  worker.x = pos.x;
  worker.z = pos.z;
  worker.role = ROLE.FARM;
  worker.path = null;
  worker.pathIndex = 0;
  worker.pathGridVersion = state.grid.version ?? 0;
  worker.targetTile = { ix, iz };
  worker.stateLabel = "Harvest";
  worker.cooldown = 0;
  worker.hunger = 1;
  worker.rest = 1;
  worker.morale = 1;
  worker.carry = { food: 0, wood: 0, stone: 0, herbs: 0 };
  worker.blackboard ??= {};
  worker.blackboard.intent = "farm";
  worker.blackboard.taskLock = { state: "harvest", untilSec: Number.POSITIVE_INFINITY };
  worker.blackboard.nextTargetRefreshSec = Number.POSITIVE_INFINITY;
}

test("farm harvest: lazy-init of missing tileState does not destroy food", () => {
  const state = createInitialGameState({ seed: 4242 });
  const services = createServices(state.world.mapSeed);
  state.environment = { isNight: false };
  state.metrics.tick = 100;
  state.metrics.timeSec = 0;

  const ix = 20;
  const iz = 20;
  const idx = ix + iz * state.grid.width;

  // Place a FARM tile, then simulate the 1-tick race by deleting the
  // tileState entry that `setTile` would have seeded. The worker harvest
  // must lazy-create the entry with a full yieldPool so the completion
  // tick credits carry.food instead of refunding it.
  state.grid.tiles[idx] = TILE.FARM;
  state.grid.version = (state.grid.version ?? 0) + 1;
  state.grid.tileState ??= new Map();
  state.grid.tileState.delete(idx);
  if (state.grid.moisture) state.grid.moisture[idx] = 0.8;

  const worker = state.agents.find((a) => a.type === "WORKER");
  assert.ok(worker, "need at least one worker in initial state");
  placeFarmWorker(worker, state, ix, iz);

  // Drive harvest ticks until cooldown completes and carry is credited.
  const dt = 0.1;
  const maxIters = 200;
  let completed = false;
  for (let i = 0; i < maxIters; i += 1) {
    handleHarvest(worker, state, services, dt);
    state.metrics.tick = (state.metrics.tick ?? 0) + 1;
    state.metrics.timeSec = (state.metrics.timeSec ?? 0) + dt;
    if (Number(worker.carry.food ?? 0) > 0) {
      completed = true;
      break;
    }
  }

  assert.ok(
    completed,
    "worker.carry.food should be > 0 after a harvest completion tick on a "
    + "lazy-initialised farm tile — the WorkerAISystem lazy-init must seed "
    + "yieldPool = farmYieldPoolInitial, not leave it at the default 0.",
  );
  assert.ok(
    Number(worker.carry.food ?? 0) > 0,
    `expected carry.food > 0, got ${worker.carry.food}`,
  );

  // Confirm the lazy-create path actually ran: the tileState entry must now
  // exist and have a positive (post-harvest) yieldPool.
  const entry = state.grid.tileState.get(idx);
  assert.ok(entry, "lazy-init must create a tileState entry for the farm tile");
  const initial = Number(BALANCE.farmYieldPoolInitial ?? 120);
  assert.ok(
    Number(entry.yieldPool ?? 0) > 0 && Number(entry.yieldPool ?? 0) < initial,
    `yieldPool should be seeded to ${initial} then decremented by the harvest, `
    + `got ${entry.yieldPool}`,
  );
});
