import test from "node:test";
import assert from "node:assert/strict";

import { VISITOR_KIND } from "../src/config/constants.js";
import { BALANCE } from "../src/config/balance.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { evaluateRunOutcomeState } from "../src/app/runOutcome.js";

test("Trader ratio is >= 40% of all visitors", () => {
  const state = createInitialGameState();
  const visitors = state.agents.filter((a) => a.type === "VISITOR");
  const traders = visitors.filter((a) => a.kind === VISITOR_KIND.TRADER);
  const ratio = traders.length / visitors.length;
  assert.ok(
    ratio >= 0.4,
    `Trader ratio ${(ratio * 100).toFixed(1)}% is below the 40% minimum (${traders.length}/${visitors.length})`,
  );
});

test("Saboteur initial cooldown is >= 20 seconds", () => {
  const state = createInitialGameState();
  const saboteurs = state.agents.filter(
    (a) => a.type === "VISITOR" && a.kind === VISITOR_KIND.SABOTEUR,
  );
  assert.ok(saboteurs.length > 0, "expected at least one saboteur");
  for (const s of saboteurs) {
    assert.ok(
      s.sabotageCooldown >= 20,
      `Saboteur ${s.id} has initial cooldown ${s.sabotageCooldown.toFixed(1)}s, expected >= 20s`,
    );
  }
});

test("Recurring sabotage cooldown range is at least 18-30 seconds", () => {
  assert.ok(
    BALANCE.sabotageCooldownMinSec >= 18,
    `sabotageCooldownMinSec is ${BALANCE.sabotageCooldownMinSec}, expected >= 18`,
  );
  assert.ok(
    BALANCE.sabotageCooldownMaxSec >= 30,
    `sabotageCooldownMaxSec is ${BALANCE.sabotageCooldownMaxSec}, expected >= 30`,
  );
});

// --- Grace period tests (Task 2) ---

test("Prosperity/threat loss does NOT trigger during grace period (simTime=30s)", () => {
  const result = evaluateRunOutcomeState({
    agents: [{ type: "WORKER", alive: true }],
    resources: { food: 10, wood: 10 },
    gameplay: { prosperity: 3, threat: 98, objectives: [], objectiveIndex: 0 },
    metrics: { simTimeSec: 30, populationStats: { workers: 1 }, logistics: { totalCarryInTransit: 0, carryingWorkers: 0 } },
  });
  assert.equal(
    result,
    null,
    `Expected no loss at simTime=30s during grace period, but got: ${JSON.stringify(result)}`,
  );
});

test("Prosperity/threat loss DOES trigger after grace period (simTime=120s)", () => {
  const result = evaluateRunOutcomeState({
    agents: [{ type: "WORKER", alive: true }],
    resources: { food: 10, wood: 10 },
    gameplay: { prosperity: 3, threat: 98, objectives: [], objectiveIndex: 0 },
    metrics: { simTimeSec: 120, populationStats: { workers: 1 }, logistics: { totalCarryInTransit: 0, carryingWorkers: 0 } },
  });
  assert.notEqual(result, null, "Expected a loss result after grace period");
  assert.equal(result.outcome, "loss");
  assert.match(result.reason, /prosperity/i);
});

test("All-workers-gone loss triggers immediately with no grace period", () => {
  const result = evaluateRunOutcomeState({
    agents: [],
    resources: { food: 10, wood: 10 },
    gameplay: { prosperity: 50, threat: 10, objectives: [], objectiveIndex: 0 },
    metrics: { simTimeSec: 0, populationStats: { workers: 0 }, logistics: { totalCarryInTransit: 0, carryingWorkers: 0 } },
  });
  assert.notEqual(result, null, "Expected immediate loss when all workers are gone");
  assert.equal(result.outcome, "loss");
  assert.match(result.reason, /workers/i);
});

// --- Pressure multiplier tests (Task 3) ---

test("eventPressureThreat is <= 5.0 to prevent single-event threat spikes", () => {
  assert.ok(
    BALANCE.eventPressureThreat <= 5.0,
    `eventPressureThreat is ${BALANCE.eventPressureThreat}, expected <= 5.0`,
  );
});

test("eventPressureProsperityPenalty is <= 4.0 to prevent single-event prosperity collapse", () => {
  assert.ok(
    BALANCE.eventPressureProsperityPenalty <= 4.0,
    `eventPressureProsperityPenalty is ${BALANCE.eventPressureProsperityPenalty}, expected <= 4.0`,
  );
});

test("weatherPressureProsperityPenalty is <= 5.0 to prevent weather-driven prosperity collapse", () => {
  assert.ok(
    BALANCE.weatherPressureProsperityPenalty <= 5.0,
    `weatherPressureProsperityPenalty is ${BALANCE.weatherPressureProsperityPenalty}, expected <= 5.0`,
  );
});
