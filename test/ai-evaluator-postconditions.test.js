/**
 * PlanEvaluator Phase 5 postconditions (patches 11-13, Living World v0.8.0).
 *
 * Covers:
 *   - depleted_site: producer placed on salinized tile OR tile with
 *     yieldPool < BALANCE.yieldPoolDepletedThreshold (default 60).
 *   - density_saturated: placement pushes a warehouse's producer-count density
 *     above BALANCE.warehouseDensityRiskThreshold.
 *   - riskSpoilage: haul chain transit time > spoilage half-life.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PlanEvaluator,
  checkDensityPostcondition,
  checkDepletedSitePostcondition,
  checkSpoilagePostcondition,
  runPlanPostconditions,
} from "../src/simulation/ai/colony/PlanEvaluator.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";
import { TILE } from "../src/config/constants.js";
import { createTileStateEntry } from "../src/world/grid/Grid.js";

// ── Helpers ──────────────────────────────────────────────────────────
function makeGrid(w = 32, h = 32) {
  const tiles = new Uint8Array(w * h);
  const moisture = new Float32Array(w * h).fill(0.5);
  const elevation = new Float32Array(w * h).fill(0.4);
  return { width: w, height: h, tiles, moisture, elevation, tileState: new Map() };
}

function makeState(overrides = {}) {
  const grid = overrides.grid ?? makeGrid();
  return {
    grid,
    resources: { food: 40, wood: 30, stone: 10, herbs: 5, meals: 0, tools: 0, medicine: 0 },
    workers: [{ tileX: 10, tileZ: 10 }],
    buildings: { warehouses: 1, farms: 0 },
    metrics: { timeSec: 120 },
    prosperity: 30,
    ...overrides,
  };
}

function setTile(grid, ix, iz, type) {
  grid.tiles[iz * grid.width + ix] = type;
}
function setTileState(grid, ix, iz, entry) {
  const idx = iz * grid.width + ix;
  grid.tileState.set(idx, createTileStateEntry(entry));
}

function makeStep(id, action, tile, extra = {}) {
  return {
    id,
    action: typeof action === "string" ? { type: action } : action,
    groundedTile: tile,
    status: "completed",
    predicted_effect: {},
    ...extra,
  };
}

// ── Patch 11 — depleted_site ─────────────────────────────────────────
describe("PlanEvaluator / postconditions / depleted_site (patch 11)", () => {
  it("flags farms placed on salinized tiles", () => {
    const state = makeState();
    setTileState(state.grid, 5, 5, { salinized: 0.9, yieldPool: 100 });
    const plan = { steps: [makeStep(1, "farm", { ix: 5, iz: 5 })] };
    const violations = checkDepletedSitePostcondition(plan, state);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].violatedPostcondition, "depleted_site");
    assert.match(violations[0].detail, /salinized/);
  });

  it("flags lumber placed on tile with yieldPool < 60", () => {
    const state = makeState();
    setTileState(state.grid, 6, 6, { salinized: 0, yieldPool: 40 });
    const plan = { steps: [makeStep(2, "lumber", { ix: 6, iz: 6 })] };
    const violations = checkDepletedSitePostcondition(plan, state);
    assert.equal(violations.length, 1);
    assert.match(violations[0].detail, /low-yield/);
  });

  it("does NOT flag producers on healthy tiles", () => {
    const state = makeState();
    setTileState(state.grid, 7, 7, { salinized: 0, yieldPool: 120 });
    const plan = { steps: [makeStep(3, "farm", { ix: 7, iz: 7 })] };
    const violations = checkDepletedSitePostcondition(plan, state);
    assert.equal(violations.length, 0);
  });

  it("ignores non-producer step types", () => {
    const state = makeState();
    setTileState(state.grid, 8, 8, { salinized: 0.9, yieldPool: 10 });
    const plan = { steps: [makeStep(4, "warehouse", { ix: 8, iz: 8 })] };
    const violations = checkDepletedSitePostcondition(plan, state);
    assert.equal(violations.length, 0);
  });

  it("records violation via MemoryStore when present", () => {
    const state = makeState();
    setTileState(state.grid, 5, 5, { salinized: 0.95, yieldPool: 10 });
    const plan = { steps: [makeStep(1, "farm", { ix: 5, iz: 5 })] };
    const mem = new MemoryStore();
    const result = runPlanPostconditions(plan, state, { goal: "test" }, mem);
    assert.equal(result.postconditionViolations.length, 1);
    const obs = mem.observations;
    assert.equal(obs.length, 1);
    assert.match(obs[0].text, /depleted_site/);
    assert.equal(obs[0].category, "postcondition_violation");
  });
});

// ── Patch 12 — density_saturated ─────────────────────────────────────
describe("PlanEvaluator / postconditions / density_saturated (patch 12)", () => {
  it("flags a farm placement when warehouse density exceeds threshold", () => {
    const grid = makeGrid(32, 32);
    // Place warehouse at (10,10) and saturate it with 8 existing farms
    // within radius 6. avgStockPerTile default 50; threshold 400 ⇒ 9+ producers
    // (9*50=450 > 400) will trigger.
    setTile(grid, 10, 10, TILE.WAREHOUSE);
    const existing = [[10, 11], [10, 12], [10, 13], [11, 10], [12, 10], [13, 10], [9, 10], [10, 9]];
    for (const [x, z] of existing) setTile(grid, x, z, TILE.FARM);

    const state = makeState({ grid });
    const plan = { steps: [makeStep(1, "farm", { ix: 11, iz: 11 })] };
    const violations = checkDensityPostcondition(plan, state);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].violatedPostcondition, "density_saturated");
    assert.match(violations[0].detail, /density/);
  });

  it("does NOT flag a lone farm near an empty warehouse", () => {
    const grid = makeGrid(32, 32);
    setTile(grid, 10, 10, TILE.WAREHOUSE);
    const state = makeState({ grid });
    const plan = { steps: [makeStep(1, "farm", { ix: 11, iz: 10 })] };
    const violations = checkDensityPostcondition(plan, state);
    assert.equal(violations.length, 0);
  });

  it("no-op when no warehouses exist on the map", () => {
    const grid = makeGrid(16, 16);
    const state = makeState({ grid });
    const plan = { steps: [makeStep(1, "farm", { ix: 5, iz: 5 })] };
    assert.equal(checkDensityPostcondition(plan, state).length, 0);
  });
});

// ── Patch 13 — riskSpoilage ──────────────────────────────────────────
describe("PlanEvaluator / postconditions / riskSpoilage (patch 13)", () => {
  it("annotates riskSpoilage=true when haul transit exceeds spoilage half-life", () => {
    const plan = {
      steps: [
        { id: 1, action: { type: "haul", haul: { expectedTransitSec: 200 } } },
      ],
    };
    const spoilage = checkSpoilagePostcondition(plan);
    assert.equal(spoilage.risk, true);
    assert.equal(spoilage.worstStepId, 1);
    assert.ok(spoilage.worstTransitSec >= 200);
  });

  it("annotates riskSpoilage=false for short transits", () => {
    const plan = {
      steps: [
        { id: 1, action: { type: "haul", haul: { expectedTransitSec: 30 } } },
      ],
    };
    const spoilage = checkSpoilagePostcondition(plan);
    assert.equal(spoilage.risk, false);
  });

  it("runPlanPostconditions sets riskSpoilage + spoilageDetail on result", () => {
    const state = makeState();
    const plan = {
      steps: [
        { id: 2, action: { type: "haul", haul: { expectedTransitSec: 300 } } },
      ],
    };
    const result = runPlanPostconditions(plan, state, {});
    assert.equal(result.riskSpoilage, true);
    assert.equal(result.spoilageDetail.worstStepId, 2);
    assert.ok(result.spoilageDetail.limitSec > 0);
  });
});

// ── Integration through PlanEvaluator class ──────────────────────────
describe("PlanEvaluator.evaluatePlan (integration)", () => {
  it("annotates postconditionViolations on the returned plan result", () => {
    const grid = makeGrid();
    // Salinize a farm target tile
    const idx = 6 * grid.width + 6;
    grid.tileState.set(idx, createTileStateEntry({ salinized: 0.92, yieldPool: 5 }));
    const state = makeState({ grid });

    const plan = {
      goal: "expand food",
      steps: [
        {
          id: 1,
          action: { type: "farm" },
          groundedTile: { ix: 6, iz: 6 },
          status: "completed",
          predicted_effect: {},
        },
      ],
      horizon_sec: 60,
    };

    const mem = new MemoryStore();
    const evaluator = new PlanEvaluator(mem);
    const before = { resources: { food: 10, wood: 0, stone: 0, herbs: 0, meals: 0, tools: 0, medicine: 0 }, timeSec: 10 };
    const after = { resources: { food: 12, wood: 0, stone: 0, herbs: 0, meals: 0, tools: 0, medicine: 0 }, timeSec: 30 };

    const result = evaluator.evaluatePlan(plan, before, after, state);
    assert.ok(Array.isArray(result.postconditionViolations));
    assert.equal(result.postconditionViolations.length, 1);
    assert.equal(result.postconditionViolations[0].violatedPostcondition, "depleted_site");
    // Memory store should have an observation for the violation.
    assert.ok(mem.observations.some((o) => /depleted_site/.test(o.text)));
  });
});
