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
  // Round-5 Wave-3 golden update (01e + 02e):
  //  - focusText now gains the "DIRECTOR picks " prefix in fallback mode
  //    (01e Step 3) so the decision-maker is explicit in the strip.
  //  - summaryText is now sourced from AUTHOR_VOICE_PACK when the template +
  //    focusTag match (02e Step 3). For temperate_plains + frontier focus
  //    we expect the openingPressure line lifted from ScenarioFactory.js.
  //  - badgeState is `fallback-healthy` (no proxy error, no lastPolicyError).
  const state = {
    gameplay: { scenario: { title: "Broken Frontier" } },
    world: { mapTemplateId: "temperate_plains" },
    ai: {
      lastPolicySource: "fallback",
      groupPolicies: new Map([
        [
          "workers",
          {
            data: {
              focus: "frontier buildout",
              summary: "Hunger spikes. Pull cooks to kitchens.",
            },
          },
        ],
      ]),
    },
  };
  const model = computeStorytellerStripModel(state);
  assert.equal(model.mode, "fallback");
  assert.equal(model.prefix, "DIRECTOR");
  assert.equal(model.badgeState, "fallback-healthy");
  assert.equal(model.templateTag, "Broken Frontier - Temperate Plains");
  assert.match(model.focusText, /^DIRECTOR picks /);
  assert.match(model.focusText, /push the frontier outward/);
  assert.equal(model.voicePackHit, true);
  // Voice-pack hit: summary reads like the author's opening pressure line.
  assert.match(model.summaryText, /frontier is wide open|stalls fast/i);
  // The deprecated "Workers should sustain <verb>" and the "colony should
  // sustain <verb>" grammar traps must never leak through the strip.
  assert.ok(!/sustain frontier buildout/.test(model.summaryText),
    `debug phrase leaked: ${model.summaryText}`);
  assert.ok(!/workers should sustain/i.test(model.summaryText),
    `legacy template leaked: ${model.summaryText}`);
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
  // Round-5 Wave-3 golden update: focusText now prefixed with
  // "DIRECTOR picks " in fallback mode (01e Step 3). With no mapTemplateId
  // set, the voice-pack falls through to the `*` default bucket, so
  // summaryText is the "stocked warehouse" line from BuildAdvisor. We only
  // assert the prefix + voice-pack hit marker; the exact text is governed
  // by AUTHOR_VOICE_PACK.
  const state = {
    ai: {
      lastPolicySource: "fallback",
      groupPolicies: { workers: { focus: "stockpile food", summary: "Reserve dwindling." } },
    },
  };
  const model = computeStorytellerStripModel(state);
  assert.equal(model.mode, "fallback");
  assert.equal(model.prefix, "DIRECTOR");
  assert.match(model.focusText, /^DIRECTOR picks /);
  assert.match(model.focusText, /stockpile food/);
  assert.equal(model.voicePackHit, true);
  assert.ok(model.summaryText.length > 0);
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

// v0.8.2 Round-5 Wave-3 (02e Step 7) — author-voice pack reach-through,
// WHISPER degradation honesty, and sustain+reconnect regression guard.

test("computeStorytellerStripModel: fortified_basin + broken-routes focus hits AUTHOR_VOICE_PACK", () => {
  // Voice-pack case (a) — author's "danger is not distance but exposure"
  // line from ScenarioFactory.js must reach the HUD summary.
  const state = {
    world: { mapTemplateId: "fortified_basin" },
    ai: {
      lastPolicySource: "fallback",
      groupPolicies: new Map([
        [
          "workers",
          { data: { focus: "rebuild the broken supply lane", summary: "noise noise noise." } },
        ],
      ]),
    },
  };
  const model = computeStorytellerStripModel(state);
  assert.equal(model.voicePackHit, true);
  assert.match(model.summaryText, /danger is not distance but exposure/);
});

test("computeStorytellerStripModel: llm source + lastPolicyError → DIRECTOR + badgeState llm-stale", () => {
  // Voice-pack case (b) — WHISPER must NOT light up when the LLM errored on
  // the most recent tick; the badge honestly reports `llm-stale` and the
  // prefix falls back to DIRECTOR.
  const state = {
    ai: {
      lastPolicySource: "llm",
      lastPolicyError: "HTTP 503",
      groupPolicies: new Map([
        ["workers", { data: { focus: "food recovery", summary: "Redirect haulers." } }],
      ]),
    },
  };
  const model = computeStorytellerStripModel(state);
  assert.equal(model.mode, "llm");
  assert.equal(model.badgeState, "llm-stale");
  assert.equal(model.prefix, "DIRECTOR");
});

test("computeStorytellerStripModel: any fallback input never emits both 'sustain' and 'reconnect'", () => {
  // Voice-pack case (c) — bug-regression guard: the deprecated
  // "sustain <verb-phrase>" template used to combine with a downstream
  // "rebuild→reconnect" rewrite to produce "sustain reconnect the broken
  // supply lane" in the HUD. humaniseSummary's entry prehook + rule
  // removals make that phrase unreachable under any fallback input shape.
  const shapes = [
    { focus: "rebuild the broken supply lane", summary: "Workers should sustain rebuild the broken supply lane." },
    { focus: "frontier buildout", summary: "Workers should sustain reconnect the broken supply lane while keeping hunger low." },
    { focus: "cargo relief", summary: "the colony should sustain clear the stalled cargo now." },
    { focus: "stockpile throughput", summary: "sustain reconnect the broken supply lane before dusk." },
  ];
  for (const shape of shapes) {
    const state = {
      ai: {
        lastPolicySource: "fallback",
        groupPolicies: new Map([["workers", { data: shape }]]),
      },
    };
    const model = computeStorytellerStripModel(state);
    const combined = `${model.focusText} ${model.summaryText}`.toLowerCase();
    const hasSustain = /\bsustain\b/.test(combined);
    const hasReconnect = /\breconnect\b/.test(combined);
    assert.ok(!(hasSustain && hasReconnect),
      `sustain+reconnect regression: focus="${model.focusText}" summary="${model.summaryText}"`);
  }
});

test("computeStorytellerStripModel: fallback-healthy vs fallback-degraded badgeState distinction", () => {
  const healthy = computeStorytellerStripModel({
    ai: {
      lastPolicySource: "fallback",
      groupPolicies: new Map([["workers", { data: { focus: "frontier buildout", summary: "ok." } }]]),
    },
  });
  assert.equal(healthy.badgeState, "fallback-healthy");

  const degraded = computeStorytellerStripModel({
    metrics: { proxyHealth: "error" },
    ai: {
      lastPolicySource: "fallback",
      lastPolicyError: "HTTP 503",
      groupPolicies: new Map([["workers", { data: { focus: "frontier buildout", summary: "ok." } }]]),
    },
  });
  assert.equal(degraded.badgeState, "fallback-degraded");
});
