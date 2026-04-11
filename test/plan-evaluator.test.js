import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parsePredictedValue,
  snapshotState,
  evaluateStep,
  diagnoseFailure,
  generateReflection,
  evaluatePlan,
  PlanEvaluator,
} from "../src/simulation/ai/colony/PlanEvaluator.js";
import { TILE } from "../src/config/constants.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";

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
    resources: { food: 50, wood: 30, stone: 10, herbs: 5, meals: 0, tools: 0, medicine: 0, ...overrides.resources },
    workers: overrides.workers ?? [
      { tileX: 10, tileZ: 10 },
      { tileX: 12, tileZ: 12 },
    ],
    buildings: overrides.buildings ?? { warehouses: 2, farms: 4, lumbers: 3 },
    metrics: { timeSec: overrides.timeSec ?? 60 },
    prosperity: overrides.prosperity ?? 30,
  };
}

function makeStep(overrides = {}) {
  return {
    id: overrides.id ?? 1,
    thought: "test step",
    action: overrides.action ?? { type: "farm", hint: null },
    predicted_effect: overrides.predicted_effect ?? { food_rate_delta: "+0.4/s" },
    priority: "high",
    depends_on: [],
    status: overrides.status ?? "completed",
    groundedTile: "groundedTile" in overrides ? overrides.groundedTile : { ix: 10, iz: 10 },
    actualTile: "actualTile" in overrides ? overrides.actualTile : null,
  };
}

function placeWarehouse(grid, ix, iz) {
  grid.tiles[iz * grid.width + ix] = TILE.WAREHOUSE;
}

// ── parsePredictedValue ──────────────────────────────────────────────

describe("parsePredictedValue", () => {
  it("parses rate values", () => {
    const r = parsePredictedValue("+0.5/s");
    assert.equal(r.numeric, 0.5);
    assert.equal(r.unit, "/s");
  });

  it("parses negative rates", () => {
    const r = parsePredictedValue("-2/s");
    assert.equal(r.numeric, -2);
    assert.equal(r.unit, "/s");
  });

  it("parses percentages", () => {
    const r = parsePredictedValue("+15%");
    assert.equal(r.numeric, 15);
    assert.equal(r.unit, "%");
  });

  it("parses plain numbers", () => {
    const r = parsePredictedValue("-3");
    assert.equal(r.numeric, -3);
    assert.equal(r.unit, "");
  });

  it("handles numeric input", () => {
    const r = parsePredictedValue(42);
    assert.equal(r.numeric, 42);
  });

  it("handles qualitative values", () => {
    const r = parsePredictedValue("improved");
    assert.equal(r.numeric, null);
    assert.equal(r.unit, "improved");
  });

  it("handles null/undefined", () => {
    assert.equal(parsePredictedValue(null).numeric, null);
    assert.equal(parsePredictedValue(undefined).numeric, null);
  });
});

// ── snapshotState ────────────────────────────────────────────────────

describe("snapshotState", () => {
  it("captures resource values", () => {
    const state = makeState({ resources: { food: 100, wood: 50 } });
    const snap = snapshotState(state);
    assert.equal(snap.resources.food, 100);
    assert.equal(snap.resources.wood, 50);
  });

  it("captures time and worker count", () => {
    const state = makeState({ timeSec: 120 });
    state.workers = [{ tileX: 0, tileZ: 0 }, { tileX: 1, tileZ: 1 }, { tileX: 2, tileZ: 2 }];
    const snap = snapshotState(state);
    assert.equal(snap.timeSec, 120);
    assert.equal(snap.workerCount, 3);
  });

  it("handles missing resources gracefully", () => {
    const snap = snapshotState({ resources: {}, metrics: {}, workers: [] });
    assert.equal(snap.resources.food, 0);
    assert.equal(snap.resources.wood, 0);
  });
});

// ── evaluateStep ─────────────────────────────────────────────────────

describe("evaluateStep", () => {
  it("evaluates a successful step with accurate prediction", () => {
    const state = makeState();
    placeWarehouse(state.grid, 8, 8);
    const step = makeStep({ predicted_effect: { food_rate_delta: "+0.4/s" } });
    const before = { resources: { food: 50 }, timeSec: 60 };
    const after = { resources: { food: 50.3 }, timeSec: 62 };
    const ev = evaluateStep(step, before, after, state);
    assert.equal(ev.buildSuccess, true);
    assert.ok(ev.score > 0.5);
  });

  it("evaluates a failed step (status=failed)", () => {
    const state = makeState();
    const step = makeStep({ status: "failed", groundedTile: null });
    const before = { resources: { food: 50 }, timeSec: 60 };
    const after = { resources: { food: 50 }, timeSec: 60 };
    const ev = evaluateStep(step, before, after, state);
    assert.equal(ev.buildSuccess, false);
    assert.equal(ev.score, 0);
    assert.ok(ev.diagnosis.length > 0);
  });

  it("detects prediction mismatch", () => {
    const state = makeState();
    placeWarehouse(state.grid, 8, 8);
    const step = makeStep({ predicted_effect: { food_rate_delta: "+5" } });
    const before = { resources: { food: 50 }, timeSec: 60 };
    const after = { resources: { food: 50.1 }, timeSec: 62 };
    const ev = evaluateStep(step, before, after, state);
    assert.equal(ev.buildSuccess, true);
    // Large deviation → lower score
    assert.ok(ev.score < 1.0);
  });

  it("handles step with qualitative predictions only", () => {
    const state = makeState();
    placeWarehouse(state.grid, 8, 8);
    const step = makeStep({ predicted_effect: { logistics: "improved" } });
    const before = { resources: {}, timeSec: 60 };
    const after = { resources: {}, timeSec: 62 };
    const ev = evaluateStep(step, before, after, state);
    assert.equal(ev.buildSuccess, true);
    assert.equal(ev.score, 1.0); // qualitative → full score
  });

  it("handles step with no predicted effect", () => {
    const state = makeState();
    placeWarehouse(state.grid, 8, 8);
    const step = makeStep({ predicted_effect: {} });
    const before = { resources: {}, timeSec: 60 };
    const after = { resources: {}, timeSec: 62 };
    const ev = evaluateStep(step, before, after, state);
    assert.equal(ev.buildSuccess, true);
    assert.equal(ev.score, 1.0);
  });
});

// ── diagnoseFailure ──────────────────────────────────────────────────

describe("diagnoseFailure", () => {
  it("diagnoses no_valid_tile when groundedTile is null", () => {
    const state = makeState();
    const step = makeStep({ groundedTile: null, status: "failed" });
    const ev = { buildSuccess: false, deviations: {} };
    const causes = diagnoseFailure(step, ev, state);
    assert.ok(causes.some(c => c.type === "no_valid_tile"));
  });

  it("diagnoses uncovered when far from warehouse", () => {
    const state = makeState();
    // No warehouse placed nearby — distance will be Infinity
    const step = makeStep({ groundedTile: { ix: 20, iz: 20 } });
    const ev = { buildSuccess: true, deviations: {} };
    const causes = diagnoseFailure(step, ev, state);
    assert.ok(causes.some(c => c.type === "uncovered"));
  });

  it("diagnoses poor_terrain for farm on dry tile", () => {
    const state = makeState();
    placeWarehouse(state.grid, 10, 10);
    state.grid.moisture[10 * state.grid.width + 10] = 0.1; // very dry
    const step = makeStep({ groundedTile: { ix: 10, iz: 10 } });
    const ev = { buildSuccess: true, deviations: {} };
    const causes = diagnoseFailure(step, ev, state);
    assert.ok(causes.some(c => c.type === "poor_terrain"));
  });

  it("diagnoses no_workers when workers are far", () => {
    const state = makeState();
    placeWarehouse(state.grid, 25, 25);
    state.workers = [{ tileX: 0, tileZ: 0 }]; // only worker far away
    const step = makeStep({ groundedTile: { ix: 25, iz: 25 } });
    const ev = { buildSuccess: true, deviations: {} };
    const causes = diagnoseFailure(step, ev, state);
    assert.ok(causes.some(c => c.type === "no_workers"));
  });

  it("diagnoses adjacency_conflict for quarry near farm", () => {
    const state = makeState();
    placeWarehouse(state.grid, 14, 15);
    state.grid.tiles[15 * state.grid.width + 16] = TILE.FARM; // farm at (16,15)
    const step = makeStep({
      action: { type: "quarry", hint: null },
      groundedTile: { ix: 15, iz: 15 },
    });
    const ev = { buildSuccess: true, deviations: {} };
    const causes = diagnoseFailure(step, ev, state);
    assert.ok(causes.some(c => c.type === "adjacency_conflict"));
  });

  it("diagnoses prediction_mismatch for large deviations", () => {
    const state = makeState();
    placeWarehouse(state.grid, 10, 10);
    const step = makeStep({ groundedTile: { ix: 10, iz: 10 } });
    const ev = { buildSuccess: true, deviations: { food_rate_delta: -2.0 } };
    const causes = diagnoseFailure(step, ev, state);
    assert.ok(causes.some(c => c.type === "prediction_mismatch"));
  });

  it("returns empty for well-placed successful build", () => {
    const state = makeState();
    placeWarehouse(state.grid, 9, 10); // close warehouse
    const step = makeStep({ groundedTile: { ix: 10, iz: 10 } });
    const ev = { buildSuccess: true, deviations: {} };
    const causes = diagnoseFailure(step, ev, state);
    assert.equal(causes.length, 0);
  });
});

// ── generateReflection ───────────────────────────────────────────────

describe("generateReflection", () => {
  it("generates reflection for uncovered building", () => {
    const state = makeState();
    const step = makeStep({ groundedTile: { ix: 20, iz: 20 } });
    const ev = {
      stepId: 1, action: "farm", buildSuccess: true, success: false, score: 0.5,
      diagnosis: [{ type: "uncovered", detail: "nearest warehouse is 25 tiles away", severity: 4 }],
    };
    const ref = generateReflection(step, ev, state);
    assert.ok(ref);
    assert.ok(ref.text.includes("warehouse coverage"));
    assert.equal(ref.category, "construction_reflection");
    assert.ok(ref.importance >= 2);
  });

  it("generates reflection for poor terrain", () => {
    const state = makeState();
    const step = makeStep({ groundedTile: { ix: 10, iz: 10 } });
    const ev = {
      stepId: 1, action: "farm", buildSuccess: true, success: false, score: 0.4,
      diagnosis: [{ type: "poor_terrain", detail: "low moisture (0.15) limits fertility", severity: 3 }],
    };
    const ref = generateReflection(step, ev, state);
    assert.ok(ref);
    assert.equal(ref.category, "terrain_knowledge");
  });

  it("generates reflection for placement failure", () => {
    const state = makeState();
    const step = makeStep({ groundedTile: null, status: "failed" });
    const ev = {
      stepId: 1, action: "farm", buildSuccess: false, success: false, score: 0,
      diagnosis: [{ type: "no_valid_tile", detail: "no valid tile found", severity: 5 }],
    };
    const ref = generateReflection(step, ev, state);
    assert.ok(ref);
    assert.equal(ref.category, "construction_failure");
    assert.equal(ref.importance, 5);
  });

  it("returns null for smooth success", () => {
    const state = makeState();
    const step = makeStep();
    const ev = {
      stepId: 1, action: "farm", buildSuccess: true, success: true, score: 1.0,
      diagnosis: [],
    };
    const ref = generateReflection(step, ev, state);
    assert.equal(ref, null);
  });

  it("generates generic underperformance reflection", () => {
    const state = makeState();
    const step = makeStep();
    const ev = {
      stepId: 1, action: "farm", buildSuccess: true, success: false, score: 0.5,
      diagnosis: [],
    };
    const ref = generateReflection(step, ev, state);
    assert.ok(ref);
    assert.ok(ref.text.includes("scored"));
  });
});

// ── evaluatePlan ─────────────────────────────────────────────────────

describe("evaluatePlan", () => {
  it("evaluates a fully successful plan", () => {
    const plan = {
      goal: "food production",
      horizon_sec: 60,
      steps: [
        { id: 1, status: "completed" },
        { id: 2, status: "completed" },
        { id: 3, status: "completed" },
      ],
    };
    const before = { resources: { food: 50 }, timeSec: 0 };
    const after = { resources: { food: 80 }, timeSec: 45 };
    const state = makeState();
    const ev = evaluatePlan(plan, before, after, state);
    assert.equal(ev.success, true);
    assert.equal(ev.completionRatio, 1.0);
    assert.ok(ev.overallScore > 0.8);
    assert.equal(ev.resourceChanges.food, 30);
  });

  it("evaluates a partially failed plan", () => {
    const plan = {
      goal: "expansion",
      horizon_sec: 60,
      steps: [
        { id: 1, status: "completed" },
        { id: 2, status: "failed" },
        { id: 3, status: "failed" },
      ],
    };
    const before = { resources: { food: 50 }, timeSec: 0 };
    const after = { resources: { food: 45 }, timeSec: 30 };
    const state = makeState();
    const ev = evaluatePlan(plan, before, after, state);
    assert.equal(ev.success, false);
    assert.ok(ev.completionRatio < 0.5);
  });

  it("evaluates an over-time plan", () => {
    const plan = {
      goal: "defense",
      horizon_sec: 30,
      steps: [
        { id: 1, status: "completed" },
        { id: 2, status: "completed" },
      ],
    };
    const before = { resources: {}, timeSec: 0 };
    const after = { resources: {}, timeSec: 90 }; // way over horizon
    const state = makeState();
    const ev = evaluatePlan(plan, before, after, state);
    assert.ok(ev.timeEfficiency < 0.5);
    assert.equal(ev.success, true); // still completed
  });

  it("handles empty plan", () => {
    const plan = { goal: "empty", horizon_sec: 60, steps: [] };
    const before = { resources: {}, timeSec: 0 };
    const after = { resources: {}, timeSec: 10 };
    const state = makeState();
    const ev = evaluatePlan(plan, before, after, state);
    assert.equal(ev.completionRatio, 0);
    assert.equal(ev.success, false);
  });
});

// ── PlanEvaluator class ──────────────────────────────────────────────

describe("PlanEvaluator class", () => {
  it("constructs with default stats", () => {
    const evaluator = new PlanEvaluator();
    const stats = evaluator.stats;
    assert.equal(stats.stepsEvaluated, 0);
    assert.equal(stats.reflectionsGenerated, 0);
  });

  it("evaluateStep updates stats", () => {
    const mem = new MemoryStore();
    const evaluator = new PlanEvaluator(mem);
    const state = makeState();
    placeWarehouse(state.grid, 8, 8);
    const step = makeStep();
    const before = { resources: { food: 50 }, timeSec: 60 };
    const after = { resources: { food: 50.5 }, timeSec: 62 };
    evaluator.evaluateStep(step, before, after, state);
    assert.equal(evaluator.stats.stepsEvaluated, 1);
  });

  it("writes reflection to MemoryStore on failure", () => {
    const mem = new MemoryStore();
    const evaluator = new PlanEvaluator(mem);
    const state = makeState();
    const step = makeStep({ status: "failed", groundedTile: null });
    const before = { resources: {}, timeSec: 60 };
    const after = { resources: {}, timeSec: 60 };
    evaluator.evaluateStep(step, before, after, state);
    assert.ok(evaluator.stats.reflectionsGenerated > 0);
    assert.ok(mem.size > 0);
  });

  it("evaluatePlan updates plan stats", () => {
    const mem = new MemoryStore();
    const evaluator = new PlanEvaluator(mem);
    const plan = {
      goal: "test",
      horizon_sec: 60,
      steps: [{ id: 1, status: "completed" }, { id: 2, status: "completed" }],
    };
    const before = { resources: { food: 50 }, timeSec: 0 };
    const after = { resources: { food: 60 }, timeSec: 30 };
    const state = makeState();
    evaluator.evaluatePlan(plan, before, after, state);
    assert.equal(evaluator.stats.plansEvaluated, 1);
    assert.equal(evaluator.stats.planSuccesses, 1);
  });

  it("evaluatePlan writes reflection on failure", () => {
    const mem = new MemoryStore();
    const evaluator = new PlanEvaluator(mem);
    const plan = {
      goal: "failed plan",
      horizon_sec: 60,
      steps: [{ id: 1, status: "failed" }, { id: 2, status: "failed" }],
    };
    const before = { resources: {}, timeSec: 0 };
    const after = { resources: {}, timeSec: 30 };
    const state = makeState();
    evaluator.evaluatePlan(plan, before, after, state);
    assert.equal(evaluator.stats.planSuccesses, 0);
    assert.ok(mem.size > 0); // reflection written
  });

  it("generatePlanReflections limits output", () => {
    const mem = new MemoryStore();
    const evaluator = new PlanEvaluator(mem);
    const plan = {
      goal: "multi-failure",
      steps: Array.from({ length: 8 }, (_, i) => ({
        id: i + 1,
        action: { type: "farm" },
        groundedTile: { ix: 20, iz: 20 },
        status: "completed",
      })),
    };
    const evals = plan.steps.map(s => ({
      stepId: s.id,
      action: "farm",
      buildSuccess: true,
      success: false,
      score: 0.3,
      diagnosis: [{ type: "uncovered", detail: "too far from warehouse", severity: 4 }],
    }));
    const state = makeState();
    const refs = evaluator.generatePlanReflections(plan, evals, state);
    assert.ok(refs.length <= 5); // MAX_REFLECTIONS_PER_PLAN
    assert.ok(refs.length > 0);
  });
});

// ── Integration: full plan cycle ─────────────────────────────────────

describe("full plan evaluation cycle", () => {
  it("evaluates multiple steps then plan overall", () => {
    const mem = new MemoryStore();
    const evaluator = new PlanEvaluator(mem);
    const state = makeState();
    placeWarehouse(state.grid, 8, 8);

    // Simulate plan with 3 steps
    const plan = {
      goal: "food expansion",
      horizon_sec: 60,
      steps: [
        makeStep({ id: 1, predicted_effect: { food_rate_delta: "+0.4/s" }, groundedTile: { ix: 10, iz: 10 } }),
        makeStep({ id: 2, predicted_effect: { food_rate_delta: "+0.4/s" }, groundedTile: { ix: 11, iz: 10 } }),
        makeStep({ id: 3, status: "failed", groundedTile: null }),
      ],
    };

    // Step evaluations
    const snap0 = { resources: { food: 50 }, timeSec: 0 };
    evaluator.evaluateStep(plan.steps[0], snap0, { resources: { food: 50.3 }, timeSec: 5 }, state);
    evaluator.evaluateStep(plan.steps[1], { resources: { food: 50.3 }, timeSec: 5 }, { resources: { food: 50.6 }, timeSec: 10 }, state);
    evaluator.evaluateStep(plan.steps[2], { resources: { food: 50.6 }, timeSec: 10 }, { resources: { food: 50.6 }, timeSec: 10 }, state);

    // Plan evaluation
    const planEval = evaluator.evaluatePlan(plan, snap0, { resources: { food: 50.6 }, timeSec: 30 }, state);
    assert.equal(evaluator.stats.stepsEvaluated, 3);
    assert.ok(evaluator.stats.reflectionsGenerated > 0);
    assert.ok(planEval.completed >= 2);
  });

  it("reflections are retrievable from MemoryStore", () => {
    const mem = new MemoryStore();
    const evaluator = new PlanEvaluator(mem);
    const state = makeState();

    // Failed step
    const step = makeStep({ status: "failed", groundedTile: null });
    evaluator.evaluateStep(step, { resources: {}, timeSec: 60 }, { resources: {}, timeSec: 60 }, state);

    // Retrieve from memory
    const entries = mem.retrieve("construction farm placement", 60, 5);
    assert.ok(entries.length > 0);
    assert.ok(entries[0].text.includes("farm") || entries[0].text.includes("Farm"));
  });
});
