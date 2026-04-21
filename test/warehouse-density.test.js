import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { ResourceSystem } from "../src/simulation/economy/ResourceSystem.js";
import { WorldEventSystem } from "../src/world/events/WorldEventSystem.js";
import { TILE } from "../src/config/constants.js";
import { BALANCE } from "../src/config/balance.js";

function clearGridTo(state, tileType) {
  for (let i = 0; i < state.grid.tiles.length; i += 1) {
    state.grid.tiles[i] = tileType;
  }
  state.grid.version = Number(state.grid.version ?? 0) + 1;
}

function setTile(state, ix, iz, tileType) {
  const idx = ix + iz * state.grid.width;
  state.grid.tiles[idx] = tileType;
  state.grid.version = Number(state.grid.version ?? 0) + 1;
}

test("Case A: warehouse + 8 surrounding producers flagged as hot", () => {
  const state = createInitialGameState({ seed: 1337 });
  // Wipe the starting layout so only our deliberate placements contribute.
  clearGridTo(state, TILE.GRASS);

  const cx = 20;
  const cz = 20;
  setTile(state, cx, cz, TILE.WAREHOUSE);
  // Place 8 producers well within the density radius (default 6 Manhattan).
  const ring = [
    [cx - 1, cz], [cx + 1, cz], [cx, cz - 1], [cx, cz + 1],
    [cx - 2, cz], [cx + 2, cz], [cx, cz - 2], [cx, cz + 2],
  ];
  const types = [TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN,
    TILE.FARM, TILE.LUMBER, TILE.KITCHEN, TILE.SMITHY];
  for (let i = 0; i < ring.length; i += 1) setTile(state, ring[i][0], ring[i][1], types[i]);

  // Force the logistics/density rebuild by resetting its throttle.
  const system = new ResourceSystem();
  system.nextLogisticsSampleSec = -Infinity;
  system.update(0.1, state);

  const density = state.metrics.warehouseDensity;
  assert.ok(density, "warehouseDensity metrics must exist");
  const key = `${cx},${cz}`;
  assert.ok(density.hotWarehouses.includes(key),
    `warehouse ${key} should be hot; got hotWarehouses=${JSON.stringify(density.hotWarehouses)} score=${density.byKey[key]} threshold=${density.threshold}`);
  assert.ok(density.byKey[key] >= Number(BALANCE.warehouseDensityRiskThreshold ?? 400));
});

test("Case B: warehouse + 1 farm (low density) is not hot", () => {
  const state = createInitialGameState({ seed: 1337 });
  clearGridTo(state, TILE.GRASS);

  const cx = 20;
  const cz = 20;
  setTile(state, cx, cz, TILE.WAREHOUSE);
  setTile(state, cx + 1, cz, TILE.FARM);

  const system = new ResourceSystem();
  system.nextLogisticsSampleSec = -Infinity;
  system.update(0.1, state);

  const density = state.metrics.warehouseDensity;
  assert.ok(density, "warehouseDensity metrics must exist");
  const key = `${cx},${cz}`;
  assert.ok(!density.hotWarehouses.includes(key),
    `sparse warehouse should not be hot; got hotWarehouses=${JSON.stringify(density.hotWarehouses)} score=${density.byKey[key]}`);
});

test("Case C: stubbed rng yielding ~0.001 triggers a density-risk event within 200 ticks", () => {
  const state = createInitialGameState({ seed: 1337 });
  createServices(state.world.mapSeed); // parity with integration tests
  clearGridTo(state, TILE.GRASS);

  // Need at least one warehouse tile on the grid so the key parses and payload
  // carries valid coords; density scoring itself is forced by stuffing hotWarehouses.
  const cx = 20;
  const cz = 20;
  setTile(state, cx, cz, TILE.WAREHOUSE);

  state.metrics.warehouseDensity = {
    byKey: { [`${cx},${cz}`]: 9999 },
    peak: 9999,
    hotWarehouses: [`${cx},${cz}`],
    threshold: Number(BALANCE.warehouseDensityRiskThreshold ?? 400),
    radius: Number(BALANCE.warehouseDensityRadius ?? 6),
  };
  // Deterministic low-value rng so fire/vermin chance roll hits every tick.
  state._riskRng = () => 0.0001;

  const worldSystem = new WorldEventSystem();
  const dt = 0.1;
  for (let i = 0; i < 200; i += 1) {
    state.metrics.tick = (state.metrics.tick ?? 0) + 1;
    state.metrics.timeSec = (state.metrics.timeSec ?? 0) + dt;
    worldSystem.update(dt, state);
    // Re-arm hotWarehouses in case ResourceSystem hasn't refreshed it here.
    state.metrics.warehouseDensity.hotWarehouses = [`${cx},${cz}`];
  }

  const log = state.events?.log ?? [];
  const riskEvents = log.filter((e) => e.type === "warehouse_fire" || e.type === "vermin_swarm");
  assert.ok(riskEvents.length > 0,
    `expected at least one WAREHOUSE_FIRE or VERMIN_SWARM event; got log of length ${log.length}`);
});

test("Case D: stubbed rng yielding 0.99 produces zero density-risk events", () => {
  const state = createInitialGameState({ seed: 1337 });
  createServices(state.world.mapSeed);
  clearGridTo(state, TILE.GRASS);

  const cx = 20;
  const cz = 20;
  setTile(state, cx, cz, TILE.WAREHOUSE);

  state.metrics.warehouseDensity = {
    byKey: { [`${cx},${cz}`]: 9999 },
    peak: 9999,
    hotWarehouses: [`${cx},${cz}`],
    threshold: Number(BALANCE.warehouseDensityRiskThreshold ?? 400),
    radius: Number(BALANCE.warehouseDensityRadius ?? 6),
  };
  // rng well above any per-tick ignition probability — no rolls should hit.
  state._riskRng = () => 0.99;

  const worldSystem = new WorldEventSystem();
  const dt = 0.1;
  for (let i = 0; i < 200; i += 1) {
    state.metrics.tick = (state.metrics.tick ?? 0) + 1;
    state.metrics.timeSec = (state.metrics.timeSec ?? 0) + dt;
    worldSystem.update(dt, state);
    state.metrics.warehouseDensity.hotWarehouses = [`${cx},${cz}`];
  }

  const log = state.events?.log ?? [];
  const riskEvents = log.filter((e) => e.type === "warehouse_fire" || e.type === "vermin_swarm");
  assert.equal(riskEvents.length, 0,
    `expected zero events with rng=0.99; got ${riskEvents.length}: ${JSON.stringify(riskEvents.map((e) => e.type))}`);
});

test("Case E: seeded services.rng produces deterministic event counts across runs", () => {
  function runOnce(seed) {
    const state = createInitialGameState({ seed });
    const services = createServices(state.world.mapSeed);
    clearGridTo(state, TILE.GRASS);
    const cx = 15;
    const cz = 15;
    setTile(state, cx, cz, TILE.WAREHOUSE);
    state.metrics.warehouseDensity = {
      byKey: { [`${cx},${cz}`]: 9999 },
      peak: 9999,
      hotWarehouses: [`${cx},${cz}`],
      threshold: Number(BALANCE.warehouseDensityRiskThreshold ?? 400),
      radius: Number(BALANCE.warehouseDensityRadius ?? 6),
    };
    // No _riskRng stub → falls through to services.rng.next.
    const worldSystem = new WorldEventSystem();
    for (let i = 0; i < 500; i += 1) {
      state.metrics.tick = (state.metrics.tick ?? 0) + 1;
      state.metrics.timeSec = (state.metrics.timeSec ?? 0) + 0.1;
      worldSystem.update(0.1, state, services);
      state.metrics.warehouseDensity.hotWarehouses = [`${cx},${cz}`];
    }
    return (state.events?.log ?? []).filter(
      (e) => e.type === "warehouse_fire" || e.type === "vermin_swarm",
    ).length;
  }

  const runA = runOnce(4242);
  const runB = runOnce(4242);
  assert.equal(runA, runB, `deterministic seed should produce identical event counts; got ${runA} vs ${runB}`);
});
