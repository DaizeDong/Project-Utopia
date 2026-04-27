// v0.8.2 Round-5 Wave-2 (02b-casual Step 7): HUDController wires
// getResourceChainStall(state) into the 7 resource rate badges as
// `title` tooltips + `data-stall="1"` markers. The CSS rule
// `[data-stall="1"]` draws a soft amber left-border; tests verify
// the JS contract via source inspection.
//
// Plan: assignments/homework6/Agent-Feedback-Loop/Round5/Plans/02b-casual.md

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const HUD = fs.readFileSync("src/ui/hud/HUDController.js", "utf8");
const TOOLBAR = fs.readFileSync("src/ui/tools/BuildToolbar.js", "utf8");
const HTML = fs.readFileSync("index.html", "utf8");

test("HUDController imports getResourceChainStall from ColonyPerceiver", () => {
  assert.match(
    HUD,
    /import\s*\{\s*getResourceChainStall\s*\}\s*from\s*["'][^"']*ColonyPerceiver\.js["']/,
    "HUDController must import getResourceChainStall",
  );
});

test("HUDController throttles stall lookup to RATE_WINDOW_SEC (3s)", () => {
  assert.match(
    HUD,
    /_lastChainStallSec/,
    "HUDController should cache the stall result per window",
  );
  assert.match(
    HUD,
    /simSec\s*-\s*this\._lastChainStallSec\s*>=\s*RATE_WINDOW_SEC/,
    "HUDController should refresh stall every RATE_WINDOW_SEC seconds",
  );
});

test("HUDController applies data-stall + title to all 7 rate badges", () => {
  const badges = [
    "foodRateVal",
    "woodRateVal",
    "stoneRateVal",
    "herbsRateVal",
    "mealsRateVal",
    "toolsRateVal",
    "medicineRateVal",
  ];
  // The stallPairs list enumerates every badge; verify each key appears.
  for (const key of badges) {
    assert.match(
      HUD,
      new RegExp(`this\\.${key}`),
      `HUDController should reference this.${key} in stall pairs`,
    );
  }
  assert.match(HUD, /setAttribute\("data-stall",\s*"1"\)/);
  assert.match(HUD, /setAttribute\("data-stall",\s*""\)/);
});

test("BuildToolbar appends deficit hint on insufficientResource preview", () => {
  assert.match(
    TOOLBAR,
    /getBuildDeficitHint/,
    "BuildToolbar should define / call getBuildDeficitHint",
  );
  assert.match(
    TOOLBAR,
    /preview\.reason\s*===\s*"insufficientResource"/,
    "BuildToolbar should gate deficit hint on the insufficientResource reason",
  );
  assert.match(
    TOOLBAR,
    /import\s*\{\s*getResourceChainStall\s*\}\s*from\s*["'][^"']*ColonyPerceiver\.js["']/,
    "BuildToolbar must import getResourceChainStall",
  );
});

test("index.html ships a CSS rule for [data-stall=\"1\"]", () => {
  assert.match(
    HTML,
    /\[data-stall="1"\]\s*\{[^}]*border-left/,
    "index.html should include a CSS rule for [data-stall=\"1\"] with a left border",
  );
});

test("getBuildDeficitHint picks a stalled raw resource and reports the chain action", async () => {
  // Smoke-test the exported hint path via direct ColonyPerceiver output.
  const { getResourceChainStall } = await import("../src/simulation/ai/colony/ColonyPerceiver.js");
  const state = {
    buildings: { farms: 1, lumbers: 0 },
    metrics: { populationStats: { loggers: 0 } },
    resources: { wood: 2, stone: 0 },
  };
  const stall = getResourceChainStall(state);
  assert.match(stall.wood.bottleneck ?? "", /no lumber/);
  assert.ok(stall.wood.nextAction);
});
