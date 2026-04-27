import test from "node:test";
import assert from "node:assert/strict";

import { TILE } from "../src/config/constants.js";
import { HUDController } from "../src/ui/hud/HUDController.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { getScenarioRuntime } from "../src/world/scenarios/ScenarioFactory.js";

function makeClassList(node) {
  const tokens = new Set(String(node.className ?? "").split(/\s+/).filter(Boolean));
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
    "statusProsperityBar", "statusThreatBar", "statusObjective", "statusScenario",
    "statusAction", "hudFood", "hudWood", "hudWorkers", "speedPauseBtn", "speedPlayBtn",
    "speedFastBtn", "gameTimer",
  ];
  return Object.fromEntries(ids.map((id) => [id, makeElement("div")]));
}

function withDom(nodes, fn) {
  const prevDocument = globalThis.document;
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
  try {
    return fn();
  } finally {
    globalThis.document = prevDocument;
  }
}

function configureTwoGoalScenario(state) {
  state.grid.tiles[0] = TILE.WAREHOUSE;
  state.grid.tiles[1] = TILE.FARM;
  state.gameplay.scenario.routeLinks = [];
  state.gameplay.scenario.depotZones = [];

  const runtime = getScenarioRuntime(state);
  state.gameplay.scenario.targets = {
    logistics: {
      warehouses: runtime.counts.warehouses,
      farms: runtime.counts.farms + 1,
      lumbers: 0,
      roads: 0,
      walls: 0,
    },
  };
}

test("HUDController renders casual scenario progress as goal chips with done and pending states", () => {
  const nodes = makeNodeBag();
  withDom(nodes, () => {
    const state = createInitialGameState({ seed: 1337 });
    state.controls.uiProfile = "casual";
    configureTwoGoalScenario(state);

    const hud = new HUDController(state);
    hud.render();

    const chips = nodes.statusScenario.querySelectorAll(".hud-goal-chip");
    assert.equal(chips.length, 2);
    assert.ok(nodes.statusScenario.classList.contains("hud-goal-list"));
    assert.match(chips[0].textContent, /warehouses \d+\/\d+/);
    assert.match(chips[0].className, /hud-goal-chip--done/);
    assert.match(chips[1].textContent, /farms \d+\/\d+/);
    assert.match(chips[1].className, /hud-goal-chip--pending/);
    assert.match(nodes.statusScenario.attrs.title, /warehouses built/);
  });
});

test("HUDController keeps dev scenario progress as plain text", () => {
  const nodes = makeNodeBag();
  withDom(nodes, () => {
    const state = createInitialGameState({ seed: 1337 });
    state.controls.uiProfile = "dev";
    configureTwoGoalScenario(state);

    const hud = new HUDController(state);
    hud.render();

    assert.equal(nodes.statusScenario.querySelectorAll(".hud-goal-chip").length, 0);
    assert.ok(!nodes.statusScenario.classList.contains("hud-goal-list"));
    assert.match(nodes.statusScenario.textContent, /wh \d+\/\d+/);
    assert.match(nodes.statusScenario.textContent, /farms \d+\/\d+/);
  });
});
