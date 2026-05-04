// Plan-R13-chip-label (R13 #3, P1) — regression test: scenario goal chips
// must display the building name (capitalized) alongside the count, e.g.
// "Farms 3/8" rather than bare "3/8" or lowercase "farms 3/8".
//
// Plan: assignments/homework7/Final-Polish-Loop/Round13/Plans/Plan-R13-chip-label.md
//
// Reuses the in-process DOM mock pattern from hud-goal-chips.test.js so we
// can assert on the rendered chip-name span text without spinning up jsdom.

import test from "node:test";
import assert from "node:assert/strict";

import { TILE } from "../src/config/constants.js";
import { HUDController } from "../src/ui/hud/HUDController.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { getScenarioRuntime } from "../src/world/scenarios/ScenarioFactory.js";

function makeClassList(node) {
  const tokens = new Set(String(node.className ?? "").split(/\s+/).filter(Boolean));
  const sync = () => { node.className = [...tokens].join(" "); };
  return {
    add(...items) { for (const i of items) tokens.add(i); sync(); },
    remove(...items) { for (const i of items) tokens.delete(i); sync(); },
    contains(item) {
      return tokens.has(item) || String(node.className ?? "").split(/\s+/).includes(item);
    },
    toggle(item, force) {
      const should = force ?? !tokens.has(item);
      if (should) tokens.add(item); else tokens.delete(item);
      sync();
      return should;
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
    setAttribute(key, value) { this.attrs[key] = String(value); },
    getAttribute(key) {
      return Object.prototype.hasOwnProperty.call(this.attrs, key) ? this.attrs[key] : null;
    },
    removeAttribute(key) { delete this.attrs[key]; },
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
    remove() { this.parentNode?.removeChild?.(this); },
    replaceChildren(...next) {
      for (const child of this.children) child.parentNode = null;
      this.children = [];
      this.childNodes = this.children;
      this._textContent = "";
      for (const child of next) this.appendChild(child);
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
        return this.children.map((c) => c.textContent).join("");
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
    get() { return this.children[0] ?? null; },
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
    getElementById(id) { return nodes[id] ?? null; },
  };
  for (const node of Object.values(nodes)) node.ownerDocument = doc;
  globalThis.document = doc;
  try { return fn(); }
  finally { globalThis.document = prevDocument; }
}

function configureScenarioWithChips(state) {
  state.grid.tiles[0] = TILE.WAREHOUSE;
  state.grid.tiles[1] = TILE.FARM;
  state.gameplay.scenario.routeLinks = [];
  state.gameplay.scenario.depotZones = [];
  const runtime = getScenarioRuntime(state);
  state.gameplay.scenario.targets = {
    logistics: {
      warehouses: runtime.counts.warehouses + 1,
      farms: runtime.counts.farms + 1,
      lumbers: 0,
      roads: 0,
      walls: 0,
    },
  };
}

test("Plan-R13-chip-label: chip name span renders the capitalized building name (Farms, Warehouses)", () => {
  const nodes = makeNodeBag();
  withDom(nodes, () => {
    const state = createInitialGameState({ seed: 4242 });
    state.controls.uiProfile = "casual";
    configureScenarioWithChips(state);
    const hud = new HUDController(state);
    hud.render();

    const chips = nodes.statusScenario.querySelectorAll(".hud-goal-chip");
    assert.ok(chips.length >= 2, `expected 2+ chips, got ${chips.length}`);

    const nameTexts = chips.flatMap((c) =>
      c.querySelectorAll(".hud-goal-chip-name").map((n) => n.textContent.trim()),
    );
    // Each chip's name span must render in Title Case (e.g. "Farms",
    // "Warehouses"), NOT lowercase ("farms") and NOT bare empty.
    for (const text of nameTexts) {
      assert.ok(text.length > 0, "name span must be non-empty");
      assert.match(text, /^[A-Z]/, `name span must start uppercase, got "${text}"`);
      assert.ok(!/\d/.test(text), `name span must not contain the count, got "${text}"`);
    }

    // The full chip text combines name + count, satisfying the user
    // directive of "Farms 3/8" (label + count) over bare "3/8".
    for (const chip of chips) {
      assert.match(chip.textContent, /[A-Z][a-z]+ \d+\/\d+/);
    }
  });
});

test("Plan-R13-chip-label: chip count span keeps the bare N/T text", () => {
  const nodes = makeNodeBag();
  withDom(nodes, () => {
    const state = createInitialGameState({ seed: 4242 });
    state.controls.uiProfile = "casual";
    configureScenarioWithChips(state);
    const hud = new HUDController(state);
    hud.render();

    const counts = nodes.statusScenario
      .querySelectorAll(".hud-goal-chip")
      .flatMap((c) => c.querySelectorAll(".hud-goal-chip-count"));
    assert.ok(counts.length >= 2);
    for (const c of counts) assert.match(c.textContent, /^\d+\/\d+$/);
  });
});
