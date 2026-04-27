// v0.8.0 Phase 4 — Survival Mode (Agent 4.A) test coverage.
//
// Validates that ProgressionSystem.updateSurvivalScore:
//   1. adds +BALANCE.survivalScorePerSecond per in-game second survived,
//   2. adds +BALANCE.survivalScorePerBirth when PopulationGrowthSystem
//      flags a birth (via state.metrics.lastBirthGameSec),
//   3. subtracts BALANCE.survivalScorePenaltyPerDeath per new death
//      observed on state.metrics.deathsTotal,
//   4. keeps state.session.outcome === "none" after 3 in-game minutes
//      with a healthy colony (no loss triggered).

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import {
  ProgressionSystem,
  updateSurvivalScore,
} from "../src/simulation/meta/ProgressionSystem.js";
import { evaluateRunOutcomeState } from "../src/app/runOutcome.js";
import { BALANCE } from "../src/config/balance.js";

test("updateSurvivalScore adds +BALANCE.survivalScorePerSecond per in-game second", () => {
  const state = createInitialGameState();
  state.metrics.survivalScore = 0;
  state.metrics.lastBirthGameSec = -1;
  state.metrics.survivalLastBirthSeenSec = -1;
  state.metrics.deathsTotal = 0;
  state.metrics.survivalLastDeathsSeen = 0;

  const perSec = Number(BALANCE.survivalScorePerSecond ?? 1);
  updateSurvivalScore(state, 1);
  assert.ok(
    Math.abs(state.metrics.survivalScore - perSec) < 1e-9,
    `expected score=${perSec} after 1s, got ${state.metrics.survivalScore}`,
  );

  updateSurvivalScore(state, 9);
  assert.ok(
    Math.abs(state.metrics.survivalScore - perSec * 10) < 1e-9,
    `expected score=${perSec * 10} after 10s total, got ${state.metrics.survivalScore}`,
  );
});

test("a birth event adds +BALANCE.survivalScorePerBirth bonus", () => {
  const state = createInitialGameState();
  state.metrics.survivalScore = 0;
  state.metrics.birthsTotal = 0;
  state.metrics.survivalLastBirthsSeen = 0;
  state.metrics.deathsTotal = 0;
  state.metrics.survivalLastDeathsSeen = 0;

  const perBirth = Number(BALANCE.survivalScorePerBirth ?? 5);

  // Simulate PopulationGrowthSystem flagging a birth at sim-time=12s.
  state.metrics.timeSec = 12;
  state.metrics.birthsTotal = 1;
  updateSurvivalScore(state, 0);
  assert.ok(
    Math.abs(state.metrics.survivalScore - perBirth) < 1e-9,
    `expected score=${perBirth} after 1st birth, got ${state.metrics.survivalScore}`,
  );

  // A subsequent tick without a new birth must not double-count.
  updateSurvivalScore(state, 0);
  assert.ok(
    Math.abs(state.metrics.survivalScore - perBirth) < 1e-9,
    "score should not double-count an already-observed birth",
  );
});

test("a death event applies -BALANCE.survivalScorePenaltyPerDeath penalty", () => {
  const state = createInitialGameState();
  state.metrics.survivalScore = 100;
  state.metrics.lastBirthGameSec = -1;
  state.metrics.survivalLastBirthSeenSec = -1;
  state.metrics.deathsTotal = 0;
  state.metrics.survivalLastDeathsSeen = 0;

  const perDeath = Number(BALANCE.survivalScorePenaltyPerDeath ?? 10);

  state.metrics.deathsTotal = 1;
  updateSurvivalScore(state, 0);
  assert.ok(
    Math.abs(state.metrics.survivalScore - (100 - perDeath)) < 1e-9,
    `expected score=${100 - perDeath} after 1 death, got ${state.metrics.survivalScore}`,
  );

  // Multiple deaths at once — penalty scales with delta.
  state.metrics.deathsTotal = 4;
  updateSurvivalScore(state, 0);
  assert.ok(
    Math.abs(state.metrics.survivalScore - (100 - perDeath * 4)) < 1e-9,
    `expected score=${100 - perDeath * 4} after 4 deaths, got ${state.metrics.survivalScore}`,
  );
});

test("state.session.outcome stays 'none' after 3 in-game minutes with a healthy colony", () => {
  const state = createInitialGameState();
  const progression = new ProgressionSystem();

  // Keep the colony healthy: plenty of resources, high prosperity,
  // low threat, workers intact. No deaths.
  state.resources.food = 400;
  state.resources.wood = 400;
  state.gameplay.prosperity = 70;
  state.gameplay.threat = 20;
  state.metrics.populationStats = {
    workers: state.agents.filter((a) => a.type === "WORKER" && a.alive !== false).length,
  };

  // Step 180 in-game seconds in 1s ticks.
  for (let i = 0; i < 180; i += 1) {
    state.metrics.timeSec = (state.metrics.timeSec ?? 0) + 1;
    state.metrics.simTimeSec = state.metrics.timeSec;
    progression.update(1, state);
    // Keep colony healthy — counter the tick-to-tick smoothing.
    state.resources.food = 400;
    state.resources.wood = 400;
    state.gameplay.prosperity = 70;
    state.gameplay.threat = 20;
  }

  // The score should have climbed; no loss outcome should fire.
  assert.ok(
    state.metrics.survivalScore >= 150,
    `expected score >= 150 after 180s, got ${state.metrics.survivalScore}`,
  );

  const outcome = evaluateRunOutcomeState(state);
  // A healthy colony never produces a loss — and there is no win path.
  // runOutcome returns null when the run should continue; callers map
  // that to session.outcome === "none".
  assert.equal(outcome, null, "healthy colony must not produce a loss outcome");

  // Mirror the GameApp session assignment rule so the assertion matches
  // the user-facing invariant "outcome stays 'none'".
  const sessionOutcome = outcome?.outcome === "loss" ? "loss" : "none";
  assert.equal(sessionOutcome, "none");
});
