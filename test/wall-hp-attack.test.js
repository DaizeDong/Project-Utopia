// v0.8.4 strategic walls + GATE (Agent C).
//
// Validates the wall-HP lifecycle: when a tile becomes a WALL or GATE,
// `tileState.wallHp` is seeded by TileMutationHooks. When the wall is
// attacked enough, it mutates to RUINS. This is the mechanic that makes
// walls real defensive geometry — hostiles that can't path around them
// chew through the HP pool and eventually break the line.

import test from "node:test";
import assert from "node:assert/strict";

import { TILE } from "../src/config/constants.js";
import { BALANCE } from "../src/config/balance.js";
import { mutateTile } from "../src/simulation/lifecycle/TileMutationHooks.js";

function makeMinimalState({ width = 5, height = 5 } = {}) {
  // Minimal state shape that mutateTile + TileMutationHooks expect. Only
  // the bits the hooks actually read/write are populated. No agents/animals.
  const tiles = new Uint8Array(width * height);
  tiles.fill(TILE.GRASS);
  return {
    grid: {
      width,
      height,
      tileSize: 1,
      tiles,
      version: 1,
      tileState: new Map(),
      tileStateVersion: 0,
    },
    agents: [],
    buildings: { walls: 0, gates: 0 },
    _tileMutationDirtyKeys: new Set(),
    metrics: { tick: 0, timeSec: 0 },
  };
}

test("placing a WALL seeds tileState.wallHp = BALANCE.wallMaxHp", () => {
  const state = makeMinimalState();
  const ok = mutateTile(state, 2, 2, TILE.WALL);
  assert.equal(ok, true);
  const idx = 2 + 2 * state.grid.width;
  const entry = state.grid.tileState.get(idx);
  assert.ok(entry, "tileState entry should exist after WALL placement");
  assert.equal(entry.wallHp, Number(BALANCE.wallMaxHp ?? 50));
});

test("placing a GATE seeds wallHp at gateMaxHp (v0.8.5: gates earn their stone cost)", () => {
  const state = makeMinimalState();
  mutateTile(state, 1, 1, TILE.GATE);
  const idx = 1 + 1 * state.grid.width;
  const entry = state.grid.tileState.get(idx);
  assert.ok(entry, "tileState entry should exist after GATE placement");
  // v0.8.5 Tier 3: gates use BALANCE.gateMaxHp (75) instead of wallMaxHp (50)
  // so they earn their stone cost. Pre-v0.8.5 they shared wallMaxHp.
  assert.equal(entry.wallHp, Number(BALANCE.gateMaxHp ?? BALANCE.wallMaxHp ?? 50));
});

test("removing a WALL clears wallHp from tileState", () => {
  const state = makeMinimalState();
  mutateTile(state, 2, 2, TILE.WALL);
  const idx = 2 + 2 * state.grid.width;
  assert.equal(state.grid.tileState.get(idx).wallHp, Number(BALANCE.wallMaxHp ?? 50));

  // Mutate back to GRASS — wallHp should be cleared.
  mutateTile(state, 2, 2, TILE.GRASS);
  const after = state.grid.tileState.get(idx);
  // Either entry is absent OR wallHp is undefined — both are valid clears.
  if (after) {
    assert.equal(after.wallHp, undefined);
  }
});

test("simulated wall-attack drains wallHp to zero and mutates to RUINS", () => {
  const state = makeMinimalState();
  // Place wall at (2, 2). With grid filled GRASS otherwise, this creates a
  // single-tile barrier — easy to inspect.
  mutateTile(state, 2, 2, TILE.WALL);
  const idx = 2 + 2 * state.grid.width;
  const startingHp = Number(BALANCE.wallMaxHp ?? 50);
  assert.equal(state.grid.tileState.get(idx).wallHp, startingHp);

  // Simulate a hostile chipping away: each tick applies dt seconds of
  // wallAttackDamagePerSec damage. Iterate until the wall breaks. We use a
  // 1-second dt so the test does not depend on float precision.
  const dmgPerSec = Number(BALANCE.wallAttackDamagePerSec ?? 5);
  const dt = 1.0;
  // Manually replicate the attack arithmetic so we do not need to spin up
  // a full AnimalAISystem state. The TileMutationHooks contract guarantees
  // the wallHp field exists; we drain it then mutate.
  let safetyMax = 200;
  const grid = state.grid;
  while (grid.tiles[idx] === TILE.WALL && safetyMax > 0) {
    const entry = grid.tileState.get(idx);
    entry.wallHp = Math.max(0, Number(entry.wallHp) - dmgPerSec * dt);
    if (entry.wallHp <= 0) {
      mutateTile(state, 2, 2, TILE.RUINS);
    }
    safetyMax -= 1;
  }

  // The wall should now be a RUINS tile.
  assert.equal(grid.tiles[idx], TILE.RUINS, "wall should mutate to RUINS at hp=0");
  const ticksExpected = Math.ceil(startingHp / dmgPerSec);
  // Sanity: with 50 hp / 5 damage per second, exactly 10 ticks of 1s should
  // bring it down. The loop guards on `safetyMax > 0` and the running tick
  // count is `200 - safetyMax`. We assert it took the expected number of
  // ticks (allowing a +1 tick for the post-zero RUINS mutation pass).
  assert.ok(
    200 - safetyMax <= ticksExpected + 1,
    `wall should break within ${ticksExpected + 1} ticks, took ${200 - safetyMax}`,
  );
});

test("attacking a GATE drains its hp and mutates to RUINS too", () => {
  const state = makeMinimalState();
  mutateTile(state, 1, 1, TILE.GATE);
  const idx = 1 + 1 * state.grid.width;
  const dmgPerSec = Number(BALANCE.wallAttackDamagePerSec ?? 5);

  let safetyMax = 200;
  const grid = state.grid;
  while (grid.tiles[idx] === TILE.GATE && safetyMax > 0) {
    const entry = grid.tileState.get(idx);
    entry.wallHp = Math.max(0, Number(entry.wallHp) - dmgPerSec * 1.0);
    if (entry.wallHp <= 0) {
      mutateTile(state, 1, 1, TILE.RUINS);
    }
    safetyMax -= 1;
  }

  assert.equal(grid.tiles[idx], TILE.RUINS, "gate should mutate to RUINS at hp=0");
});

test("BUILDING_DESTROYED-style mutations cascade through TileMutationHooks (path/reservation cleanup)", () => {
  const state = makeMinimalState();
  // Place an agent whose target is the wall tile we'll destroy. After
  // mutateTile fires, agent.targetTile and agent.path should be cleared
  // (since the new tile RUINS is in BLOCKING_TILES — actually RUINS is
  // passable, but the target was on a tile that's no longer a wall, so
  // the agent's intent is invalidated).
  // We exercise the targetTile-matches branch: targetTile=(2,2) where
  // the tile is being destroyed. After mutateTile, agent.targetTile
  // should be cleared.
  state.agents.push({
    alive: true,
    targetTile: { ix: 2, iz: 2 },
    path: [{ ix: 0, iz: 0 }, { ix: 2, iz: 2 }],
    pathIndex: 0,
    pathGridVersion: 1,
    blackboard: {},
  });

  // Place a wall first so the destruction is wall→ruins (not grass→ruins).
  mutateTile(state, 2, 2, TILE.WALL);
  // Reset path metadata that the placement just invalidated for testing
  // the destruction step.
  state.agents[0].path = [{ ix: 0, iz: 0 }, { ix: 2, iz: 2 }];
  state.agents[0].targetTile = { ix: 2, iz: 2 };
  state.agents[0].pathGridVersion = state.grid.version;

  mutateTile(state, 2, 2, TILE.RUINS);
  const agent = state.agents[0];
  assert.equal(agent.targetTile, null, "targetTile pointing at the mutated tile should be cleared");
  assert.equal(agent.path, null, "agent path should be invalidated when target tile mutates");
});
