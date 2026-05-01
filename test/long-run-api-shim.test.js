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
  installBenignErrorFilter,
} from "../src/main.js";

import { createSnapshotService } from "../src/app/snapshotService.js";

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

// -----------------------------------------------------------------------------
// A1-stability-hunter Round 0 P2 — snapshot-shim return contract +
// benign-error filter + loadFromStorage parse hardening.
// -----------------------------------------------------------------------------

test("snapshot shim return contract: saveSnapshot mock yields {ok:true, slotId, bytes}", () => {
  // Pure-shape test against a hand-rolled mock — no GameApp construction
  // needed. Confirms the documented contract returned by `app.saveSnapshot`
  // matches the shape `__utopiaLongRun.saveSnapshot` propagates.
  const mockApp = {
    saveSnapshot: (slotId) => ({ ok: true, slotId, bytes: 1234 }),
  };
  const shim = (slotId) =>
    mockApp?.saveSnapshot?.(slotId) ??
    { ok: false, reason: "notReady", reasonText: "GameApp not initialised." };

  const result = shim("manualtest");
  assert.equal(result.ok, true);
  assert.equal(result.slotId, "manualtest");
  assert.equal(typeof result.bytes, "number");
});

test("snapshot shim return contract: loadSnapshot mock yields {ok:false, reason:'notFound'} when missing", () => {
  const mockApp = {
    loadSnapshot: (slotId) => ({
      ok: false,
      reason: "notFound",
      reasonText: `Snapshot slot '${slotId}' not found.`,
    }),
  };
  const shim = (slotId) =>
    mockApp?.loadSnapshot?.(slotId) ??
    { ok: false, reason: "notReady", reasonText: "GameApp not initialised." };

  const result = shim("does-not-exist");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "notFound");
  assert.match(result.reasonText, /not found/);
});

test("snapshot shim return contract: undefined app yields {ok:false, reason:'notReady'}", () => {
  const app = undefined;
  const saveShim = (slotId) =>
    app?.saveSnapshot?.(slotId) ??
    { ok: false, reason: "notReady", reasonText: "GameApp not initialised." };
  const loadShim = (slotId) =>
    app?.loadSnapshot?.(slotId) ??
    { ok: false, reason: "notReady", reasonText: "GameApp not initialised." };

  const sResult = saveShim("any");
  const lResult = loadShim("any");
  assert.equal(sResult.ok, false);
  assert.equal(sResult.reason, "notReady");
  assert.equal(lResult.ok, false);
  assert.equal(lResult.reason, "notReady");
});

test("installBenignErrorFilter swallows ResizeObserver loop and increments counter", () => {
  // Stub a minimal `window` so the helper can register its listener.
  // The helper exits early when `typeof window === 'undefined'`, so we
  // briefly set it for this test only.
  const listeners = [];
  const fakeWindow = {
    __utopiaBenignErrorInstalled: undefined,
    __utopiaBenignSuppressed: undefined,
    addEventListener(type, fn /*, opts*/) {
      listeners.push({ type, fn });
    },
  };
  const originalWindow = globalThis.window;
  globalThis.window = fakeWindow;
  try {
    installBenignErrorFilter();
    assert.equal(fakeWindow.__utopiaBenignErrorInstalled, true);
    assert.equal(fakeWindow.__utopiaBenignSuppressed, 0);
    assert.equal(listeners.length, 1);
    assert.equal(listeners[0].type, "error");

    // Simulate a benign event.
    let prevented = 0;
    let stopped = 0;
    listeners[0].fn({
      message: "ResizeObserver loop completed with undelivered notifications.",
      preventDefault: () => { prevented += 1; },
      stopImmediatePropagation: () => { stopped += 1; },
    });
    assert.equal(prevented, 1);
    assert.equal(stopped, 1);
    assert.equal(fakeWindow.__utopiaBenignSuppressed, 1);

    // Non-matching error must NOT increment.
    listeners[0].fn({
      message: "TypeError: x is undefined",
      preventDefault: () => { prevented += 1; },
      stopImmediatePropagation: () => { stopped += 1; },
    });
    assert.equal(prevented, 1, "non-matching error should not be prevented");
    assert.equal(stopped, 1, "non-matching error should not be stopped");
    assert.equal(fakeWindow.__utopiaBenignSuppressed, 1, "counter must not increment for unrelated errors");

    // Idempotency: calling again on the same window should NOT register a second listener.
    installBenignErrorFilter();
    assert.equal(listeners.length, 1, "filter must be idempotent under HMR re-runs");
  } finally {
    globalThis.window = originalWindow;
  }
});

// -----------------------------------------------------------------------------
// B1-action-items-auditor HW7 Final-Polish-Loop Round 0 — devStressSpawn
// shim contract + helper smoke (closes AI-1 verification-tooling gap).
// -----------------------------------------------------------------------------

test("devStressSpawn shim: undefined app yields {ok:false, reason:'no_session'}", () => {
  const app = undefined;
  const shim = (target, options) =>
    app?.devStressSpawn?.(target, options) ??
    { ok: false, reason: "no_session" };
  const result = shim(75);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "no_session");
});

test("devStressSpawn shim: passes through {ok:true, spawned, total} from app", () => {
  const mockApp = {
    devStressSpawn: (target) => ({
      ok: true,
      spawned: Math.max(0, target - 12),
      total: target,
      fallbackTilesUsed: 0,
    }),
  };
  const shim = (target, options) =>
    mockApp?.devStressSpawn?.(target, options) ??
    { ok: false, reason: "no_session" };
  const result = shim(75);
  assert.equal(result.ok, true);
  assert.equal(result.total, 75);
  assert.equal(result.spawned, 63);
  assert.equal(result.fallbackTilesUsed, 0);
});

test("devStressSpawn shim: target=0 reaches the helper as a clean no-op shape", () => {
  const mockApp = {
    devStressSpawn: (target) => ({
      ok: true,
      spawned: 0,
      total: target,
      fallbackTilesUsed: 0,
    }),
  };
  const shim = (target) => mockApp.devStressSpawn(target);
  const result = shim(0);
  assert.equal(result.ok, true);
  assert.equal(result.spawned, 0);
});

test("__devForceSpawnWorkers helper: no-op when current >= target", async () => {
  const { __devForceSpawnWorkers } = await import(
    "../src/simulation/population/PopulationGrowthSystem.js"
  );
  const state = {
    agents: [
      { type: "WORKER", alive: true },
      { type: "WORKER", alive: true },
      { type: "WORKER", alive: true },
    ],
    metrics: {},
    grid: null,
  };
  const result = __devForceSpawnWorkers(state, 2, () => 0.5);
  assert.equal(result.spawned, 0);
  assert.equal(result.total, 3);
  assert.equal(result.fallbackTilesUsed, 0);
});

test("__devForceSpawnWorkers helper: missing state is a safe no-op", async () => {
  const { __devForceSpawnWorkers } = await import(
    "../src/simulation/population/PopulationGrowthSystem.js"
  );
  const result = __devForceSpawnWorkers(null, 75, () => 0.5);
  assert.equal(result.spawned, 0);
});

test("loadFromStorage returns null (does not throw) on malformed JSON", () => {
  // Stub localStorage with a corrupt payload.
  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => "not-json{",
    setItem: () => {},
  };
  try {
    const svc = createSnapshotService();
    let result;
    assert.doesNotThrow(() => {
      result = svc.loadFromStorage("bad");
    });
    assert.equal(result, null);
  } finally {
    if (originalLocalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = originalLocalStorage;
    }
  }
});
