// v0.8.2 Round-1 01a-onboarding — HUD glossary unit tests.
// Plan: assignments/homework6/Agent-Feedback-Loop/Round1/Plans/01a-onboarding.md
//
// Validates:
// (a) HUD_GLOSSARY contains every feedback §2.6 term so new players get
//     hover explanations for Dev / routes / wh / farms / lumbers / walls /
//     prosperity / threat / storyteller / HAUL / COOK / SMITH / HERBALIST
//     / heatLens.
// (b) All values are non-empty strings <= 120 chars (fits browser tooltip
//     display width, matches plan's one-line budget).
// (c) explainTerm("unknown") returns "" rather than throwing so render
//     paths don't need defensive try/catch.
// (d) Snapshot-lock on sorted keys so a later author can't silently drop
//     terms — drift flips this test and forces an intentional decision.

import test from "node:test";
import assert from "node:assert/strict";

import { HUD_GLOSSARY, explainTerm } from "../../src/ui/hud/glossary.js";

// Feedback §2.6 enumerates these abbreviations as the ones that had no
// hover explanation anywhere in the HUD. Must all be present.
const REQUIRED_TERMS = Object.freeze([
  "dev",
  "routes",
  "wh",
  "farms",
  "lumbers",
  "walls",
  "prosperity",
  "threat",
  "storyteller",
  "haul",
  "cook",
  "smith",
  "herbalist",
  "heatLens",
]);

test("HUD_GLOSSARY covers every feedback §2.6 abbreviation", () => {
  for (const term of REQUIRED_TERMS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(HUD_GLOSSARY, term),
      `Expected HUD_GLOSSARY to explain "${term}" (feedback §2.6)`,
    );
  }
});

test("HUD_GLOSSARY values are non-empty one-line strings <= 120 chars", () => {
  for (const [key, value] of Object.entries(HUD_GLOSSARY)) {
    assert.equal(typeof value, "string", `${key} must be a string`);
    assert.ok(value.length > 0, `${key} must not be empty`);
    assert.ok(
      value.length <= 120,
      `${key} explanation is ${value.length} chars (max 120): "${value}"`,
    );
    assert.ok(
      !value.includes("\n"),
      `${key} must be a single line (no embedded newlines)`,
    );
  }
});

test("explainTerm returns the dictionary value for known keys", () => {
  assert.equal(explainTerm("dev"), HUD_GLOSSARY.dev);
  assert.equal(explainTerm("haul"), HUD_GLOSSARY.haul);
  assert.equal(explainTerm("heatLens"), HUD_GLOSSARY.heatLens);
  assert.equal(explainTerm("autopilotOff"), HUD_GLOSSARY.autopilotOff);
});

test("explainTerm returns empty string for unknown / null keys (no throw)", () => {
  assert.equal(explainTerm("unknown"), "");
  assert.equal(explainTerm(null), "");
  assert.equal(explainTerm(undefined), "");
  assert.equal(explainTerm(""), "");
  // Defensive: must not throw on numeric/object inputs either.
  assert.doesNotThrow(() => explainTerm(42));
  assert.doesNotThrow(() => explainTerm({}));
});

test("HUD_GLOSSARY is frozen (immutable at module level)", () => {
  assert.ok(Object.isFrozen(HUD_GLOSSARY), "HUD_GLOSSARY must be frozen");
  assert.throws(() => {
    "use strict";
    HUD_GLOSSARY.dev = "mutated";
  }, "frozen object should reject writes in strict mode");
});

test("HUD_GLOSSARY key set is locked (snapshot-style guard)", () => {
  // Sorted-key snapshot — if you add/remove a term intentionally, update
  // EXPECTED below. This guards against unintentional drift.
  const EXPECTED = [
    "autopilotOff",
    "autopilotOn",
    "cook",
    "dev",
    "devIndex",
    "depots",
    "farms",
    // v0.8.2 Round-5 Wave-2 (01c-ui Step 7): foodRateBreakdown glossary
    // entry explains the "(prod +X / cons -Y / spoil -Z)" HUD suffix.
    "foodRateBreakdown",
    "haul",
    "heatLens",
    "herbalist",
    "lumbers",
    "perBirth",
    "perDeath",
    "perSec",
    "prosperity",
    "routes",
    "scenarioGap",
    "smith",
    "storyteller",
    "survivedScore",
    "threat",
    "walls",
    "wh",
  ].sort();
  const actual = Object.keys(HUD_GLOSSARY).sort();
  assert.deepEqual(actual, EXPECTED,
    "HUD_GLOSSARY keys drifted from snapshot — update EXPECTED if intentional");
});
