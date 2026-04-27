import test from "node:test";
import assert from "node:assert/strict";

import { computeStorytellerStripModel } from "../src/ui/hud/storytellerStrip.js";

// v0.8.2 Round-5b Wave-1 (01e Step 1) — LLM state diagnostic overlay.
// Synthesises a human-readable "Why no WHISPER?" string from existing state
// fields. Five badgeState branches × five reason strings.
//
// v0.8.2 Round-6 Wave-1 01b-playability (Step 4) — the player-facing
// `whisperBlockedReason` was rewritten as in-fiction "Story Director: ..."
// copy. The original engineer strings are preserved on
// `diagnostic.whisperBlockedReasonDev` for dev-mode HUD overlays. The
// assertions below check BOTH so a future regression on either field is
// caught.

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

test("diagnostic: llm-live → in-fiction reason + dev='LLM live — WHISPER active'", () => {
  const state = stateFor({ source: "llm" });
  const model = computeStorytellerStripModel(state);
  assert.equal(model.badgeState, "llm-live");
  assert.match(model.diagnostic.whisperBlockedReason, /Story Director/);
  assert.equal(model.diagnostic.whisperBlockedReasonDev, "LLM live \u2014 WHISPER active");
});

test("diagnostic: llm-stale (source llm + error) → in-fiction + dev contains 'stale'", () => {
  const state = stateFor({ source: "llm", error: "http 503" });
  const model = computeStorytellerStripModel(state);
  assert.equal(model.badgeState, "llm-stale");
  assert.match(model.diagnostic.whisperBlockedReason, /Story Director/);
  assert.match(model.diagnostic.whisperBlockedReasonDev, /stale/i);
});

test("diagnostic: fallback-degraded (proxyHealth=error) → in-fiction + dev='LLM errored (...)'", () => {
  const state = stateFor({ source: "fallback", proxyHealth: "error" });
  const model = computeStorytellerStripModel(state);
  assert.equal(model.badgeState, "fallback-degraded");
  assert.match(model.diagnostic.whisperBlockedReason, /Story Director/);
  assert.match(model.diagnostic.whisperBlockedReasonDev, /LLM errored/);
});

test("diagnostic: fallback-healthy + policyLlmCount=0 → in-fiction + dev='LLM never reached'", () => {
  const state = stateFor({ source: "fallback", policyLlmCount: 0 });
  const model = computeStorytellerStripModel(state);
  assert.equal(model.badgeState, "fallback-healthy");
  assert.match(model.diagnostic.whisperBlockedReason, /Story Director/);
  assert.equal(model.diagnostic.whisperBlockedReasonDev, "LLM never reached");
});

test("diagnostic: idle → in-fiction + dev='No policy yet'", () => {
  const state = stateFor({ source: "none", withPolicy: false });
  const model = computeStorytellerStripModel(state);
  assert.equal(model.badgeState, "idle");
  assert.match(model.diagnostic.whisperBlockedReason, /Story Director/);
  assert.equal(model.diagnostic.whisperBlockedReasonDev, "No policy yet");
});
