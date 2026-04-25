// test/index-html-tool-cost-consistency.test.js
// v0.8.2 Round-5b (02a-rimworld-veteran Step 4.2)
// Parses index.html tool button tooltips and verifies they match BUILD_COST.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { BUILD_COST } from "../src/config/balance.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, "../index.html"), "utf8");

function parseToolCostsFromHtml(html) {
  const results = {};
  const btnRegex = /data-tool="([^"]+)"[^>]*title="([^"]+)"/g;
  let m;
  while ((m = btnRegex.exec(html)) !== null) {
    const tool = m[1];
    const title = m[2];
    // Parse "N wood", "N stone", "N herbs" from title
    const wood = title.match(/(\d+)\s*wood/);
    const stone = title.match(/(\d+)\s*stone/);
    const herbs = title.match(/(\d+)\s*herbs/);
    results[tool] = {
      wood: wood ? Number(wood[1]) : undefined,
      stone: stone ? Number(stone[1]) : undefined,
      herbs: herbs ? Number(herbs[1]) : undefined,
    };
  }
  return results;
}

describe("index.html tool tooltip cost consistency with BUILD_COST", () => {
  const parsed = parseToolCostsFromHtml(html);

  const toCheck = ["kitchen", "smithy", "clinic", "warehouse", "farm", "lumber", "quarry", "herb_garden"];

  for (const tool of toCheck) {
    it(`${tool} tooltip matches BUILD_COST`, () => {
      const bc = BUILD_COST[tool];
      const tp = parsed[tool];
      if (!bc || !tp) return; // skip tools not in BUILD_COST or not in HTML
      if (bc.wood !== undefined && tp.wood !== undefined) {
        assert.strictEqual(tp.wood, bc.wood,
          `${tool}: tooltip wood=${tp.wood} but BUILD_COST wood=${bc.wood}`);
      }
      if (bc.stone !== undefined && tp.stone !== undefined) {
        assert.strictEqual(tp.stone, bc.stone,
          `${tool}: tooltip stone=${tp.stone} but BUILD_COST stone=${bc.stone}`);
      }
      if (bc.herbs !== undefined && tp.herbs !== undefined) {
        assert.strictEqual(tp.herbs, bc.herbs,
          `${tool}: tooltip herbs=${tp.herbs} but BUILD_COST herbs=${bc.herbs}`);
      }
    });
  }
});
