// test/llm-environment-r2.test.js
//
// Round-2 LLM tuning verification:
// 1. Pre-rated weather/event candidates appear in the LLM prompt.
// 2. validateEnvironmentPick correctly enforces the menu.
// 3. Fallback enforcement: an off-menu directive is rewritten to top-1.
// 4. Storyteller posture classification is deterministic.
// 5. Threat windows produce expected gating.
// 6. Recovery posture forces clear weather and at most one event.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  rateWeatherCandidates,
  rateEventCandidates,
  classifyStoryteller,
  computeThreatWindows,
  formatEnvironmentMenuForLLM,
  validateEnvironmentPick,
  buildEnvironmentMenu,
} from "../src/simulation/ai/director/EnvironmentAnalytics.js";
import { buildEnvironmentPerception } from "../src/simulation/ai/director/EnvironmentDirectorSystem.js";
import { buildEnvironmentPromptUserContent } from "../src/simulation/ai/llm/PromptPayload.js";

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
    weather: { current: "clear", timeLeftSec: 10, pressureScore: 0, season: "spring" },
    traffic: { congestion: 0.3, passableRatio: 0.8 },
    logistics: {},
    spatialPressure: {},
    events: [],
    aiMode: "fallback",
    ...overrides,
  };
}

describe("rateWeatherCandidates", () => {
  it("ranks clear top for a critical colony", () => {
    const summary = makeSummary({
      resources: { food: 8, wood: 40, meals: 0 },
      gameplay: { prosperity: 30, threat: 40, recovery: { collapseRisk: 70 } },
    });
    const perception = buildEnvironmentPerception(summary);
    const ranked = rateWeatherCandidates(summary, perception);
    assert.equal(ranked[0].weather, "clear");
    assert.ok(ranked[0].score > ranked[1].score, "clear should be strictly best");
    // Storm should NOT be in top-2 when fragility is critical.
    const stormRank = ranked.find((c) => c.weather === "storm").rank;
    assert.ok(stormRank >= 3, `storm rank=${stormRank} should be >=3`);
    // And storm score should be near floor (clamped at 0).
    assert.ok(ranked.find((c) => c.weather === "storm").score <= 5);
  });

  it("ranks storm acceptable for thriving colony with low threat", () => {
    const summary = makeSummary({
      resources: { food: 250, wood: 200, meals: 5 },
      buildings: { warehouses: 3, farms: 5, lumbers: 2 },
      gameplay: { prosperity: 80, threat: 15, recovery: { collapseRisk: 0 } },
      weather: { current: "rain", timeLeftSec: 2, season: "spring" },
    });
    const perception = buildEnvironmentPerception(summary);
    const ranked = rateWeatherCandidates(summary, perception);
    const stormRank = ranked.find((c) => c.weather === "storm").rank;
    // Storm should be in top-3 for a thriving colony, beating drought/winter.
    assert.ok(stormRank <= 3, `expected storm in top-3 for thriving, got rank=${stormRank}`);
  });

  it("emits continuity bonus for current weather", () => {
    const summary = makeSummary({
      weather: { current: "rain", timeLeftSec: 12, season: "spring" },
      resources: { food: 200, wood: 100, meals: 4 },
      buildings: { warehouses: 2, farms: 4 },
      gameplay: { prosperity: 65, threat: 25, recovery: { collapseRisk: 0 } },
    });
    const perception = buildEnvironmentPerception(summary);
    const ranked = rateWeatherCandidates(summary, perception);
    const rain = ranked.find((c) => c.weather === "rain");
    // Rain should have one of the continuity reasons.
    assert.ok(
      rain.reasons.some((r) => r.includes("continuity")),
      `expected continuity reason on rain, got: ${rain.reasons.join("; ")}`,
    );
  });
});

describe("rateEventCandidates", () => {
  it("marks banned events as illegal with score=0", () => {
    const summary = makeSummary({
      resources: { food: 20, wood: 40, meals: 0 },
      gameplay: { prosperity: 30, threat: 40, recovery: { collapseRisk: 70 } },
    });
    const perception = buildEnvironmentPerception(summary);
    const ranked = rateEventCandidates(summary, perception);
    // Critical fragility bans almost everything; only tradeCaravan legal.
    const legal = ranked.filter((c) => c.legal);
    assert.equal(legal.length, 1);
    assert.equal(legal[0].event, "tradeCaravan");
    const wildfire = ranked.find((c) => c.event === "wildfire");
    assert.equal(wildfire.legal, false);
    assert.equal(wildfire.score, 0);
  });

  it("ranks tradeCaravan top when food is low and fragile", () => {
    const summary = makeSummary({
      resources: { food: 60, wood: 40, meals: 0 },
      buildings: { warehouses: 1, farms: 2 },
      gameplay: { prosperity: 60, threat: 30, recovery: { collapseRisk: 5 } },
    });
    const perception = buildEnvironmentPerception(summary);
    const ranked = rateEventCandidates(summary, perception);
    const top = ranked.find((c) => c.legal);
    assert.equal(top.event, "tradeCaravan");
    assert.ok(top.score >= 70, `caravan score=${top.score} should be >=70`);
  });
});

describe("classifyStoryteller", () => {
  it("classifies critical fragility as recovery posture", () => {
    const summary = makeSummary({
      resources: { food: 8 },
      gameplay: { prosperity: 30, threat: 40, recovery: { collapseRisk: 70 } },
    });
    const perception = buildEnvironmentPerception(summary);
    const posture = classifyStoryteller(summary, perception);
    assert.equal(posture.posture, "recovery");
    assert.ok(posture.directive.includes("Do NOT escalate"));
  });

  it("classifies active raid as climax posture", () => {
    const summary = makeSummary({
      gameplay: { prosperity: 50, threat: 65, recovery: { collapseRisk: 10 } },
      events: [{ type: "banditRaid", severity: "medium", intensity: 1.5 }],
    });
    const perception = buildEnvironmentPerception(summary);
    const posture = classifyStoryteller(summary, perception);
    assert.equal(posture.posture, "climax");
  });

  it("is deterministic — same inputs produce same posture+reasons", () => {
    const summary = makeSummary({
      resources: { food: 80 },
      gameplay: { prosperity: 50, threat: 30, recovery: { collapseRisk: 5 } },
    });
    const perception = buildEnvironmentPerception(summary);
    const a = classifyStoryteller(summary, perception);
    const b = classifyStoryteller(summary, perception);
    assert.equal(a.posture, b.posture);
    assert.deepEqual(a.reasons, b.reasons);
    assert.equal(a.directive, b.directive);
  });

  it("returns calm for thriving + low threat", () => {
    const summary = makeSummary({
      resources: { food: 250, wood: 150, meals: 5 },
      buildings: { warehouses: 3, farms: 5, lumbers: 2 },
      gameplay: { prosperity: 75, threat: 20, recovery: { collapseRisk: 0 } },
    });
    const perception = buildEnvironmentPerception(summary);
    const posture = classifyStoryteller(summary, perception);
    assert.equal(posture.posture, "calm");
  });
});

describe("computeThreatWindows", () => {
  it("returns nextSafeSec=null for critical colony", () => {
    const summary = makeSummary({
      resources: { food: 8 },
      gameplay: { prosperity: 30, threat: 40, recovery: { collapseRisk: 70 } },
    });
    const perception = buildEnvironmentPerception(summary);
    const window = computeThreatWindows(summary, perception);
    assert.equal(window.safeNow, false);
    assert.equal(window.nextSafeSec, null);
  });

  it("returns safeNow=true for thriving + low threat", () => {
    const summary = makeSummary({
      resources: { food: 250, wood: 150, meals: 5 },
      buildings: { warehouses: 3, farms: 5, lumbers: 2 },
      gameplay: { prosperity: 80, threat: 20, recovery: { collapseRisk: 0 } },
    });
    const perception = buildEnvironmentPerception(summary);
    const window = computeThreatWindows(summary, perception);
    assert.equal(window.safeNow, true);
    assert.equal(window.nextSafeSec, 0);
  });

  it("returns a finite nextSafeSec for fragile colonies with farms", () => {
    const summary = makeSummary({
      resources: { food: 80 },
      buildings: { farms: 2 },
      gameplay: { prosperity: 60, threat: 30, recovery: { collapseRisk: 5 } },
    });
    const perception = buildEnvironmentPerception(summary);
    const window = computeThreatWindows(summary, perception);
    assert.equal(window.safeNow, false);
    assert.ok(typeof window.nextSafeSec === "number");
    assert.ok(window.nextSafeSec >= 30);
    assert.ok(window.nextSafeSec <= 600);
  });
});

describe("formatEnvironmentMenuForLLM", () => {
  it("returns a markdown block containing the top-3 weather + legal events + posture", () => {
    const summary = makeSummary();
    const perception = buildEnvironmentPerception(summary);
    const menu = buildEnvironmentMenu(summary, perception);
    const md = menu.menuMarkdown;
    assert.ok(md.includes("## Pre-rated Options"));
    assert.ok(md.includes("Storyteller Posture"));
    assert.ok(md.includes("Weather Candidates"));
    assert.ok(md.includes("Event Candidates"));
    // Top-1 weather rank=1 marker.
    assert.ok(md.includes("1. `"));
  });
});

describe("buildEnvironmentMenu integrates into the LLM prompt", () => {
  it("the markdown menu appears verbatim inside the prompt user content", () => {
    const summary = makeSummary();
    summary._fragilityPerception = buildEnvironmentPerception(summary);
    const menu = buildEnvironmentMenu(summary, summary._fragilityPerception);
    summary._environmentMenu = {
      menuMarkdown: menu.menuMarkdown,
      posture: menu.posture,
      threatWindow: menu.threatWindow,
      weatherCandidates: menu.weatherCandidates,
      eventCandidates: menu.eventCandidates,
    };
    const prompt = buildEnvironmentPromptUserContent(summary);
    assert.ok(prompt.includes("_environmentMenu"), "prompt missing _environmentMenu");
    assert.ok(prompt.includes("Pre-rated Options"), "prompt missing pre-rated marker");
    assert.ok(prompt.includes("storyteller") || prompt.includes("Storyteller"), "prompt missing storyteller");
    assert.ok(prompt.includes("Weather Candidates"));
    assert.ok(prompt.includes("Event Candidates"));
  });
});

describe("validateEnvironmentPick (post-validation)", () => {
  it("accepts a directive that picks weather from the top-3 menu", () => {
    const summary = makeSummary({
      resources: { food: 200, wood: 100, meals: 4 },
      buildings: { warehouses: 2, farms: 4 },
      gameplay: { prosperity: 65, threat: 25, recovery: { collapseRisk: 0 } },
    });
    const perception = buildEnvironmentPerception(summary);
    const menu = buildEnvironmentMenu(summary, perception);
    const directive = {
      weather: menu.weatherCandidates[0].weather,
      durationSec: 20,
      factionTension: 0.4,
      eventSpawns: [],
    };
    const check = validateEnvironmentPick(
      directive,
      menu.weatherCandidates,
      menu.eventCandidates,
      menu.posture,
    );
    assert.equal(check.valid, true, `expected valid; reasons=${check.reasons.join(";")}`);
    assert.equal(check.weatherFromMenu, true);
    assert.equal(check.candidateUseRate, 1);
  });

  it("rewrites an off-menu weather pick to top-1 (fallback enforcement)", () => {
    // Build a scenario with one clearly-best weather (clear) and one
    // clearly-worst (storm). We construct a synthetic candidate menu
    // with a known top-3 to make the off-menu pick unambiguous.
    const summary = makeSummary({
      resources: { food: 8 },
      gameplay: { prosperity: 30, threat: 40, recovery: { collapseRisk: 70 } },
    });
    const perception = buildEnvironmentPerception(summary);
    const menu = buildEnvironmentMenu(summary, perception);
    // Force a deterministic top-3 = [clear, rain, drought] so storm is OUT.
    // This tests the validator wiring directly without depending on the
    // exact scoring function.
    const candidatesForcedTop3 = [
      { weather: "clear", score: 90, rank: 1, reasons: [], legal: true },
      { weather: "rain", score: 50, rank: 2, reasons: [], legal: true },
      { weather: "drought", score: 30, rank: 3, reasons: [], legal: true },
      { weather: "winter", score: 10, rank: 4, reasons: [], legal: true },
      { weather: "storm", score: 0, rank: 5, reasons: [], legal: true },
    ];
    const directive = {
      weather: "storm",
      durationSec: 12,
      factionTension: 0.7,
      eventSpawns: [{ type: "banditRaid", intensity: 1.0, durationSec: 10 }],
    };
    const check = validateEnvironmentPick(
      directive,
      candidatesForcedTop3,
      menu.eventCandidates,
      menu.posture,
    );
    assert.equal(check.valid, false);
    // Top-1 weather should have replaced storm. In recovery posture, that's clear.
    assert.equal(check.fixed.weather, "clear");
    // Bandit raid is illegal in critical → dropped.
    assert.equal(check.fixed.eventSpawns.length, 0);
    // candidateUseRate: 0/2 from menu = 0.
    assert.ok(check.candidateUseRate <= 0.5);
    assert.ok(check.reasons.some((r) => r.includes("not in top-3")));
  });

  it("recovery posture forces clear and drops non-tradeCaravan events", () => {
    const summary = makeSummary({
      resources: { food: 8 },
      gameplay: { prosperity: 30, threat: 40, recovery: { collapseRisk: 70 } },
    });
    const perception = buildEnvironmentPerception(summary);
    const menu = buildEnvironmentMenu(summary, perception);
    assert.equal(menu.posture.posture, "recovery");
    // Hand the validator a directive that picks clear (legal) but with an
    // animalMigration event (not legal in critical anyway, but let's verify
    // recovery posture drops it).
    const directive = {
      weather: "clear",
      durationSec: 25,
      factionTension: 0.3,
      eventSpawns: [{ type: "animalMigration", intensity: 0.5, durationSec: 10 }],
    };
    const check = validateEnvironmentPick(
      directive,
      menu.weatherCandidates,
      menu.eventCandidates,
      menu.posture,
    );
    assert.equal(check.fixed.weather, "clear");
    assert.equal(check.fixed.eventSpawns.length, 0);
  });

  it("caps event count at 1 outside calm posture", () => {
    const summary = makeSummary({
      resources: { food: 100, wood: 50 },
      buildings: { farms: 2 },
      gameplay: { prosperity: 55, threat: 50, recovery: { collapseRisk: 5 } },
    });
    const perception = buildEnvironmentPerception(summary);
    const menu = buildEnvironmentMenu(summary, perception);
    // Hand it 3 legal events even though posture is climax/building_tension.
    const directive = {
      weather: menu.weatherCandidates[0].weather,
      durationSec: 18,
      factionTension: 0.5,
      eventSpawns: [
        { type: "tradeCaravan", intensity: 0.5, durationSec: 10 },
        { type: "tradeCaravan", intensity: 0.5, durationSec: 10 },
        { type: "tradeCaravan", intensity: 0.5, durationSec: 10 },
      ],
    };
    const check = validateEnvironmentPick(
      directive,
      menu.weatherCandidates,
      menu.eventCandidates,
      menu.posture,
    );
    // Outside calm: cap=1.
    if (menu.posture.posture !== "calm") {
      assert.ok(check.fixed.eventSpawns.length <= 1);
    }
  });
});
