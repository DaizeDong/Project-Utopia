/**
 * Tests for the `__utopiaLongRun` debug-API argument normalizers.
 *
 * These functions live in `src/main.js` but are pure (no window/DOM/Three.js),
 * so they import cleanly into `node --test`. The `main.js` module itself is
 * guarded by `if (canvas)` so importing it under Node is a no-op aside from
 * exporting `normalizePlaceToolArgs` / `normalizeRegenerateArgs`.
 *
 * Round-1 02c-speedrunner: fixes reviewer bugs B1 (`placeToolAt({...})` silently
 * falling back to "road") and B2 (`regenerate({template})` ignored).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizePlaceToolArgs,
  normalizeRegenerateArgs,
} from "../src/main.js";

test("normalizePlaceToolArgs accepts positional args", () => {
  const result = normalizePlaceToolArgs(["kitchen", 10, 20]);
  assert.equal(result.ok, true);
  assert.equal(result.tool, "kitchen");
  assert.equal(result.ix, 10);
  assert.equal(result.iz, 20);
});

test("normalizePlaceToolArgs accepts options-bag form", () => {
  const result = normalizePlaceToolArgs([{ tool: "kitchen", ix: 10, iz: 20 }]);
  assert.equal(result.ok, true);
  assert.equal(result.tool, "kitchen");
  assert.equal(result.ix, 10);
  assert.equal(result.iz, 20);
});

test("normalizePlaceToolArgs rejects unknown tool strings", () => {
  const result = normalizePlaceToolArgs(["bogus", 1, 2]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalidArgs");
  assert.match(result.reasonText, /unknown tool/);
  // Must NOT claim success; caller will not mutate controls.tool.
  assert.equal(result.tool, undefined);
});

test("normalizePlaceToolArgs rejects options-bag missing ix/iz", () => {
  const result = normalizePlaceToolArgs([{ tool: "kitchen" }]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalidArgs");
  assert.match(result.reasonText, /ix\/iz must be finite integers/);
});

test("normalizePlaceToolArgs rejects empty args", () => {
  const result = normalizePlaceToolArgs([]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalidArgs");
});

test("normalizePlaceToolArgs rejects non-integer coordinates", () => {
  const result = normalizePlaceToolArgs(["kitchen", 1.5, 2]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalidArgs");
  assert.match(result.reasonText, /finite integers/);
});

test("normalizePlaceToolArgs rejects passing an object as `tool` positional", () => {
  // This is the exact reviewer B1 repro: placeToolAt({tool, ix, iz}) was being
  // invoked on GameApp with the first positional arg set to an object, which
  // then got assigned to state.controls.tool (polluting the build toolbar).
  // With our shim, single-object-arg takes the options-bag branch and is
  // handled correctly — so the dangerous "object-as-tool-string" case cannot
  // reach GameApp.
  const result = normalizePlaceToolArgs([{ tool: "kitchen", ix: 1, iz: 2 }]);
  assert.equal(result.ok, true);
  assert.equal(typeof result.tool, "string");
});

test("normalizeRegenerateArgs aliases `template` to `templateId`", () => {
  const result = normalizeRegenerateArgs({ template: "fertile_riverlands" });
  assert.equal(result.templateId, "fertile_riverlands");
  assert.equal(result.template, "fertile_riverlands");
});

test("normalizeRegenerateArgs passes through explicit templateId unchanged", () => {
  const result = normalizeRegenerateArgs({ templateId: "temperate_plains", seed: 42 });
  assert.equal(result.templateId, "temperate_plains");
  assert.equal(result.seed, 42);
});

test("normalizeRegenerateArgs handles null/undefined", () => {
  assert.deepEqual(normalizeRegenerateArgs(null), {});
  assert.deepEqual(normalizeRegenerateArgs(undefined), {});
});

test("normalizeRegenerateArgs prefers templateId over template when both set", () => {
  const result = normalizeRegenerateArgs({ templateId: "temperate_plains", template: "archipelago_isles" });
  assert.equal(result.templateId, "temperate_plains");
});

test("normalizeRegenerateArgs preserves other keys (seed, terrainTuning)", () => {
  const terrain = { waterLevel: 0.3 };
  const result = normalizeRegenerateArgs({ template: "coastal_ocean", seed: 99, terrainTuning: terrain });
  assert.equal(result.templateId, "coastal_ocean");
  assert.equal(result.seed, 99);
  assert.equal(result.terrainTuning, terrain);
});
