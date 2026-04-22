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
