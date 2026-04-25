// v0.8.2 Round-6 Wave-1 02b-casual (Step 1) — F1 shortcut resolver test.
// Plan: assignments/homework6/Agent-Feedback-Loop/Round6/Plans/02b-casual.md
//
// Casual reviewer reported "F1 reloaded the page 3 times in 25 minutes,
// losing my progress." Root cause: F1 was not registered in
// resolveGlobalShortcut(), so #onGlobalKeyDown returned without calling
// preventDefault, and the browser default for F1 (refresh / "Help") fired.
//
// Step 1 adds F1 / Shift+? as openHelp actions. This test guards the
// resolver behaviour and asserts that:
//   1. F1 in active phase resolves to { type: "openHelp" }
//   2. F1 in menu phase ALSO resolves to openHelp (so caller can
//      preventDefault unconditionally — browser must never reload).
//   3. ? (Shift+/, key="?") also resolves to openHelp.

import test from "node:test";
import assert from "node:assert/strict";

import { resolveGlobalShortcut } from "../src/app/shortcutResolver.js";

test("F1 resolves to openHelp in active phase", () => {
  const result = resolveGlobalShortcut(
    { code: "F1", key: "F1", repeat: false },
    { phase: "active" },
  );
  assert.deepEqual(result, { type: "openHelp" });
});

test("F1 resolves to openHelp in menu phase (so caller can preventDefault)", () => {
  const result = resolveGlobalShortcut(
    { code: "F1", key: "F1", repeat: false },
    { phase: "menu" },
  );
  assert.deepEqual(
    result,
    { type: "openHelp" },
    "F1 must resolve in any phase so GameApp preventDefault swallows the browser refresh",
  );
});

test("F1 resolves to openHelp in end phase", () => {
  const result = resolveGlobalShortcut(
    { code: "F1", key: "F1", repeat: false },
    { phase: "end" },
  );
  assert.deepEqual(result, { type: "openHelp" });
});

test("lowercase 'f1' key value also resolves to openHelp", () => {
  const result = resolveGlobalShortcut(
    { code: "F1", key: "f1", repeat: false },
    { phase: "active" },
  );
  assert.deepEqual(result, { type: "openHelp" });
});

test("Shift+/ ('?') resolves to openHelp", () => {
  const result = resolveGlobalShortcut(
    { code: "Slash", key: "?", repeat: false, shiftKey: true },
    { phase: "active" },
  );
  assert.deepEqual(result, { type: "openHelp" });
});

test("plain '?' key resolves to openHelp (some keyboard layouts)", () => {
  const result = resolveGlobalShortcut(
    { code: "Slash", key: "?", repeat: false },
    { phase: "active" },
  );
  assert.deepEqual(result, { type: "openHelp" });
});

test("F1 with Ctrl modifier does NOT resolve to openHelp (browser shortcut)", () => {
  // Ctrl+F1 is a known browser keybinding for "Toggle Toolbar" in Firefox;
  // we should NOT eat it.
  const result = resolveGlobalShortcut(
    { code: "F1", key: "F1", repeat: false, ctrlKey: true },
    { phase: "active" },
  );
  assert.equal(result, null);
});

test("F1 with repeat=true is dropped (no auto-repeat opens)", () => {
  const result = resolveGlobalShortcut(
    { code: "F1", key: "F1", repeat: true },
    { phase: "active" },
  );
  assert.equal(result, null);
});
