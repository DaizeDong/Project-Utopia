// v0.8.2 Round-1 01c-ui — Casual-profile gate on #statusScoreBreak.
// Plan: assignments/homework6/Agent-Feedback-Loop/Round1/Plans/01c-ui.md
//
// HUDController should NOT render the developer-only score breakdown
// ("+1/s · +5/birth · -10/death (lived X · births Y · deaths -Z)") when
// document.body.classList contains "casual-mode". That copy is gated via CSS
// (class `dev-only`) AND JS (this test) so AT tools never see the dev string.
//
// Dev profile (body.dev-mode, no casual-mode) keeps the full breakdown text so
// speedrunners/devs still see it.

import test from "node:test";
import assert from "node:assert/strict";

import { HUDController } from "../../src/ui/hud/HUDController.js";
import { createInitialGameState } from "../../src/entities/EntityFactory.js";

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

// Required HUD DOM refs for HUDController.render() — keep in sync with the
// existing test/hud-controller.test.js stub set. Any node not listed resolves
// to `null` (HUDController already no-ops on missing nodes for most fields).
const REQUIRED_NODE_IDS = [
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
  "statusScoreBreak",
];

function makeDocStub(classTokens = []) {
  const nodes = Object.fromEntries(
    REQUIRED_NODE_IDS.map((id) => [id, makeNode()]),
  );
  const bodyClassSet = new Set(classTokens);
  const body = {
    classList: {
      contains: (t) => bodyClassSet.has(t),
      add: (t) => bodyClassSet.add(t),
      remove: (t) => bodyClassSet.delete(t),
    },
  };
  return {
    nodes,
    doc: {
      body,
      getElementById(id) {
        return nodes[id] ?? null;
      },
    },
  };
}

function withStubbedDocument(doc, fn) {
  const prevDocument = globalThis.document;
  globalThis.document = doc;
  try {
    return fn();
  } finally {
    globalThis.document = prevDocument;
  }
}

test("HUDController clears #statusScoreBreak textContent in casual profile", () => {
  const { nodes, doc } = makeDocStub(["casual-mode"]);

  withStubbedDocument(doc, () => {
    const state = createInitialGameState({ seed: 4242 });
    state.metrics.timeSec = 300;
    state.metrics.birthsTotal = 7;
    state.metrics.deathsTotal = 2;

    const hud = new HUDController(state);
    hud.render();

    assert.equal(
      nodes.statusScoreBreak.textContent,
      "",
      "casual profile must not expose dev score breakdown copy",
    );
    assert.equal(
      nodes.statusScoreBreak.attrs.title ?? "",
      "",
      "casual profile must clear tooltip so screen readers get no dev copy",
    );
  });
});

test("HUDController populates #statusScoreBreak with rules + subtotals in dev profile", () => {
  const { nodes, doc } = makeDocStub(["dev-mode"]);

  withStubbedDocument(doc, () => {
    const state = createInitialGameState({ seed: 4242 });
    state.metrics.timeSec = 300;
    state.metrics.birthsTotal = 7;
    state.metrics.deathsTotal = 2;

    const hud = new HUDController(state);
    hud.render();

    const text = nodes.statusScoreBreak.textContent;
    assert.match(text, /\+\d+\/s/, "should contain per-second rule");
    assert.match(text, /\/birth/, "should contain per-birth rule");
    assert.match(text, /\/death/, "should contain per-death rule");
    assert.match(text, /lived /, "should contain lived subtotal");
    assert.match(text, /births /, "should contain births subtotal");
    assert.match(text, /deaths -/, "should contain deaths subtotal");
    assert.equal(
      nodes.statusScoreBreak.attrs.title,
      text,
      "tooltip should mirror textContent for hover on truncation",
    );
  });
});

test("HUDController toggles score break render when body class flips casual→dev", () => {
  const { nodes, doc } = makeDocStub(["casual-mode"]);

  withStubbedDocument(doc, () => {
    const state = createInitialGameState({ seed: 4242 });
    state.metrics.timeSec = 120;
    state.metrics.birthsTotal = 3;
    state.metrics.deathsTotal = 1;

    const hud = new HUDController(state);

    hud.render();
    assert.equal(
      nodes.statusScoreBreak.textContent,
      "",
      "pre-flip casual render should be empty",
    );

    // Simulate ?dev=1 gate flipping body class at runtime.
    doc.body.classList.remove("casual-mode");
    doc.body.classList.add("dev-mode");

    hud.render();
    assert.match(
      nodes.statusScoreBreak.textContent,
      /\/birth/,
      "post-flip dev render must show breakdown copy",
    );
  });
});
