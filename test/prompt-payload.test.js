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
