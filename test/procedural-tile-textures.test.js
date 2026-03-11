import test from "node:test";
import assert from "node:assert/strict";

import { PROCEDURAL_TILE_TEXTURE_PROFILES, resolveTileTextureMode } from "../src/render/ProceduralTileTextures.js";

test("flat_worldsim defaults to procedural terrain textures unless atlas mode is explicit", () => {
  assert.equal(resolveTileTextureMode(), "procedural");
  assert.equal(resolveTileTextureMode({ theme: "flat_worldsim" }), "procedural");
  assert.equal(resolveTileTextureMode({ tileTextureMode: "atlas" }), "atlas");
});

test("procedural tile texture profiles stay low-frequency enough for stable zooming", () => {
  for (const profile of Object.values(PROCEDURAL_TILE_TEXTURE_PROFILES)) {
    assert.ok(profile.repeatX >= 1 && profile.repeatX <= 2, `repeatX out of range: ${profile.repeatX}`);
    assert.ok(profile.repeatY >= 1 && profile.repeatY <= 2, `repeatY out of range: ${profile.repeatY}`);
    assert.ok(profile.size >= 64, `texture size too small: ${profile.size}`);
  }
});
