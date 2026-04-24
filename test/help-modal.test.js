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
  assert.match(
    HTML,
    /document\.getElementById\('helpBtn'\)\?\.addEventListener\('click', openHelp\)/,
    "top-bar Help button should open the modal",
  );
  assert.match(
    HTML,
    /document\.getElementById\('overlayHelpBtn'\)\?\.addEventListener\('click', openHelp\)/,
    "overlay How-to-Play button should open the modal",
  );
  assert.match(HTML, /Open the strategic briefing on demand - template differences, heat lens, survival score\./);
  assert.match(HTML, /Open the menu briefing on demand - template differences, size consequences, first failure path\./);
  assert.match(HTML, /Open any time with <code>F1<\/code> or <code>\?<\/code>/);
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

test("Help modal stays closed on fresh load while still tracking helpSeen", () => {
  assert.match(
    HTML,
    /localStorage\.getItem\('utopia:helpSeen'\)/,
    "utopia:helpSeen read is missing",
  );
  assert.match(
    HTML,
    /localStorage\.setItem\('utopia:helpSeen',\s*'1'\)/,
    "utopia:helpSeen setter missing",
  );
  assert.doesNotMatch(
    HTML,
    /localStorage\.getItem\('utopia:helpSeen'\)[\s\S]{0,120}openHelp\(\)/,
    "fresh load should not auto-open help",
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

test("Help modal decision pages mention the opening contract, heat lens, and survival score", () => {
  const threatPage = HTML.match(/<section class="help-page" data-help-page="threat">[\s\S]*?<\/section>/);
  assert.ok(threatPage, "threat help page missing");
  assert.match(threatPage[0], /First Failure Path/);
  assert.match(threatPage[0], /survival score/i);
  assert.match(threatPage[0], /Threat &amp; Prosperity/);

  const differentPage = HTML.match(/<section class="help-page" data-help-page="different">[\s\S]*?<\/section>/);
  assert.ok(differentPage, "different help page missing");
  assert.match(differentPage[0], /Supply-Chain Heat Lens/);
  assert.match(differentPage[0], /Templates change the whole run/);
  assert.match(differentPage[0], /opening pressure changes immediately/i);
});
