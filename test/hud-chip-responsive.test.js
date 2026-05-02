// v0.10.1-A6 R3 (P0 #1) — HUD goal chip responsive layout regression.
// Plan: assignments/homework7/Final-Polish-Loop/Round3/Plans/A6-ui-design.md
//
// Reviewer flagged that 6 chips ("routes", "depots", "warehouses",
// "farms", "lumber", "walls") truncate / disappear on 1366×768 laptops
// because the previous CSS reduced chip *height* but did not allow the
// strip to wrap or the chip *labels* to collapse. R3 adds two CSS
// affordances (verified here) and one JS structural change:
//   1. The 1025-1366 px media block sets `flex-wrap: wrap`,
//      `min-width: 0` and a tighter chip font-size on `.hud-goal-list`.
//   2. The 1025-1280 px media block hides `.hud-goal-chip-name`
//      (icon-only mode) so chips collapse to "<bullet> 0/6".
//   3. HUDController#renderGoalChips now emits a two-span DOM
//      structure (`hud-goal-chip-name` + `hud-goal-chip-count`) and
//      sets the chip's `title` attribute to the full label so hover
//      always exposes "farms 0/6" regardless of viewport width.
//
// JSDOM cannot reliably resolve @media in this codebase (see
// responsive-status-bar.test.js for the precedent), so we assert
// against the raw `index.html` source for the CSS contract and use
// the existing in-process DOM mock to check the chip span structure.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { TILE } from "../src/config/constants.js";
import { HUDController } from "../src/ui/hud/HUDController.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { getScenarioRuntime } from "../src/world/scenarios/ScenarioFactory.js";

const HTML = fs.readFileSync("index.html", "utf8");

// ---- Tiny DOM mock (mirrors hud-goal-chips.test.js helpers) ----

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

// ---- Static CSS-contract assertions (raw index.html scan) ----

test("index.html 1025-1366 band declares flex-wrap + min-width:0 on .hud-goal-list", () => {
  // Locate the dedicated 1366 + min 1025 block (R2 added it; R3 extends it).
  const block = HTML.match(
    /@media\s*\(\s*max-width:\s*1366px\s*\)\s*and\s*\(\s*min-width:\s*1025px\s*\)\s*\{[\s\S]*?\}\s*\}/,
  );
  assert.ok(block, "1366+1025 media block must exist");
  // .hud-goal-list must wrap and shrink (no clipping at the strip edge).
  assert.match(block[0], /\.hud-goal-list\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(block[0], /\.hud-goal-list\s*\{[^}]*min-width:\s*0/);
});

test("index.html ≤1280 band hides .hud-goal-chip-name (icon-only mode)", () => {
  const block = HTML.match(
    /@media\s*\(\s*max-width:\s*1280px\s*\)\s*and\s*\(\s*min-width:\s*1025px\s*\)\s*\{[\s\S]*?\}/,
  );
  assert.ok(block, "1280+1025 media block must exist");
  assert.match(block[0], /\.hud-goal-chip-name\s*\{\s*display:\s*none/);
});

test("index.html declares themed wildcard scrollbar (Best Runs / Settings / Colony)", () => {
  // The wildcard rule must exist so unnamed scroll containers also pick
  // up the dark accent palette instead of the OS native grey.
  assert.match(HTML, /\*::-webkit-scrollbar\s*\{[^}]*width:\s*8px/);
  assert.match(HTML, /\*::-webkit-scrollbar-thumb\s*\{[^}]*background:\s*rgba\(58,160,255/);
  // Firefox shorthand
  assert.match(HTML, /\*\s*\{[^}]*scrollbar-color:[^}]*scrollbar-width:\s*thin/);
});

test("index.html keeps #floatingToastLayer above #entityFocusOverlay", () => {
  // Pull the z-index from each block. floatingToastLayer must be > entityFocus.
  const toastZ = HTML.match(/#floatingToastLayer\s*\{[^}]*z-index:\s*(\d+)/);
  const focusZ = HTML.match(/#entityFocusOverlay\s*\{[^}]*z-index:\s*(\d+)/);
  assert.ok(toastZ, "#floatingToastLayer z-index missing");
  assert.ok(focusZ, "#entityFocusOverlay z-index missing");
  assert.ok(
    Number(toastZ[1]) > Number(focusZ[1]),
    `toast z (${toastZ[1]}) must exceed entity focus z (${focusZ[1]})`,
  );
});

// ---- Live HUDController DOM-shape assertions ----

test("HUDController emits split name+count spans inside each goal chip", () => {
  const nodes = makeNodeBag();
  withDom(nodes, () => {
    const state = createInitialGameState({ seed: 4242 });
    state.controls.uiProfile = "casual";
    configureScenarioWithChips(state);
    const hud = new HUDController(state);
    hud.render();

    const chips = nodes.statusScenario.querySelectorAll(".hud-goal-chip");
    assert.ok(chips.length >= 2, `expected 2+ chips, got ${chips.length}`);
    for (const chip of chips) {
      const nameSpans = chip.querySelectorAll(".hud-goal-chip-name");
      const countSpans = chip.querySelectorAll(".hud-goal-chip-count");
      assert.equal(nameSpans.length, 1, "each chip must contain exactly one name span");
      assert.equal(countSpans.length, 1, "each chip must contain exactly one count span");
      assert.match(countSpans[0].textContent, /\d+\/\d+/);
      // textContent concatenation must still match the legacy "name N/T"
      // form so existing hud-goal-chips.test.js stays green.
      assert.match(chip.textContent, /\w+ \d+\/\d+/);
      // title attribute must mirror the full label so hover surfaces
      // "farms 0/6" even when the icon-only CSS hides the name span.
      assert.ok(chip.attrs.title, "chip must carry a title= for hover");
      assert.match(chip.attrs.title, /\w+ \d+\/\d+/);
    }
  });
});
