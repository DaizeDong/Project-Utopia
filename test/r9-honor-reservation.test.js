// R9 Plan-Honor-Reservation — assert two surgical fixes:
//   B1: SEEKING_HARVEST/HARVESTING.onEnter honor JobReservation.tryReserve()
//       boolean (lost race ⇒ null target ⇒ dispatcher routes to IDLE next tick).
//   B3: RoleAssignmentSystem BUILDER quota uses size-by-unclaimed-sites
//       formula `max(2, ceil(sitesUnclaimed * 0.4))` so unbuilt sites pull
//       extra builders instead of stranding the queue at a single BUILDER.
//
// Plan: assignments/homework7/Final-Polish-Loop/Round9/Plans/Plan-Honor-Reservation.md
// PX feedback: assignments/homework7/Final-Polish-Loop/Round9/Feedbacks/PX-work-assignment-binding.md

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import "../src/simulation/npc/WorkerAISystem.js";
import { STATE, STATE_BEHAVIOR } from "../src/simulation/npc/fsm/WorkerStates.js";
import { JobReservation } from "../src/simulation/npc/JobReservation.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";
import { ROLE } from "../src/config/constants.js";

function aliveWorkers(state) {
  return state.agents.filter((a) => a.type === "WORKER" && a.alive !== false);
}

function setWorkerCount(state, targetCount) {
  const workers = state.agents.filter((a) => a.type === "WORKER");
  if (workers.length === targetCount) return;
  if (workers.length > targetCount) {
    const keepIds = new Set(workers.slice(0, targetCount).map((w) => w.id));
    state.agents = state.agents.filter((a) => a.type !== "WORKER" || keepIds.has(a.id));
    return;
  }
  const template = workers[workers.length - 1] ?? null;
  if (!template) throw new Error("No worker template available");
  for (let i = workers.length; i < targetCount; i += 1) {
    const clone = { ...template, id: `${template.id}-pad-${i}`, role: template.role };
    state.agents.push(clone);
  }
}

function countRole(state, role) {
  return state.agents.filter((a) => a.type === "WORKER" && a.role === role).length;
}

// ---------------------------------------------------------------------------
// B1 — HARVESTING.onEnter honors tryReserve() boolean.
// ---------------------------------------------------------------------------

test("R9 B1: HARVESTING.onEnter nulls target when tile is already claimed by another worker", () => {
  const state = createInitialGameState({ seed: 4242, bareInitial: true });
  state.session.phase = "active";
  state.metrics.timeSec = 5;
  state._jobReservation = new JobReservation();
  // workerA pre-claims tile (5,5).
  state._jobReservation.tryReserve("worker_A", 5, 5, "harvest", 1);

  const workerB = aliveWorkers(state)[0];
  workerB.role = ROLE.FARM;
  workerB.targetTile = { ix: 5, iz: 5 };
  workerB.fsm = {
    state: STATE.HARVESTING,
    enteredAtSec: 5,
    target: { ix: 5, iz: 5 },
    payload: undefined,
  };

  STATE_BEHAVIOR[STATE.HARVESTING].onEnter(workerB, state, createServices(state.world.mapSeed));

  assert.equal(workerB.fsm.target, null,
    "HARVESTING.onEnter must null fsm.target when tryReserve returns false");
  // workerA's reservation is unchanged.
  assert.equal(state._jobReservation.getOccupant(5, 5), "worker_A",
    "incumbent workerA still holds the (5,5) reservation after the failed race");
});

test("R9 B1: HARVESTING.onEnter happy path — claims reservation when tile is free", () => {
  const state = createInitialGameState({ seed: 4242, bareInitial: true });
  state.session.phase = "active";
  state.metrics.timeSec = 5;
  state._jobReservation = new JobReservation();

  const worker = aliveWorkers(state)[0];
  worker.role = ROLE.FARM;
  worker.targetTile = { ix: 7, iz: 7 };
  worker.fsm = {
    state: STATE.HARVESTING,
    enteredAtSec: 5,
    target: { ix: 7, iz: 7 },
    payload: undefined,
  };

  STATE_BEHAVIOR[STATE.HARVESTING].onEnter(worker, state, createServices(state.world.mapSeed));

  assert.deepEqual(worker.fsm.target, { ix: 7, iz: 7 },
    "happy-path target preserved when reservation succeeds");
  assert.equal(state._jobReservation.getOccupant(7, 7), worker.id,
    "this worker now holds the (7,7) reservation");
});

// ---------------------------------------------------------------------------
// B3 — RoleAssignmentSystem BUILDER quota = max(2, ceil(sitesUnclaimed*0.4)).
// ---------------------------------------------------------------------------

test("R9 B3: BUILDER quota uses sitesUnclaimed*0.4 floor=2 — 6 unclaimed sites + 12 workers ⇒ ≥2 builders", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 12);
  state.constructionSites = Array.from({ length: 6 }, (_, i) => ({
    ix: 40 + i, iz: 40, kind: "build", tool: "wall",
    builderId: null, workAppliedSec: 0, workTotalSec: 2,
  }));
  const roles = new RoleAssignmentSystem();
  roles.update(2, state);
  // Pre-fix: ceil(6 * 1.5)=9 → fractionCap floor(12*0.30)=3 → 3 builders.
  // Post-fix: max(2, ceil(6*0.4))=max(2,3)=3 → fractionCap=3 → 3 builders.
  // The invariant we pin is the FLOOR — never below 2 when sites exist.
  const builderCount = countRole(state, ROLE.BUILDER);
  assert.ok(builderCount >= 2,
    `expected ≥2 BUILDERs with 6 unclaimed sites + 12 workers, got ${builderCount}`);
});

test("R9 B3: BUILDER quota floor of 2 holds even when all sites are already claimed", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 12);
  // Single site already reserved by an existing builder ⇒ sitesUnclaimedCount=0.
  // max(2, ceil(0*0.4))=max(2,0)=2. Floor still kicks in because sites exist.
  const fakeBuilderId = aliveWorkers(state)[0].id;
  state.constructionSites = [{
    ix: 40, iz: 40, kind: "build", tool: "wall",
    builderId: fakeBuilderId, workAppliedSec: 0, workTotalSec: 2,
  }];
  const roles = new RoleAssignmentSystem();
  roles.update(2, state);
  const builderCount = countRole(state, ROLE.BUILDER);
  assert.ok(builderCount >= 2,
    `expected ≥2 BUILDERs with 1 claimed site + 12 workers (redundancy floor), got ${builderCount}`);
});

test("R9 B3: BUILDER quota = 0 when no sites exist (floor only kicks in for non-empty queue)", () => {
  const state = createInitialGameState();
  setWorkerCount(state, 12);
  state.constructionSites = [];
  const roles = new RoleAssignmentSystem();
  roles.update(2, state);
  assert.equal(countRole(state, ROLE.BUILDER), 0,
    "no sites ⇒ targetBuilders=0 (floor of 2 only when sitesCount>0)");
});
