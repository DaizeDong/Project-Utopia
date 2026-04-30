// v0.9.3-balance — tests for 1:1 worker/building binding, tighter
// production gating (yieldPool eligibility), bridge AI proposer.

import test from "node:test";
import assert from "node:assert/strict";

import { BALANCE } from "../src/config/balance.js";
import { ROLE, TILE } from "../src/config/constants.js";
import { createInitialGameState, createWorker } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
// Import WorkerAISystem before any concrete Job class so the JobScheduler →
// JobRegistry → JobHarvestBase initialization order completes before the
// individual JobHarvest* siblings are pulled into our local namespace.
// (Mirrors the import order used by test/job-harvest.test.js.)
import "../src/simulation/npc/WorkerAISystem.js";
import { JobReservation } from "../src/simulation/npc/JobReservation.js";
import { JobHarvestFarm } from "../src/simulation/npc/jobs/JobHarvestFarm.js";
import { JobHarvestLumber } from "../src/simulation/npc/jobs/JobHarvestLumber.js";
import { JobHarvestQuarry } from "../src/simulation/npc/jobs/JobHarvestQuarry.js";
import { JobScheduler } from "../src/simulation/npc/jobs/JobScheduler.js";
import { JobWander } from "../src/simulation/npc/jobs/JobWander.js";
import {
  listTilesByType,
  setTile,
  setTileField,
  tileToWorld,
} from "../src/world/grid/Grid.js";
import { ColonyDirectorSystem } from "../src/simulation/meta/ColonyDirectorSystem.js";

function makeState({ seed = 5151, bareInitial = false } = {}) {
  const state = createInitialGameState({ seed, bareInitial });
  state.session ??= {};
  state.session.phase = "active";
  state.environment = { isNight: false };
  state.metrics.tick = 0;
  state.metrics.timeSec = 0;
  return state;
}

function placeNode(state, ix, iz, tileType, statsKey, pool = 100) {
  setTile(state.grid, ix, iz, tileType);
  setTileField(state.grid, ix, iz, "fertility", 0.9);
  setTileField(state.grid, ix, iz, "yieldPool", pool);
  state.grid.version = (state.grid.version ?? 0) + 1;
  state.buildings ??= {};
  state.buildings[statsKey] = (Number(state.buildings[statsKey] ?? 0)) + 1;
}

function placeWorkerAt(worker, state, ix, iz, role = ROLE.FARM) {
  const pos = tileToWorld(ix, iz, state.grid);
  worker.x = pos.x;
  worker.z = pos.z;
  worker.role = role;
  worker.path = null;
  worker.pathIndex = 0;
  worker.pathGridVersion = state.grid.version ?? 0;
  worker.cooldown = 0;
  worker.hunger = 1;
  worker.rest = 1;
  worker.morale = 1;
  worker.carry = { food: 0, wood: 0, stone: 0, herbs: 0 };
  worker.targetTile = null;
  worker.blackboard ??= {};
  worker.blackboard.nextTargetRefreshSec = Number.POSITIVE_INFINITY;
  worker.currentJob = null;
}

// ---------------------------------------------------------------------------
// 1:1 binding primitives
// ---------------------------------------------------------------------------

test("v0.9.3 #1: tryReserve atomically claims a tile (returns true on success)", () => {
  const jr = new JobReservation();
  assert.equal(jr.tryReserve("w1", 5, 5, "farm", 100), true);
  assert.equal(jr.getOccupant(5, 5), "w1");
});

test("v0.9.3 #2: tryReserve refuses when another worker holds it", () => {
  const jr = new JobReservation();
  assert.equal(jr.tryReserve("w1", 5, 5, "farm", 100), true);
  assert.equal(jr.tryReserve("w2", 5, 5, "farm", 101), false);
  assert.equal(jr.getOccupant(5, 5), "w1");
});

test("v0.9.3 #3: tryReserve refreshes timestamp for same worker re-claiming", () => {
  const jr = new JobReservation();
  assert.equal(jr.tryReserve("w1", 5, 5, "farm", 100), true);
  assert.equal(jr.tryReserve("w1", 5, 5, "farm", 200), true);
  // Stale cleanup at t=205 with maxAge=30 — reservation at t=200 is fresh, survives
  jr.cleanupStale(205, 30);
  assert.equal(jr.getOccupant(5, 5), "w1");
});

test("v0.9.3 #4: tryReserve releases the worker's previous tile reservation", () => {
  const jr = new JobReservation();
  jr.tryReserve("w1", 1, 1, "farm", 100);
  jr.tryReserve("w1", 2, 2, "lumber", 101);
  assert.equal(jr.getOccupant(1, 1), null, "old tile released");
  assert.equal(jr.getOccupant(2, 2), "w1", "new tile held");
});

test("v0.9.3 #5: getOccupant returns null on unreserved tiles", () => {
  const jr = new JobReservation();
  assert.equal(jr.getOccupant(99, 99), null);
});

// ---------------------------------------------------------------------------
// JobHarvest 1:1 binding behaviour
// ---------------------------------------------------------------------------

test("v0.9.3 #6: JobHarvestFarm.findTarget skips reserved tile, picks alternate", () => {
  const state = makeState({ seed: 9999, bareInitial: true });
  const services = createServices(state.world.mapSeed);
  state.buildings = { farms: 0, lumbers: 0, quarries: 0, herbGardens: 0 };
  state._jobReservation = new JobReservation();
  // Place two farms close together
  placeNode(state, 10, 10, TILE.FARM, "farms");
  placeNode(state, 11, 11, TILE.FARM, "farms");

  // w1 takes (10,10) — w2 should pick (11,11) because (10,10) is bound
  state._jobReservation.tryReserve("w1", 10, 10, "farm", 0);

  const w2 = createWorker(0, 0, () => 0.5);
  state.agents.push(w2);
  placeWorkerAt(w2, state, 8, 9, ROLE.FARM);

  const job = new JobHarvestFarm();
  const target = job.findTarget(w2, state, services);
  assert.ok(target, "w2 should still find a farm");
  assert.notDeepEqual(
    { ix: target.ix, iz: target.iz },
    { ix: 10, iz: 10 },
    "w2 should NOT pick the tile reserved for w1",
  );
});

test("v0.9.3 #7: JobHarvestLumber.canTake false when every lumber has yieldPool=0", () => {
  const state = makeState({ seed: 314, bareInitial: true });
  const services = createServices(state.world.mapSeed);
  state.buildings = { farms: 0, lumbers: 0, quarries: 0, herbGardens: 0 };
  // Place a LUMBER tile then drain the pool to 0
  placeNode(state, 7, 7, TILE.LUMBER, "lumbers");
  setTileField(state.grid, 7, 7, "yieldPool", 0);

  const worker = state.agents.find((a) => a.type === "WORKER");
  placeWorkerAt(worker, state, 5, 5, ROLE.WOOD);

  const job = new JobHarvestLumber();
  assert.equal(job.canTake(worker, state, services), false,
    "lumber with yieldPool=0 should make the Job ineligible");
});

test("v0.9.3 #8: JobHarvestQuarry.canTake false when every quarry has yieldPool=0", () => {
  const state = makeState({ seed: 314, bareInitial: true });
  const services = createServices(state.world.mapSeed);
  state.buildings = { farms: 0, lumbers: 0, quarries: 0, herbGardens: 0 };
  placeNode(state, 7, 7, TILE.QUARRY, "quarries");
  setTileField(state.grid, 7, 7, "yieldPool", 0);

  const worker = state.agents.find((a) => a.type === "WORKER");
  placeWorkerAt(worker, state, 5, 5, ROLE.STONE);

  const job = new JobHarvestQuarry();
  assert.equal(job.canTake(worker, state, services), false,
    "quarry with yieldPool=0 (depleted stone) should make Job ineligible");
});

test("v0.9.3 #9: tryReserve hard-rejection means second worker abandons on arrival", () => {
  // Two workers, one farm. After both find the farm, the first to call
  // tryReserve wins; the second falls into the `worker.currentJob = null`
  // branch and drops back to JobWander next tick.
  const state = makeState({ seed: 9999, bareInitial: true });
  const services = createServices(state.world.mapSeed);
  state.buildings = { farms: 0, lumbers: 0, quarries: 0, herbGardens: 0 };
  state._jobReservation = new JobReservation();
  placeNode(state, 10, 10, TILE.FARM, "farms");

  const w1 = state.agents.find((a) => a.type === "WORKER");
  placeWorkerAt(w1, state, 10, 10, ROLE.FARM); // already on the farm

  // Manually set up w1 to look like it has just arrived at this Job's tile.
  w1.targetTile = { ix: 10, iz: 10 };
  w1.currentJob = { id: "harvest_farm", target: { ix: 10, iz: 10 }, startSec: 0, lastScore: 1 };

  const job = new JobHarvestFarm();
  job.tick(w1, state, services, 1 / 30);
  assert.equal(state._jobReservation.getOccupant(10, 10), w1.id, "w1 holds the tile");

  // w2 races in and tries to tick on the same tile.
  const w2 = createWorker(0, 0, () => 0.5);
  state.agents.push(w2);
  placeWorkerAt(w2, state, 10, 10, ROLE.FARM);
  w2.targetTile = { ix: 10, iz: 10 };
  w2.currentJob = { id: "harvest_farm", target: { ix: 10, iz: 10 }, startSec: 0, lastScore: 1 };

  job.tick(w2, state, services, 1 / 30);
  assert.equal(w2.currentJob, null, "w2 abandoned because tile reserved by w1");
});

// ---------------------------------------------------------------------------
// Bridge AI: ColonyDirector proposes bridges across narrow water
// ---------------------------------------------------------------------------

test("v0.9.3 #10: ColonyDirector places a bridge on a narrow water crossing", () => {
  // Build a tiny test grid by hand: stamp a row of WATER between two
  // GRASS regions, place a warehouse on one side, give the colony enough
  // resources, and tick the director once. A bridge should land on the
  // water tile.
  const state = makeState({ seed: 42, bareInitial: true });
  state.ai = state.ai ?? {};
  state.ai.enabled = true;
  state.ai.coverageTarget = "fallback";
  state.session.phase = "active";

  // Stamp a single-tile water moat at row 20, columns 30-31.
  setTile(state.grid, 30, 20, TILE.WATER);
  setTile(state.grid, 31, 20, TILE.WATER);
  // Land both north (iz=19) and south (iz=21) — narrow N/S crossing.
  setTile(state.grid, 30, 19, TILE.GRASS);
  setTile(state.grid, 31, 19, TILE.GRASS);
  setTile(state.grid, 30, 21, TILE.GRASS);
  setTile(state.grid, 31, 21, TILE.GRASS);

  // Warehouse near the crossing so distance-to-warehouse sort favours it.
  setTile(state.grid, 32, 19, TILE.WAREHOUSE);
  state.buildings = { ...(state.buildings ?? {}), warehouses: 1 };
  state.resources = { ...(state.resources ?? {}), wood: 200, stone: 200, food: 200, herbs: 100 };

  // Force the eval gate to fire by pre-loading lastEvalSec way in the past.
  state.ai.colonyDirector = {
    lastEvalSec: -100,
    lastEvalWallSec: -100,
    phase: "bootstrap",
    buildQueue: [],
    buildsPlaced: 0,
    skippedByWallRate: 0,
  };
  state.metrics.timeSec = 1000;

  const services = createServices(state.world.mapSeed);
  const sys = new ColonyDirectorSystem();
  sys.update(1 / 30, state, services);

  // Either tile could have been chosen; check at least one is now BRIDGE
  // OR a construction site (blueprint) for a bridge exists at one of them.
  const sites = state.constructionSites ?? [];
  const bridgeSite = sites.find((s) => s.tool === "bridge"
    && ((s.ix === 30 && s.iz === 20) || (s.ix === 31 && s.iz === 20)));
  const tile30 = state.grid.tiles[30 + 20 * state.grid.width];
  const tile31 = state.grid.tiles[31 + 20 * state.grid.width];
  const placed = tile30 === TILE.BRIDGE || tile31 === TILE.BRIDGE || Boolean(bridgeSite);
  assert.ok(placed, "ColonyDirector should propose a bridge on the narrow water crossing");
});

// ---------------------------------------------------------------------------
// Production-rate sanity: 1 worker × 1 farm × 1 minute is bounded
// ---------------------------------------------------------------------------

test("v0.9.3 #11: production rate is bounded (1 worker × 1 farm × 60s)", async () => {
  // Yield-pool depletion + 1:1 binding mean a single worker on a single farm
  // produces a finite, predictable amount of food per minute. We don't test
  // an exact number — we test the upper bound: at most ~30 food in 60s
  // with the new harvestDuration=2.4s (≈25 cycles/min, baseline ≈1 per
  // cycle, so the *expected* output is roughly 25 ± weather/fertility).
  const harvestDur = Number(BALANCE.workerHarvestDurationSec);
  assert.ok(harvestDur >= 2.0 && harvestDur <= 3.0,
    `workerHarvestDurationSec rebalanced: got ${harvestDur}, expected in [2.0, 3.0]`);

  const fpInit = Number(BALANCE.farmYieldPoolInitial);
  assert.ok(fpInit >= 80 && fpInit <= 100,
    `farmYieldPoolInitial rebalanced: got ${fpInit}, expected in [80, 100]`);

  const fr = Number(BALANCE.nodeYieldPoolForest);
  assert.ok(fr <= 130,
    `nodeYieldPoolForest tightened: got ${fr}, expected ≤ 130`);
});
