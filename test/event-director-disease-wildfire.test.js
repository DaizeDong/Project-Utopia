// v0.8.2 Round-6 Wave-2 (01d-mechanics-content) — DISEASE_OUTBREAK and
// WILDFIRE active-event effects. Verifies that WorldEventSystem.applyActiveEvent
// drains medicine + worker hp on disease, and that wildfire converts a LUMBER
// tile to RUINS.

import test from "node:test";
import assert from "node:assert/strict";

import { WorldEventSystem } from "../src/world/events/WorldEventSystem.js";
import { enqueueEvent } from "../src/world/events/WorldEventQueue.js";
import { EVENT_TYPE, TILE } from "../src/config/constants.js";

function makeStubServices() {
  return {
    rng: { next: () => 0.42 },
  };
}

function makeStubGrid(width = 10, height = 10) {
  const tiles = new Uint8Array(width * height); // all GRASS=0
  return { width, height, tiles, version: 0 };
}

function makeStubScenario() {
  return {
    anchors: { coreWarehouse: { ix: 1, iz: 1 } },
    routes: [],
    depots: [],
    wildlifeZones: [],
  };
}

function makeStubState({ grid, agents = [], medicine = 5 } = {}) {
  return {
    grid,
    agents,
    animals: [],
    metrics: { tick: 0, timeSec: 0 },
    weather: {
      pressureScore: 0,
      hazardTiles: [],
      hazardTileSet: new Set(),
      hazardPenaltyMultiplier: 1,
      hazardPenaltyByKey: {},
      hazardLabelByKey: {},
      hazardFronts: [],
    },
    resources: { food: 100, wood: 50, stone: 20, herbs: 5, meals: 0, medicine, tools: 0 },
    events: { queue: [], active: [] },
    gameplay: {
      raidEscalation: { tier: 0, intervalTicks: 3600, intensityMultiplier: 1, devIndexSample: 0 },
      lastRaidTick: -9999,
      scenario: makeStubScenario(),
    },
    debug: { eventTrace: [] },
  };
}

test("DISEASE_OUTBREAK: medicine drains and ≥1 worker hp drops over 36s", () => {
  const grid = makeStubGrid();
  const agents = [
    { id: "w1", type: "WORKER", alive: true, hp: 100, maxHp: 100, x: 0, z: 0, blackboard: {} },
    { id: "w2", type: "WORKER", alive: true, hp: 100, maxHp: 100, x: 1, z: 0, blackboard: {} },
  ];
  const state = makeStubState({ grid, agents, medicine: 10 });
  enqueueEvent(state, EVENT_TYPE.DISEASE_OUTBREAK, {}, 35, 1);
  const sys = new WorldEventSystem();
  const services = makeStubServices();
  // Step 1: drains queue → active. Wait for status to flip from prepare → active (1s).
  sys.update(1.5, state, services);
  // Now active; advance for 36 seconds at 1s ticks.
  for (let s = 0; s < 36; s += 1) {
    state.metrics.tick += 1;
    sys.update(1.0, state, services);
  }
  assert.ok(state.resources.medicine < 10,
    `medicine should drain, got ${state.resources.medicine}`);
  assert.ok(state.resources.medicine <= 10 - 1,
    `medicine drained at least 1 unit, got ${state.resources.medicine}`);
  const minHp = Math.min(...agents.map((a) => Number(a.hp)));
  assert.ok(minHp < 100, `at least one worker should have lost hp, min=${minHp}`);
});

test("WILDFIRE: converts a LUMBER tile to RUINS within 10s", () => {
  const grid = makeStubGrid();
  // Stamp a LUMBER tile at (3,3).
  grid.tiles[3 + 3 * grid.width] = TILE.LUMBER;
  const state = makeStubState({ grid });
  // Force the event payload to carry a targetTiles list directly so
  // ensureSpatialPayload doesn't try to score scenario zones for WILDFIRE.
  enqueueEvent(state, EVENT_TYPE.WILDFIRE, {
    targetTiles: [{ ix: 3, iz: 3 }],
    targetKind: "local",
    targetLabel: "wildfire",
  }, 25, 1);
  const sys = new WorldEventSystem();
  const services = makeStubServices();
  // Drain queue → active.
  sys.update(1.5, state, services);
  let burnedToRuins = false;
  // Advance up to 10 seconds at 0.25s ticks (40 iterations) — gives plenty of
  // chances for the per-second 5% × dt × intensity probability roll.
  for (let i = 0; i < 40; i += 1) {
    state.metrics.tick += 1;
    sys.update(0.25, state, services);
    if (grid.tiles[3 + 3 * grid.width] === TILE.RUINS) {
      burnedToRuins = true;
      break;
    }
  }
  assert.ok(burnedToRuins, "WILDFIRE should convert at least 1 LUMBER tile to RUINS within 10s");
});

test("MORALE_BREAK: assigns moraleBreak.untilSec on lowest-mood worker", () => {
  const grid = makeStubGrid();
  const agents = [
    { id: "happy", type: "WORKER", alive: true, hp: 100, maxHp: 100, x: 0, z: 0, mood: 0.9, blackboard: {} },
    { id: "sad", type: "WORKER", alive: true, hp: 100, maxHp: 100, x: 1, z: 0, mood: 0.05, blackboard: {} },
  ];
  const state = makeStubState({ grid, agents });
  enqueueEvent(state, EVENT_TYPE.MORALE_BREAK, { ix: 1, iz: 0, workerId: "sad" }, 30, 1);
  const sys = new WorldEventSystem();
  const services = makeStubServices();
  // Drain → active → tick.
  sys.update(1.5, state, services);
  state.metrics.tick += 1;
  sys.update(0.5, state, services);
  const sad = agents.find((a) => a.id === "sad");
  assert.ok(sad.blackboard?.moraleBreak,
    "lowest-mood worker should be tagged with moraleBreak blackboard entry");
  assert.ok(Number(sad.blackboard.moraleBreak.untilSec) > Number(state.metrics.timeSec),
    "moraleBreak.untilSec should be in the future");
});
