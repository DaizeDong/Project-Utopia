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

function makeHudNodes() {
  const ids = [
    "foodVal",
    "woodVal",
    "foodBar",
    "woodBar",
    "workersVal",
    "visitorsVal",
    "herbivoresVal",
    "predatorsVal",
    "farmersVal",
    "loggersVal",
    "weatherVal",
    "mapVal",
    "doctrineVal",
    "prosperityVal",
    "threatVal",
    "objectiveVal",
    "aiModeVal",
    "aiEnvVal",
    "aiPolicyVal",
    "aiDecisionVal",
    "deathVal",
    "eventVal",
    "timeVal",
    "warningVal",
    "actionVal",
    "toolVal",
    "simVal",
    "fpsVal",
    "frameVal",
    "agentVal",
    "visualModeVal",
    "statusNextAction",
  ];
  return Object.fromEntries(ids.map((id) => [id, makeNode()]));
}

test("HUDController renders next-action advice with priority attributes", () => {
  const nodes = makeHudNodes();
  const prevDocument = globalThis.document;
  globalThis.document = {
    getElementById(id) {
      return nodes[id] ?? null;
    },
  };

  try {
    const state = createInitialGameState({ seed: 1337 });
    state.session.phase = "active";
    state.resources.food = 4;
    state.metrics.resourceEmptySec.food = 2;
    state.metrics.starvationRiskCount = 1;
    state.metrics.timeSec = 5;
    state.metrics.simStepsThisFrame = 1;
    state.metrics.averageFps = 60;
    state.metrics.frameMs = 16;

    const hud = new HUDController(state);
    hud.render();

    assert.equal(nodes.statusNextAction.attrs["data-priority"], "critical");
    assert.equal(nodes.statusNextAction.attrs["data-tool"], "farm");
    assert.equal(nodes.statusNextAction.attrs["data-reason"], "food_crisis");
    assert.match(nodes.statusNextAction.textContent, /^Next: Recover food now/);
    assert.match(nodes.statusNextAction.attrs.title, /Build or reconnect farms/);
  } finally {
    globalThis.document = prevDocument;
  }
});
