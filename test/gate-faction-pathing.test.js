// v0.8.4 strategic walls + GATE (Agent C).
//
// Validates the faction-aware A* / PathCache contract: walls block everyone,
// gates open for the colony faction and stay closed for hostile factions.
// Also validates that PathCache distinguishes colony vs hostile keys (a
// colony-cached path must not be returned to a hostile lookup).

import test from "node:test";
import assert from "node:assert/strict";

import { TILE } from "../src/config/constants.js";
import { aStar } from "../src/simulation/navigation/AStar.js";
import { PathCache } from "../src/simulation/navigation/PathCache.js";
import { getEntityFaction, isTilePassableForFaction, FACTION } from "../src/simulation/navigation/Faction.js";

function createGrid(width, height, fill = TILE.GRASS) {
  const tiles = new Uint8Array(width * height);
  tiles.fill(fill);
  return { width, height, tileSize: 1, tiles, version: 1 };
}

// Build a 5x5 GRASS grid with a vertical wall column at ix=2 except a single
// GATE tile at (ix=2, iz=2). Movement is left-right: starting from (0,2) to
// (4,2) the colony path must traverse the gate; the hostile must route
// around the entire wall column (which is impossible in 5x5 without holes
// — so the hostile path returns null).
function gridWithWallLineAndGate() {
  const grid = createGrid(5, 5, TILE.GRASS);
  for (let iz = 0; iz < 5; iz += 1) {
    grid.tiles[2 + iz * grid.width] = TILE.WALL;
  }
  grid.tiles[2 + 2 * grid.width] = TILE.GATE;
  return grid;
}

test("isTilePassableForFaction encodes wall+gate rules", () => {
  // Walls are never passable for any faction.
  assert.equal(isTilePassableForFaction(TILE.WALL, FACTION.COLONY), false);
  assert.equal(isTilePassableForFaction(TILE.WALL, FACTION.HOSTILE), false);
  assert.equal(isTilePassableForFaction(TILE.WALL, FACTION.NEUTRAL), false);
  // Gates are passable only for the colony.
  assert.equal(isTilePassableForFaction(TILE.GATE, FACTION.COLONY), true);
  assert.equal(isTilePassableForFaction(TILE.GATE, FACTION.HOSTILE), false);
  assert.equal(isTilePassableForFaction(TILE.GATE, FACTION.NEUTRAL), false);
  // Other tiles fall through (this helper layers ON TOP of TILE_INFO).
  assert.equal(isTilePassableForFaction(TILE.GRASS, FACTION.COLONY), true);
  assert.equal(isTilePassableForFaction(TILE.GRASS, FACTION.HOSTILE), true);
});

test("getEntityFaction maps the four entity shapes correctly", () => {
  // WORKER → "colony" regardless of role.
  assert.equal(getEntityFaction({ type: "WORKER", role: "FARM" }), "colony");
  assert.equal(getEntityFaction({ type: "WORKER", role: "GUARD" }), "colony");
  // VISITOR is split by kind.
  assert.equal(getEntityFaction({ type: "VISITOR", kind: "TRADER" }), "colony");
  assert.equal(getEntityFaction({ type: "VISITOR", kind: "SABOTEUR" }), "hostile");
  // ANIMAL is split by kind.
  assert.equal(getEntityFaction({ type: "ANIMAL", kind: "HERBIVORE" }), "neutral");
  assert.equal(getEntityFaction({ type: "ANIMAL", kind: "PREDATOR" }), "hostile");
  // null / unknown safely defaults to colony so misuse never opens a gate.
  assert.equal(getEntityFaction(null), "colony");
  assert.equal(getEntityFaction({ type: "MYSTERY" }), "colony");
});

test("colony A* threads through the gate; hostile A* is blocked by the wall line", () => {
  const grid = gridWithWallLineAndGate();
  const start = { ix: 0, iz: 2 };
  const goal = { ix: 4, iz: 2 };

  // Colony path: must include the gate tile (2,2) since it's the only
  // breach in the wall column.
  const colonyPath = aStar(grid, start, goal, 1, null, { faction: "colony" });
  assert.ok(colonyPath, "colony path should be found through the gate");
  const passesGate = colonyPath.some((n) => n.ix === 2 && n.iz === 2);
  assert.equal(passesGate, true, "colony path must traverse the gate tile");

  // Hostile path: gates are blocked, walls are blocked, no other gap exists,
  // so A* returns null.
  const hostilePath = aStar(grid, start, goal, 1, null, { faction: "hostile" });
  assert.equal(hostilePath, null, "hostile path must be null when only gate breaches the wall");
});

test("default faction (omitted) is colony — pre-v0.8.4 callers keep their old behavior", () => {
  const grid = gridWithWallLineAndGate();
  const start = { ix: 0, iz: 2 };
  const goal = { ix: 4, iz: 2 };

  const noOptionsPath = aStar(grid, start, goal, 1);
  assert.ok(noOptionsPath, "omitted faction should default to colony and find a path");
  assert.equal(
    noOptionsPath.some((n) => n.ix === 2 && n.iz === 2),
    true,
    "default-colony path passes through the gate",
  );
});

test("PathCache distinguishes colony vs hostile keys for the same start→goal", () => {
  const cache = new PathCache(8);
  const start = { ix: 0, iz: 2 };
  const goal = { ix: 4, iz: 2 };
  const colonyPath = [{ ix: 0, iz: 2 }, { ix: 4, iz: 2 }];
  const hostilePath = [{ ix: 0, iz: 2 }, { ix: 4, iz: 2 }, { ix: 4, iz: 4 }];

  // Set with the new 6-arg form (gridVersion, start, goal, costVersion, faction, path).
  cache.set(1, start, goal, 0, "colony", colonyPath);
  cache.set(1, start, goal, 0, "hostile", hostilePath);

  const fromColony = cache.get(1, start, goal, 0, "colony");
  const fromHostile = cache.get(1, start, goal, 0, "hostile");

  assert.equal(fromColony, colonyPath);
  assert.equal(fromHostile, hostilePath);
  // Cross-faction lookup must NOT collide.
  assert.notEqual(fromColony, hostilePath);
  assert.notEqual(fromHostile, colonyPath);
});

test("PathCache 5-arg legacy set form still works (no faction → colony default)", () => {
  const cache = new PathCache(8);
  const start = { ix: 0, iz: 0 };
  const goal = { ix: 1, iz: 1 };
  const path = [{ ix: 0, iz: 0 }, { ix: 1, iz: 1 }];

  // Old shape: (gridVersion, start, goal, costVersion, path).
  cache.set(1, start, goal, 0, path);

  // Default-faction get returns the cached path.
  assert.equal(cache.get(1, start, goal, 0), path);
  // Hostile get must MISS the colony-cached entry.
  assert.equal(cache.get(1, start, goal, 0, "hostile"), null);
});

test("colony-only gate breach: hostile must route around when grid allows it", () => {
  // 7-wide grid with a wall column of length 4 (rows 1..4) and a gate at
  // (3, 2). The hostile cannot use the gate but CAN route around the wall
  // column via row 0 or row 6. This validates that hostiles still get a
  // valid path when one exists — they just can't use the gate.
  const grid = createGrid(7, 7, TILE.GRASS);
  for (let iz = 1; iz <= 4; iz += 1) grid.tiles[3 + iz * grid.width] = TILE.WALL;
  grid.tiles[3 + 2 * grid.width] = TILE.GATE;

  const start = { ix: 0, iz: 2 };
  const goal = { ix: 6, iz: 2 };

  const colonyPath = aStar(grid, start, goal, 1, null, { faction: "colony" });
  const hostilePath = aStar(grid, start, goal, 1, null, { faction: "hostile" });

  assert.ok(colonyPath, "colony path should be found through gate");
  assert.ok(hostilePath, "hostile path should still route around the wall column");
  assert.equal(
    colonyPath.some((n) => n.ix === 3 && n.iz === 2),
    true,
    "colony cuts straight through the gate",
  );
  assert.equal(
    hostilePath.some((n) => n.ix === 3 && n.iz === 2),
    false,
    "hostile must NOT step onto the gate",
  );
  // Hostile path must be longer than colony path (going around the wall).
  assert.ok(
    hostilePath.length > colonyPath.length,
    "hostile detour around wall is longer than colony's gate cut-through",
  );
});
