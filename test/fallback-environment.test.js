// test/fallback-environment.test.js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildEnvironmentFallback } from "../src/simulation/ai/llm/PromptBuilder.js";

function makeSummary(overrides = {}) {
  return {
    simTimeSec: 60,
    resources: { food: 40, wood: 40 },
    population: { workers: 12, visitors: 4, herbivores: 3, predators: 1 },
    buildings: { warehouses: 1, farms: 4, lumbers: 2, roads: 15, walls: 7 },
    objective: { id: "logistics-1", title: "Broken Frontier", progress: 20 },
    gameplay: {
      prosperity: 35,
      threat: 25,
      doctrine: "balanced",
      recovery: { charges: 1, collapseRisk: 10 },
    },
    frontier: {
      connectedRoutes: 0,
      totalRoutes: 1,
      brokenRouteCount: 1,
      unreadyDepotCount: 1,
    },
    weather: { current: "clear", timeLeftSec: 10, pressureScore: 0 },
    traffic: { congestion: 0.3, passableRatio: 0.7 },
    logistics: { overloadedWarehouses: 0 },
    spatialPressure: { eventPressure: 0, weatherPressure: 0 },
    events: [],
    aiMode: "fallback",
    ...overrides,
  };
}

describe("buildEnvironmentFallback", () => {
  it("does NOT generate rain for broken frontier when prosperity < 50", () => {
    const summary = makeSummary();
    const result = buildEnvironmentFallback(summary);
    assert.notEqual(result.weather, "rain", "should not generate rain when colony is struggling");
    assert.notEqual(result.weather, "storm", "should not generate storm when colony is struggling");
  });

  it("does NOT spawn bandit raids when prosperity < 50", () => {
    const summary = makeSummary();
    const result = buildEnvironmentFallback(summary);
    const raids = (result.eventSpawns ?? []).filter((e) => e.type === "banditRaid");
    assert.equal(raids.length, 0, "should not spawn raids on struggling colony");
  });

  it("generates clear weather with trade caravan for moderate prosperity", () => {
    const summary = makeSummary({
      gameplay: { prosperity: 58, threat: 30, recovery: { collapseRisk: 5 } },
    });
    const result = buildEnvironmentFallback(summary);
    assert.equal(result.weather, "clear");
    const caravans = (result.eventSpawns ?? []).filter((e) => e.type === "tradeCaravan");
    assert.ok(caravans.length > 0, "moderate prosperity should get trade caravan");
  });

  it("allows weather pressure when prosperity is high and threat is low", () => {
    const summary = makeSummary({
      gameplay: { prosperity: 75, threat: 20, recovery: { collapseRisk: 0 } },
    });
    const result = buildEnvironmentFallback(summary);
    assert.equal(result.weather, "rain", "thriving colony should receive rain challenge");
    const migrations = (result.eventSpawns ?? []).filter((e) => e.type === "animalMigration");
    assert.ok(migrations.length > 0, "thriving colony should face animal migration");
  });

  it("still triggers recovery lane on critical food", () => {
    const summary = makeSummary({
      resources: { food: 10, wood: 40 },
    });
    const result = buildEnvironmentFallback(summary);
    assert.equal(result.weather, "clear");
    const caravans = (result.eventSpawns ?? []).filter((e) => e.type === "tradeCaravan");
    assert.ok(caravans.length > 0, "should spawn trade caravan for food recovery");
  });

  it("still triggers recovery lane on high collapse risk", () => {
    const summary = makeSummary({
      gameplay: { prosperity: 30, threat: 50, recovery: { collapseRisk: 70 } },
    });
    const result = buildEnvironmentFallback(summary);
    assert.equal(result.weather, "clear");
    const caravans = (result.eventSpawns ?? []).filter((e) => e.type === "tradeCaravan");
    assert.ok(caravans.length > 0, "high collapse risk should spawn trade caravan");
  });
});
