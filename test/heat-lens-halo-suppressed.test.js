// v0.8.2 Round-6 Wave-1 02b-casual (Step 4 + 5) — Halo-label suppression
// Plan: assignments/homework6/Agent-Feedback-Loop/Round6/Plans/02b-casual.md
//
// Steps 4 + 5 demand that halo markers in the heat-lens overlay never
// produce a visible text label. Two layers guard this:
//   - PressureLens.buildHeatLens emits halo markers with `label: ""`
//     (Step 5; primary author 01a, this plan reaffirms via test).
//   - SceneRenderer.#updatePressureLensLabels suppresses the DOM label
//     entirely when the marker has an empty-string label (Step 4).
//
// 01b already covers "every halo marker has empty label" via
// test/heat-lens-halo-silent.test.js, and 01a covers the runtime
// regression via test/onboarding-noise-reduction.test.js. This file
// covers what 02b uniquely added: the SceneRenderer source contains a
// guard that produces `null` (skip) for empty-label markers, AND the
// halo-id prefix check exists as belt-and-braces.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildHeatLens } from "../src/render/PressureLens.js";
import { TILE } from "../src/config/constants.js";

function makeStarvedKitchenState() {
  const W = 20;
  const H = 20;
  const tiles = new Uint8Array(W * H).fill(TILE.GRASS);
  tiles[10 + 10 * W] = TILE.KITCHEN;
  return {
    grid: { width: W, height: H, tiles, tileSize: 1 },
    resources: { food: 0, meals: 0, wood: 0, stone: 0, herbs: 0, tools: 0, medicine: 0 },
    metrics: { warehouseDensity: null },
    agents: [],
    buildings: {},
  };
}

test("buildHeatLens emits halo markers with empty-string label (Step 5 reaffirmation)", () => {
  const markers = buildHeatLens(makeStarvedKitchenState());
  const halos = markers.filter((m) => String(m.id).startsWith("halo:"));
  assert.ok(halos.length > 0, "expected at least one halo marker for starved kitchen");
  for (const halo of halos) {
    assert.strictEqual(
      halo.label,
      "",
      `halo marker ${halo.id} leaked label="${halo.label}" — Step 5 expects empty string`,
    );
    assert.notStrictEqual(
      halo.label,
      "halo",
      `halo marker ${halo.id} has the literal "halo" label — Step 5 explicitly forbids this`,
    );
  }
});

test("SceneRenderer source contains an empty-label suppression branch (Step 4)", () => {
  // The SceneRenderer.js label-pass code path skips halo markers by
  // pushing null into the projection array when labelText === "".
  // This static-source assertion guards against a future refactor that
  // would re-render empty-label markers.
  const SRC = fs.readFileSync("src/render/SceneRenderer.js", "utf8");
  // The exact guard: if labelText is "", the inner block must continue
  // (push null and skip the projected entry). Search for the structural
  // pattern.
  assert.match(
    SRC,
    /labelText\s*===\s*""/,
    "SceneRenderer must contain an empty-label guard for halo markers",
  );
  // And the projected.push(null) inside the if-block.
  const guardIdx = SRC.indexOf("labelText === \"\"");
  assert.ok(guardIdx > 0, "labelText guard not found");
  const window = SRC.slice(guardIdx, guardIdx + 200);
  assert.match(
    window,
    /projected\.push\(null\)/,
    "empty-label guard must push null into the projected array (skip rendering)",
  );
});

test("SceneRenderer source no longer renders the literal 'halo' string for halo markers", () => {
  const SRC = fs.readFileSync("src/render/SceneRenderer.js", "utf8");
  // The old code path used `marker.label ?? marker.kind ?? ""`. With Step 5
  // halo markers now carry label = "", so even if marker.kind === "halo"
  // (which it isn't anyway), the empty-string label takes precedence and
  // the suppression branch (Step 4) catches it. Guard regression: ensure
  // we never fall through to rendering `marker.kind` for empty-label
  // entries (the old textContent path).
  // The structural invariant: where labelText is computed, the rawLabel === ""
  // case explicitly returns "" instead of falling through to kind.
  assert.match(
    SRC,
    /rawLabel\s*===\s*""/,
    "SceneRenderer label resolution must short-circuit when rawLabel is empty (do not fall through to marker.kind)",
  );
});
