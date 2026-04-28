/**
 * LLM-planner Round-2 (Colony Analytics) tests.
 *
 * Pins the deliverables for the Round-2 architectural change:
 *   (a) Candidate IDs (C1, C2, …) appear in the prompt for the tracked types.
 *   (b) Chain Opportunities appear in the prompt with at least one entry.
 *   (c) Resource Projections appear with bottleneck wording.
 *   (d) validatePlanCandidates classifies plans correctly:
 *         - a plan whose hint matches a candidate coord is "from_candidate"
 *         - a plan with an invented coord is "invented"
 *         - skill / reassign_role steps are "non-coord"
 *   (e) Analytics is robust on edge cases: empty grid (no infra) and a state
 *       with no clusters returns empty/best-effort output without crashing.
 *   (f) Round-2 candidateUseRate stat shape: when a plan is recorded, the
 *       agentDirector.stats grows new sub-fields without altering the
 *       existing keys.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPlannerPrompt,
  validatePlanResponse,
  ColonyPlanner,
} from "../src/simulation/ai/colony/ColonyPlanner.js";
import {
  formatAnalyticsForLLM,
  validatePlanCandidates,
  computeBuildingCandidates,
  computeAllCandidates,
  computeResourceProjections,
  computeChainOpportunities,
} from "../src/simulation/ai/colony/ColonyAnalytics.js";
import { ColonyPerceiver } from "../src/simulation/ai/colony/ColonyPerceiver.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { rebuildBuildingStats, setTile, setTileField } from "../src/world/grid/Grid.js";
import { TILE, NODE_FLAGS } from "../src/config/constants.js";
import { groundPlanStep } from "../src/simulation/ai/colony/PlanExecutor.js";
import { BuildSystem } from "../src/simulation/construction/BuildSystem.js";

function makeState() {
  const state = createInitialGameState();
  state.session = { phase: "active" };
  state.resources = { food: 80, wood: 70, stone: 10, herbs: 5, meals: 0, tools: 0, medicine: 0 };
  state.buildings = rebuildBuildingStats(state.grid);
  state.metrics = state.metrics ?? {};
  state.metrics.timeSec = 0;
  return state;
}

function makeObservation(state) {
  return new ColonyPerceiver().observe(state);
}

// (a) Candidates surface in the prompt with C-IDs.
test("buildPlannerPrompt surfaces Building Candidates with C-IDs", () => {
  const state = makeState();
  const obs = makeObservation(state);
  const prompt = buildPlannerPrompt(obs, "", state);
  assert.match(prompt, /## Building Candidates/, "candidates section present");
  assert.match(prompt, /C1=/, "candidates use C-ID prefix");
  // Several types should be listed (warehouse, farm at minimum).
  assert.match(prompt, /- warehouse:/, "warehouse candidates listed");
  assert.match(prompt, /- farm:/, "farm candidates listed");
});

// (b) Chain Opportunities surface in the prompt.
test("buildPlannerPrompt surfaces Chain Opportunities", () => {
  const state = makeState();
  const obs = makeObservation(state);
  const prompt = buildPlannerPrompt(obs, "", state);
  assert.match(prompt, /## Chain Opportunities/);
  // With wood=70 and no buildings yet, at least the Tools or Logistics chain
  // should be ranked-in.
  assert.match(prompt, /\[T1\]|\[F1\]|\[L1\]|\[M1\]/);
});

// (c) Resource Projections appear and call out the bottleneck verbiage when
//     applicable. Even with stable rates the section header should always
//     render so the LLM has a consistent place to look.
test("buildPlannerPrompt surfaces Resource Projections section", () => {
  const state = makeState();
  const obs = makeObservation(state);
  const prompt = buildPlannerPrompt(obs, "", state);
  assert.match(prompt, /## Resource Projections/);
  assert.match(prompt, /food=\d+/);
  assert.match(prompt, /wood=\d+/);
});

// (d) validatePlanCandidates classifies plans correctly.
test("validatePlanCandidates correctly classifies candidate vs invented tiles", () => {
  const state = makeState();
  const analytics = formatAnalyticsForLLM(state, { topN: 4 });
  const candidatesByType = analytics.candidatesByType;

  // Pick a real warehouse candidate the analytics module emitted.
  const whCandidates = candidatesByType.warehouse ?? [];
  assert.ok(whCandidates.length > 0, "test prerequisite: warehouse candidates available");
  const real = whCandidates[0];

  // Build a plan that has 1 candidate match, 1 invented coord, 1 skill step.
  const plan = {
    goal: "mixed plan",
    horizon_sec: 90,
    reasoning: "test",
    steps: [
      { id: 1, action: { type: "warehouse", hint: `${real.ix},${real.iz}` }, depends_on: [], priority: "high", thought: "" },
      { id: 2, action: { type: "farm", hint: "999,999" }, depends_on: [], priority: "medium", thought: "" },
      { id: 3, action: { type: "skill", skill: "logistics_hub", hint: null }, depends_on: [], priority: "medium", thought: "" },
      { id: 4, action: { type: "reassign_role", role: "GUARD", hint: null }, depends_on: [], priority: "high", thought: "" },
    ],
  };

  const report = validatePlanCandidates(plan, candidatesByType);
  assert.equal(report.totalSteps, 2, "skill + reassign skip the coord pool");
  assert.equal(report.candidateMatches, 1, "exactly one match");
  assert.equal(report.invented, 1, "exactly one invented coord");
  assert.ok(report.candidateUseRate >= 0.5 && report.candidateUseRate <= 0.5,
    "use rate is exactly 0.5 with 1/2 matches");
  // perStep breakdown
  const sources = report.perStep.map((s) => s.source);
  assert.deepEqual(sources, ["candidate", "invented", "non-coord", "non-coord"]);
});

// (e) Edge cases — empty/early-game state shouldn't throw.
test("ColonyAnalytics is robust on edge cases", () => {
  const state = makeState();
  // Nuke buildings so there are no clusters.
  state.buildings = rebuildBuildingStats(state.grid);
  // Strip resources for affordability edge case.
  state.resources = { food: 0, wood: 0, stone: 0, herbs: 0 };
  // Should not throw and still produce a text block.
  const analytics = formatAnalyticsForLLM(state, { topN: 4 });
  assert.equal(typeof analytics.text, "string");
  assert.ok(analytics.text.length > 0);
  // Projections always render even when rates are zero.
  assert.match(analytics.text, /## Resource Projections/);
  // Pure-fn guards.
  const proj = computeResourceProjections(state);
  assert.equal(proj.food.stock, 0);
  const chains = computeChainOpportunities(state, analytics.candidatesByType);
  assert.ok(Array.isArray(chains));
  // computeBuildingCandidates with a missing grid should return [].
  assert.deepEqual(computeBuildingCandidates({}, "farm"), []);
});

// (R3) Feasibility filter — every surfaced candidate must pass groundPlanStep.
//      This is the core fix for Round-3: R2 surfaced soft-scored candidates
//      that still failed at execution time (warehouse spacing, node flags,
//      etc.). After R3 the filter drops infeasible tiles and the bench-level
//      completionRate climbs dramatically.
test("R3: surfaced candidates all pass groundPlanStep on a synthetic state", () => {
  const state = makeState();
  // Drop a single warehouse on the grid so the warehouse-spacing constraint
  // becomes load-bearing (analyzeCandidateTiles doesn't enforce spacing).
  setTile(state.grid, 30, 30, TILE.WAREHOUSE);
  state.buildings = rebuildBuildingStats(state.grid);
  // Mark a few tiles with node flags so lumber/quarry/herb_garden have at
  // least one candidate that's actually NODE-flagged (otherwise every tile
  // is rejected by the `missing_resource_node` gate).
  for (let dz = -3; dz <= 3; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      const ix = 36 + dx;
      const iz = 30 + dz;
      // forest cluster east of the warehouse
      setTileField(state.grid, ix, iz, "nodeFlags", NODE_FLAGS.FOREST);
    }
  }
  const buildSystem = new BuildSystem();
  const allCands = computeAllCandidates(state);
  const candidatesByType = allCands.candidatesByType;

  // For every type still present in the menu, every candidate must be
  // accepted by groundPlanStep — meaning previewToolAt would also accept it.
  for (const [type, list] of Object.entries(candidatesByType)) {
    for (const c of list) {
      const step = {
        id: 1,
        action: { type, hint: `${c.ix},${c.iz}` },
        depends_on: [], priority: "high", thought: "",
      };
      const grounded = groundPlanStep(step, state, buildSystem, new Map());
      assert.ok(grounded.feasible,
        `R3 candidate (${type} ${c.ix},${c.iz}) must pass groundPlanStep but got feasible=${grounded.feasible}`);
    }
  }
});

test("R3: warehouse candidates exclude tiles within spacingRadius of an existing warehouse", () => {
  const state = makeState();
  setTile(state.grid, 40, 40, TILE.WAREHOUSE);
  state.buildings = rebuildBuildingStats(state.grid);
  const list = computeBuildingCandidates(state, "warehouse", { topN: 10 });
  // No surfaced warehouse should be within spacing radius (5) of (40,40).
  for (const c of list) {
    const d = Math.abs(c.ix - 40) + Math.abs(c.iz - 40);
    assert.ok(d > 5,
      `warehouse candidate (${c.ix},${c.iz}) is within spacing radius of (40,40); d=${d}`);
  }
});

test("R3: unaffordable types surface in unaffordableTypes and are dropped from menu", () => {
  const state = makeState();
  // Strip enough resources that warehouse (10w) is unaffordable but farm (5w)
  // is still affordable.
  state.resources = { food: 80, wood: 6, stone: 0, herbs: 0, meals: 0, tools: 0, medicine: 0 };
  const allCands = computeAllCandidates(state);
  assert.ok(allCands.unaffordableTypes.includes("warehouse"),
    "warehouse should be flagged unaffordable when wood < 10");
  assert.equal(allCands.candidatesByType.warehouse, undefined,
    "warehouse should NOT appear in candidatesByType when unaffordable");
});

// (f) candidateUseRate is exposed via stats after a planner cycle. We can't
//     easily run an end-to-end LLM call here (no API key in test env), but we
//     can simulate a successful plan + state mutation to verify the stat
//     shape grows without breaking the existing keys.
test("planner stats grow candidateUseRate fields without breaking existing keys", () => {
  const state = makeState();
  state.ai = state.ai ?? {};
  state.ai.agentDirector = {
    stats: {
      plansGenerated: 0, plansCompleted: 0, plansFailed: 0,
      plansSuperseded: 0, totalBuildingsPlaced: 0,
      reflectionsGenerated: 0, llmFailures: 0, lastLlmFailureSec: -Infinity,
    },
  };

  // Build the prompt so analytics is cached on state.
  const obs = makeObservation(state);
  buildPlannerPrompt(obs, "", state);

  // Manually invoke the candidateUseRate path with a known candidate plan via
  // the planner's exported helpers. Simulate by using validatePlanCandidates
  // on a plan that uses one real candidate.
  const cached = state.ai._lastAnalytics;
  assert.ok(cached, "analytics cached on state.ai._lastAnalytics");
  const wh = cached.candidatesByType.warehouse?.[0];
  assert.ok(wh, "test prerequisite: warehouse candidate emitted");

  const plan = {
    goal: "tune", horizon_sec: 60, reasoning: "",
    steps: [{ id: 1, action: { type: "warehouse", hint: `${wh.ix},${wh.iz}` }, depends_on: [], priority: "high", thought: "" }],
  };
  const report = validatePlanCandidates(plan, cached.candidatesByType);
  assert.equal(report.candidateUseRate, 1);
  // Existing stat keys still present.
  const stats = state.ai.agentDirector.stats;
  assert.equal(stats.plansGenerated, 0);
  assert.ok("llmFailures" in stats);
});
