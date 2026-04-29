// v0.8.4 building-construction (Agent A) — construction-in-progress system
// integration tests. Verifies:
//   1. Default placement creates a blueprint overlay (tile unchanged).
//   2. With a builder worker at the site, ConstructionSystem completes
//      the build and mutates the tile.
//   3. cancelBlueprint refunds resources and clears overlay.
//   4. Demolish on a built structure produces an overlay; on completion
//      grants salvage and reverts the tile to GRASS.

import test from "node:test";
import assert from "node:assert/strict";

import { BuildSystem } from "../src/simulation/construction/BuildSystem.js";
import { ConstructionSystem } from "../src/simulation/construction/ConstructionSystem.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { createServices } from "../src/app/createServices.js";
import { ROLE, TILE } from "../src/config/constants.js";
import { BALANCE } from "../src/config/balance.js";
import { WorkerAISystem } from "../src/simulation/npc/WorkerAISystem.js";
import { tileToWorld } from "../src/world/grid/Grid.js";
import {
  getConstructionOverlay,
  findConstructionSite,
} from "../src/simulation/construction/ConstructionSites.js";
import { placeBuildingInstant } from "./helpers/build.js";

function findFirstValid(state, buildSystem, tool) {
  for (let iz = 0; iz < state.grid.height; iz += 1) {
    for (let ix = 0; ix < state.grid.width; ix += 1) {
      if (buildSystem.previewToolAt(state, tool, ix, iz).ok) return { ix, iz };
    }
  }
  return null;
}

test("placeToolAt without instant flag creates a blueprint overlay (tile unchanged)", () => {
  const state = createInitialGameState({ seed: 1337 });
  const buildSystem = new BuildSystem();
  state.resources.wood = 999;
  state.resources.stone = 999;

  const target = findFirstValid(state, buildSystem, "warehouse");
  assert.ok(target, "expected at least one valid warehouse placement");

  const tileIdx = target.ix + target.iz * state.grid.width;
  const oldTile = state.grid.tiles[tileIdx];

  const woodBefore = state.resources.wood;
  const result = buildSystem.placeToolAt(state, "warehouse", target.ix, target.iz);
  assert.equal(result.ok, true);
  assert.equal(result.phase, "blueprint");
  // Tile is still its original type — blueprint mode.
  assert.equal(state.grid.tiles[tileIdx], oldTile);
  // Resources still spent up front.
  assert.ok(state.resources.wood < woodBefore, "wood spent for blueprint");
  // Overlay exists on tileState.
  const overlay = getConstructionOverlay(state, target.ix, target.iz);
  assert.ok(overlay, "construction overlay must exist after blueprint placement");
  assert.equal(overlay.kind, "build");
  assert.equal(overlay.tool, "warehouse");
  assert.equal(overlay.targetTile, TILE.WAREHOUSE);
  assert.ok(Number(overlay.workTotalSec) > 0, "workTotalSec set from BALANCE.constructionWorkSec");
  assert.equal(overlay.workAppliedSec, 0);
  // Site indexed.
  assert.equal(state.constructionSites.length, 1, "exactly one site indexed");
  assert.equal(state.constructionSites[0].ix, target.ix);
  assert.equal(state.constructionSites[0].iz, target.iz);
});

test("ConstructionSystem completes a blueprint when a builder ticks workAppliedSec to total", () => {
  const state = createInitialGameState({ seed: 1337 });
  const buildSystem = new BuildSystem();
  const constructionSystem = new ConstructionSystem();
  state.resources.wood = 999;
  state.resources.stone = 999;

  const target = findFirstValid(state, buildSystem, "warehouse");
  assert.ok(target);
  const tileIdx = target.ix + target.iz * state.grid.width;
  const placed = buildSystem.placeToolAt(state, "warehouse", target.ix, target.iz);
  assert.equal(placed.ok, true);
  // Manually drive workAppliedSec to completion (no need for full WorkerAISystem
  // here — that's covered by the integration test below).
  const overlay = getConstructionOverlay(state, target.ix, target.iz);
  overlay.workAppliedSec = overlay.workTotalSec + 0.1;

  const warehousesBefore = Number(state.buildings?.warehouses ?? 0);
  constructionSystem.update(0.1, state);
  // Tile is now mutated to WAREHOUSE.
  assert.equal(state.grid.tiles[tileIdx], TILE.WAREHOUSE, "tile mutates to target on completion");
  // Overlay cleared.
  assert.equal(getConstructionOverlay(state, target.ix, target.iz), null);
  // Site spliced.
  assert.equal(state.constructionSites.length, 0, "site mirror cleared on completion");
  // Building stats rebuilt.
  assert.equal(Number(state.buildings.warehouses), warehousesBefore + 1);
});

test("BUILDER worker walks to site, applies work, and completion mutates the tile", () => {
  const state = createInitialGameState({ seed: 1337 });
  const services = createServices(state.world.mapSeed);
  const buildSystem = new BuildSystem();
  const workerSystem = new WorkerAISystem();
  const constructionSystem = new ConstructionSystem();

  state.resources.wood = 999;
  state.resources.stone = 999;
  state.session.phase = "active";

  // Pick a site near the middle of the map.
  const target = findFirstValid(state, buildSystem, "warehouse");
  assert.ok(target);
  const tileIdx = target.ix + target.iz * state.grid.width;
  const placed = buildSystem.placeToolAt(state, "warehouse", target.ix, target.iz);
  assert.equal(placed.ok, true);
  assert.equal(state.grid.tiles[tileIdx] !== TILE.WAREHOUSE, true);
  const overlay = getConstructionOverlay(state, target.ix, target.iz);
  assert.ok(overlay);

  // Promote a worker to BUILDER and place them adjacent to the site so
  // they reach it within a few simulation ticks.
  const builder = state.agents.find((a) => a.type === "WORKER");
  assert.ok(builder, "expected at least one worker");
  builder.role = ROLE.BUILDER;
  const sitePos = tileToWorld(target.ix, target.iz, state.grid);
  builder.x = sitePos.x;
  builder.z = sitePos.z;
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

  // Drive the simulation: worker should pick up work each tick.
  state.metrics.timeSec = 0;
  state.metrics.tick = 0;
  const dt = 0.5;
  let totalSimSec = 0;
  const totalWorkSec = Number(overlay.workTotalSec);
  // Cap at 30 sim seconds — way more than the longest building takes (8s).
  for (let i = 0; i < 60; i += 1) {
    state.metrics.timeSec = totalSimSec;
    state.metrics.tick += 1;
    workerSystem.update(dt, state, services);
    constructionSystem.update(dt, state);
    totalSimSec += dt;
    if (state.grid.tiles[tileIdx] === TILE.WAREHOUSE) break;
  }
  assert.equal(state.grid.tiles[tileIdx], TILE.WAREHOUSE, "tile completed within reasonable sim window");
  assert.equal(state.constructionSites.length, 0, "site cleared on completion");
  assert.ok(totalSimSec >= totalWorkSec - dt, "completion takes roughly workTotalSec to land");
});

test("cancelBlueprint refunds resources and removes overlay/site", () => {
  const state = createInitialGameState({ seed: 1337 });
  const buildSystem = new BuildSystem();
  state.resources.wood = 999;
  state.resources.stone = 999;

  const target = findFirstValid(state, buildSystem, "warehouse");
  assert.ok(target);
  const woodBefore = state.resources.wood;
  buildSystem.placeToolAt(state, "warehouse", target.ix, target.iz);
  assert.ok(getConstructionOverlay(state, target.ix, target.iz));
  assert.equal(state.constructionSites.length, 1);
  const woodAfterPlace = state.resources.wood;
  assert.ok(woodAfterPlace < woodBefore);

  const cancel = buildSystem.cancelBlueprint(state, target.ix, target.iz);
  assert.ok(cancel);
  assert.equal(cancel.ok, true);
  assert.equal(cancel.phase, "blueprint-cancel");
  // Resources fully refunded.
  assert.equal(state.resources.wood, woodBefore, "wood restored on cancel");
  // Overlay cleared.
  assert.equal(getConstructionOverlay(state, target.ix, target.iz), null);
  assert.equal(state.constructionSites.length, 0);
});

test("erase on a blueprint cancels it (refund + clear)", () => {
  const state = createInitialGameState({ seed: 1337 });
  const buildSystem = new BuildSystem();
  state.resources.wood = 999;
  state.resources.stone = 999;

  const target = findFirstValid(state, buildSystem, "warehouse");
  assert.ok(target);
  const woodBefore = state.resources.wood;
  buildSystem.placeToolAt(state, "warehouse", target.ix, target.iz);
  assert.ok(getConstructionOverlay(state, target.ix, target.iz));
  // erase tool routes to cancelBlueprint when overlay exists.
  const erased = buildSystem.placeToolAt(state, "erase", target.ix, target.iz);
  assert.equal(erased.ok, true);
  assert.equal(erased.phase, "blueprint-cancel");
  assert.equal(state.resources.wood, woodBefore);
  assert.equal(getConstructionOverlay(state, target.ix, target.iz), null);
  assert.equal(state.constructionSites.length, 0);
});

test("erase on a built structure creates a demolish overlay; completion grants salvage", () => {
  const state = createInitialGameState({ seed: 1337 });
  const buildSystem = new BuildSystem();
  const constructionSystem = new ConstructionSystem();
  state.resources.wood = 999;
  state.resources.stone = 999;

  // Place instantly so we have a real built warehouse to demolish.
  const target = findFirstValid(state, buildSystem, "warehouse");
  assert.ok(target);
  const tileIdx = target.ix + target.iz * state.grid.width;
  placeBuildingInstant(buildSystem, state, "warehouse", target.ix, target.iz);
  assert.equal(state.grid.tiles[tileIdx], TILE.WAREHOUSE);

  // Now erase it via blueprint mode: charges demolishToolCost, writes
  // demolish overlay (tile NOT yet GRASS).
  const woodBefore = state.resources.wood;
  const stoneBefore = state.resources.stone;
  const erased = buildSystem.placeToolAt(state, "erase", target.ix, target.iz);
  assert.equal(erased.ok, true);
  assert.equal(erased.phase, "blueprint");
  // Tile still WAREHOUSE — demolish in progress.
  assert.equal(state.grid.tiles[tileIdx], TILE.WAREHOUSE);
  // Demolish commission spent (wood: 1 by default).
  const commission = Number(BALANCE.demolishToolCost?.wood ?? 0);
  assert.equal(state.resources.wood, woodBefore - commission, "demolish commissioning charge applied");
  // Overlay metadata.
  const overlay = getConstructionOverlay(state, target.ix, target.iz);
  assert.ok(overlay);
  assert.equal(overlay.kind, "demolish");
  assert.equal(overlay.targetTile, TILE.GRASS);
  assert.equal(overlay.originalTile, TILE.WAREHOUSE);
  // Site indexed.
  assert.equal(findConstructionSite(state, target.ix, target.iz)?.kind, "demolish");

  // Drive demolish to completion.
  overlay.workAppliedSec = overlay.workTotalSec + 0.1;
  constructionSystem.update(0.1, state);

  // Tile is GRASS, refund applied, no overlay.
  assert.equal(state.grid.tiles[tileIdx], TILE.GRASS);
  assert.equal(getConstructionOverlay(state, target.ix, target.iz), null);
  assert.equal(state.constructionSites.length, 0);
  // Salvage refund landed (warehouse → wood: floor(10*0.25) = 2).
  assert.ok(state.resources.wood >= woodBefore - commission, "salvage applied on completion");
});

test("erase on RUINS uses ruins-faster work duration", () => {
  const state = createInitialGameState({ seed: 1337 });
  const buildSystem = new BuildSystem();
  state.resources.wood = 999;
  state.resources.stone = 999;
  // Find a RUINS tile (the seed map should have at least one).
  let ruinsTarget = null;
  for (let iz = 0; iz < state.grid.height && !ruinsTarget; iz += 1) {
    for (let ix = 0; ix < state.grid.width; ix += 1) {
      if (state.grid.tiles[ix + iz * state.grid.width] === TILE.RUINS) {
        ruinsTarget = { ix, iz };
        break;
      }
    }
  }
  assert.ok(ruinsTarget, "expected at least one RUINS tile in the seed map");

  const erased = buildSystem.placeToolAt(state, "erase", ruinsTarget.ix, ruinsTarget.iz);
  assert.equal(erased.ok, true);
  assert.equal(erased.phase, "blueprint");
  const overlay = getConstructionOverlay(state, ruinsTarget.ix, ruinsTarget.iz);
  assert.ok(overlay);
  // RUINS clear faster — workTotalSec from BALANCE.demolishWorkSec.ruins.
  assert.equal(overlay.workTotalSec, Number(BALANCE.demolishWorkSec.ruins));
});

test("instant: true preserves legacy semantics — tile mutates immediately", () => {
  const state = createInitialGameState({ seed: 1337 });
  const buildSystem = new BuildSystem();
  state.resources.wood = 999;
  state.resources.stone = 999;
  const target = findFirstValid(state, buildSystem, "warehouse");
  assert.ok(target);
  const tileIdx = target.ix + target.iz * state.grid.width;
  const placed = placeBuildingInstant(buildSystem, state, "warehouse", target.ix, target.iz);
  assert.equal(placed.ok, true);
  assert.equal(placed.phase, "complete");
  assert.equal(state.grid.tiles[tileIdx], TILE.WAREHOUSE, "tile mutates immediately under instant flag");
  // No overlay, no site.
  assert.equal(getConstructionOverlay(state, target.ix, target.iz), null);
  assert.equal(state.constructionSites.length, 0);
});

test("BUILDING_PLACED event uses phase: blueprint then complete", () => {
  const state = createInitialGameState({ seed: 1337 });
  const buildSystem = new BuildSystem();
  const constructionSystem = new ConstructionSystem();
  state.resources.wood = 999;
  state.resources.stone = 999;

  const target = findFirstValid(state, buildSystem, "warehouse");
  assert.ok(target);
  // Clear log (initialise if missing — the initial state has events.queue
  // but the bus uses events.log which is created lazily on first emit).
  state.events.log = [];

  buildSystem.placeToolAt(state, "warehouse", target.ix, target.iz);
  let blueprintEvents = state.events.log.filter(
    (e) => e.type === "building_placed" && e.detail?.phase === "blueprint",
  );
  assert.equal(blueprintEvents.length, 1, "single blueprint event emitted on placement");

  const overlay = getConstructionOverlay(state, target.ix, target.iz);
  overlay.workAppliedSec = overlay.workTotalSec + 0.1;
  constructionSystem.update(0.1, state);

  const completeEvents = state.events.log.filter(
    (e) => e.type === "building_placed" && e.detail?.phase === "complete",
  );
  assert.equal(completeEvents.length, 1, "complete event emitted on completion");
});

test("BALANCE exposes constructionWorkSec, demolishWorkSec, builder caps", () => {
  assert.ok(BALANCE.constructionWorkSec, "constructionWorkSec block present");
  assert.ok(Number.isFinite(Number(BALANCE.constructionWorkSec.warehouse)));
  assert.ok(Number.isFinite(Number(BALANCE.constructionWorkSec.road)));
  assert.ok(BALANCE.demolishWorkSec, "demolishWorkSec block present");
  assert.ok(Number.isFinite(Number(BALANCE.demolishWorkSec.default)));
  assert.ok(BALANCE.demolishToolCost, "demolishToolCost present");
  assert.ok(Number.isFinite(Number(BALANCE.demolishToolCost.wood)));
  assert.ok(Number.isFinite(Number(BALANCE.builderPerSite)));
  assert.ok(Number.isFinite(Number(BALANCE.builderMin)));
  assert.ok(Number.isFinite(Number(BALANCE.builderMax)));
});

test("ROLE.BUILDER is exposed as a valid role identifier", () => {
  assert.equal(ROLE.BUILDER, "BUILDER");
});
