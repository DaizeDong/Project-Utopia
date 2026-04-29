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

  runTicks(state, services, [workerSystem, boidsSystem], 5.0, 1 / 30, (s) => {
    // Keep role pinned so the test exercises the F2 escape rather than a
    // role swap.
    target.role = ROLE.STONE;
  });

  // Worker must have escaped seek_task.
  const finalState = String(target.blackboard?.fsm?.state ?? "");
  assert.notEqual(
    finalState,
    "seek_task",
    `F2 escape failed: STONE worker still in seek_task after 5s (state=${finalState}).`,
  );

  // And must have moved at least 2 tiles in Manhattan distance.
  const endTile = worldToTile(target.x, target.z, state.grid);
  const moved = Math.abs(endTile.ix - startTile.ix) + Math.abs(endTile.iz - startTile.iz);
  assert.ok(
    moved >= 2,
    `F2 escape failed: STONE worker moved only ${moved} tiles (start=${startTile.ix},${startTile.iz} end=${endTile.ix},${endTile.iz}).`,
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

test("v0.8.12 F12: HAUL worker with carry exits Deliver state within ~3s after warehouse becomes unreachable", () => {
  const state = createInitialGameState({ seed: 1337 });
  state.session.phase = "active";
  state.resources.food = 9999; // remove hunger preempt as a confound

  const services = createServices(state.world.mapSeed);
  const workerSystem = new WorkerAISystem();
  const boidsSystem = new BoidsSystem();

  const workers = aliveWorkers(state);
  assert.ok(workers.length > 0);
  const hauler = workers[0];
  hauler.role = ROLE.HAUL;
  hauler.carry = { ...(hauler.carry ?? {}), food: 2.0 };

  // Place the hauler near the warehouse so they enter deliver naturally.
  const wh = findFirstTile(state, TILE.WAREHOUSE);
  assert.ok(wh, "expected warehouse tile");
  const wpos = tileToWorld(wh.ix + 3, wh.iz, state.grid);
  hauler.x = wpos.x;
  hauler.z = wpos.z;

  // Phase 1: run 2s normally so the worker enters deliver and probably
  // makes some progress toward the warehouse — establishes a baseline
  // lastSuccessfulPathSec on the blackboard.
  runTicks(state, services, [workerSystem, boidsSystem], 2.0);

  // Phase 2: wall the warehouse off mid-run, pinning carry>0.
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    mutateTile(state, wh.ix + dx, wh.iz + dz, TILE.WALL);
  }
  // Force carry to remain >0 so the existing carryNow<=0 escape clause
  // doesn't fire — this isolates the F12 path-stuck branch.
  hauler.carry.food = 2.0;

  // Phase 3: run another 3s. F12 should detect lastSuccessfulPathSec staleness
  // and force-replan, clearing the commitment cycle.
  let exitedDeliver = false;
  let exitTickSec = -1;
  const startSec = Number(state.metrics.timeSec ?? 0);
  runTicks(state, services, [workerSystem, boidsSystem], 3.5, 1 / 30, (s) => {
    // Keep carry pinned each tick.
    if (Number(hauler.carry?.food ?? 0) > 0.5) {
      hauler.carry.food = 2.0;
    }
    const fsm = String(hauler.blackboard?.fsm?.state ?? "");
    if (!exitedDeliver && fsm !== "deliver") {
      exitedDeliver = true;
      exitTickSec = Number(s.metrics.timeSec ?? 0) - startSec;
    }
  });

  assert.ok(
    exitedDeliver,
    `F12 escape failed: HAUL worker still pinned in deliver after 3.5s with walled-off warehouse + carry=2. Final fsm=${String(hauler.blackboard?.fsm?.state ?? "")}.`,
  );
  // Escape must happen within the 3.5s window (F12 fires at stuckTime > 2.0s).
  assert.ok(
    exitTickSec >= 0 && exitTickSec <= 3.5,
    `F12 escape window violated: exited deliver at +${exitTickSec.toFixed(2)}s (expected 0-3.5s).`,
  );
});
