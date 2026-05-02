// R6 PG-bridge-and-water — Finding 1 regression: a BUILDER standing on
// the shore must complete a `bridge` blueprint placed on an adjacent water
// tile. Pre-fix the BUILDER cycled IDLE↔SEEKING_BUILD forever because A*
// returned null for the impassable WATER goal tile and `arrived()` strict
// equality refused to count the shore as "at" the blueprint.
//
// Fixture is a tiny hand-stamped grid with a strait of WATER along iz=4
// flanked by GRASS rows at iz=3 and iz=5, plus a WAREHOUSE so the
// fallback economy doesn't crash. Place a `bridge` blueprint at (4,4) and
// drop a BUILDER on the shore at (3,4); after a few simulation seconds
// the tile should mutate to TILE.BRIDGE.

import test from "node:test";
import assert from "node:assert/strict";

import { BuildSystem } from "../../src/simulation/construction/BuildSystem.js";
import { ConstructionSystem } from "../../src/simulation/construction/ConstructionSystem.js";
import { createInitialGameState } from "../../src/entities/EntityFactory.js";
import { createServices } from "../../src/app/createServices.js";
import { ROLE, TILE } from "../../src/config/constants.js";
import { WorkerAISystem } from "../../src/simulation/npc/WorkerAISystem.js";
import { setTile, tileToWorld } from "../../src/world/grid/Grid.js";

test("BUILDER on shore completes a bridge blueprint placed on adjacent water", () => {
  const state = createInitialGameState({ seed: 4242, bareInitial: true });
  const services = createServices(state.world.mapSeed);
  const buildSystem = new BuildSystem();
  const workerSystem = new WorkerAISystem();
  const constructionSystem = new ConstructionSystem();

  state.session ??= {};
  state.session.phase = "active";
  state.resources.wood = 99;
  state.resources.stone = 99;
  state.resources.food = 99;

  // Hand-stamp a small water strait at iz=4 with grass on both shores.
  for (let ix = 2; ix <= 6; ix += 1) {
    setTile(state.grid, ix, 3, TILE.GRASS);
    setTile(state.grid, ix, 4, TILE.WATER);
    setTile(state.grid, ix, 5, TILE.GRASS);
  }
  // Place a warehouse on shore so any bootstrap warehouse-required code
  // path doesn't bite (economy not under test here).
  setTile(state.grid, 6, 3, TILE.WAREHOUSE);
  state.buildings = { ...(state.buildings ?? {}), warehouses: 1 };

  // Place the bridge blueprint at the water tile (4,4).
  const placed = buildSystem.placeToolAt(state, "bridge", 4, 4);
  assert.equal(placed.ok, true, "bridge blueprint placement should succeed");
  assert.equal(placed.phase, "blueprint");
  // Tile is still water — blueprint mode.
  const tileIdx = 4 + 4 * state.grid.width;
  assert.equal(state.grid.tiles[tileIdx], TILE.WATER, "tile remains WATER until completion");
  assert.ok(state.constructionSites.length >= 1);

  // Promote a worker to BUILDER and stand them on the shore tile (3,4).
  const builder = state.agents.find((a) => a.type === "WORKER");
  assert.ok(builder, "expected at least one worker");
  builder.role = ROLE.BUILDER;
  const shorePos = tileToWorld(3, 4, state.grid);
  builder.x = shorePos.x;
  builder.z = shorePos.z;
  builder.hunger = 1.0;
  builder.rest = 1.0;
  builder.morale = 1.0;
  builder.path = null;
  builder.targetTile = null;
  builder.pathIndex = 0;
  builder.pathGridVersion = -1;
  builder.blackboard ??= {};
  builder.blackboard.fsm = {
    state: "idle",
    previousState: null,
    changedAtSec: 0,
    reason: "test-bootstrap",
    history: [],
    path: [],
  };

  // Drive the simulation. With workTotalSec=3.5 for bridges, 30 sim seconds
  // is generous — the BUILDER is already on the stand-on tile so they
  // should start applying work on the first tick after FSM dispatch.
  state.metrics.timeSec = 0;
  state.metrics.tick = 0;
  const dt = 0.5;
  let totalSimSec = 0;
  for (let i = 0; i < 240; i += 1) {
    state.metrics.timeSec = totalSimSec;
    state.metrics.tick += 1;
    workerSystem.update(dt, state, services);
    constructionSystem.update(dt, state);
    totalSimSec += dt;
    if (state.grid.tiles[tileIdx] === TILE.BRIDGE) break;
  }

  assert.equal(
    state.grid.tiles[tileIdx],
    TILE.BRIDGE,
    `bridge should complete from the shore within 120 sim sec (got tile ${state.grid.tiles[tileIdx]} at sim ${totalSimSec}s)`,
  );
  assert.equal(state.constructionSites.length, 0, "site cleared on completion");
});

test("getBuildStandTile returns shore neighbour for a water site, site itself for a land site", async () => {
  const { getBuildStandTile } = await import(
    "../../src/simulation/construction/ConstructionSites.js"
  );
  const state = createInitialGameState({ seed: 4242, bareInitial: true });
  // Land case: any GRASS tile.
  setTile(state.grid, 10, 10, TILE.GRASS);
  const landStand = getBuildStandTile(state.grid, { ix: 10, iz: 10 });
  assert.deepEqual(landStand, { ix: 10, iz: 10 }, "land site returns own coords");

  // Water case: an island of WATER with GRASS to the east.
  setTile(state.grid, 20, 10, TILE.WATER);
  setTile(state.grid, 21, 10, TILE.GRASS);
  setTile(state.grid, 19, 10, TILE.WATER);
  setTile(state.grid, 20, 9, TILE.WATER);
  setTile(state.grid, 20, 11, TILE.WATER);
  const waterStand = getBuildStandTile(state.grid, { ix: 20, iz: 10 });
  assert.ok(waterStand, "water site with one shore neighbour returns a stand tile");
  assert.equal(
    Math.abs(waterStand.ix - 20) + Math.abs(waterStand.iz - 10),
    1,
    "stand tile is 4-neighbour-adjacent to the site",
  );
});
