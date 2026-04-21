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

  if (code === "Digit0" || code === "Numpad0" || code === "Home" || key === "0" || key === "home") {
    return { type: "resetCamera" };
  }
  // v0.8.0 Phase 7.C — Supply-Chain Heat Lens toggle.
  if (code === "KeyL" || key === "l") {
    return { type: "toggleHeatLens" };
  }
  if (code === "Escape" || key === "escape") return { type: "clearSelection" };
  if (code === "Space" || key === " ") {
    return context.phase === "active" ? { type: "togglePause" } : null;
  }

  const tool = TOOL_SHORTCUTS[code];
  if (tool) return { type: "selectTool", tool };

  return null;
}
