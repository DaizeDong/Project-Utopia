// v0.8.11 worker-AI bare-init responsiveness — regression tests for the
// PRIMARY allocation bug + wander cadence + determinism. Reproduces the
// bare-init scenario that surfaced in v0.8.10 ("workers freeze in place,
// cluster together, wander aimlessly even when there are unbuilt blueprints,
// unoccupied production tiles, or they're hungry").

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { BuildSystem } from "../src/simulation/construction/BuildSystem.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";
import { BoidsSystem } from "../src/simulation/movement/BoidsSystem.js";
import { worldToTile } from "../src/world/grid/Grid.js";
import { ROLE } from "../src/config/constants.js";
import { BALANCE } from "../src/config/balance.js";

function findFirstValid(state, buildSystem, tool) {
  for (let iz = 0; iz < state.grid.height; iz += 1) {
    for (let ix = 0; ix < state.grid.width; ix += 1) {
      if (buildSystem.previewToolAt(state, tool, ix, iz).ok) return { ix, iz };
    }
  }
  return null;
}

// Place several blueprints at distinct valid sites so constructionSites.length
// reaches a target count. Tools are tried in order; we skip occupied tiles.
function placeBlueprints(state, buildSystem, count, tools = ["warehouse", "farm", "lumber"]) {
  const placed = [];
  outer: for (const tool of tools) {
    for (let iz = 0; iz < state.grid.height && placed.length < count; iz += 1) {
      for (let ix = 0; ix < state.grid.width && placed.length < count; ix += 1) {
        const preview = buildSystem.previewToolAt(state, tool, ix, iz);
        if (!preview.ok) continue;
        const r = buildSystem.placeToolAt(state, tool, ix, iz);
        if (r?.ok && r.phase === "blueprint") {
          placed.push({ ix, iz, tool });
        }
      }
    }
    if (placed.length >= count) break outer;
  }
  return placed;
}

test("bare-init: 3 blueprints + workers → at least 3 BUILDERs after manager ticks (Fix 1)", () => {
  const state = createInitialGameState({ seed: 1337, bareInitial: true });
  state.session.phase = "active";
  // Plenty of resources so blueprint placement isn't gated.
  state.resources.wood = 9999;
  state.resources.stone = 9999;
  state.resources.food = 200;

  const buildSystem = new BuildSystem();
  const placed = placeBlueprints(state, buildSystem, 3);
  assert.equal(placed.length, 3, "test setup expects 3 blueprints placed");
  assert.equal(state.constructionSites.length, 3);

  const workers = state.agents.filter((a) => a.type === "WORKER");
  assert.ok(workers.length >= 6, `expected at least 6 workers (got ${workers.length})`);

  const roles = new RoleAssignmentSystem();
  // Two manager ticks at managerIntervalSec each — covers the "after 2 ticks"
  // window the bug spec calls out (~2.4s).
  const tickSec = Number(BALANCE.managerIntervalSec ?? 1.2);
  roles.update(tickSec, state);
  roles.update(tickSec, state);

  const builderCount = workers.filter((w) => w.role === ROLE.BUILDER).length;
  assert.ok(
    builderCount >= 3,
    `expected ≥3 BUILDERs after 2 manager ticks (3 sites × 1.5 builderPerSite = 4.5 → ceil=5, capped to economyHeadroom). Got ${builderCount}.`,
  );
});

test("bare-init: no blueprints + workers → no worker stuck on the same tile >3.0s simulated (Fix 2/3)", () => {
  const state = createInitialGameState({ seed: 1337, bareInitial: true });
  state.session.phase = "active";
  // Generous food so workers don't enter starvation handlers (which set
  // emergency idle desire).
  state.resources.food = 9999;

  const services = createServices(state.world.mapSeed);
  const workerSystem = new WorkerAISystem();
  const boidsSystem = new BoidsSystem();
  const roles = new RoleAssignmentSystem();

  // Initial manager tick so roles are assigned.
  roles.update(2, state);

  const workers = state.agents.filter((a) => a.type === "WORKER");
  assert.ok(workers.length > 0);

  const dt = 0.1;
  const totalSec = 5.0;
  const stepCount = Math.round(totalSec / dt);
  const sameTileFrames = new Map(); // workerId → consecutive same-tile frame count
  const maxFrames = new Map();      // workerId → max consecutive same-tile frame count
  const lastTile = new Map();        // workerId → last tile key

  state.metrics.timeSec = 0;
  state.metrics.tick = 0;
  for (let step = 0; step < stepCount; step += 1) {
    state.metrics.timeSec += dt;
    state.metrics.tick += 1;
    workerSystem.update(dt, state, services);
    boidsSystem.update(dt, state);
    for (const w of workers) {
      const t = worldToTile(w.x, w.z, state.grid);
      const key = `${t.ix},${t.iz}`;
      if (lastTile.get(w.id) === key) {
        const cur = (sameTileFrames.get(w.id) ?? 0) + 1;
        sameTileFrames.set(w.id, cur);
        if (cur > (maxFrames.get(w.id) ?? 0)) maxFrames.set(w.id, cur);
      } else {
        sameTileFrames.set(w.id, 1);
        lastTile.set(w.id, key);
        if ((maxFrames.get(w.id) ?? 0) < 1) maxFrames.set(w.id, 1);
      }
    }
  }

  const threshold = Math.ceil(3.0 / dt); // 30 frames at dt=0.1 → 3.0s
  const offenders = [];
  for (const [id, frames] of maxFrames) {
    if (frames > threshold) offenders.push({ id, frames, secs: (frames * dt).toFixed(2) });
  }
  assert.equal(
    offenders.length, 0,
    `expected no worker stuck >3.0s on a single tile after Fix 2/3. Offenders: ${JSON.stringify(offenders)}`,
  );
});

test("bare-init: deterministic role assignment for same seed across 3 manager ticks (Fix 4 doesn't introduce nondeterminism)", () => {
  const runOnce = () => {
    const state = createInitialGameState({ seed: 1337, bareInitial: true });
    state.session.phase = "active";
    state.resources.wood = 9999;
    state.resources.stone = 9999;
    state.resources.food = 200;

    const buildSystem = new BuildSystem();
    placeBlueprints(state, buildSystem, 2);

    const roles = new RoleAssignmentSystem();
    const tickSec = Number(BALANCE.managerIntervalSec ?? 1.2);
    roles.update(tickSec, state);
    roles.update(tickSec, state);
    roles.update(tickSec, state);

    // Worker IDs are minted from a global counter and increment across
    // createInitialGameState calls, so we compare by spawn-order index +
    // role rather than by id.
    return state.agents
      .filter((a) => a.type === "WORKER")
      .map((w, idx) => ({ idx, role: w.role }));
  };

  const a = runOnce();
  const b = runOnce();
  assert.deepStrictEqual(a, b, "same seed must produce byte-identical role assignments");
});
