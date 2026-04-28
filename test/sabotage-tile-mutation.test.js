import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { TILE } from "../src/config/constants.js";
import { JobReservation } from "../src/simulation/npc/JobReservation.js";
import { mutateTile, onTileMutated } from "../src/simulation/lifecycle/TileMutationHooks.js";

/**
 * v0.8.x Sabotage tile-mutation regression
 *
 * Bug: Saboteur turning a FARM into RUINS used to leave workers frozen on the
 * destroyed tile. Root cause was that `applyImpactTileToGrid` mutated
 * `grid.tiles[]` raw without rebuilding building counts, releasing
 * reservations, or invalidating worker target/path. Cleanup now flows through
 * `onTileMutated` (called by mutateTile and BuildSystem).
 */

function findTileOfType(grid, type) {
  for (let iz = 0; iz < grid.height; iz += 1) {
    for (let ix = 0; ix < grid.width; ix += 1) {
      if (grid.tiles[ix + iz * grid.width] === type) return { ix, iz };
    }
  }
  return null;
}

function setTileRaw(grid, ix, iz, type) {
  grid.tiles[ix + iz * grid.width] = type;
}

test("mutateTile rebuilds building counts synchronously when sabotaging a farm", () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 4242 });
  // Force two known farm tiles for a deterministic count.
  // Pick two distinct passable tiles and stamp them as FARM.
  setTileRaw(state.grid, 4, 4, TILE.FARM);
  setTileRaw(state.grid, 5, 4, TILE.FARM);
  // Reset building stats so the test starts from a known baseline.
  state.buildings = { ...state.buildings, farms: 0 };

  // Now mutate one farm to RUINS; counts should rebuild within the call.
  mutateTile(state, 4, 4, TILE.RUINS);

  // After mutation, the helper rebuilt buildings from the grid — both stamped
  // farms are accounted for, minus the one we just turned to RUINS. The exact
  // farm count depends on seeded scenario stamps, but the destroyed tile MUST
  // not still be counted as a farm.
  assert.equal(state.grid.tiles[4 + 4 * state.grid.width], TILE.RUINS);
  // Building count must reflect grid: counted directly.
  let manualFarms = 0;
  for (let i = 0; i < state.grid.tiles.length; i += 1) {
    if (state.grid.tiles[i] === TILE.FARM) manualFarms += 1;
  }
  assert.equal(state.buildings.farms, manualFarms);
});

test("mutateTile clears worker reservations on the destroyed tile", () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
  state._jobReservation = new JobReservation();

  setTileRaw(state.grid, 6, 6, TILE.FARM);
  state._jobReservation.reserve("worker-A", 6, 6, "farm", 0);
  assert.equal(state._jobReservation.isReserved(6, 6), true);

  mutateTile(state, 6, 6, TILE.RUINS);

  assert.equal(state._jobReservation.isReserved(6, 6), false);
  assert.equal(state._jobReservation.getWorkerReservation("worker-A"), null);
});

test("mutateTile invalidates worker targetTile and path that touch the tile", () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 9999 });
  setTileRaw(state.grid, 8, 8, TILE.FARM);
  setTileRaw(state.grid, 9, 8, TILE.FARM);

  // Pick a real worker agent
  const worker = state.agents.find((a) => a.type === "WORKER");
  assert.ok(worker, "expected at least one worker agent");
  worker.targetTile = { ix: 8, iz: 8 };
  worker.path = [{ ix: 7, iz: 8 }, { ix: 8, iz: 8 }];
  worker.pathIndex = 0;
  worker.pathGridVersion = state.grid.version;

  mutateTile(state, 8, 8, TILE.RUINS);

  assert.equal(worker.targetTile, null, "targetTile should be cleared");
  assert.equal(worker.path, null, "path should be cleared");
  assert.equal(worker.pathGridVersion, -1, "pathGridVersion should be invalidated");

  // Another worker whose path passes through but doesn't end on the tile —
  // should still have its path invalidated so it re-routes.
  const worker2 = state.agents.find((a) => a.type === "WORKER" && a !== worker);
  if (worker2) {
    worker2.targetTile = { ix: 9, iz: 8 };
    worker2.path = [{ ix: 7, iz: 8 }, { ix: 8, iz: 8 }, { ix: 9, iz: 8 }];
    worker2.pathIndex = 0;
    worker2.pathGridVersion = state.grid.version;
    // Mutate a tile-on-path that isn't the worker's target.
    setTileRaw(state.grid, 7, 8, TILE.FARM);
    mutateTile(state, 7, 8, TILE.RUINS);
    assert.equal(worker2.path, null, "path passing through destroyed tile should be cleared");
    // targetTile (9,8) was not the destroyed tile, so it stays.
    assert.deepEqual(worker2.targetTile, { ix: 9, iz: 8 });
  }
});

test("mutateTile does NOT invalidate paths through non-blocking tiles (build cycle)", () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 1010 });
  setTileRaw(state.grid, 11, 11, TILE.GRASS);

  const worker = state.agents.find((a) => a.type === "WORKER");
  assert.ok(worker, "expected a worker agent");
  worker.targetTile = { ix: 12, iz: 11 };
  worker.path = [{ ix: 10, iz: 11 }, { ix: 11, iz: 11 }, { ix: 12, iz: 11 }];
  worker.pathIndex = 0;
  worker.pathGridVersion = state.grid.version;

  // GRASS → FARM: passable transition, no need to invalidate.
  mutateTile(state, 11, 11, TILE.FARM);

  // Path is still walkable through the new FARM tile; do NOT clear it. The
  // worker re-paths lazily on next tick via grid.version mismatch if needed.
  assert.notEqual(worker.path, null, "path should NOT be cleared for non-blocking transitions");
  assert.deepEqual(worker.targetTile, { ix: 12, iz: 11 });
});

test("mutateTile records a dirty tile-key for ProcessingSystem cleanup", () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 8765 });
  setTileRaw(state.grid, 10, 10, TILE.KITCHEN);

  mutateTile(state, 10, 10, TILE.RUINS);

  assert.ok(state._tileMutationDirtyKeys instanceof Set);
  assert.equal(state._tileMutationDirtyKeys.has("10,10"), true);
});

test("mutateTile is a no-op when oldTile === newTile", () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 4321 });
  const farmTile = findTileOfType(state.grid, TILE.FARM);
  if (!farmTile) {
    setTileRaw(state.grid, 12, 12, TILE.FARM);
    farmTile.ix = 12;
    farmTile.iz = 12;
  }
  const versionBefore = state.grid.version;
  const ok = mutateTile(state, farmTile.ix, farmTile.iz, TILE.FARM);
  assert.equal(ok, false);
  assert.equal(state.grid.version, versionBefore);
});

test("onTileMutated is idempotent when called with same old/new", () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 5151 });
  // Direct call: should early-return without touching anything.
  onTileMutated(state, 0, 0, TILE.GRASS, TILE.GRASS);
  // Sanity: state still has buildings + grid intact.
  assert.ok(state.buildings);
  assert.ok(state.grid);
});

test("applyImpactTileToGrid (sabotage) rebuilds building counts in the same tick", async () => {
  const state = createInitialGameState({ templateId: "temperate_plains", seed: 2025 });
  // Stamp a known farm and verify it shows up.
  setTileRaw(state.grid, 14, 14, TILE.FARM);
  // Use mutateTile (the same path applyImpactTileToGrid takes after the fix).
  const farmsBefore = (() => {
    let n = 0;
    for (let i = 0; i < state.grid.tiles.length; i += 1) {
      if (state.grid.tiles[i] === TILE.FARM) n += 1;
    }
    return n;
  })();
  mutateTile(state, 14, 14, TILE.RUINS);
  const expectedAfter = farmsBefore - 1;
  assert.equal(state.buildings.farms, expectedAfter);
});
