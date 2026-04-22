import test from "node:test";
import assert from "node:assert/strict";

import { HUDController } from "../src/ui/hud/HUDController.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";

// Minimal DOM node factory matching the pattern used in hud-controller.test.js.
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
  // Snapshot of ids HUDController.render() will look up. Missing ids are
  // tolerated by HUDController via `if (this.x)` guards.
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
    // Rate badges — subject-under-test
    foodRateVal: makeNode(),
    woodRateVal: makeNode(),
    stoneRateVal: makeNode(),
    herbsRateVal: makeNode(),
    mealsRateVal: makeNode(),
    toolsRateVal: makeNode(),
    medicineRateVal: makeNode(),
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

test("HUDController computes negative food rate after the 3s window", () => {
  const nodes = nodeBag();
  withMockedDocument(nodes, () => {
    const state = createInitialGameState({ seed: 1337 });
    state.resources.food = 100;
    state.metrics.timeSec = 0;

    const hud = new HUDController(state);
    hud.render(); // primes snapshot at t=0 food=100

    // Advance sim time past the window with lower food → should report ▼ value.
    state.metrics.timeSec = 60;
    state.resources.food = 40;
    hud.render();

    const text = nodes.foodRateVal.textContent;
    assert.match(text, /^▼/, `expected downward arrow, got ${JSON.stringify(text)}`);
    // 60 units lost over 60s = -60.0/min
    assert.match(text, /-60\.0\/min/);
  });
});

test("HUDController computes positive wood rate and idle flat rate", () => {
  const nodes = nodeBag();
  withMockedDocument(nodes, () => {
    const state = createInitialGameState({ seed: 1337 });
    state.resources.wood = 10;
    state.resources.stone = 0;
    state.metrics.timeSec = 0;

    const hud = new HUDController(state);
    hud.render();

    state.metrics.timeSec = 30;
    state.resources.wood = 40; // +30 over 30s = +60/min
    state.resources.stone = 0; // unchanged
    hud.render();

    assert.match(nodes.woodRateVal.textContent, /^▲ \+60\.0\/min$/);
    // Stone unchanged → tiny/zero rate, should render the idle "= 0.0" form.
    assert.match(nodes.stoneRateVal.textContent, /^= 0\.0\/min$/);
  });
});

test("HUDController shows placeholder before the first rate window completes", () => {
  const nodes = nodeBag();
  withMockedDocument(nodes, () => {
    const state = createInitialGameState({ seed: 1337 });
    state.resources.food = 50;
    state.metrics.timeSec = 0;

    const hud = new HUDController(state);
    hud.render();
    // Only 1s elapsed — inside RATE_WINDOW_SEC (3s) → still placeholder.
    state.metrics.timeSec = 1;
    state.resources.food = 25;
    hud.render();

    assert.equal(nodes.foodRateVal.textContent, "—");
  });
});
