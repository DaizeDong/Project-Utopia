import test from "node:test";
import assert from "node:assert/strict";

import {
  ColonyPerceiver,
  sampleTileStateAggregates,
  sampleWarehouseDensity,
  sampleCarrySpoilageRisk,
  sampleSurvivalStats,
  sampleNodeInventory,
  sampleFogState,
  sampleDevIndexDims,
  formatObservationForLLM,
} from "../src/simulation/ai/colony/ColonyPerceiver.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { TILE, FOG_STATE, NODE_FLAGS } from "../src/config/constants.js";
import { BALANCE } from "../src/config/balance.js";
import { rebuildBuildingStats, toIndex, createTileStateEntry } from "../src/world/grid/Grid.js";

// ── helpers ──────────────────────────────────────────────────────────
function makeTestState() {
  const state = createInitialGameState();
  state.session = { phase: "active" };
  state.resources = { food: 80, wood: 70, stone: 10, herbs: 5, meals: 0, tools: 0, medicine: 0 };
  state.buildings = rebuildBuildingStats(state.grid);
  state.metrics = state.metrics ?? {};
  state.metrics.timeSec = 0;
  state.metrics.tick = state.metrics.tick ?? 0;
  return state;
}

function setTileAt(state, ix, iz, type) {
  const idx = toIndex(ix, iz, state.grid.width);
  state.grid.tiles[idx] = type;
  state.grid.version = (state.grid.version ?? 0) + 1;
}

function setTileStateAt(state, ix, iz, overrides) {
  state.grid.tileState ??= new Map();
  const idx = toIndex(ix, iz, state.grid.width);
  state.grid.tileState.set(idx, createTileStateEntry(overrides));
  state.grid.tileStateVersion = (state.grid.tileStateVersion ?? 0) + 1;
}

// ── Patch 1: Tile-state aggregates ─────────────────────────────────────
test("sampleTileStateAggregates counts salinized, fallow, depleted and avg pool", () => {
  const state = makeTestState();
  // Reset grid to grass + fresh tileState so pre-existing map content doesn't bias the asserts.
  for (let i = 0; i < state.grid.tiles.length; i++) state.grid.tiles[i] = TILE.GRASS;
  state.grid.tileState = new Map();
  state.grid.version = (state.grid.version ?? 0) + 1;

  // Seed a few farm tiles with varied pool/salinized states.
  setTileAt(state, 5, 5, TILE.FARM);
  setTileStateAt(state, 5, 5, { yieldPool: 100, salinized: 0, fallowUntil: 0 });
  setTileAt(state, 6, 5, TILE.FARM);
  setTileStateAt(state, 6, 5, { yieldPool: 40, salinized: 1, fallowUntil: 0 }); // salinized
  setTileAt(state, 7, 5, TILE.FARM);
  setTileStateAt(state, 7, 5, { yieldPool: 0, salinized: 0, fallowUntil: 200 }); // fallow + depleted
  setTileAt(state, 8, 5, TILE.LUMBER);
  setTileStateAt(state, 8, 5, { yieldPool: 60 });

  const agg = sampleTileStateAggregates(state.grid);
  assert.equal(agg.salinizedCount, 1, "one salinized tile");
  assert.equal(agg.fallowCount, 1, "one fallow tile");
  assert.equal(agg.depletedTileCount, 1, "one depleted tile (yieldPool <= 0)");
  const avgFarm = (100 + 40 + 0) / 3;
  assert.ok(Math.abs(agg.avgYieldPool.farm - avgFarm) < 0.2,
    `avgYieldPool.farm expected ~${avgFarm.toFixed(2)}, got ${agg.avgYieldPool.farm}`);
  assert.equal(agg.avgYieldPool.lumber, 60);
});

// ── Patch 2: Warehouse density ─────────────────────────────────────────
test("sampleWarehouseDensity reports max and risk flag when producers crowd", () => {
  const state = makeTestState();
  // Wipe to grass so the starter map doesn't confound us.
  for (let i = 0; i < state.grid.tiles.length; i++) state.grid.tiles[i] = TILE.GRASS;
  const cx = 20, cz = 20;
  setTileAt(state, cx, cz, TILE.WAREHOUSE);
  const producers = [
    [cx - 1, cz], [cx + 1, cz], [cx, cz - 1], [cx, cz + 1],
    [cx - 2, cz], [cx + 2, cz], [cx, cz - 2], [cx, cz + 2],
  ];
  for (const [x, z] of producers) setTileAt(state, x, z, TILE.FARM);

  const d = sampleWarehouseDensity(state.grid);
  assert.ok(d.maxWarehouseDensity >= Number(BALANCE.warehouseDensityRiskThreshold ?? 400),
    `expected density >= threshold, got ${d.maxWarehouseDensity}`);
  assert.equal(d.densityRiskActive, true, "densityRiskActive must be true at/above threshold");
  assert.equal(d.perWarehouse.length, 1);
  assert.equal(d.perWarehouse[0].producers, 8);
});

test("sampleWarehouseDensity stays below threshold for sparse layout", () => {
  const state = makeTestState();
  for (let i = 0; i < state.grid.tiles.length; i++) state.grid.tiles[i] = TILE.GRASS;
  setTileAt(state, 20, 20, TILE.WAREHOUSE);
  setTileAt(state, 21, 20, TILE.FARM);
  const d = sampleWarehouseDensity(state.grid);
  assert.equal(d.densityRiskActive, false);
  assert.ok(d.maxWarehouseDensity < Number(BALANCE.warehouseDensityRiskThreshold ?? 400));
});

// ── Patch 3: Carry spoilage risk ───────────────────────────────────────
test("sampleCarrySpoilageRisk averages carry age and reads transit counter", () => {
  const workers = [
    { carry: { food: 3, wood: 0, stone: 0, herbs: 0 }, blackboard: { carryAgeSec: 2 } },
    { carry: { food: 0, wood: 5, stone: 0, herbs: 0 }, blackboard: { carryAgeSec: 4 } },
    { carry: { food: 0, wood: 0, stone: 0, herbs: 0 }, blackboard: { carryAgeSec: 10 } }, // empty — ignored
  ];
  const metrics = { spoilageInTransitLastMinute: 7 };
  const out = sampleCarrySpoilageRisk(workers, metrics);
  // (2 + 4) / 2 = 3 seconds → 3 * 30 = 90 ticks
  assert.equal(out.avgCarryAgeTicks, 90);
  assert.equal(out.spoilageInTransitLastMinute, 7);
});

// ── Patch 4: Survival stats ────────────────────────────────────────────
test("sampleSurvivalStats surfaces threat tier, raid seconds, population avg", () => {
  const state = makeTestState();
  state.gameplay.raidEscalation = { tier: 3, intervalTicks: 1800, intensityMultiplier: 1.9, devIndexSample: 45 };
  state.gameplay.lastRaidTick = 0;
  state.metrics.tick = 300; // 10s into an 1800-tick interval
  state.metrics.refinedGoodsProducedTotal = 42;
  state.metrics.lastBirthGameSec = 60;

  const s1 = sampleSurvivalStats(state, 10, 100);
  assert.equal(s1.currentThreatTier, 3);
  // (1800 - 300) / 30 = 50s remaining
  assert.equal(s1.secondsUntilNextRaid, 50);
  assert.equal(s1.refinedGoodsProducedTotal, 42);
  assert.equal(s1.avgPopulationWindow, 10);
  // (100 - 60) / 3600 = 0.011... hours
  assert.ok(s1.hoursSinceLastBirth > 0 && s1.hoursSinceLastBirth < 0.1);

  // Add a second sample to exercise the trailing buffer.
  const s2 = sampleSurvivalStats(state, 14, 110);
  assert.equal(s2.avgPopulationWindow, 12); // (10 + 14) / 2
});

// ── Patch 5: Node inventory ────────────────────────────────────────────
test("sampleNodeInventory lists discovered nodes and utilization ratio", () => {
  const state = makeTestState();
  // Wipe grid + tileState so the default map's pre-existing producer tiles
  // don't pollute our node counts.
  for (let i = 0; i < state.grid.tiles.length; i++) state.grid.tiles[i] = TILE.GRASS;
  state.grid.tileState = new Map();
  state.grid.version = (state.grid.version ?? 0) + 1;

  // Seed two forest nodes (one built, one raw) and one stone node.
  setTileAt(state, 10, 10, TILE.LUMBER);
  setTileStateAt(state, 10, 10, { nodeFlags: NODE_FLAGS.FOREST, yieldPool: 80 });
  setTileAt(state, 12, 10, TILE.GRASS);
  setTileStateAt(state, 12, 10, { nodeFlags: NODE_FLAGS.FOREST, yieldPool: 50 });
  setTileAt(state, 14, 10, TILE.GRASS);
  setTileStateAt(state, 14, 10, { nodeFlags: NODE_FLAGS.STONE, yieldPool: 0 }); // depleted

  const inv = sampleNodeInventory(state.grid);
  assert.equal(inv.knownNodes.forest.length, 2);
  assert.equal(inv.knownNodes.stone.length, 1);
  assert.equal(inv.knownNodes.stone[0].depleted, true);
  // 1 built (LUMBER) ÷ 3 discovered ≈ 0.33
  assert.ok(inv.nodeUtilizationRatio > 0.3 && inv.nodeUtilizationRatio < 0.4,
    `ratio=${inv.nodeUtilizationRatio}`);
  assert.ok(Number.isFinite(inv.nextExhaustionMinutes.forest));
});

// ── Patch 6: Fog state ─────────────────────────────────────────────────
test("sampleFogState reports revealed fraction and boundary length", () => {
  const state = makeTestState();
  const n = state.grid.width * state.grid.height;
  state.fog = { visibility: new Uint8Array(n).fill(FOG_STATE.HIDDEN), version: 1 };
  // Reveal a 3x3 square as EXPLORED.
  for (let iz = 5; iz <= 7; iz++) {
    for (let ix = 5; ix <= 7; ix++) {
      state.fog.visibility[toIndex(ix, iz, state.grid.width)] = FOG_STATE.EXPLORED;
    }
  }
  const fog = sampleFogState(state);
  assert.ok(fog.revealedFraction > 0 && fog.revealedFraction < 0.02,
    `revealed=${fog.revealedFraction}`);
  // Perimeter tiles of the 3x3 are EXPLORED and border HIDDEN on the outside.
  // Inner tile (6,6) is NOT on the boundary (all 4 neighbors are EXPLORED).
  assert.equal(fog.fogBoundaryLength, 8);
});

// ── Patch 7: DevIndex dims ─────────────────────────────────────────────
test("sampleDevIndexDims surfaces per-dim values and saturationIndicator", () => {
  const state = makeTestState();
  state.gameplay.devIndex = 85;
  state.gameplay.devIndexSmoothed = 83;
  state.gameplay.devIndexDims = {
    population: 90, economy: 85, infrastructure: 88,
    production: 92, defense: 81, resilience: 89,
  };
  const d = sampleDevIndexDims(state);
  assert.equal(d.devIndex, 85);
  assert.equal(d.devIndexSmoothed, 83);
  assert.equal(d.saturationIndicator, true, "all dims > 80 must flag saturation");

  // Drop one dim below 80 → saturation should flip off.
  state.gameplay.devIndexDims.defense = 50;
  const d2 = sampleDevIndexDims(state);
  assert.equal(d2.saturationIndicator, false);
});

// ── Integration: formatObservationForLLM renders new fields ─────────────
test("formatObservationForLLM surfaces Living-World Signals section", () => {
  const state = makeTestState();
  state.gameplay.devIndex = 72;
  state.gameplay.devIndexSmoothed = 70;
  state.gameplay.devIndexDims = {
    population: 70, economy: 68, infrastructure: 75,
    production: 65, defense: 60, resilience: 72,
  };
  const perceiver = new ColonyPerceiver();
  const obs = perceiver.observe(state);
  const prompt = formatObservationForLLM(obs);
  assert.match(prompt, /Living-World Signals/);
  assert.match(prompt, /Tile state:/);
  assert.match(prompt, /Warehouse density/);
  assert.match(prompt, /Survival:/);
  assert.match(prompt, /Nodes:/);
  assert.match(prompt, /DevIndex: 72\/100/);
});

test("formatObservationForLLM lists postcondition violations when provided", () => {
  const state = makeTestState();
  const perceiver = new ColonyPerceiver();
  const obs = perceiver.observe(state);
  obs.postconditionViolations = [
    "farm built on depleted tile (yieldPool=20)",
    "warehouse density risk unaddressed",
  ];
  const prompt = formatObservationForLLM(obs);
  assert.match(prompt, /Last Plan Postcondition Violations/);
  assert.match(prompt, /depleted tile/);
  assert.match(prompt, /density risk unaddressed/);
});

// ── Integration: observe() carries all new fields ──────────────────────
test("ColonyPerceiver.observe() emits all new M1-M4 fields", () => {
  const state = makeTestState();
  const perceiver = new ColonyPerceiver();
  const obs = perceiver.observe(state);
  assert.ok(obs.tileState, "tileState block must exist");
  assert.ok(obs.warehouseDensity, "warehouseDensity block must exist");
  assert.ok(obs.spoilage, "spoilage block must exist");
  assert.ok(obs.survival, "survival block must exist");
  assert.ok(obs.nodes, "nodes block must exist");
  assert.ok(obs.fog, "fog block must exist");
  assert.ok(obs.devIndex, "devIndex block must exist");
  // Existing fields still present (backward compat)
  assert.ok(obs.economy, "existing economy block retained");
  assert.ok(obs.topology, "existing topology block retained");
  assert.ok(obs.workforce, "existing workforce block retained");
});
