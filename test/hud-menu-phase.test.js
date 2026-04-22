import test from "node:test";
import assert from "node:assert/strict";

import { HUDController } from "../src/ui/hud/HUDController.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";

// v0.8.2 Round-0 01b — P1 guard tests.
// When the session is in any non-active phase (menu, paused, end), the
// simulation step is paused (GameApp#setRunPhase) but the HUD used to keep
// rendering the elapsed-seconds counter, creating a "game is running behind
// the menu" visual illusion. HUDController now freezes the ticker text to
// "--:--:--" and Score to an em-dash when phase !== "active".

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

function makeNodeBag() {
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

test("HUDController renders a frozen '--:--:--' ticker while session.phase is 'menu'", () => {
  const nodes = makeNodeBag();
  withMockedDocument(nodes, () => {
    const state = createInitialGameState({ seed: 1337 });
    // Fresh state already starts in 'menu'. Set a non-zero timeSec to prove
    // the guard looks at session.phase, not at metrics.timeSec.
    state.session.phase = "menu";
    state.metrics.timeSec = 42.5;
    state.metrics.survivalScore = 77;

    const hud = new HUDController(state);
    hud.render();

    assert.ok(
      nodes.statusObjective.textContent.startsWith("Survived --:--:--"),
      `statusObjective must start with frozen ticker; got: ${nodes.statusObjective.textContent}`,
    );
    assert.match(
      nodes.statusObjective.textContent,
      /Score \u2014/,
      "Score field must render as em-dash when session is not active",
    );
    assert.match(
      nodes.objectiveVal.textContent,
      /^Survived --:--:-- \u00b7 Score \u2014/,
      "objectiveVal (sidebar) must also freeze when session is not active",
    );
  });
});

test("HUDController renders the live ticker once session.phase is 'active'", () => {
  const nodes = makeNodeBag();
  withMockedDocument(nodes, () => {
    const state = createInitialGameState({ seed: 1337 });
    state.session.phase = "active";
    state.metrics.timeSec = 3725; // 1h 02m 05s
    state.metrics.survivalScore = 88;

    const hud = new HUDController(state);
    hud.render();

    assert.ok(
      nodes.statusObjective.textContent.startsWith("Survived 01:02:05"),
      `statusObjective should render live ticker when active; got: ${nodes.statusObjective.textContent}`,
    );
    assert.match(nodes.statusObjective.textContent, /Score 88/);
  });
});

test("HUDController freezes the ticker on the 'end' phase too so post-loss overlays look quiet", () => {
  const nodes = makeNodeBag();
  withMockedDocument(nodes, () => {
    const state = createInitialGameState({ seed: 1337 });
    state.session.phase = "end";
    state.session.outcome = "loss";
    state.metrics.timeSec = 1234;

    const hud = new HUDController(state);
    hud.render();

    assert.ok(
      nodes.statusObjective.textContent.startsWith("Survived --:--:--"),
      `end phase should also freeze; got: ${nodes.statusObjective.textContent}`,
    );
  });
});
