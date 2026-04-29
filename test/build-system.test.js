import test from "node:test";
import assert from "node:assert/strict";

import { BuildSystem } from "../src/simulation/construction/BuildSystem.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { TILE } from "../src/config/constants.js";

// v0.8.4 building-construction (Agent A) — pre-existing build-system tests
// assert immediate tile mutation. Migrated to the `instant: true` opt-in;
// the blueprint flow has its own coverage in test/construction-in-progress.
const INSTANT = { instant: true };

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
  const noMoney = buildSystem.placeToolAt(state, "warehouse", validWarehouse.ix, validWarehouse.iz, INSTANT);
  assert.equal(noMoney.ok, false);
  assert.equal(noMoney.reason, "insufficientResource");
  assert.equal(state.resources.wood, 3);

  assert.ok(validRoad);
  const roadPreview = buildSystem.previewToolAt(state, "road", validRoad.ix, validRoad.iz);
  const roadWoodCost = roadPreview.cost.wood;
  state.resources.wood = roadWoodCost + 1;
  const beforeRoad = state.resources.wood;
  const okRoad = buildSystem.placeToolAt(state, "road", validRoad.ix, validRoad.iz, INSTANT);
  assert.equal(okRoad.ok, true);
  assert.equal(state.resources.wood, beforeRoad - roadWoodCost);
  assert.equal(state.grid.tiles[validRoad.ix + validRoad.iz * state.grid.width], TILE.ROAD);

  state.resources.wood = 0;
  assert.ok(validWall);
  const failWall = buildSystem.placeToolAt(state, "wall", validWall.ix, validWall.iz, INSTANT);
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

test("BuildSystem blocks overwriting structures", () => {
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();
  const core = state.gameplay.scenario.anchors.coreWarehouse;

  const overwrite = buildSystem.previewToolAt(state, "road", core.ix, core.iz);
  assert.equal(overwrite.ok, false);
  assert.equal(overwrite.reason, "occupiedTile");
});

test("BuildSystem enforces warehouse spacing", () => {
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();
  const core = state.gameplay.scenario.anchors.coreWarehouse;

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

  const placed = buildSystem.placeToolAt(state, "road", ix, iz, INSTANT);
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
  // Use warehouse (wood:10) — post-M1c demoWoodRecovery=0.25 yields a non-zero
  // wood refund (floor(10×0.25)=2). Wall (wood:2) now rounds down to zero.
  const warehouseTarget = findFirstTile(state, (ix, iz) => buildSystem.previewToolAt(state, "warehouse", ix, iz).ok);

  assert.ok(warehouseTarget);
  const idx = warehouseTarget.ix + warehouseTarget.iz * state.grid.width;
  const whPreview = buildSystem.previewToolAt(state, "warehouse", warehouseTarget.ix, warehouseTarget.iz);
  const whWoodCost = whPreview.cost.wood;
  const beforeWood = state.resources.wood;
  const built = buildSystem.placeToolAt(state, "warehouse", warehouseTarget.ix, warehouseTarget.iz, INSTANT);
  assert.equal(built.ok, true);
  assert.equal(state.resources.wood, beforeWood - whWoodCost);

  const erased = buildSystem.placeToolAt(state, "erase", warehouseTarget.ix, warehouseTarget.iz, INSTANT);
  assert.equal(erased.ok, true);
  assert.equal(state.grid.tiles[idx], TILE.GRASS);
  assert.ok(erased.refund.wood >= 1);
  assert.equal(state.resources.wood, beforeWood - whWoodCost + erased.refund.wood);

  const undo = buildSystem.undo(state);
  assert.equal(undo.ok, true);
  assert.equal(state.grid.tiles[idx], TILE.WAREHOUSE);
  assert.equal(state.resources.wood, beforeWood - whWoodCost);

  const redo = buildSystem.redo(state);
  assert.equal(redo.ok, true);
  assert.equal(state.grid.tiles[idx], TILE.GRASS);
  assert.equal(state.resources.wood, beforeWood - whWoodCost + erased.refund.wood);
});

test("BuildSystem erasing a wall rounds refund to zero under 0.25 wood recovery", () => {
  // Locks the demoWoodRecovery invariant — if tuning bumps recovery above 0.5,
  // wall (wood:2) would start refunding 1 and this test flags the behavior
  // change so CHANGELOG / baselines get reviewed intentionally.
  const state = createInitialGameState();
  const buildSystem = new BuildSystem();
  const wallTarget = findFirstTile(state, (ix, iz) => buildSystem.previewToolAt(state, "wall", ix, iz).ok);
  assert.ok(wallTarget);
  buildSystem.placeToolAt(state, "wall", wallTarget.ix, wallTarget.iz, INSTANT);
  const erased = buildSystem.placeToolAt(state, "erase", wallTarget.ix, wallTarget.iz, INSTANT);
  assert.equal(erased.ok, true);
  assert.equal(erased.refund.wood ?? 0, 0, "wall wood refund must round to zero under current demoWoodRecovery");
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
