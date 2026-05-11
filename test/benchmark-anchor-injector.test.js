// Validate AnchorInjector — the protocol that seeds anchor observations into
// `harness.memoryStore` so that MemoryDegradation can probe verbal recall
// (anchor tokens in strategic-summary) and action-grounded recall (implicit
// goals preserved in directive distributions).
//
// Pre-fix: there was no plumbing to inject anchors at all; every E5 (anchor
// decay) experiment ran on an empty memoryStore so the recall scores were
// meaningless. This test verifies that:
//   1. injectAnchors writes observations through MemoryStore.addObservation
//   2. injected anchors surface in formatForPrompt() output
//   3. Falls back to direct observations.push if the API ever changes
//   4. Returns the expected { injected, skipped } counts

import test from "node:test";
import assert from "node:assert/strict";

import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";
import { injectAnchors } from "../src/benchmark/anchors/AnchorInjector.js";
import { MemoryDegradationPlugin } from "../src/benchmark/dimensions/MemoryDegradation.js";

function makeFakeHarness() {
  return { memoryStore: new MemoryStore() };
}

test("injectAnchors writes via MemoryStore.addObservation", () => {
  const harness = makeFakeHarness();
  const anchors = [
    { token: "ANCHOR-A", implicitGoals: ["deliver"] },
    { token: "ANCHOR-B", implicitGoals: ["guard"] },
    { token: "ANCHOR-C", implicitGoals: ["farm"] },
  ];
  const result = injectAnchors(harness, anchors, { atSec: 0 });
  assert.equal(result.injected, 3);
  assert.equal(result.skipped, 0);
  assert.equal(harness.memoryStore.observations.length, 3);
  for (const obs of harness.memoryStore.observations) {
    assert.equal(obs.category, "anchor");
    assert.equal(obs.importance, 5);
    assert.equal(obs.timeSec, 0);
  }
});

test("injected anchors surface via formatForPrompt", () => {
  const harness = makeFakeHarness();
  const anchors = [
    { token: "ANCHOR-WAREHOUSE-12-8", implicitGoals: ["deliver", "warehouse"] },
  ];
  injectAnchors(harness, anchors);
  const prompt = harness.memoryStore.formatForPrompt("warehouse", 0, 5);
  assert.ok(
    prompt.includes("ANCHOR-WAREHOUSE-12-8"),
    `formatForPrompt did not surface the injected anchor token: ${prompt}`,
  );
});

test("injectAnchors skips empty/invalid anchors and returns counts", () => {
  const harness = makeFakeHarness();
  const result = injectAnchors(harness, [
    { token: "OK" },
    null,
    { token: "" },
    "RAW-STRING-OK",
  ]);
  assert.equal(result.injected, 2, `expected 2 injected, got ${result.injected}`);
  assert.equal(result.skipped, 2, `expected 2 skipped, got ${result.skipped}`);
});

test("injectAnchors falls back to observations.push if no addObservation", () => {
  const harness = { memoryStore: { observations: [] } };
  const result = injectAnchors(harness, [{ token: "X" }, { token: "Y" }]);
  assert.equal(result.injected, 2);
  assert.equal(harness.memoryStore.observations.length, 2);
  assert.equal(harness.memoryStore.observations[0].text, "X");
  assert.equal(harness.memoryStore.observations[0].type, "observation");
  assert.equal(harness.memoryStore.observations[1].text, "Y");
});

test("injectAnchors with no memoryStore returns all-skipped without throwing", () => {
  const result = injectAnchors({}, [{ token: "A" }, { token: "B" }]);
  assert.equal(result.injected, 0);
  assert.equal(result.skipped, 2);
});

test("anchored_fact_recall > 0 once anchor token appears in strategicSummary", () => {
  const samples = [
    {
      t: 30,
      memoryLength: 12,
      strategicSummary: "Plan for ANCHOR-WAREHOUSE-12-8 logistics throughput",
      actionTokens: ["deliver"],
      baselineActionTokens: ["deliver"],
      food: 12, wood: 6, workers: 4, prosperity: 0.6, threat: 0,
    },
  ];
  const score = MemoryDegradationPlugin.selfScore(samples, {
    anchors: [{ token: "ANCHOR-WAREHOUSE-12-8", implicitGoals: ["deliver"] }],
  });
  assert.equal(score.anchored_fact_recall, 1.0);
  assert.equal(score.action_grounded_recall, 1.0);
});
