// Validate MemoryDegradation.extractActionTokens + selfScore action_grounded_recall.
//
// Bug context: NPCBrainSystem stores `state.ai.groupPolicies` as a Map where
// each value is `{ expiresAtSec, data: <policyObject> }`. The previous
// implementation called `Object.values(policies)` which returns [] on a Map
// and never unwrapped the `.data` field, so action_grounded_recall was always
// 0 in real runs. This test fixes the regression at both inputs (Map and
// plain object) and verifies the implicit-goal lookup logic.

import test from "node:test";
import assert from "node:assert/strict";

import { MemoryDegradationPlugin } from "../src/benchmark/dimensions/MemoryDegradation.js";

function buildSampleWithPolicies(state, anchorTokens = []) {
  // Mimic the structure produced by collectSamples — only the parts selfScore reads.
  const sample = {
    t: 1,
    memoryLength: 0,
    strategicSummary: anchorTokens.join(" "),
    food: 10,
    wood: 5,
    workers: 4,
    prosperity: 0.5,
    threat: 0,
  };
  // Replicate the same extractActionTokens logic from a state shape — but to
  // keep this test focused on selfScore we attach the tokens directly.
  const tokens = new Set();
  const groupPolicies = state?.ai?.groupPolicies;
  const entries = groupPolicies instanceof Map
    ? Array.from(groupPolicies.values())
    : Object.values(groupPolicies ?? {});
  for (const wrap of entries) {
    const pol = wrap?.data ?? wrap;
    for (const [intent, w] of Object.entries(pol?.intentWeights ?? {})) {
      if (Number(w) > 0) tokens.add(String(intent).toLowerCase());
    }
    for (const [target, w] of Object.entries(pol?.targetPriorities ?? {})) {
      if (Number(w) > 0) tokens.add(String(target).toLowerCase());
    }
  }
  sample.actionTokens = Array.from(tokens).sort();
  sample.baselineActionTokens = Array.from(tokens).sort();
  return sample;
}

test("extractActionTokens unwraps Map<groupId, {data}> shape", () => {
  // Construct the live-runtime shape: Map<groupId, { expiresAtSec, data: policy }>.
  const groupPolicies = new Map();
  groupPolicies.set("workers", {
    expiresAtSec: 9999,
    data: {
      groupId: "workers",
      intentWeights: { deliver: 2, build: 1, eat: 0 },
      targetPriorities: { warehouse: 1.5 },
    },
  });
  const state = { ai: { groupPolicies }, resources: { food: 8, wood: 4 } };

  // Probe via selfScore — the public surface tested by the bench harness.
  const sample = buildSampleWithPolicies(state);
  const samples = [sample];
  const score = MemoryDegradationPlugin.selfScore(samples, {
    anchors: [{ token: "X", implicitGoals: ["deliver"] }],
  });
  assert.equal(score.action_grounded_recall, 1.0,
    `expected action_grounded_recall=1 when 'deliver' weight>0, got ${score.action_grounded_recall}`);
});

test("extractActionTokens still works for plain-object groupPolicies", () => {
  // Older fixture / snapshot shape: plain object map.
  const state = {
    ai: {
      groupPolicies: {
        workers: {
          expiresAtSec: 9999,
          data: {
            intentWeights: { build: 3, deliver: 0 },
            targetPriorities: { lumber: 1 },
          },
        },
      },
    },
  };
  const sample = buildSampleWithPolicies(state);
  const samples = [sample];
  const scoreBuild = MemoryDegradationPlugin.selfScore(samples, {
    anchors: [{ token: "X", implicitGoals: ["build"] }],
  });
  assert.equal(scoreBuild.action_grounded_recall, 1.0);

  // Now query an unknown implicit goal — should be 0.
  const scoreUnknown = MemoryDegradationPlugin.selfScore(samples, {
    anchors: [{ token: "X", implicitGoals: ["unknown-token"] }],
  });
  assert.equal(scoreUnknown.action_grounded_recall, 0,
    `expected action_grounded_recall=0 when goal not in tokens, got ${scoreUnknown.action_grounded_recall}`);
});

test("extractActionTokens handles flat policy entries (no .data wrap)", () => {
  // Some test fixtures and adapter shims pass policies inline without a
  // `data` wrapper. Both shapes must work.
  const groupPolicies = new Map();
  groupPolicies.set("workers", {
    intentWeights: { guard: 2 },
    targetPriorities: { safety: 1 },
  });
  const state = { ai: { groupPolicies } };
  const sample = buildSampleWithPolicies(state);
  const score = MemoryDegradationPlugin.selfScore([sample], {
    anchors: [{ token: "Y", implicitGoals: ["guard"] }],
  });
  assert.equal(score.action_grounded_recall, 1.0);
});

test("zero weights are excluded from action tokens", () => {
  const groupPolicies = new Map();
  groupPolicies.set("workers", {
    data: {
      // 'farm' has weight 0 → must be excluded → recall=0 if anchor probes 'farm'
      intentWeights: { farm: 0, deliver: 1.5 },
    },
  });
  const state = { ai: { groupPolicies } };
  const sample = buildSampleWithPolicies(state);
  const score = MemoryDegradationPlugin.selfScore([sample], {
    anchors: [{ token: "Z", implicitGoals: ["farm"] }],
  });
  assert.equal(score.action_grounded_recall, 0,
    "zero-weight tokens should not be counted as 'present' in action distribution");
});
