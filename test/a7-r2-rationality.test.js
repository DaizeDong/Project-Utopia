// v0.10.1 A7-rationality-audit R2 — regression locks for three P0 leaks.
// Plan: assignments/homework7/Final-Polish-Loop/Round2/Plans/A7-rationality-audit.md
//
// (a) AIAutomationPanel render output does NOT contain `model=` / `proxy=`
//     substrings when isDevMode(state) === false. Locks finding #6.
// (b) pickBootSeed() returns ≠ DEFAULT_MAP_SEED (1337) across ≥5 fresh
//     invocations when no URL `?seed=` and no localStorage pin. Locks #7.
// (c) Smoke that pickBootSeed honours explicit ?seed=N override and
//     localStorage.utopia:bootSeed pin (so reproducible-link / pinned-run
//     workflows continue to function alongside the random default).

import test from "node:test";
import assert from "node:assert/strict";

import { AIAutomationPanel } from "../src/ui/panels/AIAutomationPanel.js";
import { pickBootSeed } from "../src/world/grid/Grid.js";

function makeStubRoot() {
  let html = "";
  return {
    set innerHTML(v) {
      html = String(v);
    },
    get innerHTML() {
      return html;
    },
  };
}

function makeStubBody() {
  const set = new Set();
  return {
    classList: {
      add: (c) => set.add(c),
      remove: (c) => set.delete(c),
      contains: (c) => set.has(c),
      toggle: (c, on) => {
        const want = on === undefined ? !set.has(c) : Boolean(on);
        if (want) set.add(c); else set.delete(c);
        return want;
      },
    },
    _set: set,
  };
}

function makeBaseState({ devMode = false } = {}) {
  return {
    controls: { devMode },
    ai: {
      enabled: false,
      coverageTarget: "fallback",
      mode: "fallback",
      lastPolicyModel: "deepseek-v4-flash",
      lastEnvironmentModel: "deepseek-v4-flash",
    },
    metrics: {
      proxyHealth: "unknown",
      proxyModel: "deepseek-v4-flash",
    },
  };
}

test("a7-r2 (a): AIAutomationPanel hides model=/proxy= footer when isDevMode is false", () => {
  // Stub state.controls.devMode = false (and no document.body.dev-mode class
  // present — node:test runs without a global document, so isDevMode falls
  // through both branches to return false).
  const state = makeBaseState({ devMode: false });
  const panel = new AIAutomationPanel(state);
  // Force-attach a stub root because AIAutomationPanel.constructor only wires
  // up the real DOM root in a browser context.
  panel.root = makeStubRoot();

  panel.render();

  const html = panel.root.innerHTML;
  assert.ok(html.length > 0, "panel rendered some HTML");
  assert.ok(html.includes("Autopilot OFF"), "panel still surfaces casual on/off label");
  assert.equal(html.includes("model="), false, "engineering footer must not leak `model=` when isDevMode false");
  assert.equal(html.includes("proxy="), false, "engineering footer must not leak `proxy=` when isDevMode false");
  assert.equal(html.includes("coverage="), false, "engineering footer must not leak `coverage=` when isDevMode false");
});

test("a7-r2 (a-positive): AIAutomationPanel restores footer when isDevMode is true", () => {
  const state = makeBaseState({ devMode: true });
  const panel = new AIAutomationPanel(state);
  panel.root = makeStubRoot();
  panel.render();
  const html = panel.root.innerHTML;
  // Footer keys are surfaced once dev-mode is on (regression check that the
  // gate didn't accidentally hide everything).
  assert.ok(html.includes("model="), "dev-mode renders engineering `model=` footer");
  assert.ok(html.includes("proxy="), "dev-mode renders engineering `proxy=` footer");
  assert.ok(html.includes("coverage="), "dev-mode renders engineering `coverage=` footer");
});

test("a7-r2 (b): pickBootSeed returns ≠ 1337 across 5 fresh invocations", () => {
  const seen = new Set();
  for (let i = 0; i < 5; i += 1) {
    const seed = pickBootSeed({
      urlParams: new URLSearchParams(""),
      storage: null,
    });
    assert.equal(typeof seed, "number", "seed is a number");
    assert.ok(seed > 0, "seed is positive (zero would feed back through DEFAULT_MAP_SEED)");
    assert.notEqual(seed, 1337, `pickBootSeed must not pin to DEFAULT_MAP_SEED 1337 on fresh boot (iter ${i})`);
    seen.add(seed);
  }
  // Statistical sanity: with 31-bit space, 5 random draws should diverge.
  assert.ok(seen.size >= 2, "pickBootSeed produces varied output across multiple boots");
});

test("a7-r2 (c-url): pickBootSeed honours explicit `?seed=` override", () => {
  const params = new URLSearchParams("seed=42");
  const seed = pickBootSeed({ urlParams: params, storage: null });
  assert.equal(seed, 42, "URL `?seed=42` overrides the random default");
});

test("a7-r2 (c-storage): pickBootSeed honours localStorage `utopia:bootSeed` pin", () => {
  const fakeStore = {
    getItem: (k) => (k === "utopia:bootSeed" ? "9999" : null),
  };
  const seed = pickBootSeed({
    urlParams: new URLSearchParams(""),
    storage: fakeStore,
  });
  assert.equal(seed, 9999, "storage pin overrides the random default");
});

test("a7-r2 (c-precedence): URL `?seed=` beats localStorage pin", () => {
  const params = new URLSearchParams("seed=7");
  const fakeStore = {
    getItem: () => "9999",
  };
  const seed = pickBootSeed({ urlParams: params, storage: fakeStore });
  assert.equal(seed, 7, "URL takes precedence over storage so reproducible-links keep working");
});
