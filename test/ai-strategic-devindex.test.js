/**
 * StrategicDirector Phase 5 adaptations (patches 14-16, 18).
 *
 * Covers:
 *   - Threat-tier switch to fortify_and_survive when raidEscalation.tier >= 3.
 *   - Survival goal chain published on state.gameplay.strategicGoalChain.
 *   - Opportunity-cost hint (distributed_layout_hint) when prime tiles sit
 *     next to a warehouse and we are NOT in fortify mode.
 *   - DevIndex-aware repair goal: any dim < 50 for >=60 game-seconds emits
 *     rebalance_<dim> on state.gameplay.strategicRepairGoal.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SURVIVAL_GOAL_CHAIN,
  applyPhase5StrategicAdaptations,
  applyThreatTierGoal,
  emitOpportunityCostHint,
  getCurrentThreatTier,
  updateDevIndexRepairGoal,
} from "../src/simulation/ai/strategic/StrategicDirector.js";
import { TILE } from "../src/config/constants.js";
import { createTileStateEntry } from "../src/world/grid/Grid.js";

function makeGrid(w = 16, h = 16) {
  return {
    width: w, height: h,
    tiles: new Uint8Array(w * h),
    moisture: new Float32Array(w * h).fill(0.5),
    elevation: new Float32Array(w * h).fill(0.4),
    tileState: new Map(),
  };
}

function makeState(overrides = {}) {
  return {
    grid: overrides.grid ?? makeGrid(),
    ai: {},
    gameplay: { raidEscalation: { tier: 0 }, devIndexDims: {} },
    metrics: { timeSec: 100 },
    ...overrides,
  };
}

// ── Patch 14/15 — threat tier goal switch ────────────────────────────
describe("StrategicDirector / threat-tier (patches 14, 15)", () => {
  it("stays on economic_growth when raid tier < 3", () => {
    const state = makeState();
    state.gameplay.raidEscalation.tier = 2;
    const out = applyThreatTierGoal(state);
    assert.equal(out.goal, "economic_growth");
    assert.equal(state.gameplay.strategicGoal, "economic_growth");
    assert.deepEqual(state.gameplay.strategicGoalChain, []);
  });

  it("switches to fortify_and_survive at tier 3", () => {
    const state = makeState();
    state.gameplay.raidEscalation.tier = 3;
    const out = applyThreatTierGoal(state);
    assert.equal(out.goal, "fortify_and_survive");
    assert.equal(state.gameplay.strategicGoal, "fortify_and_survive");
    assert.deepEqual(state.gameplay.strategicGoalChain, [...SURVIVAL_GOAL_CHAIN]);
  });

  it("exposes the ordered survival goal chain", () => {
    assert.deepEqual(SURVIVAL_GOAL_CHAIN, [
      "preserve_food_reserve",
      "maintain_worker_count",
      "maintain_wall_perimeter",
      "repel_raid",
    ]);
  });

  it("getCurrentThreatTier handles missing state fields", () => {
    assert.equal(getCurrentThreatTier({}), 0);
    assert.equal(getCurrentThreatTier({ gameplay: {} }), 0);
    assert.equal(getCurrentThreatTier({ gameplay: { raidEscalation: { tier: 7 } } }), 7);
  });
});

// ── Patch 16 — opportunity-cost hint ─────────────────────────────────
describe("StrategicDirector / opportunity-cost hint (patch 16)", () => {
  it("emits distributed_layout_hint when a prime tile hugs the warehouse", () => {
    const grid = makeGrid(16, 16);
    grid.tiles[5 * grid.width + 5] = TILE.WAREHOUSE;
    // Neighboring GRASS tile with fertility 0.85 ⇒ prime.
    const adjIdx = 5 * grid.width + 6;
    grid.tileState.set(adjIdx, createTileStateEntry({ fertility: 0.85 }));

    const state = makeState({ grid });
    const out = emitOpportunityCostHint(state);
    assert.equal(out.emitted, true);
    assert.ok(state.ai.fallbackHints);
    assert.ok(state.ai.fallbackHints.distributed_layout_hint);
    assert.ok(state.ai.fallbackHints.distributed_layout_hint.primeTiles.length >= 1);
  });

  it("does NOT emit a hint when fertility is low", () => {
    const grid = makeGrid(16, 16);
    grid.tiles[5 * grid.width + 5] = TILE.WAREHOUSE;
    const adjIdx = 5 * grid.width + 6;
    grid.tileState.set(adjIdx, createTileStateEntry({ fertility: 0.4 }));

    const state = makeState({ grid });
    const out = emitOpportunityCostHint(state);
    assert.equal(out.emitted, false);
    assert.equal(state.ai.fallbackHints.distributed_layout_hint, undefined);
  });

  it("suppresses the hint while in fortify_and_survive", () => {
    const grid = makeGrid(16, 16);
    grid.tiles[5 * grid.width + 5] = TILE.WAREHOUSE;
    const adjIdx = 5 * grid.width + 6;
    grid.tileState.set(adjIdx, createTileStateEntry({ fertility: 0.9 }));
    const state = makeState({ grid });
    state.ai.fallbackHints = { distributed_layout_hint: { stale: true } };
    state.gameplay.strategicGoal = "fortify_and_survive";

    const out = emitOpportunityCostHint(state);
    assert.equal(out.emitted, false);
    assert.equal(state.ai.fallbackHints.distributed_layout_hint, undefined);
  });
});

// ── Patch 18 — DevIndex-aware repair goal ────────────────────────────
describe("StrategicDirector / DevIndex repair goal (patch 18)", () => {
  it("fires rebalance_<dim> after dim stays below 50 for >= 60s", () => {
    const state = makeState();
    state.gameplay.devIndexDims = { economy: 20, population: 80, infrastructure: 70, production: 65, defense: 60, resilience: 55 };
    // Tick 30 seconds — not yet enough.
    updateDevIndexRepairGoal(state, 30);
    assert.equal(state.gameplay.strategicRepairGoal, undefined);
    // Another 35 seconds crosses the 60s threshold.
    updateDevIndexRepairGoal(state, 35);
    assert.equal(state.gameplay.strategicRepairGoal, "rebalance_economy");
  });

  it("clears repair goal once the offending dim recovers", () => {
    const state = makeState();
    state.gameplay.devIndexDims = { economy: 10 };
    updateDevIndexRepairGoal(state, 70);
    assert.equal(state.gameplay.strategicRepairGoal, "rebalance_economy");
    // Dim recovers.
    state.gameplay.devIndexDims.economy = 70;
    updateDevIndexRepairGoal(state, 1);
    assert.equal(state.gameplay.strategicRepairGoal, null);
  });

  it("tracks timer per-dimension independently", () => {
    const state = makeState();
    state.gameplay.devIndexDims = { economy: 10, defense: 40 };
    updateDevIndexRepairGoal(state, 40);
    assert.equal(state.ai.devIndexDimBelow50TimerSec.economy, 40);
    assert.equal(state.ai.devIndexDimBelow50TimerSec.defense, 40);
    // Economy recovers, defense keeps sliding.
    state.gameplay.devIndexDims = { economy: 75, defense: 30 };
    updateDevIndexRepairGoal(state, 30);
    assert.equal(state.ai.devIndexDimBelow50TimerSec.economy, 0);
    assert.equal(state.ai.devIndexDimBelow50TimerSec.defense, 70);
    assert.equal(state.gameplay.strategicRepairGoal, "rebalance_defense");
  });
});

// ── Integration ──────────────────────────────────────────────────────
describe("StrategicDirector.applyPhase5StrategicAdaptations", () => {
  it("publishes all Phase 5 state fields in a single call", () => {
    const grid = makeGrid(16, 16);
    grid.tiles[5 * grid.width + 5] = TILE.WAREHOUSE;
    grid.tileState.set(5 * grid.width + 6, createTileStateEntry({ fertility: 0.92 }));
    const state = makeState({ grid });
    state.gameplay.raidEscalation.tier = 1;
    state.gameplay.devIndexDims = { economy: 80, defense: 30 };

    applyPhase5StrategicAdaptations(state, 70);

    assert.equal(state.gameplay.strategicGoal, "economic_growth");
    assert.ok(state.ai.fallbackHints.distributed_layout_hint);
    assert.equal(state.gameplay.strategicRepairGoal, "rebalance_defense");
  });
});
