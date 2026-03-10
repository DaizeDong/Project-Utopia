import test from "node:test";
import assert from "node:assert/strict";

import { resolveGlobalShortcut, SHORTCUT_HINT } from "../src/app/shortcutResolver.js";

test("resolveGlobalShortcut maps build tool digits and core session shortcuts", () => {
  assert.deepEqual(resolveGlobalShortcut({ code: "Digit1", key: "1" }, { phase: "active" }), { type: "selectTool", tool: "road" });
  assert.deepEqual(resolveGlobalShortcut({ code: "Digit4", key: "4" }, { phase: "active" }), { type: "selectTool", tool: "warehouse" });
  assert.deepEqual(resolveGlobalShortcut({ code: "Escape", key: "Escape" }, { phase: "active" }), { type: "clearSelection" });
  assert.deepEqual(resolveGlobalShortcut({ code: "Space", key: " " }, { phase: "active" }), { type: "togglePause" });
});

test("resolveGlobalShortcut maps undo and redo for ctrl/cmd variants", () => {
  assert.deepEqual(resolveGlobalShortcut({ code: "KeyZ", key: "z", ctrlKey: true }, { phase: "active" }), { type: "undo" });
  assert.deepEqual(resolveGlobalShortcut({ code: "KeyZ", key: "z", metaKey: true, shiftKey: true }, { phase: "active" }), { type: "redo" });
  assert.deepEqual(resolveGlobalShortcut({ code: "KeyY", key: "y", ctrlKey: true }, { phase: "active" }), { type: "redo" });
});

test("resolveGlobalShortcut ignores inactive-phase pause, repeats, and alt-modified input", () => {
  assert.equal(resolveGlobalShortcut({ code: "Space", key: " " }, { phase: "menu" }), null);
  assert.equal(resolveGlobalShortcut({ code: "KeyZ", key: "z", ctrlKey: true }, { phase: "menu" }), null);
  assert.equal(resolveGlobalShortcut({ code: "Digit2", key: "2", repeat: true }, { phase: "active" }), null);
  assert.equal(resolveGlobalShortcut({ code: "Digit2", key: "2", altKey: true }, { phase: "active" }), null);
  assert.match(SHORTCUT_HINT, /1-6 tools/i);
});
