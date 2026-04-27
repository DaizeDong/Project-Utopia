// v0.8.2 Round-6 Wave-3 (01e-innovation Step 7) — voice pack round-robin
// coverage. Asserts the storyteller strip:
//   1. Rotates through ≥3 distinct voice lines for the same template+tag
//      across 4 different timeSec values (0 / 30 / 60 / 90).
//   2. Is deterministic for a given (state, timeSec) tuple — same input
//      twice produces identical summaryText.
//   3. Falls back through the template→default→global cascade gracefully
//      when the focusTag is unknown.

import test from "node:test";
import assert from "node:assert/strict";

import { computeStorytellerStripModel } from "../src/ui/hud/storytellerStrip.js";

function stateAtTime(timeSec, focus = "rebuild the broken supply lane") {
  return {
    world: { mapTemplateId: "temperate_plains" },
    metrics: { timeSec },
    ai: {
      lastPolicySource: "fallback",
      groupPolicies: new Map([
        ["workers", { data: { focus, summary: "noise" } }],
      ]),
    },
  };
}

test("voicepack round-robin: ≥3 distinct lines across timeSec 0/30/60/90 (temperate_plains)", () => {
  const seen = new Set();
  for (const t of [0, 30, 60, 90]) {
    const model = computeStorytellerStripModel(stateAtTime(t));
    assert.equal(model.voicePackHit, true, `expected voicePackHit at timeSec=${t}`);
    seen.add(model.summaryText);
  }
  assert.ok(seen.size >= 3,
    `expected at least 3 distinct voice-pack lines across 4 timeSec slices; got ${seen.size} (${[...seen].join(" | ")})`);
});

test("voicepack round-robin: deterministic — same state twice → same summaryText", () => {
  const a = computeStorytellerStripModel(stateAtTime(0));
  const b = computeStorytellerStripModel(stateAtTime(0));
  assert.equal(a.summaryText, b.summaryText);

  const c = computeStorytellerStripModel(stateAtTime(120));
  const d = computeStorytellerStripModel(stateAtTime(120));
  assert.equal(c.summaryText, d.summaryText);
});

test("voicepack fallback: unknown focusTag falls through template default; unknown template falls through to global '*'", () => {
  // Unknown focusTag (deriveFocusTag returns "default") — temperate_plains
  // has a `default` bucket so we still get a voicePackHit and a non-empty
  // summary.
  const a = computeStorytellerStripModel(stateAtTime(0, "general management"));
  assert.equal(a.voicePackHit, true);
  assert.ok(a.summaryText.length > 0);

  // Unknown mapTemplateId — falls through to the `*` global bucket (which
  // exposes a `default` array).
  const b = computeStorytellerStripModel({
    world: { mapTemplateId: "nonexistent_template_id" },
    metrics: { timeSec: 0 },
    ai: {
      lastPolicySource: "fallback",
      groupPolicies: new Map([
        ["workers", { data: { focus: "general management", summary: "x" } }],
      ]),
    },
  });
  assert.equal(b.voicePackHit, true);
  assert.ok(b.summaryText.length > 0);
});
