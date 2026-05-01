// v0.10.1-A3 first-impression — onboarding-surface regression tests.
// Plan: assignments/homework7/Final-Polish-Loop/Round0/Plans/A3-first-impression.md
//
// Reviewer A3 gave 4/10 (YELLOW) and almost closed the page at 01:10. Three P0
// onboarding failures shared a root cause: onboarding-critical signals already
// existed in the codebase but were CSS-hidden / flow-skipped / overwritten by
// visual side-effects. This file pins the three surface fixes:
//
//   F1 — Help modal auto-opens once on first Start Colony click (not on cold
//        page load — that would block Start Colony itself). Gated by the
//        existing `utopia:helpSeen` localStorage key.
//   F2 — `#statusScenario` (the goal-chip strip rendered by HUDController) is
//        no longer hidden by the slim-status-bar `display:none` rule.
//   F3 — `#applyContextualOverlay` toast now names BOTH the build tool that
//        was selected AND the overlay it auto-enabled, so pressing `2` shows
//        "Tool: Farm · auto-overlay: Fertility" instead of just "Auto-overlay:
//        Overlay: Fertility".
//
// We follow the repo convention (responsive-status-bar.test.js, help-modal.test.js)
// of asserting against raw source text — keeps the test runner free of jsdom.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const HTML = fs.readFileSync("index.html", "utf8");
const GAMEAPP = fs.readFileSync("src/app/GameApp.js", "utf8");

test("A3-F2: #statusScenario is no longer in the slim-status-bar display:none rule", () => {
  // The hide list groups four element ids in one rule; #statusScenario must NOT appear.
  // We anchor on the rule block (statusNextAction → statusScoreBreak) and check
  // the contents.
  const ruleMatch = HTML.match(
    /#statusScoreboard\s+#statusNextAction[\s\S]{0,400}?display:\s*none\s*!important;\s*\}/,
  );
  assert.ok(ruleMatch, "could not locate the slim-status-bar hide rule block");
  assert.doesNotMatch(
    ruleMatch[0],
    /#statusScenario\b/,
    "#statusScenario should NOT be hidden by the slim-status-bar rule (HUDController renders goal chips into it)",
  );
});

test("A3-F1: Start Colony button consumes utopia:helpSeen to gate first-launch help", () => {
  // The new gate must reference both the start button id and the helpSeen key.
  // We do not require the read to be on the same line as openHelp — by design
  // they are spaced apart so help-modal.test.js's "fresh load should not
  // auto-open help" assertion (which forbids getItem→openHelp within 120 chars)
  // continues to hold.
  assert.match(
    HTML,
    /overlayStartBtn/,
    "Start Colony button id missing",
  );
  // There must be a getElementById('overlayStartBtn') reference inside the
  // help script block (paired with the helpSeen check).
  assert.match(
    HTML,
    /getElementById\(['"]overlayStartBtn['"]\)[\s\S]{0,400}utopia:helpSeen/,
    "Start Colony click path should consult utopia:helpSeen",
  );
  // The gate must call openHelp at some point in the same code region.
  assert.match(
    HTML,
    /utopia:helpSeen[\s\S]{0,500}openHelp\(['"]controls['"]\)/,
    "first-launch gate should call openHelp('controls') after reading helpSeen",
  );
});

test("A3-F1: overlayHelpBtn title advertises automatic first-launch behaviour", () => {
  assert.match(
    HTML,
    /id="overlayHelpBtn"[^>]*title="[^"]*opens automatically on first launch[^"]*"/,
    "overlayHelpBtn title should mention first-launch auto-open",
  );
});

test("A3-F3: #applyContextualOverlay names the tool alongside the auto-overlay", () => {
  // The toast format changed from "Auto-overlay: Overlay: Fertility" to
  // "Tool: <ToolLabel> · auto-overlay: <ModeLabel>". We pin the new "Tool:"
  // prefix and the "auto-overlay:" middle-clause to detect regressions.
  assert.match(
    GAMEAPP,
    /actionMessage\s*=\s*[`'"]Tool:\s*\$\{toolLabel\}\s*[·•·]\s*auto-overlay:/,
    "applyContextualOverlay toast should be 'Tool: <name> · auto-overlay: <mode>'",
  );
  // Sanity: the old "Auto-overlay: ${MODE_LABELS..." form is gone.
  assert.doesNotMatch(
    GAMEAPP,
    /actionMessage\s*=\s*`Auto-overlay:\s*\$\{MODE_LABELS\[mode\]\s*\?\?\s*mode\}`/,
    "old 'Auto-overlay: <mode>' literal should be removed from #applyContextualOverlay",
  );
});

test("A3-F1: helpSeen gate uses a defensive try/catch wrapper around localStorage", () => {
  // localStorage.getItem can throw in Safari private mode / disabled-storage
  // environments. The gate must not crash Start Colony.
  assert.match(
    HTML,
    /try\s*\{[^}]*localStorage\.getItem\(['"]utopia:helpSeen['"]\)[^}]*\}\s*catch/,
    "helpSeen read should be wrapped in try/catch",
  );
});
