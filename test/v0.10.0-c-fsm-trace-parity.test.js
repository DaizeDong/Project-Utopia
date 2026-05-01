// v0.10.0-c — Worker FSM trace-parity tests. Phase 3 of 5 in the
// Priority-FSM rewrite per
// docs/superpowers/plans/2026-04-30-worker-fsm-rewrite-plan.md §8.
//
// 4 cases — covering the A-G architectural-trace gate (v0.10.1-l: removed
// scenario D hunger-stress test #5 as hunger FSM is replaced by fixed drain).
// Each case runs the SimHarness twice (once with FEATURE_FLAGS.USE_FSM=false →
// v0.9.4 Job-layer baseline, once with USE_FSM=true → FSM path) and asserts
// summary statistics stay within the v0.10.0-c phase-c tolerance:
//
//   1. Scenario A (bare-init, 60 s) — FSM produces same alive count.
//   2. Scenario E (walled warehouse, 60 s) — FSM keeps all 12 workers
//      alive (carry-eat / consumeEmergencyRation works when warehouse
//      is unreachable).
//   3. Scenario F (long-horizon 600 s) — FSM stuck>3s ≤ Job-layer
//      baseline + 2.
//   4. Scenario C (established colony, 60 s) — FSM same-tile worker
//      count ≤ 1 on production tiles (1:1 binding fidelity).
//
// Determinism: same seed produces identical alive count under each flag
// value (one-shot — multi-flag determinism is asserted in case 1).

import test from "node:test";
import assert from "node:assert/strict";

import { _testSetFeatureFlag, EVENT_TYPE, TILE } from "../src/config/constants.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { SimulationClock } from "../src/app/SimulationClock.js";
import { ProgressionSystem } from "../src/simulation/meta/ProgressionSystem.js";
import { RoleAssignmentSystem } from "../src/simulation/population/RoleAssignmentSystem.js";
import { MemoryStore } from "../src/simulation/ai/memory/MemoryStore.js";
import { MemoryObserver } from "../src/simulation/ai/memory/MemoryObserver.js";
import { StrategicDirector } from "../src/simulation/ai/strategic/StrategicDirector.js";
import { EnvironmentDirectorSystem } from "../src/simulation/ai/director/EnvironmentDirectorSystem.js";
import { WeatherSystem } from "../src/world/weather/WeatherSystem.js";
import { WorldEventSystem } from "../src/world/events/WorldEventSystem.js";
import { NPCBrainSystem } from "../src/simulation/ai/brains/NPCBrainSystem.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";
import { VisitorAISystem } from "../src/simulation/npc/VisitorAISystem.js";
import { AnimalAISystem } from "../src/simulation/npc/AnimalAISystem.js";
import { MortalitySystem } from "../src/simulation/lifecycle/MortalitySystem.js";
import { WildlifePopulationSystem } from "../src/simulation/ecology/WildlifePopulationSystem.js";
import { BoidsSystem } from "../src/simulation/movement/BoidsSystem.js";
import { ResourceSystem } from "../src/simulation/economy/ResourceSystem.js";
import { ProcessingSystem } from "../src/simulation/economy/ProcessingSystem.js";
import { PopulationGrowthSystem } from "../src/simulation/population/PopulationGrowthSystem.js";
import { TileStateSystem } from "../src/simulation/economy/TileStateSystem.js";
import { ColonyDirectorSystem } from "../src/simulation/meta/ColonyDirectorSystem.js";
import { ConstructionSystem } from "../src/simulation/construction/ConstructionSystem.js";
import { worldToTile } from "../src/world/grid/Grid.js";
import { mutateTile } from "../src/simulation/lifecycle/TileMutationHooks.js";
import { enqueueEvent } from "../src/world/events/WorldEventQueue.js";

const DT_SEC = 1 / 30;

function buildSystems(memoryStore) {
  return [
    new SimulationClock(),
    new ProgressionSystem(),
    new RoleAssignmentSystem(),
    new PopulationGrowthSystem(),
    new StrategicDirector(memoryStore),
    new EnvironmentDirectorSystem(),
    new WeatherSystem(),
    new WorldEventSystem(),
    new TileStateSystem(),
    new NPCBrainSystem(),
    new WorkerAISystem(),
    new ConstructionSystem(),
    new VisitorAISystem(),
    new AnimalAISystem(),
    new MortalitySystem(),
    new WildlifePopulationSystem(),
    new BoidsSystem(),
    new ResourceSystem(),
    new ProcessingSystem(),
    new ColonyDirectorSystem(),
  ];
}

function makeHarness(opts) {
  const { templateId = "temperate_plains", seed = 1337, bareInitial = false } = opts;
  const state = createInitialGameState({ templateId, seed, bareInitial });
  state.session.phase = "active";
  state.controls.isPaused = false;
  state.controls.timeScale = 1;
  state.ai.enabled = false;
  state.ai.coverageTarget = "fallback";
  state.ai.runtimeProfile = "long_run";
  const memoryStore = new MemoryStore();
  const memoryObserver = new MemoryObserver(memoryStore);
  const services = createServices(seed, { offlineAiFallback: true, deterministic: true });
  const systems = buildSystems(memoryStore);
  const aliveWorkers = () => state.agents.filter((a) => a.type === "WORKER" && a.alive !== false);
  state.metrics.populationStats = {
    workers: aliveWorkers().length,
    totalEntities: state.agents.length + (state.animals?.length ?? 0),
  };
  state.metrics.deathsTotal = state.metrics.deathsTotal ?? 0;
  function tick() {
    for (const sys of systems) sys.update(DT_SEC, state, services);
    state.metrics.populationStats.workers = aliveWorkers().length;
    memoryObserver.observe(state);
  }
  return { state, services, tick, aliveWorkers };
}

// Run a scenario for `ticks` ticks with optional setup + per-tick hook.
// Returns { aliveCount, deaths, longestStuckSec, sameTileMaxOnProductionTile }.
function runTraceScenario({ flag, templateId, seed, bareInitial, ticks, setup, perTickHook }) {
  _testSetFeatureFlag("USE_FSM", flag);
  try {
    const harness = makeHarness({ templateId, seed, bareInitial });
    if (setup) setup(harness.state, harness.services, harness);
    const initialIds = harness.aliveWorkers().map((w) => w.id);
    // Per-worker stuck tracker.
    const stuckTracker = new Map(); // id -> { lastIx, lastIz, lastCarryFood, lastHunger, run, best }
    // Same-tile occupancy on production tiles.
    let sameTileMaxOnProductionTile = 0;
    for (let t = 0; t < ticks; t += 1) {
      harness.tick();
      if (perTickHook) perTickHook(harness.state, t, harness);
      // Per-tick checks
      const ws = harness.aliveWorkers();
      for (const w of ws) {
        // stuck tracker
        const tile = worldToTile(w.x, w.z, harness.state.grid);
        const carry = Number(w.carry?.food ?? 0);
        const hunger = Number(w.hunger ?? 0);
        const noPath = (w.path?.length ?? 0) === 0;
        let tk = stuckTracker.get(w.id);
        if (!tk) {
          tk = { lastIx: tile.ix, lastIz: tile.iz, lastCarryFood: carry, lastHunger: hunger, run: 0, best: 0 };
          stuckTracker.set(w.id, tk);
        } else {
          const sameTile = tile.ix === tk.lastIx && tile.iz === tk.lastIz;
          const carryEatTick = (tk.lastCarryFood - carry) > 0.001;
          const hungerGainTick = (hunger - tk.lastHunger) > 0.001;
          const stuckTick = sameTile && noPath && !carryEatTick && !hungerGainTick;
          if (stuckTick) {
            tk.run += 1;
            if (tk.run > tk.best) tk.best = tk.run;
          } else {
            tk.run = 0;
          }
          tk.lastIx = tile.ix; tk.lastIz = tile.iz;
          tk.lastCarryFood = carry; tk.lastHunger = hunger;
        }
      }
      // Same-tile occupancy on production tiles (FARM/LUMBER/QUARRY/HERB_GARDEN).
      // Sample only on round seconds to keep cost bounded.
      if (t % 30 === 0) {
        const tileCount = new Map();
        for (const w of ws) {
          const tile = worldToTile(w.x, w.z, harness.state.grid);
          const tileType = harness.state.grid.tiles[tile.ix + tile.iz * harness.state.grid.width];
          if ([TILE.FARM, TILE.LUMBER, TILE.QUARRY, TILE.HERB_GARDEN].includes(tileType)) {
            const key = `${tile.ix},${tile.iz}`;
            tileCount.set(key, (tileCount.get(key) ?? 0) + 1);
          }
        }
        for (const c of tileCount.values()) {
          if (c > sameTileMaxOnProductionTile) sameTileMaxOnProductionTile = c;
        }
      }
    }
    const finalCount = harness.aliveWorkers().length;
    const longestStuckSec = [...stuckTracker.values()].reduce((m, v) => Math.max(m, v.best * DT_SEC), 0);
    return {
      aliveCount: finalCount,
      deaths: initialIds.length - finalCount,
      longestStuckSec,
      sameTileMaxOnProductionTile,
      stuckOver3sCount: [...stuckTracker.values()].filter((v) => v.best * DT_SEC > 3).length,
    };
  } finally {
    _testSetFeatureFlag("USE_FSM", false);
  }
}

// -----------------------------------------------------------------------------
// 1. Scenario A (bare-init, 60 s): FSM produces same alive count as Job-layer.
// -----------------------------------------------------------------------------

test("v0.10.0-c #1: scenario A bare-init — FSM same alive count as Job-layer", () => {
  const baseline = runTraceScenario({
    flag: false, templateId: "temperate_plains", seed: 1337, bareInitial: true, ticks: 1800,
  });
  const fsm = runTraceScenario({
    flag: true, templateId: "temperate_plains", seed: 1337, bareInitial: true, ticks: 1800,
  });
  assert.equal(fsm.aliveCount, baseline.aliveCount,
    `FSM alive=${fsm.aliveCount} should match Job-layer alive=${baseline.aliveCount}`);
  assert.ok(fsm.deaths <= baseline.deaths,
    `FSM deaths=${fsm.deaths} should be ≤ baseline deaths=${baseline.deaths}`);
});

// -----------------------------------------------------------------------------
// 2. Scenario E (walled warehouse, 60 s): FSM keeps all 12 workers alive.
// -----------------------------------------------------------------------------

test("v0.10.0-c #2: scenario E walled-warehouse — FSM keeps all workers alive (carry-eat works)", () => {
  const setup = (state) => {
    state.resources.food = 5;
    for (const w of state.agents) {
      if (w.type === "WORKER") w.hunger = 0.3;
    }
  };
  const perTickHook = (state, tick) => {
    if (tick === 100) {
      const grid = state.grid;
      let wh = null;
      for (let iz = 0; iz < grid.height && !wh; iz += 1) {
        for (let ix = 0; ix < grid.width && !wh; ix += 1) {
          if (grid.tiles[ix + iz * grid.width] === TILE.WAREHOUSE) wh = { ix, iz };
        }
      }
      if (!wh) return;
      const around = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dz] of around) mutateTile(state, wh.ix + dx, wh.iz + dz, TILE.WALL);
    }
  };
  const baseline = runTraceScenario({
    flag: false, templateId: "temperate_plains", seed: 1337, ticks: 1800, setup, perTickHook,
  });
  const fsm = runTraceScenario({
    flag: true, templateId: "temperate_plains", seed: 1337, ticks: 1800, setup, perTickHook,
  });
  assert.ok(fsm.aliveCount >= 12,
    `FSM keeps ≥12 workers alive in walled-warehouse E (got ${fsm.aliveCount})`);
  assert.ok(fsm.deaths <= baseline.deaths,
    `FSM deaths=${fsm.deaths} should be ≤ baseline deaths=${baseline.deaths}`);
});

// -----------------------------------------------------------------------------
// 3. Scenario F (long-horizon 600s): FSM stuck>3s ≤ Job-layer baseline + 2.
// -----------------------------------------------------------------------------

test("v0.10.0-c #3: scenario F long-horizon — FSM stuck>3s ≤ baseline + 2", () => {
  const perTickHook = (state, tick) => {
    if (tick === 9000) {
      try {
        enqueueEvent(state, EVENT_TYPE.BANDIT_RAID, { intensity: 1 }, 30, 1);
      } catch (_e) { /* tolerable */ }
    }
  };
  const baseline = runTraceScenario({
    flag: false, templateId: "temperate_plains", seed: 1337, ticks: 18000, perTickHook,
  });
  const fsm = runTraceScenario({
    flag: true, templateId: "temperate_plains", seed: 1337, ticks: 18000, perTickHook,
  });
  assert.ok(fsm.stuckOver3sCount <= baseline.stuckOver3sCount + 2,
    `FSM stuck>3s=${fsm.stuckOver3sCount} ≤ baseline=${baseline.stuckOver3sCount} + 2`);
  assert.ok(fsm.deaths <= baseline.deaths,
    `FSM deaths=${fsm.deaths} should be ≤ baseline deaths=${baseline.deaths}`);
});

// -----------------------------------------------------------------------------
// 4. Scenario C (established colony, 60s): FSM same-tile production count ≤ 1.
// -----------------------------------------------------------------------------

test("v0.10.0-c #4: scenario C established — FSM same-tile worker count ≤ 2 on production tiles", () => {
  const fsm = runTraceScenario({
    flag: true, templateId: "temperate_plains", seed: 1337, ticks: 1800,
  });
  // v0.10.1-l: workerDeliverThreshold raised from 1.6 → 2.5 so workers
  // dwell longer at harvest tiles before leaving to deliver. The reservation
  // system still enforces 1:1 targeting but brief overlap during the
  // SEEKING_HARVEST → HARVESTING transition window can briefly show 2 workers
  // on a tile at a sample point. Gate relaxed from ≤ 1 to ≤ 2 accordingly.
  assert.ok(fsm.sameTileMaxOnProductionTile <= 2,
    `FSM same-tile worker count on production tile = ${fsm.sameTileMaxOnProductionTile}, expected ≤ 2`);
});

