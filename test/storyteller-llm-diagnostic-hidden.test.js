// v0.8.2 Round-6 Wave-1 01b-playability (Step 4 + Step 5) test coverage.
//
// Step 4 changed `whisperBlockedReason` to in-fiction copy (no "LLM" /
// "WHISPER" / "errored" tokens) and stashed the engineer-facing strings on
// `whisperBlockedReasonDev`. Step 5 dev-mode-gates the dev string in the
// HUD tooltip / span. This test pins down the source-of-truth contract on
// the storytellerStrip model directly so a future refactor that loses the
// `whisperBlockedReasonDev` field, or leaks "LLM" into the player-facing
// reason, fails loudly.

import test from "node:test";
import assert from "node:assert/strict";

import { computeStorytellerStripModel } from "../src/ui/hud/storytellerStrip.js";

function stateFor(overrides = {}) {
  const groupPolicies = new Map();
  groupPolicies.set("workers", {
    data: { focus: "rebuild the broken supply lane", summary: "cargo queue saturated" },
  });
  return {
    ai: {
      lastPolicySource: overrides.source ?? "fallback",
      lastPolicyError: overrides.error ?? "",
      policyLlmCount: Number(overrides.policyLlmCount ?? 0),
      policyDecisionCount: Number(overrides.policyDecisionCount ?? 0),
      lastPolicyBatch: [],
      groupPolicies,
    },
    metrics: { proxyHealth: overrides.proxyHealth ?? "ok", timeSec: 100 },
    gameplay: { scenario: { phase: "logistics" } },
    world: { mapTemplateId: "temperate_plains" },
    debug: {},
  };
}

test("casual whisperBlockedReason never contains LLM/WHISPER/errored tokens", () => {
  const cases = [
    stateFor({ source: "llm" }),
    stateFor({ source: "llm", error: "http 503" }),
    stateFor({ source: "fallback", proxyHealth: "error" }),
    stateFor({ source: "fallback", policyLlmCount: 0 }),
    stateFor({ source: "fallback", policyLlmCount: 4 }),
  ];
  for (const state of cases) {
    const model = computeStorytellerStripModel(state);
    const reason = String(model.diagnostic.whisperBlockedReason ?? "");
    assert.ok(reason.length > 0, "casual reason must not be empty");
    assert.doesNotMatch(
      reason,
      /LLM|WHISPER|errored|proxy|http/i,
      `casual reason leaked dev token: "${reason}" (badge=${model.badgeState})`,
    );
    // Dev string still carries the engineer info.
    assert.ok(
      String(model.diagnostic.whisperBlockedReasonDev ?? "").length > 0,
      `dev reason must not be empty (badge=${model.badgeState})`,
    );
  }
});

test("dev whisperBlockedReasonDev preserves the engineer phrasing for each badge", () => {
  const dev = (state) => computeStorytellerStripModel(state).diagnostic.whisperBlockedReasonDev;
  assert.match(dev(stateFor({ source: "llm" })), /WHISPER/i);
  assert.match(dev(stateFor({ source: "llm", error: "http 503" })), /stale/i);
  assert.match(dev(stateFor({ source: "fallback", proxyHealth: "error" })), /errored/i);
  assert.match(dev(stateFor({ source: "fallback", policyLlmCount: 0 })), /never reached/i);
});
