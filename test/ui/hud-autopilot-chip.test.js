import test from "node:test";
import assert from "node:assert/strict";

import { HUDController } from "../../src/ui/hud/HUDController.js";
import { createInitialGameState } from "../../src/entities/EntityFactory.js";

function makeClassList(initial = []) {
  const tokens = new Set(initial);
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
  const node = {
    tagName: tagName.toUpperCase(),
    style: {},
    attrs: {},
    children: [],
    childNodes: [],
    className: "",
    hidden: false,
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
    addEventListener() {},
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
      nodes[id] ??= makeElement("div");
      nodes[id].ownerDocument = doc;
      return nodes[id];
    },
  };
  globalThis.document = doc;
  try {
    return fn(nodes, doc);
  } finally {
    globalThis.document = prevDocument;
  }
}

test("HUDController renders Autopilot OFF chip as player-controlled", () => {
  withHudDom((nodes) => {
    const state = createInitialGameState({ seed: 11 });
    state.ai.enabled = false;

    const hud = new HUDController(state);
    hud.render();

    assert.equal(nodes.aiAutopilotChip.textContent, "Autopilot OFF · manual; builders/director idle");
    assert.equal(nodes.aiAutopilotChip.attrs["data-mode"], "off");
    assert.equal(nodes.aiAutopilotChip.attrs["data-ai-mode"], "fallback");
    assert.equal(nodes.aiAutopilotChip.attrs["data-coverage"], "fallback");
    assert.match(nodes.aiAutopilotChip.attrs.title, /Autopilot off/);
    assert.match(nodes.aiAutopilotChip.attrs.title, /You choose actions/);
  });
});

test("HUDController renders Autopilot ON chip with next policy countdown", () => {
  withHudDom((nodes) => {
    const state = createInitialGameState({ seed: 12 });
    state.ai.enabled = true;
    state.ai.lastPolicyResultSec = 1.0;
    state.metrics.timeSec = 2.3;

    const hud = new HUDController(state);
    hud.render();

    assert.equal(nodes.aiAutopilotChip.textContent, "Autopilot ON · rules");
    assert.equal(nodes.aiAutopilotChip.attrs["data-mode"], "on");
    assert.equal(nodes.aiAutopilotChip.attrs["data-ai-mode"], "fallback");
    assert.equal(nodes.aiAutopilotChip.attrs["data-coverage"], "fallback");
    assert.match(nodes.aiAutopilotChip.attrs.title, /Autopilot ON/);
    assert.match(nodes.aiAutopilotChip.attrs.title, /next policy in 8\.7s/);
  });
});
