// v0.10.1 R12 Plan-R12-debug-leak-gate (A6+A7 P0) — debug-string leak gate.
//
// Plan: assignments/homework7/Final-Polish-Loop/Round12/Plans/Plan-R12-debug-leak-gate.md
//
// Pins the casual-mode contract for the AI mode corner chip (`#aiModeVal`)
// added in R12: in casual mode the chip MUST collapse to "AI online" /
// "AI offline" and must NOT leak engineer jargon (proxy=, model=, mode=
// fallback, gpt-5-4-nano, etc). Dev mode preserves the legacy full string
// so local debugging still works.
//
// Companion gates (already pinned by hud-dev-string-quarantine.test.js +
// AIAutomationPanel internal gate): WHISPER suffix, AI Log engineering
// footer, [timeout] toast suffix.

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

function withHudDom(fn, { devMode = false } = {}) {
  const prevDocument = globalThis.document;
  const nodes = {};
  const bodyClasses = makeClassList(devMode ? ["dev-mode"] : []);
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
    return fn(nodes);
  } finally {
    globalThis.document = prevDocument;
  }
}

function makeStateWithFallback() {
  const state = createInitialGameState({ seed: 7 });
  state.ai = state.ai ?? {};
  state.ai.enabled = false;
  state.ai.mode = "fallback";
  state.ai.coverageTarget = "fallback";
  state.metrics = state.metrics ?? {};
  state.metrics.proxyHealth = "unknown";
  state.metrics.proxyModel = "gpt-5-4-nano";
  state.metrics.timeSec = 60;
  return state;
}

test("casual mode: aiModeVal collapses to 'AI offline' (no proxy/model leak)", () => {
  withHudDom((nodes) => {
    const state = makeStateWithFallback();
    state.controls.devMode = false;
    const hud = new HUDController(state);
    hud.render();

    const text = nodes.aiModeVal.textContent;
    assert.equal(text, "AI offline", `casual chip should be 'AI offline', got: ${text}`);
    assert.ok(!/proxy/i.test(text), `casual chip leaked 'proxy=': ${text}`);
    assert.ok(!/model/i.test(text), `casual chip leaked 'model=': ${text}`);
    assert.ok(!/gpt-/i.test(text), `casual chip leaked model id: ${text}`);
    assert.ok(!/fallback/i.test(text), `casual chip leaked 'fallback' jargon: ${text}`);
    assert.ok(!/unknown/i.test(text), `casual chip leaked 'unknown' proxy health: ${text}`);
  }, { devMode: false });
});

test("casual mode: aiModeVal shows 'AI online' when ai.enabled is true", () => {
  withHudDom((nodes) => {
    const state = makeStateWithFallback();
    state.controls.devMode = false;
    state.ai.enabled = true;
    const hud = new HUDController(state);
    hud.render();

    assert.equal(nodes.aiModeVal.textContent, "AI online");
  }, { devMode: false });
});

test("dev mode (state.controls.devMode=true): aiModeVal preserves full engineer string", () => {
  withHudDom((nodes) => {
    const state = makeStateWithFallback();
    state.controls.devMode = true;
    const hud = new HUDController(state);
    hud.render();

    const text = nodes.aiModeVal.textContent;
    // Full engineer format: `<on/off> / <mode> (<proxyHealth>, <proxyModel>)`
    assert.match(text, /off \/ fallback \(unknown, gpt-5-4-nano\)/);
  }, { devMode: true });
});

test("dev mode (body.dev-mode class): aiModeVal preserves full engineer string", () => {
  withHudDom((nodes) => {
    const state = makeStateWithFallback();
    state.controls.devMode = false; // rely on the body-class signal
    const hud = new HUDController(state);
    hud.render();

    const text = nodes.aiModeVal.textContent;
    assert.match(text, /off \/ fallback \(unknown, gpt-5-4-nano\)/);
  }, { devMode: true });
});
