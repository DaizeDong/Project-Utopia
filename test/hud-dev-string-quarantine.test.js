// v0.8.2 Round-6 Wave-1 (01c-ui Step 8) — dev-string quarantine tests.
//
// Plan: assignments/homework6/Agent-Feedback-Loop/Round6/Plans/01c-ui.md
//
// These tests pin the contract that engineer-facing diagnostic strings
// (`Why no WHISPER?: ...`, `next policy in 9.8s`, `LLM offline — DIRECTOR
// steering`) only surface to the player when dev-mode is on. Three
// scenarios:
//   (a) Non-dev mode — HUDController must NOT include "Why no WHISPER" in
//       the storytellerStrip tooltip; #storytellerWhisperBadge MUST be
//       visible (hidden attribute removed); #storytellerWhyNoWhisper must
//       be hidden / empty.
//   (b) Dev mode (state.controls.devMode=true) — tooltip MUST include
//       "Why no WHISPER" and the badge MUST be hidden (engineer is reading
//       the topbar string instead).
//   (c) `getAutopilotStatus(state, { devMode: false })` MUST NOT include
//       `next policy in` or `LLM offline — DIRECTOR steering`.

import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/entities/EntityFactory.js";
import { HUDController } from "../src/ui/hud/HUDController.js";
import { getAutopilotStatus } from "../src/ui/hud/autopilotStatus.js";

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
    checked: false,
    className: "",
    classList: makeClassList(),
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
    appendChild(child) { child.parentNode = this; this.children.push(child); this.childNodes = this.children; return child; },
    replaceChildren(...children) { this.children = []; this.childNodes = this.children; for (const c of children) this.appendChild(c); },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  Object.defineProperty(node, "textContent", {
    get() { return this._textContent ?? this.children.map((c) => c.textContent).join(""); },
    set(v) { this.children = []; this.childNodes = this.children; this._textContent = String(v ?? ""); },
  });
  Object.defineProperty(node, "hidden", {
    get() { return this.hasAttribute("hidden"); },
    set(v) { if (v) this.setAttribute("hidden", ""); else this.removeAttribute("hidden"); },
  });
  return node;
}

function withHudDom(fn, { devMode = false } = {}) {
  const prevDocument = globalThis.document;
  const nodes = {};
  const bodyClasses = makeClassList(devMode ? ["dev-mode"] : []);
  const doc = {
    body: { classList: bodyClasses },
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

function makeStateWithFallback() {
  const state = createInitialGameState({ seed: 7 });
  // Force fallback-degraded badge by setting source=fallback + proxyHealth=error.
  state.ai = state.ai ?? {};
  state.ai.lastPolicySource = "fallback";
  state.ai.lastPolicyError = "";
  state.ai.policyLlmCount = 0;
  state.ai.policyDecisionCount = 1;
  state.ai.lastPolicyBatch = [];
  if (!state.ai.groupPolicies || typeof state.ai.groupPolicies.set !== "function") {
    state.ai.groupPolicies = new Map();
  }
  state.ai.groupPolicies.set("workers", {
    data: { focus: "rebuild the broken supply lane", summary: "cargo queue saturated" },
  });
  state.metrics = state.metrics ?? {};
  state.metrics.proxyHealth = "error";
  state.metrics.timeSec = 60;
  state.debug = state.debug ?? {};
  return state;
}

test("non-dev mode: storyteller tooltip omits 'Why no WHISPER', badge is visible", () => {
  withHudDom((nodes) => {
    const state = makeStateWithFallback();
    state.controls.devMode = false;
    const hud = new HUDController(state);
    hud.render();

    const stripTitle = nodes.storytellerStrip.attrs.title ?? "";
    assert.ok(
      !/Why no WHISPER/.test(stripTitle),
      `casual tooltip leaked engineer string: ${stripTitle}`,
    );

    // Badge should be visible (no hidden attr).
    assert.equal(
      nodes.storytellerWhisperBadge.hasAttribute("hidden"),
      false,
      "casual mode must show the ⚠ badge so the player has a hover affordance",
    );
    // Badge must carry the in-fiction tooltip.
    const badgeTooltip = nodes.storytellerWhisperBadge.attrs["data-tooltip"] ?? "";
    assert.match(
      badgeTooltip,
      /Storyteller fell back/,
      "badge must carry humanised tooltip",
    );

    // The dev-only span must be empty / hidden.
    assert.equal(nodes.storytellerWhyNoWhisper.textContent, "");
    assert.equal(nodes.storytellerWhyNoWhisper.hasAttribute("hidden"), true);
  }, { devMode: false });
});

test("dev mode (state.controls.devMode=true): tooltip includes 'Why no WHISPER', badge hidden", () => {
  withHudDom((nodes) => {
    const state = makeStateWithFallback();
    state.controls.devMode = true;
    const hud = new HUDController(state);
    hud.render();

    const stripTitle = nodes.storytellerStrip.attrs.title ?? "";
    assert.match(
      stripTitle,
      /Why no WHISPER/,
      `dev tooltip must keep engineer string: ${stripTitle}`,
    );

    // Badge must be hidden in dev mode.
    assert.equal(
      nodes.storytellerWhisperBadge.hasAttribute("hidden"),
      true,
      "dev mode hides the casual ⚠ badge — engineer reads the topbar string",
    );

    // Span shows the engineer reason.
    assert.match(
      nodes.storytellerWhyNoWhisper.textContent,
      /Why no WHISPER\?:/,
    );
    assert.equal(nodes.storytellerWhyNoWhisper.hasAttribute("hidden"), false);
  }, { devMode: true });
});

test("getAutopilotStatus with devMode:false omits 'next policy in' and 'LLM offline'", () => {
  const status = getAutopilotStatus({
    ai: {
      enabled: true,
      mode: "fallback",
      coverageTarget: "fallback",
      lastPolicySource: "fallback",
      lastError: "HTTP 503",
      lastPolicyResultSec: 2,
    },
    metrics: { timeSec: 5, proxyHealth: "error" },
  }, { devMode: false });

  assert.ok(
    !/next policy in/.test(status.text),
    `casual chip leaked countdown: ${status.text}`,
  );
  assert.ok(
    !/LLM offline/.test(status.text),
    `casual chip leaked offline tag: ${status.text}`,
  );
  // Casual chip should still convey ON + simple mode label.
  assert.match(status.text, /Autopilot ON/);
  // Title (tooltip) MAY still carry the engineer info — that's fine,
  // tooltip is a hover-only deeper layer.
});

test("getAutopilotStatus with devMode:true preserves engineer info", () => {
  const status = getAutopilotStatus({
    ai: {
      enabled: true,
      mode: "fallback",
      coverageTarget: "fallback",
      lastPolicySource: "fallback",
      lastError: "HTTP 503",
      lastPolicyResultSec: 2,
    },
    metrics: { timeSec: 5, proxyHealth: "error" },
  }, { devMode: true });

  assert.match(status.text, /next policy in/);
  assert.match(status.text, /LLM offline/);
});
