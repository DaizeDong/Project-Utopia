// v0.10.1 R6 PK-perf-and-warehouse — sub-fix (a) test:
// `recomputeCombatMetricsThrottled` (MortalitySystem) must skip the full
// O(W*(P+S)) walk on peaceful ticks (no live threats, no entity churn) so
// the per-tick budget at 4× speed doesn't get blown by a stale R5 plumbing
// fix. The pre-throttle behaviour was: every tick rewrites the same
// "activeThreats=0" payload onto state.metrics.combat regardless of input.
// The throttle MUST still let live-threat ticks pass through (the existing
// `combat-metrics-per-tick.test.js` covers that).

import test from "node:test";
import assert from "node:assert/strict";

import { ENTITY_TYPE } from "../src/config/constants.js";
import { createInitialGameState, createWorker } from "../src/entities/EntityFactory.js";
import { MortalitySystem } from "../src/simulation/lifecycle/MortalitySystem.js";

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test("recomputeCombatMetricsThrottled: peaceful tick reuses cache after first walk", () => {
  const state = createInitialGameState({ seed: 1234, bareInitial: true });
  state.animals = [];
  state.agents = [];

  // Plant 3 alive workers — no hostiles anywhere.
  for (let i = 0; i < 3; i++) {
    const w = createWorker(i, 0, rng(7 + i));
    w.hp = w.maxHp;
    w.alive = true;
    w.hunger = 1;
    w.starvationSec = 0;
    state.agents.push(w);
  }

  state.metrics ??= {};
  state.metrics.combat = {};
  state.metrics.timeSec = 0;

  const sys = new MortalitySystem();

  // First tick — populates the cache. activeThreats === 0.
  sys.update(1 / 30, state);
  assert.equal(state.metrics.combat.activeThreats, 0);
  assert.equal(state.metrics.combat.workerCount, 3);

  // Overwrite a field the walk WOULD recompute (workerCount → 999). If the
  // throttle skips the walk, the bogus value persists. If the throttle is
  // broken, the walk overwrites it back to 3.
  state.metrics.combat.workerCount = 999;
  state.metrics.timeSec = 1 / 30;
  sys.update(1 / 30, state);

  assert.equal(
    state.metrics.combat.workerCount,
    999,
    "peaceful tick should not re-walk; workerCount should retain the canary value when activeThreats===0 and entity signature unchanged",
  );
});

test("recomputeCombatMetricsThrottled: entity churn invalidates the cache", () => {
  const state = createInitialGameState({ seed: 5678, bareInitial: true });
  state.animals = [];
  state.agents = [];

  const w0 = createWorker(0, 0, rng(11));
  w0.hp = w0.maxHp;
  w0.alive = true;
  w0.hunger = 1;
  w0.starvationSec = 0;
  state.agents.push(w0);

  state.metrics ??= {};
  state.metrics.combat = {};
  state.metrics.timeSec = 0;

  const sys = new MortalitySystem();
  sys.update(1 / 30, state);
  assert.equal(state.metrics.combat.workerCount, 1);

  // Set workerCount=999 then add a NEW worker (signature changes — agents.length
  // 1→2). The walk must re-run and overwrite workerCount with the truth (2).
  state.metrics.combat.workerCount = 999;
  const w1 = createWorker(1, 0, rng(13));
  w1.hp = w1.maxHp;
  w1.alive = true;
  w1.hunger = 1;
  w1.starvationSec = 0;
  state.agents.push(w1);
  state.metrics.timeSec = 1 / 30;
  sys.update(1 / 30, state);

  assert.equal(
    state.metrics.combat.workerCount,
    2,
    "agents.length change must invalidate cache and force a walk that resets workerCount to the live count",
  );
});
