import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STRATEGY,
  guardStrategy,
  StrategicDirector,
} from "../src/simulation/ai/strategic/StrategicDirector.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeState(overrides = {}) {
  return {
    session: { phase: "active" },
    metrics: { timeSec: overrides.timeSec ?? 60, deathsTotal: 0, populationStats: { workers: overrides.workers ?? 12 } },
    resources: { food: overrides.food ?? 80, wood: overrides.wood ?? 70, stone: overrides.stone ?? 10, herbs: overrides.herbs ?? 5, tools: overrides.tools ?? 0, meals: 0 },
    buildings: overrides.buildings ?? { warehouses: 1, farms: 3, lumbers: 2, quarries: 0, herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0, roads: 5, walls: 0 },
    gameplay: { prosperity: overrides.prosperity ?? 40, threat: overrides.threat ?? 20, objectiveIndex: 0, objectives: [{ title: "Test" }], scenario: { family: "test" }, doctrine: "balanced" },
    weather: { current: "clear", season: "summer", seasonProgress: 0.5 },
    ai: { enabled: false },
  };
}

// ── Phase Detection ─────────────────────────────────────────────────────

describe("P2: Enhanced fallback strategy phase detection", () => {
  it("detects bootstrap phase with few farms", () => {
    const director = new StrategicDirector(new MemoryStore());
    const state = makeState({ buildings: { warehouses: 1, farms: 2 } });
    const strat = director.buildFallbackStrategy(state);
    assert.equal(strat.phase, "bootstrap");
    assert.equal(strat.resourceFocus, "food");
    assert.ok(strat.primaryGoal.includes("food"));
  });

  it("detects industrialize phase when farms >= 4 but no quarry", () => {
    const director = new StrategicDirector(new MemoryStore());
    const state = makeState({ buildings: { warehouses: 2, farms: 5, lumbers: 2, quarries: 0, smithies: 0, herbGardens: 0, kitchens: 0, clinics: 0 } });
    const strat = director.buildFallbackStrategy(state);
    assert.equal(strat.phase, "industrialize");
    assert.ok(strat.primaryGoal.includes("quarry") || strat.primaryGoal.includes("tool"));
    assert.ok(strat.constraints.length > 0);
  });

  it("detects industrialize phase for smithy when quarry exists", () => {
    const director = new StrategicDirector(new MemoryStore());
    const state = makeState({ buildings: { warehouses: 2, farms: 5, lumbers: 2, quarries: 1, smithies: 0, herbGardens: 0, kitchens: 0, clinics: 0 } });
    const strat = director.buildFallbackStrategy(state);
    assert.equal(strat.phase, "industrialize");
    assert.ok(strat.primaryGoal.includes("smithy"));
  });

  it("detects process phase when kitchen needed", () => {
    const director = new StrategicDirector(new MemoryStore());
    const state = makeState({ buildings: { warehouses: 2, farms: 7, lumbers: 2, quarries: 1, smithies: 1, herbGardens: 0, kitchens: 0, clinics: 0 } });
    const strat = director.buildFallbackStrategy(state);
    assert.equal(strat.phase, "process");
    assert.ok(strat.primaryGoal.includes("kitchen"));
  });

  it("detects growth phase for mature colony", () => {
    const director = new StrategicDirector(new MemoryStore());
    const state = makeState({ buildings: { warehouses: 3, farms: 8, lumbers: 3, quarries: 1, smithies: 1, herbGardens: 1, kitchens: 1, clinics: 1, roads: 10, walls: 4 } });
    const strat = director.buildFallbackStrategy(state);
    assert.equal(strat.phase, "growth");
    assert.ok(strat.primaryGoal.includes("Expand"));
  });

  it("fortify phase when threat is high", () => {
    const director = new StrategicDirector(new MemoryStore());
    const state = makeState({ threat: 80 });
    const strat = director.buildFallbackStrategy(state);
    assert.equal(strat.phase, "fortify");
    assert.ok(strat.constraints.some(c => c.includes("wall")));
  });
});

// ── Resource Budget ─────────────────────────────────────────────────────

describe("P2: Strategy resource budgets", () => {
  it("survival has minimal wood reserve", () => {
    const director = new StrategicDirector(new MemoryStore());
    const state = makeState({ food: 5, workers: 3 });
    const strat = director.buildFallbackStrategy(state);
    assert.equal(strat.resourceBudget.reserveWood, 5);
    assert.equal(strat.resourceBudget.reserveFood, 0);
  });

  it("industrialize has higher wood reserve", () => {
    const director = new StrategicDirector(new MemoryStore());
    const state = makeState({ buildings: { warehouses: 2, farms: 5, lumbers: 2, quarries: 0, smithies: 0, herbGardens: 0, kitchens: 0, clinics: 0 } });
    const strat = director.buildFallbackStrategy(state);
    assert.ok(strat.resourceBudget.reserveWood >= 10);
  });

  it("growth phase has balanced reserves", () => {
    const director = new StrategicDirector(new MemoryStore());
    const state = makeState({ buildings: { warehouses: 3, farms: 8, lumbers: 3, quarries: 1, smithies: 1, herbGardens: 1, kitchens: 1, clinics: 1 } });
    const strat = director.buildFallbackStrategy(state);
    assert.ok(strat.resourceBudget.reserveWood >= 8);
    assert.ok(strat.resourceBudget.reserveFood >= 15);
  });
});

// ── guardStrategy with P2 fields ────────────────────────────────────────

describe("P2: guardStrategy extended fields", () => {
  it("guards phase enum", () => {
    const result = guardStrategy({ strategy: { phase: "industrialize" } });
    assert.equal(result.strategy.phase, "industrialize");
  });

  it("rejects invalid phase", () => {
    const result = guardStrategy({ strategy: { phase: "invalid_phase" } });
    assert.equal(result.strategy.phase, "bootstrap");
  });

  it("parses primaryGoal", () => {
    const result = guardStrategy({ strategy: { primaryGoal: "Build quarry for stone" } });
    assert.equal(result.strategy.primaryGoal, "Build quarry for stone");
  });

  it("truncates long primaryGoal", () => {
    const long = "x".repeat(200);
    const result = guardStrategy({ strategy: { primaryGoal: long } });
    assert.ok(result.strategy.primaryGoal.length <= 80);
  });

  it("parses constraints array", () => {
    const result = guardStrategy({ strategy: { constraints: ["no farms", "quarry first"] } });
    assert.deepEqual(result.strategy.constraints, ["no farms", "quarry first"]);
  });

  it("limits constraints to 5", () => {
    const result = guardStrategy({ strategy: { constraints: Array(10).fill("rule") } });
    assert.equal(result.strategy.constraints.length, 5);
  });

  it("parses resourceBudget", () => {
    const result = guardStrategy({ strategy: { resourceBudget: { reserveWood: 15, reserveFood: 25 } } });
    assert.equal(result.strategy.resourceBudget.reserveWood, 15);
    assert.equal(result.strategy.resourceBudget.reserveFood, 25);
  });

  it("clamps resource budget", () => {
    const result = guardStrategy({ strategy: { resourceBudget: { reserveWood: -5, reserveFood: 999 } } });
    assert.equal(result.strategy.resourceBudget.reserveWood, 0);
    assert.equal(result.strategy.resourceBudget.reserveFood, 200);
  });

  it("defaults resource budget when missing", () => {
    const result = guardStrategy({ strategy: {} });
    assert.equal(result.strategy.resourceBudget.reserveWood, 8);
    assert.equal(result.strategy.resourceBudget.reserveFood, 15);
  });

  it("accepts stone as resourceFocus", () => {
    const result = guardStrategy({ strategy: { resourceFocus: "stone" } });
    assert.equal(result.strategy.resourceFocus, "stone");
  });
});

// ── Enhanced prompt content ─────────────────────────────────────────────

describe("P2: Enhanced buildPromptContent", () => {
  it("includes building counts", () => {
    const director = new StrategicDirector(new MemoryStore());
    const state = makeState({ buildings: { warehouses: 2, farms: 5, quarries: 1, smithies: 0 } });
    const content = director.buildPromptContent(state);
    const parsed = JSON.parse(content);
    assert.equal(parsed.buildings.warehouses, 2);
    assert.equal(parsed.buildings.farms, 5);
    assert.equal(parsed.buildings.quarries, 1);
  });

  it("includes chain status", () => {
    const director = new StrategicDirector(new MemoryStore());
    const state = makeState({ buildings: { warehouses: 2, farms: 7, quarries: 1, smithies: 0, kitchens: 0, herbGardens: 0, clinics: 0 } });
    const content = director.buildPromptContent(state);
    const parsed = JSON.parse(content);
    assert.equal(parsed.chainStatus.food, "ready_for_kitchen");
    assert.equal(parsed.chainStatus.tools, "ready_for_smithy");
    assert.equal(parsed.chainStatus.medical, "no_herbs");
  });

  it("includes all resource types", () => {
    const director = new StrategicDirector(new MemoryStore());
    const state = makeState({ stone: 15, herbs: 8, tools: 3 });
    const content = director.buildPromptContent(state);
    const parsed = JSON.parse(content);
    assert.equal(parsed.summary.stone, 15);
    assert.equal(parsed.summary.herbs, 8);
    assert.equal(parsed.summary.tools, 3);
  });

  it("includes season in summary", () => {
    const director = new StrategicDirector(new MemoryStore());
    const state = makeState();
    const content = director.buildPromptContent(state);
    const parsed = JSON.parse(content);
    assert.equal(parsed.summary.season, "summer");
  });

  it("includes instructions for LLM", () => {
    const director = new StrategicDirector(new MemoryStore());
    const state = makeState();
    const content = director.buildPromptContent(state);
    const parsed = JSON.parse(content);
    assert.ok(parsed.instructions.includes("phase"));
    assert.ok(parsed.instructions.includes("primaryGoal"));
    assert.ok(parsed.instructions.includes("constraints"));
  });
});
