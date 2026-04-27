// v0.8.2 Round0 01c-ui — Responsive status bar regression.
// Plan: assignments/homework6/Agent-Feedback-Loop/Round0/Plans/01c-ui.md
//
// JSDOM's @media-query resolution is inconsistent, so this test uses static
// assertions on the raw `index.html` source instead. We verify:
//   1. The responsive breakpoint block `@media (max-width: 1024px)` exists
//      and scopes `flex-wrap: wrap` to `#statusBar`.
//   2. At least 3 `.dev-only` elements are declared (Settings toggle,
//      Debug toggle, Dev Telemetry trigger), matching the gate steps.
//   3. The body-not-dev-mode `.dev-only { display: none !important; }`
//      rule is present.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const HTML = fs.readFileSync("index.html", "utf8");

test("index.html declares @media (max-width: 1024px) with #statusBar wrap rule", () => {
  assert.ok(
    /@media\s*\(\s*max-width:\s*1024px\s*\)/i.test(HTML),
    "Expected @media (max-width: 1024px) breakpoint",
  );
  // `flex-wrap: wrap` should appear for #statusBar inside the 1024px block.
  const block = HTML.match(
    /@media\s*\(\s*max-width:\s*1024px\s*\)\s*\{[\s\S]*?\}\s*\}/i,
  );
  assert.ok(block, "1024px media block should be present");
  assert.match(block[0], /#statusBar\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(block[0], /#panelToggles\s*\{[^}]*order:\s*-1/);
});

test("index.html has .dev-only CSS gate and dev-mode body class selector", () => {
  assert.match(
    HTML,
    /body:not\(\.dev-mode\)\s+\.dev-only\s*\{\s*display:\s*none\s*!important/i,
    "Dev-mode gate CSS rule missing",
  );
});

test("index.html tags Settings, Debug, and Dev Dock with dev-only class", () => {
  const devOnlyMatches = HTML.match(/class="[^"]*\bdev-only\b[^"]*"/g) ?? [];
  assert.ok(
    devOnlyMatches.length >= 3,
    `expected >=3 .dev-only elements, found ${devOnlyMatches.length}`,
  );
  // Named elements that MUST be dev-only per the plan. Attribute order in
  // the raw HTML is not guaranteed, so we match the opening-tag string and
  // then check for `dev-only` inside it.
  function findTag(attrMatcher) {
    const re = new RegExp(`<[^>]*${attrMatcher}[^>]*>`, "g");
    return HTML.match(re) ?? [];
  }
  const settingsTags = findTag('data-panel-target="settingsFloatingPanel"');
  assert.ok(settingsTags.length > 0, "Settings toggle missing");
  assert.ok(
    settingsTags.some((t) => /\bdev-only\b/.test(t)),
    "Settings toggle should be marked dev-only",
  );
  const debugTags = findTag('data-panel-target="debugFloatingPanel"');
  assert.ok(debugTags.length > 0, "Debug toggle missing");
  assert.ok(
    debugTags.some((t) => /\bdev-only\b/.test(t)),
    "Debug toggle should be marked dev-only",
  );
  const devDockTags = findTag('id="devDock"');
  assert.ok(devDockTags.length > 0, "Dev Dock section missing");
  assert.ok(
    devDockTags.some((t) => /\bdev-only\b/.test(t)),
    "Dev Dock section should be marked dev-only",
  );
});

test("index.html keeps Heat Lens button visible to players (not dev-only)", () => {
  const heatLensMatch = HTML.match(/id="heatLensBtn"[^>]*>/);
  assert.ok(heatLensMatch, "heatLensBtn should be present");
  assert.doesNotMatch(
    heatLensMatch[0],
    /\bdev-only\b/,
    "Heat Lens is a player feature and must stay visible without dev mode",
  );
});

test("Heat Lens button tooltip explains pressure/heat/off cycle", () => {
  const heatLensMatch = HTML.match(/id="heatLensBtn"[^>]*title="([^"]+)"/);
  assert.ok(heatLensMatch, "heatLensBtn title attribute missing");
  const title = heatLensMatch[1];
  assert.match(title, /pressure/i);
  assert.match(title, /heat/i);
  assert.match(title, /off/i);
});
