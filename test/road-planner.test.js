import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planRoadConnections, roadPlansToSteps } from "../src/simulation/ai/colony/RoadPlanner.js";
import { RoadNetwork } from "../src/simulation/navigation/RoadNetwork.js";
import { TILE } from "../src/config/constants.js";

function makeGrid(width, height, tileMap = {}) {
  const tiles = new Uint8Array(width * height).fill(TILE.GRASS);
  for (const [key, val] of Object.entries(tileMap)) {
    const [ix, iz] = key.split(",").map(Number);
    tiles[ix + iz * width] = val;
  }
  return { width, height, tiles, tileSize: 1, version: 1 };
}

describe("RoadPlanner", () => {
  it("plans road from disconnected farm to warehouse", () => {
    // 10x1 grid: WAREHOUSE at 0, GRASS 1-8, FARM at 9
    const grid = makeGrid(10, 1, {
      "0,0": TILE.WAREHOUSE,
      "9,0": TILE.FARM,
    });
    const net = new RoadNetwork();
    const plans = planRoadConnections(grid, net);
    assert.ok(plans.length > 0, "should plan at least one road segment");
    assert.ok(plans[0].tilesNeeded > 0);
    assert.ok(plans[0].path.length > 0);
  });

  it("returns empty plans when all buildings are connected", () => {
    // W R R F — all connected
    const grid = makeGrid(4, 1, {
      "0,0": TILE.WAREHOUSE,
      "1,0": TILE.ROAD,
      "2,0": TILE.ROAD,
      "3,0": TILE.FARM,
    });
    const net = new RoadNetwork();
    const plans = planRoadConnections(grid, net);
    // Farm at (3,0) is adjacent to road at (2,0) which connects to warehouse
    assert.equal(plans.length, 0);
  });

  it("returns empty plans when no warehouses exist", () => {
    const grid = makeGrid(5, 1, { "2,0": TILE.FARM });
    const net = new RoadNetwork();
    const plans = planRoadConnections(grid, net);
    assert.equal(plans.length, 0);
  });

  it("plans are sorted by fewest tiles needed", () => {
    // 10x3: warehouse at (0,1), farm at (2,1) distance=2, lumber at (8,1) distance=8
    const grid = makeGrid(10, 3, {
      "0,1": TILE.WAREHOUSE,
      "2,1": TILE.FARM,
      "8,1": TILE.LUMBER,
    });
    const net = new RoadNetwork();
    const plans = planRoadConnections(grid, net);
    assert.ok(plans.length >= 2);
    assert.ok(plans[0].tilesNeeded <= plans[1].tilesNeeded);
  });

  it("roadPlansToSteps converts plans to build steps", () => {
    const grid = makeGrid(5, 1, {
      "0,0": TILE.WAREHOUSE,
      "4,0": TILE.FARM,
    });
    const net = new RoadNetwork();
    const plans = planRoadConnections(grid, net);
    const steps = roadPlansToSteps(plans);
    assert.ok(steps.length > 0);
    assert.equal(steps[0].type, "road");
    assert.ok(typeof steps[0].ix === "number");
    assert.ok(typeof steps[0].iz === "number");
    assert.ok(steps[0].reason.includes("Connect"));
  });

  it("roadPlansToSteps respects maxSteps", () => {
    const grid = makeGrid(20, 1, {
      "0,0": TILE.WAREHOUSE,
      "19,0": TILE.FARM,
    });
    const net = new RoadNetwork();
    const plans = planRoadConnections(grid, net);
    const steps = roadPlansToSteps(plans, 3);
    assert.ok(steps.length <= 3);
  });

  it("uses existing roads to reduce cost", () => {
    // W R R G G G F — road already covers first 2 tiles
    const grid = makeGrid(7, 1, {
      "0,0": TILE.WAREHOUSE,
      "1,0": TILE.ROAD,
      "2,0": TILE.ROAD,
      "6,0": TILE.FARM,
    });
    const net = new RoadNetwork();
    const plans = planRoadConnections(grid, net);
    if (plans.length > 0) {
      // Should only need to build grass tiles, not re-build existing roads
      for (const step of plans[0].path) {
        const t = grid.tiles[step.ix + step.iz * grid.width];
        assert.equal(t, TILE.GRASS, `step at (${step.ix},${step.iz}) should be GRASS`);
      }
    }
  });

  it("handles 2D grid layout", () => {
    // 5x5 grid: warehouse at (0,0), farm at (4,4)
    const grid = makeGrid(5, 5, {
      "0,0": TILE.WAREHOUSE,
      "4,4": TILE.FARM,
    });
    const net = new RoadNetwork();
    const plans = planRoadConnections(grid, net);
    assert.ok(plans.length > 0);
    assert.ok(plans[0].tilesNeeded >= 7); // Manhattan distance 8, minus endpoints
  });

  it("handles multiple disconnected buildings", () => {
    const grid = makeGrid(10, 3, {
      "5,1": TILE.WAREHOUSE,
      "0,0": TILE.FARM,
      "9,2": TILE.LUMBER,
      "0,2": TILE.QUARRY,
    });
    const net = new RoadNetwork();
    const plans = planRoadConnections(grid, net);
    assert.ok(plans.length >= 3, `expected >= 3 plans, got ${plans.length}`);
  });
});
