import test from "node:test";
import assert from "node:assert/strict";

import { BuildSystem } from "../src/simulation/construction/BuildSystem.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { TILE } from "../src/config/constants.js";

function findFirstTile(state, predicate) {
  for (let iz = 0; iz < state.grid.height; iz += 1) {
    for (let ix = 0; ix < state.grid.width; ix += 1) {
      if (predicate(ix, iz)) return { ix, iz };
    }
  }
  return null;
}

test("BuildSystem enforces cost and never drives resources below zero", () => {
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();
  const validRoad = findFirstTile(state, (ix, iz) => buildSystem.previewToolAt(state, "road", ix, iz).ok);
  const validWarehouse = findFirstTile(state, (ix, iz) => buildSystem.previewToolAt(state, "warehouse", ix, iz).ok);
  const validWall = findFirstTile(state, (ix, iz) => buildSystem.previewToolAt(state, "wall", ix, iz).ok);

  state.resources.wood = 3;
  assert.ok(validWarehouse);
  const noMoney = buildSystem.placeToolAt(state, "warehouse", validWarehouse.ix, validWarehouse.iz);
  assert.equal(noMoney.ok, false);
  assert.equal(noMoney.reason, "insufficientResource");
  assert.equal(state.resources.wood, 3);

  assert.ok(validRoad);
  const okRoad = buildSystem.placeToolAt(state, "road", validRoad.ix, validRoad.iz);
  assert.equal(okRoad.ok, true);
  assert.equal(state.resources.wood, 2);
  assert.equal(state.grid.tiles[validRoad.ix + validRoad.iz * state.grid.width], TILE.ROAD);

  state.resources.wood = 0;
  assert.ok(validWall);
  const failWall = buildSystem.placeToolAt(state, "wall", validWall.ix, validWall.iz);
  assert.equal(failWall.ok, false);
  assert.equal(failWall.reason, "insufficientResource");
  assert.ok(state.resources.wood >= 0);
});

test("BuildSystem preview reports water blocked placement", () => {
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();

  state.grid.tiles[12 + 12 * state.grid.width] = TILE.WATER;
  const preview = buildSystem.previewToolAt(state, "farm", 12, 12);
  assert.equal(preview.ok, false);
  assert.equal(preview.reason, "waterBlocked");
});

test("BuildSystem blocks overwriting structures and isolated road painting", () => {
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();
  const core = state.gameplay.scenario.anchors.coreWarehouse;

  const overwrite = buildSystem.previewToolAt(state, "road", core.ix, core.iz);
  assert.equal(overwrite.ok, false);
  assert.equal(overwrite.reason, "occupiedTile");

  const isolatedGrass = findFirstTile(state, (ix, iz) => {
    if (state.grid.tiles[ix + iz * state.grid.width] !== TILE.GRASS) return false;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (Math.abs(dx) + Math.abs(dz) !== 1) continue;
        const nx = ix + dx;
        const nz = iz + dz;
        if (nx < 0 || nz < 0 || nx >= state.grid.width || nz >= state.grid.height) continue;
        const neighbor = state.grid.tiles[nx + nz * state.grid.width];
        if (neighbor === TILE.ROAD || neighbor === TILE.WAREHOUSE || neighbor === TILE.FARM || neighbor === TILE.LUMBER) {
          return false;
        }
      }
    }
    return true;
  });

  assert.ok(isolatedGrass);
  const isolatedRoad = buildSystem.previewToolAt(state, "road", isolatedGrass.ix, isolatedGrass.iz);
  assert.equal(isolatedRoad.ok, false);
  assert.equal(isolatedRoad.reason, "needsNetworkAnchor");
});

test("BuildSystem requires logistics access for worksites and spread for warehouses", () => {
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();
  const core = state.gameplay.scenario.anchors.coreWarehouse;

  const isolatedGrass = findFirstTile(state, (ix, iz) => {
    if (state.grid.tiles[ix + iz * state.grid.width] !== TILE.GRASS) return false;
    for (let dz = -2; dz <= 2; dz += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        if (Math.abs(dx) + Math.abs(dz) > 2) continue;
        const nx = ix + dx;
        const nz = iz + dz;
        if (nx < 0 || nz < 0 || nx >= state.grid.width || nz >= state.grid.height) continue;
        const neighbor = state.grid.tiles[nx + nz * state.grid.width];
        if (neighbor === TILE.ROAD || neighbor === TILE.WAREHOUSE) return false;
      }
    }
    return true;
  });

  assert.ok(isolatedGrass);
  const worksite = buildSystem.previewToolAt(state, "farm", isolatedGrass.ix, isolatedGrass.iz);
  assert.equal(worksite.ok, false);
  assert.equal(worksite.reason, "needsLogisticsAccess");

  const crampedWarehouse = buildSystem.previewToolAt(state, "warehouse", core.ix + 1, core.iz);
  assert.equal(crampedWarehouse.ok, false);
  assert.equal(crampedWarehouse.reason, "warehouseTooClose");
});

test("BuildSystem undo/redo restores tiles and resources", () => {
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();
  const target = findFirstTile(state, (ix, iz) => buildSystem.previewToolAt(state, "road", ix, iz).ok);
  assert.ok(target);
  const { ix, iz } = target;
  const idx = ix + iz * state.grid.width;
  const beforeTile = state.grid.tiles[idx];
  const beforeWood = state.resources.wood;

  const placed = buildSystem.placeToolAt(state, "road", ix, iz);
  assert.equal(placed.ok, true);
  assert.equal(state.grid.tiles[idx], TILE.ROAD);
  assert.equal(state.resources.wood, beforeWood - (placed.cost.wood ?? 0));

  const undo = buildSystem.undo(state);
  assert.equal(undo.ok, true);
  assert.equal(state.grid.tiles[idx], beforeTile);
  assert.equal(state.resources.wood, beforeWood);

  const redo = buildSystem.redo(state);
  assert.equal(redo.ok, true);
  assert.equal(state.grid.tiles[idx], TILE.ROAD);
});

test("BuildSystem erase salvages structure cost and undo/redo preserves the refund", () => {
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();
  const wallTarget = findFirstTile(state, (ix, iz) => buildSystem.previewToolAt(state, "wall", ix, iz).ok);

  assert.ok(wallTarget);
  const idx = wallTarget.ix + wallTarget.iz * state.grid.width;
  const beforeWood = state.resources.wood;
  const built = buildSystem.placeToolAt(state, "wall", wallTarget.ix, wallTarget.iz);
  assert.equal(built.ok, true);
  assert.equal(state.resources.wood, beforeWood - 2);

  const erased = buildSystem.placeToolAt(state, "erase", wallTarget.ix, wallTarget.iz);
  assert.equal(erased.ok, true);
  assert.equal(state.grid.tiles[idx], TILE.GRASS);
  assert.equal(erased.refund.wood, 1);
  assert.equal(state.resources.wood, beforeWood - 1);

  const undo = buildSystem.undo(state);
  assert.equal(undo.ok, true);
  assert.equal(state.grid.tiles[idx], TILE.WALL);
  assert.equal(state.resources.wood, beforeWood - 2);

  const redo = buildSystem.redo(state);
  assert.equal(redo.ok, true);
  assert.equal(state.grid.tiles[idx], TILE.GRASS);
  assert.equal(state.resources.wood, beforeWood - 1);
});

test("BuildSystem preview surfaces scenario-specific construction effects", () => {
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();
  const scenario = state.gameplay.scenario;

  const routeGap = scenario.routeLinks[0].gapTiles[0];
  const roadPreview = buildSystem.previewToolAt(state, "road", routeGap.ix, routeGap.iz);
  assert.equal(roadPreview.ok, true);
  assert.match(roadPreview.effects.join(" "), /west lumber route/i);

  const depotAnchor = scenario.anchors.eastDepot;
  const warehousePreview = buildSystem.previewToolAt(state, "warehouse", depotAnchor.ix, depotAnchor.iz);
  assert.equal(warehousePreview.ok, true);
  assert.match(warehousePreview.effects.join(" "), /east ruined depot/i);

  const chokeAnchor = scenario.anchors.eastGate;
  const wallPreview = buildSystem.previewToolAt(state, "wall", chokeAnchor.ix, chokeAnchor.iz);
  assert.equal(wallPreview.ok, true);
  assert.match(wallPreview.effects.join(" "), /east depot gate/i);
});
