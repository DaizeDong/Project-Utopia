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
  };
}

test("HUDController shows session phase and action severity", () => {
  const nodes = {
    foodVal: makeNode(),
    woodVal: makeNode(),
    foodBar: makeNode(),
    woodBar: makeNode(),
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
  };

  const prevDocument = globalThis.document;
  globalThis.document = {
    getElementById(id) {
      return nodes[id] ?? null;
    },
  };

  try {
    const state = createInitialGameState({ seed: 1337 });
    state.session.phase = "end";
    state.session.outcome = "loss";
    state.resources.food = 12;
    state.resources.wood = 8;
    state.gameplay.prosperity = 32;
    state.gameplay.threat = 12;
    state.controls.tool = "road";
    state.controls.isPaused = true;
    state.controls.actionMessage = "Run ended: All workers are gone.";
    state.controls.actionKind = "error";
    state.metrics.timeSec = 12;
    state.metrics.simStepsThisFrame = 0;
    state.metrics.averageFps = 60;
    state.metrics.frameMs = 16;
    state.metrics.warnings = [];

    const hud = new HUDController(state);
    hud.render();

    assert.match(nodes.simVal.textContent, /phase=end/i);
    assert.equal(nodes.actionVal.attrs["data-kind"], "error");
    assert.equal(nodes.warningVal.attrs["data-kind"], "info");
  } finally {
    globalThis.document = prevDocument;
  }
});
