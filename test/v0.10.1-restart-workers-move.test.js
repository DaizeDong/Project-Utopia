// v0.10.1-e regression — workers froze after game restart.
//
// User report: "重开游戏后所有worker都不会移动了，似乎是上阶段状态没清除".
// This test mimics the GameApp.regenerateWorld flow (deepReplaceObject of
// the state object + recreate systems + recreate services) and asserts
// that after a few ticks the new workers acquire targets/paths and emit
// non-zero desiredVel.
//
// The minimal test (subset systems) was insufficient — it passed even
// with the bug present, because the bug requires the *full* tick pipeline
// + persistent system instances to repro. The integration test below
// instantiates the same systems list as GameApp.createSystems() and
// keeps the instances stable across ticks (mirroring the real run-loop
// behaviour where this.systems lives on the GameApp).

import { test } from "node:test";
import assert from "node:assert";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";
import { TileStateSystem } from "../src/simulation/economy/TileStateSystem.js";
import { BoidsSystem } from "../src/simulation/movement/BoidsSystem.js";

function deepReplaceObject(target, next) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, next);
}

function tick(state, services, dt) {
  // Minimal subset of GameApp's tick — enough to drive worker movement.
  new TileStateSystem().update(dt, state, services);
  new RoleAssignmentSystem().update(dt, state, services);
  new WorkerAISystem().update(dt, state, services);
}

function tickStable(systems, state, services, dt) {
  for (const sys of systems) sys.update(dt, state, services);
}

test("v0.10.1-e — workers move after regenerateWorld", () => {
  // First-run state.
  let state = createInitialGameState({ bareInitial: true, seed: 1337 });
  state.session.phase = "active";
  state.metrics ??= { timeSec: 0, tick: 0 };
  state.metrics.timeSec = 0;
  let services = createServices(state.world.mapSeed);

  // Tick a few frames so the first-run worker FSM stabilises.
  for (let i = 0; i < 20; i += 1) {
    state.metrics.timeSec += 0.1;
    state.metrics.tick = (state.metrics.tick ?? 0) + 1;
    tick(state, services, 0.1);
  }

  // Simulate restart: build a fresh state and replace into the same target
  // object reference (mirroring GameApp.deepReplaceObject) so any lingering
  // observer-side caches survive the same way the production restart path
  // exercises them.
  const next = createInitialGameState({ bareInitial: true, seed: 4242 });
  next.session.phase = "active";
  next.metrics ??= { timeSec: 0, tick: 0 };
  deepReplaceObject(state, next);
  services?.dispose?.();
  services = createServices(state.world.mapSeed);

  // Now drive the new state for a handful of frames.
  let movedCount = 0;
  let stationary = 0;
  for (let i = 0; i < 30; i += 1) {
    state.metrics.timeSec += 0.1;
    state.metrics.tick = (state.metrics.tick ?? 0) + 1;
    tick(state, services, 0.1);
  }

  for (const w of state.agents) {
    if (w.type !== "WORKER" || w.alive === false) continue;
    const dvx = Number(w.desiredVel?.x ?? 0);
    const dvz = Number(w.desiredVel?.z ?? 0);
    const speed = Math.hypot(dvx, dvz);
    const hasPath = Array.isArray(w.path) && w.path.length > 0;
    const hasTarget = w.targetTile && Number.isFinite(w.targetTile.ix);
    if (speed > 0.001 || hasPath || hasTarget) movedCount += 1;
    else stationary += 1;
  }

  assert.ok(
    movedCount > 0,
    `Expected at least one worker to acquire a target/path/desiredVel after restart, but ${stationary} were stationary and 0 moved.`,
  );
});

test("v0.10.1-e — workers move after restart with stable system instances", () => {
  // Closer to the real GameApp.restartSession path: we hold the system
  // instances stable across all ticks (only recreated on regenerate),
  // which exposes any per-instance state that fails to flush on restart.
  // BoidsSystem is included so worker positions actually advance.
  let state = createInitialGameState({ bareInitial: true, seed: 1337 });
  state.session.phase = "active";
  state.metrics ??= { timeSec: 0, tick: 0 };
  let services = createServices(state.world.mapSeed);

  let systems = [
    new TileStateSystem(),
    new RoleAssignmentSystem(),
    new WorkerAISystem(),
    new BoidsSystem(),
  ];

  for (let i = 0; i < 30; i += 1) {
    state.metrics.timeSec += 0.1;
    state.metrics.tick = (state.metrics.tick ?? 0) + 1;
    tickStable(systems, state, services, 0.1);
  }

  // Mimic GameApp.regenerateWorld: deepReplace + recreate systems + recreate services.
  const next = createInitialGameState({ bareInitial: true, seed: 4242 });
  next.session.phase = "active";
  next.metrics ??= { timeSec: 0, tick: 0 };
  deepReplaceObject(state, next);
  services?.dispose?.();
  services = createServices(state.world.mapSeed);
  systems = [
    new TileStateSystem(),
    new RoleAssignmentSystem(),
    new WorkerAISystem(),
    new BoidsSystem(),
  ];

  // Snapshot positions BEFORE restart-tick driving.
  const startPos = new Map();
  for (const w of state.agents) {
    if (w.type === "WORKER") startPos.set(w.id, { x: w.x, z: w.z });
  }

  for (let i = 0; i < 30; i += 1) {
    state.metrics.timeSec += 0.1;
    state.metrics.tick = (state.metrics.tick ?? 0) + 1;
    tickStable(systems, state, services, 0.1);
  }

  let actuallyMoved = 0;
  let stationary = 0;
  for (const w of state.agents) {
    if (w.type !== "WORKER" || w.alive === false) continue;
    const start = startPos.get(w.id);
    if (!start) continue; // new worker that didn't exist pre-restart, skip
    const dx = w.x - start.x;
    const dz = w.z - start.z;
    if (Math.hypot(dx, dz) > 0.05) actuallyMoved += 1;
    else stationary += 1;
  }

  assert.ok(
    actuallyMoved > 0,
    `Expected workers to physically move (x/z change) after restart, but ${stationary} stationary, 0 moved.`,
  );
});
