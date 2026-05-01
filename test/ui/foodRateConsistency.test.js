// v0.10.1-n (A7-rationality-audit P0 #2) — Food rate headline ≡ breakdown.
// Plan: assignments/homework7/Final-Polish-Loop/Round0/Plans/A7-rationality-audit.md
//
// A7 surfaced a 14× disagreement between the Food headline ("▼ -562.4/min")
// and its own parenthetical breakdown ("(cons -39 / spoil -2)" → -41/min).
// Root cause: the headline used a stock-delta sample
//   (snap.food - prev.food) / dt * 60
// while the breakdown read state.metrics.foodConsumedPerMin /
// foodSpoiledPerMin from ResourceSystem's per-min accumulator. Warehouse
// deliveries / scenario re-stocks crossing the 3-sec rate window inflated
// the stock-delta sample without affecting the metric counters.
//
// Fix: derive the headline from the SAME accumulator the breakdown reads
// (`prod - cons - spoil`). This test pins the invariant so future refactors
// cannot regress.
//
// We test the deriveRate() math via a focused stub HUDController that
// exercises the rate-window flush path with a controlled state.metrics.

import test from "node:test";
import assert from "node:assert/strict";

import { HUDController } from "../../src/ui/hud/HUDController.js";
import { createInitialGameState } from "../../src/entities/EntityFactory.js";

function makeNode() {
  return {
    textContent: "",
    style: {},
    attrs: {},
    dataset: {},
    children: [],
    setAttribute(key, value) { this.attrs[key] = value; },
    getAttribute(key) {
      return Object.prototype.hasOwnProperty.call(this.attrs, key) ? this.attrs[key] : null;
    },
    removeAttribute(key) { delete this.attrs[key]; },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    removeChild() {},
    classList: { contains: () => false, add: () => {}, remove: () => {}, toggle: () => {} },
    matches() { return false; },
    closest() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

function makeDocStub() {
  const nodeCache = new Map();
  return {
    body: { classList: { contains: () => false, add: () => {}, remove: () => {} } },
    getElementById(id) {
      let n = nodeCache.get(id);
      if (!n) { n = makeNode(); nodeCache.set(id, n); }
      return n;
    },
  };
}

function withStubbedDocument(doc, fn) {
  const prev = globalThis.document;
  globalThis.document = doc;
  try { return fn(); } finally { globalThis.document = prev; }
}

test("food headline rate equals prod - cons - spoil from state.metrics", () => {
  withStubbedDocument(makeDocStub(), () => {
    const state = createInitialGameState({ seed: 1337 });
    // Seed the metrics accumulator with the kind of numbers ResourceSystem
    // produces every 3 sec — non-trivial cons + spoil.
    state.metrics.foodProducedPerMin  = 12;
    state.metrics.foodConsumedPerMin  = 39;
    state.metrics.foodSpoiledPerMin   = 2;
    state.metrics.woodProducedPerMin  = 0;
    state.metrics.woodConsumedPerMin  = 0;
    state.metrics.timeSec = 100;

    const hud = new HUDController(state);
    // Prime the snapshot at sim 100s, then push to 103s so the rate window
    // (RATE_WINDOW_SEC = 3) flushes on the second render. Resource values
    // can be anything — the new derive path ignores stock-delta when the
    // per-min metrics are present.
    state.resources.food = 200;
    hud.render();
    state.metrics.timeSec = 103;
    state.resources.food = 100; // would yield -2000/min by stock-delta
    hud.render();

    const expected = 12 - 39 - 2; // = -29 (matches "(prod +12 / cons -39 / spoil -2)")
    const headline = hud._lastComputedRates?.food;
    assert.ok(Number.isFinite(headline), `headline rate must be a finite number, got ${headline}`);
    assert.equal(
      Math.round(headline),
      expected,
      `headline (${headline.toFixed(2)}) must equal prod-cons-spoil (${expected}); ` +
      `the previous stock-delta path returned ~-2000/min in this scenario, a 70× lie`,
    );
  });
});

test("falls back to stock-delta when per-min metrics are absent", () => {
  withStubbedDocument(makeDocStub(), () => {
    const state = createInitialGameState({ seed: 4242 });
    // Wipe the per-min metrics so the deriveRate fallback path must fire.
    delete state.metrics.foodProducedPerMin;
    delete state.metrics.foodConsumedPerMin;
    delete state.metrics.foodSpoiledPerMin;
    state.metrics.timeSec = 0;
    state.resources.food = 200;

    const hud = new HUDController(state);
    hud.render();
    state.metrics.timeSec = 3;
    state.resources.food = 170; // 30 over 3s = -600/min
    hud.render();

    const headline = hud._lastComputedRates?.food;
    assert.ok(Number.isFinite(headline), `fallback headline rate must be finite, got ${headline}`);
    assert.ok(headline < -500 && headline > -700,
      `stock-delta fallback should return ~-600/min, got ${headline}`);
  });
});

test("invariant: when prod = cons = spoil = 0 headline is 0", () => {
  withStubbedDocument(makeDocStub(), () => {
    const state = createInitialGameState({ seed: 7777 });
    state.metrics.foodProducedPerMin  = 0;
    state.metrics.foodConsumedPerMin  = 0;
    state.metrics.foodSpoiledPerMin   = 0;
    state.metrics.timeSec = 0;
    state.resources.food = 200;

    const hud = new HUDController(state);
    hud.render();
    state.metrics.timeSec = 3;
    // Stock decreased by 50 (e.g. an off-screen consumer not yet wired into
    // metrics). The headline must NOT pretend cons=1000/min — it must trust
    // the metrics accumulator and report 0.
    state.resources.food = 150;
    hud.render();

    const headline = hud._lastComputedRates?.food;
    assert.equal(headline, 0,
      `with metrics present and zero, headline must be 0 (not the stock-delta lie); got ${headline}`);
  });
});
