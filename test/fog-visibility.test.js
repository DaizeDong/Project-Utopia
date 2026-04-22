import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { VisibilitySystem } from "../src/simulation/world/VisibilitySystem.js";
import { chooseWorkerIntent } from "../src/simulation/npc/WorkerAISystem.js";
import { evaluateBuildPreview } from "../src/simulation/construction/BuildAdvisor.js";
import { BALANCE } from "../src/config/balance.js";
import { FOG_STATE, ROLE, TILE } from "../src/config/constants.js";
import { tileToWorld, worldToTile } from "../src/world/grid/Grid.js";

function setTileAt(state, ix, iz, tileType) {
  state.grid.tiles[ix + iz * state.grid.width] = tileType;
}

function countFogStates(vis) {
  const out = { hidden: 0, explored: 0, visible: 0 };
  for (let i = 0; i < vis.length; i += 1) {
    if (vis[i] === FOG_STATE.HIDDEN) out.hidden += 1;
    else if (vis[i] === FOG_STATE.EXPLORED) out.explored += 1;
    else if (vis[i] === FOG_STATE.VISIBLE) out.visible += 1;
  }
  return out;
}

function removeAllAgents(state) {
  // VisibilitySystem downgrades VISIBLE→EXPLORED and only actors re-upgrade.
  // Tests need deterministic fog state without 12 workers revealing the centre.
  state.agents = [];
}

// ---------------------------------------------------------------------------
// A — Initial reveal area is a (2r+1)² window on first tick (r =
// fogInitialRevealRadius); rest is HIDDEN.
// ---------------------------------------------------------------------------
test("M1b fog: fresh state reveals exactly a (2r+1)² area, rest HIDDEN", () => {
  const state = createInitialGameState({ seed: 4242 });
  const services = createServices(state.world.mapSeed);
  const vis = new VisibilitySystem();

  // Strip actors so only the seeding pass fires (no per-tick reveal over them).
  removeAllAgents(state);
  vis.update(0.1, state, services);

  const fog = state.fog;
  assert.ok(fog?.visibility instanceof Uint8Array, "fog.visibility should be a Uint8Array");
  assert.equal(fog.visibility.length, state.grid.width * state.grid.height);

  const counts = countFogStates(fog.visibility);
  const initialRadius = Number(BALANCE.fogInitialRevealRadius ?? 4);
  const expectedReveal = (2 * initialRadius + 1) * (2 * initialRadius + 1);
  const revealed = counts.explored + counts.visible;
  assert.equal(revealed, expectedReveal, `expected ${expectedReveal} revealed tiles, got ${revealed}`);
  const totalTiles = state.grid.width * state.grid.height;
  assert.equal(counts.hidden, totalTiles - expectedReveal, "remaining tiles should all be HIDDEN");
});

// ---------------------------------------------------------------------------
// B — Walking a worker across a tile leaves an EXPLORED footprint (sticky).
// ---------------------------------------------------------------------------
test("M1b fog: worker footprint persists as EXPLORED after moving away", () => {
  const state = createInitialGameState({ seed: 4242 });
  const services = createServices(state.world.mapSeed);
  const vis = new VisibilitySystem();

  removeAllAgents(state);
  vis.update(0.1, state, services);

  const grid = state.grid;
  // Pick a tile well outside the initial reveal so it starts HIDDEN.
  const probeIx = Math.min(grid.width - 1, Math.floor(grid.width / 2) + 20);
  const probeIz = Math.min(grid.height - 1, Math.floor(grid.height / 2) + 20);
  const probeIdx = probeIx + probeIz * grid.width;
  assert.equal(state.fog.visibility[probeIdx], FOG_STATE.HIDDEN, "probe tile must start HIDDEN");

  // Spawn a single worker standing on the probe tile.
  const pos = tileToWorld(probeIx, probeIz, grid);
  state.agents = [
    {
      id: "worker_test_1",
      type: "WORKER",
      alive: true,
      x: pos.x,
      z: pos.z,
      carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
    },
  ];

  // Tick once — the worker should reveal the probe tile (VISIBLE).
  vis.update(0.1, state, services);
  const where = worldToTile(state.agents[0].x, state.agents[0].z, grid);
  assert.equal(where.ix, probeIx);
  assert.equal(where.iz, probeIz);
  assert.equal(state.fog.visibility[probeIdx], FOG_STATE.VISIBLE, "probe tile should be VISIBLE while worker stands on it");

  // Remove the worker and tick again — the probe tile should downgrade to EXPLORED.
  removeAllAgents(state);
  vis.update(0.1, state, services);
  assert.equal(state.fog.visibility[probeIdx], FOG_STATE.EXPLORED, "probe tile should remember as EXPLORED after the worker leaves");
});

// ---------------------------------------------------------------------------
// C — BuildAdvisor rejects placement on HIDDEN tiles with reason "hidden_tile".
// ---------------------------------------------------------------------------
test("M1b fog: BuildAdvisor rejects placement on HIDDEN tile", () => {
  const state = createInitialGameState({ seed: 4242 });
  const services = createServices(state.world.mapSeed);
  const vis = new VisibilitySystem();

  removeAllAgents(state);
  vis.update(0.1, state, services);

  const grid = state.grid;
  const hiddenIx = Math.min(grid.width - 1, Math.floor(grid.width / 2) + 20);
  const hiddenIz = Math.min(grid.height - 1, Math.floor(grid.height / 2) + 20);
  assert.equal(state.fog.visibility[hiddenIx + hiddenIz * grid.width], FOG_STATE.HIDDEN);
  // Force the underlying tile to GRASS so we know a road would normally be
  // buildable there (eliminates other failure modes like occupiedTile/water).
  setTileAt(state, hiddenIx, hiddenIz, TILE.GRASS);

  const result = evaluateBuildPreview(state, "road", hiddenIx, hiddenIz);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "hidden_tile");
  void services;
});

// ---------------------------------------------------------------------------
// D — explore_fog intent surfaces when HIDDEN tiles exist and no other role
// intent applies.
// ---------------------------------------------------------------------------
test("M1b fog: chooseWorkerIntent returns explore_fog when HIDDEN tiles remain and no role work", () => {
  const state = createInitialGameState({ seed: 4242 });
  const services = createServices(state.world.mapSeed);
  const vis = new VisibilitySystem();

  removeAllAgents(state);
  vis.update(0.1, state, services);

  // Zero out buildings for every role-gated intent so the planner can't pick
  // farm/lumber/quarry/etc. The worker should also carry no resources.
  state.buildings = {
    farms: 0,
    lumbers: 0,
    quarries: 0,
    herbGardens: 0,
    kitchens: 0,
    smithies: 0,
    clinics: 0,
    warehouses: 0,
  };

  const worker = {
    id: "worker_explore_1",
    type: "WORKER",
    alive: true,
    role: ROLE.FARM,
    x: 0,
    z: 0,
    hunger: 1,
    carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
    blackboard: {},
  };

  const intent = chooseWorkerIntent(worker, state);
  assert.equal(intent, "explore_fog", `expected explore_fog fallback, got "${intent}"`);
  void services;
});
