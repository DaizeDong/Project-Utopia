import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { followPath } from "../src/simulation/navigation/Navigation.js";
import { LogisticsSystem } from "../src/simulation/economy/LogisticsSystem.js";
import { TILE } from "../src/config/constants.js";
import { BALANCE } from "../src/config/balance.js";

/**
 * Tests for Living World v0.8.0 Phase 1 / M4:
 *   - Road compounding (per-step stacking on consecutive road/bridge tiles)
 *   - Isolation deposit penalty (slower unload at disconnected warehouses)
 */

function makeGrid(width, height, tileMap = {}) {
  const tiles = new Uint8Array(width * height).fill(TILE.GRASS);
  for (const [key, val] of Object.entries(tileMap)) {
    const [ix, iz] = key.split(",").map(Number);
    tiles[ix + iz * width] = val;
  }
  return {
    width,
    height,
    tiles,
    tileSize: 1,
    version: 1,
    tileState: new Map(),
  };
}

function makeState(grid) {
  return {
    grid,
    metrics: { timeSec: 0, tick: 0 },
    weather: {
      moveCostMultiplier: 1,
      farmProductionMultiplier: 1,
      lumberProductionMultiplier: 1,
    },
  };
}

function worldCoordsFor(ix, iz, grid) {
  // Inverse of tileToWorld: x = (ix - w/2 + 0.5) * tileSize
  return {
    x: (ix - grid.width / 2 + 0.5) * grid.tileSize,
    z: (iz - grid.height / 2 + 0.5) * grid.tileSize,
  };
}

function makeWorker(ix, iz, grid, path) {
  const wp = worldCoordsFor(ix, iz, grid);
  return {
    id: "w1",
    type: "WORKER",
    x: wp.x,
    z: wp.z,
    path,
    pathIndex: 0,
    blackboard: {},
    preferences: {},
  };
}

describe("M4 road compounding — speed stack", () => {
  it("worker on a road tile increments roadStep and grows bonus", () => {
    // Road spans (0..4, 0) — worker sitting on (1,0), aiming at (2,0)
    const tileMap = {};
    for (let i = 0; i <= 4; i++) tileMap[`${i},0`] = TILE.ROAD;
    const grid = makeGrid(6, 1, tileMap);
    const state = makeState(grid);
    const worker = makeWorker(1, 0, grid, [{ ix: 2, iz: 0 }]);

    // First on-road step — roadStep goes from 0 to 1
    followPath(worker, state, 0.016);
    assert.equal(worker.blackboard.roadStep, 1, "roadStep should increment on first road tick");

    // Move slightly (stay on same tile conceptually), call again — roadStep keeps incrementing
    followPath(worker, state, 0.016);
    assert.equal(worker.blackboard.roadStep, 2);

    followPath(worker, state, 0.016);
    assert.equal(worker.blackboard.roadStep, 3);
  });

  it("worker stepping off road resets roadStep to 0", () => {
    // (0,0) ROAD, (1,0) GRASS
    const grid = makeGrid(4, 1, { "0,0": TILE.ROAD });
    const state = makeState(grid);
    const worker = makeWorker(0, 0, grid, [{ ix: 1, iz: 0 }]);

    followPath(worker, state, 0.016);
    assert.ok(worker.blackboard.roadStep >= 1, "accrued at least one step on road");

    // Teleport the worker to the off-road tile and step again
    const off = worldCoordsFor(1, 0, grid);
    worker.x = off.x;
    worker.z = off.z;
    followPath(worker, state, 0.016);
    assert.equal(worker.blackboard.roadStep, 0, "roadStep resets when off road/bridge");
  });

  it("bonus caps at roadStackStepCap (no unbounded growth)", () => {
    // Long road
    const tileMap = {};
    for (let i = 0; i <= 9; i++) tileMap[`${i},0`] = TILE.ROAD;
    const grid = makeGrid(10, 1, tileMap);
    const state = makeState(grid);
    const worker = makeWorker(1, 0, grid, [{ ix: 2, iz: 0 }]);

    // Tick many times on road
    for (let i = 0; i < 50; i++) {
      followPath(worker, state, 0.016);
    }

    const cap = BALANCE.roadStackStepCap;
    assert.ok(
      worker.blackboard.roadStep <= cap,
      `roadStep (${worker.blackboard.roadStep}) should not exceed cap (${cap})`,
    );
  });

  it("road speed bonus with stacking is strictly greater than base road bonus", () => {
    // Long road, accrued stack
    const tileMap = {};
    for (let i = 0; i <= 9; i++) tileMap[`${i},0`] = TILE.ROAD;
    const grid = makeGrid(10, 1, tileMap);
    const state = makeState(grid);

    // Baseline worker: fresh, no stacking yet, but on road
    const fresh = makeWorker(1, 0, grid, [{ ix: 2, iz: 0 }]);
    const firstStep = followPath(fresh, state, 0.016);
    const speedFresh = Math.hypot(firstStep.desired.x, firstStep.desired.z);

    // Stacked worker: same tile but pre-loaded stack
    const stacked = makeWorker(1, 0, grid, [{ ix: 2, iz: 0 }]);
    stacked.blackboard.roadStep = BALANCE.roadStackStepCap;
    const stackedStep = followPath(stacked, state, 0.016);
    const speedStacked = Math.hypot(stackedStep.desired.x, stackedStep.desired.z);

    assert.ok(
      speedStacked > speedFresh,
      `stacked speed (${speedStacked}) should exceed fresh speed (${speedFresh})`,
    );
  });

  it("bridge tiles count toward road stacking", () => {
    const grid = makeGrid(4, 1, { "0,0": TILE.BRIDGE, "1,0": TILE.BRIDGE });
    const state = makeState(grid);
    const worker = makeWorker(0, 0, grid, [{ ix: 1, iz: 0 }]);

    followPath(worker, state, 0.016);
    assert.ok(
      (worker.blackboard.roadStep ?? 0) >= 1,
      "bridge tiles should also accrue roadStep",
    );
  });
});

describe("M4 isolation deposit penalty", () => {
  it("LogisticsSystem exposes isolationDepositPenalty on state.metrics.logistics", () => {
    const grid = makeGrid(3, 1, { "0,0": TILE.WAREHOUSE });
    const state = {
      grid,
      metrics: {},
    };
    const sys = new LogisticsSystem();
    sys.update(0.1, state);
    assert.equal(
      state.metrics.logistics.isolationDepositPenalty,
      BALANCE.isolationDepositPenalty,
      "isolationDepositPenalty should be exposed on state.metrics.logistics",
    );
  });

  it("BALANCE.isolationDepositPenalty is a sane value below 1", () => {
    const v = Number(BALANCE.isolationDepositPenalty);
    assert.ok(Number.isFinite(v), "penalty must be a finite number");
    assert.ok(v > 0 && v < 1, `penalty (${v}) should be in (0,1)`);
  });
});
