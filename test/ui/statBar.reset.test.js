// v0.10.1-n (A7-rationality-audit P0 #1) — Try-Again stat-bar reset.
// Plan: assignments/homework7/Final-Polish-Loop/Round0/Plans/A7-rationality-audit.md
//
// HUDController carries `_last*` caches across world resets:
//   - `_lastResourceSnapshot` / `_lastSnapshotSimSec` / `_lastComputedRates`
//     (the 3-sec rate window that drives `▼ -562.4/min` headlines)
//   - `_lastRunoutSmoothed` (per-resource EWMA "until empty" estimator)
//   - `_lastDeathsSeen` / `_lastBuildHint` / `_lastScenarioHeadlineText`
//   - `_lastChainStall` / `_lastChainStallSec`
//   - `lastActionMessage` (action-toast pulse de-dup)
//
// When the player clicks Try Again, GameApp.regenerateWorld() rebuilds
// state.metrics / state.gameplay from a fresh createInitialGameState(), but
// these HUD-side caches survive because they live on the HUDController
// instance, not on `state`. The previous-run rate sample's `t` (e.g. 600s)
// is now in the future relative to the new state.metrics.timeSec=0, so the
// rate-flush condition (`simSec - this._lastSnapshotSimSec >= RATE_WINDOW_SEC`)
// cannot fire until the new run accumulates past the old timer, leaving the
// previous-run rate string visible for ≥1 minute.
//
// `HUDController.resetTransientCaches()` is the deterministic clear hook
// that GameApp.regenerateWorld() invokes post-deepReplaceObject so the next
// render frame computes from fresh state. This test asserts the contract
// without spinning up the full HUD render pipeline.

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
  const body = {
    classList: {
      contains: () => false,
      add: () => {},
      remove: () => {},
    },
  };
  return {
    body,
    getElementById(id) {
      // Returning a stable stub node for any id keeps HUDController happy
      // without enumerating every required DOM ref.
      let node = nodeCache.get(id);
      if (!node) {
        node = makeNode();
        nodeCache.set(id, node);
      }
      return node;
    },
  };
}

function withStubbedDocument(doc, fn) {
  const prev = globalThis.document;
  globalThis.document = doc;
  try {
    return fn();
  } finally {
    globalThis.document = prev;
  }
}

test("HUDController.resetTransientCaches clears every `_last*` cache", () => {
  withStubbedDocument(makeDocStub(), () => {
    const state = createInitialGameState({ seed: 1337 });
    const hud = new HUDController(state);

    // Simulate the post-long-run state: every cache populated with values
    // from the previous session. The exact values do not matter — only that
    // resetTransientCaches() must scrub them all.
    hud._lastResourceSnapshot = { food: 9, t: 600 };
    hud._lastSnapshotSimSec = 600;
    hud._lastComputedRates = { food: -562.4, wood: -248.6 };
    hud._lastRunoutSmoothed = { food: 12.3, wood: 99.0 };
    hud._lastDeathsSeen = 17;
    hud._lastBuildHint = "stale-hint";
    hud._lastScenarioHeadlineText = "stale-headline";
    hud._lastChainStall = { food: { bottleneck: "kitchen" } };
    hud._lastChainStallSec = 555;
    hud._runoutLoggedAt = { food: 444 };
    hud.lastActionMessage = "stale-action";

    hud.resetTransientCaches();

    assert.equal(hud._lastResourceSnapshot, null,
      "rate-window snapshot must be cleared so the next sample primes from t=0");
    assert.equal(hud._lastSnapshotSimSec, 0,
      "rate-window timer must be reset so RATE_WINDOW_SEC fires from the new run");
    assert.equal(hud._lastComputedRates, null,
      "previous-run rate values must be evicted from the cache");
    assert.deepEqual(hud._lastRunoutSmoothed, {},
      "per-resource runout EWMA must drop the previous run's smoothed estimate");
    assert.equal(hud._lastDeathsSeen, 0,
      "obituary flash counter must reset so the new run does not 'see' phantom deaths");
    assert.equal(hud._lastBuildHint, "",
      "stale build hint must clear so the next render does not skip the diff guard");
    assert.equal(hud._lastScenarioHeadlineText, null,
      "stale scenario headline must clear so the new run's headline always renders");
    assert.equal(hud._lastChainStall, null,
      "stale chain-stall reason must clear");
    assert.equal(hud._lastChainStallSec, null,
      "chain-stall sample timer must reset");
    assert.deepEqual(hud._runoutLoggedAt, {},
      "objective-log dedup map must clear so a new run can re-log warnings");
    assert.equal(hud.lastActionMessage, "",
      "action-toast dedup must clear so a fresh post-restart toast fires");
  });
});

test("Stat-bar text comes from fresh state, not from HUD cache (proof)", () => {
  // Sanity check: the visible "Survived HH:MM:SS Score N · Dev N/100"
  // string is computed from state.metrics.timeSec / state.metrics.survivalScore
  // / state.gameplay.devIndexSmoothed every render frame. Because GameApp.
  // regenerateWorld() does deepReplaceObject(this.state, createInitialGameState()),
  // those three fields are zero immediately after Try Again — so the only
  // way a previous-run number can survive is via a HUD-internal cache,
  // hence the resetTransientCaches() contract above.
  const fresh = createInitialGameState({ seed: 4242 });
  assert.equal(Number(fresh.metrics.timeSec), 0);
  assert.equal(Number(fresh.metrics.survivalScore ?? 0), 0);
  assert.equal(Number(fresh.gameplay?.devIndexSmoothed ?? 0), 0);
  assert.equal(fresh.session.phase, "menu",
    "fresh state begins in `menu` phase; setRunPhase('active') flips it after regenerateWorld returns");
});
