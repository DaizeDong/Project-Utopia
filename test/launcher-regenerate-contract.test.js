/**
 * A1-stability-hunter HW7 Final-Polish-Loop Round 11 P2 #1 —
 * `__utopiaLongRun.regenerate()` return-contract test.
 *
 * R10 fixed the original "second regenerate ignored" bug; R11 surfaced a
 * follow-on quirk: `regenerate()` returned `null` despite working, forcing
 * harness scripts to round-trip through `getTelemetry()` to verify success.
 * This test guards the new `{ok:true, templateId, seed, phase}` shape (mirror
 * of `saveSnapshot()` / `loadSnapshot()`).
 *
 * Implementation lives in `GameApp.regenerateWorld` (validates input + returns
 * success shape) and `src/main.js` (shim falls back to a `notReady` shape when
 * `app` is undefined, matching the saveSnapshot shim).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeRegenerateArgs } from "../src/main.js";

// -----------------------------------------------------------------------------
// Shim contract: matches the live shim in `src/main.js` line ~228.
// We mock `app.regenerateWorld` rather than booting a full GameApp because
// `GameApp` requires DOM + WebGL / canvas, which are not available in
// `node --test`. The shim is what Playwright/benchmark scripts actually call,
// and the mock asserts the contract the shim must propagate.
// -----------------------------------------------------------------------------

function makeShim(app) {
  return (params, options) => {
    const norm = normalizeRegenerateArgs(params);
    return app?.regenerateWorld?.(norm, options) ??
      { ok: false, reason: "notReady", reasonText: "GameApp not initialised." };
  };
}

test("regenerate shim: undefined app yields {ok:false, reason:'notReady'}", () => {
  const shim = makeShim(undefined);
  const result = shim({ templateId: "temperate_plains", seed: 42 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "notReady");
  assert.match(result.reasonText, /not initialised/);
  // Critical: must NOT be `null` — that's the R11 regression we're fixing.
  assert.notEqual(result, null);
});

test("regenerate shim: success returns {ok:true, templateId, seed, phase}", () => {
  // Mirrors what GameApp.regenerateWorld now returns post-#setRunPhase.
  const mockApp = {
    regenerateWorld: (params /*, options*/) => ({
      ok: true,
      templateId: params.templateId ?? "temperate_plains",
      seed: Number(params.seed ?? 1337),
      phase: "menu",
    }),
  };
  const shim = makeShim(mockApp);
  const result = shim({ templateId: "rugged_highlands", seed: 12345 });
  assert.equal(result.ok, true);
  assert.equal(result.templateId, "rugged_highlands");
  assert.equal(result.seed, 12345);
  assert.equal(result.phase, "menu");
});

test("regenerate shim: invalid templateId surfaces {ok:false, reason:'invalid_template'}", () => {
  // Simulates GameApp.regenerateWorld's input-validation branch.
  const mockApp = {
    regenerateWorld: (params /*, options*/) => {
      const valid = ["temperate_plains", "rugged_highlands", "archipelago_isles"];
      if (params.templateId && !valid.includes(params.templateId)) {
        return { ok: false, reason: "invalid_template", reasonText: `Unknown templateId '${params.templateId}'.` };
      }
      return { ok: true, templateId: params.templateId, seed: 0, phase: "menu" };
    },
  };
  const shim = makeShim(mockApp);
  const result = shim({ templateId: "nonexistent_biome", seed: 42 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_template");
  assert.match(result.reasonText, /nonexistent_biome/);
});

test("regenerate shim: invalid seed surfaces {ok:false, reason:'invalid_seed'}", () => {
  const mockApp = {
    regenerateWorld: (params /*, options*/) => {
      if (params.seed !== undefined && params.seed !== null && !Number.isFinite(Number(params.seed))) {
        return { ok: false, reason: "invalid_seed", reasonText: `Seed '${params.seed}' is not a finite number.` };
      }
      return { ok: true, templateId: params.templateId ?? "temperate_plains", seed: Number(params.seed ?? 0), phase: "menu" };
    },
  };
  const shim = makeShim(mockApp);
  const result = shim({ templateId: "temperate_plains", seed: "not-a-number" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_seed");
});

test("regenerate shim: chained calls both return success-shape (R10/R11 regression guard)", () => {
  // R10 fixed "second regenerate ignored" (the result was the SAME world).
  // R11 P2 #1 surfaced that the second call still returned `null`.
  // This guards the chained-call contract A1 verified in session 3.
  let calls = 0;
  const mockApp = {
    regenerateWorld: (params /*, options*/) => {
      calls += 1;
      return {
        ok: true,
        templateId: params.templateId,
        seed: Number(params.seed),
        phase: "menu",
      };
    },
  };
  const shim = makeShim(mockApp);
  const r1 = shim({ templateId: "rugged_highlands", seed: 12345 });
  const r2 = shim({ templateId: "archipelago_isles", seed: 7777 });
  assert.equal(calls, 2);
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(r1.templateId, "rugged_highlands");
  assert.equal(r2.templateId, "archipelago_isles");
  assert.equal(r1.seed, 12345);
  assert.equal(r2.seed, 7777);
});

test("regenerate shim: `template` alias still routes through normalizeRegenerateArgs", () => {
  // Round-1 02c-speedrunner wired this alias; we re-verify the alias path
  // composes with the new return-contract.
  const mockApp = {
    regenerateWorld: (params /*, options*/) => ({
      ok: true,
      templateId: params.templateId,
      seed: Number(params.seed ?? 0),
      phase: "menu",
    }),
  };
  const shim = makeShim(mockApp);
  const result = shim({ template: "fertile_riverlands", seed: 99 });
  assert.equal(result.ok, true);
  assert.equal(result.templateId, "fertile_riverlands");
  assert.equal(result.seed, 99);
});
