import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { handleHarvest } from "../src/simulation/npc/WorkerAISystem.js";
import { TileStateSystem } from "../src/simulation/economy/TileStateSystem.js";
import { BALANCE } from "../src/config/balance.js";
import { ROLE, TILE } from "../src/config/constants.js";
import { getTileState, setTileField, tileToWorld } from "../src/world/grid/Grid.js";

function setTileAt(state, ix, iz, tileType) {
  state.grid.tiles[ix + iz * state.grid.width] = tileType;
  state.grid.version = (state.grid.version ?? 0) + 1;
}

// Place a worker exactly on a tile, configured for FARM harvest with a stable
// path (nextTargetRefreshSec=Infinity prevents the intent layer from re-planning).
function placeFarmWorker(worker, state, ix, iz) {
  const pos = tileToWorld(ix, iz, state.grid);
  worker.x = pos.x;
  worker.z = pos.z;
  worker.role = ROLE.FARM;
  worker.path = null;
  worker.pathIndex = 0;
  worker.pathGridVersion = state.grid.version ?? 0;
  worker.targetTile = { ix, iz };
  worker.stateLabel = "Harvest";
  worker.cooldown = 0;
  worker.hunger = 1;
  worker.rest = 1;
  worker.morale = 1;
  worker.carry = { food: 0, wood: 0, stone: 0, herbs: 0 };
  worker.blackboard ??= {};
  worker.blackboard.intent = "farm";
  worker.blackboard.taskLock = { state: "harvest", untilSec: Number.POSITIVE_INFINITY };
  worker.blackboard.nextTargetRefreshSec = Number.POSITIVE_INFINITY;
}

// Seed tile state so we have a known fertility/yieldPool to work against.
// Sets the tile's moisture high enough that TileStateSystem's moisture-cap
// recovery won't pull fertility back down below our target during the test.
function primeFarmTile(state, ix, iz, overrides = {}) {
  setTileAt(state, ix, iz, TILE.FARM);
  state.grid.tileState ??= new Map();
  const idx = ix + iz * state.grid.width;
  state.grid.tileState.set(idx, {
    fertility: 0.9,
    wear: 0,
    growthStage: 3,
    salinized: 0,
    fallowUntil: 0,
    yieldPool: Number(BALANCE.farmYieldPoolInitial ?? 120),
    nodeFlags: 0,
    ...overrides,
  });
  if (state.grid.moisture) state.grid.moisture[idx] = 0.8;
  state.grid.tileStateVersion = (state.grid.tileStateVersion ?? 0) + 1;
}

// Drive `handleHarvest` until one full harvest cycle completes (cooldown hits
// ≤0 and credits carry). Returns the number of iterations consumed.
function completeOneHarvest(worker, state, services, dt = 0.1, maxIters = 200) {
  const carryBefore = Number(worker.carry.food ?? 0);
  for (let i = 0; i < maxIters; i += 1) {
    handleHarvest(worker, state, services, dt);
    state.metrics.tick = (state.metrics.tick ?? 0) + 1;
    state.metrics.timeSec = (state.metrics.timeSec ?? 0) + dt;
    // A completion tick is the first tick where carry increases from the baseline.
    if (Number(worker.carry.food ?? 0) > carryBefore) return i + 1;
    // On depleted pool, carry may remain at baseline despite completion.
    // Detect that path via salinized increment instead.
    const ts = getTileState(state.grid, worker.targetTile.ix, worker.targetTile.iz);
    if (ts && Number(ts.salinized ?? 0) > 0 && Number(worker.cooldown ?? 0) <= 0) {
      // salinized got bumped → completion happened this tick
      return i + 1;
    }
  }
  throw new Error("completeOneHarvest: harvest did not complete within iteration budget");
}

// ---------------------------------------------------------------------------
// Case A — repeated FARM harvests accumulate salinized and trigger fallow.
// ---------------------------------------------------------------------------
test("M1 soil: repeated FARM harvests accumulate salinized and trigger fallow", () => {
  const state = createInitialGameState({ seed: 2026 });
  const services = createServices(state.world.mapSeed);
  state.environment = { isNight: false };
  state.metrics.tick = 100;
  state.metrics.timeSec = 0;

  const ix = 12;
  const iz = 12;
  primeFarmTile(state, ix, iz);
  const worker = state.agents.find((a) => a.type === "WORKER");
  assert.ok(worker, "need at least one worker in initial state");
  placeFarmWorker(worker, state, ix, iz);

  const perHarvest = Number(BALANCE.soilSalinizationPerHarvest ?? 0.02);
  const threshold = Number(BALANCE.soilSalinizationThreshold ?? 0.8);
  const expectedHarvestsToFallow = Math.ceil(threshold / perHarvest);

  let fallowTriggeredAfter = -1;
  for (let harvest = 1; harvest <= expectedHarvestsToFallow + 2; harvest += 1) {
    completeOneHarvest(worker, state, services);
    const ts = getTileState(state.grid, ix, iz);
    if (Number(ts.fallowUntil ?? 0) > 0 && fallowTriggeredAfter < 0) {
      fallowTriggeredAfter = harvest;
      break;
    }
  }

  assert.ok(fallowTriggeredAfter > 0, "expected fallow to trigger within budget");
  assert.ok(
    fallowTriggeredAfter <= expectedHarvestsToFallow + 1,
    `fallow should trigger near ${expectedHarvestsToFallow} harvests, got ${fallowTriggeredAfter}`,
  );

  const ts = getTileState(state.grid, ix, iz);
  assert.equal(ts.fertility, 0, "fertility should be hard-capped at 0 while fallow");
  assert.ok(Number(ts.fallowUntil) > Number(state.metrics.tick), "fallowUntil should be in the future");
});

// ---------------------------------------------------------------------------
// Case B — during fallow, FARM harvests yield zero food.
// ---------------------------------------------------------------------------
test("M1 soil: FARM harvests during fallow produce zero food", () => {
  const state = createInitialGameState({ seed: 2027 });
  const services = createServices(state.world.mapSeed);
  state.environment = { isNight: false };
  state.metrics.tick = 100;
  state.metrics.timeSec = 0;

  const ix = 14;
  const iz = 14;
  primeFarmTile(state, ix, iz, {
    fertility: 0,
    salinized: Number(BALANCE.soilSalinizationThreshold ?? 0.8),
    fallowUntil: 100 + Number(BALANCE.soilFallowRecoveryTicks ?? 1800),
    yieldPool: 0,
  });

  const worker = state.agents.find((a) => a.type === "WORKER");
  assert.ok(worker);
  placeFarmWorker(worker, state, ix, iz);

  // Drive several harvest cycles — carry.food must stay at 0 because fertility
  // is 0 (so resolveWorkCooldown credits ~0.2 minimum; yieldPool=0 refunds it).
  const iterations = 400;
  const dt = 0.1;
  for (let i = 0; i < iterations; i += 1) {
    handleHarvest(worker, state, services, dt);
    state.metrics.tick = (state.metrics.tick ?? 0) + 1;
    state.metrics.timeSec = (state.metrics.timeSec ?? 0) + dt;
  }

  assert.equal(
    Number(worker.carry.food ?? 0),
    0,
    "worker should accrue zero food while the tile is fallow + yieldPool=0",
  );
});

// ---------------------------------------------------------------------------
// Case C — after soilFallowRecoveryTicks, fertility restores + yieldPool refills.
// ---------------------------------------------------------------------------
test("M1 soil: fallow expiry restores fertility and refills yieldPool", () => {
  const state = createInitialGameState({ seed: 2028 });
  state.environment = { isNight: false };
  state.metrics.tick = 100;
  state.metrics.timeSec = 0;

  const ix = 16;
  const iz = 16;
  const fallowTicks = Number(BALANCE.soilFallowRecoveryTicks ?? 1800);
  primeFarmTile(state, ix, iz, {
    fertility: 0,
    salinized: Number(BALANCE.soilSalinizationThreshold ?? 0.8),
    fallowUntil: state.metrics.tick + fallowTicks,
    yieldPool: 0,
  });

  const tileSys = new TileStateSystem();
  // Jump the tick forward past fallow expiry, then run one soil update.
  state.metrics.tick += fallowTicks + 1;
  tileSys.update(0.1, state);

  const ts = getTileState(state.grid, ix, iz);
  assert.equal(Number(ts.fallowUntil), 0, "fallowUntil should be cleared after expiry");
  assert.equal(Number(ts.salinized), 0, "salinized should reset to 0 on recovery");
  assert.ok(Number(ts.fertility) > 0.5, `fertility should restore to ~0.9, got ${ts.fertility}`);
  assert.equal(
    Number(ts.yieldPool),
    Number(BALANCE.farmYieldPoolInitial ?? 120),
    "yieldPool should refill to farmYieldPoolInitial on recovery",
  );
});

// ---------------------------------------------------------------------------
// Case D — yieldPool passively regenerates toward farmYieldPoolMax.
// ---------------------------------------------------------------------------
test("M1 soil: yieldPool passively regenerates toward farmYieldPoolMax", () => {
  const state = createInitialGameState({ seed: 2029 });
  state.environment = { isNight: false };
  state.metrics.tick = 100;
  state.metrics.timeSec = 0;

  const ix = 18;
  const iz = 18;
  const poolMax = Number(BALANCE.farmYieldPoolMax ?? 180);
  const regenPerTick = Number(BALANCE.farmYieldPoolRegenPerTick ?? 0.1);
  const startPool = poolMax - 10;
  primeFarmTile(state, ix, iz, { yieldPool: startPool });

  const tileSys = new TileStateSystem();
  const ticks = 50;
  for (let i = 0; i < ticks; i += 1) {
    state.metrics.tick += 1;
    state.metrics.timeSec += 0.1;
    tileSys.update(0.1, state);
  }

  const ts = getTileState(state.grid, ix, iz);
  const expected = Math.min(poolMax, startPool + regenPerTick * ticks);
  assert.ok(
    Math.abs(Number(ts.yieldPool) - expected) < 0.5,
    `yieldPool should regen from ${startPool} toward ${expected.toFixed(2)}, got ${ts.yieldPool}`,
  );

  // Running many more ticks must not overshoot the cap.
  for (let i = 0; i < 10_000; i += 1) {
    state.metrics.tick += 1;
    state.metrics.timeSec += 0.1;
    tileSys.update(0.1, state);
  }
  const capped = getTileState(state.grid, ix, iz);
  assert.ok(
    Number(capped.yieldPool) <= poolMax + 1e-6,
    `yieldPool must never exceed farmYieldPoolMax, got ${capped.yieldPool}`,
  );
  assert.ok(
    Number(capped.yieldPool) >= poolMax - 1e-6,
    `yieldPool should saturate at farmYieldPoolMax, got ${capped.yieldPool}`,
  );
});
