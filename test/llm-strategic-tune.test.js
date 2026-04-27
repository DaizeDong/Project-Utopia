import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_STRATEGY,
  StrategicDirector,
  describePhasePreamble,
  synthesizePrimaryGoal,
} from "../src/simulation/ai/strategic/StrategicDirector.js";
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

// ── Test 1: primaryGoal post-validator guarantees non-empty output ──────────
test("update() post-validation guarantees a non-empty primaryGoal even when LLM omits it", async () => {
  const mem = new MemoryStore();
  const director = new StrategicDirector(mem);
  const state = makeState();
  state.ai.forceStrategicDecision = true;

  const services = {
    llmClient: {
      requestStrategic: async () => ({
        fallback: false,
        // Intentionally omit primaryGoal to simulate the bug the user
        // saw in live testing ("Decision shows goal=" empty).
        data: {
          strategy: {
            priority: "grow",
            phase: "industrialize",
            resourceFocus: "stone",
            defensePosture: "neutral",
            workerFocus: "balanced",
            expansionDirection: "none",
            environmentPreference: "neutral",
            riskTolerance: 0.5,
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
  assert.ok(typeof state.ai.strategy.primaryGoal === "string");
  assert.ok(
    state.ai.strategy.primaryGoal.trim().length > 0,
    `primaryGoal must be non-empty after post-validation; got: '${state.ai.strategy.primaryGoal}'`,
  );
  assert.ok(state.ai.strategy.primaryGoal.length <= 80);
});

// ── Test 2: prompt includes phase-aware preamble and primaryGoal requirement
test("buildPromptContent includes phase-aware preamble and primaryGoal requirement", () => {
  const mem = new MemoryStore();
  const director = new StrategicDirector(mem);
  // farms>=4 + warehouse + no quarry → industrialize hint
  const state = makeState();
  const promptText = director.buildPromptContent(state);
  const payload = JSON.parse(promptText);

  assert.ok(payload.phasePreamble, "payload should include phasePreamble block");
  assert.equal(payload.phasePreamble.stage, "industrialize");
  assert.match(
    payload.phasePreamble.hint,
    /quarry|smithy|tools/i,
    "preamble hint should call out the chain investment",
  );
  assert.match(
    payload.instructions,
    /primaryGoal/,
    "instructions must mention primaryGoal",
  );
  assert.match(
    payload.instructions,
    /non-empty|MUST/i,
    "instructions must signal that primaryGoal is required",
  );
  // Bootstrap-stuck fallback scenario should also produce a sensible preamble.
  const earlyState = makeState({
    buildings: { farms: 1, warehouses: 0 },
  });
  const earlyPayload = JSON.parse(director.buildPromptContent(earlyState));
  assert.equal(earlyPayload.phasePreamble.stage, "bootstrap");
});

// ── Test 3: deterministic fallback strategy is unchanged by tuning ──────────
test("buildFallbackStrategy is unchanged: still emits exact known goals for canonical states", () => {
  const mem = new MemoryStore();
  const director = new StrategicDirector(mem);

  const survive = director.buildFallbackStrategy(makeState({
    resources: { food: 5, wood: 50, stone: 0, herbs: 0, tools: 0, meals: 0 },
  }));
  assert.equal(survive.priority, "survive");
  assert.equal(
    survive.primaryGoal,
    "Stabilize food production and prevent colony collapse",
    "fallback survive goal text must remain stable for downstream consumers",
  );

  const defend = director.buildFallbackStrategy(makeState({
    gameplay: { prosperity: 40, threat: 80, objectiveIndex: 0, objectives: [{ title: "T" }], scenario: { family: "t" }, doctrine: "balanced" },
  }));
  assert.equal(defend.priority, "defend");
  assert.equal(defend.phase, "fortify");
  assert.equal(defend.primaryGoal, "Build walls and reduce threat before expanding");

  const grow = director.buildFallbackStrategy(makeState());
  assert.equal(grow.priority, "grow");
  assert.ok(grow.primaryGoal && grow.primaryGoal.length > 0);
});

// ── Bonus: synthesizePrimaryGoal pure unit checks (helps regress on logic) ──
test("synthesizePrimaryGoal returns existing goal when present and a derived one when not", () => {
  const state = makeState();
  // existing — pass through
  const explicit = synthesizePrimaryGoal({ phase: "growth", priority: "grow", primaryGoal: "Custom goal already set" }, state);
  assert.equal(explicit, "Custom goal already set");

  // empty → state-derived (farms=4, warehouses=1, no quarry → quarry goal)
  const derived = synthesizePrimaryGoal({ phase: "industrialize", priority: "grow", primaryGoal: "" }, state);
  assert.match(derived, /quarry/i);
  assert.ok(derived.length > 0 && derived.length <= 80);

  // Survival branch — derived goal mentions food/worker
  const survivalState = makeState({
    resources: { food: 5, wood: 0, stone: 0, herbs: 0, tools: 0, meals: 0 },
  });
  const survivalGoal = synthesizePrimaryGoal({ phase: "bootstrap", priority: "survive", primaryGoal: "" }, survivalState);
  assert.match(survivalGoal, /food|worker|collapse/i);
});

// ── Bonus: describePhasePreamble produces stable structure ──────────────────
test("describePhasePreamble identifies the tools-per-worker bottleneck", () => {
  const preamble = describePhasePreamble({
    farms: 6, quarries: 1, smithies: 1, kitchens: 0,
    clinics: 0, herbGardens: 0, warehouses: 1,
    workers: 20, tools: 5, food: 60, threat: 10,
    devSmoothed: 30, previousPhase: "industrialize",
  });
  assert.equal(preamble.bottleneck, "tools_per_worker");
  assert.equal(preamble.stage, "industrialize");
});
