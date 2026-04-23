// v0.8.2 Round-1 01e-innovation — HUD Storyteller strip *model* unit tests.
// Plan: assignments/homework6/Agent-Feedback-Loop/Round1/Plans/01e-innovation.md
//
// computeStorytellerStripModel(state) is a pure function that returns the
// structured { mode, focusText, summaryText, prefix } payload that
// HUDController renders into the badge + focus + summary spans. The D3
// arbitration in Plans/summary.md fixed the badge copy:
//
//   mode === "llm"      → prefix "WHISPER"  (live LLM model in charge)
//   mode === "fallback" → prefix "DIRECTOR" (deterministic rule-based fallback)
//   mode === "idle"     → prefix "DRIFT"    (no policy yet)
//
// These tests exercise all three branches plus the legacy single-line
// `computeStorytellerStripText` back-compat signature so the HUD's
// pre-existing fallback renderer (when the badge spans are absent from the
// DOM) still works.

import test from "node:test";
import assert from "node:assert/strict";

import {
  computeStorytellerStripModel,
  computeStorytellerStripText,
} from "../src/ui/hud/storytellerStrip.js";

test("computeStorytellerStripModel: llm source → WHISPER prefix with humanised summary", () => {
  const state = {
    ai: {
      lastPolicySource: "llm",
      groupPolicies: new Map([
        [
          "workers",
          {
            data: {
              focus: "farming",
              summary: "Hunger spikes. Pull cooks to kitchens.",
            },
          },
        ],
      ]),
    },
  };
  const model = computeStorytellerStripModel(state);
  assert.equal(model.mode, "llm");
  assert.equal(model.prefix, "WHISPER");
  assert.equal(model.focusText, "farming");
  assert.equal(model.summaryText, "Hunger spikes.");
});

test("computeStorytellerStripModel: fallback source + policy → DIRECTOR prefix", () => {
  const state = {
    ai: {
      lastPolicySource: "fallback",
      groupPolicies: new Map([
        [
          "workers",
          {
            data: {
              focus: "frontier buildout",
              summary: "Workers should sustain frontier buildout while keeping hunger low.",
            },
          },
        ],
      ]),
    },
  };
  const model = computeStorytellerStripModel(state);
  assert.equal(model.mode, "fallback");
  assert.equal(model.prefix, "DIRECTOR");
  assert.equal(model.focusText, "push the frontier outward while keeping the rear supplied");
  // humaniseSummary rewrites both the buildout phrase and the "workers should"
  // opener into slightly more natural prose. The original phrase becomes
  // "the colony should sustain the frontier push".
  assert.match(model.summaryText, /the colony should sustain the frontier push/i);
  // Raw LLM debug fragments must not leak through verbatim.
  assert.ok(!/sustain frontier buildout/.test(model.summaryText),
    `debug phrase leaked: ${model.summaryText}`);
  assert.ok(!/workers should/.test(model.summaryText),
    `debug phrase leaked: ${model.summaryText}`);
});

test("computeStorytellerStripModel: no policy data → DRIFT idle mode with player-facing copy", () => {
  const state = {
    ai: {
      lastPolicySource: "none",
      groupPolicies: new Map(),
    },
  };
  const model = computeStorytellerStripModel(state);
  assert.equal(model.mode, "idle");
  assert.equal(model.prefix, "DRIFT");
  assert.equal(model.focusText, "autopilot");
  // Idle copy is fully human-readable (no raw debug tokens like "none" /
  // "null" / "workers.data==null").
  assert.match(model.summaryText, /colony holding steady/i);
  assert.ok(!/null|undefined|none/.test(model.summaryText),
    `idle summary leaked debug token: ${model.summaryText}`);
});

test("computeStorytellerStripModel: none source BUT populated policy → DIRECTOR (not idle)", () => {
  // Edge case: source might be "none" on the very first tick while the
  // fallback planner has already published a policy. Mode must follow
  // the presence of policy data, not the source string alone.
  const state = {
    ai: {
      lastPolicySource: "none",
      groupPolicies: new Map([
        ["workers", { data: { focus: "food recovery", summary: "Reserve dwindling." } }],
      ]),
    },
  };
  const model = computeStorytellerStripModel(state);
  assert.equal(model.mode, "fallback");
  assert.equal(model.prefix, "DIRECTOR");
});

test("computeStorytellerStripModel: plain-object groupPolicies stub is tolerated", () => {
  const state = {
    ai: {
      lastPolicySource: "fallback",
      groupPolicies: { workers: { focus: "stockpile food", summary: "Reserve dwindling." } },
    },
  };
  const model = computeStorytellerStripModel(state);
  assert.equal(model.mode, "fallback");
  assert.equal(model.prefix, "DIRECTOR");
  assert.equal(model.focusText, "stockpile food");
  assert.match(model.summaryText, /Reserve dwindling/);
});

test("computeStorytellerStripText: legacy single-line signature unchanged for idle path", () => {
  // Back-compat guard: the HUDController falls back to the single-line
  // string when the structured badge spans are missing from the DOM
  // (older templates, JSDOM-less test rigs). That contract MUST keep
  // producing the same "Rule-based storyteller idle …" copy the existing
  // hud-storyteller.test.js asserts on.
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

test("computeStorytellerStripText: legacy fallback source renders Rule-based Storyteller prefix", () => {
  const state = {
    ai: {
      lastPolicySource: "fallback",
      groupPolicies: new Map([
        ["workers", { data: { focus: "food recovery", summary: "Redirect haulers to kitchens." } }],
      ]),
    },
  };
  const text = computeStorytellerStripText(state);
  assert.match(text, /Rule-based Storyteller/);
  assert.match(text, /food recovery/);
  assert.match(text, /Redirect haulers to kitchens/);
});
