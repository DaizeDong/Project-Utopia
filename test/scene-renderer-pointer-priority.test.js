import test from "node:test";
import assert from "node:assert/strict";

import { decidePointerTarget } from "../src/render/SceneRenderer.js";

// v0.10.1-n A3 — F2 fix: when a placement tool is active, a left-click on
// a legal tile must place the tile, NOT silently select a wandering animal
// inside ENTITY_PICK_FALLBACK_PX. Entity-pick is a fallback only when the
// player is clearly aiming at a unit (24 px guard annulus) or when the
// placement was rejected because the tile is occupied by an entity.
//
// `decidePointerTarget` is the pure helper extracted from
// SceneRenderer#onPointerDown so the priority decision can be unit-tested
// without instantiating a WebGL renderer.

test("placement tool with legal tile and no nearby entity → place", () => {
  const decision = decidePointerTarget({
    activeTool: "road",
    entityNearby: false,
    tilePlaceable: true,
    tileOccupiedByEntity: false,
  });
  assert.equal(decision, "place");
});

test("placement tool with illegal tile (e.g. water) → place (so the rejection toast surfaces)", () => {
  const decision = decidePointerTarget({
    activeTool: "road",
    entityNearby: false,
    tilePlaceable: false,
    tileOccupiedByEntity: false,
  });
  // The reviewer's complaint: placing on water silently became "Selected
  // Bear-20". The fix surfaces the build-rejection reason instead, so the
  // decision returns "place" (the placement code-path emits the red toast).
  assert.equal(decision, "place");
});

test("placement tool with tile occupied by entity → fall through to entity-pick", () => {
  const decision = decidePointerTarget({
    activeTool: "road",
    entityNearby: false,
    tilePlaceable: false,
    tileOccupiedByEntity: true,
  });
  assert.equal(decision, "select");
});

test("placement tool inside the 24 px guard annulus → entity-pick wins (user wanted the worker)", () => {
  const decision = decidePointerTarget({
    activeTool: "road",
    entityNearby: true,
    tilePlaceable: true,
    tileOccupiedByEntity: false,
  });
  assert.equal(decision, "select");
});

test("select tool with nearby entity → entity-pick", () => {
  const decision = decidePointerTarget({
    activeTool: "select",
    entityNearby: true,
    tilePlaceable: true,
    tileOccupiedByEntity: false,
  });
  assert.equal(decision, "select");
});

test("inspect tool always selects (never places)", () => {
  const decision = decidePointerTarget({
    activeTool: "inspect",
    entityNearby: false,
    tilePlaceable: true,
    tileOccupiedByEntity: false,
  });
  assert.equal(decision, "select");
});

test("null/undefined tool falls through to select-mode semantics", () => {
  assert.equal(
    decidePointerTarget({
      activeTool: null,
      entityNearby: false,
      tilePlaceable: true,
      tileOccupiedByEntity: false,
    }),
    "select",
  );
  assert.equal(
    decidePointerTarget({
      activeTool: undefined,
      entityNearby: true,
      tilePlaceable: true,
      tileOccupiedByEntity: false,
    }),
    "select",
  );
});
