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

test("evaluateRunOutcomeState returns win when objectives complete", () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
  state.gameplay.objectiveIndex = state.gameplay.objectives.length;
  state.metrics.populationStats = { workers: 12 };

  const outcome = evaluateRunOutcomeState(state);
  assert.equal(outcome?.outcome, "win");
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
