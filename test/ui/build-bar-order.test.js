// test/ui/build-bar-order.test.js
// v0.10.1-r6-PI (PI-devpanel-buildbar)
//
// Invariant: Demolish (data-tool="erase") sits at slot 2 of the rendered
// build bar — i.e. it is the FIRST static `data-tool` button in index.html
// (BuildToolbar.#injectSelectToolButton dynamically inserts a "select"
// button before it at runtime, so the rendered order is
// [select, erase, road, farm, lumber, warehouse, wall, bridge, quarry,
//  herb_garden, kitchen, smithy, clinic]).
//
// This test pins the static DOM order so a future template refactor can't
// silently re-bury Demolish in the middle of the bar (which is exactly the
// regression PI-devpanel-buildbar fixed in R6).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");

function extractBuildBarToolOrder(rawHtml) {
  // Narrow to the Build Tools tool-grid block so we don't pick up any
  // data-tool="…" that might appear in tooltips, comments, or other panels.
  // The grid contains nested <div class="build-cat-heading">…</div> rows, so
  // we can't just match the next </div>. Instead, scan to the ".hint" div
  // that immediately follows the tool-grid closing tag in index.html.
  const gridStart = rawHtml.indexOf('<div class="tool-grid">');
  if (gridStart === -1) {
    throw new Error("Could not locate <div class=\"tool-grid\"> in index.html");
  }
  // The tool-grid's closing </div> is followed by `<div class="hint"`. Use
  // that as the right-edge sentinel — far more robust than `indexOf("</div>")`
  // which would match the first inner build-cat-heading close.
  const sentinel = '<div class="hint"';
  const gridEnd = rawHtml.indexOf(sentinel, gridStart);
  if (gridEnd === -1) {
    throw new Error("Could not locate hint sentinel after tool-grid in index.html");
  }
  const slice = rawHtml.slice(gridStart, gridEnd);
  const toolRegex = /data-tool="([^"]+)"/g;
  const tools = [];
  let m;
  while ((m = toolRegex.exec(slice)) !== null) {
    tools.push(m[1]);
  }
  return tools;
}

describe("build bar tool order (PI-devpanel-buildbar)", () => {
  const order = extractBuildBarToolOrder(html);

  it("contains all 12 expected static build tools (select is runtime-injected)", () => {
    // 'select' is added by BuildToolbar.#injectSelectToolButton at runtime —
    // not present in the static index.html, hence excluded from this list.
    const expectedSet = new Set([
      "erase", "road", "farm", "lumber", "warehouse",
      "wall", "bridge", "quarry", "herb_garden",
      "kitchen", "smithy", "clinic",
    ]);
    for (const tool of expectedSet) {
      assert.ok(order.includes(tool), `expected build bar to contain data-tool="${tool}"`);
    }
  });

  it("Demolish (erase) is the first static data-tool button (slot 2 after runtime-injected Select)", () => {
    assert.strictEqual(
      order[0],
      "erase",
      `expected erase at static index 0 (renders at slot 2 after Select); got "${order[0]}". Full order: ${JSON.stringify(order)}`,
    );
  });

  it("Foundation row follows Demolish in the canonical road→warehouse order", () => {
    // erase(0), road(1), farm(2), lumber(3), warehouse(4).
    assert.deepStrictEqual(
      order.slice(0, 5),
      ["erase", "road", "farm", "lumber", "warehouse"],
      `Foundation row order drifted: ${JSON.stringify(order.slice(0, 5))}`,
    );
  });
});
