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

function placeWorkerOnTile(state, worker, tileType) {
  // Put worker at their current tile index, but override the tile type beneath.
  const here = worldToTile(worker.x, worker.z, state.grid);
  setTileAt(state, here.ix, here.iz, tileType);
  return here;
}

test("worker carrying food on non-road tile loses food over time", () => {
  const state = createInitialGameState({ seed: 1337 });
  const services = createServices(state.world.mapSeed);
  const system = new WorkerAISystem();
  const worker = state.agents.find((a) => a.type === "WORKER");
  assert.ok(worker);

  placeWorkerOnTile(state, worker, TILE.GRASS);
  worker.rest = 1.0;
  worker.hunger = 1.0;
  worker.carry = { food: 5, wood: 0, stone: 0, herbs: 0 };
  worker.blackboard ??= {};
  worker.blackboard.carryTicks = BALANCE.spoilageGracePeriodTicks + 10; // past grace

  const dt = 0.1;
  const steps = 50; // 5 sim seconds
  for (let i = 0; i < steps; i += 1) {
    state.metrics.tick = (state.metrics.tick ?? 0) + 1;
    system.update(dt, state, services);
  }
  assert.ok(
    worker.carry.food < 5 - 1e-4,
    `food should decay off-road; got ${worker.carry.food}`,
  );
});

test("worker carrying food on road loses no food to spoilage", () => {
  const state = createInitialGameState({ seed: 1337 });
  const services = createServices(state.world.mapSeed);
  const system = new WorkerAISystem();
  const worker = state.agents.find((a) => a.type === "WORKER");
  assert.ok(worker);

  placeWorkerOnTile(state, worker, TILE.ROAD);
  worker.rest = 1.0;
  worker.hunger = 1.0;
  worker.carry = { food: 5, wood: 0, stone: 0, herbs: 0 };
  worker.blackboard ??= {};
  worker.blackboard.carryTicks = BALANCE.spoilageGracePeriodTicks + 10; // past grace

  const dt = 0.1;
  const steps = 50;
  for (let i = 0; i < steps; i += 1) {
    state.metrics.tick = (state.metrics.tick ?? 0) + 1;
    system.update(dt, state, services);
  }
  assert.equal(worker.carry.food, 5, "food carried on road should not spoil");
});

test("grace period halves spoilage rate for first N ticks", () => {
  const stateGrace = createInitialGameState({ seed: 1337 });
  const stateFull = createInitialGameState({ seed: 1337 });
  const servicesGrace = createServices(stateGrace.world.mapSeed);
  const servicesFull = createServices(stateFull.world.mapSeed);
  const systemGrace = new WorkerAISystem();
  const systemFull = new WorkerAISystem();

  const wGrace = stateGrace.agents.find((a) => a.type === "WORKER");
  const wFull = stateFull.agents.find((a) => a.type === "WORKER");
  placeWorkerOnTile(stateGrace, wGrace, TILE.GRASS);
  placeWorkerOnTile(stateFull, wFull, TILE.GRASS);

  for (const w of [wGrace, wFull]) {
    w.rest = 1.0;
    w.hunger = 1.0;
    w.carry = { food: 5, wood: 0, stone: 0, herbs: 0 };
    w.blackboard ??= {};
  }
  wGrace.blackboard.carryTicks = 0; // fresh leg — inside grace window
  wFull.blackboard.carryTicks = BALANCE.spoilageGracePeriodTicks + 10; // already past grace

  // Few ticks so wGrace stays inside its grace window.
  const dt = 0.1;
  const steps = Math.max(5, Math.min(30, Math.floor(BALANCE.spoilageGracePeriodTicks / 4)));
  for (let i = 0; i < steps; i += 1) {
    stateGrace.metrics.tick = (stateGrace.metrics.tick ?? 0) + 1;
    stateFull.metrics.tick = (stateFull.metrics.tick ?? 0) + 1;
    systemGrace.update(dt, stateGrace, servicesGrace);
    systemFull.update(dt, stateFull, servicesFull);
  }
  const lossGrace = 5 - wGrace.carry.food;
  const lossFull = 5 - wFull.carry.food;
  assert.ok(lossFull > 0, `full-rate should lose some food, got ${lossFull}`);
  assert.ok(lossGrace > 0, `grace-rate should lose some food, got ${lossGrace}`);
  assert.ok(
    lossGrace < lossFull * 0.75,
    `grace-period loss (${lossGrace.toFixed(4)}) should be about half of full-rate loss (${lossFull.toFixed(4)})`,
  );
});

test("carryTicks resets when carry fully unloads (total <= epsilon)", () => {
  const state = createInitialGameState({ seed: 1337 });
  const services = createServices(state.world.mapSeed);
  const system = new WorkerAISystem();
  const worker = state.agents.find((a) => a.type === "WORKER");
  placeWorkerOnTile(state, worker, TILE.GRASS);
  worker.carry = { food: 0, wood: 0, stone: 0, herbs: 0 };
  worker.blackboard ??= {};
  worker.blackboard.carryTicks = 999;
  state.metrics.tick = (state.metrics.tick ?? 0) + 1;
  system.update(0.1, state, services);
  assert.equal(worker.blackboard.carryTicks, 0, "carryTicks should reset when worker has no carry");
});
