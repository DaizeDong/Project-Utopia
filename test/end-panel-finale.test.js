// v0.8.2 Round-6 Wave-3 (02e-indie-critic Step 10) — finale ceremony.
//
// Plan: assignments/homework6/Agent-Feedback-Loop/Round6/Plans/02e-indie-critic.md
//
// Asserts two contracts on GameStateOverlay's end panel:
//   (1) The 4 devTier buckets (low / mid / high / elite) each map to a
//       distinct authored title — NOT the legacy "Colony Lost" string.
//   (2) On finale, `#overlayEndAuthorLine` carries the scenario's
//       openingPressure prose so the run closes on a sentence the player
//       has already seen on the menu briefing.

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { deriveDevTier } from "../src/app/runOutcome.js";
import { GameStateOverlay } from "../src/ui/hud/GameStateOverlay.js";

function makeClassList(initial = []) {
  const tokens = new Set(initial);
  return {
    add: (t) => tokens.add(t),
    remove: (t) => tokens.delete(t),
    contains: (t) => tokens.has(t),
    toggle(t, force) {
      const want = force ?? !tokens.has(t);
      if (want) tokens.add(t);
      else tokens.delete(t);
      return want;
    },
  };
}

function makeElement(tagName = "div") {
  const node = {
    tagName: tagName.toUpperCase(),
    style: {},
    attrs: {},
    dataset: {},
    children: [],
    childNodes: [],
    classList: makeClassList(),
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
    appendChild(child) { child.parentNode = this; this.children.push(child); this.childNodes = this.children; return child; },
    replaceChildren(...children) { this.children = []; this.childNodes = this.children; for (const c of children) this.appendChild(c); },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  Object.defineProperty(node, "textContent", {
    get() { return this._textContent ?? ""; },
    set(v) { this._textContent = String(v ?? ""); },
  });
  Object.defineProperty(node, "innerHTML", {
    get() { return this._innerHTML ?? ""; },
    set(v) { this._innerHTML = String(v ?? ""); },
  });
  Object.defineProperty(node, "hidden", {
    get() { return this.hasAttribute("hidden"); },
    set(v) { if (v) this.setAttribute("hidden", ""); else this.removeAttribute("hidden"); },
  });
  Object.defineProperty(node, "value", {
    get() { return this._value ?? ""; },
    set(v) { this._value = String(v ?? ""); },
  });
  return node;
}

function withOverlayDom(fn) {
  const prevDocument = globalThis.document;
  const nodes = {};
  const doc = {
    body: { classList: makeClassList() },
    createElement(tagName) {
      const node = makeElement(tagName);
      node.ownerDocument = doc;
      return node;
    },
    getElementById(id) {
      nodes[id] ??= makeElement("div");
      nodes[id].ownerDocument = doc;
      return nodes[id];
    },
  };
  globalThis.document = doc;
  try {
    return fn(nodes);
  } finally {
    globalThis.document = prevDocument;
  }
}

test("deriveDevTier maps DevIndex into the 4-band bucket", () => {
  assert.equal(deriveDevTier(0), "low");
  assert.equal(deriveDevTier(24), "low");
  assert.equal(deriveDevTier(25), "mid");
  assert.equal(deriveDevTier(49), "mid");
  assert.equal(deriveDevTier(50), "high");
  assert.equal(deriveDevTier(74), "high");
  assert.equal(deriveDevTier(75), "elite");
  assert.equal(deriveDevTier(100), "elite");
  // Non-finite input falls back to "low" so finale resolution never throws.
  assert.equal(deriveDevTier(undefined), "low");
  assert.equal(deriveDevTier(NaN), "low");
});

test("end-panel finale title branches on devTier — 4 distinct authored lines", () => {
  withOverlayDom((nodes) => {
    const state = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
    const overlay = new GameStateOverlay(state);

    const titles = new Set();
    for (const tier of ["low", "mid", "high", "elite"]) {
      // Drive devIndex into each bucket via deriveDevTier's thresholds.
      const devIndex = tier === "low" ? 10
        : tier === "mid" ? 35
        : tier === "high" ? 60
        : 90;
      state.gameplay.devIndex = devIndex;
      overlay.render({ phase: "end", reason: "Run ended.", devTier: tier });
      const title = nodes.overlayEndTitle.textContent;
      assert.ok(title && title !== "Colony Lost",
        `tier=${tier} must produce an authored title, got "${title}"`);
      assert.ok(!/Run Ended/.test(title),
        `tier=${tier} title must not include legacy "Run Ended"; got "${title}"`);
      titles.add(title);
      assert.equal(nodes.overlayEndTitle.attrs["data-dev-tier"], tier,
        "endTitle exposes data-dev-tier for CSS / a11y selectors");
    }
    assert.equal(titles.size, 4,
      `4 devTier buckets MUST produce 4 distinct titles; got ${titles.size}: ${[...titles].join(" | ")}`);
  });
});

test("end-panel author line carries scenario openingPressure (temperate_plains low tier)", () => {
  withOverlayDom((nodes) => {
    const state = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
    state.gameplay.devIndex = 12; // → low tier
    state.controls.mapTemplateId = "temperate_plains";
    const overlay = new GameStateOverlay(state);
    overlay.render({ phase: "end", reason: "Both food and wood reached zero.", devTier: "low" });
    const line = nodes.overlayEndAuthorLine.textContent;
    assert.ok(line && line.length > 0, "author line must be populated for a known template");
    // The temperate_plains openingPressure copy contains "frontier is wide
    // open" — see src/world/scenarios/ScenarioFactory.js (a 2026-04 line
    // shared with the AUTHOR_VOICE_PACK in storytellerStrip.js).
    assert.match(line, /frontier is wide open|stalls fast/i,
      `expected temperate_plains openingPressure prose, got "${line}"`);
    // Visible (not hidden).
    assert.equal(nodes.overlayEndAuthorLine.hasAttribute("hidden"), false,
      "endAuthorLine must be visible in the end panel");
  });
});

test("end-panel author line falls back to deriveDevTier when session.devTier is missing", () => {
  // Back-compat: old runOutcome objects (pre-02e Step 7) lacked devTier.
  // GameStateOverlay must fall back to deriveDevTier(state.gameplay.devIndex)
  // so the title branch still works.
  withOverlayDom((nodes) => {
    const state = createInitialGameState({ templateId: "temperate_plains", seed: 1337 });
    state.gameplay.devIndex = 80; // → elite tier
    state.controls.mapTemplateId = "temperate_plains";
    const overlay = new GameStateOverlay(state);
    overlay.render({ phase: "end", reason: "Run ended." }); // no devTier field
    assert.equal(nodes.overlayEndTitle.attrs["data-dev-tier"], "elite",
      "missing session.devTier falls back to deriveDevTier(devIndex)");
  });
});
