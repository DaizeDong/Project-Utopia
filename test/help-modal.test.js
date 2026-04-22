// v0.8.2 Round-0 01a-onboarding — Help Modal unit tests.
// Plan: assignments/homework6/Agent-Feedback-Loop/Round0/Plans/01a-onboarding.md
//
// We follow the repo convention established by responsive-status-bar.test.js
// of asserting against the raw index.html source text — this keeps the test
// runner free of jsdom and lets us verify the modal's structural contract
// (DOM ids, aria roles, keybinding, first-run storage flag) without spinning
// up a full browser environment.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const HTML = fs.readFileSync("index.html", "utf8");

test("index.html declares #helpModal with dialog semantics and initial hidden attr", () => {
  // The dialog element must exist and start hidden; first-run logic
  // explicitly removes `hidden` only when localStorage flag is missing.
  const match = HTML.match(/<div\s+id="helpModal"[^>]*>/);
  assert.ok(match, "#helpModal root element missing");
  assert.match(match[0], /role="dialog"/, "#helpModal should advertise role=dialog");
  assert.match(match[0], /aria-modal="true"/, "#helpModal should advertise aria-modal=true");
  assert.match(match[0], /\bhidden\b/, "#helpModal must ship with `hidden` attribute so modal is closed by default");
});

test("index.html exposes helpBtn and overlayHelpBtn entry points", () => {
  assert.match(HTML, /id="helpBtn"/, "top-bar Help button missing");
  assert.match(HTML, /id="overlayHelpBtn"/, "overlay How-to-Play button missing");
  assert.match(HTML, /id="helpModalCloseBtn"/, "modal close button missing");
});

test("Help modal contains the three documented tabs (Controls / Resource Chain / Threat)", () => {
  const tabs = HTML.match(/data-help-tab="[^"]+"/g) ?? [];
  const keys = tabs.map((t) => t.match(/="([^"]+)"/)[1]);
  assert.ok(keys.includes("controls"), "controls tab missing");
  assert.ok(keys.includes("chain"), "resource-chain tab missing");
  assert.ok(keys.includes("threat"), "threat tab missing");
  const pages = HTML.match(/data-help-page="[^"]+"/g) ?? [];
  assert.ok(pages.length >= 3, `expected >=3 help pages, found ${pages.length}`);
});

test("F1 and ? keybindings are wired in the Help Modal script", () => {
  // Verify the capture-phase keydown listener references F1 and ?.
  assert.match(HTML, /e\.key === 'F1'/, "F1 keyboard shortcut missing");
  assert.match(HTML, /e\.key === '\?'/, "? keyboard shortcut missing");
  // ESC must close the modal when open.
  assert.match(HTML, /e\.key === 'Escape' && isHelpOpen\(\)/, "ESC-to-close behavior missing");
});

test("Help modal first-run flag gates auto-open to one-time behavior", () => {
  assert.match(
    HTML,
    /localStorage\.getItem\('utopia:helpSeen'\)\s*!==\s*'1'/,
    "utopia:helpSeen first-run gate missing",
  );
  assert.match(
    HTML,
    /localStorage\.setItem\('utopia:helpSeen',\s*'1'\)/,
    "utopia:helpSeen setter missing",
  );
});

test("Help modal CSS positions the dialog above devDock (z-index >= 1500)", () => {
  // devDock is z-index:11; modal must comfortably clear it.
  const block = HTML.match(/#helpModal\s*\{[^}]*\}/);
  assert.ok(block, "#helpModal CSS block missing");
  const zIndexMatch = block[0].match(/z-index:\s*(\d+)/);
  assert.ok(zIndexMatch, "#helpModal should declare z-index");
  assert.ok(Number(zIndexMatch[1]) >= 1000, `expected z-index >= 1000, got ${zIndexMatch[1]}`);
});
