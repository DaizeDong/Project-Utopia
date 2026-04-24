// v0.8.2 Round-5 Wave-2 (01d-mechanics-content Step 8): EntityFocusPanel
// renders a persistent worker list above #entityFocusBody so casual
// players can cycle through workers without relying on canvas picking.
// The list contains one <button data-entity-id="..."> per alive WORKER,
// marks the currently selected one with .selected, and the "Why is this
// worker doing this?" <details open data-focus-key="focus:why"> surface
// is promoted out of the casual-hidden/dev-only gate.
//
// Plan: assignments/homework6/Agent-Feedback-Loop/Round5/Plans/01d-mechanics-content.md

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SRC = fs.readFileSync("src/ui/panels/EntityFocusPanel.js", "utf8");
const HTML = fs.readFileSync("index.html", "utf8");

test("index.html contains #entityFocusWorkerList above #entityFocusBody", () => {
  const listIdx = HTML.indexOf('id="entityFocusWorkerList"');
  const bodyIdx = HTML.indexOf('id="entityFocusBody"');
  assert.ok(listIdx > 0, "#entityFocusWorkerList missing from index.html");
  assert.ok(bodyIdx > 0, "#entityFocusBody missing from index.html");
  assert.ok(
    listIdx < bodyIdx,
    "#entityFocusWorkerList must appear BEFORE #entityFocusBody so it sits on top",
  );
});

test("EntityFocusPanel exposes #renderWorkerList() and binds a click delegate", () => {
  assert.match(SRC, /#renderWorkerList\s*\(\s*\)/, "missing #renderWorkerList method");
  assert.match(SRC, /entityFocusWorkerList/, "panel should reference entityFocusWorkerList container");
  assert.match(
    SRC,
    /button\[data-entity-id\]/,
    "worker-list click delegate should look up button[data-entity-id]",
  );
  assert.match(
    SRC,
    /selectedEntityId\s*=\s*entityId/,
    "clicking a worker row should set state.controls.selectedEntityId",
  );
});

test("worker-list button carries data-entity-id and a .selected class for the chosen worker", () => {
  // The template builds rows as <button ... data-entity-id="ID" class="entity-worker-row{selectedClass}">
  assert.match(
    SRC,
    /entity-worker-row\$\{selectedClass\}/,
    "worker row class should append selectedClass for the chosen worker",
  );
  assert.match(
    SRC,
    /data-entity-id="\$\{escapeHtml\(w\.id\)\}"/,
    "worker row should carry escaped data-entity-id attribute",
  );
});

test("worker-list paginates (>20 workers shows +N more)", () => {
  assert.match(SRC, /PAGE_SIZE\s*=\s*20/, "paging constant PAGE_SIZE=20 missing");
  assert.match(SRC, /\+\$\{overflow\}\s*more/, "'+N more' footer should appear when >20 workers");
});

test("'Why is this worker doing this?' block is casual-visible (no casual-hidden / dev-only)", () => {
  // The details wrapper carries data-focus-key="focus:why" and is open by default.
  const idx = SRC.indexOf('data-focus-key="focus:why"');
  assert.ok(idx > 0, "focus:why details block missing");
  // Extract the block and assert it does NOT include the gate classes.
  const closeIdx = SRC.indexOf("</details>", idx);
  const block = SRC.slice(idx, closeIdx);
  assert.ok(
    !/casual-hidden/.test(block),
    "'focus:why' details must NOT carry casual-hidden class",
  );
  assert.ok(
    !/dev-only/.test(block),
    "'focus:why' details must NOT carry dev-only class",
  );
  // Assert Top Intents / Top Targets / Decision Context appear inside it.
  assert.match(block, /Top Intents:/);
  assert.match(block, /Top Targets:/);
  assert.match(block, /Decision Context:/);
});

test("GameApp.js wires Tab / Shift+Tab to cycle selected worker", () => {
  const gameApp = fs.readFileSync("src/app/GameApp.js", "utf8");
  assert.match(
    gameApp,
    /event\.key\s*===\s*"Tab"/,
    "GameApp keyboard handler should react to Tab",
  );
  assert.match(
    gameApp,
    /#cycleSelectedWorker/,
    "GameApp should expose a #cycleSelectedWorker helper",
  );
  // Guard: only during phase==='active' and only consume Tab when not typing.
  assert.match(
    gameApp,
    /session\.phase\s*===\s*"active"/,
    "Tab cycle should be gated on phase === 'active'",
  );
});
