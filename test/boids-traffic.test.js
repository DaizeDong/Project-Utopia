import test from "node:test";
import assert from "node:assert/strict";

import { TILE } from "../src/config/constants.js";
import { BoidsSystem } from "../src/simulation/movement/BoidsSystem.js";

function createGrid(width, height, fill = TILE.GRASS) {
  const tiles = new Uint8Array(width * height);
  tiles.fill(fill);
  return { width, height, tileSize: 1, tiles, version: 1 };
}

function createWorker(id, x, z) {
  return {
    id,
    type: "WORKER",
    groupId: "workers",
    x,
    z,
    vx: 0,
    vz: 0,
    desiredVel: { x: 0, z: 0 },
    alive: true,
  };
}

test("BoidsSystem publishes stable traffic hotspot metrics", () => {
  const grid = createGrid(6, 6, TILE.GRASS);
  const state = {
    grid,
    agents: [
      createWorker("w1", 0, 0),
      createWorker("w2", 0, 0),
      createWorker("w3", 0, 0),
      createWorker("w4", 0, 0),
    ],
    animals: [],
    metrics: { timeSec: 0 },
    debug: {},
  };

  const system = new BoidsSystem();

  system.update(0.1, state);

  assert.ok(state.metrics.traffic);
  assert.equal(state.metrics.traffic.hotspotCount >= 1, true);
  assert.equal(Number(state.metrics.traffic.penaltyByKey?.["3,3"] ?? 1) > 1, true);
  assert.equal(Number(state.debug.boids?.congestionHotspots ?? 0) >= 1, true);
  const firstVersion = Number(state.metrics.traffic.version ?? 0);

  state.metrics.timeSec = 0.6;
  system.update(0.1, state);

  assert.equal(Number(state.metrics.traffic.version ?? 0), firstVersion);

  state.agents[3].x = 2.2;
  state.agents[3].z = 2.2;
  state.metrics.timeSec = 1.2;
  system.update(0.1, state);

  assert.notEqual(Number(state.metrics.traffic.version ?? 0), firstVersion);
});
