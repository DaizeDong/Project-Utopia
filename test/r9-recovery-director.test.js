// R9 Plan-Recovery-Director — invariants for the three-prong director repair:
//   1-2. GameApp.foodRecoveryMode release gate broadens from a 4-way AND to
//        (stableHealth ∧ (escapeHatch ∨ produced≥consumed)) so quarry/kitchen
//        proposers can re-enter the queue.
//   3.   WarehouseNeedProposer fires on a per-worker
//        `nutritionSourceType === "none"` ratio sensor (≥30% for ≥10s).
//   4.   ScoutRoadProposer caps total roads at 30 (PY observed 79 on a
//        9-worker colony pre-fix).
//   5.   RoleAssignmentSystem drafts ≥1 GUARD when strategy.priority="defend"
//        even with zero live hostiles in proximity.
//
// Source plan: assignments/homework7/Final-Polish-Loop/Round9/Plans/Plan-Recovery-Director.md

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { WarehouseNeedProposer } from "../src/simulation/ai/colony/proposers/WarehouseNeedProposer.js";
import { proposeScoutRoadTowardFoggedStone } from "../src/simulation/ai/colony/proposers/ScoutRoadProposer.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";

// -----------------------------------------------------------------------------
// Step 3 — WarehouseNeedProposer diagnostic-driven trigger
// -----------------------------------------------------------------------------

test("WarehouseNeedProposer fires when 30%+ workers report nutritionSourceType=none with 10s+ dwell", () => {
  // 12 workers, 6 with nutritionSourceType="none" → ratio 0.5 ≥ 0.30.
  // ai.warehouseDiagnosticSinceSec latched 11s ago; nowSec=20.
  const agents = [];
  for (let i = 0; i < 12; i++) {
    agents.push({
      type: "WORKER",
      alive: true,
      hunger: 0.80, // not in critical band — proves we're firing on diagnostic, not hunger
      debug: { nutritionSourceType: i < 6 ? "none" : "warehouse" },
    });
  }
  const state = {
    agents,
    ai: { warehouseDiagnosticSinceSec: 9 },
    metrics: { timeSec: 20 },
  };
  const ctx = {
    food: 200, // healthy food — saturated branch quiet, hunger branch quiet
    buildings: { warehouses: 1 }, // existing warehouse — noAccess=false
    timeSec: 20,
  };
  const out = WarehouseNeedProposer.evaluate(state, ctx);
  assert.equal(out.length, 1, "should emit a warehouse proposal");
  assert.equal(out[0].type, "warehouse");
  assert.equal(out[0].priority, 90);
  assert.match(out[0].reason, /30%\+ workers report no warehouse access/);
});

test("WarehouseNeedProposer latches dwell timer on first observation (no early fire)", () => {
  // First call at t=10 sets the latch but does NOT fire (dwell=0).
  const agents = [];
  for (let i = 0; i < 10; i++) {
    agents.push({
      type: "WORKER",
      alive: true,
      hunger: 0.80,
      debug: { nutritionSourceType: i < 4 ? "none" : "warehouse" },
    });
  }
  const state = { agents, ai: {}, metrics: { timeSec: 10 } };
  const ctx = { food: 200, buildings: { warehouses: 1 }, timeSec: 10 };
  const out = WarehouseNeedProposer.evaluate(state, ctx);
  assert.deepEqual(out, [], "should not fire on first observation");
  assert.equal(state.ai.warehouseDiagnosticSinceSec, 10, "latch should record nowSec");
});

test("WarehouseNeedProposer clears latch when noAccessRatio drops below threshold", () => {
  const agents = [];
  for (let i = 0; i < 10; i++) {
    agents.push({
      type: "WORKER",
      alive: true,
      hunger: 0.80,
      debug: { nutritionSourceType: "warehouse" }, // all OK now
    });
  }
  const state = {
    agents,
    ai: { warehouseDiagnosticSinceSec: 5 }, // stale latch from earlier
    metrics: { timeSec: 30 },
  };
  const ctx = { food: 200, buildings: { warehouses: 1 }, timeSec: 30 };
  WarehouseNeedProposer.evaluate(state, ctx);
  assert.equal(state.ai.warehouseDiagnosticSinceSec, null, "latch should reset when diagnostic clears");
});

// -----------------------------------------------------------------------------
// Step 4 — ScoutRoadProposer hard cap at 30 roads
// -----------------------------------------------------------------------------

test("ScoutRoadProposer returns 0 when total roads >= 30 (cap)", () => {
  const state = createInitialGameState();
  state.resources.stone = 0; // would normally allow scout
  state.resources.wood = 100; // can afford
  state.buildings.roads = 31; // over the cap
  state.metrics = state.metrics ?? {};
  state.metrics.timeSec = 1000;
  const director = { lastStoneScoutProposalSec: -Infinity };
  const fakeBuildSystem = {
    previewToolAt: () => ({ ok: true }),
    placeToolAt: () => ({ ok: true }),
  };
  const placed = proposeScoutRoadTowardFoggedStone(state, fakeBuildSystem, director);
  assert.equal(placed, 0, "scout-road proposer must bail when roads >= 30");
});

// -----------------------------------------------------------------------------
// Step 5 — RoleAssignmentSystem GUARD floor under defend strategy
// -----------------------------------------------------------------------------

test("RoleAssignmentSystem drafts >=1 GUARD when strategy.priority='defend' with no live hostiles", () => {
  const state = createInitialGameState();
  // Ensure ≥4 workers exist (createInitialGameState yields at least 8 by default).
  const workers = state.agents.filter((a) => a.type === "WORKER");
  assert.ok(workers.length >= 4, `precondition: need ≥4 workers, got ${workers.length}`);
  // Make sure no hostiles exist anywhere.
  state.animals = [];
  state.metrics = state.metrics ?? {};
  state.metrics.combat = {
    activeRaiders: 0,
    activeSaboteurs: 0,
    activePredators: 0,
    nearestThreatDistance: -1,
  };
  // Set defend strategy.
  state.ai = state.ai ?? {};
  state.ai.strategy = { priority: "defend" };

  new RoleAssignmentSystem().update(2, state);

  const guardCount = state.agents
    .filter((a) => a.type === "WORKER" && a.role === "GUARD").length;
  assert.ok(
    guardCount >= 1,
    `defend strategy should draft ≥1 GUARD even with no live hostiles (got ${guardCount})`,
  );
});

test("RoleAssignmentSystem does NOT draft GUARD when strategy is non-defend and no hostiles", () => {
  const state = createInitialGameState();
  state.animals = [];
  state.metrics = state.metrics ?? {};
  state.metrics.combat = {
    activeRaiders: 0,
    activeSaboteurs: 0,
    activePredators: 0,
    nearestThreatDistance: -1,
  };
  state.ai = state.ai ?? {};
  state.ai.strategy = { priority: "grow" };

  new RoleAssignmentSystem().update(2, state);

  const guardCount = state.agents
    .filter((a) => a.type === "WORKER" && a.role === "GUARD").length;
  assert.equal(guardCount, 0, "non-defend strategy + no hostiles should yield 0 GUARDs");
});
