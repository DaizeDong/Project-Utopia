// v0.10.1-n R11 Plan-PII-modal-zstack — splash-mount stacking guard test.
//
// Reviewer PII observed at HEAD 652220f that clicking "New Map" on a
// run-ended overlay re-mounted the splash BEHIND the still-mounted end
// overlay, leaving sim-clock pinned at 0:04 while the player thought the
// game had frozen. GameStateOverlay.render() now sweeps any stray
// `.overlay-panel.run-ended` element and force-hides #overlayEndPanel
// when transitioning into menu phase. Both branches are exercised here.

import test from "node:test";
import assert from "node:assert/strict";

import { GameStateOverlay } from "../src/ui/hud/GameStateOverlay.js";

function makeElement() {
  return {
    hidden: false,
    textContent: "",
    style: {},
    attrs: {},
    innerHTML: "",
    disabled: false,
    value: "",
    listeners: {},
    addEventListener(type, handler) {
      (this.listeners[type] ??= []).push(handler);
    },
    setAttribute(key, value) {
      this.attrs[key] = value;
    },
    removeAttribute(key) {
      delete this.attrs[key];
    },
    hasAttribute(key) {
      return Object.prototype.hasOwnProperty.call(this.attrs, key);
    },
  };
}

function makeNodes() {
  return {
    gameStateOverlay: makeElement(),
    overlayMenuPanel: makeElement(),
    overlayEndPanel: makeElement(),
    overlayMenuTitle: makeElement(),
    overlayMenuLead: makeElement(),
    overlayMenuMeta: makeElement(),
    overlayObjectiveCards: makeElement(),
    overlayMenuBriefing: makeElement(),
    overlayMenuPressure: makeElement(),
    overlayMenuPriority: makeElement(),
    overlayMenuLens: makeElement(),
    overlayMenuSizeHint: makeElement(),
    overlayEndMeta: makeElement(),
    overlayEndTitle: makeElement(),
    overlayEndReason: makeElement(),
    overlayEndStats: makeElement(),
    overlayStartBtn: makeElement(),
    overlayResetFromMenuBtn: makeElement(),
    overlayRestartBtn: makeElement(),
    overlayResetBtn: makeElement(),
    overlayMapWidth: { ...makeElement(), value: "96" },
    overlayMapHeight: { ...makeElement(), value: "72" },
    overlayMapTemplate: { ...makeElement(), value: "temperate_plains", innerHTML: "" },
  };
}

function withMockDocument({ staleRunEnded } = {}) {
  const nodes = makeNodes();
  let staleEl = null;
  let staleRemoved = false;
  if (staleRunEnded) {
    staleEl = {
      remove() { staleRemoved = true; staleEl = null; },
    };
  }
  const prevDocument = globalThis.document;
  globalThis.document = {
    body: { classList: { contains() { return false; } } },
    getElementById(id) { return nodes[id] ?? null; },
    querySelector(selector) {
      if (selector === ".overlay-panel.run-ended") return staleEl;
      return null;
    },
  };
  return {
    nodes,
    restore: () => { globalThis.document = prevDocument; },
    wasRemoved: () => staleRemoved,
  };
}

function makeState() {
  return {
    gameplay: {
      scenario: { title: "Frontier", family: "frontier", summary: "" },
      objectives: [],
    },
    grid: { width: 96, height: 72 },
    controls: { mapTemplateId: "temperate_plains", mapWidth: 96, mapHeight: 72 },
    world: { mapSeed: 42, mapTemplateId: "temperate_plains", mapTemplateName: "Temperate Plains" },
    metrics: { populationStats: { workers: 0, totalEntities: 0 }, timeSec: 0 },
    agents: [],
    animals: [],
  };
}

test("splash mount unmounts a stale .overlay-panel.run-ended element when transitioning end → menu", () => {
  const ctx = withMockDocument({ staleRunEnded: true });
  try {
    const overlay = new GameStateOverlay(makeState());
    // Drive the phase from end → menu so the guard fires (priorPhase !== "menu").
    overlay.render({ phase: "end" });
    overlay.render({ phase: "menu" });
    assert.equal(ctx.wasRemoved(), true, "stale .overlay-panel.run-ended should have been removed");
    assert.equal(ctx.nodes.overlayEndPanel.hidden, true, "#overlayEndPanel must be force-hidden on menu transition");
  } finally {
    ctx.restore();
  }
});

test("splash mount is a no-op when no stale run-ended overlay is present", () => {
  const ctx = withMockDocument({ staleRunEnded: false });
  try {
    const overlay = new GameStateOverlay(makeState());
    assert.doesNotThrow(() => {
      overlay.render({ phase: "end" });
      overlay.render({ phase: "menu" });
    });
  } finally {
    ctx.restore();
  }
});
