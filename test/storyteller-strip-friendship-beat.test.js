// v0.8.2 Round-6 Wave-3 (02e-indie-critic Step 8) — Author Voice Channel
// expansion. Verifies the 5 new SALIENT_BEAT_PATTERNS (friendship, birth-of,
// named-after, dream, grieving) are picked up by extractLatestNarrativeBeat
// and classified into the right kind by formatBeatTextWithKind.
//
// Plan: assignments/homework6/Agent-Feedback-Loop/Round6/Plans/02e-indie-critic.md
// Risk #2: friendship beats fire 5-10× more often than sabotage; the ring
// buffer + dwell live in HUDController, but the SALIENT match itself must
// be cheap, deterministic, and tagged so the ticker can colour-code each
// kind independently.

import test from "node:test";
import assert from "node:assert/strict";

import {
  extractLatestNarrativeBeat,
  formatBeatTextWithKind,
} from "../src/ui/hud/storytellerStrip.js";

function buildStateWithTrace(traceLine, nowSec = 5) {
  return {
    metrics: { timeSec: nowSec },
    debug: { eventTrace: [traceLine] },
  };
}

test("extractLatestNarrativeBeat surfaces friendship 'became close friend' beat", () => {
  const state = buildStateWithTrace("[3.2s] Mose Jorvik became Close friend with Mose Hale");
  const beat = extractLatestNarrativeBeat(state);
  assert.ok(beat, "extractor returns a beat for friendship line");
  assert.match(beat.line, /became.*friend/i);
});

test("formatBeatTextWithKind classifies a friendship beat as kind=friendship", () => {
  const state = buildStateWithTrace("[3.2s] Mose Jorvik became Close friend with Mose Hale");
  const beat = extractLatestNarrativeBeat(state);
  const formatted = formatBeatTextWithKind(beat);
  assert.ok(formatted, "formatter returns a structured payload");
  assert.equal(formatted.kind, "friendship");
  assert.match(formatted.text, /Last:/);
  assert.match(formatted.text, /became.*friend/i);
  // The icon is opaque to text-readers — we only assert it is a non-empty
  // string so the ticker has something to render in the icon span.
  assert.ok(typeof formatted.icon === "string" && formatted.icon.length > 0);
});

test("extractLatestNarrativeBeat surfaces 'birth of' beat", () => {
  const state = buildStateWithTrace("[2.0s] We mark the birth of Aila-3, daughter of Mose Hale.");
  const beat = extractLatestNarrativeBeat(state);
  assert.ok(beat, "extractor returns a beat for birth-of line");
  assert.match(beat.line, /birth of/i);
  const formatted = formatBeatTextWithKind(beat);
  assert.equal(formatted?.kind, "birth");
});

test("extractLatestNarrativeBeat surfaces 'named after' beat as a birth kind", () => {
  const state = buildStateWithTrace("[1.5s] Aila-4 was named after a fallen herbalist.");
  const beat = extractLatestNarrativeBeat(state);
  assert.ok(beat);
  const formatted = formatBeatTextWithKind(beat);
  assert.equal(formatted?.kind, "birth");
});

test("extractLatestNarrativeBeat surfaces 'dream' beat", () => {
  const state = buildStateWithTrace("[4.1s] Mose Hale spoke of a dream of dry winters and full larders.");
  const beat = extractLatestNarrativeBeat(state);
  assert.ok(beat, "extractor returns a beat for dream line");
  const formatted = formatBeatTextWithKind(beat);
  assert.equal(formatted?.kind, "dream");
});

test("extractLatestNarrativeBeat surfaces 'grieving' beat as friendship kind", () => {
  const state = buildStateWithTrace("[4.5s] Mose Jorvik is grieving the loss of a close friend.");
  const beat = extractLatestNarrativeBeat(state);
  assert.ok(beat);
  const formatted = formatBeatTextWithKind(beat);
  assert.equal(formatted?.kind, "friendship");
});

test("formatBeatTextWithKind returns null for an empty beat", () => {
  assert.equal(formatBeatTextWithKind(null), null);
  assert.equal(formatBeatTextWithKind({ line: "", ageSec: 0 }), null);
});

test("NARRATIVE_BEAT_MAX_AGE_SEC raised to 20s — 18s-old friendship still surfaces", () => {
  // Pre-Wave-3 02e the cap was 15s; raising to 20s lets the longer-lived
  // friendship/dream beats stay on the strip long enough to actually be
  // read. The line below would have been pruned at 15s; under the new
  // 20s cap it must still come through.
  const state = {
    metrics: { timeSec: 20 },
    debug: { eventTrace: ["[2.0s] Mose Jorvik became Close friend with Mose Hale"] },
  };
  const beat = extractLatestNarrativeBeat(state);
  assert.ok(beat, "18s-old friendship beat survives the new 20s cap");
  assert.equal(beat.ageSec, 18);
});
