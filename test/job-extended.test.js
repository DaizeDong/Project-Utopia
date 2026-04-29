// v0.9.0-c — Tests for the 8 new Jobs landed this phase: JobDeliverWarehouse,
// JobBuildSite, JobEat, JobRest, JobProcessKitchen/Smithy/Clinic,
// JobGuardEngage. Plus hysteresis cases involving the new Jobs and
// yield-equivalence checks for the 3 process Jobs (output produced via
// ProcessingSystem must match between legacy and Job-layer dispatch).

import test from "node:test";
import assert from "node:assert/strict";

import { BALANCE } from "../src/config/balance.js";
import {
  ANIMAL_KIND,
  FEATURE_FLAGS,
  ROLE,
  TILE,
  VISITOR_KIND,
  _testSetFeatureFlag,
} from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { setTile, setTileField, tileToWorld } from "../src/world/grid/Grid.js";

import { JobScheduler } from "../src/simulation/npc/jobs/JobScheduler.js";
import { JobBuildSite } from "../src/simulation/npc/jobs/JobBuildSite.js";
import { JobDeliverWarehouse } from "../src/simulation/npc/jobs/JobDeliverWarehouse.js";
import { JobEat } from "../src/simulation/npc/jobs/JobEat.js";
import { JobGuardEngage } from "../src/simulation/npc/jobs/JobGuardEngage.js";
import { JobHarvestFarm } from "../src/simulation/npc/jobs/JobHarvestFarm.js";
import { JobProcessClinic } from "../src/simulation/npc/jobs/JobProcessClinic.js";
import { JobProcessKitchen } from "../src/simulation/npc/jobs/JobProcessKitchen.js";
import { JobProcessSmithy } from "../src/simulation/npc/jobs/JobProcessSmithy.js";
import { JobRest } from "../src/simulation/npc/jobs/JobRest.js";
import { JobWander } from "../src/simulation/npc/jobs/JobWander.js";
import { ALL_JOBS } from "../src/simulation/npc/jobs/JobRegistry.js";
import { ProcessingSystem } from "../src/simulation/economy/ProcessingSystem.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";
import { BoidsSystem } from "../src/simulation/movement/BoidsSystem.js";

function makeState({ seed = 4242, bareInitial = false } = {}) {
  const state = createInitialGameState({ seed, bareInitial });
  state.session ??= {};
  state.session.phase = "active";
  state.environment = { isNight: false };
  state.metrics.tick = 0;
  state.metrics.timeSec = 0;
  return state;
}

function aWorker(state) {
  return state.agents.find((a) => a.type === "WORKER" && a.alive !== false);
}

function placeWorkerAt(worker, state, ix, iz, role = ROLE.HAUL) {
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

function placeBuilding(state, ix, iz, tileType, statsKey) {
  setTile(state.grid, ix, iz, tileType);
  state.grid.version = (state.grid.version ?? 0) + 1;
  state.buildings ??= {};
  state.buildings[statsKey] = (Number(state.buildings[statsKey] ?? 0)) + 1;
}

const placeWarehouse = (s, ix, iz) => placeBuilding(s, ix, iz, TILE.WAREHOUSE, "warehouses");
const placeKitchen = (s, ix, iz) => placeBuilding(s, ix, iz, TILE.KITCHEN, "kitchens");
const placeSmithy = (s, ix, iz) => placeBuilding(s, ix, iz, TILE.SMITHY, "smithies");
const placeClinic = (s, ix, iz) => placeBuilding(s, ix, iz, TILE.CLINIC, "clinics");

function placeFarm(state, ix, iz) {
  setTile(state.grid, ix, iz, TILE.FARM);
  setTileField(state.grid, ix, iz, "fertility", 0.9);
  setTileField(state.grid, ix, iz, "yieldPool", Number(BALANCE.farmYieldPoolInitial ?? 120));
  state.grid.version = (state.grid.version ?? 0) + 1;
  state.buildings ??= {};
  state.buildings.farms = (Number(state.buildings.farms ?? 0)) + 1;
}

// ---------------------------------------------------------------------------
// 1. JobDeliverWarehouse smoke — canTake + score with carry-fullness
// ---------------------------------------------------------------------------

test("v0.9.0-c #1: JobDeliverWarehouse canTake + score scales with carry-fullness", () => {
  const state = makeState();
  placeWarehouse(state, 7, 5);
  const worker = aWorker(state);
  placeWorkerAt(worker, state, 5, 5, ROLE.HAUL);
  const job = new JobDeliverWarehouse();
  // Empty carry → cannot take.
  assert.equal(job.canTake(worker, state, null), false, "empty carry → cannot deliver");
  // Half-full carry → canTake true, score modest.
  worker.carry.food = 1.0;
  assert.equal(job.canTake(worker, state, null), true);
  const halfScore = job.score(worker, state, null, { ix: 7, iz: 5 });
  // Full carry → score saturates near 0.95.
  worker.carry.food = Number(BALANCE.workerDeliverThreshold ?? 1.6) * 2;
  const fullScore = job.score(worker, state, null, { ix: 7, iz: 5 });
  assert.ok(fullScore > halfScore, `full ${fullScore} > half ${halfScore}`);
  assert.ok(fullScore <= 0.95, `full score capped at 0.95, got ${fullScore}`);
  // No warehouses → cannot take.
  state.buildings.warehouses = 0;
  assert.equal(job.canTake(worker, state, null), false);
});

// ---------------------------------------------------------------------------
// 2. JobBuildSite smoke — BUILDER eligible, FARM with sites>workers also eligible
// ---------------------------------------------------------------------------

test("v0.9.0-c #2: JobBuildSite canTake — BUILDER always; FARM/HAUL only when sites > workers", () => {
  const state = makeState();
  state.constructionSites = [];
  const worker = aWorker(state);
  placeWorkerAt(worker, state, 5, 5, ROLE.BUILDER);
  const job = new JobBuildSite();
  // No sites → no.
  assert.equal(job.canTake(worker, state, null), false, "no sites → cannot take");
  // BUILDER + 1 site → yes.
  state.constructionSites.push({ ix: 8, iz: 8, builderId: null });
  assert.equal(job.canTake(worker, state, null), true, "BUILDER + 1 site → can take");
  // FARM + 1 site, but workers > sites → no.
  worker.role = ROLE.FARM;
  assert.equal(job.canTake(worker, state, null), false, "FARM with workers > sites → cannot take");
  // FARM + 99 sites → yes (sites > workers bypass).
  for (let i = 0; i < 99; i += 1) {
    state.constructionSites.push({ ix: i, iz: 0, builderId: null });
  }
  assert.equal(job.canTake(worker, state, null), true, "FARM + many sites → bypass eligible");
  // BUILDER score should beat FARM score for the same target.
  worker.role = ROLE.BUILDER;
  const builderScore = job.score(worker, state, null, { ix: 6, iz: 5 });
  worker.role = ROLE.FARM;
  const farmScore = job.score(worker, state, null, { ix: 6, iz: 5 });
  assert.ok(builderScore > farmScore, `BUILDER ${builderScore} > FARM ${farmScore}`);
});

// ---------------------------------------------------------------------------
// 3. JobEat smoke — gates on hunger + score curve
// ---------------------------------------------------------------------------

test("v0.9.0-c #3: JobEat canTake gates on hunger threshold; score scales inversely with hunger", () => {
  const state = makeState();
  placeWarehouse(state, 7, 5);
  state.resources.food = 50;
  const worker = aWorker(state);
  placeWorkerAt(worker, state, 5, 5, ROLE.HAUL);
  const job = new JobEat();
  // Fed worker (hunger=1.0) → cannot take.
  worker.hunger = 1.0;
  assert.equal(job.canTake(worker, state, null), false, "fed worker → cannot take eat");
  // Hungry worker (hunger=0.10) → can take.
  worker.hunger = 0.10;
  assert.equal(job.canTake(worker, state, null), true, "hungry worker → can take eat");
  // Score: hunger=0.10 (below seek threshold 0.18) → ~0.95.
  const target = { ix: 7, iz: 5 };
  const hungryScore = job.score(worker, state, null, target);
  assert.ok(hungryScore > 0.9, `hunger=0.10 → score ~0.95, got ${hungryScore}`);
  // Hunger=0.15 (still below threshold) → ~0.90.
  worker.hunger = 0.15;
  const veryHungryScore = job.score(worker, state, null, target);
  assert.ok(veryHungryScore > 0.85 && veryHungryScore < 0.95, `hunger=0.15 → ~0.90, got ${veryHungryScore}`);
  // Above threshold → 0 (no thrash with other Jobs).
  worker.hunger = 0.50;
  assert.equal(job.score(worker, state, null, target), 0, "above threshold → score 0");
  worker.hunger = 1.0;
  assert.equal(job.score(worker, state, null, target), 0, "fed worker → score 0");
});

// ---------------------------------------------------------------------------
// 4. JobRest smoke
// ---------------------------------------------------------------------------

test("v0.9.0-c #4: JobRest canTake gates on rest threshold; isComplete fires at recover threshold", () => {
  const state = makeState();
  const worker = aWorker(state);
  placeWorkerAt(worker, state, 5, 5, ROLE.HAUL);
  const job = new JobRest();
  // Rested worker → cannot take.
  worker.rest = 1.0;
  assert.equal(job.canTake(worker, state, null), false);
  // Tired worker → can take.
  worker.rest = 0.10;
  assert.equal(job.canTake(worker, state, null), true);
  // Score curve.
  const target = { ix: 5, iz: 5 };
  const tiredScore = job.score(worker, state, null, target);
  assert.ok(tiredScore > 0.9, `rest=0.10 → ~0.95 score, got ${tiredScore}`);
  // isComplete fires when rested above recover threshold.
  worker.rest = Number(BALANCE.workerRestRecoverThreshold ?? 0.5) + 0.01;
  assert.equal(job.isComplete(worker, state, null), true);
  worker.rest = Number(BALANCE.workerRestRecoverThreshold ?? 0.5) - 0.01;
  assert.equal(job.isComplete(worker, state, null), false);
});

// ---------------------------------------------------------------------------
// 5. JobProcessKitchen smoke — role gate + tile gate + input gate
// ---------------------------------------------------------------------------

test("v0.9.0-c #5: JobProcessKitchen gates on role=COOK + kitchens>0 + food>=cost", () => {
  const state = makeState();
  state.resources.food = 50;
  placeKitchen(state, 7, 5);
  const worker = aWorker(state);
  placeWorkerAt(worker, state, 5, 5, ROLE.COOK);
  const job = new JobProcessKitchen();
  assert.equal(job.canTake(worker, state, null), true, "COOK + kitchen + food → can take");
  // Wrong role.
  worker.role = ROLE.HAUL;
  assert.equal(job.canTake(worker, state, null), false, "non-COOK role → cannot take");
  // Right role but no food.
  worker.role = ROLE.COOK;
  state.resources.food = 0;
  assert.equal(job.canTake(worker, state, null), false, "no food → cannot take");
  // Right role but no kitchen.
  state.resources.food = 50;
  state.buildings.kitchens = 0;
  assert.equal(job.canTake(worker, state, null), false, "no kitchen → cannot take");
});

// ---------------------------------------------------------------------------
// 6. JobProcessSmithy smoke
// ---------------------------------------------------------------------------

test("v0.9.0-c #6: JobProcessSmithy gates on role=SMITH + smithies>0 + stone+wood available", () => {
  const state = makeState();
  state.resources.stone = 20;
  state.resources.wood = 20;
  placeSmithy(state, 7, 5);
  const worker = aWorker(state);
  placeWorkerAt(worker, state, 5, 5, ROLE.SMITH);
  const job = new JobProcessSmithy();
  assert.equal(job.canTake(worker, state, null), true);
  state.resources.stone = 0;
  assert.equal(job.canTake(worker, state, null), false, "no stone → cannot take");
  state.resources.stone = 20;
  state.resources.wood = 0;
  assert.equal(job.canTake(worker, state, null), false, "no wood → cannot take");
});

// ---------------------------------------------------------------------------
// 7. JobProcessClinic smoke
// ---------------------------------------------------------------------------

test("v0.9.0-c #7: JobProcessClinic gates on role=HERBALIST + clinics>0 + herbs available", () => {
  const state = makeState();
  state.resources.herbs = 20;
  placeClinic(state, 7, 5);
  const worker = aWorker(state);
  placeWorkerAt(worker, state, 5, 5, ROLE.HERBALIST);
  const job = new JobProcessClinic();
  assert.equal(job.canTake(worker, state, null), true);
  state.resources.herbs = 0;
  assert.equal(job.canTake(worker, state, null), false);
});

// ---------------------------------------------------------------------------
// 8. JobGuardEngage smoke — role + hostile presence
// ---------------------------------------------------------------------------

test("v0.9.0-c #8: JobGuardEngage canTake gates on role=GUARD + nearby hostile", () => {
  const state = makeState();
  const worker = aWorker(state);
  placeWorkerAt(worker, state, 10, 10, ROLE.GUARD);
  const job = new JobGuardEngage();
  // No hostiles → cannot take.
  state.animals = [];
  assert.equal(job.canTake(worker, state, null), false, "no hostiles → cannot take");
  // Add a predator within aggro radius.
  const predPos = tileToWorld(11, 10, state.grid);
  state.animals = [{
    id: "pred-1",
    kind: ANIMAL_KIND.PREDATOR,
    species: "wolf",
    x: predPos.x,
    z: predPos.z,
    alive: true,
    hp: 30,
  }];
  assert.equal(job.canTake(worker, state, null), true, "GUARD + predator near → can take");
  // Wrong role.
  worker.role = ROLE.HAUL;
  assert.equal(job.canTake(worker, state, null), false, "non-GUARD → cannot take");
  // Score for GUARD is 0.95.
  worker.role = ROLE.GUARD;
  const target = job.findTarget(worker, state, null);
  assert.ok(target, "findTarget returns a hostile-derived target");
  assert.equal(target.meta.entityId, "pred-1");
  assert.ok(job.score(worker, state, null, target) > 0.9, "GUARD + hostile → score ~0.95");
});

// ---------------------------------------------------------------------------
// 9. Hysteresis: JobEat preempts mid-harvest when hunger drops
// ---------------------------------------------------------------------------

test("v0.9.0-c #9: hysteresis — JobEat preempts JobHarvestFarm when hunger drops below threshold", () => {
  const state = makeState();
  state.resources.food = 5; // low stockpile so harvest pressure is high
  placeWarehouse(state, 4, 5);
  placeFarm(state, 6, 5);
  const services = createServices(state.world.mapSeed);
  const worker = aWorker(state);
  placeWorkerAt(worker, state, 5, 5, ROLE.FARM);
  worker.hunger = 0.9; // not hungry
  const scheduler = new JobScheduler([
    new JobEat(),
    new JobHarvestFarm(),
    new JobWander(),
  ]);
  // Tick 1 — fed worker picks Farm.
  scheduler.tickWorker(worker, state, services, 1 / 30);
  assert.equal(worker.currentJob.id, "harvest_farm", "fed FARM worker picks Farm");
  // Drop hunger below seek threshold AND restock food so JobEat can fire.
  worker.hunger = 0.05;
  state.resources.food = 50; // warehouse now has food
  state.metrics.timeSec = 31; // past sticky decay window
  scheduler.tickWorker(worker, state, services, 1 / 30);
  assert.equal(worker.currentJob.id, "eat", "starving worker preempts to JobEat");
});

// ---------------------------------------------------------------------------
// 10. Hysteresis: JobDeliverWarehouse preempts harvest when carry full
// ---------------------------------------------------------------------------

test("v0.9.0-c #10: hysteresis — JobDeliverWarehouse takes over when carry hits full cap", () => {
  const state = makeState();
  state.resources.food = 5;
  placeWarehouse(state, 4, 5);
  placeFarm(state, 6, 5);
  const services = createServices(state.world.mapSeed);
  const worker = aWorker(state);
  placeWorkerAt(worker, state, 5, 5, ROLE.FARM);
  const scheduler = new JobScheduler([
    new JobDeliverWarehouse(),
    new JobHarvestFarm(),
    new JobWander(),
  ]);
  // Tick 1 — empty carry, picks Farm.
  scheduler.tickWorker(worker, state, services, 1 / 30);
  assert.equal(worker.currentJob.id, "harvest_farm", "empty-carry FARM worker picks Farm");
  // Carry hits full cap → JobHarvestFarm.isComplete fires; next tick re-picks
  // and JobDeliverWarehouse wins.
  worker.carry.food = Number(BALANCE.workerDeliverThreshold ?? 1.6) * 2 + 0.5;
  state.metrics.timeSec = 31; // past sticky decay
  scheduler.tickWorker(worker, state, services, 1 / 30);
  // After harvest's isComplete fires, currentJob is cleared and re-picked
  // fresh — deliver should beat harvest with full carry (deliver score
  // saturates near 0.95).
  assert.equal(worker.currentJob.id, "deliver_warehouse", "full-carry worker switches to deliver");
});

// ---------------------------------------------------------------------------
// 11. Full-registry resolution — hungry BUILDER + sites + farms picks Eat first
// ---------------------------------------------------------------------------

test("v0.9.0-c #11: full registry — hungry BUILDER with 5 sites + 2 farms picks JobEat first, JobBuildSite once fed", () => {
  const state = makeState();
  state.resources.food = 50;
  placeWarehouse(state, 4, 5);
  placeFarm(state, 8, 5);
  placeFarm(state, 9, 5);
  // 5 construction sites within distance.
  state.constructionSites = [
    { ix: 6, iz: 5, builderId: null, kind: "build", tool: "warehouse", workAppliedSec: 0, workTotalSec: 4 },
    { ix: 6, iz: 6, builderId: null, kind: "build", tool: "warehouse", workAppliedSec: 0, workTotalSec: 4 },
    { ix: 7, iz: 5, builderId: null, kind: "build", tool: "warehouse", workAppliedSec: 0, workTotalSec: 4 },
    { ix: 7, iz: 6, builderId: null, kind: "build", tool: "warehouse", workAppliedSec: 0, workTotalSec: 4 },
    { ix: 8, iz: 6, builderId: null, kind: "build", tool: "warehouse", workAppliedSec: 0, workTotalSec: 4 },
  ];
  const services = createServices(state.world.mapSeed);
  const worker = aWorker(state);
  placeWorkerAt(worker, state, 5, 5, ROLE.BUILDER);
  worker.hunger = 0.05; // starving
  const scheduler = new JobScheduler();
  scheduler.tickWorker(worker, state, services, 1 / 30);
  assert.equal(worker.currentJob.id, "eat", "starving BUILDER picks Eat first");
  // Feed worker; clear currentJob so scheduler re-picks.
  worker.hunger = 1.0;
  worker.currentJob = null;
  // Build job assigns itself a site via findOrReserveBuilderSite, so we
  // need to tick fresh.
  scheduler.tickWorker(worker, state, services, 1 / 30);
  assert.equal(worker.currentJob.id, "build_site", "fed BUILDER picks BuildSite once Eat is no longer eligible");
});

// ---------------------------------------------------------------------------
// 12. Yield-equivalence: JobProcessKitchen produces same meals as legacy
// ---------------------------------------------------------------------------

// Run a process building's full economy loop and return the output stockpile
// after `iters` half-second ticks. Pins the worker onto the building tile so
// ProcessingSystem's adjacency check is always satisfied.
function runProcessLoop({ setupBuilding, inputs, role, output, ix, iz, useFlag, iters = 80 }) {
  _testSetFeatureFlag("USE_JOB_LAYER", useFlag);
  try {
    const state = makeState({ seed: 9999 });
    for (const [k, v] of Object.entries(inputs)) state.resources[k] = v;
    state.resources[output] = 0;
    setupBuilding(state, ix, iz);
    const services = createServices(state.world.mapSeed);
    const worker = aWorker(state);
    placeWorkerAt(worker, state, ix, iz, role);
    const workerSystem = new WorkerAISystem();
    const boidsSystem = new BoidsSystem();
    const proc = new ProcessingSystem();
    const pos = tileToWorld(ix, iz, state.grid);
    const dt = 0.5;
    for (let i = 0; i < iters; i += 1) {
      state.metrics.tick += 1;
      state.metrics.timeSec += dt;
      worker.x = pos.x; worker.z = pos.z;
      worker.desiredVel = { x: 0, z: 0 }; worker.vel = { x: 0, z: 0 };
      workerSystem.update(dt, state, services);
      boidsSystem.update(dt, state, services);
      proc.update(dt, state);
    }
    return Number(state.resources[output] ?? 0);
  } finally {
    _testSetFeatureFlag("USE_JOB_LAYER", false);
  }
}

test("v0.9.0-c #12: yield-equivalence — JobProcessKitchen meal output matches legacy handleProcess", () => {
  const args = {
    setupBuilding: placeKitchen, role: ROLE.COOK,
    inputs: { food: 100 }, output: "meals", ix: 12, iz: 12,
  };
  const legacy = runProcessLoop({ ...args, useFlag: false });
  const jobLayer = runProcessLoop({ ...args, useFlag: true });
  assert.ok(legacy > 0, `legacy meals > 0 (got ${legacy})`);
  assert.ok(Math.abs(jobLayer - legacy) < 1e-6, `job-layer meals ${jobLayer} === legacy ${legacy}`);
});

test("v0.9.0-c #13: yield-equivalence — JobProcessSmithy + JobProcessClinic outputs match legacy", () => {
  const smithyArgs = {
    setupBuilding: placeSmithy, role: ROLE.SMITH,
    inputs: { stone: 100, wood: 100 }, output: "tools", ix: 14, iz: 14,
  };
  const smithyLegacy = runProcessLoop({ ...smithyArgs, useFlag: false });
  const smithyJob = runProcessLoop({ ...smithyArgs, useFlag: true });
  assert.ok(smithyLegacy > 0, `legacy tools > 0 (got ${smithyLegacy})`);
  assert.ok(Math.abs(smithyJob - smithyLegacy) < 1e-6, `job tools ${smithyJob} === legacy ${smithyLegacy}`);

  const clinicArgs = {
    setupBuilding: placeClinic, role: ROLE.HERBALIST,
    inputs: { herbs: 100 }, output: "medicine", ix: 16, iz: 16,
  };
  const clinicLegacy = runProcessLoop({ ...clinicArgs, useFlag: false });
  const clinicJob = runProcessLoop({ ...clinicArgs, useFlag: true });
  assert.ok(clinicLegacy > 0, `legacy medicine > 0 (got ${clinicLegacy})`);
  assert.ok(Math.abs(clinicJob - clinicLegacy) < 1e-6, `job medicine ${clinicJob} === legacy ${clinicLegacy}`);
});

// ---------------------------------------------------------------------------
// 14. GUARD short-circuit flag-gate: when ON, GUARDs route through scheduler
// ---------------------------------------------------------------------------

test("v0.9.0-c #14: GUARD short-circuit flag-gate — flag ON routes GUARDs through JobScheduler", () => {
  // Confirm registry length first.
  assert.equal(ALL_JOBS.length, 13, "registry now has 13 Jobs");

  _testSetFeatureFlag("USE_JOB_LAYER", true);
  try {
    const state = makeState({ bareInitial: true });
    state.resources.food = 9999;
    const services = createServices(state.world.mapSeed);
    const worker = aWorker(state);
    placeWorkerAt(worker, state, 10, 10, ROLE.GUARD);
    // Place a predator within aggro range.
    const predPos = tileToWorld(11, 10, state.grid);
    state.animals.push({
      id: "pred-engage-1",
      kind: ANIMAL_KIND.PREDATOR,
      species: "wolf",
      x: predPos.x,
      z: predPos.z,
      alive: true,
      hp: 30,
    });

    const workerSystem = new WorkerAISystem();
    const boidsSystem = new BoidsSystem();
    state.metrics.timeSec += 1 / 30;
    state.metrics.tick += 1;
    workerSystem.update(1 / 30, state, services);
    boidsSystem.update(1 / 30, state, services);

    // Under flag ON, JobScheduler should have set worker.currentJob to
    // guard_engage (priority-100 preempt).
    assert.ok(workerSystem._jobScheduler, "scheduler instantiated under flag ON");
    assert.equal(
      worker.currentJob?.id,
      "guard_engage",
      "GUARD with hostile in range → JobGuardEngage picked by scheduler",
    );
  } finally {
    _testSetFeatureFlag("USE_JOB_LAYER", false);
  }
});

test("v0.9.0-c #15: GUARD short-circuit flag-gate — flag OFF preserves legacy short-circuit", () => {
  // Default flag value is false.
  assert.equal(FEATURE_FLAGS.USE_JOB_LAYER, false, "default flag is OFF");
  const state = makeState({ bareInitial: true });
  const services = createServices(state.world.mapSeed);
  const worker = aWorker(state);
  placeWorkerAt(worker, state, 10, 10, ROLE.GUARD);
  // No hostiles — GUARD should idle on Watch.
  state.animals = [];
  state.agents = state.agents.filter((a) => a.id === worker.id || a.type !== "VISITOR");

  const workerSystem = new WorkerAISystem();
  const boidsSystem = new BoidsSystem();
  state.metrics.timeSec += 1 / 30;
  state.metrics.tick += 1;
  workerSystem.update(1 / 30, state, services);
  boidsSystem.update(1 / 30, state, services);

  // Flag-OFF: scheduler not instantiated, legacy GUARD short-circuit ran.
  assert.equal(workerSystem._jobScheduler, null, "scheduler null under flag OFF");
  assert.equal(worker.blackboard?.intent, "guard_idle", "legacy GUARD short-circuit set guard_idle");
});
