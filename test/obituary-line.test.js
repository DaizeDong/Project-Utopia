import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState, createWorker } from "../src/entities/EntityFactory.js";
import { MortalitySystem } from "../src/simulation/lifecycle/MortalitySystem.js";
import { extractLatestNarrativeBeat } from "../src/ui/hud/storytellerStrip.js";

// v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 6 / verification §6.2) —
// Death must surface as an obituary line into state.gameplay.deathLog +
// state.debug.eventTrace, and storytellerStrip's HIGH_PRIORITY pass must
// pick it up over a same-tick warehouse-fire trace entry.

test("MortalitySystem writes obituary into state.gameplay.deathLog", () => {
  const state = createInitialGameState({ seed: 7331 });
  state.resources.food = 0;
  state.buildings.warehouses = 0;
  state.buildings.farms = 0;
  const worker = createWorker(0, 0, () => 0.5);
  worker.hunger = 0;
  worker.starvationSec = 60;
  state.agents = [worker];
  state.animals = [];
  state.metrics.timeSec = 90;

  new MortalitySystem().update(1 / 30, state, { pathCache: { get: () => null, set: () => {} } });

  assert.equal(state.agents.length, 0, "starved worker is removed");
  assert.ok(Array.isArray(state.gameplay.deathLog), "deathLog array exists");
  assert.ok(state.gameplay.deathLog.length >= 1, "deathLog has ≥1 entry");
  const top = state.gameplay.deathLog[0];
  assert.match(top, /died of starvation/i, "obituary cites cause of death");
  assert.match(top, /specialist/i, "obituary includes backstory snippet");
});

test("storytellerStrip prefers obituary over a same-tick warehouse fire beat", () => {
  const state = createInitialGameState({ seed: 8642 });
  state.resources.food = 0;
  state.buildings.warehouses = 0;
  state.buildings.farms = 0;
  const worker = createWorker(0, 0, () => 0.5);
  worker.hunger = 0;
  worker.starvationSec = 60;
  state.agents = [worker];
  state.animals = [];
  state.metrics.timeSec = 50;

  // Pre-seed a warehouse-fire trace BEFORE the death so the obituary lands
  // newer in the eventTrace; HIGH_PRIORITY must still trump.
  state.debug ??= {};
  state.debug.eventTrace ??= [];
  state.debug.eventTrace.unshift("[49.5s] warehouse fire at (5,5)");

  new MortalitySystem().update(1 / 30, state, { pathCache: { get: () => null, set: () => {} } });

  const beat = extractLatestNarrativeBeat(state, 50);
  assert.ok(beat, "extractor returns a beat");
  assert.match(beat.line, /died of /i, "obituary wins over warehouse fire");
});
