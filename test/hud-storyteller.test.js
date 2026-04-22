// v0.8.2 Round-0 01e-innovation — HUD Storyteller strip unit tests.
// Plan: assignments/homework6/Agent-Feedback-Loop/Round0/Plans/01e-innovation.md
//
// computeStorytellerStripText is a pure function extracted from
// HUDController so we can assert its output without a DOM. The HUD element
// itself is just a <div id="storytellerStrip"> that receives this string.
//
// Tests cover the three UX-critical branches:
//   (a) no groupPolicies entry → idle fallback copy ("fallback-as-feature"
//       instead of going silent);
//   (b) fallback source with a populated workers policy → "Rule-based
//       Storyteller" prefix + focus + first-sentence summary;
//   (c) llm source → "LLM Storyteller" prefix (distinct branding so the
//       player can tell which AI is driving the colony).

import test from "node:test";
import assert from "node:assert/strict";

import { computeStorytellerStripText } from "../src/ui/hud/storytellerStrip.js";

test("idle fallback text when no workers group policy is set", () => {
  const state = {
    ai: {
      lastPolicySource: "none",
      groupPolicies: new Map(),
    },
  };
  const text = computeStorytellerStripText(state);
  assert.match(text, /Rule-based storyteller idle/);
  assert.match(text, /colony on autopilot/);
});

test("fallback-source + populated workers policy renders Rule-based Storyteller prefix with focus/summary", () => {
  const state = {
    ai: {
      lastPolicySource: "fallback",
      groupPolicies: new Map([
        [
          "workers",
          {
            data: {
              focus: "frontier buildout",
              summary: "Stone is low, boosting quarry work. Lumber is stable.",
            },
          },
        ],
      ]),
    },
  };
  const text = computeStorytellerStripText(state);
  assert.match(text, /Rule-based Storyteller/);
  assert.match(text, /frontier buildout/);
  assert.match(text, /Stone is low/);
  // Only the first sentence of summary must appear, so the second clause is
  // clipped off.
  assert.ok(!/Lumber is stable/.test(text), `multi-sentence summary leaked through: ${text}`);
});

test("llm source swaps the prefix to 'LLM Storyteller'", () => {
  const state = {
    ai: {
      lastPolicySource: "llm",
      groupPolicies: new Map([
        ["workers", { data: { focus: "food recovery", summary: "Redirect haulers to kitchens" } }],
      ]),
    },
  };
  const text = computeStorytellerStripText(state);
  assert.match(text, /LLM Storyteller/);
  assert.match(text, /food recovery/);
  assert.match(text, /Redirect haulers to kitchens/);
  assert.ok(!/Rule-based Storyteller/.test(text));
});

test("gracefully handles a plain-object groupPolicies stub (for non-Map test rigs)", () => {
  const state = {
    ai: {
      lastPolicySource: "fallback",
      groupPolicies: { workers: { focus: "stockpile food", summary: "Reserve dwindling" } },
    },
  };
  const text = computeStorytellerStripText(state);
  assert.match(text, /Rule-based Storyteller/);
  assert.match(text, /stockpile food/);
  assert.match(text, /Reserve dwindling/);
});

test("missing summary still produces a readable strip by falling back to 'colony on autopilot'", () => {
  const state = {
    ai: {
      lastPolicySource: "fallback",
      groupPolicies: new Map([["workers", { data: { focus: "frontier buildout", summary: "" } }]]),
    },
  };
  const text = computeStorytellerStripText(state);
  assert.match(text, /Rule-based Storyteller/);
  assert.match(text, /frontier buildout/);
  assert.match(text, /colony on autopilot/);
});
