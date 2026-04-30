// v0.8.12 worker-AI deeper-fix regressions. Each case targets one of the
// three high-severity findings from the post-v0.8.11 runtime audit
// (/tmp/utopia-worker-findings.md). Setup conventions follow
// `test/worker-ai-bare-init.test.js` (v0.8.11).
//
// F2 — commitment latch escape when role has no worksite >3s.
// F3+F4 — reachableFood semantics + starving-preempt gate so a walled-off
//          warehouse no longer pins a carry-bearing worker into seek_food.
// F12 — deliverStuckReplan extended to fire when warehouse is unreachable.

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";
import { BoidsSystem } from "../src/simulation/movement/BoidsSystem.js";
import { MortalitySystem } from "../src/simulation/lifecycle/MortalitySystem.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";
import { mutateTile } from "../src/simulation/lifecycle/TileMutationHooks.js";
import { worldToTile, tileToWorld } from "../src/world/grid/Grid.js";
import { ROLE, TILE } from "../src/config/constants.js";

function aliveWorkers(state) {
  return state.agents.filter((a) => a.type === "WORKER" && a.alive !== false);
}

function findFirstTile(state, tileId) {
  const grid = state.grid;
  for (let iz = 0; iz < grid.height; iz += 1) {
    for (let ix = 0; ix < grid.width; ix += 1) {
      if (grid.tiles[ix + iz * grid.width] === tileId) return { ix, iz };
    }
  }
  return null;
}

function runTicks(state, services, systems, totalSec, dt = 1 / 30, perTick) {
  const steps = Math.round(totalSec / dt);
  for (let i = 0; i < steps; i += 1) {
    state.metrics.timeSec = Number(state.metrics.timeSec ?? 0) + dt;
    state.metrics.tick = Number(state.metrics.tick ?? 0) + 1;
    for (const sys of systems) sys.update(dt, state, services);
    if (perTick) perTick(state, i);
  }
}

test("v0.8.12 F2: STONE worker with no quarries breaks out of seek_task within 5s and moves ≥2 tiles", () => {
  const state = createInitialGameState({ seed: 1337, bareInitial: true });
  state.session.phase = "active";
  state.resources.food = 9999; // remove hunger as a confound
  // Bare-init has no quarries; ensure that's still true.
  state.buildings.quarries = 0;

  const services = createServices(state.world.mapSeed);
  const workerSystem = new WorkerAISystem();
  const boidsSystem = new BoidsSystem();
  const roleSystem = new RoleAssignmentSystem();

  const workers = aliveWorkers(state);
  assert.ok(workers.length > 0, "expected workers in bare-init state");

  // Pick one worker and force role STONE — no quarry exists, so pre-fix
  // they'd latch into seek_task forever.
  const target = workers[0];
  target.role = ROLE.STONE;
  // Snapshot starting tile.
  const startTile = worldToTile(target.x, target.z, state.grid);

  // Run one role-system tick to settle other workers; the manual override
  // for `target.role` is preserved because roleSystem reassigns based on
  // economy needs but our `target` is one of many — we re-assert post-loop.
  roleSystem.update(1.2, state);
  // Re-pin role in case role-assignment touched it.
  target.role = ROLE.STONE;

  let maxMoved = 0;
  runTicks(state, services, [workerSystem, boidsSystem], 5.0, 1 / 30, (s) => {
    // Keep role pinned so the test exercises the F2 escape rather than a
    // role swap.
    target.role = ROLE.STONE;
    // Track peak Manhattan displacement from start (final displacement is
    // fragile because boids may push the worker back toward start by t=5s).
    const cur = worldToTile(target.x, target.z, state.grid);
    const d = Math.abs(cur.ix - startTile.ix) + Math.abs(cur.iz - startTile.iz);
    if (d > maxMoved) maxMoved = d;
  });

  // Worker must have escaped seek_task.
  const finalState = String(target.blackboard?.fsm?.state ?? "");
  assert.notEqual(
    finalState,
    "seek_task",
    `F2 escape failed: STONE worker still in seek_task after 5s (state=${finalState}).`,
  );

  // Worker must have moved ≥2 tiles at peak (final displacement can be lower
  // if boids push the worker back toward start; peak confirms the worker is
  // actually wandering rather than frozen).
  const endTile = worldToTile(target.x, target.z, state.grid);
  assert.ok(
    maxMoved >= 2,
    `F2 escape failed: STONE worker peak displacement only ${maxMoved} tiles (start=${startTile.ix},${startTile.iz} end=${endTile.ix},${endTile.iz}).`,
  );
});

test("v0.8.12 F3+F4: walled-warehouse + no-worksite role + low hunger → emergency-ration eats fire via wander carry-bypass", () => {
  // bareInitial gives a clean slate (no farms/quarries/lumbers/warehouse).
  // We manually place a single warehouse so we can wall it off without
  // mutateTile's rebuildBuildingStats restoring quarries from the default
  // bootstrap that the audit's scenario E used.
  const state = createInitialGameState({ seed: 1337, bareInitial: true });
  state.session.phase = "active";
  state.resources.food = 100; // stockpile for emergency-ration to draw from

  // Place a warehouse tile in a passable area.
  const grid = state.grid;
  let wx = -1, wz = -1;
  for (let iz = 10; iz < grid.height - 10 && wx < 0; iz += 1) {
    for (let ix = 10; ix < grid.width - 10 && wx < 0; ix += 1) {
      if (grid.tiles[ix + iz * grid.width] === TILE.GRASS) { wx = ix; wz = iz; }
    }
  }
  assert.ok(wx >= 0, "test setup: could not find a GRASS tile to place warehouse");
  mutateTile(state, wx, wz, TILE.WAREHOUSE);

  for (const w of aliveWorkers(state)) {
    w.role = ROLE.STONE; // no quarries (bareInitial) → noWorkSite=true → wander
    w.hunger = 0.10;     // below WORKER_EMERGENCY_RATION_HUNGER_THRESHOLD=0.18
    w.carry = { food: 0, wood: 0, stone: 0, herbs: 0 };
  }

  const services = createServices(state.world.mapSeed);
  const workerSystem = new WorkerAISystem();
  const boidsSystem = new BoidsSystem();
  const mortalitySystem = new MortalitySystem();

  // Wall the warehouse's cardinal neighbours so handleEat cannot path in.
  // After F3 (FARM probe gone), MortalitySystem reports reachableFood=false
  // when carry=0 + warehouse walled. After F4, the planner skips
  // rule:starving-preempt + rule:hunger-hysteresis + rule:hunger and the
  // regular path returns wander (rule:no-worksite for STONE without quarries).
  // handleWander's v0.8.7 carry-bypass calls consumeEmergencyRation; with
  // reachableFood=false the gate at WorkerAISystem.js:685 no longer
  // short-circuits, and the emergency-ration draws from the stockpile.
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    mutateTile(state, wx + dx, wz + dz, TILE.WALL);
  }

  const initialFood = Number(state.resources.food);

  runTicks(
    state,
    services,
    [workerSystem, boidsSystem, mortalitySystem],
    10.0,
    1 / 30,
    (s) => {
      // Re-pin role + hunger each tick so RoleAssignmentSystem (not in this
      // test stack but defensive) and natural recovery don't mask the chain.
      for (const w of aliveWorkers(s)) {
        w.role = ROLE.STONE;
        if (w.hunger > 0.15) w.hunger = 0.10;
      }
    },
  );

  // Sanity 1: F3 — at least one worker now reports reachableFood=false.
  const anyReachableFalse = aliveWorkers(state).some(
    (w) => w.debug?.reachableFood === false,
  );
  assert.ok(
    anyReachableFalse,
    "F3 sanity: with warehouse walled, carry=0, and FARM probe removed, at least one worker must report reachableFood=false.",
  );

  // Sanity 2: F3 — sourceType must NOT be "nearby-farm" anywhere.
  for (const w of aliveWorkers(state)) {
    const st = String(w.debug?.nutritionSourceType ?? "none");
    assert.notEqual(st, "nearby-farm", `F3: worker ${w.id} reports stale nearby-farm sourceType.`);
  }

  // Main: F3+F4 unblock — emergency-ration should have drawn from the
  // warehouse stockpile despite walls. Pre-fix, the carry-bypass would
  // refuse to fire because reachableFood was true (FARM probe), pinning
  // workers in seek_food without progress.
  const finalFood = Number(state.resources.food);
  assert.ok(
    finalFood < initialFood,
    `F3+F4 unblock failed: state.resources.food unchanged (initial=${initialFood} final=${finalFood}). At least one consumeEmergencyRation should have drawn from the stockpile when reachableFood=false.`,
  );
});

// v0.9.0-d retired the F12 test — it asserted the legacy
// `deliverStuckReplan + lastSuccessfulPathSec` escape branch, which was
// removed in phase d. Under the new contract:
//   - JobDeliverWarehouse's findTarget consults pathFailBlacklist; when
//     all warehouse candidates are recently-blacklisted by setTargetAndPath
//     failures, findTarget returns null → score 0 → JobScheduler picks
//     JobWander (terminal floor).
//   - The structural failure mode the test reproduced (worker depositing
//     into an on-tile warehouse while carry is externally re-pinned)
//     is no longer a "stuck loop" — it is a worker correctly delivering
//     in a tight cycle. The Job-utility model treats this as expected
//     behaviour, not a bug.
// Trace harness scenarios D/E/F exercise the unreachable-warehouse path
// end-to-end and validate the contract holistically (see commit summary).
