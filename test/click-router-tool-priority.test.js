// v0.10.1-A3 R3 — click-router tool-priority guards.
//
// Two concerns are pinned by this file:
//
//   1. `decidePointerTarget` (the pure pointer-priority helper extracted from
//      SceneRenderer#onPointerDown) must NOT route LMB clicks into tile-
//      inspect when an active build tool is selected. The first-impression
//      reviewer reported that selecting Road and clicking grass surfaced a
//      tile inspector popup instead of laying a road segment. Even though
//      the priority logic was already in place (see
//      scene-renderer-pointer-priority.test.js), we add an explicit guard
//      here that asserts:
//        - active tool != null && != "inspect" && != "select" → "place"
//          for any combination of (tilePlaceable=true, entityNearby=false)
//        - inspect / select / null → never "place"
//
//   2. The BuildToolbar second-click-toggle behaviour: pressing the
//      hotkey for the already-active tool should return controls.tool to
//      "select" so the next LMB inspects a tile (the legacy behaviour kept
//      the same tool active forever, which made it impossible to inspect
//      a tile without explicitly clicking the Select button — a button the
//      first-impression reviewer never discovered). The toggle is also the
//      escape hatch for the tile-inspector spec ("第二次点同一 build button
//      切 toggle 工具时，明确 set state.controls.activeTool = null").
//
// Both concerns are unit-tested without standing up a full SceneRenderer or
// a DOM, by exercising the pure helper and the BuildToolbar regression
// pattern via a source-text guard (the same approach
// entity-pick-hitbox.test.js uses for SceneRenderer wiring assertions).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { decidePointerTarget } from "../src/render/SceneRenderer.js";

// --------- Section 1: decidePointerTarget exhaustive priority matrix ---------

const PLACEMENT_TOOLS = [
  "road", "farm", "lumber", "quarry", "herb_garden",
  "warehouse", "kitchen", "smithy", "clinic", "wall", "gate",
];

for (const tool of PLACEMENT_TOOLS) {
  test(`active tool "${tool}" + legal tile + no entity nearby → "place" (never inspect)`, () => {
    const decision = decidePointerTarget({
      activeTool: tool,
      entityNearby: false,
      tilePlaceable: true,
      tileOccupiedByEntity: false,
    });
    assert.equal(
      decision,
      "place",
      `tool=${tool}: LMB on legal tile must place, not open tile inspector`,
    );
  });
}

test("active tool with entity nearby (inside 14 px guard) → entity-pick wins", () => {
  // The 14 px guard explicitly captures clicks that land on a worker
  // sprite; the placement is suppressed in favour of selecting the unit.
  // R2 F1 tightened the guard from 36 → 14 px so this only fires when the
  // user is clearly aiming at the unit, not "near" one.
  const decision = decidePointerTarget({
    activeTool: "road",
    entityNearby: true,
    tilePlaceable: true,
    tileOccupiedByEntity: false,
  });
  assert.equal(decision, "select");
});

test("inspect / select / null tools never enter the place branch", () => {
  for (const tool of ["inspect", "select", null, undefined, ""]) {
    const decision = decidePointerTarget({
      activeTool: tool,
      entityNearby: false,
      tilePlaceable: true,
      tileOccupiedByEntity: false,
    });
    assert.notEqual(
      decision,
      "place",
      `tool=${String(tool)}: must not place; got ${decision}`,
    );
  }
});

// --------- Section 2: BuildToolbar second-click toggle wiring ---------

test("BuildToolbar source: second-click on the same tool returns to 'select'", () => {
  // Defensive regression: if the toggle is removed, build-tool stickiness
  // returns and the first-impression P0 (no way to inspect a tile after a
  // build without finding the Select button) reopens.
  const src = fs.readFileSync("src/ui/tools/BuildToolbar.js", "utf8");
  // The toggle branch must:
  //   (a) compare the incoming tool to the currently-active tool;
  //   (b) early-return after setting `controls.tool = "select"`.
  assert.match(
    src,
    /c\.tool\s*===\s*tool\s*&&\s*tool\s*!==\s*"select"/,
    "toggle guard (`c.tool === tool && tool !== 'select'`) missing",
  );
  assert.match(
    src,
    /c\.tool\s*=\s*"select"/,
    "toggle branch must reset controls.tool to 'select'",
  );
  assert.match(
    src,
    /Tool deselected/,
    "toggle status message must surface so players see the mode change",
  );
});

// --------- Section 3: tile-inspector key-hint must not re-introduce B/R/T ---

test("SceneRenderer source: deprecated 'B = build · R = road · T = fertility' hint is gone", () => {
  // A7-rationality-audit + A3-first-impression both flagged this hint.
  // Guard against the literal HTML row returning in a refactor. We match
  // the rendered HTML form (with `&nbsp;`) so the assertion ignores the
  // explanatory comment block above the replacement push() call, which
  // intentionally references the deprecated string.
  const src = fs.readFileSync("src/render/SceneRenderer.js", "utf8");
  assert.ok(
    !/B = build &nbsp;/.test(src),
    "the rendered 'B = build &nbsp;·&nbsp; R = road &nbsp;·&nbsp; T = fertility' tooltip row must NOT reappear",
  );
  assert.match(
    src,
    /Press 1-12 to select a build tool/,
    "the corrected number-row hint must remain in the tile tooltip",
  );
});

// --------- Section 4: Help dialog 'Open the Build (top-left)' must be gone ---

test("index.html Help: 'Open the Build panel (top-left)' is replaced with right-sidebar guidance", () => {
  const html = fs.readFileSync("index.html", "utf8");
  assert.ok(
    !/Open the <b>Build<\/b> panel \(top-left\)/.test(html),
    "the misleading 'Build panel (top-left)' Help text must be gone (the panel lives in the right sidebar)",
  );
  assert.match(
    html,
    /Open the <b>Build<\/b> tab in the right sidebar/,
    "the corrected Help text pointing players at the right sidebar must be present",
  );
});
