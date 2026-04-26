import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState, createWorker } from "../src/entities/EntityFactory.js";

// v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 6 / verification §6.3) —
// Two doomed workers in a -0.15 rival relationship must produce the
// "Felt grim relief" memory beat AND a +0.05 morale bump on the survivor
// when the witness path runs through MortalitySystem.recordDeathIntoWitnessMemory.

import { MortalitySystem } from "../src/simulation/lifecycle/MortalitySystem.js";

test("rivalry: surviving witness gets grim-relief memory + morale bump on rival's death", () => {
  const state = createInitialGameState({ seed: 1111 });
  state.resources.food = 0;
  state.buildings.warehouses = 0;
  state.buildings.farms = 0;

  const deceased = createWorker(0, 0, () => 0.5);
  deceased.hunger = 0;
  deceased.starvationSec = 60;
  const witness = createWorker(2, 0, () => 0.6);
  witness.morale = 0.5;
  // Strong rivalry — past the -0.45 Rival band.
  deceased.relationships[witness.id] = -0.5;

  state.agents = [deceased, witness];
  state.animals = [];
  state.metrics.timeSec = 40;

  new MortalitySystem().update(1 / 30, state, { pathCache: { get: () => null, set: () => {} } });

  assert.equal(state.agents.length, 1, "deceased removed");
  const memTop = witness.memory?.recentEvents ?? [];
  const hasGrimRelief = memTop.some((line) => /Felt grim relief/i.test(String(line)));
  assert.ok(hasGrimRelief, "rival witness logs 'Felt grim relief' memory");
  assert.ok(witness.morale > 0.5,
    "rival witness gains a small morale bump (~+0.05)");
});
