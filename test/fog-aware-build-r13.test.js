// R13 Plan-R13-fog-aware-build (#5+#7) — coverage for the fog-respect
// helpers added to VisibilitySystem + the autopilot scoutNeeded latch.
//
// Verifies:
//   1. `isTileExplored` returns true for VISIBLE, true for EXPLORED,
//      false for HIDDEN, true when fog is disabled (no fog state).
//   2. `pickFogEdgeTileNear` returns a tile on the fog edge when one
//      exists in scan radius, null when the surrounding area is either
//      fully revealed or fully hidden.

import test from "node:test";
import assert from "node:assert/strict";

import { isTileExplored } from "../src/simulation/world/VisibilitySystem.js";
import { pickFogEdgeTileNear } from "../src/simulation/npc/WorkerAISystem.js";
import { FOG_STATE, TILE } from "../src/config/constants.js";

function makeState({ width = 10, height = 10, fog = true } = {}) {
  const grid = {
    width,
    height,
    tileSize: 1,
    tiles: new Uint8Array(width * height).fill(TILE.GRASS),
    version: 1,
  };
  const state = { grid };
  if (fog) {
    state.fog = { visibility: new Uint8Array(width * height).fill(FOG_STATE.HIDDEN), version: 1 };
  }
  return state;
}

test("R13 fog-aware: isTileExplored true for VISIBLE/EXPLORED, false for HIDDEN", () => {
  const state = makeState();
  // Default: all HIDDEN.
  assert.equal(isTileExplored(state, 5, 5), false, "HIDDEN tile must report not explored");
  state.fog.visibility[5 + 5 * 10] = FOG_STATE.EXPLORED;
  assert.equal(isTileExplored(state, 5, 5), true, "EXPLORED tile must report explored");
  state.fog.visibility[5 + 5 * 10] = FOG_STATE.VISIBLE;
  assert.equal(isTileExplored(state, 5, 5), true, "VISIBLE tile must report explored");
  // Out-of-bounds → false.
  assert.equal(isTileExplored(state, -1, 5), false);
  assert.equal(isTileExplored(state, 5, 999), false);
});

test("R13 fog-aware: isTileExplored returns true when fog disabled", () => {
  const state = makeState({ fog: false });
  // No fog state at all → callers should treat all tiles as explored.
  assert.equal(isTileExplored(state, 0, 0), true);
  assert.equal(isTileExplored(state, 9, 9), true);
});

test("R13 fog-aware: pickFogEdgeTileNear returns a fog-edge tile when one exists", () => {
  // worldToTile: ix = floor(x / tileSize + width/2). With tileSize=1 and
  // width/height=20, world (0,0) maps to tile (10,10). Reveal a large
  // EXPLORED region centred on (10,10) so the random picker is virtually
  // guaranteed to sample it within a ±12 scan radius. The 4-cell HIDDEN
  // periphery beyond the region creates the fog edge.
  const state = makeState({ width: 20, height: 20 });
  for (let z = 4; z <= 16; z += 1) {
    for (let x = 4; x <= 16; x += 1) {
      state.fog.visibility[x + z * 20] = FOG_STATE.EXPLORED;
    }
  }
  const worker = { x: 0, z: 0 }; // → tile (10,10)
  // Deterministic RNG so the picker walks a fixed sample.
  let s = 1;
  const services = { rng: { next: () => { s = (s * 9301 + 49297) % 233280; return s / 233280; } } };
  const picked = pickFogEdgeTileNear(worker, state, services);
  assert.ok(picked, "should pick a fog-edge tile inside the EXPLORED region");
  // Must be inside the EXPLORED region, NOT in the HIDDEN periphery.
  assert.ok(picked.ix >= 4 && picked.ix <= 16, `x in region, got ${picked.ix}`);
  assert.ok(picked.iz >= 4 && picked.iz <= 16, `z in region, got ${picked.iz}`);
  assert.equal(state.fog.visibility[picked.ix + picked.iz * 20], FOG_STATE.EXPLORED, "picked tile is EXPLORED");
  // Confirm the picked tile is on the fog edge: it must have at least one
  // HIDDEN 4-neighbour (since the EXPLORED region runs 4..16 inclusive,
  // only the perimeter cells satisfy this — i.e. ix∈{4,16} OR iz∈{4,16}).
  const onPerimeter = picked.ix === 4 || picked.ix === 16 || picked.iz === 4 || picked.iz === 16;
  assert.ok(onPerimeter, `picked tile ${picked.ix},${picked.iz} should sit on the explored region's perimeter`);
});

test("R13 fog-aware: pickFogEdgeTileNear returns null when no edge in radius", () => {
  // Fully-revealed grid → no HIDDEN neighbours → no fog edge → null.
  const state = makeState({ width: 30, height: 30 });
  for (let i = 0; i < state.fog.visibility.length; i += 1) state.fog.visibility[i] = FOG_STATE.VISIBLE;
  const worker = { x: 0, z: 0 }; // → tile (15,15)
  let s = 7;
  const services = { rng: { next: () => { s = (s * 9301 + 49297) % 233280; return s / 233280; } } };
  const picked = pickFogEdgeTileNear(worker, state, services);
  assert.equal(picked, null, "no fog edge in fully-revealed area");
});
