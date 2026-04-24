// v0.8.2 Round-5 Wave-2 (01a-onboarding Step 6): SceneRenderer's
// #onPointerDown auto-expands the #entityFocusOverlay <details> on first
// successful entity pick. We verify the contract via source inspection
// (same pattern used by test/entity-pick-hitbox.test.js for
// #onPointerDown / ENTITY_PICK_GUARD_PX).
//
// Plan: assignments/homework6/Agent-Feedback-Loop/Round5/Plans/01a-onboarding.md

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("SceneRenderer.#onPointerDown expands the entity focus overlay after a successful pick", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src/render/SceneRenderer.js"),
    "utf8",
  );
  // Anchor: the auto-expand shim runs after selectedEntityId is set and
  // before onSelectEntity fires. Match the essential contract.
  assert.match(
    src,
    /getElementById\(\s*"entityFocusOverlay"\s*\)/,
    "expected SceneRenderer to reference entityFocusOverlay by id",
  );
  assert.match(
    src,
    /overlay\.open\s*=\s*true/,
    "expected SceneRenderer to open the overlay (overlay.open = true)",
  );
});

test("index.html ships the entity focus overlay with the open attribute by default", () => {
  const html = fs.readFileSync(
    path.join(process.cwd(), "index.html"),
    "utf8",
  );
  assert.match(
    html,
    /<details\s+id="entityFocusOverlay"\s+open\b/,
    "expected <details id=\"entityFocusOverlay\" open> in index.html",
  );
});

test("auto-expand shim minimally guards typeof document (safe in headless)", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src/render/SceneRenderer.js"),
    "utf8",
  );
  // We want to ensure the shim does not throw on node:test/headless runs —
  // confirm `typeof document` guard appears in the file.
  assert.match(
    src,
    /typeof\s+document\s*!==\s*"undefined"/,
    "expected a typeof document guard near the overlay auto-expand shim",
  );
});
