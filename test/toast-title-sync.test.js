import test from "node:test";
import assert from "node:assert/strict";

import { HUDController } from "../src/ui/hud/HUDController.js";
import { createInitialGameState } from "../src/entities/EntityFactory.js";

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

// v0.8.2 Round-0 01d: The HUD status-action pill truncates at ~40 chars
// (max-width:420px + text-overflow:ellipsis). The full message must still be
// reachable via the browser tooltip, so HUDController mirrors actionMessage
// into the `title` attribute on every render.
test("HUDController mirrors actionMessage into statusAction.title for tooltip access", () => {
  const nodes = nodeBag();
  withMockedDocument(nodes, () => {
    const state = createInitialGameState({ seed: 1337 });
    const msg = "Emergency relief stabilized the colony. Use the window to rebuild routes and depots.";
    state.controls.actionMessage = msg;
    state.controls.actionKind = "success";

    const hud = new HUDController(state);
    hud.render();

    assert.equal(
      nodes.statusAction.attrs.title,
      msg,
      "title attribute should equal the full action message",
    );
    assert.equal(
      nodes.statusAction.textContent,
      msg,
      "textContent and title should carry the same full message",
    );
  });
});

test("HUDController clears statusAction.title when there is no active message", () => {
  const nodes = nodeBag();
  withMockedDocument(nodes, () => {
    const state = createInitialGameState({ seed: 1337 });
    state.controls.actionMessage = "";

    const hud = new HUDController(state);
    hud.render();

    assert.equal(nodes.statusAction.attrs.title, "", "title should be reset to empty when no message");
  });
});
