// v0.10.1-r5 (PE-classify-and-inspector P1) — Inspector overview now shows
// HP / Mood / Morale / Energy lines for entities that expose those fields.
// Pre-fix, only Hunger / Carry / Intent / Position / Velocity were rendered;
// HP only existed for WALL/GATE tile selections. The PE-entity-info-
// completeness review flagged this as an information-density gap — players
// could not see worker vitals at a glance.
//
// Each line is gated on Number.isFinite(field). Workers carrying
// hp/maxHp/mood/morale/(energy or rest) emit all four; visitor SCOUTs and
// animals without these fields emit none (no empty `<b>HP:</b>` rows).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TILE } from "../src/config/constants.js";

function makeDOM() {
  const elements = {};
  const doc = {
    getElementById: (id) => elements[id] ?? null,
    createElement: (tag) => {
      const el = {
        tag,
        textContent: "",
        innerHTML: "",
        className: "",
        children: [],
        dataset: {},
        style: {},
        setAttribute: function (k, v) { this[`_attr_${k}`] = v; },
        getAttribute: function (k) { return this[`_attr_${k}`] ?? null; },
        hasAttribute: function (k) { return `_attr_${k}` in this; },
        removeAttribute: function (k) { delete this[`_attr_${k}`]; },
        appendChild: function (c) { this.children.push(c); },
        replaceChildren: function (...cs) { this.children = cs; },
      };
      return el;
    },
  };
  const root = doc.createElement("div");
  root.id = "inspect";
  root.innerHTML = "";
  elements["inspect"] = root;
  globalThis.document = doc;
  return { doc, root };
}

function makeState({ selectedEntityId = null, agents = [] } = {}) {
  const W = 20;
  const H = 20;
  const tiles = new Uint8Array(W * H).fill(TILE.GRASS);
  return {
    grid: { width: W, height: H, tiles, tileSize: 1, version: 1 },
    resources: { food: 50, wood: 20, stone: 10, herbs: 5, meals: 0, tools: 0, medicine: 0 },
    metrics: { timeSec: 12.5, processing: [], warningLog: [], warnings: [] },
    buildings: { warehouses: 1, farms: 1, lumbers: 1, kitchens: 0, smithies: 0, clinics: 0, walls: 0 },
    controls: { selectedTile: null, selectedEntityId, buildPreview: null, tool: "select", actionMessage: "" },
    gameplay: {
      objectiveHint: "",
      threat: 0,
      prosperity: 0,
      doctrine: "balanced",
      devIndexSmoothed: 0,
      devIndexTicksComputed: 0,
      devIndexDims: {},
    },
    session: { phase: "active" },
    ai: {
      enabled: false,
      mode: "fallback",
      lastEnvironmentSource: "fallback",
      lastPolicySource: "fallback",
      lastEnvironmentResultSec: -1,
      lastPolicyResultSec: -1,
      groupPolicies: new Map(),
    },
    agents,
    animals: [],
    events: { log: [], active: [] },
    world: { mapTemplateName: "test", mapSeed: 0 },
    environment: {},
    weather: { current: "clear", hazardTiles: [], hazardTileSet: new Set() },
  };
}

describe("InspectorPanel overview HP/Mood/Morale/Energy lines", () => {
  it("worker with hp=40 maxHp=100 mood=0.7 morale=0.5 rest=0.3 renders all four lines", async () => {
    makeDOM();
    const { InspectorPanel } = await import("../src/ui/panels/InspectorPanel.js");
    const worker = {
      id: "w1",
      type: "WORKER",
      kind: "worker",
      stateLabel: "Harvest",
      role: "FARM",
      groupId: "g1",
      x: 1.5,
      z: 2.5,
      vx: 0,
      vz: 0,
      hunger: 0.5,
      hp: 40,
      maxHp: 100,
      mood: 0.7,
      morale: 0.5,
      rest: 0.3,
      carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
      path: null,
      pathIndex: 0,
      pathGridVersion: 1,
      blackboard: {},
      memory: {},
      debug: {},
    };
    const state = makeState({ selectedEntityId: "w1", agents: [worker] });
    const panel = new InspectorPanel(state);
    panel.render();
    const html = panel.root.innerHTML;
    assert.ok(html.includes("<b>HP:</b> 40 / 100"), `expected HP line, got: ${html.slice(0, 1000)}`);
    assert.ok(html.includes("<b>Mood:</b> 70%"), "expected Mood 70% line");
    assert.ok(html.includes("<b>Morale:</b> 50%"), "expected Morale 50% line");
    assert.ok(html.includes("<b>Energy:</b> 30%"), "expected Energy 30% line (from rest fallback)");
  });

  it("worker with explicit energy=0.85 renders Energy from energy field, not rest", async () => {
    makeDOM();
    const { InspectorPanel } = await import("../src/ui/panels/InspectorPanel.js");
    const worker = {
      id: "w2",
      type: "WORKER",
      kind: "worker",
      stateLabel: "Idle",
      role: "FARM",
      groupId: "g1",
      x: 1.5,
      z: 2.5,
      vx: 0,
      vz: 0,
      hunger: 0.9,
      hp: 100,
      maxHp: 100,
      mood: 0.6,
      morale: 0.6,
      energy: 0.85,
      rest: 0.1,
      carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
      path: null,
      pathIndex: 0,
      pathGridVersion: 1,
      blackboard: {},
      memory: {},
      debug: {},
    };
    const state = makeState({ selectedEntityId: "w2", agents: [worker] });
    const panel = new InspectorPanel(state);
    panel.render();
    const html = panel.root.innerHTML;
    assert.ok(html.includes("<b>Energy:</b> 85%"), "expected Energy 85% (from energy field, not rest)");
  });

  it("entity without HP/Mood/Morale/Energy fields renders no empty rows", async () => {
    makeDOM();
    const { InspectorPanel } = await import("../src/ui/panels/InspectorPanel.js");
    const visitor = {
      id: "v1",
      type: "VISITOR",
      kind: "scout",
      stateLabel: "scout",
      role: null,
      groupId: "v",
      x: 0,
      z: 0,
      vx: 0,
      vz: 0,
      hunger: 1,
      // no hp/maxHp/mood/morale/energy/rest
      carry: { food: 0, wood: 0, stone: 0, herbs: 0 },
      path: null,
      pathIndex: 0,
      pathGridVersion: 1,
      blackboard: {},
      memory: {},
      debug: {},
    };
    const state = makeState({ selectedEntityId: "v1", agents: [visitor] });
    const panel = new InspectorPanel(state);
    panel.render();
    const html = panel.root.innerHTML;
    assert.ok(!html.includes("<b>HP:</b>"), "should not render HP for entity lacking hp/maxHp");
    assert.ok(!html.includes("<b>Mood:</b>"), "should not render Mood for entity lacking mood");
    assert.ok(!html.includes("<b>Morale:</b>"), "should not render Morale for entity lacking morale");
    assert.ok(!html.includes("<b>Energy:</b>"), "should not render Energy for entity lacking energy/rest");
  });
});
