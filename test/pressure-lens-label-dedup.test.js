// v0.8.2 Round-6 Wave-1 (01c-ui Step 9) — pressure-label dedup tests.
//
// Plan: assignments/homework6/Agent-Feedback-Loop/Round6/Plans/01c-ui.md
//
// `dedupPressureLabels(entries, opts)` is the pure helper that
// `SceneRenderer#updatePressureLensLabels` calls in Pass 2 to collapse
// repeat label-strings and bucket-overlapping markers. Exported separately
// from PressureLens.js so this test does not need a Three.js context.

import test from "node:test";
import assert from "node:assert/strict";

import { dedupPressureLabels } from "../src/render/PressureLens.js";

test("same-label dedup: 4 'west lumber route' clustered → 1 visible × 4", () => {
  const entries = [
    { idx: 0, px: 100, py: 100, label: "west lumber route", weight: 0.9 },
    { idx: 1, px: 105, py: 102, label: "west lumber route", weight: 0.6 },
    { idx: 2, px: 110, py: 108, label: "west lumber route", weight: 0.5 },
    { idx: 3, px: 115, py: 105, label: "west lumber route", weight: 0.4 },
  ];
  const decisions = dedupPressureLabels(entries, { nearPx: 24, bucketPx: 32 });
  const visible = decisions.filter((d) => d.keep);
  assert.equal(visible.length, 1, "should dedup to a single primary label");
  assert.equal(visible[0].count, 4, "primary should report count=4");
  // Centroid roughly in the middle.
  assert.ok(visible[0].cx > 95 && visible[0].cx < 120, `cx=${visible[0].cx}`);
});

test("same-label far-apart: 2 'east trade route' >> nearPx → both kept", () => {
  const entries = [
    { idx: 0, px: 50, py: 50, label: "east trade route", weight: 0.9 },
    { idx: 1, px: 400, py: 400, label: "east trade route", weight: 0.8 },
  ];
  const decisions = dedupPressureLabels(entries, { nearPx: 24, bucketPx: 32 });
  const visible = decisions.filter((d) => d.keep);
  assert.equal(visible.length, 2, "two far-apart same-label markers must both render");
});

test("different-label same bucket: heaviest wins, lighter hidden", () => {
  const entries = [
    { idx: 0, px: 100, py: 100, label: "supply surplus", weight: 0.4 },
    { idx: 1, px: 102, py: 101, label: "input starved", weight: 0.9 },
  ];
  const decisions = dedupPressureLabels(entries, { nearPx: 24, bucketPx: 32 });
  const visible = decisions.filter((d) => d.keep);
  assert.equal(visible.length, 1);
  // Heaviest survives.
  assert.equal(visible[0].count ?? 1, 1);
});

test("different-label far apart: both kept", () => {
  const entries = [
    { idx: 0, px: 50, py: 50, label: "supply surplus", weight: 0.4 },
    { idx: 1, px: 500, py: 500, label: "input starved", weight: 0.9 },
  ];
  const decisions = dedupPressureLabels(entries, { nearPx: 24, bucketPx: 32 });
  const visible = decisions.filter((d) => d.keep);
  assert.equal(visible.length, 2);
});

test("empty input → empty decisions", () => {
  const decisions = dedupPressureLabels([], { nearPx: 24, bucketPx: 32 });
  assert.deepEqual(decisions, []);
});

test("single entry → trivially kept with count=1", () => {
  const decisions = dedupPressureLabels([
    { idx: 0, px: 100, py: 100, label: "halo", weight: 0.5 },
  ]);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].keep, true);
  assert.equal(decisions[0].count ?? 1, 1);
});

test("highest-weight entry survives same-label dedup", () => {
  const entries = [
    { idx: 0, px: 100, py: 100, label: "north timber gate", weight: 0.3 },
    { idx: 1, px: 105, py: 102, label: "north timber gate", weight: 0.95 }, // heaviest
    { idx: 2, px: 110, py: 108, label: "north timber gate", weight: 0.2 },
  ];
  const decisions = dedupPressureLabels(entries, { nearPx: 24, bucketPx: 32 });
  // The heaviest's slot is kept; its decision has count=3.
  assert.equal(decisions[1].keep, true);
  assert.equal(decisions[1].count, 3);
  // Others hidden.
  assert.equal(decisions[0].keep, false);
  assert.equal(decisions[2].keep, false);
});
