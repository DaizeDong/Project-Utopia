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

function withHudDom(classTokens, fn) {
  const prevDocument = globalThis.document;
  const nodes = {};
  const doc = {
    body: { classList: makeClassList(classTokens) },
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

function configureActiveScoredState() {
  const state = createInitialGameState({ seed: 22 });
  state.session.phase = "active";
  state.metrics.timeSec = 30;
  state.metrics.survivalScore = 42;
  state.metrics.birthsTotal = 2;
  state.metrics.deathsTotal = 1;
  state.gameplay.devIndexTicksComputed = 1;
  state.gameplay.devIndexSmoothed = 61;
  state.gameplay.devIndexDims = {
    production: 40,
    infrastructure: 55,
    economy: 10,
    population: 20,
    defense: 30,
    resilience: 60,
  };
  return state;
}

test("HUDController gives Score and Dev independent numeric tooltips", () => {
  withHudDom([], (nodes) => {
    const hud = new HUDController(configureActiveScoredState());
    hud.render();

    const scoreTitle = nodes.statusObjectiveScore.attrs.title;
    assert.match(scoreTitle, /\+1\/s/);
    assert.match(scoreTitle, /\+5\/birth/);
    assert.match(scoreTitle, /-10\/death/);
    assert.match(scoreTitle, /lived 30/);

    const devTitle = nodes.statusObjectiveDev.attrs.title;
    assert.match(devTitle, /Dev Index/);
    assert.match(devTitle, /production 40/);
    assert.match(devTitle, /infra 55/);
  });
});

test("HUDController uses glossary Score tooltip in casual mode", () => {
  withHudDom(["casual-mode"], (nodes) => {
    const hud = new HUDController(configureActiveScoredState());
    hud.render();

    const scoreTitle = nodes.statusObjectiveScore.attrs.title;
    assert.match(scoreTitle, /Survival Score/);
    assert.doesNotMatch(scoreTitle, /\+1\/s(?!ec)/);
  });
});
