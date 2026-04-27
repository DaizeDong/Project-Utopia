import test from "node:test";
import assert from "node:assert/strict";

import { formatToastText } from "../src/render/SceneRenderer.js";

// v0.8.2 Round-0 01b — Build-feedback layer unit tests.
// formatToastText is a pure helper that converts a BuildSystem result object
// into the short string shown at the click point (floating toast). It also
// supports an optional `resources` argument so an "insufficientResource"
// failure can be rendered as a concrete shortfall summary rather than the
// generic "Insufficient resources." line.

test("formatToastText renders spent-cost summary on a successful build", () => {
  const result = {
    ok: true,
    reason: "",
    reasonText: "",
    cost: { food: 0, wood: 5, stone: 0, herbs: 0 },
  };
  assert.equal(formatToastText(result), "-5 wood");
});

test("formatToastText joins multiple non-zero cost resources on success", () => {
  const result = {
    ok: true,
    cost: { food: 0, wood: 2, stone: 3, herbs: 0 },
  };
  // Deterministic order: food, wood, stone, herbs (driven by RESOURCE_KEYS).
  assert.equal(formatToastText(result), "-2 wood, -3 stone");
});

test("formatToastText falls back to +built when all costs are zero", () => {
  const result = { ok: true, cost: { food: 0, wood: 0, stone: 0, herbs: 0 } };
  assert.equal(formatToastText(result), "+built");
});

test("formatToastText produces a shortfall string for insufficientResource", () => {
  const result = {
    ok: false,
    reason: "insufficientResource",
    reasonText: "Insufficient resources.",
    cost: { food: 0, wood: 8, stone: 6, herbs: 0 },
  };
  const resources = { food: 100, wood: 5, stone: 4, herbs: 50 };
  assert.equal(formatToastText(result, resources), "Need 3 more wood, 2 more stone");
});

test("formatToastText falls back to reasonText for non-resource failures", () => {
  const result = {
    ok: false,
    reason: "occupiedTile",
    reasonText: "Clear the farm before building here.",
  };
  assert.equal(formatToastText(result), "Clear the farm before building here.");
});

test("formatToastText handles insufficientResource without resources arg by returning reasonText", () => {
  const result = {
    ok: false,
    reason: "insufficientResource",
    reasonText: "Insufficient resources.",
    cost: { food: 0, wood: 8 },
  };
  assert.equal(formatToastText(result), "Insufficient resources.");
});

test("formatToastText yields 'blocked' when given a malformed input", () => {
  assert.equal(formatToastText(null), "blocked");
  assert.equal(formatToastText(undefined), "blocked");
  assert.equal(formatToastText({ ok: false }), "blocked");
});
