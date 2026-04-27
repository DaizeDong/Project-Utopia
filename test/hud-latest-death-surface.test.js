import test from "node:test";
import assert from "node:assert/strict";

import { HUDController } from "../src/ui/hud/HUDController.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";

// v0.8.2 Round-1 01d-mechanics-content (Step 8) — Smoke-test that
// HUDController.render() writes the newest "... died (...)" entry from
// state.gameplay.objectiveLog into the #latestDeathVal node, and falls back
// to "No deaths yet" when the log has no death entries.
// Mirrors the node stub pattern from hud-resource-rate.test.js so we do not
// need jsdom / three.js / WebGL.

function makeNode() {
  return {
    textContent: "",
    style: {},
    attrs: {},
    setAttribute(key, value) {
      this.attrs[key] = value;
    },
    addEventListener() {},
    removeEventListener() {},
    classList: {
      toggle() {},
      add() {},
      remove() {},
      contains() {
        return false;
      },
    },
  };
}

function nodeBag() {
  return {
    foodVal: makeNode(),
    woodVal: makeNode(),
    stoneVal: makeNode(),
    herbsVal: makeNode(),
    mealsVal: makeNode(),
    toolsVal: makeNode(),
    medicineVal: makeNode(),
    foodBar: makeNode(),
    woodBar: makeNode(),
    stoneBar: makeNode(),
    herbsBar: makeNode(),
    mealsBar: makeNode(),
    toolsBar: makeNode(),
    medicineBar: makeNode(),
    foodRateVal: makeNode(),
    woodRateVal: makeNode(),
    stoneRateVal: makeNode(),
    herbsRateVal: makeNode(),
    mealsRateVal: makeNode(),
    toolsRateVal: makeNode(),
    medicineRateVal: makeNode(),
    foodRateBreakdown: makeNode(),
    latestDeathVal: makeNode(),
    workersVal: makeNode(),
    visitorsVal: makeNode(),
    herbivoresVal: makeNode(),
    predatorsVal: makeNode(),
    farmersVal: makeNode(),
    loggersVal: makeNode(),
    weatherVal: makeNode(),
    mapVal: makeNode(),
    doctrineVal: makeNode(),
    prosperityVal: makeNode(),
    threatVal: makeNode(),
    objectiveVal: makeNode(),
    aiModeVal: makeNode(),
    aiEnvVal: makeNode(),
    aiPolicyVal: makeNode(),
    aiDecisionVal: makeNode(),
    deathVal: makeNode(),
    eventVal: makeNode(),
    timeVal: makeNode(),
    warningVal: makeNode(),
    actionVal: makeNode(),
    toolVal: makeNode(),
    simVal: makeNode(),
    fpsVal: makeNode(),
    frameVal: makeNode(),
    agentVal: makeNode(),
    visualModeVal: makeNode(),
    statusFood: makeNode(),
    statusWood: makeNode(),
    statusStone: makeNode(),
    statusHerbs: makeNode(),
    statusWorkers: makeNode(),
    statusMeals: makeNode(),
    statusTools: makeNode(),
    statusMedicine: makeNode(),
    statusProsperity: makeNode(),
    statusThreat: makeNode(),
    statusFoodBar: makeNode(),
    statusWoodBar: makeNode(),
    statusStoneBar: makeNode(),
    statusHerbsBar: makeNode(),
    statusProsperityBar: makeNode(),
    statusThreatBar: makeNode(),
    statusObjective: makeNode(),
    statusAction: makeNode(),
    hudFood: makeNode(),
    hudWood: makeNode(),
    hudWorkers: makeNode(),
    speedPauseBtn: makeNode(),
    speedPlayBtn: makeNode(),
    speedFastBtn: makeNode(),
    gameTimer: makeNode(),
  };
}

function withMockedDocument(nodes, fn) {
  const prev = globalThis.document;
  globalThis.document = {
    getElementById(id) {
      return nodes[id] ?? null;
    },
  };
  try {
    return fn();
  } finally {
    globalThis.document = prev;
  }
}

test("HUDController surfaces newest death line from objectiveLog to #latestDeathVal", () => {
  const nodes = nodeBag();
  withMockedDocument(nodes, () => {
    const state = createInitialGameState({ seed: 1337 });
    state.gameplay.objectiveLog = [
      "[12.3s] Alice died (starvation) near (10,10)",
      "[5.0s] Emergency relief arrived: +40 food",
    ];

    const hud = new HUDController(state);
    hud.render();

    const text = nodes.latestDeathVal.textContent;
    assert.match(text, /Alice died \(starvation\)/,
      `expected death line, got ${JSON.stringify(text)}`);
    assert.equal(nodes.latestDeathVal.attrs.title,
      "[12.3s] Alice died (starvation) near (10,10)");
  });
});

test("HUDController renders 'No deaths yet' when objectiveLog has no death lines", () => {
  const nodes = nodeBag();
  withMockedDocument(nodes, () => {
    const state = createInitialGameState({ seed: 1337 });
    state.gameplay.objectiveLog = [
      "[5.0s] Emergency relief arrived: +40 food",
      "[2.0s] Colony founded",
    ];

    const hud = new HUDController(state);
    hud.render();

    assert.equal(nodes.latestDeathVal.textContent, "No deaths yet");
  });
});

test("HUDController renders 'No deaths yet' when objectiveLog is empty or missing", () => {
  const nodes = nodeBag();
  withMockedDocument(nodes, () => {
    const state = createInitialGameState({ seed: 1337 });
    state.gameplay.objectiveLog = [];

    const hud = new HUDController(state);
    hud.render();

    assert.equal(nodes.latestDeathVal.textContent, "No deaths yet");
  });
});
