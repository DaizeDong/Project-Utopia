// v0.9.0-b — Tests for the four harvest Jobs (Farm/Lumber/Quarry/Herb)
// and JobHelpers. Verifies role-fit / distance / pressure scoring,
// hysteresis with harvest siblings, and yield-equivalence between the
// legacy handleHarvest dispatch and the extracted applyHarvestStep.

import test from "node:test";
import assert from "node:assert/strict";

import { BALANCE } from "../src/config/balance.js";
import { ROLE, TILE } from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { applyHarvestStep, handleHarvest } from "../src/simulation/npc/WorkerAISystem.js";
import { JobScheduler } from "../src/simulation/npc/jobs/JobScheduler.js";
import { JobHarvestFarm } from "../src/simulation/npc/jobs/JobHarvestFarm.js";
import { JobHarvestHerb } from "../src/simulation/npc/jobs/JobHarvestHerb.js";
import { JobHarvestLumber } from "../src/simulation/npc/jobs/JobHarvestLumber.js";
import { JobHarvestQuarry } from "../src/simulation/npc/jobs/JobHarvestQuarry.js";
import { JobWander } from "../src/simulation/npc/jobs/JobWander.js";
import { setTile, setTileField, tileToWorld } from "../src/world/grid/Grid.js";

function makeState({ seed = 4242 } = {}) {
  const state = createInitialGameState({ seed });
  state.session ??= {};
  state.session.phase = "active";
  state.environment = { isNight: false };
  state.metrics.tick = 0;
  state.metrics.timeSec = 0;
  return state;
}

function placeNode(state, ix, iz, tileType, statsKey) {
  setTile(state.grid, ix, iz, tileType);
  setTileField(state.grid, ix, iz, "fertility", 0.9);
  setTileField(state.grid, ix, iz, "yieldPool", Number(BALANCE.farmYieldPoolInitial ?? 120));
  state.grid.version = (state.grid.version ?? 0) + 1;
  state.buildings ??= {};
  state.buildings[statsKey] = (Number(state.buildings[statsKey] ?? 0)) + 1;
}

const placeFarm = (s, ix, iz) => placeNode(s, ix, iz, TILE.FARM, "farms");
const placeLumber = (s, ix, iz) => placeNode(s, ix, iz, TILE.LUMBER, "lumbers");
const placeQuarry = (s, ix, iz) => placeNode(s, ix, iz, TILE.QUARRY, "quarries");
const placeHerbGarden = (s, ix, iz) => placeNode(s, ix, iz, TILE.HERB_GARDEN, "herbGardens");

function aWorker(state) {
  return state.agents.find((a) => a.type === "WORKER" && a.alive !== false);
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

function makeHarvestScheduler() {
  return new JobScheduler([
    new JobHarvestFarm(),
    new JobHarvestLumber(),
    new JobHarvestQuarry(),
    new JobHarvestHerb(),
    new JobWander(),
  ]);
}

test("v0.9.0-b #1: JobHarvestFarm.canTake gates on farms > 0", () => {
  const state = makeState();
  state.buildings = { farms: 0, lumbers: 0, quarries: 0, herbGardens: 0 };
  const worker = aWorker(state);
  placeWorkerAt(worker, state, 5, 5, ROLE.FARM);
  const job = new JobHarvestFarm();
  assert.equal(job.canTake(worker, state, null), false, "no farms → cannot take");
  state.buildings.farms = 3;
  assert.equal(job.canTake(worker, state, null), true, "farms > 0 → can take");
});

test("v0.9.0-b #2: JobHarvestFarm.findTarget returns null when no FARM tiles exist", () => {
  // Bare-init has no FARM tiles; pretend buildings.farms > 0 anyway so we
  // exercise findTarget's grid scan rather than canTake.
  const state = createInitialGameState({ seed: 1337, bareInitial: true });
  const services = createServices(state.world.mapSeed);
  state.buildings = { farms: 5, lumbers: 0, quarries: 0, herbGardens: 0 };
  const worker = aWorker(state);
  placeWorkerAt(worker, state, 5, 5, ROLE.FARM);
  assert.equal(new JobHarvestFarm().findTarget(worker, state, services), null);
});

test("v0.9.0-b #3: JobHarvestFarm.score role-fit ordering — FARM > HAUL > other", () => {
  const state = makeState();
  state.resources = { ...state.resources, food: 5 };
  const worker = aWorker(state);
  placeWorkerAt(worker, state, 5, 5, ROLE.FARM);
  const job = new JobHarvestFarm();
  const target = { ix: 10, iz: 10 };
  worker.role = ROLE.FARM;
  const farmScore = job.score(worker, state, null, target);
  worker.role = ROLE.HAUL;
  const haulScore = job.score(worker, state, null, target);
  worker.role = ROLE.WOOD;
  const otherScore = job.score(worker, state, null, target);
  assert.ok(farmScore > haulScore, `FARM ${farmScore} > HAUL ${haulScore}`);
  assert.ok(haulScore > otherScore, `HAUL ${haulScore} > WOOD ${otherScore}`);
});

test("v0.9.0-b #4: JobHarvestFarm.score — high stockpile lowers score, low stockpile raises it", () => {
  const state = makeState();
  const worker = aWorker(state);
  placeWorkerAt(worker, state, 5, 5, ROLE.FARM);
  const job = new JobHarvestFarm();
  const target = { ix: 6, iz: 5 };
  state.resources.food = 100;
  const stocked = job.score(worker, state, null, target);
  state.resources.food = 0;
  const starved = job.score(worker, state, null, target);
  assert.ok(starved > stocked, `starved ${starved} > stocked ${stocked}`);
  assert.ok(stocked > 0, `pressure floor keeps stocked > 0 (got ${stocked})`);
});

test("v0.9.0-b #5: JobHarvestFarm.score — nearer target outscores farther target", () => {
  const state = makeState();
  state.resources.food = 5;
  const worker = aWorker(state);
  placeWorkerAt(worker, state, 5, 5, ROLE.FARM);
  const job = new JobHarvestFarm();
  const near = job.score(worker, state, null, { ix: 6, iz: 5 });
  const far = job.score(worker, state, null, { ix: 50, iz: 50 });
  assert.ok(near > far, `near ${near} > far ${far}`);
});

test("v0.9.0-b #6: scheduler — WOOD worker picks JobHarvestLumber over JobHarvestFarm", () => {
  const state = makeState();
  state.resources.food = 5;
  state.resources.wood = 5;
  const services = createServices(state.world.mapSeed);
  placeFarm(state, 7, 5);
  placeLumber(state, 8, 5);
  const worker = aWorker(state);
  placeWorkerAt(worker, state, 5, 5, ROLE.WOOD);
  const scheduler = makeHarvestScheduler();
  scheduler.tickWorker(worker, state, services, 1 / 30);
  assert.equal(worker.currentJob.id, "harvest_lumber");
});

test("v0.9.0-b #7: hysteresis — incumbent harvest Job survives marginally higher alt", () => {
  const state = makeState();
  state.resources.food = 5;
  state.resources.wood = 5;
  const services = createServices(state.world.mapSeed);
  placeFarm(state, 7, 5);
  placeLumber(state, 8, 5);
  const worker = aWorker(state);
  placeWorkerAt(worker, state, 5, 5, ROLE.WOOD);
  const scheduler = makeHarvestScheduler();
  scheduler.tickWorker(worker, state, services, 1 / 30);
  assert.equal(worker.currentJob.id, "harvest_lumber");

  // Invert pressure: wood plentiful, food scarce. Without sticky bonus
  // Farm raw would beat Lumber raw. Sticky retains the incumbent.
  state.resources.wood = 100;
  state.resources.food = 0;
  state.metrics.timeSec += 1 / 30;
  scheduler.tickWorker(worker, state, services, 1 / 30);
  assert.equal(worker.currentJob.id, "harvest_lumber", "fresh sticky retains incumbent");
});

test("v0.9.0-b #8: JobHarvestFarm.isComplete fires at carry-cap", () => {
  const state = makeState();
  const worker = aWorker(state);
  placeWorkerAt(worker, state, 5, 5, ROLE.FARM);
  const job = new JobHarvestFarm();
  worker.carry.food = 0.5;
  assert.equal(job.isComplete(worker, state, null), false);
  worker.carry.food = Number(BALANCE.workerDeliverThreshold ?? 1.6) * 2 + 0.1;
  assert.equal(job.isComplete(worker, state, null), true);
});

test("v0.9.0-b #9: applyHarvestStep yield matches legacy handleHarvest on completion tick", () => {
  function runWith(driver) {
    const state = makeState({ seed: 8888 });
    const services = createServices(state.world.mapSeed);
    const ix = 20; const iz = 20;
    placeFarm(state, ix, iz);
    const worker = aWorker(state);
    placeWorkerAt(worker, state, ix, iz, ROLE.FARM);
    worker.targetTile = { ix, iz };
    worker.blackboard.intent = "farm";
    worker.blackboard.taskLock = { state: "harvest", untilSec: Number.POSITIVE_INFINITY };
    const dt = 0.1;
    for (let i = 0; i < 200; i += 1) {
      driver(worker, state, services, dt);
      state.metrics.tick += 1;
      state.metrics.timeSec += dt;
      if (Number(worker.carry.food ?? 0) > 0) break;
    }
    return Number(worker.carry.food ?? 0);
  }
  const legacyFood = runWith((w, s, sv, dt) => handleHarvest(w, s, sv, dt));
  const jobFood = runWith((w, s, sv, dt) => applyHarvestStep(w, s, sv, dt, TILE.FARM, "food"));
  assert.ok(legacyFood > 0, `legacy yield > 0 (got ${legacyFood})`);
  assert.ok(
    Math.abs(jobFood - legacyFood) < 1e-6,
    `job ${jobFood} === legacy ${legacyFood}`,
  );
});

test("v0.9.0-b #10: JobHarvestQuarry / JobHarvestHerb credit carry.stone / carry.herbs", () => {
  function runHarvest({ tileType, resourceKey, role, place, ix, iz, seed }) {
    const state = makeState({ seed });
    const services = createServices(state.world.mapSeed);
    place(state, ix, iz);
    const worker = aWorker(state);
    placeWorkerAt(worker, state, ix, iz, role);
    worker.targetTile = { ix, iz };
    worker.blackboard.taskLock = { state: "harvest", untilSec: Number.POSITIVE_INFINITY };
    const dt = 0.1;
    for (let i = 0; i < 200; i += 1) {
      applyHarvestStep(worker, state, services, dt, tileType, resourceKey);
      state.metrics.tick += 1;
      state.metrics.timeSec += dt;
      if (Number(worker.carry[resourceKey] ?? 0) > 0) break;
    }
    return Number(worker.carry[resourceKey] ?? 0);
  }
  const stone = runHarvest({
    tileType: TILE.QUARRY, resourceKey: "stone", role: ROLE.STONE,
    place: placeQuarry, ix: 12, iz: 8, seed: 7777,
  });
  assert.ok(stone > 0, `stone > 0 (got ${stone})`);
  const herbs = runHarvest({
    tileType: TILE.HERB_GARDEN, resourceKey: "herbs", role: ROLE.HERBS,
    place: placeHerbGarden, ix: 14, iz: 9, seed: 6666,
  });
  assert.ok(herbs > 0, `herbs > 0 (got ${herbs})`);
});
