import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { describeAutopilotToggle, getAutopilotStatus } from "../src/ui/hud/autopilotStatus.js";
import { HUDController } from "../src/ui/hud/HUDController.js";

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
    checked: false,
    className: "",
    hidden: false,
    classList: makeClassList(),
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
    return fn(nodes);
  } finally {
    globalThis.document = prevDocument;
  }
}

test("getAutopilotStatus reports enabled mode, coverage, and countdown (dev-mode)", () => {
  // v0.8.2 Round-6 Wave-1 (01c-ui Step 4) — verbose engineer copy is now
  // dev-mode-only. Pass `{ devMode: true }` to retain the legacy
  // assertion. A separate test below pins the casual default shape.
  const status = getAutopilotStatus({
    ai: {
      enabled: true,
      mode: "fallback",
      coverageTarget: "llm",
      lastPolicyResultSec: 4,
    },
    metrics: { timeSec: 7 },
  }, { devMode: true });

  assert.equal(status.enabled, true);
  assert.equal(status.dataMode, "on");
  assert.equal(status.aiMode, "fallback");
  assert.equal(status.coverageTarget, "llm");
  assert.equal(status.remainingSec, 7);
  assert.equal(status.text, "Autopilot ON - fallback/llm - next policy in 7.0s");
});

test("getAutopilotStatus reports manual guidance boundary when disabled", () => {
  const status = getAutopilotStatus({
    ai: {
      enabled: false,
      mode: "fallback",
      coverageTarget: "fallback",
      lastPolicyResultSec: 1,
    },
    metrics: { timeSec: 4 },
  });

  assert.equal(status.enabled, false);
  assert.equal(status.dataMode, "off");
  assert.equal(status.text, "Autopilot OFF · manual; builders/director idle");
  assert.match(status.title, /automatic phase builders are idle/);
});

test("describeAutopilotToggle reports the toggle action copy", () => {
  const enabled = describeAutopilotToggle(true);
  const disabled = describeAutopilotToggle(false);

  assert.equal(enabled.actionMessage, "AI enabled. Waiting for next decision cycle.");
  assert.equal(enabled.title, "Autopilot is on and will keep steering until you turn it off.");
  assert.equal(disabled.actionMessage, "Autopilot off. Manual guidance active; rule builders and directors are idle.");
  assert.equal(disabled.title, "Autopilot is off. You choose actions; automatic phase builders and connector builders are idle.");
});

test("HUDController autopilot chip and toggles mirror getAutopilotStatus", () => {
  withHudDom((nodes) => {
    const state = createInitialGameState({ seed: 22 });
    state.ai.enabled = true;
    state.ai.mode = "llm";
    state.ai.coverageTarget = "llm";
    state.ai.lastPolicyResultSec = 1.0;
    state.metrics.timeSec = 2.3;
    const expected = getAutopilotStatus(state);

    const hud = new HUDController(state);
    hud.render();

    assert.equal(nodes.aiAutopilotChip.textContent, expected.text);
    assert.equal(nodes.aiAutopilotChip.attrs["data-mode"], expected.dataMode);
    assert.equal(nodes.aiAutopilotChip.attrs["data-ai-mode"], expected.aiMode);
    assert.equal(nodes.aiAutopilotChip.attrs["data-coverage"], expected.coverageTarget);
    assert.match(nodes.aiAutopilotChip.attrs.title, /mode=llm, coverage=llm/);
    assert.equal(nodes.aiToggleTop.checked, true);
    assert.equal(nodes.aiToggle.checked, true);
  });
});
