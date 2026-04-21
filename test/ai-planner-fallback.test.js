import test from "node:test";
import assert from "node:assert/strict";

import {
  scoreFallbackCandidate,
  rankFallbackCandidates,
  candidateHasReachableWarehouse,
  buildPlannerPrompt,
} from "../src/simulation/ai/colony/ColonyPlanner.js";
import { ColonyPerceiver } from "../src/simulation/ai/colony/ColonyPerceiver.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { TILE } from "../src/config/constants.js";
import { toIndex, createTileStateEntry } from "../src/world/grid/Grid.js";

// ── helpers ──────────────────────────────────────────────────────────
function makeTestState() {
  const state = createInitialGameState();
  // Clear to grass so we control the layout deterministically.
  for (let i = 0; i < state.grid.tiles.length; i++) state.grid.tiles[i] = TILE.GRASS;
  state.grid.version = (state.grid.version ?? 0) + 1;
  state.grid.tileState ??= new Map();
  return state;
}

function setTileAt(state, ix, iz, type) {
  const idx = toIndex(ix, iz, state.grid.width);
  state.grid.tiles[idx] = type;
  state.grid.version = (state.grid.version ?? 0) + 1;
}

function setTileStateAt(state, ix, iz, overrides) {
  const idx = toIndex(ix, iz, state.grid.width);
  state.grid.tileState.set(idx, createTileStateEntry(overrides));
  state.grid.tileStateVersion = (state.grid.tileStateVersion ?? 0) + 1;
}

// Build a small roaded colony: warehouse at (10,10), road strip to (15,10).
function buildRoadedColony(state) {
  setTileAt(state, 10, 10, TILE.WAREHOUSE);
  for (let x = 11; x <= 15; x++) setTileAt(state, x, 10, TILE.ROAD);
}

// ── Patch 9 tests ──────────────────────────────────────────────────────
test("scoreFallbackCandidate down-ranks tiles with yieldPool < 60", () => {
  const state = makeTestState();
  buildRoadedColony(state);
  // Candidate at (15, 10) is adjacent to the end of the road strip (roaded).
  setTileStateAt(state, 15, 10, { yieldPool: 30 }); // low pool → depletion penalty
  const { multiplier, reasons } = scoreFallbackCandidate(state.grid, 15, 10);
  assert.ok(multiplier < 1, `expected depletion downrank, got ${multiplier}`);
  assert.ok(reasons.some((r) => r.startsWith("low_pool")),
    `reasons should include low_pool, got ${JSON.stringify(reasons)}`);
});

test("scoreFallbackCandidate rejects salinized tiles with the same multiplier", () => {
  const state = makeTestState();
  buildRoadedColony(state);
  setTileStateAt(state, 15, 10, { yieldPool: 120, salinized: 1 });
  const { multiplier, reasons } = scoreFallbackCandidate(state.grid, 15, 10);
  assert.ok(multiplier <= 0.6, `salinized should apply 0.6 multiplier, got ${multiplier}`);
  assert.ok(reasons.includes("salinized"));
});

// ── Patch 10 tests ─────────────────────────────────────────────────────
test("scoreFallbackCandidate applies isolation penalty when no reachable warehouse", () => {
  const state = makeTestState();
  // Warehouse exists but is far away with no connecting road network.
  setTileAt(state, 5, 5, TILE.WAREHOUSE);
  // Candidate at (40, 40) is nowhere near the warehouse.
  const { multiplier, reasons } = scoreFallbackCandidate(state.grid, 40, 40);
  assert.ok(multiplier <= 0.8, `isolated site should be penalized, got ${multiplier}`);
  assert.ok(reasons.includes("isolated"));
});

test("candidateHasReachableWarehouse returns reachable for road-connected candidate", () => {
  const state = makeTestState();
  buildRoadedColony(state);
  // (15,10) sits at the end of the road strip and is adjacent to ROAD tiles.
  const probe = candidateHasReachableWarehouse(state.grid, 15, 10);
  assert.equal(probe.reachable, true, "end-of-road candidate should reach the warehouse");
  assert.equal(probe.skipped, false);
});

test("candidateHasReachableWarehouse skips the probe on maps with no warehouse", () => {
  const state = makeTestState();
  // No WAREHOUSE tiles placed → early-game map.
  const probe = candidateHasReachableWarehouse(state.grid, 10, 10);
  assert.equal(probe.skipped, true, "probe should short-circuit when no warehouses exist");
  assert.equal(probe.reachable, true, "skipped probes should not apply isolation penalty");
});

test("rankFallbackCandidates orders healthy roaded tiles above depleted isolated ones", () => {
  const state = makeTestState();
  buildRoadedColony(state);
  // Healthy candidate adjacent to the road strip.
  setTileStateAt(state, 15, 10, { yieldPool: 100 });
  // Depleted + isolated candidate far away.
  setTileStateAt(state, 40, 40, { yieldPool: 20 });

  const ranked = rankFallbackCandidates(state.grid, [
    { ix: 15, iz: 10, score: 1 },
    { ix: 40, iz: 40, score: 1 },
  ]);
  assert.equal(ranked[0].ix, 15, "healthy roaded tile should rank first");
  assert.equal(ranked[0].iz, 10);
  assert.ok(ranked[0].score > ranked[1].score,
    `top score ${ranked[0].score} should beat ${ranked[1].score}`);
  // The bad candidate should accumulate both depletion + isolation penalties (0.6 * 0.8 = 0.48).
  assert.ok(ranked[1].multiplier < 0.5,
    `compound penalty expected, got ${ranked[1].multiplier}`);
});

// ── H7 — postcondition violations surfaced into the planner prompt ─────
test("buildPlannerPrompt injects recent postcondition_violation memories", () => {
  const state = makeTestState();
  state.resources = { food: 20, wood: 20, stone: 5, herbs: 2 };
  const perceiver = new ColonyPerceiver();
  const observation = perceiver.observe(state);
  const mem = new MemoryStore();
  mem.addObservation(42, "violatedPostcondition: \"depleted_site\" — farm built on yieldPool=20", "postcondition_violation", 4);
  mem.addObservation(50, "violatedPostcondition: \"density_risk\" — warehouse 7 producers", "postcondition_violation", 4);
  const prompt = buildPlannerPrompt(observation, "", state, "", "", { memoryStore: mem });
  assert.match(prompt, /Last Plan Postcondition Violations/);
  assert.match(prompt, /depleted_site/);
  assert.match(prompt, /density_risk/);
});

test("buildPlannerPrompt renders Strategic State section when gameplay fields set", () => {
  const state = makeTestState();
  state.resources = { food: 20, wood: 20, stone: 5, herbs: 2 };
  state.gameplay = state.gameplay ?? {};
  state.gameplay.strategicGoal = "fortify_and_survive";
  state.gameplay.strategicGoalChain = ["preserve_food_reserve", "maintain_wall_perimeter"];
  state.gameplay.strategicRepairGoal = "rebalance_defense";
  state.ai = state.ai ?? {};
  state.ai.fallbackHints = {
    distributed_layout_hint: {
      issuedAtSec: 1,
      reason: "prime_tile",
      primeTiles: [],
      message: "Consider distributing new producers further from warehouses.",
    },
  };
  const perceiver = new ColonyPerceiver();
  const observation = perceiver.observe(state);
  const prompt = buildPlannerPrompt(observation, "", state, "", "");
  assert.match(prompt, /Strategic State \(Phase 5\)/);
  assert.match(prompt, /fortify_and_survive/);
  assert.match(prompt, /preserve_food_reserve → maintain_wall_perimeter/);
  assert.match(prompt, /rebalance_defense/);
  assert.match(prompt, /Consider distributing/);
});
