// v0.8.2 Round-6 Wave-3 (02e-indie-critic Step 9) — Author Voice ticker
// render contract.
//
// Plan: assignments/homework6/Agent-Feedback-Loop/Round6/Plans/02e-indie-critic.md
//
// HUDController.#renderAuthorTicker(state) drives the new
// `#authorTickerStrip` element pinned below the HUD topbar. The contract
// asserted here:
//   (a) Ticker switches no faster than its dwell window (4000 ms): a second
//       eventTrace beat that arrives 1s later does NOT replace the first.
//   (b) Dev mode (body.dev-mode class) hides the ticker entirely so the
//       DeveloperPanel can surface eventTrace directly without duplication.
//   (c) Empty eventTrace → ticker is hidden (no stale text, no claimed
//       pixels at idle).

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { HUDController } from "../src/ui/hud/HUDController.js";

function makeClassList(initial = []) {
  const tokens = new Set(initial);
  return {
    add: (t) => tokens.add(t),
    remove: (t) => tokens.delete(t),
    contains: (t) => tokens.has(t),
    toggle(t, force) {
      const want = force ?? !tokens.has(t);
      if (want) tokens.add(t);
      else tokens.delete(t);
      return want;
    },
  };
}

function makeElement(tagName = "div") {
  const node = {
    tagName: tagName.toUpperCase(),
    style: {},
    attrs: {},
    dataset: {},
    children: [],
    childNodes: [],
    checked: false,
    className: "",
    classList: makeClassList(),
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
    appendChild(child) { child.parentNode = this; this.children.push(child); this.childNodes = this.children; return child; },
    replaceChildren(...children) { this.children = []; this.childNodes = this.children; for (const c of children) this.appendChild(c); },
    querySelector(sel) {
      // Minimal: support ".ticker-icon" / ".ticker-text" lookup against this
      // node's `_attachedSpans` map populated by buildTickerStrip below.
      const map = this._attachedSpans ?? null;
      if (map && Object.prototype.hasOwnProperty.call(map, sel)) {
        return map[sel];
      }
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  Object.defineProperty(node, "textContent", {
    get() { return this._textContent ?? this.children.map((c) => c.textContent).join(""); },
    set(v) { this.children = []; this.childNodes = this.children; this._textContent = String(v ?? ""); },
  });
  Object.defineProperty(node, "hidden", {
    get() { return this.hasAttribute("hidden"); },
    set(v) { if (v) this.setAttribute("hidden", ""); else this.removeAttribute("hidden"); },
  });
  return node;
}

function buildTickerStrip() {
  const strip = makeElement("div");
  const icon = makeElement("span");
  const text = makeElement("span");
  strip._attachedSpans = { ".ticker-icon": icon, ".ticker-text": text };
  strip.children = [icon, text];
  strip.childNodes = strip.children;
  // Default hidden (matches index.html: <div ... hidden>)
  strip.setAttribute("hidden", "");
  return { strip, icon, text };
}

function withHudDom(fn, { devMode = false } = {}) {
  const prevDocument = globalThis.document;
  const nodes = {};
  const bodyClasses = makeClassList(devMode ? ["dev-mode"] : []);
  const tickerParts = buildTickerStrip();
  nodes.authorTickerStrip = tickerParts.strip;
  const doc = {
    body: { classList: bodyClasses },
    createElement(tagName) {
      const node = makeElement(tagName);
      node.ownerDocument = doc;
      return node;
    },
    getElementById(id) {
      nodes[id] ??= makeElement("div");
      nodes[id].ownerDocument = doc;
      return nodes[id];
    },
  };
  globalThis.document = doc;
  try {
    return fn(nodes, tickerParts);
  } finally {
    globalThis.document = prevDocument;
  }
}

function makeBaseState() {
  const state = createInitialGameState({ seed: 7 });
  state.ai = state.ai ?? {};
  state.ai.lastPolicySource = "fallback";
  if (!state.ai.groupPolicies || typeof state.ai.groupPolicies.set !== "function") {
    state.ai.groupPolicies = new Map();
  }
  state.ai.groupPolicies.set("workers", {
    data: { focus: "frontier buildout", summary: "Routes are quiet." },
  });
  state.metrics = state.metrics ?? {};
  state.metrics.timeSec = 10;
  state.debug = state.debug ?? {};
  state.debug.eventTrace = [];
  return state;
}

test("(a) ticker dwell window: second beat 1s after first does NOT replace it", () => {
  // Round-6 02e Risk #2: friendship beats fire 5-10× more often than
  // sabotage; without dwell the ticker becomes a "friendship spam wall".
  // We assert the dwell gate: render once with beat A, then again with
  // beat B — the visible text must still be A because <4s elapsed.
  const prevPerf = globalThis.performance;
  let nowMs = 100000;
  globalThis.performance = { now: () => nowMs };
  try {
    withHudDom((nodes, parts) => {
      const state = makeBaseState();
      state.metrics.timeSec = 10;
      state.debug.eventTrace = ["[10.0s] Mose Jorvik became Close friend with Mose Hale"];
      const hud = new HUDController(state);

      hud.render();
      assert.match(parts.text.textContent, /became.*friend/i, "first beat painted");
      assert.equal(parts.strip.hasAttribute("hidden"), false, "ticker visible after first beat");

      // Advance 1000ms (dwell is 4000ms) and present a NEW beat. Must not switch.
      nowMs += 1000;
      state.metrics.timeSec = 11;
      state.debug.eventTrace = [
        "[11.0s] We mark the birth of Aila-7, daughter of Mose Hale.",
        "[10.0s] Mose Jorvik became Close friend with Mose Hale",
      ];
      hud.render();
      assert.match(parts.text.textContent, /became.*friend/i,
        "dwell window held — birth beat was NOT swapped in early");

      // Advance past dwell (total 5000ms elapsed). Now the new beat may take.
      nowMs += 4000;
      state.metrics.timeSec = 14;
      hud.render();
      assert.match(parts.text.textContent, /birth of/i,
        "after dwell expired, newer beat takes the strip");
    });
  } finally {
    globalThis.performance = prevPerf;
  }
});

test("(b) dev-mode hides the ticker entirely (DeveloperPanel surfaces eventTrace)", () => {
  withHudDom((nodes, parts) => {
    const state = makeBaseState();
    state.controls.devMode = true;
    state.metrics.timeSec = 10;
    state.debug.eventTrace = ["[10.0s] Mose Jorvik became Close friend with Mose Hale"];
    const hud = new HUDController(state);
    hud.render();
    assert.equal(parts.strip.hasAttribute("hidden"), true,
      "ticker MUST be hidden in dev-mode");
    assert.equal(parts.strip.classList.contains("visible"), false,
      "visible class must be cleared in dev-mode");
  }, { devMode: true });
});

test("(c) empty eventTrace → ticker hidden, no stale text", () => {
  withHudDom((nodes, parts) => {
    const state = makeBaseState();
    state.debug.eventTrace = [];
    const hud = new HUDController(state);
    hud.render();
    assert.equal(parts.strip.hasAttribute("hidden"), true,
      "ticker hidden when nothing salient is queued");
  });
});

test("(d) non-salient trace (weather steady) → ticker hidden", () => {
  withHudDom((nodes, parts) => {
    const state = makeBaseState();
    state.metrics.timeSec = 10;
    state.debug.eventTrace = ["[9.5s] weather steady — no notable shift"];
    const hud = new HUDController(state);
    hud.render();
    assert.equal(parts.strip.hasAttribute("hidden"), true,
      "non-salient trace must not surface in the ticker");
  });
});

test("(e) ticker exposes data-kind matching the beat classification", () => {
  withHudDom((nodes, parts) => {
    const state = makeBaseState();
    state.metrics.timeSec = 5;
    state.debug.eventTrace = ["[5.0s] [SABOTAGE] visitor_3 sabotaged colony"];
    const hud = new HUDController(state);
    hud.render();
    assert.equal(parts.strip.dataset.kind, "sabotage",
      "data-kind on the strip mirrors the classified beat kind");
  });
});
