export const TOOL_SHORTCUTS = Object.freeze({
  Digit1: "road",
  Digit2: "farm",
  Digit3: "lumber",
  Digit4: "warehouse",
  Digit5: "wall",
  Digit6: "bridge",
  Digit7: "erase",
  Digit8: "quarry",
  Digit9: "herb_garden",
  Digit0: "kitchen",
  Minus: "smithy",
  Equal: "clinic",
});

export const SHORTCUT_HINT = Object.freeze(
  "LMB build/select | Alt+LMB inspect | RMB drag | 1-0/-/= tools | R or Home reset camera | L heat lens | T terrain overlay | Esc clear | Space pause | Ctrl/Cmd+Z undo",
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

  // v0.8.2 Round-6 Wave-1 02b-casual (Step 1) — F1 / ? open the in-game
  // Help dialog. Casual reviewer reported "F1 reloads the page" — the
  // browser default for F1 in some shells (legacy IE, certain Firefox /
  // Edge dev-tools shortcuts, on-screen keyboards) is documented as
  // "Help" but in practice triggers the page-context menu or refresh.
  // We MUST always preventDefault() for F1 (the caller does this on any
  // non-null action), even when phase !== "active", so the browser
  // cannot reload mid-session and lose progress. Both F1 and Shift+/
  // ("?") map to openHelp; the actual modal toggle lives in index.html
  // (window.__utopiaHelp.open) and in GameApp #onGlobalKeyDown.
  if (code === "F1" || key === "f1") {
    return { type: "openHelp" };
  }
  if (code === "Slash" && shift) {
    return { type: "openHelp" };
  }
  if (key === "?") {
    return { type: "openHelp" };
  }

  // v0.8.2 Round0 02b-casual — defensive gating for phase != "active".
  // Reviewer player-02-casual reported "pressing L returned me to the
  // main menu" (UNREPRODUCIBLE after trace). Regardless of whether the
  // root cause is a shortcut bug, menu/end phases have no simulation
  // running and no canvas-level renderer to consume L / 0 / 1-6; swallowing
  // these keys removes a class of noise-induced reset complaints.
  const isActivePhase = context.phase === "active" || context.phase === undefined;

  if (code === "Home" || key === "home") {
    if (!isActivePhase) return null;
    return { type: "resetCamera" };
  }
  // v0.8.2 Round-6 Wave-1 01a-onboarding (Step 4): KeyR is a familiar
  // "reset" key; we add it as a sibling alias for Home so the Help dialog
  // can advertise "R or Home resets camera" without breaking the existing
  // Digit0 = kitchen tool binding. KeyR has no other registered handler in
  // active phase. Matches uppercase ("R") and lowercase ("r") via key
  // fallback for consistency with KeyL/KeyT.
  if (code === "KeyR" || key === "r") {
    if (!isActivePhase) return null;
    return { type: "resetCamera" };
  }
  // v0.8.0 Phase 7.C — Supply-Chain Heat Lens toggle.
  //
  // v0.8.2 Round-6 Wave-1 01b-playability (Step 7) — note: KeyL does NOT
  // toggle the Fertility / Terrain overlay. Reviewers occasionally report
  // "L popped a fertility legend" — that side effect is a *tool-selection*
  // consequence inside `#applyContextualOverlay` (see HUDController), not a
  // shortcut binding. This branch only emits `toggleHeatLens`. KeyT below
  // is the dedicated terrain-fertility hotkey.
  if (code === "KeyL" || key === "l") {
    if (!isActivePhase) return null;
    return { type: "toggleHeatLens" };
  }
  // Terrain Fertility Overlay toggle.
  if (code === "KeyT" || key === "t") {
    if (!isActivePhase) return null;
    return { type: "toggleTerrainLens" };
  }
  if (code === "Escape" || key === "escape") return { type: "clearSelection" };
  if (code === "Space" || key === " ") {
    // v0.8.2 Round-6 Wave-1 01b-playability (Step 7) — explicit `return null`
    // in non-active phases prevents Space from falling through into the
    // TOOL_SHORTCUTS table (e.g. if a future code-mapping accidentally maps
    // " " or "Space" to a tool). The previous ternary already returned null
    // but we make the intent explicit for future readers.
    if (context.phase !== "active") return null;
    return { type: "togglePause" };
  }

  const tool = shift ? null : TOOL_SHORTCUTS[code];
  if (tool) {
    if (!isActivePhase) return null;
    return { type: "selectTool", tool };
  }

  return null;
}
