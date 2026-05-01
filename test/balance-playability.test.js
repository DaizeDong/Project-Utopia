import test from "node:test";
import assert from "node:assert/strict";

import { VISITOR_KIND, TILE } from "../src/config/constants.js";
import { BALANCE, INITIAL_POPULATION, INITIAL_RESOURCES } from "../src/config/balance.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { evaluateRunOutcomeState } from "../src/app/runOutcome.js";
import { countTilesByType } from "../src/world/grid/Grid.js";

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
  // v0.8.0 Phase 4 — Survival Mode also phrases this as "Colony wiped".
  assert.match(result.reason, /workers|wiped|colonists/i);
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

// --- Starting infrastructure and resources tests (Task 4) ---

test("INITIAL_RESOURCES.food is >= 60 for viable early game", () => {
  assert.ok(
    INITIAL_RESOURCES.food >= 60,
    `INITIAL_RESOURCES.food is ${INITIAL_RESOURCES.food}, expected >= 60`,
  );
});

test("INITIAL_RESOURCES.wood is >= 30 for viable early game", () => {
  // v0.10.1-m: reduced from 80→35 to create tighter early resource pressure
  assert.ok(
    INITIAL_RESOURCES.wood >= 30,
    `INITIAL_RESOURCES.wood is ${INITIAL_RESOURCES.wood}, expected >= 30`,
  );
});

test("Frontier repair scenario has >= 4 farms, >= 2 lumbers, >= 4 walls after building", () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
  const farms = countTilesByType(state.grid, [TILE.FARM]);
  const lumbers = countTilesByType(state.grid, [TILE.LUMBER]);
  const walls = countTilesByType(state.grid, [TILE.WALL]);
  assert.ok(farms >= 4, `Frontier repair scenario has ${farms} farms, expected >= 4`);
  assert.ok(lumbers >= 2, `Frontier repair scenario has ${lumbers} lumbers, expected >= 2`);
  assert.ok(walls >= 4, `Frontier repair scenario has ${walls} walls, expected >= 4`);
});

// --- Initial population cap tests (Task 5) ---

test("INITIAL_POPULATION.workers is <= 14 to match starting farm capacity", () => {
  assert.ok(
    INITIAL_POPULATION.workers <= 14,
    `INITIAL_POPULATION.workers is ${INITIAL_POPULATION.workers}, expected <= 14`,
  );
});

test("INITIAL_POPULATION.visitors is <= 4 to reduce early-game food pressure", () => {
  assert.ok(
    INITIAL_POPULATION.visitors <= 4,
    `INITIAL_POPULATION.visitors is ${INITIAL_POPULATION.visitors}, expected <= 4`,
  );
});

// --- Integration test: colony survives 60 seconds unattended (Task 6) ---

import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";

test("colony does not trigger loss within 60 simulated seconds unattended", () => {
  const state = createInitialGameState({ seed: 1337 });
  const progression = new ProgressionSystem();

  // Populate metrics.populationStats so evaluateRunOutcomeState can read worker count
  const workerCount = state.agents.filter((a) => a.type === "WORKER" && a.alive !== false).length;
  state.metrics.populationStats = {
    workers: workerCount,
    totalEntities: state.agents.length + state.animals.length,
  };

  const FPS = 30;
  const dt = 1 / FPS;
  const TOTAL_TICKS = 60 * FPS; // 1800 ticks = 60 seconds

  for (let tick = 0; tick < TOTAL_TICKS; tick += 1) {
    state.metrics.timeSec += dt;
    state.metrics.simTimeSec = state.metrics.timeSec;
    state.metrics.tick = tick;

    // Run the ProgressionSystem which computes prosperity and threat
    progression.update(dt, state);

    // Check for loss after each tick
    const outcome = evaluateRunOutcomeState(state);
    if (outcome !== null && outcome.outcome === "loss") {
      assert.fail(
        `Colony triggered loss at tick ${tick} (${state.metrics.timeSec.toFixed(1)}s): ${outcome.reason} ` +
        `[prosperity=${state.gameplay.prosperity.toFixed(1)}, threat=${state.gameplay.threat.toFixed(1)}, ` +
        `food=${state.resources.food}, wood=${state.resources.wood}]`,
      );
    }
  }

  // Final sanity checks
  assert.ok(
    state.gameplay.prosperity > 8,
    `Final prosperity ${state.gameplay.prosperity.toFixed(1)} should be above loss threshold (8)`,
  );
  assert.ok(
    state.gameplay.threat < 92,
    `Final threat ${state.gameplay.threat.toFixed(1)} should be below loss threshold (92)`,
  );
  assert.ok(
    state.resources.food > 0 || state.resources.wood > 0,
    `Colony should still have some resources at 60s (food=${state.resources.food}, wood=${state.resources.wood})`,
  );
});
