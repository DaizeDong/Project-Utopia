// v0.8.2 Round1 01b-playability — Entity Focus proximity-fallback hitbox test.
// Plan: assignments/homework6/Agent-Feedback-Loop/Round1/Plans/01b-playability.md
//
// The reviewer reported that Entity Focus returned "No entity selected" on
// every click near a worker in a new game, because the default
// THREE.Raycaster hit on the InstancedMesh workers (geometry radius ≈ 0.35
// world units, ≈ 8-12 screen pixels) is nearly unreachable by manual
// aiming. SceneRenderer.#pickEntity now falls back to a screen-space
// proximity search within the configured fallback radius, delegating the geometry to a pure helper
// (`findProximityEntity`) so the semantics can be unit-tested without
// booting Three.js.
//
// Cases covered:
//   1. 12 px offset → nearest worker selected
//   2. 40 px offset → nothing selected (avoid mis-select across tiles)
//   3. Multi-entity cluster → nearest within radius wins
//   4. Dead entity (alive === false) is skipped
//   5. Guard radius still catches workers the fallback radius missed,
//      which #onPointerDown uses to suppress build placement.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { findProximityEntity } from "../src/render/SceneRenderer.js";

// Viewport matching a 1440x900 desktop canvas; the helper only uses the
// width / height ratio when converting NDC → pixels, so actual numbers
// just need to be stable across assertions.
const VIEWPORT = { width: 1440, height: 900 };
const HALF_W = VIEWPORT.width * 0.5; // 720 → 1 NDC unit == 720 px along x
const HALF_H = VIEWPORT.height * 0.5; // 450 → 1 NDC unit == 450 px along y

// Build a projection that places a specific entity at a chosen screen-pixel
// delta from the mouse. Helpful because the real camera.project() is
// non-trivial to mock.
function projectionPlacingEntityAtPixelOffset(entityToPx) {
  return (wx, wz) => {
    // Look up by world position; we key entities by `x,z` in tests.
    const key = `${wx},${wz}`;
    const offset = entityToPx.get(key);
    if (!offset) return { ndcX: 99, ndcY: 99, ndcZ: 0 };
    const ndcX = offset.dxPx / HALF_W;
    const ndcY = offset.dyPx / HALF_H;
    return { ndcX, ndcY, ndcZ: 0 };
  };
}

test("findProximityEntity selects a worker at 12 px offset (inside 16 px fallback radius)", () => {
  const worker = { id: "w-1", x: 40, z: 30, displayName: "Alice" };
  // Entity projected at mouse + (12, 0) px.
  const entityToPx = new Map([[`${worker.x},${worker.z}`, { dxPx: 12, dyPx: 0 }]]);
  const result = findProximityEntity({
    entities: [worker],
    projectWorldToNdc: projectionPlacingEntityAtPixelOffset(entityToPx),
    mouseNdc: { x: 0, y: 0 },
    viewport: VIEWPORT,
    thresholdPx: 16,
  });
  assert.ok(result, "expected a hit at 12 px offset");
  assert.equal(result.entity.id, "w-1");
  assert.ok(result.pixelDistance > 11 && result.pixelDistance < 13, `pixelDistance ≈ 12, got ${result.pixelDistance}`);
});

test("findProximityEntity returns null when worker sits 40 px away (outside 16 px radius)", () => {
  const worker = { id: "w-2", x: 40, z: 30 };
  const entityToPx = new Map([[`${worker.x},${worker.z}`, { dxPx: 40, dyPx: 0 }]]);
  const result = findProximityEntity({
    entities: [worker],
    projectWorldToNdc: projectionPlacingEntityAtPixelOffset(entityToPx),
    mouseNdc: { x: 0, y: 0 },
    viewport: VIEWPORT,
    thresholdPx: 16,
  });
  assert.equal(result, null, "40 px away must not select (prevents cross-tile mis-selection)");
});

test("findProximityEntity picks the nearest entity in a dense cluster", () => {
  const near = { id: "w-near", x: 10, z: 10 };
  const mid = { id: "w-mid", x: 20, z: 20 };
  const far = { id: "w-far", x: 30, z: 30 };
  const entityToPx = new Map([
    [`${near.x},${near.z}`, { dxPx: 4, dyPx: 3 }], // 5 px
    [`${mid.x},${mid.z}`, { dxPx: 8, dyPx: 0 }], // 8 px
    [`${far.x},${far.z}`, { dxPx: 14, dyPx: 0 }], // 14 px
  ]);
  const result = findProximityEntity({
    entities: [far, mid, near], // deliberately unsorted input
    projectWorldToNdc: projectionPlacingEntityAtPixelOffset(entityToPx),
    mouseNdc: { x: 0, y: 0 },
    viewport: VIEWPORT,
    thresholdPx: 16,
  });
  assert.ok(result);
  assert.equal(result.entity.id, "w-near", "nearest in pixel space must win");
});

test("findProximityEntity skips entities where alive === false", () => {
  const deadClose = { id: "w-dead", x: 5, z: 5, alive: false };
  const liveFar = { id: "w-live", x: 6, z: 6, alive: true };
  const entityToPx = new Map([
    [`${deadClose.x},${deadClose.z}`, { dxPx: 2, dyPx: 0 }], // would win if alive
    [`${liveFar.x},${liveFar.z}`, { dxPx: 10, dyPx: 0 }],
  ]);
  const result = findProximityEntity({
    entities: [deadClose, liveFar],
    projectWorldToNdc: projectionPlacingEntityAtPixelOffset(entityToPx),
    mouseNdc: { x: 0, y: 0 },
    viewport: VIEWPORT,
    thresholdPx: 16,
  });
  assert.ok(result);
  assert.equal(result.entity.id, "w-live", "dead entities must not hijack the pick");
});

test("findProximityEntity with 24 px guard catches workers between 16-24 px", () => {
  const worker = { id: "w-guard", x: 50, z: 50 };
  const entityToPx = new Map([[`${worker.x},${worker.z}`, { dxPx: 20, dyPx: 0 }]]);
  const innerHit = findProximityEntity({
    entities: [worker],
    projectWorldToNdc: projectionPlacingEntityAtPixelOffset(entityToPx),
    mouseNdc: { x: 0, y: 0 },
    viewport: VIEWPORT,
    thresholdPx: 16,
  });
  assert.equal(innerHit, null, "20 px > 16 px fallback radius — no pick");

  const guardHit = findProximityEntity({
    entities: [worker],
    projectWorldToNdc: projectionPlacingEntityAtPixelOffset(entityToPx),
    mouseNdc: { x: 0, y: 0 },
    viewport: VIEWPORT,
    thresholdPx: 24,
  });
  assert.ok(guardHit, "20 px ≤ 24 px guard radius — build-tool suppressor sees it");
  assert.equal(guardHit.entity.id, "w-guard");
});

test("findProximityEntity returns null on malformed input without throwing", () => {
  assert.equal(findProximityEntity({}), null);
  assert.equal(findProximityEntity({ entities: null, projectWorldToNdc: () => null, mouseNdc: { x: 0, y: 0 }, viewport: VIEWPORT, thresholdPx: 16 }), null);
  assert.equal(
    findProximityEntity({
      entities: [{ id: "x", x: 0, z: 0 }],
      projectWorldToNdc: () => null,
      mouseNdc: { x: 0, y: 0 },
      viewport: { width: 0, height: 0 },
      thresholdPx: 16,
    }),
    null,
    "viewport with 0 extent must short-circuit",
  );
});

test("SceneRenderer source wires proximity fallback into #pickEntity and a build-tool guard", () => {
  // Defensive regression: if a future refactor removes the fallback call
  // or the guard branch, Entity Focus reverts to the broken baseline.
  const src = fs.readFileSync("src/render/SceneRenderer.js", "utf8");
  assert.match(src, /ENTITY_PICK_FALLBACK_PX\s*=\s*Number\(BALANCE\.renderHitboxPixels\?\.entityPickFallback\s*\?\?\s*24\)/, "fallback constant missing / changed");
  assert.match(src, /ENTITY_PICK_GUARD_PX\s*=\s*Number\(BALANCE\.renderHitboxPixels\?\.entityPickGuard\s*\?\?\s*36\)/, "guard constant missing / changed");
  assert.match(src, /#proximityNearestEntity\s*\(/, "proximity helper method missing");
  assert.match(
    src,
    /#proximityNearestEntity\(mouse,\s*ENTITY_PICK_FALLBACK_PX\)/,
    "pickEntity must invoke the 16 px fallback",
  );
  assert.match(
    src,
    /#proximityNearestEntity\(this\.mouse,\s*ENTITY_PICK_GUARD_PX\)/,
    "onPointerDown must invoke the 24 px build-guard",
  );
  // v0.10.1-n A3 — the 24 px guard semantics changed: instead of *blocking*
  // placement with a "click closer" hint, the guard now redirects the click
  // to entity-pick (the user clearly wanted the worker, not a tile). The
  // regression-defense text moves with it.
  assert.match(
    src,
    /Selecting nearby unit \(release the build tool to place\)/,
    "build-guard hint text (entity-pick redirect) must be present",
  );
});
