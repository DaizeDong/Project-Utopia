import test from "node:test";
import assert from "node:assert/strict";

import { deriveVisualAssetDebugState } from "../src/render/visualAssetDebug.js";

test("deriveVisualAssetDebugState reflects loaded materials after state resets", () => {
  const derived = deriveVisualAssetDebugState({
    manifestTheme: "flat_worldsim",
    tileMaterials: [
      { map: {} },
      { map: {} },
      { map: {} },
    ],
    iconMaterials: [
      { map: null },
      { map: {} },
    ],
    unitSpriteCount: 4,
  });

  assert.deepEqual(derived, {
    visualAssetPack: "flat_worldsim",
    tileTexturesLoaded: true,
    iconAtlasLoaded: true,
    unitSpriteLoaded: true,
  });
});

test("deriveVisualAssetDebugState keeps partially loaded visual layers honest", () => {
  const derived = deriveVisualAssetDebugState({
    manifestTheme: "flat_worldsim:fallback",
    tileMaterials: [
      { map: {} },
      { map: null },
    ],
    iconMaterials: [
      { map: null },
    ],
    unitSpriteCount: 0,
  });

  assert.equal(derived.visualAssetPack, "flat_worldsim:fallback");
  assert.equal(derived.tileTexturesLoaded, false);
  assert.equal(derived.iconAtlasLoaded, false);
  assert.equal(derived.unitSpriteLoaded, false);
});
