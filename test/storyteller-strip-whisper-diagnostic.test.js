import test from "node:test";
import assert from "node:assert/strict";

import { computeStorytellerStripModel } from "../src/ui/hud/storytellerStrip.js";

// v0.8.2 Round-5b Wave-1 (01e Step 1) — LLM state diagnostic overlay.
// Synthesises a human-readable "Why no WHISPER?" string from existing state
// fields. Five badgeState branches × five reason strings.

function stateFor(overrides = {}) {
  const groupPolicies = new Map();
  if (overrides.withPolicy !== false) {
    groupPolicies.set("workers", {
      data: { focus: overrides.focus ?? "rebuild the broken supply lane", summary: "cargo queue saturated" },
    });
  }
  return {
    ai: {
      lastPolicySource: overrides.source ?? "none",
      lastPolicyError: overrides.error ?? "",
      policyLlmCount: Number(overrides.policyLlmCount ?? 0),
      policyDecisionCount: Number(overrides.policyDecisionCount ?? 0),
      lastPolicyBatch: overrides.policies ?? [],
      groupPolicies,
    },
    metrics: { proxyHealth: overrides.proxyHealth ?? "ok", timeSec: 100 },
    gameplay: { scenario: { phase: "logistics" } },
    world: { mapTemplateId: "temperate_plains" },
    debug: {},
  };
}

test("diagnostic: llm-live → 'LLM live — WHISPER active'", () => {
  const state = stateFor({ source: "llm" });
  const model = computeStorytellerStripModel(state);
  assert.equal(model.badgeState, "llm-live");
  assert.equal(model.diagnostic.whisperBlockedReason, "LLM live \u2014 WHISPER active");
});

test("diagnostic: llm-stale (source llm + error) → 'LLM stale' phrase", () => {
  const state = stateFor({ source: "llm", error: "http 503" });
  const model = computeStorytellerStripModel(state);
  assert.equal(model.badgeState, "llm-stale");
  assert.match(model.diagnostic.whisperBlockedReason, /stale/i);
});

test("diagnostic: fallback-degraded (proxyHealth=error) → 'LLM errored' phrase", () => {
  const state = stateFor({ source: "fallback", proxyHealth: "error" });
  const model = computeStorytellerStripModel(state);
  assert.equal(model.badgeState, "fallback-degraded");
  assert.match(model.diagnostic.whisperBlockedReason, /LLM errored/);
});

test("diagnostic: fallback-healthy + policyLlmCount=0 → 'LLM never reached'", () => {
  const state = stateFor({ source: "fallback", policyLlmCount: 0 });
  const model = computeStorytellerStripModel(state);
  assert.equal(model.badgeState, "fallback-healthy");
  assert.equal(model.diagnostic.whisperBlockedReason, "LLM never reached");
});

test("diagnostic: idle → 'No policy yet'", () => {
  const state = stateFor({ source: "none", withPolicy: false });
  const model = computeStorytellerStripModel(state);
  assert.equal(model.badgeState, "idle");
  assert.equal(model.diagnostic.whisperBlockedReason, "No policy yet");
});
