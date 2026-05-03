// R10 Plan-PBB-recruit-flow-fix Step 3 — invariant test for the food
// production-flow telemetry pipeline.
//
// Background: state.metrics.foodProducedPerMin was structurally always 0
// in shipped play because no code path called recordResourceFlow(state,
// "food", "produced", ...) on the worker farm-deposit path. R5 PC built
// a load-bearing population-growth gate on top of that metric
// (BALANCE.recruitMinFoodHeadroomSec = 60) → recruit queue could never
// fill. R10 Plan-PBB-recruit-flow-fix added the missing emit at:
//   - WorkerAISystem.js warehouse-unload path (the standard deposit)
//   - WorkerAISystem.js bootstrap-no-warehouse direct-deposit path
//
// This test is the canary that ensures a future refactor cannot silently
// re-break the production-side telemetry. It exercises:
//   1. The flow API + flush pipeline (recordResourceFlow → ResourceSystem
//      flush → state.metrics.foodProducedPerMin > 0).
//   2. The negative control (no produced emit → metric stays 0).
//   3. The defensive recruitTotal initialisation (R10 Step 2).

import test from "node:test";
import assert from "node:assert/strict";

import {
  ResourceSystem,
  RESOURCE_FLOW_WINDOW_SEC,
  recordResourceFlow,
} from "../src/simulation/economy/ResourceSystem.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";

function buildMinimalState() {
  // Bare-init to keep the harness lean; we only care about the flow pipeline,
  // not scenario placement.
  return createInitialGameState({ seed: 4242, bareInitial: true });
}

test("food production-flow: recordResourceFlow → ResourceSystem flush sets foodProducedPerMin > 0", () => {
  const state = buildMinimalState();
  const sys = new ResourceSystem();

  // Bootstrap the flow accumulator + window snapshot (mirrors the once-per-
  // tick init inside ResourceSystem.update). Drive a tiny dt first so the
  // accumulator object exists before we record into it.
  sys.update(0.01, state);

  // Sanity: shipped baseline before our fix used to read 0 forever. After
  // the fix, the accumulator is empty until something records into it.
  assert.equal(
    Number(state.metrics.foodProducedPerMin ?? 0), 0,
    "metric starts at 0 with no producer emits",
  );

  // Simulate a worker farm-deposit unload of 10 food. This is exactly what
  // WorkerAISystem.js now records on the warehouse-unload path.
  const unloadFood = 10;
  recordResourceFlow(state, "food", "produced", unloadFood);

  // Drive the ResourceSystem with enough dt to cross the flush window
  // (RESOURCE_FLOW_WINDOW_SEC = 3s). One tick of dt = window+0.5s is enough
  // to trigger the flush branch.
  sys.update(RESOURCE_FLOW_WINDOW_SEC + 0.5, state);

  const producedPerMin = Number(state.metrics.foodProducedPerMin ?? 0);
  assert.ok(
    producedPerMin > 0,
    `expected foodProducedPerMin > 0 after recording 10 food produced; got ${producedPerMin}`,
  );

  // Stronger: the per-min projection equals unloadFood × (60 / windowSec).
  // The accumulated window includes the bootstrap tick (0.01s) plus the
  // flush tick (RESOURCE_FLOW_WINDOW_SEC + 0.5 = 3.5s) → 3.51s total. The
  // flush divides by the FULL accumulated window. Using a tolerance so the
  // assertion is robust to bootstrap-dt tweaks; the meaningful invariant is
  // "non-zero AND in the expected order of magnitude".
  const expected = unloadFood * (60 / 3.51); // ≈ 170.94
  assert.ok(
    Math.abs(producedPerMin - expected) < 1,
    `expected foodProducedPerMin ≈ ${expected.toFixed(2)} (10 × 60/3.51); got ${producedPerMin}`,
  );
});

test("food production-flow: negative control — no produced emit keeps foodProducedPerMin = 0", () => {
  const state = buildMinimalState();
  const sys = new ResourceSystem();

  // Bootstrap.
  sys.update(0.01, state);

  // Record nothing. Drive the flush.
  sys.update(RESOURCE_FLOW_WINDOW_SEC + 0.5, state);

  const producedPerMin = Number(state.metrics.foodProducedPerMin ?? 0);
  assert.equal(
    producedPerMin, 0,
    `expected foodProducedPerMin = 0 with no emits; got ${producedPerMin}`,
  );
});

test("food production-flow: zero-quantity emits are safely ignored (clamped to 0)", () => {
  const state = buildMinimalState();
  const sys = new ResourceSystem();

  sys.update(0.01, state);
  recordResourceFlow(state, "food", "produced", 0);
  recordResourceFlow(state, "food", "produced", -5);
  sys.update(RESOURCE_FLOW_WINDOW_SEC + 0.5, state);

  const producedPerMin = Number(state.metrics.foodProducedPerMin ?? 0);
  assert.equal(
    producedPerMin, 0,
    `zero/negative emits should not bump the metric; got ${producedPerMin}`,
  );
});

test("R10 Step 2: state.metrics.recruitTotal is initialised to 0 (not undefined)", () => {
  const state = createInitialGameState();
  // Pre-R10 Step 2 this was `undefined` until PopulationGrowthSystem first
  // incremented it (or NaN if a consumer did `metrics.recruitTotal + 1`).
  assert.equal(
    state.metrics.recruitTotal, 0,
    "EntityFactory should seed metrics.recruitTotal = 0",
  );
  assert.ok(
    Number.isFinite(state.metrics.recruitTotal),
    "metrics.recruitTotal must be a finite number from frame 0",
  );
});
