// v0.8.2 Round0 01c-ui — Developer mode gate helpers.
//
// The gate hides developer-only UI (Settings terrain sliders, Debug panel,
// Dev Telemetry dock — tagged with `.dev-only` in index.html) for
// first-time players. Dev mode is enabled when any of these signals hold:
//   1. URL query `?dev=1`
//   2. `localStorage.utopia:devMode === "1"` (persistent opt-in)
//   3. Ctrl+Shift+D keyboard chord (runtime toggle, persists to storage)
//
// Each reader is guarded so that browser privacy modes (e.g. Safari
// private) which throw on storage access won't break GameApp construction.

export const DEV_MODE_STORAGE_KEY = "utopia:devMode";
export const DEV_MODE_BODY_CLASS = "dev-mode";

// v0.8.2 Round0 02b-casual — UI profile gate (orthogonal to dev-mode).
//
// "casual" (default, first-time friendly) hides the long-tail engineering
// stats that overwhelm first-impression players (reviewer "02b-casual"
// surveyed 3/10 on v0.8.1). "full" restores the v0.8.1 HUD. Toggled via
// URL query `?ui=casual|full` or `localStorage.utopia:uiProfile`.
//
// body.casual-mode is asserted orthogonally to body.dev-mode so power
// users can run `?dev=1&ui=casual` (debug dock visible, casual focus
// panel) without either class fighting the other in CSS.
export const UI_PROFILE_STORAGE_KEY = "utopia:uiProfile";
export const CASUAL_MODE_BODY_CLASS = "casual-mode";
export const UI_PROFILE_VALUES = Object.freeze(["casual", "full"]);

/**
 * Read initial dev-mode signal from URL + storage.
 * Pure function — safe to unit-test with stubs.
 *
 * @param {object} opts
 * @param {string} [opts.locationHref]
 * @param {Storage} [opts.storage]
 * @returns {boolean}
 */
export function readInitialDevMode({ locationHref, storage } = {}) {
  let on = false;
  if (locationHref) {
    try {
      const url = new URL(locationHref);
      if (url.searchParams.get("dev") === "1") on = true;
    } catch {
      /* ignore malformed URL */
    }
  }
  if (storage) {
    try {
      if (storage.getItem(DEV_MODE_STORAGE_KEY) === "1") on = true;
    } catch {
      /* storage may throw in privacy mode */
    }
  }
  return on;
}

/**
 * Returns true if a keydown event matches the Ctrl+Shift+D chord.
 */
export function isDevModeChord(event) {
  if (!event || event.repeat) return false;
  const ctrlOrMeta = Boolean(event.ctrlKey || event.metaKey);
  const shift = Boolean(event.shiftKey);
  if (!ctrlOrMeta || !shift) return false;
  const code = String(event.code ?? "");
  const key = String(event.key ?? "").toLowerCase();
  return code === "KeyD" || key === "d";
}

/**
 * Toggle dev-mode on `body` and persist state to `storage`.
 * Returns the new on/off state.
 */
export function toggleDevMode(body, storage) {
  if (!body?.classList) return false;
  const nowOn = !body.classList.contains(DEV_MODE_BODY_CLASS);
  body.classList.toggle(DEV_MODE_BODY_CLASS, nowOn);
  if (storage) {
    try {
      storage.setItem(DEV_MODE_STORAGE_KEY, nowOn ? "1" : "0");
    } catch {
      /* storage may throw in privacy mode */
    }
  }
  return nowOn;
}

/**
 * Apply the initial dev-mode signal to `body` (add `dev-mode` class if on).
 * Idempotent — safe to call multiple times.
 */
export function applyInitialDevMode(body, initial) {
  if (!body?.classList) return;
  if (initial) body.classList.add(DEV_MODE_BODY_CLASS);
}

/**
 * v0.8.2 Round-6 Wave-1 (01c-ui Step 1) — unified dev-mode gate helper.
 *
 * Returns true when ANY of these signals hold:
 *   1. `state.controls.devMode === true` (in-game state flag, set by tests
 *      / programmatic toggles)
 *   2. `document.body.classList.contains('dev-mode')` (live DOM class, set
 *      by the URL/storage/Ctrl+Shift+D gate via `applyInitialDevMode` /
 *      `toggleDevMode`)
 *
 * Both signals are guarded so that headless / SSR runs (no document) and
 * privacy-mode browsers (storage may throw) cannot crash the caller. This
 * is the single source of truth used by HUDController, GameApp, and
 * autopilotStatus to decide whether to surface engineer-facing diagnostic
 * strings (Why no WHISPER? / proxy err.message / next-policy countdown).
 *
 * @param {object} [state] — game state with optional `state.controls.devMode`.
 * @returns {boolean}
 */
export function isDevMode(state) {
  if (state && state.controls && state.controls.devMode === true) return true;
  try {
    if (typeof document !== "undefined"
      && document.body
      && document.body.classList
      && document.body.classList.contains(DEV_MODE_BODY_CLASS)) {
      return true;
    }
  } catch {
    /* DOM unavailable (jsdom edge cases / SSR) — fall through */
  }
  return false;
}

/**
 * Read the initial UI profile (casual | full) from URL + storage.
 * Casual is the default for first-time players. Pure function — safe to
 * unit-test with stubs. Unknown values collapse to "casual".
 *
 * @param {object} opts
 * @param {string} [opts.locationHref]
 * @param {Storage} [opts.storage]
 * @returns {"casual"|"full"}
 */
export function readInitialUiProfile({ locationHref, storage } = {}) {
  const normalize = (raw) => {
    const v = String(raw ?? "").trim().toLowerCase();
    return UI_PROFILE_VALUES.includes(v) ? v : null;
  };

  if (locationHref) {
    try {
      const url = new URL(locationHref);
      const fromQuery = normalize(url.searchParams.get("ui"));
      if (fromQuery) return fromQuery;
    } catch {
      /* ignore malformed URL */
    }
  }
  if (storage) {
    try {
      const fromStore = normalize(storage.getItem(UI_PROFILE_STORAGE_KEY));
      if (fromStore) return fromStore;
    } catch {
      /* storage may throw in privacy mode */
    }
  }
  return "casual";
}

/**
 * Apply the UI profile to `body` + `documentElement`. Sets/removes the
 * `casual-mode` body class and writes `data-ui-profile="casual|full"` on
 * the html element (for CSS attribute selectors). Idempotent.
 *
 * @param {HTMLElement|object} body   document.body (or mock)
 * @param {HTMLElement|object} [docEl] document.documentElement (or mock);
 *                                      if omitted the data attribute is
 *                                      skipped (body class still set).
 * @param {"casual"|"full"} profile
 */
export function applyUiProfile(body, docEl, profile) {
  const effective = UI_PROFILE_VALUES.includes(profile) ? profile : "casual";
  if (body?.classList) {
    body.classList.toggle(CASUAL_MODE_BODY_CLASS, effective === "casual");
  }
  if (docEl && typeof docEl.setAttribute === "function") {
    docEl.setAttribute("data-ui-profile", effective);
  }
  return effective;
}
