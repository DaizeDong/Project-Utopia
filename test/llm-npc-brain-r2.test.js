/**
 * NPC-Brain LLM Round-2 — analytics package + delta menu + post-validation.
 *
 * R1 augmented the prompt with raid counts and asked the LLM to produce full
 * policy bags. R2 changes the contract: LLM gets the fallback policy as a
 * baseline + a scored delta menu + group state, and picks deltas to apply.
 * These tests pin the surface that NPCBrainSystem injects into the prompt
 * and the post-validator that scores how well the LLM stuck to the menu.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  computeGroupAnalytics,
  computeDeltaMenu,
  computeThreatZoneMap,
  computeRecommendedBaseline,
  formatNPCBrainAnalyticsForLLM,
  validatePolicyDeltas,
  buildNPCBrainAnalytics,
} from "../src/simulation/ai/brains/NPCBrainAnalytics.js";
import {
  buildCombatContext,
  attachNPCBrainAnalyticsToSummary,
} from "../src/simulation/ai/brains/NPCBrainSystem.js";
import { GROUP_IDS, DEFAULT_GROUP_POLICIES } from "../src/config/aiConfig.js";

function fakeRaidState({ rows = 5, raiders = 2, predators = 1, hits = 1 } = {}) {
  // Workers clustered in SW corner, raiders in NE corner — deltas should
  // reflect that geometry.
  const agents = [];
  for (let i = 0; i < rows; i += 1) {
    agents.push({
      type: "WORKER",
      groupId: GROUP_IDS.WORKERS,
      alive: true,
      x: 10 + (i % 3),
      z: 50 + Math.floor(i / 3),
      hunger: 0.7,
      memory: { recentEvents: i < hits ? ["predator-hit"] : [] },
      blackboard: { fsm: { state: i % 2 === 0 ? "harvest" : "deliver" } },
    });
  }
  const animals = [];
  for (let i = 0; i < raiders; i += 1) {
    animals.push({
      kind: "predator",
      species: "raider_beast",
      groupId: GROUP_IDS.PREDATORS,
      alive: true,
      x: 80 + i,
      z: 10 + i,
    });
  }
  for (let i = 0; i < predators; i += 1) {
    animals.push({
      kind: "predator",
      species: "wolf",
      groupId: GROUP_IDS.PREDATORS,
      alive: true,
      x: 70 + i,
      z: 12 + i,
    });
  }
  return {
    grid: { width: 96, height: 72 },
    metrics: {
      combat: {
        activeRaiders: raiders,
        activePredators: raiders + predators,
        guardCount: 0,
        workerCount: rows,
        nearestThreatDistance: 30,
      },
      deathsByReason: { predation: 0 },
    },
    agents,
    animals,
  };
}

test("(a) computeGroupAnalytics surfaces idle/active/underHit + spread per group", () => {
  const state = fakeRaidState({ rows: 6, hits: 2 });
  const analytics = computeGroupAnalytics(state);
  const workers = analytics[GROUP_IDS.WORKERS];
  assert.ok(workers, "workers analytics should exist");
  assert.equal(workers.memberCount, 6);
  assert.equal(workers.underHit, 2, "workers under hit should match the seeded recentEvents count");
  assert.equal(workers.idleCount + workers.activeCount, workers.memberCount);
  // Workers are clustered (within ~3 tiles of centroid) → spread should be
  // small but non-zero.
  assert.ok(workers.distFromCentroidStdDev >= 0);
  assert.ok(workers.distFromCentroidMean < 5, `expected tight cluster, got mean=${workers.distFromCentroidMean}`);

  // Predators are also a group — at least one should appear.
  const predators = analytics[GROUP_IDS.PREDATORS];
  assert.ok(predators && predators.memberCount > 0, "predator analytics should exist");
});

test("(b) computeDeltaMenu ranks high-impact retreat deltas first under raid pressure", () => {
  const state = fakeRaidState({ rows: 5, raiders: 3, hits: 2 });
  const combat = buildCombatContext(state);
  // Force imminent: nearest threat tiles low + guard deficit.
  const imminentCombat = { ...combat, nearestThreatTiles: 8, guardDeficit: 3, workersUnderHit: 2, activeRaiders: 3, activePredators: 4 };
  const menu = computeDeltaMenu(state, imminentCombat);
  assert.ok(menu.length > 4, `menu should have multiple deltas, got ${menu.length}`);
  // Top-3 should be retreat-shaped (workers.farm-down / wood-down / safety-up
  // / eat-up / risk-down). Cannot pin exact order — we just assert that the
  // top entries belong to that retreat family.
  const topIds = menu.slice(0, 5).map((d) => d.id);
  const retreatFamily = ["workers.farm-down", "workers.wood-down", "workers.safety-up", "workers.eat-up", "workers.warehouse-up", "workers.frontier-down"];
  const overlap = topIds.filter((id) => retreatFamily.includes(id));
  assert.ok(overlap.length >= 3, `expected ≥3 retreat-family deltas in top-5, got ${topIds.join(",")}`);
  // Sanity: every entry has the expected shape.
  for (const d of menu) {
    assert.equal(typeof d.id, "string");
    assert.equal(typeof d.target, "string");
    assert.ok(["+=", "-=", "set"].includes(d.op));
    assert.equal(typeof d.value, "number");
    assert.equal(typeof d.score, "number");
    assert.ok(d.score >= 0 && d.score <= 10);
  }
});

test("(c) computeThreatZoneMap pinpoints the hot sector and worker centroid", () => {
  const state = fakeRaidState({ rows: 4, raiders: 3, predators: 2 });
  const map = computeThreatZoneMap(state);
  assert.equal(map.totalThreats, 5);
  assert.ok(map.hotSectorId, "hotSectorId should be set when threats exist");
  // Threats are in NE corner, workers are in SW corner — sectors should
  // differ.
  assert.notEqual(map.hotSectorId, map.workerCentroidSector, `hot=${map.hotSectorId} workers=${map.workerCentroidSector} — they should not collide`);
  const hotSector = map.sectors.find((s) => s.id === map.hotSectorId);
  assert.ok(hotSector && hotSector.threatCount > 0);
  assert.ok(hotSector.density > 0 && hotSector.density <= 1);
});

test("(d) baseline hint mirrors fallback policy and surfaces every required group", () => {
  const summary = {
    world: { population: { workers: 5, herbivores: 2, predators: 1 }, resources: { food: 50, wood: 30 }, events: [], objective: { id: "x", title: "X", progress: 50, hint: "" }, gameplay: { threat: 30 }, frontier: { brokenRoutes: [], unreadyDepots: [], readyDepots: [], readyDepotLabels: [] }, logistics: { isolatedWorksites: 0, overloadedWarehouses: 0, strandedCarryWorkers: 0 }, buildings: { warehouses: 1 } },
    stateTransitions: { groups: {} },
  };
  const baseline = computeRecommendedBaseline({}, summary);
  for (const gid of [GROUP_IDS.WORKERS, GROUP_IDS.TRADERS, GROUP_IDS.SABOTEURS, GROUP_IDS.HERBIVORES, GROUP_IDS.PREDATORS]) {
    assert.ok(baseline[gid], `baseline should include ${gid}`);
    assert.equal(typeof baseline[gid].riskTolerance, "number");
    assert.ok(baseline[gid].intentWeights);
    assert.ok(baseline[gid].targetPriorities);
  }
  // Workers baseline should match the default — that's the contract.
  assert.equal(baseline[GROUP_IDS.WORKERS].riskTolerance, DEFAULT_GROUP_POLICIES[GROUP_IDS.WORKERS].riskTolerance);
});

test("(e) validatePolicyDeltas scores LLM picks against the menu", () => {
  const summary = { world: {}, stateTransitions: { groups: {} } };
  const baseline = computeRecommendedBaseline({}, summary);
  const state = fakeRaidState({ rows: 4, raiders: 2, hits: 1 });
  const combat = buildCombatContext(state);
  const menu = computeDeltaMenu(state, { ...combat, guardDeficit: 2, nearestThreatTiles: 6, workersUnderHit: 1 });

  // Build an LLM-ish output that picked from the menu (workers.farm-down,
  // workers.safety-up).
  const goodPolicies = [
    {
      groupId: GROUP_IDS.WORKERS,
      intentWeights: {
        ...baseline[GROUP_IDS.WORKERS].intentWeights,
        farm: baseline[GROUP_IDS.WORKERS].intentWeights.farm - 0.5,
        eat: baseline[GROUP_IDS.WORKERS].intentWeights.eat + 0.4,
      },
      targetPriorities: {
        ...baseline[GROUP_IDS.WORKERS].targetPriorities,
        safety: baseline[GROUP_IDS.WORKERS].targetPriorities.safety + 0.5,
      },
      riskTolerance: baseline[GROUP_IDS.WORKERS].riskTolerance,
      _appliedDeltas: ["workers.farm-down", "workers.eat-up", "workers.safety-up"],
    },
  ];
  const goodReport = validatePolicyDeltas(goodPolicies, baseline, menu);
  assert.ok(goodReport.totalDeviations >= 3, `expected ≥3 deviations, got ${goodReport.totalDeviations}`);
  assert.ok(goodReport.matchedDeltas >= 3, `expected matched=≥3, got ${goodReport.matchedDeltas}`);
  assert.equal(goodReport.unjustifiedDeviations, 0);
  assert.ok(goodReport.deltaUseRate >= 0.9, `expected high use rate, got ${goodReport.deltaUseRate}`);

  // Now an LLM that hallucinated weights NOT in the menu (and no _reason).
  const badPolicies = [
    {
      groupId: GROUP_IDS.WORKERS,
      intentWeights: {
        ...baseline[GROUP_IDS.WORKERS].intentWeights,
        farm: baseline[GROUP_IDS.WORKERS].intentWeights.farm + 0.6, // wrong direction vs menu
      },
      targetPriorities: { ...baseline[GROUP_IDS.WORKERS].targetPriorities },
      riskTolerance: 0.99, // far from any "set" delta value
    },
  ];
  const badReport = validatePolicyDeltas(badPolicies, baseline, menu);
  assert.ok(badReport.totalDeviations >= 1);
  assert.ok(badReport.unjustifiedDeviations >= 1, "policy that ignores menu should be flagged unjustified");
  assert.ok(badReport.deltaUseRate < 0.5, `bad use rate should be low, got ${badReport.deltaUseRate}`);
});

test("(f) attachNPCBrainAnalyticsToSummary lifts the package into _strategyContext for the prompt", () => {
  const state = fakeRaidState({ rows: 3, raiders: 2 });
  const summary = { world: {}, groups: {}, stateTransitions: { groups: {} } };
  const combat = buildCombatContext(state);
  const analytics = buildNPCBrainAnalytics(state, summary, combat);
  attachNPCBrainAnalyticsToSummary(summary, analytics);

  assert.ok(summary._npcBrainAnalytics, "machine-readable wire field should exist");
  assert.ok(summary._npcBrainAnalytics.deltaMenu.length > 0);
  assert.ok(summary._npcBrainAnalytics.baseline[GROUP_IDS.WORKERS]);
  assert.ok(summary._strategyContext, "strategy context should be lifted");
  assert.ok(summary._strategyContext.npcBrainAnalytics, "strategy context should embed analytics");
  assert.ok(typeof summary._strategyContext.npcBrainAnalyticsText === "string");
  assert.ok(summary._strategyContext.npcBrainAnalyticsText.includes("Suggested Deltas"));
  assert.ok(Array.isArray(summary._strategyContext.r2Instructions));
  assert.ok(summary._strategyContext.r2Instructions.length >= 3);

  // Round-trip through JSON.stringify (the same path the proxy serializes).
  const wire = JSON.parse(JSON.stringify(summary));
  assert.match(JSON.stringify(wire), /deltaMenu/);
  assert.match(JSON.stringify(wire), /baseline/);
  assert.match(JSON.stringify(wire), /threatMap/);
});

test("(g) formatNPCBrainAnalyticsForLLM produces a stable, parseable text block", () => {
  const state = fakeRaidState({ rows: 4, raiders: 2 });
  const summary = { world: {}, groups: {}, stateTransitions: { groups: {} } };
  const combat = buildCombatContext(state);
  const analytics = buildNPCBrainAnalytics(state, summary, combat);
  const text = formatNPCBrainAnalyticsForLLM(analytics);
  assert.ok(typeof text === "string");
  assert.ok(text.includes("## Group Analytics"));
  assert.ok(text.includes("## Suggested Deltas"));
  assert.ok(text.includes("## Threat Sector Map"));
  assert.ok(text.includes("## Baseline Hint"));
});
