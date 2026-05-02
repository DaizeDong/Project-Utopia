// R5 PA-worker-fsm-task-release Step 6 — assert SEEKING_BUILD.onExit
// releases the builder reservation when the worker leaves without arriving.
//
// Setup: a fresh worker enters SEEKING_BUILD after reserving a construction
// site (via findOrReserveBuilderSite). Then the worker exits without arriving
// at the site (target=null path or stale target). The reservation must be
// released so a different BUILDER picks the site next tick — without this,
// a leaked builderId blocks every other BUILDER from claiming the site,
// causing the IDLE → SEEKING_BUILD → IDLE oscillation reported in B1.

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import "../src/simulation/npc/WorkerAISystem.js";
import { STATE, STATE_BEHAVIOR } from "../src/simulation/npc/fsm/WorkerStates.js";
import { releaseBuilderSite } from "../src/simulation/construction/ConstructionSites.js";
import { ROLE } from "../src/config/constants.js";

function aliveWorkers(state) {
  return state.agents.filter((a) => a.type === "WORKER" && a.alive !== false);
}

test("R5 PA: SEEKING_BUILD.onExit releases builder reservation when not arrived", () => {
  const state = createInitialGameState({ seed: 4242, bareInitial: true });
  state.session.phase = "active";
  state.metrics.timeSec = 5;
  const services = createServices(state.world.mapSeed);

  const worker = aliveWorkers(state)[0];
  worker.role = ROLE.BUILDER;
  worker.x = 0; worker.z = 0;

  // Plant a single construction site reserved by THIS worker. The fsm.target
  // is set to that tile so onExit's `arrived` check uses it.
  state.constructionSites = [{
    ix: 50, iz: 38,
    kind: "build", tool: "wall",
    builderId: worker.id,
    workAppliedSec: 0, workTotalSec: 2,
  }];
  worker.fsm = {
    state: STATE.SEEKING_BUILD,
    enteredAtSec: 5,
    target: { ix: 50, iz: 38, meta: { siteKey: "50,38" } },
    payload: undefined,
  };

  // Pre-condition — site is reserved.
  assert.equal(state.constructionSites[0].builderId, worker.id,
    "site initially reserved by this worker");

  // Worker is NOT at the target tile (x=0,z=0 vs tile 50,38), so onExit's
  // arrived() returns false → releaseBuilderSite must be called.
  STATE_BEHAVIOR[STATE.SEEKING_BUILD].onExit(worker, state, services);

  assert.equal(state.constructionSites[0].builderId, null,
    "SEEKING_BUILD.onExit released the reservation when worker did not arrive");
});

test("R5 PA: SEEKING_BUILD.onExit preserves reservation when worker arrived", () => {
  // Mirror case: when the worker IS at the target, BUILDING.onExit is the
  // owner of the release; SEEKING_BUILD must NOT release on the way in.
  const state = createInitialGameState({ seed: 4242, bareInitial: true });
  state.session.phase = "active";
  state.metrics.timeSec = 5;
  const services = createServices(state.world.mapSeed);

  const worker = aliveWorkers(state)[0];
  worker.role = ROLE.BUILDER;
  // Position the worker at the same tile coordinates as the site so
  // worldToTile(worker.x, worker.z) === target.
  // Grid is 96x72, tileSize 1; centre of tile (ix,iz) is at world
  // ((ix - width/2 + 0.5) * tileSize, (iz - height/2 + 0.5) * tileSize).
  const grid = state.grid;
  const ix = 50, iz = 38;
  worker.x = (ix - grid.width / 2 + 0.5) * grid.tileSize;
  worker.z = (iz - grid.height / 2 + 0.5) * grid.tileSize;

  state.constructionSites = [{
    ix, iz,
    kind: "build", tool: "wall",
    builderId: worker.id,
    workAppliedSec: 0, workTotalSec: 2,
  }];
  worker.fsm = {
    state: STATE.SEEKING_BUILD,
    enteredAtSec: 5,
    target: { ix, iz, meta: { siteKey: `${ix},${iz}` } },
    payload: undefined,
  };

  STATE_BEHAVIOR[STATE.SEEKING_BUILD].onExit(worker, state, services);

  assert.equal(state.constructionSites[0].builderId, worker.id,
    "SEEKING_BUILD.onExit kept the reservation when worker arrived (BUILDING.onExit owns the release)");
});

test("R5 PA: releaseBuilderSite clears builderId on the matching site", () => {
  // Sanity check that the helper exists and clears the matching builderId
  // (guards against the SEEKING_BUILD.onExit assertion above silently
  // passing if releaseBuilderSite were aliased to a no-op). Use a minimal
  // grid stub with tileState.get returning undefined so the overlay-mirror
  // branch in releaseBuilderSite is a no-op without crashing.
  const state = {
    constructionSites: [{ ix: 1, iz: 1, builderId: "worker-7" }],
    grid: {
      width: 4, height: 4, tileSize: 1,
      tileState: { get: () => undefined },
    },
  };
  releaseBuilderSite(state, { id: "worker-7" });
  assert.equal(state.constructionSites[0].builderId, null,
    "releaseBuilderSite clears the builderId for the matching worker");
});
