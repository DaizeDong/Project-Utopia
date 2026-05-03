// v0.10.1 R6 wave-2 (C1-code-architect refactor):
// Unit-test coverage for the seven proposers ported in wave-2:
//
//   1. RecoveryProposer        — gated by isRecoveryMode, 4 sub-rules
//   2. BootstrapProposer       — independent 4 sub-rules
//   3. LogisticsProposer       — independent 4 sub-rules
//   4. ProcessingProposer      — 7 sub-rules + early-game quarry boost
//   5. BridgeProposer          — side-effect (placement) — covered by orchestration test
//   6. ScoutRoadProposer       — side-effect (placement) — covered by orchestration test
//   7. SurvivalPreemptProposer — boolean fire signal, 3 OR-conditions
//
// PATH NOTE: the plan asked for `test/simulation/ai/colony/proposers/wave-2-port.test.js`
// but the project's test runner glob is `node --test test/*.test.js` (flat).
// Re-pathed to `test/build-proposer-wave-2-port.test.js` so the runner picks
// it up; semantics identical.
//
// Mutex coverage: the 4 ColonyNeeds-emitting proposers (Recovery / Bootstrap
// / Logistics / Processing) are NOT mutually exclusive at the proposer
// layer — the original `assessColonyNeeds` `if (recoveryMode) return;`
// short-circuit is enforced by ColonyDirectorSystem (see
// `colony-director-behavior-lock.test.js` for the orchestrator-level
// invariant). Here we only cover that each proposer FIRES / IS SILENT
// according to the legacy if-block contract.

import test from "node:test";
import assert from "node:assert/strict";

import {
  RecoveryProposer,
  BootstrapProposer,
  LogisticsProposer,
  ProcessingProposer,
  SurvivalPreemptProposer,
  WAVE_2_BUILD_PROPOSERS,
  SURVIVAL_PROPOSERS,
  isRecoveryMode,
  runProposers,
} from "../src/simulation/ai/colony/BuildProposer.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { rebuildBuildingStats } from "../src/world/grid/Grid.js";

function makeCtx({
  workers = 5,
  food = 80,
  wood = 30,
  farms = 2,
  lumbers = 1,
  warehouses = 1,
  quarries = 0,
  herbGardens = 0,
  kitchens = 0,
  smithies = 0,
  clinics = 0,
  walls = 0,
  roads = 0,
  stone = 20,
  herbs = 0,
  timeSec = 60,
} = {}) {
  return {
    workers,
    food,
    wood,
    buildings: { farms, lumbers, warehouses, quarries, herbGardens, kitchens, smithies, clinics, walls, roads },
    resources: { food, wood, stone, herbs, meals: 0, medicine: 0, tools: 0 },
    timeSec,
  };
}

// `RecoveryProposer.evaluate` calls `isRecoveryMode(state)` directly. Tests
// can flip it ON via `state.ai.foodRecoveryMode = true` (the OR side of the
// gate); this avoids depending on the `isFoodRunwayUnsafe` heuristic.
function makeStateWithRecovery(active) {
  const state = createInitialGameState();
  state.session = { phase: "active" };
  state.buildings = rebuildBuildingStats(state.grid);
  state.metrics = state.metrics ?? {};
  state.metrics.timeSec = 60;
  state.ai = state.ai ?? {};
  state.ai.foodRecoveryMode = !!active;
  state.resources = { food: 80, wood: 30, stone: 10, herbs: 0, meals: 0, medicine: 0, tools: 0 };
  state.agents = state.agents ?? [];
  while (state.agents.length < 5) state.agents.push({ type: "WORKER", alive: true });
  return state;
}

// -----------------------------------------------------------------------------
// 1. WAVE_2 / SURVIVAL registry shape
// -----------------------------------------------------------------------------

test("WAVE_2_BUILD_PROPOSERS has 4 proposers in canonical order", () => {
  assert.equal(WAVE_2_BUILD_PROPOSERS.length, 4);
  assert.equal(WAVE_2_BUILD_PROPOSERS[0].name, "recovery");
  assert.equal(WAVE_2_BUILD_PROPOSERS[1].name, "bootstrap");
  assert.equal(WAVE_2_BUILD_PROPOSERS[2].name, "logistics");
  assert.equal(WAVE_2_BUILD_PROPOSERS[3].name, "processing");
});

test("SURVIVAL_PROPOSERS has 1 proposer (survivalPreempt)", () => {
  assert.equal(SURVIVAL_PROPOSERS.length, 1);
  assert.equal(SURVIVAL_PROPOSERS[0].name, "survivalPreempt");
});

// -----------------------------------------------------------------------------
// 2. RecoveryProposer
// -----------------------------------------------------------------------------

test("RecoveryProposer silent when isRecoveryMode === false", () => {
  const state = makeStateWithRecovery(false);
  const out = RecoveryProposer.evaluate(state, makeCtx({ farms: 0 }));
  assert.deepEqual(out, []);
});

test("RecoveryProposer fires farm@98 + warehouse@96 when active and below thresholds", () => {
  const state = makeStateWithRecovery(true);
  const out = RecoveryProposer.evaluate(state, makeCtx({
    farms: 0, warehouses: 0, lumbers: 4, roads: 10, wood: 30, workers: 5,
  }));
  assert.ok(out.find(n => n.type === "farm" && n.priority === 98));
  assert.ok(out.find(n => n.type === "warehouse" && n.priority === 96));
});

test("RecoveryProposer fires lumber@92 when wood<10 AND lumbers<4", () => {
  const state = makeStateWithRecovery(true);
  const out = RecoveryProposer.evaluate(state, makeCtx({
    farms: 5, warehouses: 5, lumbers: 2, roads: 10, wood: 5, workers: 5,
  }));
  assert.ok(out.find(n => n.type === "lumber" && n.priority === 92));
});

test("RecoveryProposer fires road@88 when roads < max(6, workers)", () => {
  const state = makeStateWithRecovery(true);
  const out = RecoveryProposer.evaluate(state, makeCtx({
    farms: 5, warehouses: 5, lumbers: 4, roads: 2, wood: 30, workers: 5,
  }));
  assert.ok(out.find(n => n.type === "road" && n.priority === 88));
});

// -----------------------------------------------------------------------------
// 3. BootstrapProposer
// -----------------------------------------------------------------------------

test("BootstrapProposer fires all 4 when zero of each", () => {
  const out = BootstrapProposer.evaluate({}, makeCtx({
    warehouses: 0, farms: 0, lumbers: 0, roads: 0,
  }));
  assert.equal(out.length, 4);
  assert.ok(out.find(n => n.type === "warehouse" && n.priority === 82));
  assert.ok(out.find(n => n.type === "farm" && n.priority === 80));
  assert.ok(out.find(n => n.type === "lumber" && n.priority === 78));
  assert.ok(out.find(n => n.type === "road" && n.priority === 75));
});

test("BootstrapProposer silent at-or-above PHASE_TARGETS.bootstrap", () => {
  const out = BootstrapProposer.evaluate({}, makeCtx({
    warehouses: 3, farms: 3, lumbers: 2, roads: 10,
  }));
  assert.deepEqual(out, []);
});

// -----------------------------------------------------------------------------
// 4. LogisticsProposer
// -----------------------------------------------------------------------------

test("LogisticsProposer fires when below logistics targets", () => {
  const out = LogisticsProposer.evaluate({}, makeCtx({
    warehouses: 2, farms: 4, lumbers: 3, roads: 10,
  }));
  assert.ok(out.find(n => n.type === "warehouse" && n.priority === 70));
  assert.ok(out.find(n => n.type === "farm" && n.priority === 68));
  assert.ok(out.find(n => n.type === "lumber" && n.priority === 66));
  assert.ok(out.find(n => n.type === "road" && n.priority === 60));
});

test("LogisticsProposer silent when at logistics targets", () => {
  const out = LogisticsProposer.evaluate({}, makeCtx({
    warehouses: 4, farms: 6, lumbers: 5, roads: 20,
  }));
  assert.deepEqual(out, []);
});

// -----------------------------------------------------------------------------
// 5. ProcessingProposer
// -----------------------------------------------------------------------------

test("ProcessingProposer fires kitchen@72 + smithy@74 when 0 of each", () => {
  const state = createInitialGameState();
  state.buildings = rebuildBuildingStats(state.grid);
  const out = ProcessingProposer.evaluate(state, makeCtx({
    quarries: 5, herbGardens: 5, kitchens: 0, smithies: 0,
  }));
  assert.ok(out.find(n => n.type === "kitchen" && n.priority === 72));
  assert.ok(out.find(n => n.type === "smithy" && n.priority === 74));
});

test("ProcessingProposer fires quarry/herb_garden when accessibility check fails", () => {
  const state = createInitialGameState();
  state.buildings = rebuildBuildingStats(state.grid);
  // quarries=2 satisfies count threshold; but with no QUARRY tile near a
  // warehouse, hasAccessibleWorksite returns false → still fires.
  const out = ProcessingProposer.evaluate(state, makeCtx({
    quarries: 2, herbGardens: 2,
  }));
  assert.ok(out.find(n => n.type === "quarry"), "expected quarry need (no accessible worksite)");
  assert.ok(out.find(n => n.type === "herb_garden"), "expected herb_garden need (no accessible worksite)");
});

// -----------------------------------------------------------------------------
// 6. SurvivalPreemptProposer
// -----------------------------------------------------------------------------

test("SurvivalPreemptProposer fires on zero-farm before t<180", () => {
  const out = SurvivalPreemptProposer.evaluate({}, makeCtx({
    farms: 0, food: 80, stone: 20, quarries: 1, timeSec: 60,
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "survival-preempt");
  assert.match(out[0].reason, /zero-farm/);
});

test("SurvivalPreemptProposer silent on zero-farm AFTER t>=180", () => {
  const out = SurvivalPreemptProposer.evaluate({}, makeCtx({
    farms: 0, food: 80, stone: 20, quarries: 1, timeSec: 200,
  }));
  assert.deepEqual(out, []);
});

test("SurvivalPreemptProposer fires on food crisis", () => {
  const out = SurvivalPreemptProposer.evaluate({}, makeCtx({
    farms: 2, food: 20, stone: 20, quarries: 1, timeSec: 600,
  }));
  assert.equal(out.length, 1);
  assert.match(out[0].reason, /food-crisis/);
});

test("SurvivalPreemptProposer fires on stone crisis", () => {
  const out = SurvivalPreemptProposer.evaluate({}, makeCtx({
    farms: 5, food: 80, stone: 5, quarries: 0, timeSec: 600,
  }));
  assert.equal(out.length, 1);
  assert.match(out[0].reason, /stone-crisis/);
});

test("SurvivalPreemptProposer compound reasons stack", () => {
  const out = SurvivalPreemptProposer.evaluate({}, makeCtx({
    farms: 0, food: 20, stone: 5, quarries: 0, timeSec: 60,
  }));
  assert.equal(out.length, 1);
  assert.match(out[0].reason, /zero-farm/);
  assert.match(out[0].reason, /food-crisis/);
  assert.match(out[0].reason, /stone-crisis/);
});

test("SurvivalPreemptProposer silent on healthy colony", () => {
  const out = SurvivalPreemptProposer.evaluate({}, makeCtx({
    farms: 5, food: 100, stone: 50, quarries: 2, timeSec: 600,
  }));
  assert.deepEqual(out, []);
});

// -----------------------------------------------------------------------------
// 7. runProposers + WAVE_2 orchestration: recovery short-circuit invariant
// -----------------------------------------------------------------------------

test("runProposers(WAVE_2) emits recovery needs when isRecoveryMode is on", () => {
  const state = makeStateWithRecovery(true);
  const ctx = makeCtx({ farms: 0, warehouses: 0, lumbers: 4, roads: 10, wood: 30 });
  const out = runProposers(WAVE_2_BUILD_PROPOSERS, state, ctx);
  // RecoveryProposer fires (farm@98 + warehouse@96 at minimum).
  assert.ok(out.find(n => n.priority === 98 && n.type === "farm"));
});

test("isRecoveryMode mirrors legacy gate (foodRecoveryMode flag)", () => {
  const off = makeStateWithRecovery(false);
  const on = makeStateWithRecovery(true);
  assert.equal(isRecoveryMode(off), false);
  assert.equal(isRecoveryMode(on), true);
});
