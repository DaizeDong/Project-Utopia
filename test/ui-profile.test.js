// v0.8.2 Round0 02b-casual — UI profile gate unit tests.
// Plan: assignments/homework6/Agent-Feedback-Loop/Round0/Plans/02b-casual.md
//
// Covers:
//   1. readInitialUiProfile — URL query precedence, localStorage fallback,
//      unknown-value normalization, privacy-mode storage throws.
//   2. applyUiProfile — body.casual-mode class toggling + documentElement
//      data-ui-profile attribute wiring. Orthogonal to body.dev-mode
//      (set separately by 01c's applyInitialDevMode).
//   3. resolveGlobalShortcut phase-gating — L / 0 / 1-6 silenced in menu
//      phase (defensive; see plan §7 UNREPRODUCIBLE note).
//   4. index.html CSS gate — body.casual-mode suppresses
//      [data-resource-tier="secondary"].

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  readInitialUiProfile,
  applyUiProfile,
  UI_PROFILE_STORAGE_KEY,
  CASUAL_MODE_BODY_CLASS,
  DEV_MODE_BODY_CLASS,
} from "../src/app/devModeGate.js";
import { resolveGlobalShortcut } from "../src/app/shortcutResolver.js";

function makeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    _data: data,
  };
}

function makeBody(initialClasses = []) {
  const set = new Set(initialClasses);
  return {
    classList: {
      add: (c) => set.add(c),
      remove: (c) => set.delete(c),
      contains: (c) => set.has(c),
      toggle: (c, on) => {
        const want = on === undefined ? !set.has(c) : Boolean(on);
        if (want) set.add(c);
        else set.delete(c);
        return want;
      },
    },
    _set: set,
  };
}

function makeDocEl() {
  const attrs = new Map();
  return {
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => attrs.get(k) ?? null,
    _attrs: attrs,
  };
}

test("readInitialUiProfile defaults to casual for first-time players", () => {
  const storage = makeStorage();
  const profile = readInitialUiProfile({
    locationHref: "http://localhost:5173/",
    storage,
  });
  assert.equal(profile, "casual");
});

test("readInitialUiProfile reads ?ui=full URL query", () => {
  const storage = makeStorage();
  const profile = readInitialUiProfile({
    locationHref: "http://localhost:5173/?ui=full",
    storage,
  });
  assert.equal(profile, "full");
});

test("readInitialUiProfile normalizes unknown values to casual", () => {
  const storage = makeStorage();
  for (const bad of [
    "http://localhost:5173/?ui=expert",
    "http://localhost:5173/?ui=CASUAL",
    "http://localhost:5173/?ui=",
  ]) {
    const profile = readInitialUiProfile({ locationHref: bad, storage });
    // CASUAL should lowercase-match; expert/empty fall back to casual default.
    if (bad.includes("CASUAL")) {
      assert.equal(profile, "casual", bad);
    } else {
      assert.equal(profile, "casual", bad);
    }
  }
});

test("readInitialUiProfile honors localStorage when URL has no ?ui=", () => {
  const storage = makeStorage({ [UI_PROFILE_STORAGE_KEY]: "full" });
  const profile = readInitialUiProfile({
    locationHref: "http://localhost:5173/",
    storage,
  });
  assert.equal(profile, "full");
});

test("readInitialUiProfile URL query overrides storage", () => {
  const storage = makeStorage({ [UI_PROFILE_STORAGE_KEY]: "full" });
  const profile = readInitialUiProfile({
    locationHref: "http://localhost:5173/?ui=casual",
    storage,
  });
  assert.equal(profile, "casual");
});

test("readInitialUiProfile survives throwing storage (privacy mode)", () => {
  const storage = {
    getItem() {
      throw new Error("SecurityError: localStorage unavailable");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
  };
  const profile = readInitialUiProfile({
    locationHref: "http://localhost:5173/?ui=full",
    storage,
  });
  assert.equal(profile, "full", "URL signal still wins when storage throws");
});

test("applyUiProfile casual sets body.casual-mode + data-ui-profile=casual", () => {
  const body = makeBody();
  const docEl = makeDocEl();
  const out = applyUiProfile(body, docEl, "casual");
  assert.equal(out, "casual");
  assert.equal(body.classList.contains(CASUAL_MODE_BODY_CLASS), true);
  assert.equal(docEl.getAttribute("data-ui-profile"), "casual");
});

test("applyUiProfile full removes casual-mode class + data-ui-profile=full", () => {
  const body = makeBody([CASUAL_MODE_BODY_CLASS]);
  const docEl = makeDocEl();
  const out = applyUiProfile(body, docEl, "full");
  assert.equal(out, "full");
  assert.equal(body.classList.contains(CASUAL_MODE_BODY_CLASS), false);
  assert.equal(docEl.getAttribute("data-ui-profile"), "full");
});

test("applyUiProfile coerces unknown values to casual (safe default)", () => {
  const body = makeBody();
  const docEl = makeDocEl();
  const out = applyUiProfile(body, docEl, "power-user");
  assert.equal(out, "casual");
  assert.equal(body.classList.contains(CASUAL_MODE_BODY_CLASS), true);
});

test("applyUiProfile is orthogonal to dev-mode body class", () => {
  // Both dev-mode and casual-mode can coexist (e.g. ?dev=1&ui=casual).
  // Plan conflict C3 arbitration from summary.md:
  //   "02b 的 profile 开关通过相同 gate 旗标触发额外的 UI 差异"
  //   → but casual/full is orthogonal to dev on/off in CSS.
  const body = makeBody([DEV_MODE_BODY_CLASS]);
  const docEl = makeDocEl();
  applyUiProfile(body, docEl, "casual");
  assert.equal(body.classList.contains(DEV_MODE_BODY_CLASS), true);
  assert.equal(body.classList.contains(CASUAL_MODE_BODY_CLASS), true);
});

test("resolveGlobalShortcut gates L in menu phase (casual defense)", () => {
  assert.equal(
    resolveGlobalShortcut({ code: "KeyL", key: "l", repeat: false }, { phase: "menu" }),
    null,
  );
  assert.deepEqual(
    resolveGlobalShortcut({ code: "KeyL", key: "l", repeat: false }, { phase: "active" }),
    { type: "toggleHeatLens" },
  );
});

test("resolveGlobalShortcut gates tool digits (1-6) in menu/end phase", () => {
  for (const phase of ["menu", "end"]) {
    assert.equal(
      resolveGlobalShortcut({ code: "Digit1", key: "1", repeat: false }, { phase }),
      null,
      `Digit1 should be swallowed in phase ${phase}`,
    );
    assert.equal(
      resolveGlobalShortcut({ code: "Digit6", key: "6", repeat: false }, { phase }),
      null,
      `Digit6 should be swallowed in phase ${phase}`,
    );
  }
  assert.deepEqual(
    resolveGlobalShortcut({ code: "Digit3", key: "3", repeat: false }, { phase: "active" }),
    { type: "selectTool", tool: "lumber" },
  );
});

test("resolveGlobalShortcut keeps Escape active across phases", () => {
  for (const phase of ["menu", "active", "end"]) {
    assert.deepEqual(
      resolveGlobalShortcut({ code: "Escape", key: "escape", repeat: false }, { phase }),
      { type: "clearSelection" },
      `Escape should be active in phase ${phase}`,
    );
  }
});

test("index.html suppresses [data-resource-tier=secondary] when body.casual-mode", () => {
  const html = fs.readFileSync("index.html", "utf8");
  assert.match(
    html,
    /body\.casual-mode\s*\[data-resource-tier="secondary"\]\s*\{\s*display:\s*none\s*!important/i,
    "expected casual-mode CSS rule hiding secondary resource tier",
  );
  // Secondary tier markers wired up on the 5 "advanced" HUD resources.
  for (const id of ["hudMeals", "hudTools", "hudMedicine", "hudProsperity", "hudThreat"]) {
    const re = new RegExp(`id="${id}"[^>]*data-resource-tier="secondary"`);
    assert.match(html, re, `expected ${id} to carry data-resource-tier="secondary"`);
  }
});
