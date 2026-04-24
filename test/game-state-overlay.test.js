import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { GameStateOverlay } from "../src/ui/hud/GameStateOverlay.js";

const GAME_APP_SOURCE = fs.readFileSync("src/app/GameApp.js", "utf8");

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
    dispatchEvent(event) {
      const handlers = this.listeners[event?.type] ?? [];
      for (const handler of handlers) {
        handler.call(this, event);
      }
      return true;
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

function renderOverlay({ devMode = false } = {}) {
  const nodes = makeNodes();
  const prevDocument = globalThis.document;
  globalThis.document = {
    body: {
      classList: {
        contains(token) {
          return devMode && token === "dev-mode";
        },
      },
    },
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
      grid: { width: 96, height: 72 },
      controls: {
        mapTemplateId: "temperate_plains",
        mapWidth: 96,
        mapHeight: 72,
      },
      world: {
        mapSeed: 1337,
        mapTemplateId: "temperate_plains",
        mapTemplateName: "Temperate Plains",
      },
      metrics: { populationStats: { workers: 4, totalEntities: 9, deathsTotal: 0 }, timeSec: 12 },
      agents: [],
      animals: [],
    });

    overlay.render({ phase: "active" });
    const activeSnapshot = {
      hidden: nodes.gameStateOverlay.hidden,
      display: nodes.gameStateOverlay.style.display,
    };
    overlay.render({ phase: "menu" });

    return { nodes, activeSnapshot, overlay };
  } finally {
    globalThis.document = prevDocument;
  }
}

function applyActivePhase(harness, phase, options = {}) {
  const next = phase === "active" ? "active" : phase === "end" ? "end" : "menu";
  harness.state.session.phase = next;
  harness.state.session.outcome = options.outcome ?? (next === "end" ? harness.state.session.outcome : "none");
  harness.state.session.reason = options.reason ?? (next === "end" ? harness.state.session.reason : "");
  harness.state.session.endedAtSec = next === "end" ? harness.state.metrics.timeSec : -1;

  harness.state.controls.stepFramesPending = 0;
  harness.state.controls.isPaused = next !== "active";
  if (next === "active") {
    harness.state.metrics.benchmarkStatus = harness.benchmark.running
      ? harness.state.metrics.benchmarkStatus
      : "idle";
  }

  if (options.actionMessage) {
    harness.state.controls.actionMessage = options.actionMessage;
    harness.state.controls.actionKind = options.actionKind ?? "info";
  }

  if (next === "active") {
    harness.safeRenderPanel("GameStateOverlay", () => harness.gameStateOverlay.render(harness.state.session));
    harness.safeRenderPanel("HUD", () => harness.hud.render());
  }
}

test("GameStateOverlay hides during active run and shows speedrunner menu meta in menu", () => {
  const { nodes, activeSnapshot } = renderOverlay();

  assert.equal(activeSnapshot.hidden, true);
  assert.equal(activeSnapshot.display, "none");
  assert.equal(nodes.gameStateOverlay.hidden, false);
  assert.equal(nodes.gameStateOverlay.style.display, "flex");
  assert.match(nodes.overlayMenuTitle.textContent, /Project Utopia/i);
  assert.match(nodes.overlayMenuMeta.textContent, /Temperate Plains/);
  assert.match(nodes.overlayMenuMeta.textContent, /96x72 tiles/);
  assert.match(nodes.overlayMenuMeta.textContent, /Broken Frontier/);
  assert.doesNotMatch(nodes.overlayMenuMeta.textContent, /seed 1337/i);
});

test("GameStateOverlay only exposes the seed in dev mode", () => {
  const { nodes } = renderOverlay({ devMode: true });
  assert.match(nodes.overlayMenuMeta.textContent, /seed 1337/i);
});

test("template and size changes refresh the menu briefing immediately", () => {
  const { nodes, overlay } = renderOverlay();

  nodes.overlayMapTemplate.value = "fortified_basin";
  nodes.overlayMapTemplate.dispatchEvent({ type: "change" });
  nodes.overlayMapWidth.value = "128";
  nodes.overlayMapWidth.dispatchEvent({ type: "input" });
  nodes.overlayMapHeight.value = "96";
  nodes.overlayMapHeight.dispatchEvent({ type: "input" });

  assert.equal(overlay.state.controls.mapTemplateId, "fortified_basin");
  assert.equal(overlay.state.controls.mapWidth, 128);
  assert.equal(overlay.state.controls.mapHeight, 96);
  assert.match(nodes.overlayMenuMeta.textContent, /Fortified Basin/);
  assert.match(nodes.overlayMenuMeta.textContent, /128x96 tiles/);
  assert.match(nodes.overlayMenuMeta.textContent, /Hollow Keep/);
  assert.match(nodes.overlayMenuLead.textContent, /gates hang open/i);
  assert.match(nodes.overlayMenuPressure.textContent, /First pressure:/i);
  assert.match(nodes.overlayMenuPressure.textContent, /pressure/i);
  assert.match(nodes.overlayMenuPriority.textContent, /First build:/i);
  assert.match(nodes.overlayMenuLens.textContent, /Heat Lens:/i);
  assert.match(nodes.overlayMenuSizeHint.textContent, /larger maps|compact maps|balanced maps/i);
});

test("menu to active transition clears pause and syncs overlay plus HUD immediately", () => {
  const calls = [];
  const harness = {
    state: {
      session: { phase: "menu", outcome: "none", reason: "", endedAtSec: -1 },
      controls: {
        stepFramesPending: 3,
        isPaused: true,
        actionMessage: "Ready",
        actionKind: "info",
      },
      metrics: { timeSec: 0, benchmarkStatus: "queued" },
    },
    benchmark: { running: false },
    gameStateOverlay: {
      render(session) {
        calls.push(`overlay:${session.phase}`);
      },
    },
    hud: {
      render() {
        calls.push("hud");
      },
    },
    safeRenderPanel(panelName, renderFn) {
      calls.push(`panel:${panelName}`);
      renderFn();
    },
  };

  applyActivePhase(harness, "active", {
    actionMessage: "Run started: Temperate Plains (96x72 tiles). Build the starter network now. Try Again replays this layout; New Map rerolls.",
    actionKind: "success",
  });

  assert.equal(harness.state.session.phase, "active");
  assert.equal(harness.state.controls.isPaused, false);
  assert.equal(harness.state.controls.stepFramesPending, 0);
  assert.equal(harness.state.metrics.benchmarkStatus, "idle");
  assert.match(harness.state.controls.actionMessage, /^Run started: Temperate Plains \(\d+x\d+ tiles\)\./);
  assert.deepEqual(
    calls,
    ["panel:GameStateOverlay", "overlay:active", "panel:HUD", "hud"],
    "active transition should synchronise overlay hide and HUD refresh immediately",
  );
});

test("GameApp source advertises run start and includes the immediate sync hook", () => {
  assert.match(
    GAME_APP_SOURCE,
    /Run started: \$\{mapLabel\} \(\$\{mapSize\} tiles\)\. Build the starter network now\. Try Again replays this layout; New Map rerolls\./,
  );
  assert.match(
    GAME_APP_SOURCE,
    /this\.\#safeRenderPanel\("GameStateOverlay", \(\) => this\.gameStateOverlay\.render\(this\.state\.session\)\);\s+this\.\#safeRenderPanel\("HUD", \(\) => this\.hud\.render\(\)\);/,
    "active phase should synchronise the overlay and HUD immediately",
  );
});
