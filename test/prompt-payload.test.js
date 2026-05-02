import test from "node:test";
import assert from "node:assert/strict";

import { buildEnvironmentPromptUserContent, buildPolicyPromptUserContent } from "../src/simulation/ai/llm/PromptPayload.js";

test("policy prompt payload includes operational highlights and group contracts", () => {
  const payload = JSON.parse(buildPolicyPromptUserContent({
    world: {
      scenario: { title: "Broken Frontier", summary: "Reconnect the route." },
      objective: { title: "Reconnect the Frontier", progress: 42, hint: "Repair the west route." },
      frontier: { brokenRoutes: ["west lumber route"], unreadyDepots: ["east ruined depot"] },
      logistics: { isolatedWorksites: 1, overloadedWarehouses: 1, strandedCarryWorkers: 2 },
      ecology: { pressuredFarms: 1, frontierPredators: 2, maxFarmPressure: 0.83 },
      gameplay: { recovery: { collapseRisk: 71, charges: 1 } },
      events: [{ type: "banditRaid", targetLabel: "west lumber route", severity: "high", pressure: 1.8 }],
    },
  }));

  assert.equal(payload.channel, "npc-policy");
  assert.ok(Array.isArray(payload.operationalHighlights));
  assert.ok(payload.operationalHighlights.some((line) => /Broken Frontier|west lumber route|east ruined depot/i.test(line)));
  assert.ok(payload.groupContracts?.workers?.allowedIntents?.includes("deliver"));
  assert.ok(payload.groupContracts?.traders?.allowedTargets?.includes("road"));
  assert.ok(Array.isArray(payload.hardRules));
});

test("extractor-saturated highlight fires for wood-starved colonies (iter5 Gap A)", () => {
  // Wood-starved colony: lots of farms+lumber+quarry, no processing,
  // wood bleeding into extraction construction. The pre-iter5 gate
  // (wood>=15 + stone>=8 + food>=30) would have suppressed this; the
  // broadened gate must surface it.
  const payload = JSON.parse(buildPolicyPromptUserContent({
    world: {
      population: { workers: 14 },
      buildings: { farms: 3, lumbers: 2, quarries: 1, kitchens: 0, smithies: 0, clinics: 0 },
      resources: { food: 12, wood: 1, stone: 0, herbs: 0 },
    },
  }));
  assert.ok(
    payload.operationalHighlights.some((line) => /extractor-saturated/i.test(line)),
    "expected extractor-saturated highlight in: " + JSON.stringify(payload.operationalHighlights),
  );
});

test("extractor-saturated highlight fires when processing chain absent even at low resources (iter5 Gap A)", () => {
  // Mid-resource colony with NO processing buildings should still trigger
  // the saturation signal (zero-processing short-circuit).
  const payload = JSON.parse(buildPolicyPromptUserContent({
    world: {
      population: { workers: 11 },
      buildings: { farms: 2, lumbers: 2, quarries: 1, kitchens: 0, smithies: 0, clinics: 0 },
      resources: { food: 6, wood: 2, stone: 1 },
    },
  }));
  assert.ok(
    payload.operationalHighlights.some((line) => /extractor-saturated/i.test(line)),
    "expected extractor-saturated highlight in: " + JSON.stringify(payload.operationalHighlights),
  );
});

test("extractor-saturated highlight stays quiet for true bootstrap colonies (iter5 Gap A)", () => {
  // Brand-new colony — too few workers / extractors. Should NOT trigger.
  const payload = JSON.parse(buildPolicyPromptUserContent({
    world: {
      population: { workers: 5 },
      buildings: { farms: 1, lumbers: 1, quarries: 0, kitchens: 0, smithies: 0, clinics: 0 },
      resources: { food: 4, wood: 2, stone: 0 },
    },
  }));
  assert.ok(
    !payload.operationalHighlights.some((line) => /extractor-saturated/i.test(line)),
    "did not expect extractor-saturated highlight for bootstrap colony: " + JSON.stringify(payload.operationalHighlights),
  );
});

test("environment prompt payload includes explanation contract", () => {
  const payload = JSON.parse(buildEnvironmentPromptUserContent({
    scenario: { title: "Gate Bastion" },
    objective: { title: "Hold the Chokepoints", progress: 81, hint: "Stability is paused while the north gate is broken." },
    frontier: { brokenRoutes: ["north timber gate"] },
    gameplay: { recovery: { collapseRisk: 18, charges: 2 } },
    events: [],
  }));

  assert.equal(payload.channel, "environment-director");
  assert.ok(Array.isArray(payload.allowedWeather));
  assert.ok(Array.isArray(payload.allowedEvents));
  assert.ok(Array.isArray(payload.explanationFields));
  assert.ok(payload.explanationFields.includes("focus"));
});
