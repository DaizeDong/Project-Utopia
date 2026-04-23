import test from "node:test";
import assert from "node:assert/strict";

import { formatRelationOpinion, relationLabel } from "../src/ui/panels/EntityFocusPanel.js";

test("relationLabel maps opinion values to player-readable relationship bands", () => {
  assert.equal(relationLabel(0.5), "Close friend");
  assert.equal(relationLabel(0.2), "Friend");
  assert.equal(relationLabel(0), "Acquaintance");
  assert.equal(relationLabel(-0.2), "Strained");
  assert.equal(relationLabel(-0.6), "Rival");
});

test("formatRelationOpinion preserves numeric value after semantic label", () => {
  assert.equal(formatRelationOpinion(0.25), "Friend (+0.25)");
  assert.equal(formatRelationOpinion(-0.25), "Strained (-0.25)");
});
