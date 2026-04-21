// v0.8.0 Phase 4 — Survival Mode (Agent 4.A) test coverage.
//
// Validates that evaluateRunOutcomeState enforces the colony-wipe loss
// condition in survival mode:
//   1. When state.agents.length === 0 (or all agents are dead), the
//      outcome immediately transitions to "loss" with a colony-wiped
//      reason. The codebase uses "loss" (not "lose") consistently.
//   2. A colony with >= 1 living agent never transitions to loss purely
//      because of agent counts — a healthy baseline returns null
//      (continue running).

import test from "node:test";
import assert from "node:assert/strict";

import { evaluateRunOutcomeState } from "../src/app/runOutcome.js";

test("state.agents.length === 0 triggers a loss outcome", () => {
  const result = evaluateRunOutcomeState({
    agents: [],
    resources: { food: 50, wood: 50 },
    gameplay: { prosperity: 60, threat: 20, objectives: [], objectiveIndex: 0 },
    metrics: {
      simTimeSec: 0,
      populationStats: { workers: 0 },
      logistics: { totalCarryInTransit: 0, carryingWorkers: 0 },
    },
  });

  assert.notEqual(result, null, "empty-agents colony must produce a loss outcome");
  assert.equal(result.outcome, "loss");
  assert.match(result.reason, /wiped|colonists|workers/i);
});

test("all-dead agents also count as a wipe", () => {
  const result = evaluateRunOutcomeState({
    agents: [
      { type: "WORKER", alive: false },
      { type: "WORKER", alive: false },
    ],
    resources: { food: 50, wood: 50 },
    gameplay: { prosperity: 60, threat: 20, objectives: [], objectiveIndex: 0 },
    metrics: {
      simTimeSec: 0,
      populationStats: { workers: 0 },
      logistics: { totalCarryInTransit: 0, carryingWorkers: 0 },
    },
  });

  assert.notEqual(result, null, "all-dead colony must produce a loss outcome");
  assert.equal(result.outcome, "loss");
});

test("a colony with >= 1 living agent and healthy stats never transitions to loss", () => {
  const result = evaluateRunOutcomeState({
    agents: [{ type: "WORKER", alive: true }],
    resources: { food: 50, wood: 50 },
    gameplay: { prosperity: 60, threat: 20, objectives: [], objectiveIndex: 0 },
    metrics: {
      simTimeSec: 60,
      populationStats: { workers: 1 },
      logistics: { totalCarryInTransit: 0, carryingWorkers: 0 },
    },
  });

  assert.equal(result, null, "healthy colony with live agents should not produce a loss");
});
