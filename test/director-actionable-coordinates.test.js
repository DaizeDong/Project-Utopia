import test from "node:test";
import assert from "node:assert/strict";

import {
  adjustWorkerPolicyExported,
  describeWorkerFocus,
} from "../src/simulation/ai/llm/PromptBuilder.js";

function makePolicy() {
  return {
    intentWeights: { farm: 1, wood: 1, eat: 0.5, deliver: 0.5, wander: 0.3 },
    targetPriorities: {},
    riskTolerance: 0.5,
    ttlSec: 30,
  };
}

function makeSummary(frontier) {
  return {
    world: {
      resources: { food: 40, wood: 30, stone: 0, herbs: 0 },
      buildings: {
        warehouses: 1,
        farms: 2,
        lumbers: 1,
        roads: 8,
        walls: 0,
        quarries: 0,
        herbGardens: 0,
        kitchens: 0,
        smithies: 0,
        clinics: 0,
      },
      population: { workers: 8, predators: 0 },
      objective: { id: "logistics-1" },
      frontier,
      logistics: { isolatedWorksites: 0, overloadedWarehouses: 0, strandedCarryWorkers: 0 },
      gameplay: { threat: 30, prosperity: 40, recovery: { collapseRisk: 10 } },
      events: [],
    },
  };
}

test("describeWorkerFocus anchors a broken route gap tile", () => {
  const summary = makeSummary({
    brokenRoutes: [{ label: "west lumber route", gapTiles: [{ ix: 42.2, iz: 35.8 }] }],
    unreadyDepots: [],
  });

  const focus = describeWorkerFocus(summary, []);

  assert.match(focus, /rebuild the broken supply lane/i);
  assert.match(focus, /at \(42,36\)/);
  assert.match(focus, /place Road here/);
});

test("describeWorkerFocus anchors an unready depot when no route coordinate exists", () => {
  const summary = makeSummary({
    brokenRoutes: [],
    unreadyDepots: [{ label: "East Ruin", anchor: { ix: 18, iz: 9 } }],
  });

  const focus = describeWorkerFocus(summary, []);

  assert.match(focus, /rebuild the broken supply lane/i);
  assert.match(focus, /at depot East Ruin/);
  assert.match(focus, /place Warehouse here/);
});

test("adjustWorkerPolicy switches to actionable summary when focus has a coordinate", () => {
  const policy = makePolicy();
  const summary = makeSummary({
    brokenRoutes: [{ label: "west lumber route", gapTiles: [{ ix: 42, iz: 36 }] }],
    unreadyDepots: [],
  });

  adjustWorkerPolicyExported(policy, { count: 8, avgHunger: 0.6, carrying: 1 }, summary);

  assert.match(policy.focus, /at \(42,36\).*place Road here/);
  assert.match(policy.summary, /Crew attention needed:/);
  assert.match(policy.summary, /Other workers keep hunger and carry in check/);
  assert.ok(!/map's intended reroute pressure/i.test(policy.summary));
});
