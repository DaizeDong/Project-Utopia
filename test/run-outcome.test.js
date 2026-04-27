import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { evaluateRunOutcomeState } from "../src/app/runOutcome.js";

test("evaluateRunOutcomeState returns loss for collapse spiral", () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
  state.gameplay.prosperity = 7.5;
  state.gameplay.threat = 93;
  state.metrics.populationStats = { workers: 12 };
  state.metrics.simTimeSec = 120;

  const outcome = evaluateRunOutcomeState(state);
  assert.equal(outcome?.outcome, "loss");
  assert.equal(outcome?.reason.includes("low prosperity"), true);
});

test("evaluateRunOutcomeState has no win outcome in survival mode", () => {
  // v0.8.0 Phase 4 — Survival Mode. There is no longer a "win" path; the
  // only terminal outcome is loss (colony wipe or collapse). A healthy
  // colony simply returns null.
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
  state.metrics.populationStats = { workers: 12 };

  const outcome = evaluateRunOutcomeState(state);
  assert.equal(outcome, null);
});

test("evaluateRunOutcomeState keeps the run alive when zero stockpile still has supply in transit", () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
  state.resources.food = 0;
  state.resources.wood = 0;
  state.metrics.populationStats = { workers: 12 };
  state.metrics.logistics = {
    carryingWorkers: 3,
    totalCarryInTransit: 2.4,
  };

  const outcome = evaluateRunOutcomeState(state);
  assert.equal(outcome, null);
});
