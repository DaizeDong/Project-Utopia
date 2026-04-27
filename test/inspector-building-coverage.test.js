// v0.8.2 Round-6 Wave-2 (02a-rimworld-veteran Steps 1-3) — Inspector building
// coverage + worker carry 4 resources.
//
// Validates four behaviours the plan promises:
//   (a) selecting a FARM tile renders a "Last Yield" line in the Building block
//   (b) selecting a WAREHOUSE tile renders the "Kind:" warehouse line
//   (c) selecting a worker entity emits stone= and herbs= in the carry line
//   (d) processing block (KITCHEN) is still rendered (back-compat with
//       test/processingSnapshot.test.js + test/inspectorProcessingBlock.test.js)

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

function makeState({
  selectedTile = null,
  selectedEntityId = null,
  agents = [],
  productionByTile = null,
  processingSnapshot = null,
} = {}) {
  const W = 20;
  const H = 20;
  const tiles = new Uint8Array(W * H).fill(TILE.GRASS);
  if (selectedTile) tiles[selectedTile.ix + selectedTile.iz * W] = selectedTile.type;
  const metrics = {
    timeSec: 12.5,
    processing: processingSnapshot ?? [],
    warningLog: [],
    warnings: [],
  };
  if (productionByTile) {
    metrics.production = { byTile: productionByTile, lastUpdatedSec: 12.5 };
  }
  return {
    grid: { width: W, height: H, tiles, tileSize: 1, version: 1 },
    resources: { food: 50, wood: 20, stone: 10, herbs: 5, meals: 0, tools: 0, medicine: 0 },
    metrics,
    buildings: { warehouses: 1, farms: 1, lumbers: 1, kitchens: 0, smithies: 0, clinics: 0, walls: 0 },
    controls: { selectedTile, selectedEntityId, buildPreview: null, tool: "select", actionMessage: "" },
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

describe("InspectorPanel building coverage (02a Step 2/3)", () => {
  it("a: FARM tile renders 'Last Yield' line from production telemetry", async () => {
    makeDOM();
    const { InspectorPanel } = await import("../src/ui/panels/InspectorPanel.js");
    const selectedTile = { ix: 4, iz: 4, type: TILE.FARM };
    const byTile = new Map();
    byTile.set("4,4", { kind: "farm", lastYield: 1.4, lastTickSec: 12.5, idleReason: null });
    const state = makeState({ selectedTile, productionByTile: byTile });
    const panel = new InspectorPanel(state);
    panel.render();
    assert.ok(panel.root.innerHTML.includes("<b>Building</b>"), "Building block missing");
    assert.ok(panel.root.innerHTML.includes("Last Yield:"), "Last Yield line missing");
    assert.ok(panel.root.innerHTML.includes("1.40"), "yield value missing");
  });

  it("b: WAREHOUSE tile renders 'Kind: warehouse' line", async () => {
    makeDOM();
    const { InspectorPanel } = await import("../src/ui/panels/InspectorPanel.js");
    const selectedTile = { ix: 6, iz: 6, type: TILE.WAREHOUSE };
    const state = makeState({ selectedTile });
    const panel = new InspectorPanel(state);
    panel.render();
    assert.ok(panel.root.innerHTML.includes("<b>Building</b>"), "Building block missing");
    assert.ok(panel.root.innerHTML.includes("warehouse"), "warehouse kind missing");
    assert.ok(panel.root.innerHTML.includes("no harvest yet"), "fallback line missing");
  });

  it("c: worker carry shows stone= and herbs= alongside food/wood", async () => {
    makeDOM();
    const { InspectorPanel } = await import("../src/ui/panels/InspectorPanel.js");
    const worker = {
      id: "w1",
      type: "WORKER",
      kind: "worker",
      stateLabel: "idle",
      role: "FARM",
      groupId: "g1",
      x: 1.5,
      z: 2.5,
      vx: 0,
      vz: 0,
      hunger: 0.3,
      carry: { food: 1.2, wood: 0.5, stone: 0.7, herbs: 0.4 },
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
    assert.ok(html.includes("stone="), "carry should include stone= field");
    assert.ok(html.includes("herbs="), "carry should include herbs= field");
    assert.ok(html.includes("food="), "carry should include food= field");
    assert.ok(html.includes("wood="), "carry should include wood= field");
  });

  it("d: KITCHEN processing block still rendered (back-compat with R5b processingSnapshot)", async () => {
    makeDOM();
    const { InspectorPanel } = await import("../src/ui/panels/InspectorPanel.js");
    const selectedTile = { ix: 5, iz: 5, type: TILE.KITCHEN };
    const snap = [{
      kind: "kitchen",
      ix: 5,
      iz: 5,
      progress01: 0.65,
      etaSec: 1.1,
      workerPresent: true,
      stalled: false,
      stallReason: null,
      inputOk: true,
    }];
    const state = makeState({ selectedTile, processingSnapshot: snap });
    const panel = new InspectorPanel(state);
    panel.render();
    assert.ok(panel.root.innerHTML.includes("<b>Processing</b>"), "Processing block must remain for KITCHEN");
    assert.ok(panel.root.innerHTML.includes("Cycle:"), "Cycle line must remain");
  });

  it("e: FARM tile with no production entry shows 'no harvest yet' fallback", async () => {
    makeDOM();
    const { InspectorPanel } = await import("../src/ui/panels/InspectorPanel.js");
    const selectedTile = { ix: 7, iz: 7, type: TILE.FARM };
    const state = makeState({ selectedTile });
    const panel = new InspectorPanel(state);
    panel.render();
    assert.ok(panel.root.innerHTML.includes("Last Yield:"), "Last Yield line missing");
    assert.ok(panel.root.innerHTML.includes("no harvest yet"), "no-data fallback missing");
    assert.ok(panel.root.innerHTML.includes("Idle Reason:"), "Idle Reason line missing");
  });
});
