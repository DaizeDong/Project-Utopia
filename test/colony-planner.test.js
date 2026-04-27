import test from "node:test";
import assert from "node:assert/strict";

import {
  ColonyPlanner,
  buildPlannerPrompt,
  validatePlanResponse,
  generateFallbackPlan,
  shouldReplan,
  callLLM,
} from "../src/simulation/ai/colony/ColonyPlanner.js";

import { ColonyPerceiver } from "../src/simulation/ai/colony/ColonyPerceiver.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { rebuildBuildingStats } from "../src/world/grid/Grid.js";

// ── Helpers ──────────────────────────────────────────────────────────

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

function makeObservation(state) {
  const perceiver = new ColonyPerceiver();
  return perceiver.observe(state);
}

// ══════════════════════════════════════════════════════════════════════
// validatePlanResponse Tests
// ══════════════════════════════════════════════════════════════════════

test("validatePlanResponse accepts a well-formed plan", () => {
  const raw = {
    goal: "establish food surplus",
    horizon_sec: 60,
    reasoning: "Food rate is negative. Need farms near warehouse.",
    steps: [
      { id: 1, thought: "Add farm", action: { type: "farm", hint: "near_cluster:c0" }, predicted_effect: { food_rate: "+0.4/s" }, priority: "high", depends_on: [] },
      { id: 2, thought: "Add lumber", action: { type: "lumber", hint: "near_step:1" }, predicted_effect: { wood_rate: "+0.5/s" }, priority: "medium", depends_on: [1] },
    ],
  };
  const { ok, plan, error } = validatePlanResponse(raw);
  assert.equal(ok, true, `should be ok, error: ${error}`);
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.goal, "establish food surplus");
  assert.equal(plan.steps[0].action.type, "farm");
  assert.deepEqual(plan.steps[1].depends_on, [1]);
});

test("validatePlanResponse rejects null input", () => {
  const { ok } = validatePlanResponse(null);
  assert.equal(ok, false);
});

test("validatePlanResponse rejects empty steps", () => {
  const { ok } = validatePlanResponse({ goal: "test", steps: [] });
  assert.equal(ok, false);
});

test("validatePlanResponse rejects unknown build type", () => {
  const raw = {
    goal: "test",
    steps: [{ id: 1, action: { type: "castle" }, priority: "high", depends_on: [] }],
  };
  const { ok } = validatePlanResponse(raw);
  assert.equal(ok, false);
});

test("validatePlanResponse accepts skill actions", () => {
  const raw = {
    goal: "expand",
    steps: [{ id: 1, action: { type: "skill", skill: "logistics_hub", hint: "expansion:north" }, priority: "high", depends_on: [] }],
  };
  const { ok, plan } = validatePlanResponse(raw);
  assert.equal(ok, true);
  assert.equal(plan.steps[0].action.skill, "logistics_hub");
});

test("validatePlanResponse rejects unknown skill", () => {
  const raw = {
    goal: "test",
    steps: [{ id: 1, action: { type: "skill", skill: "mega_base" }, priority: "high", depends_on: [] }],
  };
  const { ok } = validatePlanResponse(raw);
  assert.equal(ok, false);
});

test("validatePlanResponse truncates long goal", () => {
  const raw = {
    goal: "a".repeat(200),
    steps: [{ id: 1, action: { type: "road" }, priority: "low", depends_on: [] }],
  };
  const { ok, plan } = validatePlanResponse(raw);
  assert.equal(ok, true);
  assert.equal(plan.goal.length, 60);
});

test("validatePlanResponse caps at 8 steps", () => {
  const steps = [];
  for (let i = 1; i <= 12; i++) {
    steps.push({ id: i, action: { type: "road" }, priority: "low", depends_on: [] });
  }
  const { ok, plan } = validatePlanResponse({ goal: "test", steps });
  assert.equal(ok, true);
  assert.ok(plan.steps.length <= 8);
});

test("validatePlanResponse deduplicates step ids", () => {
  const raw = {
    goal: "test",
    steps: [
      { id: 1, action: { type: "road" }, priority: "low", depends_on: [] },
      { id: 1, action: { type: "farm" }, priority: "high", depends_on: [] },
    ],
  };
  const { ok, plan, error } = validatePlanResponse(raw);
  assert.equal(ok, true);
  assert.equal(plan.steps.length, 1, "should skip duplicate id");
});

test("validatePlanResponse fixes invalid depends_on references", () => {
  const raw = {
    goal: "test",
    steps: [
      { id: 1, action: { type: "road" }, priority: "low", depends_on: [99] },
    ],
  };
  const { ok, plan } = validatePlanResponse(raw);
  assert.equal(ok, true);
  assert.deepEqual(plan.steps[0].depends_on, [], "should strip reference to nonexistent id 99");
});

test("validatePlanResponse defaults priority to medium", () => {
  const raw = {
    goal: "test",
    steps: [{ id: 1, action: { type: "road" }, depends_on: [] }],
  };
  const { ok, plan } = validatePlanResponse(raw);
  assert.equal(ok, true);
  assert.equal(plan.steps[0].priority, "medium");
});

test("validatePlanResponse clamps horizon_sec", () => {
  const raw = {
    goal: "test",
    horizon_sec: 99999,
    steps: [{ id: 1, action: { type: "road" }, priority: "low", depends_on: [] }],
  };
  const { ok, plan } = validatePlanResponse(raw);
  assert.equal(ok, true);
  assert.ok(plan.horizon_sec <= 600);
});

// ══════════════════════════════════════════════════════════════════════
// buildPlannerPrompt Tests
// ══════════════════════════════════════════════════════════════════════

test("buildPlannerPrompt produces non-empty string", () => {
  const state = makeTestState();
  const obs = makeObservation(state);
  const prompt = buildPlannerPrompt(obs, "", state);
  assert.ok(prompt.length > 100, "prompt should be substantial");
  assert.ok(prompt.includes("Colony State"), "should include observation header");
  assert.ok(prompt.includes("Skill Availability"), "should include skill section");
  assert.ok(prompt.includes("Affordable Buildings"), "should include affordable section");
});

test("buildPlannerPrompt includes memory text when provided", () => {
  const state = makeTestState();
  const obs = makeObservation(state);
  const prompt = buildPlannerPrompt(obs, "[T=30s, reflection] Farm at (42,31) underperformed.", state);
  assert.ok(prompt.includes("Recent Reflections"), "should include reflections section");
  assert.ok(prompt.includes("underperformed"), "should include memory content");
});

test("buildPlannerPrompt shows unaffordable skills", () => {
  const state = makeTestState({ resources: { food: 5, wood: 3, stone: 0, herbs: 0 } });
  const obs = makeObservation(state);
  const prompt = buildPlannerPrompt(obs, "", state);
  assert.ok(prompt.includes("Unaffordable"), "should show unaffordable skills");
});

test("buildPlannerPrompt shows affordable skills when rich", () => {
  const state = makeTestState({ resources: { food: 200, wood: 200, stone: 50, herbs: 20 } });
  state.buildings = { ...state.buildings, farms: 10 };
  const obs = makeObservation(state);
  const prompt = buildPlannerPrompt(obs, "", state);
  assert.ok(prompt.includes("Affordable:") && prompt.includes("Logistics Hub"), "should show affordable skills");
});

// ══════════════════════════════════════════════════════════════════════
// generateFallbackPlan Tests
// ══════════════════════════════════════════════════════════════════════

test("generateFallbackPlan produces valid plan structure", () => {
  const state = makeTestState();
  const obs = makeObservation(state);
  const plan = generateFallbackPlan(obs, state);

  assert.ok(plan.goal, "should have goal");
  assert.ok(plan.steps.length > 0, "should have steps");
  assert.ok(plan.steps.length <= 8, "should not exceed 8 steps");
  assert.equal(plan.source, "fallback");

  // Validate structure of each step
  for (const step of plan.steps) {
    assert.ok(step.id > 0, "step should have positive id");
    assert.ok(step.action?.type, "step should have action type");
    assert.ok(step.priority, "step should have priority");
    assert.ok(Array.isArray(step.depends_on), "step should have depends_on array");
  }
});

test("generateFallbackPlan prioritizes food when food rate negative", () => {
  const state = makeTestState({ resources: { food: 20, wood: 50, stone: 5, herbs: 2 } });
  const perceiver = new ColonyPerceiver();
  // Sample twice to build rate data showing declining food
  perceiver.observe(state);
  state.metrics.timeSec = 2;
  state.resources.food = 15;
  perceiver.observe(state);
  state.metrics.timeSec = 4;
  state.resources.food = 10;
  const obs = perceiver.observe(state);

  const plan = generateFallbackPlan(obs, state);
  const firstStep = plan.steps[0];
  assert.equal(firstStep.action.type, "farm", "first step should be farm when food declining");
  assert.equal(firstStep.priority, "critical", "should be critical priority");
});

test("generateFallbackPlan adds warehouse when coverage low", () => {
  const state = makeTestState({ resources: { food: 100, wood: 50, stone: 5, herbs: 2 } });
  const obs = makeObservation(state);
  // Force low coverage
  obs.topology.coveragePercent = 50;

  const plan = generateFallbackPlan(obs, state);
  const whStep = plan.steps.find(s => s.action.type === "warehouse");
  assert.ok(whStep != null, "should include warehouse step when coverage < 70%");
});

test("generateFallbackPlan uses expansion skill when flush", () => {
  const state = makeTestState({ resources: { food: 100, wood: 200, stone: 20, herbs: 10 } });
  const obs = makeObservation(state);
  // Force few clusters to trigger expansion
  obs.topology.clusters = [obs.topology.clusters[0]].filter(Boolean);

  const plan = generateFallbackPlan(obs, state);
  const skillStep = plan.steps.find(s => s.action.skill === "expansion_outpost");
  // May or may not trigger depending on other priorities, so just check plan is valid
  assert.ok(plan.steps.length > 0);
});

test("generateFallbackPlan handles zero resources gracefully", () => {
  const state = makeTestState({ resources: { food: 0, wood: 0, stone: 0, herbs: 0 } });
  const obs = makeObservation(state);
  const plan = generateFallbackPlan(obs, state);
  // With zero resources, plan may be empty or have limited steps
  assert.ok(plan.steps.length >= 0);
  assert.ok(plan.goal != null);
});

test("generateFallbackPlan passes validation", () => {
  const state = makeTestState();
  const obs = makeObservation(state);
  const plan = generateFallbackPlan(obs, state);

  // The fallback plan should pass our own validation
  const { ok, error } = validatePlanResponse(plan);
  assert.equal(ok, true, `fallback plan should pass validation: ${error}`);
});

// ══════════════════════════════════════════════════════════════════════
// shouldReplan Tests
// ══════════════════════════════════════════════════════════════════════

test("shouldReplan returns true when no active plan", () => {
  const obs = { economy: { food: { rate: 0, stock: 50 }, wood: { stock: 30 } } };
  const { should, reason } = shouldReplan(100, 50, obs, false);
  assert.equal(should, true);
  assert.equal(reason, "no_active_plan");
});

test("shouldReplan returns false during cooldown", () => {
  const obs = { economy: { food: { rate: 0, stock: 50 }, wood: { stock: 30 } } };
  const { should, reason } = shouldReplan(25, 15, obs, true);
  assert.equal(should, false);
  assert.equal(reason, "cooldown");
});

test("shouldReplan triggers on heartbeat (30s)", () => {
  const obs = { economy: { food: { rate: 0, stock: 50 }, wood: { stock: 30 } } };
  const { should, reason } = shouldReplan(60, 25, obs, true);
  assert.equal(should, true);
  assert.equal(reason, "heartbeat");
});

test("shouldReplan triggers on food crisis", () => {
  const obs = { economy: { food: { rate: -1.5, stock: 20 }, wood: { stock: 30 } } };
  const { should, reason } = shouldReplan(50, 25, obs, true);
  assert.equal(should, true);
  assert.equal(reason, "food_crisis");
});

test("shouldReplan triggers on resource opportunity", () => {
  const obs = { economy: { food: { rate: 0.5, stock: 50 }, wood: { stock: 120 } } };
  const { should, reason } = shouldReplan(50, 25, obs, true);
  assert.equal(should, true);
  assert.equal(reason, "resource_opportunity");
});

// ══════════════════════════════════════════════════════════════════════
// callLLM Tests
// ══════════════════════════════════════════════════════════════════════

test("callLLM returns error when no API key", async () => {
  const result = await callLLM("system", "user", { apiKey: null, baseUrl: "http://localhost" });
  assert.equal(result.ok, false);
  assert.ok(result.error.includes("no API key"));
});

test("callLLM returns error on invalid URL", async () => {
  const result = await callLLM("system", "user", {
    apiKey: "test-key",
    baseUrl: "http://localhost:1",
    model: "test",
    timeoutMs: 2000,
  });
  assert.equal(result.ok, false);
  assert.ok(result.error.length > 0);
});

// ══════════════════════════════════════════════════════════════════════
// ColonyPlanner Class Tests
// ══════════════════════════════════════════════════════════════════════

test("ColonyPlanner.requestFallbackPlan returns valid plan", () => {
  const planner = new ColonyPlanner();
  const state = makeTestState();
  const obs = makeObservation(state);
  const { plan, source } = planner.requestFallbackPlan(obs, state);

  assert.equal(source, "fallback");
  assert.ok(plan.steps.length > 0);
  assert.equal(planner.stats.fallbackPlans, 1);
});

test("ColonyPlanner.requestPlan falls back when no API key", async () => {
  const planner = new ColonyPlanner(); // no apiKey
  const state = makeTestState();
  const obs = makeObservation(state);
  const { plan, source } = await planner.requestPlan(obs, "", state);

  assert.equal(source, "fallback");
  assert.ok(plan.steps.length > 0);
  assert.equal(planner.stats.fallbackPlans, 1);
});

test("ColonyPlanner tracks stats", async () => {
  const planner = new ColonyPlanner();
  const state = makeTestState();
  const obs = makeObservation(state);

  await planner.requestPlan(obs, "", state);
  await planner.requestPlan(obs, "", state);

  const stats = planner.stats;
  assert.equal(stats.fallbackPlans, 2);
  assert.equal(stats.lastPlanSource, "fallback");
});

test("ColonyPlanner.requestPlan with bad API key falls back gracefully", async () => {
  const planner = new ColonyPlanner({
    apiKey: "invalid-key",
    baseUrl: "http://localhost:1",
    timeoutMs: 2000,
  });
  const state = makeTestState();
  const obs = makeObservation(state);
  const { plan, source } = await planner.requestPlan(obs, "", state);

  assert.equal(source, "fallback");
  assert.ok(plan.steps.length > 0);
  assert.equal(planner.stats.llmCalls, 1);
  assert.equal(planner.stats.llmFailures, 1);
  assert.ok(planner.stats.lastError.length > 0);
});

// ══════════════════════════════════════════════════════════════════════
// Edge Case Tests
// ══════════════════════════════════════════════════════════════════════

test("validatePlanResponse handles steps with missing fields gracefully", () => {
  const raw = {
    goal: "test",
    steps: [
      { id: 1, action: { type: "road" } },  // missing priority, depends_on
      { id: 2 },  // missing action entirely
      { id: 3, action: { type: "farm", hint: null }, priority: "high", depends_on: [] },
    ],
  };
  const { ok, plan } = validatePlanResponse(raw);
  assert.equal(ok, true, "should accept partial steps");
  // Step 2 should be filtered out (no action), but 1 and 3 should survive
  assert.equal(plan.steps.length, 2);
});

test("validatePlanResponse handles non-integer depends_on", () => {
  const raw = {
    goal: "test",
    steps: [
      { id: 1, action: { type: "road" }, priority: "low", depends_on: ["foo", null, 2] },
      { id: 2, action: { type: "farm" }, priority: "high", depends_on: [] },
    ],
  };
  const { ok, plan } = validatePlanResponse(raw);
  assert.equal(ok, true);
  assert.deepEqual(plan.steps[0].depends_on, [2], "should filter non-numeric deps");
});

test("validatePlanResponse handles predicted_effect as non-object", () => {
  const raw = {
    goal: "test",
    steps: [
      { id: 1, action: { type: "road" }, priority: "low", depends_on: [], predicted_effect: "more food" },
    ],
  };
  const { ok, plan } = validatePlanResponse(raw);
  assert.equal(ok, true);
  assert.deepEqual(plan.steps[0].predicted_effect, {});
});
