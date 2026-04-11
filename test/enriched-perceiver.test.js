import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeResourceChains,
  forecastSeasonImpact,
  summarizePlanHistory,
  formatObservationForLLM,
  ColonyPerceiver,
} from "../src/simulation/ai/colony/ColonyPerceiver.js";
import { TILE, DEFAULT_GRID } from "../src/config/constants.js";

// ── Helpers ──��──────────────────────────────────────────────────────────

function makeGrid(width = 32, height = 32) {
  const tiles = new Uint8Array(width * height);
  return {
    width,
    height,
    tileSize: 1,
    tiles,
    elevation: new Uint8Array(width * height).fill(128),
    moisture: new Uint8Array(width * height).fill(128),
  };
}

function makeState(overrides = {}) {
  const grid = overrides.grid ?? makeGrid();
  return {
    grid,
    resources: { food: 50, wood: 40, stone: 10, herbs: 5, meals: 0, tools: 0, medicine: 0, ...overrides.resources },
    buildings: { warehouses: 1, farms: 3, lumbers: 2, quarries: 0, herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0, roads: 4, walls: 0, bridges: 0, ...overrides.buildings },
    agents: overrides.agents ?? [],
    animals: overrides.animals ?? [],
    weather: overrides.weather ?? { season: "summer", seasonProgress: 0.5, current: "clear", timeLeftSec: 30 },
    gameplay: overrides.gameplay ?? { threat: 10, prosperity: 50, objectives: [], objectiveIndex: 0 },
    metrics: { timeSec: overrides.timeSec ?? 60, populationStats: { workers: 8 } },
    session: { phase: "active" },
    ai: { enabled: true, strategy: { priority: "grow", resourceFocus: "balanced", defensePosture: "neutral", riskTolerance: 0.5, workerFocus: "balanced" }, agentDirector: { planHistory: overrides.planHistory ?? [] } },
  };
}

// ── analyzeResourceChains ───────────────────────────────────────────────

describe("analyzeResourceChains", () => {
  it("detects missing food chain with no farms", () => {
    const state = makeState({ buildings: { farms: 0, kitchens: 0, warehouses: 1 } });
    const chains = analyzeResourceChains(state);
    const food = chains.find(c => c.name === "food");
    assert.ok(food);
    assert.equal(food.bottleneck, "no farms");
    assert.ok(food.nextAction.includes("farm"));
  });

  it("detects kitchen readiness when farms >= 6", () => {
    const state = makeState({ buildings: { farms: 7, kitchens: 0, warehouses: 2 } });
    const chains = analyzeResourceChains(state);
    const food = chains.find(c => c.name === "food");
    assert.equal(food.stages[1].status, "ready");
    assert.ok(food.nextAction.includes("kitchen"));
  });

  it("food chain complete when kitchen exists", () => {
    const state = makeState({ buildings: { farms: 8, kitchens: 1, warehouses: 2 } });
    const chains = analyzeResourceChains(state);
    const food = chains.find(c => c.name === "food");
    assert.equal(food.stages[0].status, "active");
    assert.equal(food.stages[1].status, "active");
    assert.equal(food.bottleneck, null);
  });

  it("detects missing tool chain", () => {
    const state = makeState({ buildings: { quarries: 0, smithies: 0 } });
    const chains = analyzeResourceChains(state);
    const tools = chains.find(c => c.name === "tools");
    assert.equal(tools.bottleneck, "no quarry");
    assert.ok(tools.stages[1].status === "blocked");
  });

  it("detects smithy readiness when quarry exists", () => {
    const state = makeState({ buildings: { quarries: 1, smithies: 0 } });
    const chains = analyzeResourceChains(state);
    const tools = chains.find(c => c.name === "tools");
    assert.equal(tools.bottleneck, "no smithy");
    assert.equal(tools.stages[1].status, "ready");
    assert.ok(tools.nextAction.includes("smithy"));
  });

  it("tool chain complete shows impact info", () => {
    const state = makeState({ buildings: { quarries: 1, smithies: 1 }, resources: { tools: 2 } });
    const chains = analyzeResourceChains(state);
    const tools = chains.find(c => c.name === "tools");
    assert.equal(tools.bottleneck, null);
    assert.ok(tools.impact.includes("15%"));
    assert.ok(tools.impact.includes("2"));
  });

  it("detects missing medical chain", () => {
    const state = makeState({ buildings: { herbGardens: 0, clinics: 0 } });
    const chains = analyzeResourceChains(state);
    const med = chains.find(c => c.name === "medical");
    assert.equal(med.bottleneck, "no herb_garden");
  });

  it("detects clinic readiness with herb_garden", () => {
    const state = makeState({ buildings: { herbGardens: 1, clinics: 0 } });
    const chains = analyzeResourceChains(state);
    const med = chains.find(c => c.name === "medical");
    assert.equal(med.stages[1].status, "ready");
    assert.ok(med.nextAction.includes("clinic"));
  });

  it("returns 3 chains always", () => {
    const chains = analyzeResourceChains(makeState());
    assert.equal(chains.length, 3);
    assert.deepEqual(chains.map(c => c.name), ["food", "tools", "medical"]);
  });
});

// ── forecastSeasonImpact ───────────���────────────────────────────────────

describe("forecastSeasonImpact", () => {
  it("returns null for missing weather", () => {
    assert.equal(forecastSeasonImpact(null), null);
    assert.equal(forecastSeasonImpact({}), null);
  });

  it("computes summer forecast correctly", () => {
    const weather = { season: "summer", seasonProgress: 0.5, current: "drought", timeLeftSec: 20 };
    const forecast = forecastSeasonImpact(weather);
    assert.equal(forecast.current, "summer");
    assert.equal(forecast.currentProgress, 50);
    assert.equal(forecast.remainingSec, 30); // 60 * 0.5
    assert.equal(forecast.next, "autumn");
    assert.ok(forecast.currentImpact.risk.includes("drought"));
    assert.ok(forecast.nextImpact.advice.includes("expansion"));
  });

  it("wraps winter → spring", () => {
    const weather = { season: "winter", seasonProgress: 0.8 };
    const forecast = forecastSeasonImpact(weather);
    assert.equal(forecast.next, "spring");
    assert.equal(forecast.remainingSec, 10); // 50 * 0.2
  });

  it("spring has favorable advice", () => {
    const weather = { season: "spring", seasonProgress: 0.1, current: "clear", timeLeftSec: 40 };
    const forecast = forecastSeasonImpact(weather);
    assert.ok(forecast.currentImpact.advice.includes("farming"));
  });

  it("autumn next impact warns about winter", () => {
    const weather = { season: "autumn", seasonProgress: 0.7, current: "clear", timeLeftSec: 10 };
    const forecast = forecastSeasonImpact(weather);
    assert.equal(forecast.next, "winter");
    assert.ok(forecast.nextImpact.advice.includes("food reserves"));
  });
});

// ── summarizePlanHistory ────────────────────────────────────────────────

describe("summarizePlanHistory", () => {
  it("returns null for empty history", () => {
    assert.equal(summarizePlanHistory([]), null);
    assert.equal(summarizePlanHistory(null), null);
  });

  it("computes success rate correctly", () => {
    const history = [
      { goal: "food", success: true, score: 0.8, completed: 3, total: 4, completedAtSec: 30 },
      { goal: "expand", success: false, score: 0.3, completed: 1, total: 5, completedAtSec: 60, failReason: "blocked" },
      { goal: "food2", success: true, score: 0.9, completed: 4, total: 4, completedAtSec: 90 },
    ];
    const summary = summarizePlanHistory(history);
    assert.equal(summary.totalPlans, 3);
    assert.equal(summary.successRate, 67); // 2/3
    assert.ok(summary.avgScore > 0.6);
  });

  it("identifies top fail reason", () => {
    const history = [
      { goal: "a", success: false, score: 0, failReason: "blocked" },
      { goal: "b", success: false, score: 0, failReason: "blocked" },
      { goal: "c", success: false, score: 0, failReason: "timeout" },
      { goal: "d", success: true, score: 0.8 },
    ];
    const summary = summarizePlanHistory(history);
    assert.ok(summary.topFailReason.includes("blocked"));
    assert.ok(summary.topFailReason.includes("2x"));
  });

  it("limits recent entries", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      goal: `plan_${i}`, success: true, score: 0.7, completed: 3, total: 4, completedAtSec: i * 30,
    }));
    const summary = summarizePlanHistory(history, 3);
    assert.equal(summary.recent.length, 3);
    assert.equal(summary.recent[0].goal, "plan_7"); // last 3
  });
});

// ─��� formatObservationForLLM enhanced sections ───────────────────────────

describe("formatObservationForLLM enhanced", () => {
  it("includes resource chain section", () => {
    const obs = {
      timeSec: 60,
      economy: { food: { stock: 50, rate: 0.4, trend: "rising", projectedZeroSec: null } },
      resourceChains: [
        { name: "food", stages: [{ building: "farm", count: 3, status: "active" }, { building: "kitchen", count: 0, status: "blocked" }], bottleneck: "only 3 farms", nextAction: "build more farms" },
        { name: "tools", stages: [{ building: "quarry", count: 0, status: "missing" }], bottleneck: "no quarry", nextAction: "build quarry" },
      ],
      topology: { totalBuildings: 10, clusters: [], expansionFrontiers: [], coveragePercent: 90, disconnectedWorksites: 0, worksiteTotal: 5, logisticsBottleneck: null },
      buildings: { warehouses: 1, farms: 3, lumbers: 2, quarries: 0, herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0, roads: 4, walls: 0 },
      workforce: { total: 8, allocation: {}, popCap: 20, growthBlockers: [], avgHunger: 0.3, workerEfficiency: 0.8 },
      defense: { threat: 10, wallCoverage: 0, activeSaboteurs: 0 },
      environment: { weather: "clear", weatherRemainingSec: 30, season: "summer", seasonProgress: 0.5 },
      prosperity: 50,
      affordable: { farm: true, lumber: true },
    };
    const text = formatObservationForLLM(obs);
    assert.ok(text.includes("Resource Chains"));
    assert.ok(text.includes("FOOD"));
    assert.ok(text.includes("farm"));
    assert.ok(text.includes("Bottleneck"));
  });

  it("includes season forecast section", () => {
    const obs = {
      timeSec: 60,
      economy: {},
      topology: { totalBuildings: 0, clusters: [], expansionFrontiers: [], coveragePercent: 100, disconnectedWorksites: 0, worksiteTotal: 0, logisticsBottleneck: null },
      buildings: { warehouses: 0, farms: 0, lumbers: 0, quarries: 0, herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0, roads: 0, walls: 0 },
      workforce: { total: 0, allocation: {}, popCap: 8, growthBlockers: [], avgHunger: 0, workerEfficiency: 0 },
      defense: { threat: 0, wallCoverage: 0, activeSaboteurs: 0 },
      environment: { weather: "clear", weatherRemainingSec: 30 },
      seasonForecast: { current: "autumn", currentProgress: 70, remainingSec: 15, next: "winter", nextInSec: 15, currentImpact: { farmMod: "normal", lumberMod: "normal", risk: "storms possible", advice: "good expansion window" }, nextImpact: { farmMod: "-35%", lumberMod: "-15%", risk: "reduced production", advice: "ensure food reserves before winter" } },
      prosperity: 50,
      affordable: {},
    };
    const text = formatObservationForLLM(obs);
    assert.ok(text.includes("autumn"));
    assert.ok(text.includes("winter"));
    assert.ok(text.includes("food reserves"));
  });

  it("includes strategy section", () => {
    const obs = {
      timeSec: 60,
      economy: {},
      topology: { totalBuildings: 0, clusters: [], expansionFrontiers: [], coveragePercent: 100, disconnectedWorksites: 0, worksiteTotal: 0, logisticsBottleneck: null },
      buildings: { warehouses: 0, farms: 0, lumbers: 0, quarries: 0, herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0, roads: 0, walls: 0 },
      workforce: { total: 0, allocation: {}, popCap: 8, growthBlockers: [], avgHunger: 0, workerEfficiency: 0 },
      defense: { threat: 0, wallCoverage: 0, activeSaboteurs: 0 },
      environment: { weather: "clear", weatherRemainingSec: 30 },
      strategy: { priority: "grow", resourceFocus: "food", defensePosture: "neutral", riskTolerance: 0.5, workerFocus: "farm" },
      prosperity: 50,
      affordable: {},
    };
    const text = formatObservationForLLM(obs);
    assert.ok(text.includes("Strategy"));
    assert.ok(text.includes("grow"));
    assert.ok(text.includes("Worker focus: farm"));
  });

  it("includes plan history summary", () => {
    const obs = {
      timeSec: 120,
      economy: {},
      topology: { totalBuildings: 0, clusters: [], expansionFrontiers: [], coveragePercent: 100, disconnectedWorksites: 0, worksiteTotal: 0, logisticsBottleneck: null },
      buildings: { warehouses: 0, farms: 0, lumbers: 0, quarries: 0, herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0, roads: 0, walls: 0 },
      workforce: { total: 0, allocation: {}, popCap: 8, growthBlockers: [], avgHunger: 0, workerEfficiency: 0 },
      defense: { threat: 0, wallCoverage: 0, activeSaboteurs: 0 },
      environment: { weather: "clear", weatherRemainingSec: 30 },
      planHistorySummary: { recent: [{ goal: "food prod", success: true, score: 0.85, completed: 3, total: 4 }], totalPlans: 5, successRate: 60, avgScore: 0.65, topFailReason: "blocked (2x)" },
      prosperity: 50,
      affordable: {},
    };
    const text = formatObservationForLLM(obs);
    assert.ok(text.includes("Plan Performance"));
    assert.ok(text.includes("60%"));
    assert.ok(text.includes("blocked"));
    assert.ok(text.includes("food prod"));
  });

  it("shows critical depletion warning", () => {
    const obs = {
      timeSec: 60,
      economy: { food: { stock: 8, rate: -0.5, trend: "declining", projectedZeroSec: 16 } },
      topology: { totalBuildings: 0, clusters: [], expansionFrontiers: [], coveragePercent: 100, disconnectedWorksites: 0, worksiteTotal: 0, logisticsBottleneck: null },
      buildings: { warehouses: 0, farms: 0, lumbers: 0, quarries: 0, herbGardens: 0, kitchens: 0, smithies: 0, clinics: 0, roads: 0, walls: 0 },
      workforce: { total: 0, allocation: {}, popCap: 8, growthBlockers: [], avgHunger: 0, workerEfficiency: 0 },
      defense: { threat: 0, wallCoverage: 0, activeSaboteurs: 0 },
      environment: { weather: "clear", weatherRemainingSec: 30 },
      prosperity: 50,
      affordable: {},
    };
    const text = formatObservationForLLM(obs);
    assert.ok(text.includes("CRITICAL"));
    assert.ok(text.includes("URGENT"));
    assert.ok(text.includes("16s"));
  });
});

// ── Integration: ColonyPerceiver.observe includes new fields ────────────

describe("ColonyPerceiver.observe enriched fields", () => {
  it("observation includes resourceChains", () => {
    const grid = makeGrid();
    // Place a warehouse
    grid.tiles[16 * 32 + 16] = TILE.WAREHOUSE;
    const state = makeState({ grid });
    const perceiver = new ColonyPerceiver();
    const obs = perceiver.observe(state);
    assert.ok(Array.isArray(obs.resourceChains));
    assert.equal(obs.resourceChains.length, 3);
  });

  it("observation includes seasonForecast", () => {
    const state = makeState({ weather: { season: "spring", seasonProgress: 0.3, current: "rain", timeLeftSec: 20 } });
    const perceiver = new ColonyPerceiver();
    const obs = perceiver.observe(state);
    assert.ok(obs.seasonForecast);
    assert.equal(obs.seasonForecast.current, "spring");
    assert.equal(obs.seasonForecast.next, "summer");
  });

  it("observation includes strategy context", () => {
    const state = makeState();
    state.ai.strategy = { priority: "survive", resourceFocus: "food" };
    const perceiver = new ColonyPerceiver();
    const obs = perceiver.observe(state);
    assert.ok(obs.strategy);
    assert.equal(obs.strategy.priority, "survive");
  });

  it("observation includes planHistorySummary", () => {
    const state = makeState({
      planHistory: [
        { goal: "test", success: true, score: 0.8, completed: 3, total: 4, completedAtSec: 30 },
      ],
    });
    const perceiver = new ColonyPerceiver();
    const obs = perceiver.observe(state);
    assert.ok(obs.planHistorySummary);
    assert.equal(obs.planHistorySummary.totalPlans, 1);
    assert.equal(obs.planHistorySummary.successRate, 100);
  });

  it("observation has null seasonForecast without season", () => {
    const state = makeState({ weather: { current: "clear", timeLeftSec: 30 } });
    const perceiver = new ColonyPerceiver();
    const obs = perceiver.observe(state);
    assert.equal(obs.seasonForecast, null);
  });
});
