import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TILE } from "../src/config/constants.js";

// Minimal DOM stub matching InspectorPanel's usage pattern
function makeDOM() {
  const elements = {};
  const doc = {
    getElementById: (id) => elements[id] ?? null,
    createElement: (tag) => {
      const el = { tag, textContent: "", innerHTML: "", className: "", children: [], dataset: {}, style: {},
        setAttribute: function(k, v) { this[`_attr_${k}`] = v; },
        getAttribute: function(k) { return this[`_attr_${k}`] ?? null; },
        hasAttribute: function(k) { return `_attr_${k}` in this; },
        removeAttribute: function(k) { delete this[`_attr_${k}`]; },
        appendChild: function(c) { this.children.push(c); },
        replaceChildren: function(...cs) { this.children = cs; },
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

function makeState({ processingSnapshot = null, selectedTile = null } = {}) {
  const W = 20, H = 20;
  const tiles = new Uint8Array(W * H).fill(TILE.GRASS);
  if (selectedTile) {
    tiles[selectedTile.ix + selectedTile.iz * W] = selectedTile.type;
  }
  return {
    grid: { width: W, height: H, tiles, tileSize: 1, version: 1 },
    resources: { food: 50, wood: 20, stone: 10, herbs: 5, meals: 0, tools: 0, medicine: 0 },
    metrics: {
      timeSec: 0, processing: processingSnapshot ?? [],
      warningLog: [], warnings: [],
    },
    controls: { selectedTile, selectedEntityId: null, buildPreview: null, tool: "select", actionMessage: "" },
    gameplay: { objectiveHint: "", threat: 0, prosperity: 0, doctrine: "balanced",
      devIndexSmoothed: 0, devIndexTicksComputed: 0, devIndexDims: {} },
    session: { phase: "active" },
    ai: { enabled: false, mode: "fallback", lastEnvironmentSource: "fallback",
      lastPolicySource: "fallback", lastEnvironmentResultSec: -1, lastPolicyResultSec: -1,
      groupPolicies: new Map() },
    agents: [], animals: [],
    events: { log: [], active: [] },
    world: { mapTemplateName: "test", mapSeed: 0 },
    environment: {},
    weather: { current: "clear", hazardTiles: [], hazardTileSet: new Set() },
  };
}

describe("InspectorPanel processing block", () => {
  it("a: kitchen tile shows 'Processing' in inspector HTML", async () => {
    makeDOM();
    const { InspectorPanel } = await import("../src/ui/panels/InspectorPanel.js");
    const selectedTile = { ix: 5, iz: 5, type: TILE.KITCHEN };
    const snap = [{ kind: "kitchen", ix: 5, iz: 5, progress01: 0.65, etaSec: 1.1, workerPresent: true, stalled: false, stallReason: null, inputOk: true }];
    const state = makeState({ selectedTile, processingSnapshot: snap });
    const panel = new InspectorPanel(state);
    panel.render();
    assert.ok(panel.root.innerHTML.includes("Processing"), "should contain 'Processing'");
  });

  it("b: kitchen tile shows cycle percentage and 'Cycle:'", async () => {
    makeDOM();
    const { InspectorPanel } = await import("../src/ui/panels/InspectorPanel.js");
    const selectedTile = { ix: 5, iz: 5, type: TILE.KITCHEN };
    const snap = [{ kind: "kitchen", ix: 5, iz: 5, progress01: 0.65, etaSec: 1.1, workerPresent: true, stalled: false, stallReason: null, inputOk: true }];
    const state = makeState({ selectedTile, processingSnapshot: snap });
    const panel = new InspectorPanel(state);
    panel.render();
    assert.ok(panel.root.innerHTML.includes("Cycle:"), "should contain 'Cycle:'");
    assert.ok(panel.root.innerHTML.includes("%"), "should contain '%'");
  });

  it("c: kitchen tile shows ETA in seconds", async () => {
    makeDOM();
    const { InspectorPanel } = await import("../src/ui/panels/InspectorPanel.js");
    const selectedTile = { ix: 5, iz: 5, type: TILE.KITCHEN };
    const snap = [{ kind: "kitchen", ix: 5, iz: 5, progress01: 0.65, etaSec: 1.1, workerPresent: true, stalled: false, stallReason: null, inputOk: true }];
    const state = makeState({ selectedTile, processingSnapshot: snap });
    const panel = new InspectorPanel(state);
    panel.render();
    assert.ok(panel.root.innerHTML.includes("ETA"), "should contain 'ETA'");
    assert.ok(panel.root.innerHTML.includes("s)"), "should contain 's)'");
  });

  it("d: stalled kitchen (no cook) shows 'stalled' and 'no cook'", async () => {
    makeDOM();
    const { InspectorPanel } = await import("../src/ui/panels/InspectorPanel.js");
    const selectedTile = { ix: 5, iz: 5, type: TILE.KITCHEN };
    const snap = [{ kind: "kitchen", ix: 5, iz: 5, progress01: 0.3, etaSec: 2.1, workerPresent: false, stalled: true, stallReason: "no cook", inputOk: true }];
    const state = makeState({ selectedTile, processingSnapshot: snap });
    const panel = new InspectorPanel(state);
    panel.render();
    assert.ok(panel.root.innerHTML.includes("stalled"), "should contain 'stalled'");
    assert.ok(panel.root.innerHTML.includes("no cook"), "should contain 'no cook'");
  });

  it("e: grass tile (no processing kind) does not show 'Processing' block", async () => {
    makeDOM();
    const { InspectorPanel } = await import("../src/ui/panels/InspectorPanel.js");
    const selectedTile = { ix: 3, iz: 3, type: TILE.GRASS };
    const state = makeState({ selectedTile, processingSnapshot: [] });
    const panel = new InspectorPanel(state);
    panel.render();
    // Grass tile should not have a Processing block
    assert.ok(!panel.root.innerHTML.includes("<b>Processing</b>"), "grass tile should not show Processing block");
  });
});
