import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  getPressureLabelRank,
  heatLabelBudgetForZoom,
} from "../src/render/PressureLens.js";

test("heat label rank prefers actionable starvation labels over surplus noise", () => {
  const inputStarved = getPressureLabelRank({ kind: "heat_starved", label: "input starved", priority: 116, weight: 0.82 });
  const stoneEmpty = getPressureLabelRank({ kind: "heat_starved", label: "stone input empty", priority: 116, weight: 0.82 });
  const surplus = getPressureLabelRank({ kind: "heat_surplus", label: "supply surplus", priority: 118, weight: 0.9 });
  const warehouseIdle = getPressureLabelRank({ kind: "heat_starved", label: "warehouse idle", priority: 110, weight: 0.68 });

  assert.ok(inputStarved > stoneEmpty);
  assert.ok(stoneEmpty > surplus);
  assert.ok(surplus > warehouseIdle);
});

test("heat label budget caps normal zoom to five labels and expands when zoomed in", () => {
  assert.equal(heatLabelBudgetForZoom(1.12), 5);
  assert.ok(heatLabelBudgetForZoom(2.4) > heatLabelBudgetForZoom(1.12));
});

test("SceneRenderer label pass applies the heat label budget without reducing markers", () => {
  const src = fs.readFileSync("src/render/SceneRenderer.js", "utf8");

  assert.match(src, /heatLabelBudgetForZoom\(this\.camera\?\.zoom\)/);
  assert.match(src, /visibleCandidates\.slice\(0,\s*labelBudget\)/);
  assert.match(src, /pressureLensMarkers = buildHeatLens\(this\.state\)/);
});

test("SceneRenderer fallback instancing covers stress worker cap and clamps counts", () => {
  const src = fs.readFileSync("src/render/SceneRenderer.js", "utf8");

  assert.match(src, /const maxWorkers = 1200;/);
  assert.match(src, /visibleCount = Math\.min\(this\.workerEntities\.length,\s*capacity\)/);
  assert.match(src, /this\.workerMesh\.count = visibleCount/);
  assert.match(src, /#entityMeshUpdateIntervalSec\(totalEntities\)/);
  assert.match(src, /entityMeshUpdateAccumulatorSec >= entityUpdateIntervalSec/);
});
