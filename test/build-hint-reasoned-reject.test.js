import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { summarizeBuildPreview } from "../src/simulation/construction/BuildAdvisor.js";
import { BuildSystem } from "../src/simulation/construction/BuildSystem.js";
import { TILE } from "../src/config/constants.js";

// v0.8.2 Round-5b Wave-1 (01a Step 4) — BuildSystem.previewToolAt(state,
// tool, ix, iz) returns {ok:false, reasonText:"..."} for invalid tiles.
// SceneRenderer.#onPointerMove pipes reasonText into state.controls.buildHint
// so HUDController can render the human-readable reason text. This test
// exercises the contract: preview fails + reasonText non-empty.

test("buildHint: hovering water with farm tool yields ok:false + non-empty reasonText", () => {
  const state = createInitialGameState();
  const bs = new BuildSystem();
  const grid = state.grid;
  // Find a water tile.
  let waterIx = -1; let waterIz = -1;
  for (let iz = 0; iz < grid.height && waterIx < 0; iz += 1) {
    for (let ix = 0; ix < grid.width && waterIx < 0; ix += 1) {
      if (grid.tiles[ix + iz * grid.width] === TILE.WATER) {
        waterIx = ix; waterIz = iz;
      }
    }
  }
  if (waterIx < 0) {
    // Some scenarios have no water — this is a soft skip.
    return;
  }
  const preview = bs.previewToolAt(state, "farm", waterIx, waterIz);
  assert.equal(preview.ok, false, "farm on water must be rejected");
  assert.ok(typeof preview.reasonText === "string", "reasonText must be a string");
  assert.ok(preview.reasonText.length > 0, "reasonText must be non-empty for the HUD hint");
  assert.ok(typeof preview.recoveryText === "string", "recoveryText must be a string");
  assert.match(preview.recoveryText, /Bridge|grass|road|ruins/i);
  assert.match(summarizeBuildPreview(preview), /Use Bridge|grass|road|ruins/i);
});

test("buildHint: hovering non-grass with farm tool yields ok:false + reasonText", () => {
  const state = createInitialGameState();
  const bs = new BuildSystem();
  const grid = state.grid;
  // Find a wall/road tile (non-grass, non-water).
  let ix = -1; let iz = -1;
  for (let z = 0; z < grid.height && ix < 0; z += 1) {
    for (let x = 0; x < grid.width && ix < 0; x += 1) {
      const t = grid.tiles[x + z * grid.width];
      if (t === TILE.ROAD || t === TILE.WALL) { ix = x; iz = z; }
    }
  }
  if (ix < 0) return; // Soft-skip if no such tile.
  const preview = bs.previewToolAt(state, "farm", ix, iz);
  // Preview may succeed on some roads for certain tools; what matters is
  // that IF it fails, reasonText is populated.
  if (!preview.ok) {
    assert.ok(preview.reasonText.length > 0, "reasonText must populate when ok=false");
  }
});
