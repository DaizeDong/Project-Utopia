import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";
import { BALANCE } from "../src/config/balance.js";
import { TILE } from "../src/config/constants.js";
import { worldToTile } from "../src/world/grid/Grid.js";

function setTileAt(state, ix, iz, tileType) {
  state.grid.tiles[ix + iz * state.grid.width] = tileType;
}

// M3+M4 integration: a loaded worker traversing a 20-tile road corridor should
// experience zero spoilage (road-safe) while still taking on carry fatigue.
test("worker walking a 20-tile road with food carry: no spoilage, fatigued rest decay", () => {
  const state = createInitialGameState({ seed: 1337 });
  const services = createServices(state.world.mapSeed);
  const system = new WorkerAISystem();
  const worker = state.agents.find((a) => a.type === "WORKER");
  assert.ok(worker);

  // Neutralize night-multiplier so the only non-unit rest factor is carry fatigue.
  state.environment = { isNight: false };

  const here = worldToTile(worker.x, worker.z, state.grid);
  const corridorLength = 20;
  for (let step = 0; step < corridorLength; step += 1) {
    const ix = Math.min(state.grid.width - 1, here.ix + step);
    setTileAt(state, ix, here.iz, TILE.ROAD);
  }

  worker.rest = 1.0;
  worker.hunger = 1.0;
  worker.carry = { food: 5, wood: 0, stone: 0, herbs: 0 };
  worker.blackboard ??= {};
  worker.blackboard.carryTicks = BALANCE.spoilageGracePeriodTicks + 50; // past grace

  const baseRest = Number(BALANCE.workerRestDecayPerSecond ?? 0.004);
  const dt = 0.1;
  const steps = 100; // ~10 sim seconds
  for (let i = 0; i < steps; i += 1) {
    state.metrics.tick = (state.metrics.tick ?? 0) + 1;
    system.update(dt, state, services);
  }

  // Spoilage: zero loss expected while on ROAD.
  assert.equal(worker.carry.food, 5, "no spoilage should occur while on a road tile");

  // Fatigue: rest decay should reflect the loaded multiplier despite being on-road.
  const totalSec = dt * steps;
  const expectedEmptyLoss = baseRest * totalSec;
  const expectedLoadedLoss = expectedEmptyLoss * Number(BALANCE.carryFatigueLoadedMultiplier ?? 1.5);
  const actualLoss = 1 - Number(worker.rest);
  assert.ok(
    actualLoss > expectedEmptyLoss * 1.2,
    `loaded worker rest loss ${actualLoss.toFixed(4)} should exceed unloaded baseline ${expectedEmptyLoss.toFixed(4)}`,
  );
  assert.ok(
    Math.abs(actualLoss - expectedLoadedLoss) < expectedLoadedLoss * 0.6,
    `loaded rest loss ${actualLoss.toFixed(4)} should be within tolerance of expected ${expectedLoadedLoss.toFixed(4)}`,
  );
});
