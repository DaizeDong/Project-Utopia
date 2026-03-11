import test from "node:test";
import assert from "node:assert/strict";

import { SHORTCUT_HINT, resolveGlobalShortcut } from "../src/app/shortcutResolver.js";

test("resolveGlobalShortcut exposes a camera reset shortcut", () => {
  assert.match(SHORTCUT_HINT, /0 reset camera/i);
  assert.deepEqual(
    resolveGlobalShortcut({ code: "Digit0", key: "0", repeat: false }, { phase: "active" }),
    { type: "resetCamera" },
  );
  assert.deepEqual(
    resolveGlobalShortcut({ code: "Home", key: "Home", repeat: false }, { phase: "menu" }),
    { type: "resetCamera" },
  );
  assert.equal(
    resolveGlobalShortcut({ code: "Digit0", key: "0", repeat: false, altKey: true }, { phase: "active" }),
    null,
  );
});
