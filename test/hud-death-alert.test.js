import test from "node:test";
import assert from "node:assert/strict";

import { HUDController } from "../src/ui/hud/HUDController.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";

function makeClassList(node) {
  const tokens = new Set();
  const sync = () => {
    node.className = [...tokens].join(" ");
  };
  return {
    add(...items) {
      for (const item of items) tokens.add(item);
      sync();
    },
    remove(...items) {
      for (const item of items) tokens.delete(item);
      sync();
    },
    contains(item) {
      return tokens.has(item) || String(node.className ?? "").split(/\s+/).includes(item);
    },
    toggle(item, force) {
      const shouldAdd = force ?? !tokens.has(item);
      if (shouldAdd) tokens.add(item);
      else tokens.delete(item);
      sync();
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
    parentNode: null,
    className: "",
    _textContent: "",
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
      this._textContent = "";
      this.children.push(child);
      this.childNodes = this.children;
      return child;
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx >= 0) this.children.splice(idx, 1);
      this.childNodes = this.children;
      child.parentNode = null;
      return child;
    },
    remove() {
      this.parentNode?.removeChild?.(this);
    },
    replaceChildren(...nextChildren) {
      for (const child of this.children) child.parentNode = null;
      this.children = [];
      this.childNodes = this.children;
      this._textContent = "";
      for (const child of nextChildren) this.appendChild(child);
    },
    querySelectorAll(selector) {
      if (!selector.startsWith(".")) return [];
      const className = selector.slice(1);
      const matches = [];
      const visit = (entry) => {
        const classes = String(entry.className ?? "").split(/\s+/).filter(Boolean);
        if (classes.includes(className)) matches.push(entry);
        for (const child of entry.children ?? []) visit(child);
      };
      visit(this);
      return matches;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  Object.defineProperty(node, "textContent", {
    get() {
      if (this.children.length > 0) {
        return this.children.map((child) => child.textContent).join("");
      }
      return this._textContent;
    },
    set(value) {
      for (const child of this.children) child.parentNode = null;
      this.children = [];
      this.childNodes = this.children;
      this._textContent = String(value ?? "");
    },
  });
  Object.defineProperty(node, "firstElementChild", {
    get() {
      return this.children[0] ?? null;
    },
  });
  node.classList = makeClassList(node);
  return node;
}

function makeNodeBag() {
  const ids = [
    "foodVal", "woodVal", "stoneVal", "herbsVal", "mealsVal", "toolsVal", "medicineVal",
    "foodBar", "woodBar", "stoneBar", "herbsBar", "mealsBar", "toolsBar", "medicineBar",
    "workersVal", "visitorsVal", "herbivoresVal", "predatorsVal", "farmersVal", "loggersVal",
    "stonersVal", "herbistsVal", "cooksVal", "smithsVal", "herbalistsVal", "haulersVal",
    "weatherVal", "mapVal", "doctrineVal", "prosperityVal", "threatVal", "objectiveVal",
    "aiModeVal", "aiEnvVal", "aiPolicyVal", "aiDecisionVal", "deathVal", "eventVal",
    "timeVal", "warningVal", "actionVal", "toolVal", "simVal", "fpsVal", "frameVal",
    "agentVal", "visualModeVal", "statusFood", "statusWood", "statusStone", "statusHerbs",
    "statusWorkers", "statusMeals", "statusTools", "statusMedicine", "statusProsperity",
    "statusThreat", "statusFoodBar", "statusWoodBar", "statusStoneBar", "statusHerbsBar",
    "statusProsperityBar", "statusThreatBar", "statusObjective", "statusAction", "hudFood",
    "hudWood", "hudWorkers", "speedPauseBtn", "speedPlayBtn", "speedFastBtn", "gameTimer",
    "latestDeathVal", "alertStack",
  ];
  return Object.fromEntries(ids.map((id) => [id, makeElement("div")]));
}

function withDom(nodes, fn) {
  const prevDocument = globalThis.document;
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const prevWindow = globalThis.window;
  const calls = [];
  const doc = {
    body: { classList: { contains: () => false } },
    createElement(tagName) {
      const node = makeElement(tagName);
      node.ownerDocument = doc;
      return node;
    },
    getElementById(id) {
      return nodes[id] ?? null;
    },
  };
  for (const node of Object.values(nodes)) node.ownerDocument = doc;
  globalThis.document = doc;
  globalThis.window = {
    __utopia: {
      renderer: {
        spawnDeathToast(...args) {
          calls.push(args);
        },
      },
    },
  };
  try {
    return fn(calls);
  } finally {
    globalThis.document = prevDocument;
    if (hadWindow) globalThis.window = prevWindow;
    else delete globalThis.window;
  }
}

test("HUDController appends one death alert and calls spawnDeathToast for a new death", () => {
  const nodes = makeNodeBag();
  withDom(nodes, (rendererCalls) => {
    const state = createInitialGameState({ seed: 1337 });
    state.metrics.deathsTotal = 1;
    state.metrics.deathsByReason = { starvation: 1 };
    state.agents.push({
      id: "worker-ko-7",
      displayName: "Ko-7",
      alive: false,
      deathReason: "starvation",
      deathSec: 42,
      x: 10,
      z: 12,
    });

    const hud = new HUDController(state);
    hud.render();

    const toasts = nodes.alertStack.querySelectorAll(".hud-death-toast");
    assert.equal(toasts.length, 1);
    assert.match(toasts[0].textContent, /Ko-7/);
    assert.match(toasts[0].textContent, /starvation/);
    assert.match(toasts[0].textContent, /\(10,12\)/);
    assert.equal(nodes.deathVal.attrs["data-severity"], "critical");
    assert.equal(nodes.deathVal.style.color, "#ff8a80");
    assert.equal(rendererCalls.length, 1);
    assert.deepEqual(rendererCalls[0].slice(2), ["Ko-7", "starvation", 10, 12]);

    hud.render();

    assert.equal(nodes.alertStack.querySelectorAll(".hud-death-toast").length, 1);
    assert.equal(rendererCalls.length, 1);
  });
});
