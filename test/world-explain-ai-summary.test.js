// R12 Plan-R12-glued-tokens (A7 #2): regression test for the AI summary line
// in WorldExplain.getAiInsight. Pre-fix the template was `${groupId}:${focus}`
// which rendered as glued tokens ("saboteursstrike workersrebuild tradersshug")
// across the Live Causal Chain, AI Decisions, and Director timeline surfaces.
// Post-fix it is Title-Case + colon-space ("Workers: rebuild ...").

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { getAiInsight } from "../src/ui/interpretation/WorldExplain.js";

function buildStateWithGroups(entries) {
  const state = createInitialGameState({ seed: 1337 });
  state.ai = state.ai ?? {};
  state.ai.groupPolicies = state.ai.groupPolicies ?? new Map();
  for (const [groupId, focus] of entries) {
    state.ai.groupPolicies.set(groupId, {
      expiresAtSec: 60,
      data: {
        groupId,
        ttlSec: 60,
        riskTolerance: 0.5,
        intentWeights: {},
        targetPriorities: {},
        focus,
        summary: `${groupId} summary`,
        steeringNotes: [],
      },
    });
  }
  return state;
}

test("getAiInsight: Title-Case + colon-space separator for single group", () => {
  const state = buildStateWithGroups([["workers", "rebuild the broken supply lane"]]);
  const insight = getAiInsight(state);
  assert.match(insight.summary, /Workers: rebuild the broken supply lane/);
  assert.ok(!/workersrebuild/.test(insight.summary), "must not glue role+verb");
});

test("getAiInsight: multiple groups joined by ' | ' with Title-Case labels", () => {
  const state = buildStateWithGroups([
    ["workers", "rebuild the broken supply lane"],
    ["traders", "hug the warehouse lanes"],
    ["saboteurs", "strike a soft frontier corridor"],
  ]);
  const insight = getAiInsight(state);
  assert.match(insight.summary, /Workers: rebuild the broken supply lane/);
  assert.match(insight.summary, /Traders: hug the warehouse lanes/);
  assert.match(insight.summary, /Saboteurs: strike a soft frontier corridor/);
  assert.ok(insight.summary.includes(" | "), "groups joined by ' | '");
  // Negative regression on the exact glued tokens A7 captured in screenshots.
  assert.ok(!/saboteursstrike/.test(insight.summary), "no 'saboteursstrike'");
  assert.ok(!/workersrebuild/.test(insight.summary), "no 'workersrebuild'");
  assert.ok(!/tradershug/.test(insight.summary), "no 'tradershug'");
});

test("getAiInsight: no groups falls back to 'AI: no active directive'", () => {
  const state = createInitialGameState({ seed: 1337 });
  state.ai = state.ai ?? {};
  state.ai.groupPolicies = new Map();
  state.ai.lastEnvironmentDirective = null;
  const insight = getAiInsight(state);
  assert.equal(insight.summary, "AI: no active directive");
});

test("getAiInsight: defensive against empty/whitespace groupId", () => {
  const state = buildStateWithGroups([["", "noop"]]);
  // Should not crash; the groupId may render as empty but the focus survives.
  const insight = getAiInsight(state);
  assert.equal(typeof insight.summary, "string");
  assert.ok(insight.summary.length > 0);
});
