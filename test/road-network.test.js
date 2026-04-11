import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RoadNetwork } from "../src/simulation/navigation/RoadNetwork.js";
import { TILE } from "../src/config/constants.js";

function makeGrid(width, height, tiles) {
  return {
    width,
    height,
    tiles: new Uint8Array(tiles),
    tileSize: 1,
    version: 1,
  };
}

// Helper: 5x5 grid with a road connecting two warehouses
//   W R R R W
//   G G G G G
//   G G G G G
//   G G G G G
//   G G G G G
function roadBetweenWarehouses() {
  const w = 5, h = 5;
  const tiles = new Array(w * h).fill(TILE.GRASS);
  tiles[0] = TILE.WAREHOUSE; // (0,0)
  tiles[1] = TILE.ROAD;      // (1,0)
  tiles[2] = TILE.ROAD;      // (2,0)
  tiles[3] = TILE.ROAD;      // (3,0)
  tiles[4] = TILE.WAREHOUSE; // (4,0)
  return makeGrid(w, h, tiles);
}

describe("RoadNetwork", () => {
  it("builds on first access", () => {
    const net = new RoadNetwork();
    const grid = roadBetweenWarehouses();
    net.rebuild(grid);
    assert.equal(net.stats.totalRoadTiles, 5);
    assert.equal(net.stats.componentCount, 1);
    assert.equal(net.stats.warehouseCount, 2);
  });

  it("reports connected warehouses", () => {
    const net = new RoadNetwork();
    const grid = roadBetweenWarehouses();
    assert.ok(net.areConnected(0, 0, 4, 0, grid));
  });

  it("reports disconnected tiles", () => {
    const net = new RoadNetwork();
    const w = 5, h = 1;
    const tiles = [TILE.WAREHOUSE, TILE.ROAD, TILE.GRASS, TILE.ROAD, TILE.WAREHOUSE];
    const grid = makeGrid(w, h, tiles);
    assert.ok(!net.areConnected(0, 0, 4, 0, grid));
    assert.equal(net.stats.componentCount, 2);
  });

  it("connectedWarehouse finds warehouse in same component", () => {
    const net = new RoadNetwork();
    const grid = roadBetweenWarehouses();
    const wIdx = net.connectedWarehouse(2, 0, grid);
    assert.ok(wIdx >= 0);
  });

  it("connectedWarehouse returns -1 for non-road tile", () => {
    const net = new RoadNetwork();
    const grid = roadBetweenWarehouses();
    assert.equal(net.connectedWarehouse(2, 2, grid), -1);
  });

  it("isAdjacentToConnectedRoad checks neighbors", () => {
    const net = new RoadNetwork();
    const grid = roadBetweenWarehouses();
    // (2,1) is GRASS adjacent to (2,0) which is ROAD connected to warehouse
    assert.ok(net.isAdjacentToConnectedRoad(2, 1, grid));
    // (2,3) is too far from any road
    assert.ok(!net.isAdjacentToConnectedRoad(2, 3, grid));
  });

  it("getComponentSize returns correct size", () => {
    const net = new RoadNetwork();
    const grid = roadBetweenWarehouses();
    assert.equal(net.getComponentSize(2, 0, grid), 5);
    assert.equal(net.getComponentSize(2, 2, grid), 0);
  });

  it("caches by grid version", () => {
    const net = new RoadNetwork();
    const grid = roadBetweenWarehouses();
    net.rebuild(grid);
    const v1 = net.stats.totalRoadTiles;
    // Same version — no rebuild
    grid.tiles[10] = TILE.ROAD; // mutate without version bump
    net.rebuild(grid);
    assert.equal(net.stats.totalRoadTiles, v1);
    // Version bump triggers rebuild
    grid.version = 2;
    net.rebuild(grid);
    assert.equal(net.stats.totalRoadTiles, 6);
  });

  it("handles bridge tiles as road network members", () => {
    const net = new RoadNetwork();
    const w = 3, h = 1;
    const tiles = [TILE.WAREHOUSE, TILE.BRIDGE, TILE.ROAD];
    const grid = makeGrid(w, h, tiles);
    assert.ok(net.areConnected(0, 0, 2, 0, grid));
    assert.equal(net.stats.totalRoadTiles, 3);
  });

  it("handles empty grid", () => {
    const net = new RoadNetwork();
    const grid = makeGrid(5, 5, new Array(25).fill(TILE.GRASS));
    net.rebuild(grid);
    assert.equal(net.stats.totalRoadTiles, 0);
    assert.equal(net.stats.componentCount, 0);
  });

  it("handles single road tile", () => {
    const net = new RoadNetwork();
    const tiles = new Array(9).fill(TILE.GRASS);
    tiles[4] = TILE.ROAD;
    const grid = makeGrid(3, 3, tiles);
    assert.equal(net.getComponentSize(1, 1, grid), 1);
    assert.equal(net.connectedWarehouse(1, 1, grid), -1);
  });

  it("multiple components counted correctly", () => {
    const net = new RoadNetwork();
    // Row 0: W R G R W  (2 components)
    const w = 5, h = 1;
    const tiles = [TILE.WAREHOUSE, TILE.ROAD, TILE.GRASS, TILE.ROAD, TILE.WAREHOUSE];
    const grid = makeGrid(w, h, tiles);
    net.rebuild(grid);
    assert.equal(net.stats.componentCount, 2);
    assert.equal(net.getComponentSize(0, 0, grid), 2);
    assert.equal(net.getComponentSize(4, 0, grid), 2);
  });
});
