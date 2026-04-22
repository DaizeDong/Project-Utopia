// v0.8.2 Round0 01c-ui — Dev-mode gate unit tests.
// Plan: assignments/homework6/Agent-Feedback-Loop/Round0/Plans/01c-ui.md
//
// The gate helpers in src/app/devModeGate.js encapsulate the three
// enablement signals (URL query, localStorage, Ctrl+Shift+D chord) so they
// can be verified without standing up the full GameApp (which requires
// three.js, canvas, and a live DOM). The helpers are consumed by
// GameApp.#initDevModeGate.

import test from "node:test";
import assert from "node:assert/strict";

import {
  readInitialDevMode,
  isDevModeChord,
  toggleDevMode,
  applyInitialDevMode,
  DEV_MODE_BODY_CLASS,
  DEV_MODE_STORAGE_KEY,
} from "../src/app/devModeGate.js";

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

test("readInitialDevMode returns false for bare href and empty storage", () => {
  const storage = makeStorage();
  const on = readInitialDevMode({
    locationHref: "http://localhost:5173/",
    storage,
  });
  assert.equal(on, false);
});

test("readInitialDevMode detects ?dev=1 URL query", () => {
  const storage = makeStorage();
  const on = readInitialDevMode({
    locationHref: "http://localhost:5173/?dev=1",
    storage,
  });
  assert.equal(on, true);
});

test("readInitialDevMode ignores ?dev= with non-1 values", () => {
  const storage = makeStorage();
  for (const href of [
    "http://localhost:5173/?dev=0",
    "http://localhost:5173/?dev=true",
    "http://localhost:5173/?debug=1",
  ]) {
    assert.equal(readInitialDevMode({ locationHref: href, storage }), false, href);
  }
});

test("readInitialDevMode honors persistent localStorage opt-in", () => {
  const storage = makeStorage({ [DEV_MODE_STORAGE_KEY]: "1" });
  const on = readInitialDevMode({
    locationHref: "http://localhost:5173/",
    storage,
  });
  assert.equal(on, true);
});

test("readInitialDevMode survives throwing storage (privacy mode)", () => {
  const storage = {
    getItem() {
      throw new Error("SecurityError: localStorage unavailable");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
  };
  const on = readInitialDevMode({
    locationHref: "http://localhost:5173/?dev=1",
    storage,
  });
  assert.equal(on, true, "URL signal still wins when storage throws");
});

test("applyInitialDevMode adds dev-mode class when on, no-op when off", () => {
  const body = makeBody();
  applyInitialDevMode(body, false);
  assert.equal(body.classList.contains(DEV_MODE_BODY_CLASS), false);
  applyInitialDevMode(body, true);
  assert.equal(body.classList.contains(DEV_MODE_BODY_CLASS), true);
});

test("isDevModeChord matches Ctrl+Shift+D only", () => {
  assert.equal(
    isDevModeChord({ ctrlKey: true, shiftKey: true, code: "KeyD", key: "D" }),
    true,
  );
  assert.equal(
    isDevModeChord({ metaKey: true, shiftKey: true, code: "KeyD", key: "d" }),
    true,
    "Cmd+Shift+D (macOS) should also match",
  );
  assert.equal(
    isDevModeChord({ ctrlKey: true, code: "KeyD", key: "d" }),
    false,
    "requires shift",
  );
  assert.equal(
    isDevModeChord({ shiftKey: true, code: "KeyD", key: "d" }),
    false,
    "requires ctrl/meta",
  );
  assert.equal(
    isDevModeChord({ ctrlKey: true, shiftKey: true, code: "KeyX", key: "x" }),
    false,
    "wrong letter",
  );
  assert.equal(
    isDevModeChord({ ctrlKey: true, shiftKey: true, code: "KeyD", key: "d", repeat: true }),
    false,
    "held-down repeats ignored",
  );
});

test("toggleDevMode flips body class and persists to storage", () => {
  const body = makeBody();
  const storage = makeStorage();
  const first = toggleDevMode(body, storage);
  assert.equal(first, true);
  assert.equal(body.classList.contains(DEV_MODE_BODY_CLASS), true);
  assert.equal(storage._data[DEV_MODE_STORAGE_KEY], "1");

  const second = toggleDevMode(body, storage);
  assert.equal(second, false);
  assert.equal(body.classList.contains(DEV_MODE_BODY_CLASS), false);
  assert.equal(storage._data[DEV_MODE_STORAGE_KEY], "0");
});

test("toggleDevMode without storage still mutates body class", () => {
  const body = makeBody();
  const result = toggleDevMode(body, null);
  assert.equal(result, true);
  assert.equal(body.classList.contains(DEV_MODE_BODY_CLASS), true);
});
