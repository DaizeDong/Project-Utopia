// Validates the 5 academic-benchmark dimension plugins conform to
// DimensionPlugin protocol and produce non-NaN scores on a short
// SimHarness run.

import test from "node:test";
import assert from "node:assert/strict";

import { validatePlugin } from "../src/benchmark/framework/DimensionPlugin.js";
import {
  ACADEMIC_BENCHMARK_DIMENSIONS,
  ResourceAllocationEfficiencyPlugin,
  GroupDynamicsPlugin,
  MemoryDegradationPlugin,
  DecisionTokenEfficiencyPlugin,
  HierarchicalCoordinationPlugin,
} from "../src/benchmark/dimensions/index.js";
import { SimHarness } from "../src/benchmark/framework/SimHarness.js";
import { CHANNELS, NoopAgentAdapter, SCHEMA_VERSION } from "../src/simulation/ai/llm/AgentAdapter.js";

test("ACADEMIC_BENCHMARK_DIMENSIONS exports 5 plugins", () => {
  assert.equal(ACADEMIC_BENCHMARK_DIMENSIONS.length, 5);
});

test("each dimension plugin conforms to DimensionPlugin protocol", () => {
  for (const plugin of ACADEMIC_BENCHMARK_DIMENSIONS) {
    assert.doesNotThrow(() => validatePlugin(plugin), `plugin ${plugin.id} failed validation`);
    assert.equal(typeof plugin.id, "string");
    assert.ok(plugin.scoreDimensions.length >= 1);
  }
});

test("AgentAdapter contract: 4 channels + schema version", () => {
  assert.equal(CHANNELS.length, 4);
  assert.deepEqual(
    [...CHANNELS],
    ["environment-director", "npc-policy", "strategic-plan", "colony-agent"]
  );
  assert.equal(typeof SCHEMA_VERSION, "string");
});

test("NoopAgentAdapter returns fallback shape for every channel", async () => {
  const adapter = new NoopAgentAdapter();
  for (const channel of CHANNELS) {
    const res = await adapter.request(channel, { example: "payload" });
    assert.equal(res.fallback, true);
    assert.equal(typeof res.usage, "object");
    assert.equal(res.usage.promptTokens, 0);
  }
});

test("RAE plugin returns numeric scores on a short SimHarness run", async () => {
  const harness = new SimHarness({
    templateId: "temperate_plains",
    seed: 1337,
    aiEnabled: false,
  });
  const samples = await ResourceAllocationEfficiencyPlugin.collectSamples(harness, {
    intervalSec: 5,
    durationSec: 10,
  });
  const score = ResourceAllocationEfficiencyPlugin.selfScore(samples, {});
  for (const dim of ResourceAllocationEfficiencyPlugin.scoreDimensions) {
    assert.equal(Number.isFinite(score[dim]), true, `${dim} non-finite`);
  }
});

test("DecisionTokenEfficiency plugin handles zero-token runs (fallback mode)", async () => {
  const harness = new SimHarness({
    templateId: "temperate_plains",
    seed: 1337,
    aiEnabled: false,
  });
  const samples = await DecisionTokenEfficiencyPlugin.collectSamples(harness, {
    durationSec: 10,
  });
  const score = DecisionTokenEfficiencyPlugin.selfScore(samples);
  for (const dim of DecisionTokenEfficiencyPlugin.scoreDimensions) {
    assert.equal(Number.isFinite(score[dim]), true, `${dim} non-finite`);
  }
});

test("MemoryDegradation plugin returns numeric scores with empty anchors", async () => {
  const harness = new SimHarness({
    templateId: "temperate_plains",
    seed: 1337,
    aiEnabled: false,
  });
  const samples = await MemoryDegradationPlugin.collectSamples(harness, { durationSec: 10 });
  const score = MemoryDegradationPlugin.selfScore(samples, { anchors: [] });
  for (const dim of MemoryDegradationPlugin.scoreDimensions) {
    assert.equal(Number.isFinite(score[dim]), true, `${dim} non-finite`);
  }
});

test("GroupDynamics + HierarchicalCoordination plugins do not throw on minimal run", async () => {
  const harness = new SimHarness({
    templateId: "temperate_plains",
    seed: 1337,
    aiEnabled: false,
  });
  const gdSamples = await GroupDynamicsPlugin.collectSamples(harness, { durationSec: 5 });
  const gdScore = GroupDynamicsPlugin.selfScore(gdSamples);
  for (const dim of GroupDynamicsPlugin.scoreDimensions) {
    assert.equal(Number.isFinite(gdScore[dim]), true, `${dim} non-finite`);
  }

  const hSamples = await HierarchicalCoordinationPlugin.collectSamples(harness, { durationSec: 5 });
  const hScore = HierarchicalCoordinationPlugin.selfScore(hSamples);
  for (const dim of HierarchicalCoordinationPlugin.scoreDimensions) {
    assert.equal(Number.isFinite(hScore[dim]), true, `${dim} non-finite`);
  }
});

// ── W3 placeholder-wiring assertions ──────────────────────────────────
// Each previously-zero key must (a) be in valid range and (b) respond
// to constructed inputs rather than always returning 0.

test("GroupDynamics.coalition_coupling is in [-1,1] and reflects synthetic identical groups", () => {
  // Two groups with identical targetPriorities → Pearson r = 1 → coupling = 1.
  const samples = [{
    t: 0,
    groupPolicies: [
      { groupId: "workers", intentWeights: { farm: 1, deliver: 1 }, targetPriorities: { warehouse: 1.5, farm: 1.0, road: 1.0 } },
      { groupId: "traders", intentWeights: { trade: 1.6 },          targetPriorities: { warehouse: 1.5, farm: 1.0, road: 1.0 } },
    ],
    groupStateTargets: {},
    fsmCounts: {},
    hostileCount: 0,
    factionTension: 0,
    threat: 0,
  }];
  const score = GroupDynamicsPlugin.selfScore(samples);
  assert.equal(score.coalition_coupling >= -1 && score.coalition_coupling <= 1, true);
  // Identical priority vectors → coupling near 1.
  assert.equal(score.coalition_coupling, 1);
});

test("GroupDynamics.state_target_obedience reports realized fsm vs target match", () => {
  // 4 workers; 3 in 'farm' state, 1 in 'eat'; group target = 'farm' → 3/4 = 0.75.
  const samples = [{
    t: 0,
    groupPolicies: [],
    groupStateTargets: { workers: "farm" },
    fsmCounts: { workers: { farm: 3, eat: 1 } },
    hostileCount: 0,
    factionTension: 0,
    threat: 0,
  }];
  const score = GroupDynamicsPlugin.selfScore(samples);
  assert.equal(score.state_target_obedience, 0.75);
});

test("GroupDynamics.faction_responsiveness Pearsons tension vs hostile count", () => {
  // Perfectly correlated rising tension and hostile count → r = 1.
  const samples = [
    { t: 0, groupPolicies: [], groupStateTargets: {}, fsmCounts: {}, hostileCount: 0, factionTension: 0, threat: 0 },
    { t: 1, groupPolicies: [], groupStateTargets: {}, fsmCounts: {}, hostileCount: 1, factionTension: 0.2, threat: 0 },
    { t: 2, groupPolicies: [], groupStateTargets: {}, fsmCounts: {}, hostileCount: 2, factionTension: 0.4, threat: 0 },
    { t: 3, groupPolicies: [], groupStateTargets: {}, fsmCounts: {}, hostileCount: 3, factionTension: 0.6, threat: 0 },
  ];
  const score = GroupDynamicsPlugin.selfScore(samples);
  assert.equal(score.faction_responsiveness, 1);
});

test("HierarchicalCoordination.plan_policy_alignment matches when plan tokens cover directive", () => {
  // Strategy: priority=defend (→ safety token), workerFocus=farm (→ farm).
  // Workers directive: targetPriorities.safety=1.2 + intentWeights.farm=1.0 → both present → alignment 2/2.
  const samples = [{
    t: 0,
    factionTension: 0,
    threat: 0,
    prosperity: 0,
    strategySnapshot: {
      priority: "defend",
      resourceFocus: "balanced",
      workerFocus: "farm",
      phase: "growth",
      defensePosture: "neutral",
    },
    workerPolicySnapshot: {
      intentWeights: { farm: 1.0, deliver: 1.2 },
      targetPriorities: { warehouse: 1.5, safety: 1.2 },
      focus: "depot throughput",
    },
  }];
  samples._colonyIntervals = [];
  const score = HierarchicalCoordinationPlugin.selfScore(samples);
  // Plan tokens = {safety, farm}; both in directive → 2/2 = 1.
  assert.equal(score.plan_policy_alignment, 1);
});

test("HierarchicalCoordination.plan_policy_alignment reports 0 when no plan tokens are testable", () => {
  // priority=grow (no token), workerFocus=balanced (skipped), no resource/phase token.
  const samples = [{
    t: 0,
    factionTension: 0, threat: 0, prosperity: 0,
    strategySnapshot: { priority: "grow", resourceFocus: "balanced", workerFocus: "balanced" },
    workerPolicySnapshot: { intentWeights: { farm: 1.0 }, targetPriorities: {}, focus: "" },
  }];
  samples._colonyIntervals = [];
  const score = HierarchicalCoordinationPlugin.selfScore(samples);
  // No testable plan tokens → alignment is 0 by convention (never NaN).
  assert.equal(score.plan_policy_alignment, 0);
});
