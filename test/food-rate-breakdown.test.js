// v0.8.2 Round-5 Wave-2 (01c-ui + 01d-mechanics-content): ResourceSystem
// sliding-window resource-flow tracker + true-source emits from
// ProcessingSystem / MortalitySystem. Flushes per-min metrics every
// RESOURCE_FLOW_WINDOW_SEC (3 sec) so HUDController's #foodRateBreakdown
// DOM can render "(prod +X / cons -Y / spoil -Z)".
//
// Plan:
//   - assignments/homework6/Agent-Feedback-Loop/Round5/Plans/01c-ui.md
//   - assignments/homework6/Agent-Feedback-Loop/Round5/Plans/01d-mechanics-content.md

import test from "node:test";
import assert from "node:assert/strict";

import {
  ResourceSystem,
  RESOURCE_FLOW_WINDOW_SEC,
  recordResourceFlow,
} from "../src/simulation/economy/ResourceSystem.js";

// Minimal grid / state stub. ResourceSystem.update touches:
//   - state.resources.*
//   - state.metrics.*
//   - state.grid (version, tiles length)
//   - state.debug (optional)
//   - state.gameplay (optional)
// We don't hit the building-density branch unless grid version changes.
function makeState(initial) {
  return {
    resources: {
      food: initial?.food ?? 100,
      wood: 50,
      stone: 20,
      herbs: 10,
      meals: 0,
      medicine: 0,
      tools: 0,
    },
    metrics: { timeSec: 0 },
    grid: {
      version: 1,
      tiles: new Uint8Array(96 * 72),
      width: 96,
      height: 72,
      emptyBaseTiles: 0,
    },
    debug: {},
    gameplay: {},
    environment: {},
    weather: {},
    agents: [],
    animals: [],
  };
}

test("ResourceSystem flushes foodProducedPerMin when a farm-source emit fires", () => {
  const sys = new ResourceSystem();
  const state = makeState({ food: 100 });
  sys.lastGridVersion = state.grid.version;
  // True-source emit: farm harvests 18 food in a cycle.
  recordResourceFlow(state, "food", "produced", 18);
  state.resources.food = 118;
  // One tick with dt=3s crosses RESOURCE_FLOW_WINDOW_SEC exactly and
  // triggers the flush. Using a single step avoids float drift.
  sys.update(3, state);
  const prod = Number(state.metrics.foodProducedPerMin);
  // 18 food over 3 sec = 360/min
  assert.ok(prod >= 350 && prod <= 370, `expected ~360/min, got ${prod}`);
  // v0.10.1-j: warehouse spoilage produces a tiny non-zero spoiledPerMin even in this test
  assert.ok(Number(state.metrics.foodSpoiledPerMin) < 2, `expected near-zero spoiledPerMin, got ${state.metrics.foodSpoiledPerMin}`);
});

test("ResourceSystem net-delta fallback attributes unexplained food drop to consumed", () => {
  const sys = new ResourceSystem();
  const state = makeState({ food: 100 });
  sys.lastGridVersion = state.grid.version;
  // Prime the snapshot at food=100 with a zero-length tick.
  sys.update(0, state);
  // Worker-eat happens inside WorkerAISystem (freeze-locked) and is NOT
  // emitted; ResourceSystem's net-delta fallback must attribute the
  // 60-food drop to `consumed`.
  state.resources.food = 40;
  sys.update(3, state);
  const cons = Number(state.metrics.foodConsumedPerMin);
  // 60 food over 3 sec = 1200/min
  assert.ok(cons >= 1100 && cons <= 1300, `expected ~1200/min, got ${cons}`);
});

test("ResourceSystem reports zero per-min when food is stable across the window", () => {
  const sys = new ResourceSystem();
  const state = makeState({ food: 100 });
  sys.lastGridVersion = state.grid.version;
  sys.update(3, state);
  assert.equal(Number(state.metrics.foodProducedPerMin), 0);
  assert.equal(Number(state.metrics.foodConsumedPerMin), 0);
  // v0.10.1-j: warehouse spoilage produces a small but non-zero spoiledPerMin
  assert.ok(Number(state.metrics.foodSpoiledPerMin) < 2, `expected near-zero spoiledPerMin, got ${state.metrics.foodSpoiledPerMin}`);
});

test("recordResourceFlow ignores unknown resources and non-positive amounts", () => {
  const state = makeState({ food: 100 });
  // Should not throw / not create a bogus accum.
  recordResourceFlow(state, "unobtainium", "produced", 5);
  recordResourceFlow(state, "food", "produced", 0);
  recordResourceFlow(state, "food", "produced", -5);
  recordResourceFlow(state, "food", "invalidKind", 5);
  assert.equal(state._resourceFlowAccum?.food?.produced ?? 0, 0);
});

test("recordResourceFlow routes spoiled → spoiledPerMin after flush", () => {
  const sys = new ResourceSystem();
  const state = makeState({ food: 100 });
  sys.lastGridVersion = state.grid.version;
  recordResourceFlow(state, "food", "spoiled", 6);
  // Subtract from food to keep ledger honest so net-delta doesn't
  // re-attribute it as consumption.
  state.resources.food = 94;
  sys.update(3, state);
  const spoil = Number(state.metrics.foodSpoiledPerMin);
  assert.ok(spoil >= 110 && spoil <= 130, `expected ~120/min spoiled, got ${spoil}`);
});

test("ProcessingSystem kitchen cycle records food-consumed + meals-produced true-source emits", async () => {
  const { ProcessingSystem } = await import("../src/simulation/economy/ProcessingSystem.js");
  const { TILE, ROLE } = await import("../src/config/constants.js");
  const { tileToWorld } = await import("../src/world/grid/Grid.js");
  const sys = new ProcessingSystem();
  // Fake grid: one kitchen tile at (5,5), plus a cook worker adjacent.
  const grid = {
    version: 1,
    width: 16,
    height: 16,
    tileSize: 1,
    tiles: new Uint8Array(16 * 16),
  };
  grid.tiles[5 + 5 * grid.width] = TILE.KITCHEN;
  const cookPos = tileToWorld(5, 5, grid);
  const state = {
    resources: { food: 50, wood: 0, stone: 0, herbs: 0, meals: 0, medicine: 0, tools: 0 },
    metrics: { timeSec: 100 },
    grid,
    environment: { isNight: false },
    weather: { current: "clear" },
    gameplay: { toolProductionMultiplier: 1 },
    agents: [
      {
        id: "cook1",
        type: "WORKER",
        role: ROLE.COOK,
        x: cookPos.x,
        z: cookPos.z,
        alive: true,
      },
    ],
    animals: [],
    debug: {},
  };
  // First call primes the timer. Advance time past kitchenCycleSec (~3s).
  sys.update(0.1, state);
  state.metrics.timeSec = 200; // well past timer + cycle
  sys.update(0.1, state);
  const consumed = state._resourceFlowAccum?.food?.consumed ?? 0;
  const produced = state._resourceFlowAccum?.meals?.produced ?? 0;
  assert.ok(consumed > 0, `expected kitchen food consumed emit, got ${consumed}`);
  assert.ok(produced > 0, `expected kitchen meals produced emit, got ${produced}`);
});
