import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { BALANCE } from "../src/config/balance.js";
import { getScenarioProgressCompact, getSurvivalScoreBreakdown } from "../src/ui/interpretation/WorldExplain.js";

// v0.8.2 Round-0 02c-speedrunner — coverage for the HUD scoreboard ribbon
// selectors. These are pure functions; they must be deterministic on the
// fresh-state fixture and must degrade gracefully when metrics / scenario
// fields are missing (menu-phase or survival-mode callers).

test("getSurvivalScoreBreakdown on a zero-metrics state returns rule rates with zeroed subtotals", () => {
  const state = createInitialGameState({ seed: 1337 });
  state.metrics.timeSec = 0;
  state.metrics.birthsTotal = 0;
  state.metrics.deathsTotal = 0;

  const br = getSurvivalScoreBreakdown(state);

  assert.equal(br.perSec, BALANCE.survivalScorePerSecond);
  assert.equal(br.perBirth, BALANCE.survivalScorePerBirth);
  assert.equal(br.perDeath, BALANCE.survivalScorePenaltyPerDeath);
  assert.equal(br.livedSec, 0);
  assert.equal(br.births, 0);
  assert.equal(br.deaths, 0);
  assert.equal(br.subtotalSec, 0);
  assert.equal(br.subtotalBirths, 0);
  assert.equal(br.subtotalDeaths, 0);
});

test("getSurvivalScoreBreakdown multiplies the rule rates by the running counters", () => {
  const state = createInitialGameState({ seed: 1337 });
  state.metrics.timeSec = 312.8; // fractional seconds -> floored to 312
  state.metrics.birthsTotal = 5;
  state.metrics.deathsTotal = 20;

  const br = getSurvivalScoreBreakdown(state);

  assert.equal(br.livedSec, 312);
  assert.equal(br.births, 5);
  assert.equal(br.deaths, 20);
  assert.equal(br.subtotalSec, BALANCE.survivalScorePerSecond * 312);
  assert.equal(br.subtotalBirths, BALANCE.survivalScorePerBirth * 5);
  assert.equal(br.subtotalDeaths, BALANCE.survivalScorePenaltyPerDeath * 20);
});

test("getSurvivalScoreBreakdown tolerates missing metrics without throwing", () => {
  // Shape-only stub: simulates a state snapshot captured before metrics were
  // populated (menu phase, early bootstrapping). Must not NaN-explode.
  const stub = { metrics: {} };
  const br = getSurvivalScoreBreakdown(stub);

  assert.equal(br.livedSec, 0);
  assert.equal(br.births, 0);
  assert.equal(br.deaths, 0);
  assert.equal(Number.isFinite(br.perSec), true);
  assert.equal(Number.isFinite(br.subtotalDeaths), true);
});

test("getScenarioProgressCompact on a fresh scenario state renders all enabled targets", () => {
  const state = createInitialGameState({ seed: 1337 });
  const text = getScenarioProgressCompact(state);

  // Broken Frontier opening scenario has 1 route + 1 depot + logistics targets
  // (warehouses/farms/lumbers at minimum). The exact counts vary by template
  // fixture, so assert structural tokens rather than specific integers.
  assert.match(text, /routes \d+\/\d+/);
  assert.match(text, /depots \d+\/\d+/);
  assert.match(text, /wh \d+\/\d+/);
  assert.match(text, /farms \d+\/\d+/);
  assert.match(text, /lumbers \d+\/\d+/);
  assert.ok(!text.startsWith(" · "), "ribbon must not start with a stray separator");
  assert.ok(!text.endsWith(" · "), "ribbon must not end with a stray separator");
});

test("getScenarioProgressCompact survival-mode with no scenario anchors returns the endless fallback", () => {
  const state = createInitialGameState({ seed: 1337 });
  // Simulate survival-mode: scenario object present but emptied of route/depot
  // anchors and logistics targets (as happens after the scenario pipeline was
  // retired in Phase 4). The ribbon must not render a dangling " · " token.
  state.gameplay.scenario = {
    routeLinks: [],
    depotZones: [],
    anchors: {},
    targets: { logistics: { warehouses: 0, farms: 0, lumbers: 0, roads: 0, walls: 0 } },
  };

  const text = getScenarioProgressCompact(state);

  assert.equal(text, "endless · no active objectives");
});
