import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import {
  getScenarioProgressCompact,
  getScenarioProgressCompactCasual,
} from "../src/ui/interpretation/WorldExplain.js";

// v0.8.2 Round-1 02b-casual — coverage for the Casual-profile variant of the
// HUD scenario-progress ribbon. These pure selectors must:
//  1. Render human-readable "N of M supply routes open" / "N warehouses built
//     (goal M)" tokens so first-time players can tell "built" from "goal".
//  2. Collapse to "Endless mode — no pending goals" when survival-mode strips
//     the scenario anchors (no stray separator token).
//  3. Keep the dev-profile `getScenarioProgressCompact` untouched so existing
//     debug-panel tests and `wh N/M` regression consumers stay valid.

test("getScenarioProgressCompactCasual on the default scenario renders human-readable supply route and warehouse tokens", () => {
  const state = createInitialGameState({ seed: 1337 });
  const text = getScenarioProgressCompactCasual(state);

  // Broken Frontier opening scenario: 1 route + 1 depot + logistics targets
  // (warehouses/farms/lumbers). The exact counts depend on the fixture template
  // so assert structural substrings rather than specific integers.
  assert.match(text, /\d+ of \d+ supply routes open/);
  assert.match(text, /\d+ of \d+ depots reclaimed/);
  assert.match(text, /\d+ warehouses built \(goal \d+\)/);
  assert.match(text, /\d+ farms built \(goal \d+\)/);
  assert.match(text, /\d+ lumber camps \(goal \d+\)/);
  // Two-space separator keeps the ribbon breakable inside the 2-line CSS clamp.
  assert.ok(!text.includes(" · "), "casual ribbon must not use the dev-profile middle dot");
});

test("getScenarioProgressCompactCasual with no scenario anchors returns the friendly endless fallback", () => {
  const state = createInitialGameState({ seed: 1337 });
  // Simulate survival-mode: scenario object present but emptied of route/depot
  // anchors and logistics targets.
  state.gameplay.scenario = {
    routeLinks: [],
    depotZones: [],
    anchors: {},
    targets: { logistics: { warehouses: 0, farms: 0, lumbers: 0, roads: 0, walls: 0 } },
  };

  const text = getScenarioProgressCompactCasual(state);

  assert.equal(text, "Endless mode — no pending goals");
});

test("getScenarioProgressCompact (dev profile) is preserved — still emits the terse `wh N/M` tokens", () => {
  // Regression guard: the Casual variant must not have replaced the original
  // dev-profile string. Downstream tests and debug-panel consumers continue to
  // depend on the `wh N/M · farms N/M` literal tokens.
  const state = createInitialGameState({ seed: 1337 });
  const text = getScenarioProgressCompact(state);

  assert.match(text, /wh \d+\/\d+/);
  assert.match(text, /farms \d+\/\d+/);
  assert.match(text, / · /);
});
