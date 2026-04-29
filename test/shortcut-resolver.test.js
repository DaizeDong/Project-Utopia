import test from "node:test";
import assert from "node:assert/strict";

import { SHORTCUT_HINT, resolveGlobalShortcut } from "../src/app/shortcutResolver.js";

test("resolveGlobalShortcut exposes a camera reset shortcut", () => {
  assert.match(SHORTCUT_HINT, /Home reset camera/i);
  assert.deepEqual(
    resolveGlobalShortcut({ code: "Home", key: "Home", repeat: false }, { phase: "active" }),
    { type: "resetCamera" },
  );
  // v0.8.2 Round0 02b-casual — phase-gated resetCamera. In menu / end
  // phase the key is swallowed (no simulation running, no camera target
  // to reset). Active phase continues to work. Home key likewise gated.
  assert.equal(
    resolveGlobalShortcut({ code: "Home", key: "Home", repeat: false }, { phase: "menu" }),
    null,
  );
  assert.deepEqual(
    resolveGlobalShortcut({ code: "Home", key: "Home", repeat: false }, { phase: "active" }),
    { type: "resetCamera" },
  );
  assert.equal(
    resolveGlobalShortcut({ code: "Home", key: "Home", repeat: false, altKey: true }, { phase: "active" }),
    null,
  );
});

test("resolveGlobalShortcut maps every numbered build tool advertised by the toolbar", () => {
  // v0.8.7.1 U3 — hint copy now reads "0 select | 1-9/-/= tools" after
  // Digit0 was reclaimed for the Select / Inspect tool.
  assert.match(SHORTCUT_HINT, /0 select \| 1-9\/-\/= tools/i);
  const cases = [
    ["Digit0", "0", "select"],
    ["Digit1", "1", "road"],
    ["Digit2", "2", "farm"],
    ["Digit3", "3", "lumber"],
    ["Digit4", "4", "warehouse"],
    ["Digit5", "5", "wall"],
    ["Digit6", "6", "bridge"],
    ["Digit7", "7", "erase"],
    ["Digit8", "8", "quarry"],
    ["Digit9", "9", "herb_garden"],
    ["Minus", "-", "smithy"],
    ["Equal", "=", "clinic"],
  ];
  for (const [code, key, tool] of cases) {
    assert.deepEqual(
      resolveGlobalShortcut({ code, key, repeat: false }, { phase: "active" }),
      { type: "selectTool", tool },
      `${code} should select ${tool}`,
    );
  }
});

test("resolveGlobalShortcut does not treat shifted number keys as tool slots", () => {
  assert.equal(
    resolveGlobalShortcut({ code: "Digit7", key: "&", repeat: false, shiftKey: true }, { phase: "active" }),
    null,
  );
});
