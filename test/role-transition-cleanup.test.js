import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { ROLE } from "../src/config/constants.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";
import { JobReservation } from "../src/simulation/npc/JobReservation.js";

// v0.8.3 role-transition-cleanup audit fix
// -----------------------------------------------------------------------
// Bug B: RoleAssignmentSystem reassigns worker.role = "GUARD" without
// clearing the worker's existing JobReservation, targetTile, path, or
// blackboard intent. A FARM worker promoted to GUARD keeps holding their
// old farm-tile reservation for up to 30s (until cleanupStale) and
// continues walking toward their old worksite.

function findFarmWorker(state) {
  return state.agents.find((a) => a.type === "WORKER" && a.role === ROLE.FARM)
    ?? state.agents.find((a) => a.type === "WORKER");
}

function seedReservedFarmer(state) {
  state._jobReservation = new JobReservation();
  const farmer = findFarmWorker(state);
  assert.ok(farmer, "default state must spawn at least one worker");
  farmer.role = ROLE.FARM;
  farmer.targetTile = { ix: 9, iz: 9 };
  farmer.path = [{ ix: 8, iz: 8 }, { ix: 9, iz: 9 }];
  farmer.pathIndex = 1;
  farmer.pathGridVersion = 0;
  farmer.blackboard = farmer.blackboard ?? {};
  farmer.blackboard.lastIntent = "harvest_farm";
  state._jobReservation.reserve(farmer.id, 9, 9, "farm", 0);
  return farmer;
}

test("Bug B — promoting a FARM worker to GUARD releases their tile reservation", () => {
  const state = createInitialGameState();
  state._jobReservation = new JobReservation();
  // Pick a deterministic worker, relocate them well clear of every other
  // worker so the threat-distance candidate sort cannot tie. Then seed
  // their navigation/intent state and a tile reservation under FARM.
  const farmer = state.agents.find((a) => a.type === "WORKER");
  assert.ok(farmer, "default state must spawn at least one worker");
  // Move the rest of the workers far away so this farmer is uniquely closest.
  for (const w of state.agents) {
    if (w === farmer || w.type !== "WORKER") continue;
    w.x = 80;
    w.z = 60;
  }
  farmer.x = 10;
  farmer.z = 10;
  farmer.role = ROLE.FARM;
  farmer.targetTile = { ix: 9, iz: 9 };
  farmer.path = [{ ix: 8, iz: 8 }, { ix: 9, iz: 9 }];
  farmer.pathIndex = 1;
  farmer.pathGridVersion = 0;
  farmer.blackboard = farmer.blackboard ?? {};
  farmer.blackboard.lastIntent = "harvest_farm";
  state._jobReservation.reserve(farmer.id, 9, 9, "farm", 0);
  assert.equal(state._jobReservation.getReservationCount(9, 9), 1);

  // Force the threat-driven GUARD promotion path. We hand-feed the live
  // combat posture so RoleAssignmentSystem requests at least one GUARD
  // and the proximity gate (~6 tiles) is satisfied.
  state.metrics.combat = {
    activeThreats: 1,
    activeRaiders: 1,
    activePredators: 1,
    guardCount: 0,
    workerCount: state.agents.length,
    nearestThreatDistance: 3,
  };
  // Spawn a raider next to the farmer so distance-based guard candidate
  // ordering is unambiguous (every other worker is at (80,60)).
  state.animals.push({
    id: "raider-1",
    kind: "PREDATOR",
    species: "raider_beast",
    x: farmer.x + 1,
    z: farmer.z + 1,
    alive: true,
    hp: 10,
  });

  new RoleAssignmentSystem().update(2, state);

  // The seeded farmer should be the one promoted (uniquely closest). The
  // role flip releases the JobReservation immediately; navigation/intent
  // state is intentionally preserved (WorkerAISystem.maybeRetarget detects
  // the role/intent mismatch on the next tick and replans naturally —
  // eager path-nuking here would crater long-horizon throughput because
  // benign FARM↔HAUL oscillations every managerInterval would trash paths).
  assert.equal(farmer.role, "GUARD", "the closest worker to the threat must become GUARD");
  assert.equal(state._jobReservation.getWorkerReservation(farmer.id), null,
    "JobReservation released for the promoted worker");
  assert.equal(state._jobReservation.getReservationCount(9, 9), 0,
    "old farm-tile reservation no longer present in the registry");
});

test("Bug B — same-role re-assignment does NOT churn reservation/path", () => {
  // If RoleAssignmentSystem ends up assigning the same role a worker
  // already has (very common — most ticks don't actually change roles),
  // we must NOT release reservations or null out the path. Doing so
  // would defeat the whole worker-targeting cache and cause needless
  // path recomputes every manager interval.
  const state = createInitialGameState();
  const farmer = seedReservedFarmer(state);

  // No combat posture, no threat — RoleAssignmentSystem should leave the
  // farmer as FARM (or move them through the FARM/WOOD pool which lands
  // most workers back on FARM by quota).
  new RoleAssignmentSystem().update(2, state);

  if (farmer.role === ROLE.FARM) {
    // Same-role: state should NOT have been clobbered.
    assert.deepEqual(farmer.targetTile, { ix: 9, iz: 9 },
      "same-role assignment must not clobber targetTile");
    assert.equal(farmer.pathIndex, 1, "same-role assignment must not reset pathIndex");
    assert.equal(farmer.blackboard.lastIntent, "harvest_farm",
      "same-role assignment must not clobber blackboard intent");
    assert.equal(state._jobReservation.getReservationCount(9, 9), 1,
      "same-role assignment must not release tile reservation");
  }
});
