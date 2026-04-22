import test from "node:test";
import assert from "node:assert/strict";

import { bootHeadlessSim } from "../scripts/long-horizon-helpers.mjs";

// Phase 10 — seed-level determinism contract for the long-horizon bench.
//
// Two boots of `bootHeadlessSim` with the same seed + preset must produce
// bit-identical sim trajectories. This is the contract the long-horizon
// harness relies on to make cross-run comparison meaningful — without it
// balance-tuning deltas get lost in Math.random noise.
//
// If this test fails, something in the sim pipeline regressed a Math.random
// call (or otherwise introduced wall-clock / environment nondeterminism).
// Common culprits: a new system forgot to thread `services.rng`, or a
// default parameter defaulted to `Math.random` and the caller omitted it.

function hashState(state) {
  const parts = [
    state.metrics.timeSec,
    state.resources.food,
    state.resources.wood,
    state.resources.stone,
    state.resources.herbs ?? 0,
    state.resources.meals ?? 0,
    state.resources.medicine ?? 0,
    state.resources.tools ?? 0,
    state.agents.length,
    state.agents.filter((a) => a.alive !== false).length,
    state.animals.length,
    state.animals.filter((a) => a.alive !== false).length,
    state.buildings.warehouses,
    state.buildings.farms,
    state.buildings.lumberCamps ?? 0,
    state.gameplay.prosperity,
    state.gameplay.threat,
    state.metrics.deathsTotal ?? 0,
  ];
  let sum = 0;
  for (const p of parts) {
    sum = ((sum * 31) + Math.round(Number(p || 0) * 100)) >>> 0;
  }
  return sum.toString(16);
}

function runTicks(seed, preset, tickRate, ticks) {
  const sim = bootHeadlessSim({ seed, preset, tickRate });
  for (let t = 0; t < ticks; t++) {
    sim.tickFn();
    if (sim.state.session.phase === "end") break;
  }
  return hashState(sim.state);
}

test("bootHeadlessSim is deterministic across repeated boots (500 ticks)", () => {
  const seed = 42;
  const preset = "temperate_plains";
  const h0 = runTicks(seed, preset, 12, 500);
  const h1 = runTicks(seed, preset, 12, 500);
  const h2 = runTicks(seed, preset, 12, 500);
  assert.equal(h0, h1, "first and second boot must hash identically");
  assert.equal(h1, h2, "second and third boot must hash identically");
});

test("bootHeadlessSim diverges for different seeds", () => {
  const preset = "temperate_plains";
  const h0 = runTicks(42, preset, 12, 500);
  const h1 = runTicks(43, preset, 12, 500);
  assert.notEqual(h0, h1, "different seeds must produce different trajectories");
});

test("bootHeadlessSim is deterministic at 2000 ticks on rugged_highlands", () => {
  const seed = 7;
  const preset = "rugged_highlands";
  const h0 = runTicks(seed, preset, 12, 2000);
  const h1 = runTicks(seed, preset, 12, 2000);
  assert.equal(h0, h1, "2000-tick run must be deterministic");
});
