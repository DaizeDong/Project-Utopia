// R12 Plan-R12-build-tab-1click (A3 P1 #1) — first click on the Build
// sidebar tab must open the Build Tools palette directly. Previously the
// click hit the `alreadyActive` branch on a fresh boot (Build is the
// default-active tab + sidebar opens by default) and CLOSED the sidebar.
// Worse, at viewport widths 1025-1440 px the .sidebar-open #sidebarPanelArea
// is opacity:0 until :hover/:focus-within (icon-rail layout, see CSS
// ~line 2495), so the panel was INVISIBLE even when "open" — making the
// first click appear to do nothing.
//
// Per project precedent (responsive-status-bar.test.js,
// hud-chip-responsive.test.js), we cannot reliably resolve @media in
// JSDOM, so this test asserts the contract against the raw index.html
// source: (a) the click handler now guards the close-on-already-active
// branch with isPanelAreaVisible(), (b) the fallback else-branch calls
// showSidebarPanel(key) AND btn.focus() so :focus-within reveals the
// icon-rail panel-area, and (c) the helper function exists and inspects
// computed style for opacity / pointer-events / visibility.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const HTML = fs.readFileSync("index.html", "utf8");

test("Plan-R12-build-tab-1click: helper isPanelAreaVisible inspects computed style", () => {
  // The helper must exist and read the three CSS properties that hide the
  // panel-area in the 1025-1440 px icon-rail responsive layout.
  assert.match(HTML, /function\s+isPanelAreaVisible\s*\(\s*\)\s*\{/, "helper function declared");
  // It must check opacity (set to 0 by the icon-rail CSS at line ~2505).
  assert.match(HTML, /isPanelAreaVisible[\s\S]{0,400}opacity/, "checks opacity");
  // It must check pointer-events (set to none by the same icon-rail CSS).
  assert.match(HTML, /isPanelAreaVisible[\s\S]{0,400}pointerEvents/, "checks pointer-events");
});

test("Plan-R12-build-tab-1click: close-on-active-tab branch is gated by panel visibility", () => {
  // Old code: `} else if (alreadyActive) { setSidebarOpen(false);` — closed
  // unconditionally. New code must AND the predicate with isPanelAreaVisible().
  const handlerSlice = HTML.match(
    /\.sidebar-tab-btn\[data-sidebar-target\][\s\S]{0,2000}?\}\s*\)\s*;\s*\}\s*\)\s*;/,
  );
  assert.ok(handlerSlice, "tab-button click handler block found");
  const block = handlerSlice[0];
  assert.match(
    block,
    /alreadyActive\s*&&\s*isPanelAreaVisible\s*\(\s*\)/,
    "close branch gated by isPanelAreaVisible()",
  );
  // The original unconditional pattern must be gone.
  assert.doesNotMatch(
    block,
    /\}\s*else\s+if\s*\(\s*alreadyActive\s*\)\s*\{\s*\/\/[^\n]*\n\s*setSidebarOpen\(\s*false\s*\)/,
    "old unconditional close-on-active-tab branch must not remain",
  );
});

test("Plan-R12-build-tab-1click: fallback branch force-shows panel and focuses tab", () => {
  // When the active tab is clicked but the panel is hidden by the icon-rail
  // collapse, the handler must (1) call showSidebarPanel(key) so the panel
  // content is the active sidebar-panel and (2) focus the button so the
  // :focus-within rule on #sidebar reveals the panel-area.
  const handlerSlice = HTML.match(
    /\.sidebar-tab-btn\[data-sidebar-target\][\s\S]{0,2000}?\}\s*\)\s*;\s*\}\s*\)\s*;/,
  );
  assert.ok(handlerSlice, "tab-button click handler block found");
  const block = handlerSlice[0];
  // showSidebarPanel(key) appears at least twice now (the !sidebarOpen branch
  // and the fallback else branch).
  const calls = block.match(/showSidebarPanel\(\s*key\s*\)/g) ?? [];
  assert.ok(calls.length >= 2, `expected ≥2 showSidebarPanel(key) calls in handler, got ${calls.length}`);
  // Focus call in the fallback else branch.
  assert.match(block, /btn\.focus\(\s*\)/, "fallback branch focuses btn");
});

test("Plan-R12-build-tab-1click: !sidebarOpen branch still opens and shows panel (regression guard)", () => {
  // Suggestion A explicitly preserves the existing behavior for the closed-
  // sidebar case: clicking ANY tab (active or not) opens the sidebar AND
  // shows the corresponding panel. This guards against accidentally
  // breaking the Colony-from-collapsed-sidebar flow.
  const handlerSlice = HTML.match(
    /if\s*\(\s*!sidebarOpen\s*\)\s*\{[\s\S]{0,400}?\}/,
  );
  assert.ok(handlerSlice, "!sidebarOpen branch found");
  const block = handlerSlice[0];
  assert.match(block, /setSidebarOpen\(\s*true\s*\)/, "opens sidebar");
  assert.match(block, /showSidebarPanel\(\s*key\s*\)/, "shows panel for clicked key");
});
