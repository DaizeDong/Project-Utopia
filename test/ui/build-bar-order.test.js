// test/ui/build-bar-order.test.js
// v0.10.1-r13-Plan-R13-build-reorder (R13 user issue #4)
//
// Pins the canonical build-bar DOM order + hotkey mapping after the R13 reorder.
// SUPERSEDES the v0.10.1-r6-PI invariant (Demolish at slot 2): under R13 the
// build bar is regrouped by category and hotkeys are renumbered 1-9/-/= to
// match visual order. Demolish moves to slot 4 (end of Infrastructure row);
// Bridge moves next to Road; Quarry+Herbs move into Resource next to Farm+Lumber.
//
// Static DOM order (BuildToolbar.#injectSelectToolButton injects "select" at
// runtime before the first static button, so rendered slot N = static index
// N-1 + 1):
//   [select(rt), road, bridge, wall, erase, farm, lumber, quarry, herb_garden,
//    warehouse, kitchen, smithy, clinic]
//
// Canonical hotkey table:
//   1=road, 2=bridge, 3=wall, 4=erase, 5=farm, 6=lumber, 7=quarry, 8=herb_garden,
//   9=warehouse, kitchen=(no hotkey — 0 reserved for select), -=smithy, ==clinic.
//
// This test pins both the DOM order and the hotkey mapping so a future
// template refactor cannot silently re-bury a tool or scramble the digits.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");

function sliceToolGrid(rawHtml) {
  // Narrow to the Build Tools tool-grid block so we don't pick up any
  // data-tool="…" that might appear in tooltips, comments, or other panels.
  // The grid contains nested <div class="build-cat-heading">…</div> rows, so
  // we can't just match the next </div>. Instead, scan to the ".hint" div
  // that immediately follows the tool-grid closing tag in index.html.
  const gridStart = rawHtml.indexOf('<div class="tool-grid">');
  if (gridStart === -1) {
    throw new Error("Could not locate <div class=\"tool-grid\"> in index.html");
  }
  const sentinel = '<div class="hint"';
  const gridEnd = rawHtml.indexOf(sentinel, gridStart);
  if (gridEnd === -1) {
    throw new Error("Could not locate hint sentinel after tool-grid in index.html");
  }
  return rawHtml.slice(gridStart, gridEnd);
}

function extractBuildBarToolOrder(rawHtml) {
  const slice = sliceToolGrid(rawHtml);
  const toolRegex = /data-tool="([^"]+)"/g;
  const tools = [];
  let m;
  while ((m = toolRegex.exec(slice)) !== null) {
    tools.push(m[1]);
  }
  return tools;
}

function extractToolHotkeyMap(rawHtml) {
  const slice = sliceToolGrid(rawHtml);
  // Match each <button …data-tool="X" …>; within that tag, extract the
  // optional data-hotkey="Y". Use a non-greedy match bounded by the tag close.
  const btnRegex = /<button\b[^>]*?data-tool="([^"]+)"[^>]*?>/g;
  const map = {};
  let m;
  while ((m = btnRegex.exec(slice)) !== null) {
    const tool = m[1];
    const tag = m[0];
    const hk = tag.match(/data-hotkey="([^"]*)"/);
    map[tool] = hk ? hk[1] : null; // null = no hotkey attribute
  }
  return map;
}

describe("build bar tool order (Plan-R13-build-reorder)", () => {
  const order = extractBuildBarToolOrder(html);

  it("contains all 12 expected static build tools (select is runtime-injected)", () => {
    const expectedSet = new Set([
      "erase", "road", "farm", "lumber", "warehouse",
      "wall", "bridge", "quarry", "herb_garden",
      "kitchen", "smithy", "clinic",
    ]);
    for (const tool of expectedSet) {
      assert.ok(order.includes(tool), `expected build bar to contain data-tool="${tool}"`);
    }
    assert.strictEqual(order.length, 12, `expected exactly 12 static tools, got ${order.length}: ${JSON.stringify(order)}`);
  });

  it("matches the R13 canonical order: Infrastructure → Resource → Processing", () => {
    assert.deepStrictEqual(
      order,
      [
        // Infrastructure
        "road", "bridge", "wall", "erase",
        // Resource
        "farm", "lumber", "quarry", "herb_garden", "warehouse",
        // Processing
        "kitchen", "smithy", "clinic",
      ],
      `Build bar order drifted from R13 canonical: ${JSON.stringify(order)}`,
    );
  });
});

describe("build bar hotkey mapping (Plan-R13-build-reorder)", () => {
  const hotkeys = extractToolHotkeyMap(html);

  it("digits 1-9 map to tools in visual order", () => {
    assert.strictEqual(hotkeys.road, "1", `road: expected hotkey 1, got ${hotkeys.road}`);
    assert.strictEqual(hotkeys.bridge, "2", `bridge: expected hotkey 2, got ${hotkeys.bridge}`);
    assert.strictEqual(hotkeys.wall, "3", `wall: expected hotkey 3, got ${hotkeys.wall}`);
    assert.strictEqual(hotkeys.erase, "4", `erase: expected hotkey 4, got ${hotkeys.erase}`);
    assert.strictEqual(hotkeys.farm, "5", `farm: expected hotkey 5, got ${hotkeys.farm}`);
    assert.strictEqual(hotkeys.lumber, "6", `lumber: expected hotkey 6, got ${hotkeys.lumber}`);
    assert.strictEqual(hotkeys.quarry, "7", `quarry: expected hotkey 7, got ${hotkeys.quarry}`);
    assert.strictEqual(hotkeys.herb_garden, "8", `herb_garden: expected hotkey 8, got ${hotkeys.herb_garden}`);
    assert.strictEqual(hotkeys.warehouse, "9", `warehouse: expected hotkey 9, got ${hotkeys.warehouse}`);
  });

  it("kitchen has no hotkey (0 reserved for select)", () => {
    assert.strictEqual(hotkeys.kitchen, null, `kitchen should have no data-hotkey; got ${JSON.stringify(hotkeys.kitchen)}`);
  });

  it("smithy=- and clinic== fill the trailing two slots", () => {
    assert.strictEqual(hotkeys.smithy, "-", `smithy: expected hotkey '-', got ${hotkeys.smithy}`);
    assert.strictEqual(hotkeys.clinic, "=", `clinic: expected hotkey '=', got ${hotkeys.clinic}`);
  });

  it("no two tools share the same hotkey", () => {
    const seen = new Map();
    for (const [tool, hk] of Object.entries(hotkeys)) {
      if (hk === null) continue;
      if (seen.has(hk)) {
        assert.fail(`hotkey "${hk}" assigned to both ${seen.get(hk)} and ${tool}`);
      }
      seen.set(hk, tool);
    }
  });
});
