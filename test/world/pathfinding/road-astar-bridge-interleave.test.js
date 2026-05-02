// R6 PG-bridge-and-water — Finding 2 regression: roadAStar must be able
// to cross a single-tile water gap by emitting a `type: 'bridge'` step
// where the path crosses water, instead of returning null and silently
// dropping the building from `findDisconnectedBuildings`.

import test from "node:test";
import assert from "node:assert/strict";

import {
  planRoadConnections,
  roadPlansToSteps,
} from "../../../src/simulation/ai/colony/RoadPlanner.js";
import { RoadNetwork } from "../../../src/simulation/navigation/RoadNetwork.js";
import { TILE } from "../../../src/config/constants.js";

function makeGrid(width, height, tileMap = {}) {
  const tiles = new Uint8Array(width * height).fill(TILE.GRASS);
  for (const [key, val] of Object.entries(tileMap)) {
    const [ix, iz] = key.split(",").map(Number);
    tiles[ix + iz * width] = val;
  }
  return { width, height, tiles, tileSize: 1, version: 1 };
}

test("planRoadConnections returns a non-null plan across a single water tile gap", () => {
  // 7x1 layout: WAREHOUSE at (0,0), GRASS, GRASS, WATER, GRASS, GRASS, FARM at (6,0).
  // The only path from FARM → WAREHOUSE crosses (3,0) which is water; pre-fix
  // roadAStar returned null and the FARM was silently dropped.
  const grid = makeGrid(7, 1, {
    "0,0": TILE.WAREHOUSE,
    "3,0": TILE.WATER,
    "6,0": TILE.FARM,
  });
  const net = new RoadNetwork();
  const plans = planRoadConnections(grid, net);
  assert.ok(plans.length >= 1, "at least one road plan should reach the FARM");
  const plan = plans[0];
  assert.ok(plan.path.length > 0, "plan path should be non-empty");

  // Exactly one step should be type=bridge — the (3,0) water tile.
  const bridgeSteps = plan.path.filter((s) => s.type === "bridge");
  const roadSteps = plan.path.filter((s) => s.type === "road");
  assert.equal(bridgeSteps.length, 1, "exactly one bridge step on the water gap");
  assert.equal(bridgeSteps[0].ix, 3);
  assert.equal(bridgeSteps[0].iz, 0);
  assert.ok(roadSteps.length >= 1, "road steps cover the land tiles");

  // roadPlansToSteps should propagate the bridge step type to the build queue.
  const steps = roadPlansToSteps(plans);
  const bridgeBuildSteps = steps.filter((s) => s.type === "bridge");
  assert.equal(bridgeBuildSteps.length, 1, "one bridge build step emitted");
  assert.equal(bridgeBuildSteps[0].ix, 3);
  assert.equal(bridgeBuildSteps[0].iz, 0);
});

test("roadAStar prefers the all-land detour when one exists (water cost is punitive)", () => {
  // 5x3 layout: WAREHOUSE at (0,1), FARM at (4,1). A WATER cell sits at
  // (2,1) but row iz=0 and iz=2 are entirely GRASS — A* should detour
  // around the water rather than emit a bridge step.
  const grid = makeGrid(5, 3, {
    "0,1": TILE.WAREHOUSE,
    "2,1": TILE.WATER,
    "4,1": TILE.FARM,
  });
  const net = new RoadNetwork();
  const plans = planRoadConnections(grid, net);
  assert.ok(plans.length >= 1);
  const bridgeSteps = plans[0].path.filter((s) => s.type === "bridge");
  assert.equal(
    bridgeSteps.length,
    0,
    "land detour exists; no bridge step should be emitted",
  );
});
