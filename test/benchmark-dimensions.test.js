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
