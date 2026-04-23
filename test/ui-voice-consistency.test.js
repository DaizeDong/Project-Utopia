// v0.8.2 Round-0 02e-indie-critic — voice-consistency regression test.
//
// Locks in three player-facing voice fixes so future refactors cannot silently
// reintroduce dev-variable jargon into the HUD:
//
//   (a) BuildToolbar.updatePopulationBreakdown no longer emits "Base W / Stress W
//       / Total W / Entities:" — the indie-critic reviewer flagged these as raw
//       internal variable names leaking into the player view.
//   (b) GameApp.toggleHeatLens toast branches all reference "Heat" (matching the
//       HUD button "Heat Lens (L)") and never the legacy word "Pressure".
//   (c) The six Developer Telemetry dock placeholders in index.html show the
//       player-friendly "Awaiting first simulation tick…" copy rather than the
//       earlier debug-looking "loading..." text.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { getBuildToolInfo } from "../src/simulation/construction/BuildAdvisor.js";

test("ui voice: populationBreakdown template has no dev-variable jargon", () => {
  const src = fs.readFileSync("src/ui/tools/BuildToolbar.js", "utf8");
  // Locate the `populationBreakdownVal.textContent = …` assignment.
  const match = src.match(/populationBreakdownVal\.textContent\s*=\s*`([^`]+)`/);
  assert.ok(match, "expected populationBreakdownVal template literal to exist");
  const template = match[1];
  // None of these dev-variable fragments must appear in the player-facing label.
  for (const bad of ["Base W", "Stress W", "Total W", "Entities:"]) {
    assert.ok(
      !template.includes(bad),
      `populationBreakdownVal template still contains dev-variable fragment "${bad}": ${template}`,
    );
  }
  // Sanity: bullet-separated narration form must be present.
  assert.ok(
    template.includes("Base ") && template.includes("Stress ") && template.includes("Total "),
    `populationBreakdownVal template must carry the bullet-separated narration form; got: ${template}`,
  );
});

test("ui voice: Heat Lens toast branches never say 'Pressure'", () => {
  const src = fs.readFileSync("src/app/GameApp.js", "utf8");
  // Grab the toggleHeatLens() method body up to its closing `}`.
  const methodMatch = src.match(/toggleHeatLens\s*\(\)\s*\{[\s\S]*?\n\s{2}\}/);
  assert.ok(methodMatch, "expected toggleHeatLens() method body to exist");
  // Strip // line comments and /* block comments */ so the test only inspects
  // actual string literals, not historical prose in rationale comments.
  const body = methodMatch[0]
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  // Collect all string literals inside the (comment-stripped) method body.
  const literals = [...body.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map((m) => m[1]);
  // The three toast branches must mention Heat and never Pressure.
  const toastLiterals = literals.filter((l) => /lens/i.test(l));
  assert.ok(
    toastLiterals.length >= 3,
    `expected 3+ lens-related toast strings inside toggleHeatLens; got ${toastLiterals.length}: ${JSON.stringify(toastLiterals)}`,
  );
  for (const lit of toastLiterals) {
    assert.ok(
      /heat/i.test(lit),
      `toggleHeatLens toast branch missing 'Heat' wording: ${JSON.stringify(lit)}`,
    );
    assert.ok(
      !/pressure/i.test(lit),
      `toggleHeatLens toast branch still uses legacy 'Pressure' wording: ${JSON.stringify(lit)}`,
    );
  }
});

test("ui voice: developer telemetry dock uses 'Awaiting first simulation tick' placeholder", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const newCount = (html.match(/Awaiting first simulation tick/g) ?? []).length;
  assert.equal(
    newCount,
    6,
    `expected 6 'Awaiting first simulation tick' placeholders in dev dock; got ${newCount}`,
  );
  // Legacy copies must be fully purged.
  assert.ok(
    !html.includes(">loading...</pre>"),
    "index.html still contains legacy 'loading...' dock placeholder",
  );
  assert.ok(
    !/class="dock-body">Initializing telemetry/.test(html),
    "index.html still contains intermediate 'Initializing telemetry…' dock placeholder",
  );
});

test("ui voice: statusBar owns a scenario headline slot", () => {
  const html = fs.readFileSync("index.html", "utf8");
  // The span must exist inside #statusBar (we check presence + hidden-by-default attr).
  assert.ok(
    html.includes('id="statusScenarioHeadline"'),
    "index.html missing #statusScenarioHeadline span",
  );
  assert.ok(
    /id="statusScenarioHeadline"[^>]*hidden/.test(html),
    "#statusScenarioHeadline should be hidden by default until a scenario loads",
  );
  // HUDController must populate it with both title + summary.
  const hud = fs.readFileSync("src/ui/hud/HUDController.js", "utf8");
  assert.ok(
    hud.includes("statusScenarioHeadline"),
    "HUDController.js does not wire #statusScenarioHeadline",
  );
  assert.ok(
    /scenario\?\.title|scenario\.title/.test(hud) && /scenario\?\.summary|scenario\.summary/.test(hud),
    "HUDController.js scenario headline block should read both scenario.title and scenario.summary",
  );
});

test("ui voice: BuildAdvisor summaries carry voice-family diction", () => {
  const summaries = {
    road: getBuildToolInfo("road").summary,
    warehouse: getBuildToolInfo("warehouse").summary,
    kitchen: getBuildToolInfo("kitchen").summary,
    smithy: getBuildToolInfo("smithy").summary,
    clinic: getBuildToolInfo("clinic").summary,
  };

  assert.match(summaries.road, /broken|stitch/i);
  assert.match(summaries.warehouse, /anchor|rots/i);
  assert.match(summaries.kitchen, /starving|beside/i);
  assert.match(summaries.smithy, /hammers|hands/i);
  assert.match(summaries.clinic, /bitten|obituary/i);

  for (const [tool, summary] of Object.entries(summaries)) {
    assert.ok(summary.length <= 140, `${tool} summary is too long: ${summary.length}`);
    assert.ok(!/Extends the logistics network|Processes raw food|Forges stone|Uses herbs/i.test(summary));
  }
});

test("ui voice: main.js gates window.__utopia behind devModeGate but keeps __utopiaLongRun public", () => {
  const src = fs.readFileSync("src/main.js", "utf8");
  assert.ok(src.includes('import { readInitialDevMode } from "./app/devModeGate.js";'));
  assert.match(src, /const\s+devOn\s*=\s*readInitialDevMode\s*\(/);
  assert.match(src, /if\s*\(\s*devOn\s*\)\s*\{\s*window\.__utopia\s*=\s*app;\s*\}\s*window\.__utopiaLongRun\s*=/s);
});
