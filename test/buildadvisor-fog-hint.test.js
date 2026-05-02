import test from "node:test";
import assert from "node:assert/strict";

import {
  explainBuildReason,
  explainBuildRecovery,
} from "../src/simulation/construction/BuildAdvisor.js";

// v0.10.1-r4-A3 (F1) — actionable fog hint regression.
//
// A3 reviewer (Round 4 first-impression, friction F1, P0) reported that
// the `hidden_tile` rejection toast ("Cannot build on unexplored
// terrain. Scout this area first.") did not tell the player *how* to
// scout. The plan upgrades the message to mention the road-extension
// mechanic so a brand-new player can act on it without consulting docs.
//
// This test pins the actionable substring "extend a road" so future edits
// don't regress the reviewer-fix back to the bare "Scout this area first."
// wording. The full sentence text is intentionally NOT pinned — only the
// load-bearing phrase that gives the player a next step.

test("BuildAdvisor: hidden_tile reason text includes actionable 'extend a road' hint", () => {
  const text = explainBuildReason("hidden_tile");
  assert.equal(typeof text, "string", "explainBuildReason must return a string");
  assert.ok(text.length > 0, "hidden_tile reason text must be non-empty");
  assert.match(
    text,
    /extend a road/i,
    `hidden_tile reason text must mention "extend a road" so the player learns the scout mechanic; got: ${text}`,
  );
  // Sanity: the upgraded text still mentions "scout" or "fog" so the
  // player understands the failure is about visibility (not stockpile,
  // terrain type, or hard-cap).
  assert.match(
    text,
    /scout|fog|unexplored/i,
    `hidden_tile reason text must still surface the visibility framing; got: ${text}`,
  );
});

test("BuildAdvisor: hidden_tile recovery text still surfaces the road-from-visible-ground mechanic", () => {
  const recovery = explainBuildRecovery("hidden_tile");
  assert.equal(typeof recovery, "string", "explainBuildRecovery must return a string");
  assert.ok(recovery.length > 0, "hidden_tile recovery text must be non-empty");
  assert.match(
    recovery,
    /road/i,
    `hidden_tile recovery text must mention roads so the reason+recovery pair is consistent; got: ${recovery}`,
  );
});
