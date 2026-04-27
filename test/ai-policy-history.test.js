import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";

// v0.8.2 Round-5b Wave-1 (01e Step 2) — policyHistory bounded ring.
// Populated by NPCBrainSystem.update on focus/source flips. This test uses
// the initial factory state to verify the ring field is initialised and
// behaves as an append-only bounded list.

test("policyHistory: initial state has an empty ring", () => {
  const state = createInitialGameState();
  assert.ok(Array.isArray(state.ai.policyHistory), "ai.policyHistory must be an array");
  assert.equal(state.ai.policyHistory.length, 0, "initial length is 0");
});

test("policyHistory: manual unshift respects the 32-cap slice semantic", () => {
  const state = createInitialGameState();
  for (let i = 0; i < 50; i += 1) {
    state.ai.policyHistory.unshift({ atSec: i, source: "fallback", badgeState: "fallback-healthy", focus: `f${i}`, errorKind: "none", errorMessage: "", model: "" });
    // Emulate the NPCBrainSystem cap-slice.
    if (state.ai.policyHistory.length > 32) {
      state.ai.policyHistory = state.ai.policyHistory.slice(0, 32);
    }
  }
  assert.equal(state.ai.policyHistory.length, 32, "cap at 32 entries");
  // Head is most-recent entry (unshift semantics).
  assert.equal(state.ai.policyHistory[0].atSec, 49);
  assert.equal(state.ai.policyHistory[31].atSec, 18);
});

test("policyHistory: duplicate-dedup semantic (focus + source unchanged within 5 s)", () => {
  // Simulate a planner pushing the same focus + source twice within 5 s.
  const state = createInitialGameState();
  const push = (atSec, focus, source, error = "") => {
    const prev = state.ai.policyHistory[0] ?? null;
    const focusChanged = !prev || prev.focus !== focus;
    const sourceChanged = !prev || prev.source !== source;
    if (!prev || focusChanged || sourceChanged || (atSec - Number(prev.atSec ?? 0)) >= 5) {
      state.ai.policyHistory.unshift({ atSec, source, badgeState: source === "llm" ? "llm-live" : (error ? "fallback-degraded" : "fallback-healthy"), focus, errorKind: error ? "unknown" : "none", errorMessage: error, model: "" });
    }
  };
  push(0, "hold steady", "fallback");
  push(1, "hold steady", "fallback");  // dup within 5s → skip
  push(3, "hold steady", "fallback");  // still dup
  push(6, "hold steady", "fallback");  // Δt=6 ≥ 5 → push
  push(6.1, "rebuild routes", "fallback"); // focus change → push
  push(6.2, "rebuild routes", "llm"); // source change → push
  assert.equal(state.ai.policyHistory.length, 4, "expected exactly 4 entries after dedup");
});
