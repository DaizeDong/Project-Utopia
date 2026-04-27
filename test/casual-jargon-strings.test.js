// v0.8.2 Round-6 Wave-1 02b-casual — Casual-jargon regression guard.
// Plan: assignments/homework6/Agent-Feedback-Loop/Round6/Plans/02b-casual.md
//
// Cheap source-level regression net for the four jargon-clean rules
// 02b enforces:
//
//   1. GameStateOverlay.formatHeatLensUseCase no longer says "surplus is
//      trapped" or "starving input" (Step 6).
//   2. ScenarioFactory's temperate_plains scenario no longer says
//      "Reconnect the west lumber line, reclaim the east depot" (Step 7).
//   3. EntityFocusPanel worker-list no longer surfaces "peckish" (Step 10).
//   4. The new GameStateOverlay heat-lens copy contains the casual phrasing
//      ("piling up unused" / "waiting on input").
//
// Reads source files directly so we do not need to mount the full HUD /
// scenario / panel pipelines. This is intentionally a low-cost grep-style
// net rather than a behaviour test — the failure mode it guards against
// is "jargon string sneaks back in via copy revert", not behaviour drift.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const HEAT_LENS_SRC = fs.readFileSync("src/ui/hud/GameStateOverlay.js", "utf8");
const SCENARIO_SRC = fs.readFileSync("src/world/scenarios/ScenarioFactory.js", "utf8");
const ENTITY_FOCUS_SRC = fs.readFileSync("src/ui/panels/EntityFocusPanel.js", "utf8");

// Helper: assert source string does NOT contain `needle`. Reports the
// first offending line for fast triage.
function assertSourceLacks(src, needle, message) {
  if (!src.includes(needle)) return;
  const lines = src.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.includes(needle));
  assert.fail(
    `${message}\n  found "${needle}" on line ${idx + 1}: ${lines[idx]?.trim() ?? "?"}`,
  );
}

test("GameStateOverlay heat-lens copy no longer contains 'surplus is trapped' (Step 6)", () => {
  assertSourceLacks(
    HEAT_LENS_SRC,
    "surplus is trapped",
    "Heat Lens use-case copy must drop the 'surplus is trapped' jargon",
  );
});

test("GameStateOverlay heat-lens copy no longer contains 'starving input' (Step 6)", () => {
  assertSourceLacks(
    HEAT_LENS_SRC,
    "starving input",
    "Heat Lens use-case copy must drop the 'starving input' jargon",
  );
});

test("GameStateOverlay heat-lens copy uses the new casual phrasing (Step 6)", () => {
  assert.match(
    HEAT_LENS_SRC,
    /piling up unused/,
    "Heat Lens copy should describe red tiles as 'stuff piling up unused'",
  );
  assert.match(
    HEAT_LENS_SRC,
    /waiting on input/,
    "Heat Lens copy should describe blue tiles as 'a building waiting on input'",
  );
});

test("ScenarioFactory temperate_plains summary drops the OKR-speak chain (Step 7)", () => {
  // The exact phrase reviewers flagged as the canonical "OKR speak"
  // example. Must not survive in the source.
  assertSourceLacks(
    SCENARIO_SRC,
    "Reconnect the west lumber line, reclaim the east depot",
    "ScenarioFactory must drop the 'Reconnect the west lumber line, reclaim the east depot' summary",
  );
});

test("ScenarioFactory temperate_plains scenario uses casual on-screen language (Step 7)", () => {
  // The new copy must name what's on screen ("west forest", "east warehouse")
  // so a casual first-timer can locate it visually.
  assert.match(
    SCENARIO_SRC,
    /west forest/,
    "ScenarioFactory should name the 'west forest' instead of 'west lumber line'",
  );
});

test("EntityFocusPanel worker-list label no longer uses 'peckish' (Step 10)", () => {
  // The lowercase worker-list mood label. The Hunger row's title-case
  // "Peckish" is pinned by entity-focus-player-view.test.js so we DO
  // expect it to survive — but only there, not in the worker-list rollup.
  // Search for the worker-list construction block (renderWorkerList /
  // hungerLabel literal) and ensure 'peckish' is not in it.
  const workerListMarker = "well-fed";
  const startIdx = ENTITY_FOCUS_SRC.indexOf(workerListMarker);
  assert.ok(startIdx > 0, "worker-list hunger label block not found in EntityFocusPanel");
  // Find the block: from "well-fed" forward ~400 chars (covers the chain).
  const block = ENTITY_FOCUS_SRC.slice(startIdx, startIdx + 600);
  assert.ok(
    !block.includes("\"peckish\""),
    "Worker-list hunger label still uses 'peckish' — Step 10 expects 'a bit hungry'",
  );
  assert.match(
    block,
    /a bit hungry/,
    "Worker-list hunger label should use the casual phrase 'a bit hungry'",
  );
});

test("Plan-required forbidden tokens absent from refreshed copy", () => {
  // The plan calls out a low-cost regression net for the substrings
  // "surplus is trapped" / "starving input" / "peckish" in player-facing
  // text. The other three tokens ("unreachable", "WHISPER", "LLM",
  // "halo") are guarded by sibling tests (onboarding-noise-reduction,
  // storyteller-llm-diagnostic-hidden, heat-lens-halo-suppressed) so we
  // do NOT re-assert them here to avoid duplicate-coverage churn.
  const ALL_SOURCES = HEAT_LENS_SRC + "\n" + SCENARIO_SRC;
  assert.ok(
    !ALL_SOURCES.includes("surplus is trapped"),
    "'surplus is trapped' must be absent from heat-lens + scenario copy",
  );
  assert.ok(
    !ALL_SOURCES.includes("starving input"),
    "'starving input' must be absent from heat-lens + scenario copy",
  );
});
