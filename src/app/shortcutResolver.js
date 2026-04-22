export const TOOL_SHORTCUTS = Object.freeze({
  Digit1: "road",
  Digit2: "farm",
  Digit3: "lumber",
  Digit4: "warehouse",
  Digit5: "wall",
  Digit6: "erase",
});

export const SHORTCUT_HINT = Object.freeze(
  "LMB build/select | Alt+LMB inspect | RMB drag | 1-6 tools | 0 reset camera | L heat lens | Esc clear | Space pause | Ctrl/Cmd+Z undo",
);

function eventKey(event) {
  return String(event?.key ?? "").trim().toLowerCase();
}

export function resolveGlobalShortcut(event, context = {}) {
  if (!event || context.ignoreShortcuts) return null;
  if (event.repeat) return null;

  const ctrlOrMeta = Boolean(event.ctrlKey || event.metaKey);
  const alt = Boolean(event.altKey);
  const shift = Boolean(event.shiftKey);
  const code = String(event.code ?? "");
  const key = eventKey(event);

  if (ctrlOrMeta && !alt) {
    if (context.phase !== "active") return null;
    if (code === "KeyZ" || key === "z") {
      return { type: shift ? "redo" : "undo" };
    }
    if (code === "KeyY" || key === "y") {
      return { type: "redo" };
    }
    return null;
  }

  if (alt) return null;

  // v0.8.2 Round0 02b-casual — defensive gating for phase != "active".
  // Reviewer player-02-casual reported "pressing L returned me to the
  // main menu" (UNREPRODUCIBLE after trace). Regardless of whether the
  // root cause is a shortcut bug, menu/end phases have no simulation
  // running and no canvas-level renderer to consume L / 0 / 1-6; swallowing
  // these keys removes a class of noise-induced reset complaints.
  const isActivePhase = context.phase === "active" || context.phase === undefined;

  if (code === "Digit0" || code === "Numpad0" || code === "Home" || key === "0" || key === "home") {
    if (!isActivePhase) return null;
    return { type: "resetCamera" };
  }
  // v0.8.0 Phase 7.C — Supply-Chain Heat Lens toggle.
  if (code === "KeyL" || key === "l") {
    if (!isActivePhase) return null;
    return { type: "toggleHeatLens" };
  }
  if (code === "Escape" || key === "escape") return { type: "clearSelection" };
  if (code === "Space" || key === " ") {
    return context.phase === "active" ? { type: "togglePause" } : null;
  }

  const tool = TOOL_SHORTCUTS[code];
  if (tool) {
    if (!isActivePhase) return null;
    return { type: "selectTool", tool };
  }

  return null;
}
