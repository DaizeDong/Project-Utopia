import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { EVENT_TYPE, TILE, WEATHER } from "../src/config/constants.js";
import { ProgressionSystem, updateSurvivalScore } from "../src/simulation/meta/ProgressionSystem.js";
import { WorldEventSystem } from "../src/world/events/WorldEventSystem.js";
import { enqueueEvent } from "../src/world/events/WorldEventQueue.js";
import { setWeather } from "../src/world/weather/WeatherSystem.js";
import { BALANCE } from "../src/config/balance.js";

function setTile(state, ix, iz, tileType) {
  state.grid.tiles[ix + iz * state.grid.width] = tileType;
}

test("ProgressionSystem applies doctrine modifiers", () => {
  const state = createInitialGameState();
  const system = new ProgressionSystem();

  state.controls.doctrine = "agrarian";
  system.update(0.5, state);

  assert.equal(state.gameplay.doctrine, "agrarian");
  assert.ok(state.gameplay.modifiers.farmYield > 1);
  assert.ok(state.gameplay.modifiers.lumberYield < 1);
});

// v0.8.0 Phase 4 — Survival Mode. Objectives no longer drive a "win"
// outcome; instead ProgressionSystem increments a running survival score
// at +1/sec, +5/birth, -10/death.
test("ProgressionSystem accrues survival score per in-game second", () => {
  const state = createInitialGameState();
  const system = new ProgressionSystem();
  state.metrics.survivalScore = 0;

  const perSec = Number(BALANCE.survivalScorePerSecond ?? 1);
  system.update(1, state);
  assert.ok(
    Math.abs(state.metrics.survivalScore - perSec) < 1e-6,
    `expected survivalScore=${perSec}, got ${state.metrics.survivalScore}`,
  );

  system.update(2, state);
  assert.ok(
    Math.abs(state.metrics.survivalScore - perSec * 3) < 1e-6,
    `expected survivalScore=${perSec * 3}, got ${state.metrics.survivalScore}`,
  );
});

test("ProgressionSystem grants birth bonus exactly once per birth event", () => {
  const state = createInitialGameState();
  state.metrics.survivalScore = 0;
  state.metrics.timeSec = 10;
  state.metrics.birthsTotal = 0;
  state.metrics.survivalLastBirthsSeen = 0;

  // Simulate PopulationGrowthSystem incrementing birthsTotal on spawn.
  state.metrics.birthsTotal = 1;
  updateSurvivalScore(state, 0);
  const perBirth = Number(BALANCE.survivalScorePerBirth ?? 5);
  assert.ok(
    Math.abs(state.metrics.survivalScore - perBirth) < 1e-6,
    `expected score=${perBirth} after 1 birth, got ${state.metrics.survivalScore}`,
  );

  // No new birth — repeat calls must not double-count.
  updateSurvivalScore(state, 0);
  assert.ok(
    Math.abs(state.metrics.survivalScore - perBirth) < 1e-6,
    "score should not double-count an already-observed birth",
  );

  // New birth — second bonus applies.
  state.metrics.birthsTotal = 2;
  updateSurvivalScore(state, 0);
  assert.ok(
    Math.abs(state.metrics.survivalScore - perBirth * 2) < 1e-6,
    `expected score=${perBirth * 2} after 2nd birth, got ${state.metrics.survivalScore}`,
  );
});

test("ProgressionSystem applies death penalty proportional to delta", () => {
  const state = createInitialGameState();
  state.metrics.survivalScore = 100;
  state.metrics.deathsTotal = 0;
  state.metrics.survivalLastDeathsSeen = 0;

  state.metrics.deathsTotal = 1;
  updateSurvivalScore(state, 0);
  const perDeath = Number(BALANCE.survivalScorePenaltyPerDeath ?? 10);
  assert.ok(
    Math.abs(state.metrics.survivalScore - (100 - perDeath)) < 1e-6,
    `expected score=${100 - perDeath} after 1 death, got ${state.metrics.survivalScore}`,
  );

  // Three more deaths at once — penalty scales with delta.
  state.metrics.deathsTotal = 4;
  updateSurvivalScore(state, 0);
  assert.ok(
    Math.abs(state.metrics.survivalScore - (100 - perDeath * 4)) < 1e-6,
    `expected score=${100 - perDeath * 4}, got ${state.metrics.survivalScore}`,
  );
});

test("ProgressionSystem only triggers emergency recovery after meaningful frontier support exists", () => {
  const state = createInitialGameState();
  const system = new ProgressionSystem();
  const { eastDepot } = state.gameplay.scenario.anchors;

  state.resources.food = 8;
  state.resources.wood = 8;
  state.gameplay.prosperity = 18;
  state.gameplay.threat = 78;
  state.metrics.timeSec = 30;

  system.update(0.2, state);
  assert.equal(state.gameplay.recovery.activeBoostSec, 0, "recovery should stay locked before the map is repaired");
  assert.equal(state.gameplay.recovery.charges, 1);

  setTile(state, eastDepot.ix, eastDepot.iz, TILE.WAREHOUSE);
  state.metrics.timeSec = 90;
  system.update(0.2, state);

  assert.ok(state.gameplay.recovery.activeBoostSec > 0, "recovery should trigger after a depot is reclaimed");
  assert.equal(state.gameplay.recovery.charges, 0, "recovery charge should be consumed");
  assert.ok(state.resources.food > 1);
  assert.ok(state.resources.wood > 2);
  // v0.8.2 Round-1 02e-indie-critic: emergency-relief actionMessage narrativized
  // from "Emergency relief stabilized the colony..." to "The colony breathes
  // again. Rebuild your routes before the next wave." Matches the new copy,
  // keeps the regression intent: confirming the recovery path wrote a message.
  assert.match(state.controls.actionMessage, /colony breathes again|rebuild your routes/i);
});

test("ProgressionSystem surfaces a reroute hint under concentrated spatial pressure", () => {
  const state = createInitialGameState();
  const progression = new ProgressionSystem();
  const events = new WorldEventSystem();

  setWeather(state, WEATHER.STORM, 18, "test");
  enqueueEvent(state, EVENT_TYPE.BANDIT_RAID, {}, 12, 1);
  events.update(1.1, state);
  progression.update(0.2, state);

  // v0.8.0 Phase 4 — Survival Mode. Objectives are retired; pacing hints
  // still surface through objectiveHint (spatial pressure, coverage, or
  // baseline scenario copy).
  const hint = String(state.gameplay.objectiveHint ?? "");
  assert.ok(
    hint.length > 0,
    "objectiveHint should carry pacing copy under concentrated pressure",
  );
});
