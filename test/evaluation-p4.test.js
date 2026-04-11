import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeSystemicBottlenecks,
  detectRecurringPatterns,
  formatEvaluationForLLM,
  evaluatePlan,
  generateReflection,
  PlanEvaluator,
} from "../src/simulation/ai/colony/PlanEvaluator.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";
import { TILE } from "../src/config/constants.js";
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
    workers: overrides.workers ?? [{ tileX: 10, tileZ: 10 }, { tileX: 12, tileZ: 12 }],
    buildings: overrides.buildings ?? { warehouses: 2, farms: 4, lumbers: 3, quarries: 0, smithies: 0, herbGardens: 0, kitchens: 0, clinics: 0 },
    metrics: { timeSec: overrides.timeSec ?? 60 },
    prosperity: overrides.prosperity ?? 30,
    weather: { current: "clear", season: "summer", seasonProgress: 0.5 },
  };
}

function makeStepEval(overrides = {}) {
  return {
    stepId: overrides.stepId ?? 1,
    action: overrides.action ?? "farm",
    buildSuccess: overrides.buildSuccess ?? true,
    success: overrides.success ?? true,
    score: overrides.score ?? 0.9,
    diagnosis: overrides.diagnosis ?? [],
    predicted: overrides.predicted ?? {},
    actual: overrides.actual ?? {},
    deviations: overrides.deviations ?? {},
  };
}

function placeWarehouse(grid, ix, iz) {
  grid.tiles[iz * grid.width + ix] = TILE.WAREHOUSE;
}

// ── analyzeSystemicBottlenecks ──────────────────────────────────────

describe("P4: analyzeSystemicBottlenecks", () => {
  it("returns no issues for healthy evaluations", () => {
    const state = makeState();
    placeWarehouse(state.grid, 10, 10);
    const evals = [
      makeStepEval({ success: true, score: 0.95, diagnosis: [] }),
      makeStepEval({ stepId: 2, success: true, score: 0.9, diagnosis: [] }),
    ];
    const result = analyzeSystemicBottlenecks(evals, state);
    assert.equal(result.coverageIssues, null);
    assert.equal(result.terrainIssues, null);
    assert.equal(result.workerIssues, null);
    assert.equal(result.chainGaps.length, 0);
    assert.ok(result.summary.includes("No systemic issues"));
  });

  it("detects multiple coverage issues", () => {
    const state = makeState();
    const evals = [
      makeStepEval({ success: false, diagnosis: [{ type: "uncovered", detail: "25 tiles", severity: 4 }] }),
      makeStepEval({ stepId: 2, success: false, diagnosis: [{ type: "uncovered", detail: "30 tiles", severity: 4 }] }),
    ];
    const result = analyzeSystemicBottlenecks(evals, state);
    assert.ok(result.coverageIssues);
    assert.equal(result.coverageIssues.count, 2);
    assert.ok(result.coverageIssues.remedy.includes("CRITICAL"));
  });

  it("detects terrain issues", () => {
    const state = makeState();
    const evals = [
      makeStepEval({ diagnosis: [{ type: "poor_terrain", detail: "low moisture 0.15", severity: 3 }] }),
      makeStepEval({ stepId: 2, diagnosis: [{ type: "high_elevation", detail: "elev 0.85", severity: 2 }] }),
    ];
    const result = analyzeSystemicBottlenecks(evals, state);
    assert.ok(result.terrainIssues);
    assert.equal(result.terrainIssues.count, 2);
  });

  it("detects worker coverage issues", () => {
    const state = makeState();
    const evals = [
      makeStepEval({ diagnosis: [{ type: "no_workers", detail: "no workers within 12 tiles", severity: 3 }] }),
      makeStepEval({ stepId: 2, diagnosis: [{ type: "no_workers", detail: "no workers", severity: 3 }] }),
      makeStepEval({ stepId: 3, diagnosis: [{ type: "no_workers", detail: "no workers", severity: 3 }] }),
    ];
    const result = analyzeSystemicBottlenecks(evals, state);
    assert.ok(result.workerIssues);
    assert.equal(result.workerIssues.count, 3);
    assert.ok(result.workerIssues.remedy.includes("CRITICAL"));
  });

  it("computes failure rate", () => {
    const state = makeState();
    const evals = [
      makeStepEval({ success: false }),
      makeStepEval({ stepId: 2, success: false }),
      makeStepEval({ stepId: 3, success: true }),
    ];
    const result = analyzeSystemicBottlenecks(evals, state);
    assert.ok(Math.abs(result.failureRate - 2 / 3) < 0.01);
  });

  it("detects resource chain gaps", () => {
    // Colony has 7 farms but no kitchen — food chain ready for kitchen
    const state = makeState({ buildings: { warehouses: 2, farms: 7, lumbers: 3, quarries: 0, smithies: 0, herbGardens: 0, kitchens: 0, clinics: 0 } });
    // Built more farms but not a kitchen
    const evals = [
      makeStepEval({ action: "farm", buildSuccess: true }),
    ];
    const result = analyzeSystemicBottlenecks(evals, state);
    assert.ok(result.chainGaps.length > 0);
    assert.ok(result.chainGaps[0].chain === "food");
    assert.ok(result.chainGaps[0].remedy.includes("kitchen"));
  });

  it("generates summary with multiple issues", () => {
    const state = makeState();
    const evals = [
      makeStepEval({ diagnosis: [
        { type: "uncovered", detail: "far", severity: 4 },
        { type: "no_workers", detail: "none", severity: 3 },
      ]}),
    ];
    const result = analyzeSystemicBottlenecks(evals, state);
    assert.ok(result.summary.includes("uncovered"));
    assert.ok(result.summary.includes("unserviced"));
  });
});

// ── detectRecurringPatterns ─────────────────────────────────────────

describe("P4: detectRecurringPatterns", () => {
  it("returns empty for short history", () => {
    assert.deepEqual(detectRecurringPatterns([]), []);
    assert.deepEqual(detectRecurringPatterns([{ success: true }]), []);
  });

  it("detects consecutive failure streak", () => {
    const history = [
      { success: false, failReason: "blocked", goal: "expand" },
      { success: false, failReason: "blocked", goal: "expand" },
      { success: false, failReason: "blocked", goal: "expand" },
    ];
    const patterns = detectRecurringPatterns(history);
    assert.ok(patterns.some(p => p.pattern.includes("3 consecutive")));
  });

  it("detects repeated failure reasons", () => {
    const history = [
      { success: false, failReason: "blocked", goal: "food" },
      { success: true, goal: "defense" },
      { success: false, failReason: "blocked", goal: "food" },
    ];
    const patterns = detectRecurringPatterns(history);
    assert.ok(patterns.some(p => p.pattern.includes("blocked")));
  });

  it("detects repeated goal keyword failures", () => {
    const history = [
      { success: false, goal: "expand food production" },
      { success: false, goal: "expand food area" },
      { success: false, goal: "expand food supply" },
    ];
    const patterns = detectRecurringPatterns(history);
    assert.ok(patterns.some(p => p.pattern.includes("food") || p.pattern.includes("expand")));
  });

  it("resets consecutive count on success", () => {
    const history = [
      { success: false, failReason: "blocked", goal: "a" },
      { success: false, failReason: "blocked", goal: "b" },
      { success: true, goal: "c" },
      { success: false, failReason: "blocked", goal: "d" },
    ];
    const patterns = detectRecurringPatterns(history);
    // Only 1 consecutive failure after the success, not 3
    assert.ok(!patterns.some(p => p.pattern.includes("3 consecutive")));
  });

  it("provides remedies for known failure reasons", () => {
    const history = [
      { success: false, failReason: "blocked", goal: "x" },
      { success: false, failReason: "blocked", goal: "y" },
    ];
    const patterns = detectRecurringPatterns(history);
    const blocked = patterns.find(p => p.pattern.includes("blocked"));
    assert.ok(blocked);
    assert.ok(blocked.remedy.includes("resource"));
  });
});

// ── formatEvaluationForLLM ──────────────────────────────────────────

describe("P4: formatEvaluationForLLM", () => {
  it("formats successful plan evaluation", () => {
    const planEval = {
      goal: "food expansion",
      success: true,
      completed: 3,
      total: 3,
      overallScore: 0.92,
      elapsedSec: 40,
      horizonSec: 60,
      timeEfficiency: 1.0,
      resourceChanges: { food: 15, wood: -10 },
    };
    const evals = [makeStepEval()];
    const state = makeState();
    const text = formatEvaluationForLLM(planEval, evals, state);

    assert.ok(text.includes("SUCCESS"));
    assert.ok(text.includes("food expansion"));
    assert.ok(text.includes("3/3"));
    assert.ok(text.includes("food +15"));
  });

  it("formats failed plan with issues", () => {
    const planEval = {
      goal: "quarry setup",
      success: false,
      completed: 1,
      total: 3,
      overallScore: 0.3,
      elapsedSec: 50,
      horizonSec: 60,
      timeEfficiency: 0.83,
      resourceChanges: {},
    };
    const evals = [
      makeStepEval({ success: false, score: 0.2, action: "quarry", diagnosis: [
        { type: "uncovered", detail: "warehouse 20 tiles away", severity: 4 },
      ]}),
    ];
    const state = makeState();
    const text = formatEvaluationForLLM(planEval, evals, state);

    assert.ok(text.includes("FAILED"));
    assert.ok(text.includes("Issues Found"));
    assert.ok(text.includes("warehouse"));
  });

  it("includes systemic issues section", () => {
    const planEval = {
      goal: "test",
      success: false,
      completed: 0,
      total: 2,
      overallScore: 0.1,
      elapsedSec: 30,
      horizonSec: 60,
      timeEfficiency: 1.0,
      resourceChanges: {},
    };
    const evals = [
      makeStepEval({ success: false, score: 0.1, diagnosis: [
        { type: "uncovered", detail: "far", severity: 4 },
      ]}),
      makeStepEval({ stepId: 2, success: false, score: 0.1, diagnosis: [
        { type: "uncovered", detail: "far", severity: 4 },
      ]}),
    ];
    const state = makeState();
    const text = formatEvaluationForLLM(planEval, evals, state);

    assert.ok(text.includes("Systemic Issues"));
    assert.ok(text.includes("COVERAGE"));
  });

  it("includes recurring patterns section", () => {
    const planEval = {
      goal: "test",
      success: false,
      completed: 0,
      total: 1,
      overallScore: 0.1,
      elapsedSec: 30,
      horizonSec: 60,
      timeEfficiency: 1.0,
      resourceChanges: {},
    };
    const evals = [makeStepEval({ success: false })];
    const state = makeState();
    const history = [
      { success: false, failReason: "blocked", goal: "a" },
      { success: false, failReason: "blocked", goal: "b" },
      { success: false, failReason: "blocked", goal: "c" },
    ];
    const text = formatEvaluationForLLM(planEval, evals, state, history);

    assert.ok(text.includes("Recurring Patterns"));
    assert.ok(text.includes("consecutive") || text.includes("blocked"));
  });

  it("produces clean output for perfect plan", () => {
    const planEval = {
      goal: "defense",
      success: true,
      completed: 2,
      total: 2,
      overallScore: 0.95,
      elapsedSec: 20,
      horizonSec: 60,
      timeEfficiency: 1.0,
      resourceChanges: {},
    };
    const evals = [makeStepEval(), makeStepEval({ stepId: 2 })];
    const state = makeState();
    const text = formatEvaluationForLLM(planEval, evals, state);

    assert.ok(text.includes("SUCCESS"));
    // No issues or systemic sections for perfect plans
    assert.ok(!text.includes("Systemic Issues"));
    assert.ok(!text.includes("Recurring Patterns"));
  });
});

// ── PlanEvaluator class P4 methods ──────────────────────────────────

describe("P4: PlanEvaluator class methods", () => {
  it("analyzeSystemicBottlenecks delegates correctly", () => {
    const evaluator = new PlanEvaluator();
    const state = makeState();
    const evals = [makeStepEval()];
    const result = evaluator.analyzeSystemicBottlenecks(evals, state);
    assert.ok(result.summary);
  });

  it("detectRecurringPatterns delegates correctly", () => {
    const evaluator = new PlanEvaluator();
    const history = [
      { success: false, failReason: "blocked", goal: "x" },
      { success: false, failReason: "blocked", goal: "y" },
    ];
    const patterns = evaluator.detectRecurringPatterns(history);
    assert.ok(Array.isArray(patterns));
    assert.ok(patterns.length > 0);
  });

  it("formatEvaluationForLLM delegates correctly", () => {
    const evaluator = new PlanEvaluator();
    const planEval = {
      goal: "test", success: true, completed: 1, total: 1, overallScore: 0.9,
      elapsedSec: 10, horizonSec: 60, timeEfficiency: 1.0, resourceChanges: {},
    };
    const text = evaluator.formatEvaluationForLLM(planEval, [], makeState());
    assert.ok(typeof text === "string");
    assert.ok(text.includes("Last Plan Evaluation"));
  });
});

// ── Integration: evaluation feedback in prompt ──────────────────────

describe("P4: ColonyPlanner.requestPlan accepts evaluationText param", () => {
  it("requestPlan signature accepts 5th argument", async () => {
    // Verify the function signature accepts evaluationText without throwing
    const { ColonyPlanner } = await import("../src/simulation/ai/colony/ColonyPlanner.js");
    const planner = new ColonyPlanner({});
    // Without API key, it falls back to algorithmic — just ensure no signature error
    const result = await planner.requestPlan({}, "", makeState(), "", "## Eval text");
    assert.ok(result);
    assert.equal(result.source, "fallback");
  });

  it("buildPlannerPrompt accepts evaluationText parameter", async () => {
    const { buildPlannerPrompt } = await import("../src/simulation/ai/colony/ColonyPlanner.js");
    assert.equal(typeof buildPlannerPrompt, "function");
    // Verify signature has at least 3 required + 2 optional params
    assert.ok(buildPlannerPrompt.length >= 3);
  });
});

// ── Enhanced reflection quality ─────────────────────────────────────

describe("P4: enhanced reflections include REMEDY", () => {
  it("uncovered reflection includes REMEDY", () => {
    const state = makeState();
    const step = {
      id: 1, action: { type: "farm" },
      groundedTile: { ix: 20, iz: 20 },
      status: "completed",
    };
    const ev = {
      stepId: 1, action: "farm", buildSuccess: true, success: false, score: 0.4,
      diagnosis: [{ type: "uncovered", detail: "warehouse 20 tiles away", severity: 4 }],
    };
    const ref = generateReflection(step, ev, state);
    assert.ok(ref);
    assert.ok(ref.text.includes("REMEDY"));
  });

  it("poor_terrain reflection includes REMEDY", () => {
    const state = makeState();
    const step = {
      id: 1, action: { type: "farm" },
      groundedTile: { ix: 10, iz: 10 },
      status: "completed",
    };
    const ev = {
      stepId: 1, action: "farm", buildSuccess: true, success: false, score: 0.4,
      diagnosis: [{ type: "poor_terrain", detail: "low moisture 0.15", severity: 3 }],
    };
    const ref = generateReflection(step, ev, state);
    assert.ok(ref);
    assert.ok(ref.text.includes("REMEDY"));
  });

  it("no_valid_tile reflection includes REMEDY", () => {
    const state = makeState();
    const step = {
      id: 1, action: { type: "farm" },
      groundedTile: null,
      status: "failed",
    };
    const ev = {
      stepId: 1, action: "farm", buildSuccess: false, success: false, score: 0,
      diagnosis: [{ type: "no_valid_tile", detail: "no valid tile found", severity: 5 }],
    };
    const ref = generateReflection(step, ev, state);
    assert.ok(ref);
    assert.ok(ref.text.includes("REMEDY"));
  });
});
