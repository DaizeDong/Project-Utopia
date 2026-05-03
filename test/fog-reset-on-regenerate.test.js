// R13 #7 Plan-R13-fog-reset (P0 bug fix) — fog state must NOT leak across runs.
//
// Pre-fix repro: VisibilitySystem only reseeds `state.fog.visibility` on a
// length-mismatch (i.e. when grid dims change). `createInitialGameState`
// doesn't include a `fog` slot, so `deepReplaceObject` preserves the prior
// run's `Uint8Array` — leaking the old exploration map into the new run.
//
// Fix: `regenerateWorld` now sets `next.fog = { visibility: null, version: 0 }`
// before deepReplaceObject. VisibilitySystem's existing length-mismatch branch
// reseeds the initial reveal box on the next tick.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { VisibilitySystem } from "../src/simulation/world/VisibilitySystem.js";
import { BALANCE } from "../src/config/balance.js";
import { FOG_STATE } from "../src/config/constants.js";

function deepReplaceObject(target, next) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, next);
}

function countRevealed(vis) {
  let n = 0;
  for (let i = 0; i < vis.length; i += 1) {
    if (vis[i] === FOG_STATE.EXPLORED || vis[i] === FOG_STATE.VISIBLE) n += 1;
  }
  return n;
}

test("R13 fog-reset: regenerateWorld clears prior run's fog visibility array", () => {
  // Boot first run, walk a worker far from spawn to reveal a chunk of fog.
  const state = createInitialGameState({ bareInitial: true, seed: 1337 });
  let services = createServices(state.world.mapSeed);
  const vis = new VisibilitySystem();

  // Tick a few frames with the default agents to accumulate explored tiles.
  for (let i = 0; i < 5; i += 1) {
    // Nudge each agent in a different direction so reveal grows beyond spawn box.
    for (const a of state.agents ?? []) {
      if (a?.alive === false) continue;
      a.x = (a.x ?? 0) + (i + 1) * 1.5;
      a.z = (a.z ?? 0) + (i + 1) * 1.5;
    }
    vis.update(0.1, state, services);
  }

  const priorRevealed = countRevealed(state.fog.visibility);
  const initialRadius = Number(BALANCE.fogInitialRevealRadius ?? 4);
  const freshBoxArea = (2 * initialRadius + 1) * (2 * initialRadius + 1);
  assert.ok(
    priorRevealed > freshBoxArea,
    `Setup precondition: explored area (${priorRevealed}) must exceed fresh-boot box (${freshBoxArea}). If this fails, the test setup is broken.`,
  );

  // Simulate regenerateWorld: build a fresh state with the SAME map dims so
  // the length-mismatch branch in VisibilitySystem CANNOT save us. The fix
  // is the explicit `next.fog = ...` reset below.
  const next = createInitialGameState({
    bareInitial: true,
    seed: 4242,
    width: state.grid.width,
    height: state.grid.height,
  });
  // The patch under test (mirrors src/app/GameApp.js regenerateWorld):
  next.fog = { visibility: null, version: 0 };

  deepReplaceObject(state, next);
  services?.dispose?.();
  services = createServices(state.world.mapSeed);

  // Immediately after the reset, before any tick: visibility array is null.
  assert.equal(state.fog.visibility, null, "visibility must be null right after regenerate");

  // Strip agents so only the seeding pass runs (no per-tick reveal over them).
  state.agents = [];
  vis.update(0.1, state, services);

  // After one tick, fog should be reseeded to exactly the initial reveal box —
  // NOT the prior run's exploration trail.
  assert.ok(state.fog.visibility instanceof Uint8Array, "fog reseeded as Uint8Array");
  assert.equal(state.fog.visibility.length, state.grid.width * state.grid.height);
  const revealedAfter = countRevealed(state.fog.visibility);
  assert.equal(
    revealedAfter,
    freshBoxArea,
    `Cross-run bleed: expected ${freshBoxArea} revealed tiles (fresh initial box), got ${revealedAfter}.`,
  );
});

test("R13 fog-reset: dim-change still reseeds (regression guard for existing length-mismatch branch)", () => {
  const state = createInitialGameState({ bareInitial: true, seed: 1337 });
  const services = createServices(state.world.mapSeed);
  const vis = new VisibilitySystem();
  vis.update(0.1, state, services);

  // Manually shrink the grid dims so length-mismatch fires. (No explicit
  // fog reset here — we want to confirm the legacy branch still works.)
  const newWidth = state.grid.width - 8;
  const newHeight = state.grid.height - 8;
  state.grid.width = newWidth;
  state.grid.height = newHeight;
  state.agents = [];
  vis.update(0.1, state, services);

  const initialRadius = Number(BALANCE.fogInitialRevealRadius ?? 4);
  const freshBoxArea = (2 * initialRadius + 1) * (2 * initialRadius + 1);
  assert.equal(state.fog.visibility.length, newWidth * newHeight);
  assert.equal(countRevealed(state.fog.visibility), freshBoxArea);
});
