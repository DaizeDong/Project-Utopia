import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { handleDeliver } from "../src/simulation/npc/WorkerAISystem.js";
import { WarehouseQueueSystem } from "../src/simulation/economy/WarehouseQueueSystem.js";
import { BALANCE } from "../src/config/balance.js";
import { TILE } from "../src/config/constants.js";
import { EVENT_TYPES, getEventLog, initEventBus } from "../src/simulation/meta/GameEventBus.js";
import { tileToWorld } from "../src/world/grid/Grid.js";

function setTileAt(state, ix, iz, tileType) {
  state.grid.tiles[ix + iz * state.grid.width] = tileType;
}

function findOrMakeWarehouseTile(state, ix, iz) {
  setTileAt(state, ix, iz, TILE.WAREHOUSE);
  state.buildings ??= {};
  state.buildings.warehouses = Math.max(1, Number(state.buildings.warehouses ?? 0));
  return { ix, iz };
}

function placeWorkerAtTile(worker, state, ix, iz) {
  const pos = tileToWorld(ix, iz, state.grid);
  worker.x = pos.x;
  worker.z = pos.z;
  worker.path = null;
  worker.pathIndex = 0;
  worker.pathGridVersion = state.grid.version ?? 0;
  worker.targetTile = { ix, iz };
  worker.stateLabel = "Deliver";
  worker.blackboard ??= {};
  worker.blackboard.intent = "deliver";
  worker.blackboard.taskLock = { state: "deliver", untilSec: Number.POSITIVE_INFINITY };
}

// ---------------------------------------------------------------------------
// Case A — Per-tick intake cap: only warehouseIntakePerTick workers deposit
// per tick; others remain carrying.
// ---------------------------------------------------------------------------
test("M2 queue: only warehouseIntakePerTick workers deposit per tick", () => {
  const state = createInitialGameState({ seed: 2026 });
  const services = createServices(state.world.mapSeed);
  const queueSystem = new WarehouseQueueSystem();

  initEventBus(state);
  state.environment = { isNight: false };
  state.metrics.tick = 100;

  // Build a warehouse at a known location on an empty grass cell.
  const whouse = findOrMakeWarehouseTile(state, 20, 20);

  // Grab 5 workers and drop them all onto the warehouse tile with food carry.
  const workers = state.agents.filter((a) => a.type === "WORKER").slice(0, 5);
  assert.equal(workers.length, 5, "expected at least 5 workers in initial state");
  const foodBefore = Number(state.resources.food ?? 0);
  for (const w of workers) {
    placeWorkerAtTile(w, state, whouse.ix, whouse.iz);
    w.carry = { food: 3, wood: 0, stone: 0, herbs: 0 };
    w.hunger = 1;
    w.rest = 1;
    // Prevent the intent layer from retargeting away on this tick.
    w.blackboard.nextTargetRefreshSec = Number.POSITIVE_INFINITY;
  }

  // Run one tick: WarehouseQueueSystem first (resets tokens), then drive each
  // worker through handleDeliver directly so we don't depend on the state
  // machine's planner choosing "deliver" for every worker.
  queueSystem.update(0.1, state, services);
  for (const w of workers) {
    handleDeliver(w, state, services, 0.1);
  }

  const intakeCap = Number(BALANCE.warehouseIntakePerTick ?? 2);
  const key = `${whouse.ix},${whouse.iz}`;
  const entry = state.warehouseQueues[key];
  assert.ok(entry, "warehouse queue entry should exist after deliver pass");
  assert.equal(
    Number(entry.intakeTokensUsed ?? 0),
    intakeCap,
    `only ${intakeCap} intake tokens should be consumed in one tick`,
  );

  // The queue should contain exactly (workers - intakeCap) workers — the
  // ones that arrived after intake tokens were exhausted. Each queued worker
  // must have skipped unload entirely (still carrying the full 3 food).
  assert.equal(
    entry.queue.length,
    workers.length - intakeCap,
    "queue length should equal workers minus intake cap",
  );
  const queuedFull = workers.filter(
    (w) => entry.queue.includes(w.id) && Number(w.carry.food) === 3,
  ).length;
  assert.equal(
    queuedFull,
    workers.length - intakeCap,
    `${workers.length - intakeCap} queued workers should still carry full 3 food (no unload occurred)`,
  );
  const unloaded = workers.filter(
    (w) => !entry.queue.includes(w.id) && Number(w.carry.food) < 3,
  ).length;
  assert.equal(
    unloaded,
    intakeCap,
    `${intakeCap} workers should have consumed a token and reduced their carry`,
  );

  // Resources should reflect ONLY the intakeCap workers depositing some food.
  const deposited = Number(state.resources.food ?? 0) - foodBefore;
  assert.ok(deposited > 0, "some food should have been deposited");
});

// ---------------------------------------------------------------------------
// Case B — Queue timeout: a worker waiting > warehouseQueueMaxWaitTicks is
// kicked out of the queue, WAREHOUSE_QUEUE_TIMEOUT fires, targetTile = null.
// ---------------------------------------------------------------------------
test("M2 queue: worker exceeding queueMaxWaitTicks times out", () => {
  const state = createInitialGameState({ seed: 4242 });
  const services = createServices(state.world.mapSeed);
  const queueSystem = new WarehouseQueueSystem();

  initEventBus(state);
  state.metrics.tick = 0;

  const whouse = findOrMakeWarehouseTile(state, 25, 25);
  const key = `${whouse.ix},${whouse.iz}`;

  const worker = state.agents.find((a) => a.type === "WORKER");
  assert.ok(worker);
  placeWorkerAtTile(worker, state, whouse.ix, whouse.iz);
  worker.carry = { food: 2, wood: 0, stone: 0, herbs: 0 };

  // Seed the queue with our worker, starting at tick 0.
  state.warehouseQueues = {
    [key]: {
      intakeTokensUsed: 0,
      queue: [worker.id],
      lastResetTick: 0,
    },
  };
  worker.blackboard.queueEnteredTick = 0;

  // Advance well past the wait limit.
  const maxWait = Number(BALANCE.warehouseQueueMaxWaitTicks ?? 120);
  state.metrics.tick = maxWait + 5;

  queueSystem.update(0.1, state, services);

  // Event fired.
  const timeoutEvents = getEventLog(state).filter(
    (e) => e.type === EVENT_TYPES.WAREHOUSE_QUEUE_TIMEOUT,
  );
  assert.equal(timeoutEvents.length, 1, "one WAREHOUSE_QUEUE_TIMEOUT event should fire");
  assert.equal(timeoutEvents[0].entityId, worker.id);
  assert.equal(timeoutEvents[0].detail.tileKey, key);

  // Worker removed from queue and target nulled.
  const entry = state.warehouseQueues[key];
  assert.ok(entry);
  assert.ok(!entry.queue.includes(worker.id), "worker should be removed from queue");
  assert.equal(worker.targetTile, null, "worker.targetTile should be null for re-plan");
  assert.equal(
    Number(worker.blackboard.queueTimeoutTick ?? -1),
    state.metrics.tick,
    "queueTimeoutTick should record the timeout tick",
  );
});

// ---------------------------------------------------------------------------
// Case C — Warehouse demolished: queue entry cleaned up, no crash.
// ---------------------------------------------------------------------------
test("M2 queue: demolished warehouse has its queue entry cleaned up", () => {
  const state = createInitialGameState({ seed: 7777 });
  const services = createServices(state.world.mapSeed);
  const queueSystem = new WarehouseQueueSystem();

  initEventBus(state);
  state.metrics.tick = 50;

  const ix = 30, iz = 30;
  const key = `${ix},${iz}`;
  // Put a warehouse tile down, seed the queue, then demolish it.
  findOrMakeWarehouseTile(state, ix, iz);
  const worker = state.agents.find((a) => a.type === "WORKER");
  state.warehouseQueues = {
    [key]: { intakeTokensUsed: 1, queue: [worker.id], lastResetTick: 49 },
  };
  worker.blackboard ??= {};
  worker.blackboard.queueEnteredTick = 49;

  // Demolish — clear tile back to GRASS.
  setTileAt(state, ix, iz, TILE.GRASS);

  // Should not throw.
  assert.doesNotThrow(() => queueSystem.update(0.1, state, services));

  // Queue entry cleaned up.
  assert.equal(
    state.warehouseQueues[key],
    undefined,
    "queue entry for demolished warehouse should be removed",
  );
});
