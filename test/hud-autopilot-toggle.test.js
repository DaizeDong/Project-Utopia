import test from "node:test";
import assert from "node:assert/strict";

import { HUDController } from "../src/ui/hud/HUDController.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";

function makeClassList() {
  const tokens = new Set();
  return {
    add: (token) => tokens.add(token),
    remove: (token) => tokens.delete(token),
    contains: (token) => tokens.has(token),
    toggle(token, force) {
      const shouldAdd = force ?? !tokens.has(token);
      if (shouldAdd) tokens.add(token);
      else tokens.delete(token);
      return shouldAdd;
    },
  };
}

function makeElement(tagName = "div") {
  const listeners = {};
  const node = {
    tagName: tagName.toUpperCase(),
    style: {},
    attrs: {},
    children: [],
    childNodes: [],
    checked: false,
    hidden: false,
    listeners,
    setAttribute(key, value) {
      this.attrs[key] = String(value);
    },
    getAttribute(key) {
      return Object.prototype.hasOwnProperty.call(this.attrs, key) ? this.attrs[key] : null;
    },
    removeAttribute(key) {
      delete this.attrs[key];
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      this.childNodes = this.children;
      return child;
    },
    replaceChildren(...children) {
      this.children = [];
      this.childNodes = this.children;
      for (const child of children) this.appendChild(child);
    },
    querySelectorAll() {
      return [];
    },
    addEventListener(type, handler) {
      listeners[type] ??= [];
      listeners[type].push(handler);
    },
    dispatchEvent(event) {
      for (const handler of listeners[event.type] ?? []) handler(event);
      return true;
    },
  };
  Object.defineProperty(node, "textContent", {
    get() {
      return this._textContent ?? this.children.map((child) => child.textContent).join("");
    },
    set(value) {
      this.children = [];
      this.childNodes = this.children;
      this._textContent = String(value ?? "");
    },
  });
  node.classList = makeClassList();
  return node;
}

function withHudDom(fn) {
  const prevDocument = globalThis.document;
  const nodes = {};
  const doc = {
    body: { classList: makeClassList() },
    createElement(tagName) {
      const node = makeElement(tagName);
      node.ownerDocument = doc;
      return node;
    },
    getElementById(id) {
      nodes[id] ??= makeElement(id === "aiToggle" || id === "aiToggleTop" ? "input" : "div");
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

// v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 5e) — autopilot decoupling.
// HUDController now gates the toggle handler on `event.isTrusted` (true for
// genuine user clicks) OR an explicit `detail.userInitiated` escape hatch
// for programmatic toggles (tests, scripted UI). Synthetic events from
// button-click bubbling are dropped, fixing the Run-3 reviewer report
// "Autopilot turned off after I clicked Fast Forward".
const userChange = { type: "change", detail: { userInitiated: true } };

test("HUDController syncs top Autopilot toggle into the sidebar toggle and state", () => {
  withHudDom((nodes) => {
    const state = createInitialGameState({ seed: 31 });
    const hud = new HUDController(state);

    nodes.aiToggleTop.checked = true;
    nodes.aiToggleTop.dispatchEvent(userChange);

    assert.equal(state.ai.enabled, true);
    assert.equal(nodes.aiToggle.checked, true);
    assert.equal(state.controls.actionMessage, "AI enabled. Waiting for next decision cycle.");

    state.ai.enabled = false;
    hud.render();
    assert.equal(nodes.aiToggleTop.checked, false);
    assert.equal(nodes.aiToggle.checked, false);
  });
});

test("HUDController syncs sidebar Autopilot toggle back into the top toggle", () => {
  withHudDom((nodes) => {
    const state = createInitialGameState({ seed: 32 });
    new HUDController(state);

    nodes.aiToggle.checked = true;
    nodes.aiToggle.dispatchEvent(userChange);

    assert.equal(state.ai.enabled, true);
    assert.equal(nodes.aiToggleTop.checked, true);

    nodes.aiToggle.checked = false;
    nodes.aiToggle.dispatchEvent(userChange);

    assert.equal(state.ai.enabled, false);
    assert.equal(state.ai.mode, "fallback");
    assert.equal(nodes.aiToggleTop.checked, false);
  });
});

// v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 5e) — Autopilot decoupling
// regression guard: an untrusted change event with no userInitiated hint
// must NOT toggle the AI state. This pins the contract that fixed the
// Run-3 reviewer's "Autopilot got silently turned off" complaint.
test("untrusted change events without userInitiated do not toggle ai.enabled", () => {
  withHudDom((nodes) => {
    const state = createInitialGameState({ seed: 33 });
    new HUDController(state);
    state.ai.enabled = true;

    nodes.aiToggleTop.checked = false;
    // Synthetic event with no isTrusted, no detail.userInitiated — exactly
    // what a button-click bubbling into a focused checkbox looks like.
    nodes.aiToggleTop.dispatchEvent({ type: "change" });

    assert.equal(state.ai.enabled, true, "untrusted change must not flip ai.enabled");
  });
});
