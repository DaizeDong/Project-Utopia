import test from "node:test";
import assert from "node:assert/strict";

import { GameStateOverlay } from "../src/ui/hud/GameStateOverlay.js";

function makeElement() {
  return {
    hidden: false,
    textContent: "",
    style: {},
    attrs: {},
    addEventListener() {},
    setAttribute(key, value) {
      this.attrs[key] = value;
    },
  };
}

test("GameStateOverlay disables hit testing while the run is active", () => {
  const nodes = {
    gameStateOverlay: makeElement(),
    overlayMenuPanel: makeElement(),
    overlayEndPanel: makeElement(),
    overlayMenuTitle: makeElement(),
    overlayMenuLead: makeElement(),
    overlayMenuMeta: makeElement(),
    overlayMenuSummary: makeElement(),
    overlayEndMeta: makeElement(),
    overlayEndTitle: makeElement(),
    overlayEndReason: makeElement(),
    overlayEndStats: makeElement(),
    overlayStartBtn: makeElement(),
    overlayResetFromMenuBtn: makeElement(),
    overlayRestartBtn: makeElement(),
    overlayResetBtn: makeElement(),
  };

  const prevDocument = globalThis.document;
  globalThis.document = {
    getElementById(id) {
      return nodes[id] ?? null;
    },
  };

  try {
    const overlay = new GameStateOverlay({
      gameplay: {
        scenario: {
          title: "Broken Frontier",
          family: "frontier_repair",
          summary: "Reconnect the west lumber line and reclaim the east depot.",
        },
        objectiveIndex: 0,
        objectives: [{ title: "Build Network", completed: false, progress: 25 }],
      },
      metrics: { populationStats: { workers: 4, totalEntities: 9, deathsTotal: 0 }, timeSec: 12 },
      agents: [],
      animals: [],
    });

    overlay.render({ phase: "active" });

    assert.equal(nodes.gameStateOverlay.hidden, true);
    assert.equal(nodes.gameStateOverlay.style.display, "none");
    assert.equal(nodes.gameStateOverlay.style.pointerEvents, "none");

    overlay.render({ phase: "menu" });

    assert.equal(nodes.gameStateOverlay.hidden, false);
    assert.equal(nodes.gameStateOverlay.style.display, "flex");
    assert.equal(nodes.gameStateOverlay.style.pointerEvents, "auto");
    assert.match(nodes.overlayMenuTitle.textContent, /Project Utopia Beta/i);
    assert.match(nodes.overlayMenuMeta.textContent, /Broken Frontier/i);
  } finally {
    globalThis.document = prevDocument;
  }
});
