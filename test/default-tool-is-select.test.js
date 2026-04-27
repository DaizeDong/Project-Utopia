// v0.8.2 Round-5 Wave-2 (01a-onboarding Step 5): default tool must be
// "select" so a first-time player's canvas click inspects a worker instead
// of dropping a road tile underneath them.
//
// Plan: assignments/homework6/Agent-Feedback-Loop/Round5/Plans/01a-onboarding.md

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";

test("createInitialGameState returns state.controls.tool === 'select'", () => {
  const state = createInitialGameState({ seed: 1, templateId: "temperate_plains" });
  assert.equal(state.controls.tool, "select");
});

test("createInitialGameState leaves selectedEntityId null", () => {
  const state = createInitialGameState({ seed: 1, templateId: "temperate_plains" });
  assert.equal(state.controls.selectedEntityId, null);
});

test("createInitialGameState honors select across multiple seeds/templates", () => {
  for (const seed of [1, 42, 99]) {
    for (const templateId of ["temperate_plains", "rugged_highlands", "archipelago_isles"]) {
      const state = createInitialGameState({ seed, templateId });
      assert.equal(
        state.controls.tool,
        "select",
        `expected default tool=select for seed=${seed} template=${templateId}`,
      );
    }
  }
});
