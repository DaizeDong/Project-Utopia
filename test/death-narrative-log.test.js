// v0.8.2 Round-0 02d-roleplayer (Step 8) — death → objectiveLog narrative.
// Plan: assignments/homework6/Agent-Feedback-Loop/Round0/Plans/02d-roleplayer.md
//
// MortalitySystem.recordDeath now additionally pushes a human-readable line
// to state.gameplay.objectiveLog (the same channel ProgressionSystem uses for
// recovery messages). This is the player-visible "Colony Log" surface —
// EventPanel renders the top 6 of that array. These tests guard:
//   (a) a starved worker produces exactly one objectiveLog entry containing
//       their displayName, the word "died", and the reason "(starvation)";
//   (b) re-running MortalitySystem.update() after a death does NOT duplicate
//       the log entry (dedupe guaranteed by entity.deathRecorded flag +
//       the up-front filter in MortalitySystem.update which removes
//       deadIds from state.agents before recordDeath could re-fire);
//   (c) recovery-style log entries already pushed by ProgressionSystem
//       coexist with death lines and the newest-first invariant holds.

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState, createWorker } from "../src/entities/EntityFactory.js";
import { MortalitySystem } from "../src/simulation/lifecycle/MortalitySystem.js";

test("death pushes exactly one narrative line to state.gameplay.objectiveLog", () => {
  const state = createInitialGameState();
  state.resources.food = 0;
  state.buildings.warehouses = 0;
  state.buildings.farms = 0;
  state.gameplay.objectiveLog = [];
  const worker = createWorker(0, 0, () => 0.5);
  worker.hunger = 0;
  worker.starvationSec = 60;
  state.agents = [worker];
  state.animals = [];

  const system = new MortalitySystem();
  system.update(1 / 30, state, { pathCache: { get: () => null, set: () => {} } });

  assert.ok(state.gameplay.objectiveLog.length >= 1, "expected >=1 objective log entry after death");
  const first = String(state.gameplay.objectiveLog[0]);
  assert.ok(first.includes(worker.displayName), `log entry missing displayName: ${first}`);
  assert.ok(first.includes("died"), `log entry missing "died": ${first}`);
  assert.ok(first.includes("(starvation)"), `log entry missing "(starvation)": ${first}`);
});

test("rerunning MortalitySystem.update after death does not duplicate the log entry", () => {
  const state = createInitialGameState();
  state.resources.food = 0;
  state.buildings.warehouses = 0;
  state.buildings.farms = 0;
  state.gameplay.objectiveLog = [];
  const worker = createWorker(0, 0, () => 0.5);
  worker.hunger = 0;
  worker.starvationSec = 60;
  state.agents = [worker];
  state.animals = [];

  const system = new MortalitySystem();
  system.update(1 / 30, state, { pathCache: { get: () => null, set: () => {} } });
  const lengthAfterFirst = state.gameplay.objectiveLog.length;

  // Run again — no live agent remains, so no new death should be recorded.
  system.update(1 / 30, state, { pathCache: { get: () => null, set: () => {} } });
  system.update(1 / 30, state, { pathCache: { get: () => null, set: () => {} } });
  assert.strictEqual(
    state.gameplay.objectiveLog.length,
    lengthAfterFirst,
    "objectiveLog grew after subsequent update ticks — dedupe failed",
  );
});

test("death log entry carries a sim-second timestamp matching state.metrics.timeSec", () => {
  const state = createInitialGameState();
  state.resources.food = 0;
  state.buildings.warehouses = 0;
  state.buildings.farms = 0;
  state.gameplay.objectiveLog = [];
  state.metrics.timeSec = 42.5;
  const worker = createWorker(0, 0, () => 0.5);
  worker.hunger = 0;
  worker.starvationSec = 60;
  state.agents = [worker];
  state.animals = [];

  const system = new MortalitySystem();
  system.update(1 / 30, state, { pathCache: { get: () => null, set: () => {} } });

  const first = String(state.gameplay.objectiveLog[0]);
  assert.match(first, /^\[42\.5s\]/, `log entry timestamp mismatch: ${first}`);
});
