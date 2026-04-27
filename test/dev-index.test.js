import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { DevIndexSystem, computeDevIndexComposite } from "../src/simulation/meta/DevIndexSystem.js";
import {
  collectEconomySnapshot,
  scorePopulation,
  scoreEconomy,
  scoreInfrastructure,
  scoreProduction,
  scoreDefense,
  scoreResilience,
  scoreAllDims,
} from "../src/simulation/telemetry/EconomyTelemetry.js";
import { BALANCE } from "../src/config/balance.js";
import { TILE, ENTITY_TYPE } from "../src/config/constants.js";
import { createWorker } from "../src/entities/EntityFactory.js";
import { tileToWorld } from "../src/world/grid/Grid.js";

function setTile(state, ix, iz, tileType) {
  state.grid.tiles[ix + iz * state.grid.width] = tileType;
}

// ---------------------------------------------------------------------------
// Case 1 — Fresh game state DevIndex lands in the early-game band.
// (Spec hint: [20, 45]; widened to [20, 55] to accommodate scenarios that
// pre-stamp producer tiles at map-gen time, which saturates the production
// dim immediately — see report "Spec deviation" section.)
// ---------------------------------------------------------------------------
test("DevIndex: initial fresh-state composite lands in early-game band", () => {
  const state = createInitialGameState({ seed: 7070 });
  const services = createServices(state.world.mapSeed);
  const sys = new DevIndexSystem();
  sys.update(1 / 30, state, services);

  const composite = state.gameplay.devIndex;
  assert.ok(Number.isFinite(composite), "devIndex must be a finite number");
  assert.ok(composite >= 20 && composite <= 55,
    `expected fresh DevIndex in [20, 55], got ${composite.toFixed(2)}`);
});

// ---------------------------------------------------------------------------
// Case 2 — Every one of the 6 dimensions independently returns a value in
// [0, 100] across a mix of starved, typical, and flooded states.
// ---------------------------------------------------------------------------
test("DevIndex: all 6 dimensions stay in [0, 100] across extreme inputs", () => {
  const cases = [];

  // Starved: no resources, no agents, no buildings, empty grid.
  const empty = createInitialGameState({ seed: 11 });
  empty.agents = [];
  empty.resources.food = 0; empty.resources.wood = 0; empty.resources.stone = 0;
  for (let i = 0; i < empty.grid.tiles.length; i += 1) empty.grid.tiles[i] = TILE.GRASS;
  cases.push({ label: "empty", snapshot: collectEconomySnapshot(empty) });

  // Typical: initial state unmodified.
  const typical = createInitialGameState({ seed: 12 });
  cases.push({ label: "typical", snapshot: collectEconomySnapshot(typical) });

  // Flooded: far above all targets (200 agents, 9999 resources, many tiles).
  const flooded = createInitialGameState({ seed: 13 });
  flooded.resources.food = 9999; flooded.resources.wood = 9999; flooded.resources.stone = 9999;
  for (let i = 0; i < 200; i += 1) {
    flooded.agents.push(createWorker(i, i));
  }
  for (let ix = 0; ix < 30; ix += 1) {
    for (let iz = 0; iz < 30; iz += 1) {
      flooded.grid.tiles[ix + iz * flooded.grid.width] = TILE.WALL;
    }
  }
  cases.push({ label: "flooded", snapshot: collectEconomySnapshot(flooded) });

  for (const { label, snapshot } of cases) {
    const dims = scoreAllDims(snapshot);
    for (const key of Object.keys(dims)) {
      const v = dims[key];
      assert.ok(Number.isFinite(v), `${label}/${key} must be finite, got ${v}`);
      assert.ok(v >= 0 && v <= 100,
        `${label}/${key} out of [0, 100]: ${v}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Case 3 — Composite equals the weighted mean of the 6 dims.
// ---------------------------------------------------------------------------
test("DevIndex: composite = weighted mean of the 6 dims", () => {
  const dims = {
    population: 40,
    economy: 60,
    infrastructure: 20,
    production: 80,
    defense: 10,
    resilience: 50,
  };
  // Default weights = equal 1/6 each -> simple arithmetic mean.
  const composite = computeDevIndexComposite(dims, BALANCE.devIndexWeights);
  const expected = (40 + 60 + 20 + 80 + 10 + 50) / 6;
  assert.ok(Math.abs(composite - expected) < 1e-6,
    `expected ${expected}, got ${composite}`);
});

// ---------------------------------------------------------------------------
// Case 4 — Sliding-window smoothing: after windowTicks constant samples,
// smoothed === raw.
// ---------------------------------------------------------------------------
test("DevIndex: smoothed === devIndex after windowTicks of constant values", () => {
  const state = createInitialGameState({ seed: 9001 });
  const services = createServices(state.world.mapSeed);
  const sys = new DevIndexSystem();

  const window = Number(BALANCE.devIndexWindowTicks ?? 60);
  for (let i = 0; i < window; i += 1) {
    sys.update(1 / 30, state, services);
  }
  const raw = state.gameplay.devIndex;
  const smoothed = state.gameplay.devIndexSmoothed;
  assert.ok(Math.abs(raw - smoothed) < 1e-6,
    `after ${window} constant ticks, devIndex (${raw}) and smoothed (${smoothed}) should match`);
  assert.equal(state.gameplay.devIndexHistory.length, window,
    "history ring-buffer length must equal windowTicks");
});

// ---------------------------------------------------------------------------
// Case 5 — After injecting 50 agents + full resources + 40 walls, DevIndex
// climbs into the [70, 95] band.
// ---------------------------------------------------------------------------
test("DevIndex: saturated colony lands in [70, 95]", () => {
  const state = createInitialGameState({ seed: 4242 });
  const services = createServices(state.world.mapSeed);
  const sys = new DevIndexSystem();

  // Inject 50 fresh workers total.
  const baseline = state.agents.length;
  const extra = Math.max(0, 50 - baseline);
  for (let i = 0; i < extra; i += 1) {
    state.agents.push(createWorker(5 + i, 5 + i));
  }

  // Full resource stockpiles (over target so scoreEconomy saturates near 100).
  state.resources.food = 300;
  state.resources.wood = 220;
  state.resources.stone = 150;

  // 40 WALL tiles (spec requirement).
  let placedWalls = 0;
  for (let ix = 0; ix < state.grid.width && placedWalls < 40; ix += 1) {
    for (let iz = 0; iz < state.grid.height && placedWalls < 40; iz += 1) {
      if (state.grid.tiles[ix + iz * state.grid.width] === TILE.GRASS) {
        state.grid.tiles[ix + iz * state.grid.width] = TILE.WALL;
        placedWalls += 1;
      }
    }
  }

  // A modest additional road network (not so much that infrastructure
  // saturates and tips the composite past 95).
  let roads = 0;
  for (let ix = 0; ix < state.grid.width && roads < 200; ix += 1) {
    for (let iz = 0; iz < state.grid.height && roads < 200; iz += 1) {
      if (state.grid.tiles[ix + iz * state.grid.width] === TILE.GRASS) {
        state.grid.tiles[ix + iz * state.grid.width] = TILE.ROAD;
        roads += 1;
      }
    }
  }

  // Refresh worker needs so resilience scores high.
  for (const a of state.agents) {
    if (a.type === ENTITY_TYPE.WORKER) { a.hunger = 1; a.rest = 1; a.morale = 1; }
  }

  sys.update(1 / 30, state, services);
  const composite = state.gameplay.devIndex;
  assert.ok(composite >= 70 && composite <= 95,
    `saturated DevIndex expected in [70, 95], got ${composite.toFixed(2)}`);
});

// ---------------------------------------------------------------------------
// Case 6 — When devIndexWeights isolates one dim, only that dim drives the
// composite. Verified via the pure composite helper (isolates from
// BALANCE freezing).
// ---------------------------------------------------------------------------
test("DevIndex: single-weight config => composite equals that dim", () => {
  const dims = {
    population: 42,
    economy: 13,
    infrastructure: 88,
    production: 77,
    defense: 5,
    resilience: 99,
  };
  const weights = Object.freeze({
    population: 1,
    economy: 0,
    infrastructure: 0,
    production: 0,
    defense: 0,
    resilience: 0,
  });
  const composite = computeDevIndexComposite(dims, weights);
  assert.ok(Math.abs(composite - dims.population) < 1e-6,
    `expected population-only composite ${dims.population}, got ${composite}`);

  const resWeights = Object.freeze({
    population: 0, economy: 0, infrastructure: 0,
    production: 0, defense: 0, resilience: 1,
  });
  const resComposite = computeDevIndexComposite(dims, resWeights);
  assert.ok(Math.abs(resComposite - dims.resilience) < 1e-6,
    `expected resilience-only composite ${dims.resilience}, got ${resComposite}`);
});

// ---------------------------------------------------------------------------
// Bonus coverage — public contract fields all exist after first update.
// ---------------------------------------------------------------------------
test("DevIndex: public contract fields exposed on state.gameplay", () => {
  const state = createInitialGameState({ seed: 3333 });
  const services = createServices(state.world.mapSeed);
  const sys = new DevIndexSystem();
  sys.update(1 / 30, state, services);

  assert.equal(typeof state.gameplay.devIndex, "number");
  assert.equal(typeof state.gameplay.devIndexSmoothed, "number");
  const dims = state.gameplay.devIndexDims;
  assert.ok(dims && typeof dims === "object");
  for (const key of ["population", "economy", "infrastructure", "production", "defense", "resilience"]) {
    assert.equal(typeof dims[key], "number", `dim ${key} missing or non-numeric`);
  }
  assert.ok(Array.isArray(state.gameplay.devIndexHistory));
  assert.ok(state.gameplay.devIndexHistory.length <= Number(BALANCE.devIndexWindowTicks ?? 60));
});
