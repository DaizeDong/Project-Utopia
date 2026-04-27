import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LogisticsSystem } from "../src/simulation/economy/LogisticsSystem.js";
import { RoadNetwork } from "../src/simulation/navigation/RoadNetwork.js";
import { TILE } from "../src/config/constants.js";
import { BALANCE } from "../src/config/balance.js";

function makeGrid(width, height, tileMap = {}) {
  const tiles = new Uint8Array(width * height).fill(TILE.GRASS);
  for (const [key, val] of Object.entries(tileMap)) {
    const [ix, iz] = key.split(",").map(Number);
    tiles[ix + iz * width] = val;
  }
  return { width, height, tiles, tileSize: 1, version: 1 };
}

function makeState(grid) {
  const net = new RoadNetwork();
  return {
    grid,
    _roadNetwork: net,
    metrics: {},
  };
}

describe("LogisticsSystem", () => {
  it("gives bonus to building connected to warehouse via road", () => {
    // W R R F
    const grid = makeGrid(4, 1, {
      "0,0": TILE.WAREHOUSE,
      "1,0": TILE.ROAD,
      "2,0": TILE.ROAD,
      "3,0": TILE.FARM,
    });
    const state = makeState(grid);
    const sys = new LogisticsSystem();
    sys.update(0.1, state);
    const eff = sys.getEfficiency(3, 0);
    assert.equal(eff, BALANCE.roadLogisticsBonus ?? 1.15);
    // v0.8.0 M4: warehouses now participate in the efficiency scan so the
    // deposit code can detect isolated depots; W + F are both "connected".
    assert.equal(sys.stats.connected, 2);
  });

  it("gives neutral efficiency to building adjacent to disconnected road", () => {
    // R G F (road exists but no warehouse)
    const grid = makeGrid(3, 1, {
      "0,0": TILE.ROAD,
      "2,0": TILE.FARM,
    });
    const state = makeState(grid);
    const sys = new LogisticsSystem();
    sys.update(0.1, state);
    // Farm at (2,0) has no road neighbor (road is at 0,0, not adjacent)
    assert.equal(sys.getEfficiency(2, 0), 0.85);
  });

  it("gives isolation penalty to building with no road neighbors", () => {
    // G G G F G G G
    const grid = makeGrid(7, 1, {
      "3,0": TILE.FARM,
    });
    const state = makeState(grid);
    const sys = new LogisticsSystem();
    sys.update(0.1, state);
    assert.equal(sys.getEfficiency(3, 0), 0.85);
    assert.equal(sys.stats.isolated, 1);
  });

  it("caches by grid version", () => {
    const grid = makeGrid(4, 1, {
      "0,0": TILE.WAREHOUSE,
      "1,0": TILE.ROAD,
      "3,0": TILE.FARM,
    });
    const state = makeState(grid);
    const sys = new LogisticsSystem();
    sys.update(0.1, state);
    const eff1 = sys.getEfficiency(3, 0);

    // Mutate without version bump
    grid.tiles[2] = TILE.ROAD;
    sys.update(0.1, state);
    assert.equal(sys.getEfficiency(3, 0), eff1); // cached

    // Bump version
    grid.version = 2;
    sys.update(0.1, state);
    assert.equal(sys.getEfficiency(3, 0), BALANCE.roadLogisticsBonus ?? 1.15);
  });

  it("exposes metrics on state", () => {
    const grid = makeGrid(4, 1, {
      "0,0": TILE.WAREHOUSE,
      "1,0": TILE.ROAD,
      "3,0": TILE.FARM,
    });
    const state = makeState(grid);
    const sys = new LogisticsSystem();
    sys.update(0.1, state);
    assert.ok(state.metrics.logistics.logisticsStats);
    assert.ok(state.metrics.logistics.buildingEfficiency);
  });

  it("handles multiple building types", () => {
    // Use 2D layout so road can bypass buildings:
    // Row 0: W R R R R R L G G Q
    // Row 1: G G G G F G G G G G
    const grid = makeGrid(10, 2, {
      "0,0": TILE.WAREHOUSE,
      "1,0": TILE.ROAD,
      "2,0": TILE.ROAD,
      "3,0": TILE.ROAD,
      "4,0": TILE.ROAD,
      "5,0": TILE.ROAD,
      "6,0": TILE.LUMBER,
      "9,0": TILE.QUARRY,
      "4,1": TILE.FARM,
    });
    const state = makeState(grid);
    const sys = new LogisticsSystem();
    sys.update(0.1, state);
    // Farm at (4,1) adj to road(4,0) connected to warehouse
    assert.equal(sys.getEfficiency(4, 1), BALANCE.roadLogisticsBonus ?? 1.15);
    // Lumber at (6,0) adj to road(5,0) connected to warehouse
    assert.equal(sys.getEfficiency(6, 0), BALANCE.roadLogisticsBonus ?? 1.15);
    // Quarry at (9,0) is isolated
    assert.equal(sys.getEfficiency(9, 0), 0.85);
  });

  it("returns 1.0 for non-production tiles", () => {
    const sys = new LogisticsSystem();
    assert.equal(sys.getEfficiency(99, 99), 1.0);
  });
});
