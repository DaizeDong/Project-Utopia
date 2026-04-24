import test from "node:test";
import assert from "node:assert/strict";

import { TILE } from "../src/config/constants.js";
import { createInitialGameState, createWorker } from "../src/entities/EntityFactory.js";
import { MortalitySystem } from "../src/simulation/lifecycle/MortalitySystem.js";
import { WorldEventSystem } from "../src/world/events/WorldEventSystem.js";

function prepareStarvationState(workers) {
  const state = createInitialGameState({ seed: 902 });
  state.resources.food = 0;
  state.buildings.warehouses = 0;
  state.buildings.farms = 0;
  state.agents = workers;
  state.animals = [];
  return state;
}

function makeDoomedWorker(x, z, seedValue = 0.5) {
  const worker = createWorker(x, z, () => seedValue);
  worker.hunger = 0;
  worker.starvationSec = 60;
  return worker;
}

test("MortalitySystem records related worker death into witness memory", () => {
  const deceased = makeDoomedWorker(0, 0, 0.11);
  const witness = createWorker(4, 0, () => 0.22);
  deceased.relationships[witness.id] = 0.3;

  const state = prepareStarvationState([deceased, witness]);
  state.metrics.timeSec = 42;

  new MortalitySystem().update(1 / 30, state, { pathCache: { get: () => null, set: () => {} } });

  assert.equal(state.agents.some((agent) => agent.id === deceased.id), false);
  assert.match(witness.memory.recentEvents[0], /\[42s\] Friend /);
  assert.match(witness.memory.recentEvents[0], new RegExp(deceased.displayName));
  assert.match(witness.memory.recentEvents[0], /died \(starvation\)/);
});

test("MortalitySystem falls back to nearby colleagues when no relationship exists", () => {
  const deceased = makeDoomedWorker(0, 0, 0.33);
  const witnessA = createWorker(2, 0, () => 0.44);
  const witnessB = createWorker(5, 0, () => 0.55);

  const state = prepareStarvationState([deceased, witnessA, witnessB]);
  state.metrics.timeSec = 9;

  new MortalitySystem().update(1 / 30, state, { pathCache: { get: () => null, set: () => {} } });

  assert.match(witnessA.memory.recentEvents[0], /Colleague .* died \(starvation\)/);
  assert.match(witnessB.memory.recentEvents[0], /Colleague .* died \(starvation\)/);
});

function prepareWarehouseRiskState(rng) {
  const state = createInitialGameState({ seed: 903 });
  const workerA = createWorker(0, 0, () => 0.61);
  const workerB = createWorker(1, 0, () => 0.62);
  state.agents = [workerA, workerB];
  state.animals = [];
  state.grid.tiles[0] = TILE.WAREHOUSE;
  state.grid.version += 1;
  state.metrics.timeSec = 12;
  state.metrics.warehouseDensity = {
    hotWarehouses: ["0,0"],
    byKey: { "0,0": 999 },
  };
  state._riskRng = rng;
  return state;
}

test("WorldEventSystem writes warehouse fire memories and caps recentEvents at six", () => {
  const state = prepareWarehouseRiskState(() => 0);
  const system = new WorldEventSystem();

  // v0.8.2 Round-5 Wave-1 (02d Step 3) — same-tile fire events within 30s
  // are now deduped (dedupKey=`fire:${ix},${iz}`, window=30s). To fill the
  // 6-entry buffer we need 6 fires spaced ≥30s apart, rather than 7
  // consecutive second-ticks. Advance sim time by 40s per iteration.
  for (let i = 0; i < 7; i += 1) {
    state.metrics.timeSec = 12 + i * 40;
    system.update(1, state, {});
  }

  for (const worker of state.agents) {
    assert.equal(worker.memory.recentEvents.length, 6);
    assert.match(worker.memory.recentEvents[0], /Warehouse fire at \(0,0\)/);
  }
});

test("WorldEventSystem dedups same-tile fire memories within 30s window (02d)", () => {
  const state = prepareWarehouseRiskState(() => 0);
  const system = new WorldEventSystem();

  // Two fires at the same tile spaced 5s apart — dedup should collapse to 1.
  state.metrics.timeSec = 100;
  system.update(1, state, {});
  state.metrics.timeSec = 105;
  system.update(1, state, {});

  for (const worker of state.agents) {
    assert.equal(
      worker.memory.recentEvents.length,
      1,
      "same-tile fire within 30s should dedup to a single entry",
    );
  }
});

test("WorldEventSystem writes vermin swarm memories for living workers", () => {
  let call = 0;
  const state = prepareWarehouseRiskState(() => {
    call += 1;
    return call % 2 === 1 ? 1 : 0;
  });

  new WorldEventSystem().update(1, state, {});

  for (const worker of state.agents) {
    assert.match(worker.memory.recentEvents[0], /Vermin swarm gnawed the stores/);
  }
});
