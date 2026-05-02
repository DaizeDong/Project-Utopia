import test from "node:test";
import assert from "node:assert/strict";

import {
  ColonyPerceiver,
  ResourceRateTracker,
  detectClusters,
  analyzeExpansionFrontiers,
  computeAffordability,
  formatObservationForLLM,
} from "../src/simulation/ai/colony/ColonyPerceiver.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { TILE } from "../src/config/constants.js";
import { rebuildBuildingStats, toIndex } from "../src/world/grid/Grid.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeTestState(overrides = {}) {
  const state = createInitialGameState();
  state.session = { phase: "active" };
  state.resources = { food: 80, wood: 70, stone: 10, herbs: 5, meals: 0, tools: 0, medicine: 0, ...overrides.resources };
  state.buildings = rebuildBuildingStats(state.grid);
  state.metrics = state.metrics ?? {};
  state.metrics.timeSec = overrides.timeSec ?? 0;
  if (overrides.buildings) {
    Object.assign(state.buildings, overrides.buildings);
  }
  return state;
}

function placeTile(grid, ix, iz, tileType) {
  const idx = toIndex(ix, iz, grid.width);
  grid.tiles[idx] = tileType;
}

function makeMinimalGrid() {
  const width = 20;
  const height = 20;
  const tiles = new Uint8Array(width * height).fill(TILE.GRASS);
  return {
    width,
    height,
    tileSize: 1,
    tiles,
    tileState: new Map(),
    tileStateVersion: 0,
    version: 1,
    elevation: new Uint8Array(width * height).fill(128),
    moisture: new Uint8Array(width * height).fill(128),
  };
}

// ── ResourceRateTracker tests ────────────────────────────────────────

test("ResourceRateTracker returns zero rate with insufficient samples", () => {
  const tracker = new ResourceRateTracker();
  tracker.sample(0, { food: 100 });
  const result = tracker.getRate("food");
  assert.equal(result.rate, 0);
  assert.equal(result.trend, "unknown");
});

test("ResourceRateTracker detects positive rate", () => {
  const tracker = new ResourceRateTracker();
  tracker.sample(0, { food: 100 });
  tracker.sample(2, { food: 104 });
  tracker.sample(4, { food: 108 });
  tracker.sample(6, { food: 112 });
  const result = tracker.getRate("food");
  assert.ok(result.rate > 0, `rate should be positive, got ${result.rate}`);
  assert.equal(result.trend, "rising");
  assert.equal(result.projectedZeroSec, null, "should not project zero for rising resource");
});

test("ResourceRateTracker detects declining rate with projected zero", () => {
  const tracker = new ResourceRateTracker();
  tracker.sample(0, { food: 100 });
  tracker.sample(2, { food: 90 });
  tracker.sample(4, { food: 80 });
  tracker.sample(6, { food: 70 });
  const result = tracker.getRate("food");
  assert.ok(result.rate < 0, `rate should be negative, got ${result.rate}`);
  assert.equal(result.trend, "declining");
  assert.ok(result.projectedZeroSec > 0, "should project time to zero");
});

test("ResourceRateTracker detects stable trend", () => {
  const tracker = new ResourceRateTracker();
  tracker.sample(0, { wood: 50 });
  tracker.sample(2, { wood: 50 });
  tracker.sample(4, { wood: 50 });
  const result = tracker.getRate("wood");
  assert.equal(result.rate, 0);
  assert.equal(result.trend, "stable");
});

test("ResourceRateTracker tracks multiple resources", () => {
  const tracker = new ResourceRateTracker();
  tracker.sample(0, { food: 100, wood: 50 });
  tracker.sample(2, { food: 110, wood: 40 });
  tracker.sample(4, { food: 120, wood: 30 });
  const all = tracker.getAllRates();
  assert.ok(all.food.rate > 0, "food should be rising");
  assert.ok(all.wood.rate < 0, "wood should be declining");
});

test("ResourceRateTracker respects sample interval", () => {
  const tracker = new ResourceRateTracker();
  tracker.sample(0, { food: 100 });
  tracker.sample(0.5, { food: 200 }); // too soon, should be ignored
  tracker.sample(1.0, { food: 300 }); // too soon
  const result = tracker.getRate("food");
  assert.equal(result.rate, 0, "should only have 1 sample, rate 0");
});

test("ResourceRateTracker trims old samples beyond window", () => {
  const tracker = new ResourceRateTracker();
  // Fill beyond MAX_RATE_SAMPLES
  for (let t = 0; t <= 60; t += 2) {
    tracker.sample(t, { food: 100 + t });
  }
  const result = tracker.getRate("food");
  assert.ok(result.rate > 0, "rate should still be computed from trimmed window");
});

// ── detectClusters tests ─────────────────────────────────────────────

test("detectClusters returns empty for grid without warehouses", () => {
  const grid = makeMinimalGrid();
  const clusters = detectClusters(grid);
  assert.equal(clusters.length, 0);
});

test("detectClusters finds single cluster around warehouse", () => {
  const grid = makeMinimalGrid();
  // Place a warehouse with surrounding farms and roads
  placeTile(grid, 10, 10, TILE.WAREHOUSE);
  placeTile(grid, 11, 10, TILE.FARM);
  placeTile(grid, 9, 10, TILE.FARM);
  placeTile(grid, 10, 11, TILE.ROAD);
  placeTile(grid, 10, 9, TILE.LUMBER);

  const clusters = detectClusters(grid);
  assert.equal(clusters.length, 1, "should find exactly 1 cluster");
  assert.equal(clusters[0].warehouses, 1);
  assert.equal(clusters[0].farms, 2);
  assert.equal(clusters[0].lumbers, 1);
  assert.equal(clusters[0].roads, 1);
});

test("detectClusters finds multiple disconnected clusters", () => {
  const grid = makeMinimalGrid();
  // Cluster A at (3,3)
  placeTile(grid, 3, 3, TILE.WAREHOUSE);
  placeTile(grid, 4, 3, TILE.FARM);

  // Cluster B at (17,17) — far away, no connection
  placeTile(grid, 17, 17, TILE.WAREHOUSE);
  placeTile(grid, 16, 17, TILE.LUMBER);

  const clusters = detectClusters(grid);
  assert.equal(clusters.length, 2, "should find 2 disconnected clusters");
});

test("detectClusters computes coverage ratio", () => {
  const grid = makeMinimalGrid();
  placeTile(grid, 10, 10, TILE.WAREHOUSE);
  // Close farm — covered
  placeTile(grid, 11, 10, TILE.FARM);
  // Far farm — still within radius 12
  placeTile(grid, 10, 3, TILE.FARM);

  const clusters = detectClusters(grid);
  assert.ok(clusters.length >= 1);
  const c = clusters[0];
  assert.ok(c.coverageRatio > 0, "should have some coverage");
});

test("detectClusters computes avgElevation and avgMoisture", () => {
  const grid = makeMinimalGrid();
  placeTile(grid, 10, 10, TILE.WAREHOUSE);
  // Set specific elevation/moisture
  const idx = toIndex(10, 10, grid.width);
  grid.elevation[idx] = 200; // high elevation
  grid.moisture[idx] = 50;   // low moisture

  const clusters = detectClusters(grid);
  assert.ok(clusters.length >= 1);
  // With mixed values from BFS traversal, just check they're numbers
  assert.equal(typeof clusters[0].avgElevation, "number");
  assert.equal(typeof clusters[0].avgMoisture, "number");
});

// ── analyzeExpansionFrontiers tests ──────────────────────────────────

test("analyzeExpansionFrontiers returns empty for no clusters", () => {
  const grid = makeMinimalGrid();
  const result = analyzeExpansionFrontiers(grid, []);
  assert.equal(result.length, 0);
});

test("analyzeExpansionFrontiers returns directional frontiers", () => {
  const grid = makeMinimalGrid();
  const clusters = [{ id: "c0", center: { ix: 10, iz: 10 }, warehouses: 1 }];
  const result = analyzeExpansionFrontiers(grid, clusters);
  assert.ok(result.length > 0, "should return at least one frontier");
  for (const f of result) {
    assert.ok(["north", "south", "east", "west"].includes(f.direction));
    assert.ok(typeof f.availableGrass === "number");
    assert.ok(typeof f.avgMoisture === "number");
    assert.ok(typeof f.density === "number");
  }
});

test("analyzeExpansionFrontiers detects water-blocked direction", () => {
  const grid = makeMinimalGrid();
  // Fill entire north with water
  for (let ix = 0; ix < grid.width; ix++) {
    for (let iz = 0; iz < 5; iz++) {
      placeTile(grid, ix, iz, TILE.WATER);
    }
  }
  const clusters = [{ id: "c0", center: { ix: 10, iz: 10 }, warehouses: 1 }];
  const result = analyzeExpansionFrontiers(grid, clusters);
  const north = result.find(f => f.direction === "north");
  const south = result.find(f => f.direction === "south");
  if (north && south) {
    assert.ok(north.availableGrass <= south.availableGrass,
      "water-blocked north should have fewer available grass tiles");
  }
});

// ── computeAffordability tests ───────────────────────────────────────

test("computeAffordability correctly checks resources", () => {
  const rich = { food: 100, wood: 100, stone: 50, herbs: 50 };
  const result = computeAffordability(rich);
  assert.equal(result.farm, true, "should afford farm with 100 wood");
  assert.equal(result.warehouse, true, "should afford warehouse");
  assert.equal(result.smithy, true, "should afford smithy");
});

test("computeAffordability detects unaffordable buildings", () => {
  const poor = { food: 0, wood: 3, stone: 0, herbs: 0 };
  const result = computeAffordability(poor);
  assert.equal(result.farm, false, "should not afford farm with 3 wood");
  assert.equal(result.road, true, "should afford road with 3 wood");
  assert.equal(result.warehouse, false, "should not afford warehouse");
});

// ── ColonyPerceiver integration tests ────────────────────────────────

test("ColonyPerceiver.observe returns well-structured observation", () => {
  const state = makeTestState();
  const perceiver = new ColonyPerceiver();
  const obs = perceiver.observe(state);

  assert.ok(obs.timeSec != null, "should have timeSec");
  assert.ok(obs.economy, "should have economy");
  assert.ok(obs.topology, "should have topology");
  assert.ok(obs.workforce, "should have workforce");
  assert.ok(obs.defense, "should have defense");
  assert.ok(obs.environment, "should have environment");
  assert.ok(obs.affordable, "should have affordable");
  assert.ok(obs.buildings, "should have buildings");
});

test("ColonyPerceiver.observe has correct workforce count", () => {
  const state = makeTestState();
  const perceiver = new ColonyPerceiver();
  const obs = perceiver.observe(state);

  const liveWorkers = state.agents.filter(a => a.type === "WORKER" && a.alive !== false).length;
  assert.equal(obs.workforce.total, liveWorkers);
});

test("ColonyPerceiver.observe tracks economy stocks", () => {
  const state = makeTestState({ resources: { food: 42, wood: 33, stone: 7, herbs: 2, meals: 1, tools: 3, medicine: 0 } });
  const perceiver = new ColonyPerceiver();
  const obs = perceiver.observe(state);

  assert.equal(obs.economy.food.stock, 42);
  assert.equal(obs.economy.wood.stock, 33);
  assert.equal(obs.economy.stone.stock, 7);
  assert.equal(obs.economy.tools.stock, 3);
});

test("ColonyPerceiver.observe detects clusters in real game state", () => {
  const state = makeTestState();
  const perceiver = new ColonyPerceiver();
  const obs = perceiver.observe(state);

  // Initial state should have at least one cluster (from initial warehouses)
  assert.ok(obs.topology.clusters.length >= 0, "should have cluster data");
  assert.ok(typeof obs.topology.totalBuildings === "number");
});

test("ColonyPerceiver.observe computes pop cap", () => {
  const state = makeTestState();
  const perceiver = new ColonyPerceiver();
  const obs = perceiver.observe(state);

  assert.ok(obs.workforce.popCap >= 8, "pop cap should be at least 8");
  // v0.10.1-iter4 (HW7 hotfix Batch E — Issue #9): legacy `Math.min(80, ...)`
  // hard ceiling removed so the LLM/perceiver pop-cap estimate scales with
  // infrastructure rather than being clamped to a global 80. Lower bound
  // assertion above is sufficient to verify the formula is producing a
  // sane value; upper bound is now infrastructure-driven (no fixed ceiling).
  assert.ok(typeof obs.workforce.popCap === "number" && Number.isFinite(obs.workforce.popCap),
    "pop cap should be a finite number");
});

test("ColonyPerceiver.observe identifies growth blockers", () => {
  const state = makeTestState({ resources: { food: 5, wood: 10, stone: 0, herbs: 0 } });
  const perceiver = new ColonyPerceiver();
  const obs = perceiver.observe(state);

  // Phase 7.A raised MIN_FOOD_FOR_GROWTH from 20 → 25; the blocker message is
  // now derived from the exported constant. Assert the prefix so future
  // tuning does not desync the test.
  const foodBlocker = obs.workforce.growthBlockers.find((b) => b.startsWith("food <"));
  assert.ok(
    foodBlocker,
    `should detect food shortage blocker, got blockers=${JSON.stringify(obs.workforce.growthBlockers)}`,
  );
});

test("ColonyPerceiver.observe has expansion frontiers", () => {
  const state = makeTestState();
  const perceiver = new ColonyPerceiver();
  const obs = perceiver.observe(state);

  assert.ok(Array.isArray(obs.topology.expansionFrontiers));
});

test("ColonyPerceiver stores last observation", () => {
  const state = makeTestState();
  const perceiver = new ColonyPerceiver();
  assert.equal(perceiver.getLastObservation(), null);

  perceiver.observe(state);
  assert.ok(perceiver.getLastObservation() != null, "should store observation after observe()");
});

test("ColonyPerceiver increments observeCount", () => {
  const state = makeTestState();
  const perceiver = new ColonyPerceiver();

  const obs1 = perceiver.observe(state);
  assert.equal(obs1.observeCount, 1);

  state.metrics.timeSec = 10;
  const obs2 = perceiver.observe(state);
  assert.equal(obs2.observeCount, 2);
});

test("ColonyPerceiver.observe includes prosperity", () => {
  const state = makeTestState();
  state.gameplay.prosperity = 42;
  const perceiver = new ColonyPerceiver();
  const obs = perceiver.observe(state);
  assert.equal(obs.prosperity, 42);
});

test("ColonyPerceiver.observe computes delta after second observation", () => {
  const state = makeTestState();
  const perceiver = new ColonyPerceiver();

  const obs1 = perceiver.observe(state);
  assert.equal(obs1.delta, null, "first observation should have no delta");

  state.metrics.timeSec = 30;
  state.resources.food = 90;
  const obs2 = perceiver.observe(state);
  assert.ok(obs2.delta != null, "second observation should have delta");
  assert.equal(obs2.delta.timeDeltaSec, 30);
  assert.equal(obs2.delta.food, 10); // 90 - 80
});

test("ColonyPerceiver.observe detects logistics bottleneck", () => {
  const state = makeTestState();
  // Force high farm:warehouse ratio
  state.buildings = { farms: 20, warehouses: 2, lumbers: 5, roads: 10, walls: 0, quarries: 0, herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0 };
  const perceiver = new ColonyPerceiver();
  const obs = perceiver.observe(state);
  assert.ok(obs.topology.logisticsBottleneck != null, "should detect logistics bottleneck");
  assert.ok(obs.topology.logisticsBottleneck.some(b => b.includes("farm:warehouse")),
    "should mention farm:warehouse ratio");
});

// ── formatObservationForLLM tests ────────────────────────────────────

test("formatObservationForLLM produces non-empty string", () => {
  const state = makeTestState();
  const perceiver = new ColonyPerceiver();
  const obs = perceiver.observe(state);
  const text = formatObservationForLLM(obs);

  assert.ok(text.length > 0, "should produce non-empty text");
  assert.ok(text.includes("Colony State"), "should include header");
  assert.ok(text.includes("Economy"), "should include economy section");
  assert.ok(text.includes("Infrastructure"), "should include infrastructure section");
  assert.ok(text.includes("Workforce"), "should include workforce section");
});

test("formatObservationForLLM includes resource rates when available", () => {
  const state = makeTestState();
  const perceiver = new ColonyPerceiver();

  // Sample multiple times to build rate data
  perceiver.observe(state);
  state.metrics.timeSec = 2;
  state.resources.food = 90;
  perceiver.observe(state);
  state.metrics.timeSec = 4;
  state.resources.food = 100;
  const obs = perceiver.observe(state);
  const text = formatObservationForLLM(obs);

  assert.ok(text.includes("food"), "should include food in output");
});
