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

import {
  computeStorytellerStripText,
  computeStorytellerStripModel,
} from "../src/ui/hud/storytellerStrip.js";

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
  assert.match(text, /push the frontier outward/);
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
  assert.match(text, /push the frontier outward/);
  assert.match(text, /colony on autopilot/);
});

// v0.8.2 Round-1 02d-roleplayer — `computeStorytellerStripModel` now returns
// `beatText`: a formatted narrative-beat line extracted from the latest
// salient entry in `state.debug.eventTrace`. HUDController renders that
// field into a dedicated `#storytellerBeat` child span (D4 arbitration), so
// the tests assert against the model return value — NOT the legacy
// `computeStorytellerStripText` (which is intentionally untouched).

test("computeStorytellerStripModel: salient SABOTAGE beat surfaces with age (s ago)", () => {
  const state = {
    metrics: { timeSec: 121.2 },
    debug: {
      eventTrace: [
        "[120.5s] [SABOTAGE] visitor_16 sabotaged colony",
      ],
    },
    ai: {
      lastPolicySource: "fallback",
      groupPolicies: new Map([
        ["workers", { data: { focus: "frontier buildout", summary: "Stone is low." } }],
      ]),
    },
  };
  const model = computeStorytellerStripModel(state);
  assert.ok(model.beatText, `expected a beatText but got ${model.beatText}`);
  // 121.2 - 120.5 = 0.7 → rounds to 1 → "1s ago".
  assert.match(model.beatText, /Last:\s*\[SABOTAGE\] visitor_16 sabotaged colony \(1s ago\)/);
  // Focus/summary channels remain intact.
  assert.equal(model.focusText, "push the frontier outward while keeping the rear supplied");
  assert.match(model.summaryText, /Stone is low/);
});

test("computeStorytellerStripModel: non-salient trace line (weather steady) does not produce a beat", () => {
  const state = {
    metrics: { timeSec: 50.5 },
    debug: {
      eventTrace: [
        "[50.0s] weather steady",
      ],
    },
    ai: {
      lastPolicySource: "fallback",
      groupPolicies: new Map([
        ["workers", { data: { focus: "frontier buildout", summary: "Lumber stable." } }],
      ]),
    },
  };
  const model = computeStorytellerStripModel(state);
  // Non-salient: prefix does not match any of the 6 salient patterns.
  assert.equal(model.beatText, null,
    `non-salient trace should not produce beat, got: ${model.beatText}`);
});

test("computeStorytellerStripModel: trace line older than 15s horizon is filtered out (expired beat)", () => {
  const state = {
    // ageSec = 40 - 0 = 40 → exceeds the 15s gate, beat must be null.
    metrics: { timeSec: 40 },
    debug: {
      eventTrace: [
        "[0.0s] [SABOTAGE] visitor_16 sabotaged colony",
      ],
    },
    ai: {
      lastPolicySource: "fallback",
      groupPolicies: new Map([
        ["workers", { data: { focus: "frontier buildout", summary: "Stone is low." } }],
      ]),
    },
  };
  const model = computeStorytellerStripModel(state);
  assert.equal(model.beatText, null,
    `expired beat should be filtered, got: ${model.beatText}`);
});
