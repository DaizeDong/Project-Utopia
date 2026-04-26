// v0.8.2 Round-6 Wave-3 (01e-innovation Step 8) — i18n hygiene regression
// guard. Ensures index.html never contains CJK Unified Ideographs (the
// reviewer pain point §3.9 was the Logistics Legend block, which Step 5
// translated to English). This test catches future regressions where a
// developer copies a Chinese label into the English UI.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const indexPath = resolve(here, "..", "index.html");

test("index.html contains no CJK Unified Ideographs", () => {
  const html = readFileSync(indexPath, "utf8");
  // U+3400-U+9FFF covers the bulk of CJK Unified Ideographs (incl. Ext-A).
  const match = html.match(/[\u3400-\u9FFF]/u);
  if (match) {
    // Surface ~80 chars of context around the first hit to make debugging easy.
    const idx = html.indexOf(match[0]);
    const ctxStart = Math.max(0, idx - 40);
    const ctxEnd = Math.min(html.length, idx + 40);
    const context = html.slice(ctxStart, ctxEnd);
    assert.fail(`CJK character "${match[0]}" leaked into index.html near: "...${context}..."`);
  }
});
