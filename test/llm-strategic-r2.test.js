import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_STRATEGY,
  StrategicDirector,
} from "../src/simulation/ai/strategic/StrategicDirector.js";
import {
  buildStrategicAnalytics,
  computePriorityCandidates,
  computePhaseCandidates,
  computeBottleneckRank,
  computeROIProjections,
  computeConstraintFlags,
  formatStrategicAnalyticsForLLM,
  validateStrategicPick,
  candidateUseRate,
} from "../src/simulation/ai/strategic/StrategicAnalytics.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";

function makeState(overrides = {}) {
  const base = {
    session: { phase: "active" },
    metrics: { timeSec: 5, deathsTotal: 0, populationStats: { workers: 12 } },
    resources: { food: 80, wood: 50, stone: 0, herbs: 0, tools: 0, meals: 0 },
    gameplay: {
      prosperity: 40, threat: 20, objectiveIndex: 0,
      objectives: [{ title: "Test" }],
      scenario: { family: "test" }, doctrine: "balanced",
      devIndex: 35, devIndexSmoothed: 32,
    },
    weather: { current: "clear" },
    buildings: { farms: 4, lumbers: 1, warehouses: 1, quarries: 0, smithies: 0, kitchens: 0, clinics: 0, herbGardens: 0 },
    ai: { enabled: true, strategy: { ...DEFAULT_STRATEGY } },
    controls: {},
  };
  return Object.assign(base, overrides);
}

// ── Test 1: candidates surface in the LLM prompt ────────────────────────────
test("buildPromptContent includes Computed Signals candidate menus", () => {
  const mem = new MemoryStore();
  const director = new StrategicDirector(mem);
  // Industrialize-ready: farms>=4, warehouse, no quarry → top phase=industrialize
  const state = makeState();
  const promptText = director.buildPromptContent(state);
  const payload = JSON.parse(promptText);

  assert.ok(payload.computedSignals, "payload should include computedSignals block");
  assert.ok(payload.computedSignalsRaw, "payload should include computedSignalsRaw");
  assert.match(payload.computedSignals, /Priority Candidates/);
  assert.match(payload.computedSignals, /Phase Candidates/);
  assert.match(payload.computedSignals, /Bottleneck Rank/);
  assert.match(payload.computedSignals, /ROI Projections/);

  // Industrialize should be ranked top phase here
  const phases = payload.computedSignalsRaw.phases;
  assert.ok(Array.isArray(phases));
  assert.equal(phases[0].value, "industrialize");

  // Stone or tools should be top bottleneck (no quarry)
  const bottlenecks = payload.computedSignalsRaw.bottlenecks;
  assert.ok(Array.isArray(bottlenecks) && bottlenecks.length > 0);
  const top = bottlenecks[0];
  assert.ok(["stone", "tools", "food", "workers"].includes(top.value));

  // Instructions must call out menu picking
  assert.match(payload.instructions, /PICK FROM MENUS/);
  assert.match(payload.instructions, /priorityCandidates|Constraint Flag/);
});

// ── Test 2: validateStrategicPick — LLM-pick honored when valid ─────────────
test("validateStrategicPick honors valid picks and reports candidate use rate", () => {
  const state = makeState();
  const analytics = buildStrategicAnalytics(state);

  const llmStrategy = {
    priority: analytics.priorities[0].value,
    phase: analytics.phases[0].value,
    resourceFocus: analytics.bottlenecks.find((b) => b.focus)?.focus ?? "balanced",
  };

  const validated = validateStrategicPick(llmStrategy, analytics);
  assert.equal(validated.strategy.priority, llmStrategy.priority);
  assert.equal(validated.strategy.phase, llmStrategy.phase);

  const rate = candidateUseRate(validated.picks);
  assert.ok(rate >= 0.66, `candidate use rate should be high when picks match menus, got ${rate}`);
});

// ── Test 3: fallback when LLM violates the candidate menu ───────────────────
test("validateStrategicPick falls back to top-1 candidate when LLM picks invalid value", () => {
  const state = makeState();
  const analytics = buildStrategicAnalytics(state);

  const bogusStrategy = {
    priority: "asdf_nonsense",
    phase: "made_up_phase",
    resourceFocus: "platinum",
  };
  const validated = validateStrategicPick(bogusStrategy, analytics);

  // priority/phase fallback to top-1 candidate
  assert.equal(validated.strategy.priority, analytics.priorities[0].value);
  assert.equal(validated.strategy.phase, analytics.phases[0].value);

  // resourceFocus must be a valid enum value
  assert.ok(["food", "wood", "stone", "balanced"].includes(validated.strategy.resourceFocus));

  // picks should be marked fallback
  assert.equal(validated.picks.priority, "fallback");
  assert.equal(validated.picks.phase, "fallback");
  assert.equal(validated.picks.resourceFocus, "fallback");

  const rate = candidateUseRate(validated.picks);
  assert.equal(rate, 0, "candidateUseRate should be 0 when all 3 picks fell back");
});

// ── Test 4: ROI projection sanity (no NaN, monotone with severity) ──────────
test("computeROIProjections produces finite, severity-monotone gains", () => {
  const lowState = makeState({
    resources: { food: 80, wood: 50, stone: 5, herbs: 0, tools: 4, meals: 0 },
    metrics: { timeSec: 5, deathsTotal: 0, populationStats: { workers: 12 } },
    buildings: { farms: 4, warehouses: 1, quarries: 1, smithies: 0, lumbers: 1, kitchens: 0, clinics: 0, herbGardens: 0 },
  });
  const highState = makeState({
    resources: { food: 5, wood: 0, stone: 0, herbs: 0, tools: 0, meals: 0 },
    metrics: { timeSec: 5, deathsTotal: 8, populationStats: { workers: 2 } },
    buildings: { farms: 1, warehouses: 0, quarries: 0, smithies: 0, lumbers: 0, kitchens: 0, clinics: 0, herbGardens: 0 },
    gameplay: {
      prosperity: 10, threat: 60, objectiveIndex: 0, objectives: [{ title: "T" }],
      scenario: { family: "t" }, doctrine: "balanced", devIndex: 12, devIndexSmoothed: 10,
      raidEscalation: { tier: 2 },
    },
  });

  const lowAnalytics = buildStrategicAnalytics(lowState);
  const highAnalytics = buildStrategicAnalytics(highState);

  const lowROI = computeROIProjections(lowState, lowAnalytics.bottlenecks);
  const highROI = computeROIProjections(highState, highAnalytics.bottlenecks);

  for (const r of [...lowROI, ...highROI]) {
    assert.ok(Number.isFinite(r.expectedDevIndexGain), `gain must be finite: ${JSON.stringify(r)}`);
    assert.ok(r.expectedDevIndexGain >= 0);
    assert.ok(r.expectedDevIndexGain <= 25, `gain capped at 25, got ${r.expectedDevIndexGain}`);
    assert.equal(r.horizonSec, 60);
    assert.ok(typeof r.rationale === "string" && r.rationale.length > 0);
  }

  // Monotonicity: highest-severity state (food crisis + raid + no buildings)
  // should have at least one ROI projection >= the worst-case low-severity one.
  const maxLow = Math.max(0, ...lowROI.map((r) => r.expectedDevIndexGain));
  const maxHigh = Math.max(0, ...highROI.map((r) => r.expectedDevIndexGain));
  assert.ok(maxHigh >= maxLow, `high-severity max ROI (${maxHigh}) should >= low-severity (${maxLow})`);
});

// ── Test 5: constraint flags force-override priority/phase picks ────────────
test("constraint flags force survive/defend/fortify regardless of LLM pick", () => {
  const crisisState = makeState({
    resources: { food: 5, wood: 50, stone: 0, herbs: 0, tools: 0, meals: 0 },
    metrics: { timeSec: 5, deathsTotal: 0, populationStats: { workers: 2 } },
  });
  const flags = computeConstraintFlags(crisisState);
  assert.equal(flags.forceSurvive, true);
  assert.ok(flags.reasons.length > 0);

  const analytics = buildStrategicAnalytics(crisisState);
  // Even if LLM picks 'grow', validateStrategicPick must override to survive
  const validated = validateStrategicPick({ priority: "grow", phase: "growth", resourceFocus: "wood" }, analytics);
  assert.equal(validated.strategy.priority, "survive");
  assert.equal(validated.picks.priority, "forced");

  // Heavy threat → forceFortify
  const raidState = makeState({
    gameplay: {
      prosperity: 40, threat: 90, objectiveIndex: 0, objectives: [{ title: "T" }],
      scenario: { family: "t" }, doctrine: "balanced", devIndex: 35, devIndexSmoothed: 32,
      raidEscalation: { tier: 3 },
    },
  });
  const raidAnalytics = buildStrategicAnalytics(raidState);
  const raidValidated = validateStrategicPick(
    { priority: "grow", phase: "growth", resourceFocus: "wood" },
    raidAnalytics,
  );
  assert.equal(raidValidated.strategy.phase, "fortify");
  assert.equal(raidValidated.strategy.priority, "defend");
});

// ── Test 6: full update() roundtrip — LLM picks land + use rate tracked ─────
test("update() validates LLM picks and tracks state.ai.candidateUseRateAvg", async () => {
  const mem = new MemoryStore();
  const director = new StrategicDirector(mem);
  const state = makeState();
  state.ai.forceStrategicDecision = true;

  const services = {
    llmClient: {
      requestStrategic: async () => ({
        fallback: false,
        data: {
          strategy: {
            // Priority/phase/focus all picked from the candidate menus
            priority: "grow",
            phase: "industrialize",
            resourceFocus: "stone",
            defensePosture: "neutral",
            workerFocus: "balanced",
            expansionDirection: "none",
            environmentPreference: "neutral",
            riskTolerance: 0.5,
            primaryGoal: "Build quarry to unlock tool chain",
            constraints: ["build quarry"],
          },
        },
        model: "test",
        debug: {},
      }),
    },
  };

  director.update(0, state, services);
  await director.pendingPromise;
  director.update(0, state, services);

  assert.equal(state.ai.lastStrategySource, "llm");
  assert.equal(state.ai.strategy.priority, "grow");
  assert.equal(state.ai.strategy.phase, "industrialize");
  assert.equal(state.ai.strategy.resourceFocus, "stone");
  assert.ok(state.ai.strategyPicks);
  assert.ok(typeof state.ai.candidateUseRateAvg === "number");
  assert.ok(state.ai.candidateUseRateAvg >= 0.6, `avg should be high when LLM picks from menu, got ${state.ai.candidateUseRateAvg}`);
});

// ── Test 7a: 'balanced' resourceFocus is always honored as a candidate ─────
test("validateStrategicPick honors 'balanced' resourceFocus even when no bottleneck maps to it", () => {
  const state = makeState({
    resources: { food: 80, wood: 50, stone: 5, herbs: 0, tools: 0, meals: 0 },
    buildings: { farms: 4, warehouses: 1, quarries: 1, smithies: 0, lumbers: 1, kitchens: 0, clinics: 0, herbGardens: 0 },
  });
  const analytics = buildStrategicAnalytics(state);

  const validated = validateStrategicPick(
    { priority: analytics.priorities[0].value, phase: analytics.phases[0].value, resourceFocus: "balanced" },
    analytics,
  );
  assert.equal(validated.strategy.resourceFocus, "balanced");
  // 'balanced' must be treated as a valid candidate pick (not off-menu)
  assert.notEqual(validated.picks.resourceFocus, "off-menu");
});

// ── Test 7: formatter is empty-safe and includes constraint section ─────────
test("formatStrategicAnalyticsForLLM is robust and surfaces constraint flags", () => {
  assert.equal(formatStrategicAnalyticsForLLM(null), "");

  const state = makeState({
    resources: { food: 5, wood: 0, stone: 0, herbs: 0, tools: 0, meals: 0 },
    metrics: { timeSec: 5, deathsTotal: 0, populationStats: { workers: 2 } },
  });
  const analytics = buildStrategicAnalytics(state);
  const block = formatStrategicAnalyticsForLLM(analytics);
  assert.match(block, /Constraint Flags/);
  assert.match(block, /food_crisis/);
  assert.match(block, /forceSurvive/);
});
