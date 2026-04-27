// test/llm-environment-tune.test.js
//
// Verifies the LLM-tuning hooks added in EnvironmentDirectorSystem:
// 1. The fragility perception block surfaces all the context fields the
//    LLM needs to make fragility-aware choices.
// 2. Pushing a perception-bearing summary through the legitimate
//    LLMClient + Guardrails + ResponseSchema path does not break
//    validation (the perception is an input-only field).
// 3. The rule-based fallback is unchanged for non-llm coverage — the
//    perception block is a no-op for buildEnvironmentFallback.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildEnvironmentPerception } from "../src/simulation/ai/director/EnvironmentDirectorSystem.js";
import { buildEnvironmentFallback } from "../src/simulation/ai/llm/PromptBuilder.js";
import { buildEnvironmentPromptUserContent } from "../src/simulation/ai/llm/PromptPayload.js";
import { validateEnvironmentDirective } from "../src/simulation/ai/llm/ResponseSchema.js";
import { guardEnvironmentDirective } from "../src/simulation/ai/llm/Guardrails.js";
import { LLMClient } from "../src/simulation/ai/llm/LLMClient.js";

function makeSummary(overrides = {}) {
  return {
    simTimeSec: 60,
    resources: { food: 80, wood: 40, meals: 0 },
    population: { workers: 8, predators: 1 },
    buildings: { warehouses: 1, farms: 2, lumbers: 1 },
    objective: { id: "stockpile-1", title: "Stockpile", progress: 20 },
    gameplay: {
      prosperity: 50,
      threat: 30,
      recovery: { charges: 1, collapseRisk: 5 },
    },
    frontier: { brokenRouteCount: 0, unreadyDepotCount: 0 },
    weather: { current: "clear", timeLeftSec: 10, pressureScore: 0 },
    traffic: { congestion: 0.3, passableRatio: 0.8 },
    logistics: {},
    spatialPressure: {},
    events: [],
    aiMode: "fallback",
    ...overrides,
  };
}

describe("buildEnvironmentPerception (fragility context)", () => {
  it("classifies a healthy colony as 'stable' with empty recommendedWeather", () => {
    const summary = makeSummary({
      resources: { food: 180, wood: 80, meals: 4 },
      buildings: { warehouses: 2, farms: 4 },
      gameplay: { prosperity: 60, threat: 30, recovery: { collapseRisk: 0 } },
      population: { workers: 10, predators: 0 },
    });
    const p = buildEnvironmentPerception(summary);
    assert.equal(p.fragilityLevel, "stable");
    assert.equal(p.raidPosture, "calm");
    assert.deepEqual(p.recommendedWeather, []);
    assert.ok(Array.isArray(p.fragilityRules));
    assert.ok(p.fragilityRules.length > 0);
  });

  it("classifies S1-style food crisis with low farms as 'fragile' and locks events to relief only", () => {
    // S1 stress scenario — food=80 with farms<3 should NOT receive
    // bandit raids or wildfire from the LLM. The perception block
    // shrinks the allowed-events list to just tradeCaravan.
    const summary = makeSummary({
      resources: { food: 80, wood: 40, meals: 0 },
      buildings: { warehouses: 1, farms: 2 },
      gameplay: { prosperity: 60, threat: 30, recovery: { collapseRisk: 5 } },
    });
    const p = buildEnvironmentPerception(summary);
    assert.equal(p.fragilityLevel, "fragile");
    assert.deepEqual(p.recommendedWeather, ["clear"]);
    assert.deepEqual(p.allowedEventsThisCall, ["tradeCaravan"]);
    assert.ok(p.bannedEventsThisCall.includes("banditRaid"));
    assert.ok(p.bannedEventsThisCall.includes("wildfire"));
    assert.ok(p.maxEventIntensity <= 0.6 + 1e-9);
  });

  it("classifies an active raid as 'fragile' raidPosture='active' with intensity ceiling", () => {
    // S2 stress scenario — active banditRaid event + threat=65 must
    // produce raidPosture='active' so the LLM holds back.
    const summary = makeSummary({
      gameplay: { prosperity: 50, threat: 65, recovery: { collapseRisk: 10 } },
      events: [{ type: "banditRaid", severity: "medium", intensity: 1.5 }],
    });
    const p = buildEnvironmentPerception(summary);
    assert.equal(p.raidPosture, "active");
    assert.equal(p.fragilityLevel, "fragile");
    assert.deepEqual(p.recommendedWeather, ["clear"]);
    assert.equal(p.allowedEventsThisCall.length, 1);
    assert.equal(p.allowedEventsThisCall[0], "tradeCaravan");
  });

  it("classifies a critical food collapse with explicit reasons", () => {
    const summary = makeSummary({
      resources: { food: 8, wood: 40, meals: 0 },
      gameplay: { prosperity: 30, threat: 40, recovery: { collapseRisk: 70 } },
    });
    const p = buildEnvironmentPerception(summary);
    assert.equal(p.fragilityLevel, "critical");
    assert.ok(p.fragilityReason.includes("food="));
    assert.ok(p.fragilityReason.includes("collapseRisk="));
    // Critical bans even animalMigration (anything that costs cycles).
    assert.ok(p.bannedEventsThisCall.includes("animalMigration"));
  });
});

describe("perception integrates with the LLMClient prompt path without breaking validation", () => {
  it("buildEnvironmentPromptUserContent embeds the perception JSON in the prompt", () => {
    const summary = makeSummary();
    summary._fragilityPerception = buildEnvironmentPerception(summary);
    const prompt = buildEnvironmentPromptUserContent(summary);
    // The perception is part of the summary which the prompt builder
    // serializes verbatim — the LLM literally sees these field names.
    assert.ok(prompt.includes("_fragilityPerception"), "prompt missing perception block");
    assert.ok(prompt.includes("fragilityLevel"), "prompt missing fragilityLevel");
    assert.ok(prompt.includes("allowedEventsThisCall"), "prompt missing allowedEventsThisCall");
    assert.ok(prompt.includes("recommendedWeather"), "prompt missing recommendedWeather");
    assert.ok(prompt.includes("fragilityRules"), "prompt missing fragilityRules");
  });

  it("a perception-bearing summary still produces a directive that passes ResponseSchema + Guardrails", async () => {
    const summary = makeSummary();
    summary._fragilityPerception = buildEnvironmentPerception(summary);
    // Drive the offline fallback path (enabled=false → no network).
    const client = new LLMClient({ baseUrl: "" });
    const result = await client.requestEnvironment(summary, false);
    assert.equal(result.fallback, true);
    const validation = validateEnvironmentDirective(result.data);
    assert.equal(validation.ok, true, `schema rejected: ${validation.error}`);
    const guarded = guardEnvironmentDirective(result.data);
    // Guardrails enforce the legal weather enum & event types.
    assert.ok(["clear", "rain", "storm", "drought", "winter"].includes(guarded.weather));
    assert.ok(Array.isArray(guarded.eventSpawns));
  });
});

describe("rule-based fallback is unaffected by the perception block", () => {
  it("buildEnvironmentFallback returns the same directive whether or not _fragilityPerception is attached", () => {
    // Coverage: ensures the LLM tuning is purely additive — the
    // fallback path (used when state.ai.coverageTarget !== 'llm')
    // ignores the perception keys we inject.
    const base = makeSummary({
      resources: { food: 12, wood: 40 },
      gameplay: { prosperity: 30, threat: 40, recovery: { collapseRisk: 0 } },
    });
    const withPerception = { ...base, _fragilityPerception: buildEnvironmentPerception(base) };
    const a = buildEnvironmentFallback(base);
    const b = buildEnvironmentFallback(withPerception);
    // Steering-note text may include focus rendering — compare the
    // load-bearing decision fields.
    assert.equal(a.weather, b.weather);
    assert.equal(a.durationSec, b.durationSec);
    assert.equal(a.factionTension, b.factionTension);
    assert.deepEqual(
      (a.eventSpawns ?? []).map((e) => e.type),
      (b.eventSpawns ?? []).map((e) => e.type),
    );
  });
});
