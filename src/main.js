import { GameApp } from "./app/GameApp.js";
import { readInitialDevMode } from "./app/devModeGate.js";

/**
 * Whitelist of valid `tool` names for the `__utopiaLongRun.placeToolAt` shim.
 *
 * Keep this list in sync with `index.html` `button[data-tool]` entries and with
 * the switch in `src/simulation/construction/BuildSystem.js#placeToolAt`.
 * (See `src/ui/tools/BuildToolbar.js#setupToolButtons` — the UI wires the same
 * set of strings into `state.controls.tool`.)
 *
 * This is a pure debug-API shim whitelist; it exists so that typos or
 * options-bag mis-invocations don't silently pollute `state.controls.tool`
 * with an object or unknown string (which previously caused the
 * "always builds road" bug reported by reviewer 02c-speedrunner).
 *
 * @type {ReadonlyArray<string>}
 */
const VALID_BUILD_TOOLS = Object.freeze([
  "road",
  "farm",
  "lumber",
  "warehouse",
  "wall",
  "bridge",
  "erase",
  "quarry",
  "herb_garden",
  "kitchen",
  "smithy",
  "clinic",
]);

const VALID_TOOL_LIST_TEXT = VALID_BUILD_TOOLS.join(", ");

function describeReceived(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `'${value}'`;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}

/**
 * Normalize the argument list passed to `__utopiaLongRun.placeToolAt`.
 *
 * Accepts two call shapes:
 *   1. positional:   placeToolAt(tool, ix, iz)
 *   2. options bag:  placeToolAt({ tool, ix, iz })
 *
 * Returns either `{ok:true, tool, ix, iz}` on success, or
 * `{ok:false, reason:"invalidArgs", reasonText, received}` on failure.
 *
 * Pure function — no `window`, no `app`, no Three.js. Safe to import from
 * `node --test` without triggering Vite side effects.
 *
 * @param {ReadonlyArray<unknown>} args  The raw argument list (rest params).
 * @returns {{ok:true, tool:string, ix:number, iz:number} |
 *           {ok:false, reason:"invalidArgs", reasonText:string, received:unknown}}
 */
export function normalizePlaceToolArgs(args) {
  const list = Array.isArray(args) ? args : [];
  let tool;
  let ix;
  let iz;

  if (list.length === 1 && typeof list[0] === "object" && list[0] !== null) {
    const bag = list[0];
    tool = bag.tool;
    ix = bag.ix;
    iz = bag.iz;
  } else if (list.length >= 3) {
    tool = list[0];
    ix = list[1];
    iz = list[2];
  } else {
    return {
      ok: false,
      reason: "invalidArgs",
      reasonText: `placeToolAt: expected (tool, ix, iz) or ({tool, ix, iz}); got ${list.length} arg(s).`,
      received: list,
    };
  }

  if (typeof tool !== "string" || !VALID_BUILD_TOOLS.includes(tool)) {
    return {
      ok: false,
      reason: "invalidArgs",
      reasonText: `placeToolAt: unknown tool ${describeReceived(tool)}. Valid tools: ${VALID_TOOL_LIST_TEXT}.`,
      received: tool,
    };
  }

  if (!Number.isFinite(ix) || !Number.isInteger(ix) ||
      !Number.isFinite(iz) || !Number.isInteger(iz)) {
    return {
      ok: false,
      reason: "invalidArgs",
      reasonText: `placeToolAt: ix/iz must be finite integers; got ix=${describeReceived(ix)}, iz=${describeReceived(iz)}.`,
      received: { ix, iz },
    };
  }

  return { ok: true, tool, ix, iz };
}

/**
 * Normalize the argument bag passed to `__utopiaLongRun.regenerate`.
 *
 * Accepts `template` as an alias for `templateId` (one-time console.warn on
 * alias usage). Preserves any other keys unchanged so that `regenerateWorld`
 * downstream de-structuring keeps working (`seed`, `terrainTuning`, `width`,
 * `height`). `null` / `undefined` / non-object input is normalized to `{}`.
 *
 * Pure function — only touches the argument object and `console.warn`.
 *
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
export function normalizeRegenerateArgs(raw) {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return {};
  }
  const params = { ...raw };
  if ((params.templateId === null || params.templateId === undefined) &&
      typeof params.template === "string") {
    params.templateId = params.template;
    try {
      // eslint-disable-next-line no-console
      console.warn(
        "[utopia] regenerate({template}) is deprecated; use {templateId} instead.",
      );
    } catch {
      // console may be unavailable in some contexts; swallow silently.
    }
  }
  return params;
}

const canvas = typeof document !== "undefined" ? document.getElementById("c") : null;

/**
 * Register a single capture-phase `error` listener that swallows the
 * well-known benign Chromium warning
 *   "ResizeObserver loop completed with undelivered notifications."
 *
 * This warning is harmless (Chromium fires it whenever a ResizeObserver
 * callback synchronously triggers another layout) but it pollutes
 * DevTools and inflates `error` counts in any external stability
 * harness (A1-stability-hunter P2-2). We expose a counter on
 * `window.__utopiaBenignSuppressed` so tests / harnesses can still
 * assert that the suppression fired N times.
 *
 * Idempotent: guarded against HMR re-runs by `window.__utopiaBenignErrorInstalled`.
 * No-op in Node (`typeof window === 'undefined'`).
 */
export function installBenignErrorFilter() {
  if (typeof window === "undefined") return;
  if (window.__utopiaBenignErrorInstalled) return;
  window.__utopiaBenignErrorInstalled = true;
  window.__utopiaBenignSuppressed = window.__utopiaBenignSuppressed ?? 0;
  window.addEventListener(
    "error",
    (event) => {
      const message = event?.message;
      if (typeof message === "string" && message.startsWith("ResizeObserver loop")) {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        window.__utopiaBenignSuppressed = (window.__utopiaBenignSuppressed ?? 0) + 1;
      }
    },
    { capture: true },
  );
}

function mountBootError(message) {
  const panel = document.createElement("div");
  panel.id = "bootError";
  panel.style.position = "fixed";
  panel.style.right = "14px";
  panel.style.bottom = "14px";
  panel.style.zIndex = "9999";
  panel.style.maxWidth = "560px";
  panel.style.padding = "10px 12px";
  panel.style.borderRadius = "10px";
  panel.style.border = "1px solid rgba(173, 30, 30, 0.45)";
  panel.style.background = "rgba(255, 240, 240, 0.95)";
  panel.style.color = "#7a1818";
  panel.style.fontSize = "12px";
  panel.style.lineHeight = "1.4";
  panel.style.whiteSpace = "pre-wrap";
  panel.textContent = `Startup failed:\n${message}`;
  document.body.appendChild(panel);
}

let app = null;
const cleanupApp = () => {
  app?.dispose?.();
};

// Only boot the GameApp when we're in a browser with a canvas. In Node
// (`node --test`), `document` is undefined and this entire block is skipped,
// so the `normalize*` functions above can still be imported for unit tests.
if (canvas) {
  try {
    installBenignErrorFilter();
    app = new GameApp(canvas);
    app.start();
    const devOn = readInitialDevMode({
      locationHref: typeof window !== "undefined" ? window.location?.href : undefined,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
    });
    if (devOn) {
      window.__utopia = app;
    }
    window.__utopiaLongRun = {
      getTelemetry: () => app?.getLongRunTelemetry?.() ?? null,
      configure: (options) => app?.configureLongRunMode?.(options),
      clearAiManualModeLock: () => app?.clearAiManualModeLock?.(),
      setAiEnabled: (enabled, options) => app?.setAiEnabled?.(enabled, options),
      startRun: () => app?.startSession?.(),
      regenerate: (params, options) => {
        const norm = normalizeRegenerateArgs(params);
        return app?.regenerateWorld?.(norm, options) ?? null;
      },
      focusTile: (ix, iz, zoom) => app?.focusTile?.(ix, iz, zoom) ?? null,
      focusEntity: (entityId, zoom) => app?.focusEntity?.(entityId, zoom) ?? null,
      selectTile: (ix, iz, options) => app?.selectTile?.(ix, iz, options) ?? null,
      selectEntity: (entityId, options) => app?.selectEntity?.(entityId, options) ?? false,
      placeToolAt: (...args) => {
        const norm = normalizePlaceToolArgs(args);
        if (!norm.ok) return norm;
        return app?.placeToolAt?.(norm.tool, norm.ix, norm.iz) ?? null;
      },
      placeFirstValidBuild: (tool, centerIx, centerIz, radius) =>
        app?.placeFirstValidBuild?.(tool, centerIx, centerIz, radius) ?? null,
      saveSnapshot: (slotId) =>
        app?.saveSnapshot?.(slotId) ??
        { ok: false, reason: "notReady", reasonText: "GameApp not initialised." },
      loadSnapshot: (slotId) =>
        app?.loadSnapshot?.(slotId) ??
        { ok: false, reason: "notReady", reasonText: "GameApp not initialised." },
      // v0.10.1 HW7 Final-Polish-Loop Round 0 (B1 action-items-auditor) —
      // dev-only stress hook so a perf reviewer can fast-fill workers up to
      // `target` and reproduce the 75-100 worker stutter scenario in a
      // Playwright session. See `GameApp.devStressSpawn` for contract.
      devStressSpawn: (target, options) =>
        app?.devStressSpawn?.(target, options) ??
        { ok: false, reason: "no_session" },
    };
    if (!devOn) {
      window.__utopia = undefined;
    }
  } catch (err) {
    const message = String(err?.message ?? err ?? "Unknown startup failure");
    console.error("[Project Utopia] startup failed:", err);
    window.__utopiaBootError = message;
    mountBootError(message);
  }

  window.addEventListener("beforeunload", cleanupApp);

  if (import.meta.hot) {
    import.meta.hot.accept();
    import.meta.hot.dispose(() => {
      window.removeEventListener("beforeunload", cleanupApp);
      cleanupApp();
    });
  }
} else if (typeof document !== "undefined") {
  // Browser but no canvas — original behavior: hard error to surface misconfig.
  throw new Error("Canvas #c not found");
}
