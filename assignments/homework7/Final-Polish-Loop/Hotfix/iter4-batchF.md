# HW7 Final-Polish-Loop — Hotfix iter4 Batch F

## Issue #10 — Bottom debug panel hidden for production-deploy parity

**User playtest report (zh):** "把 dev 模式下的 debug (最底端面板) 删了, 一切对准我们正式部署的界面."

**English:** Delete the debug panel at the bottom of the screen in dev mode; align everything with our production-deploy UI.

## Investigation

### Identified panel

`<section id="devDock">` — the **"Developer Telemetry" dock** anchored at `position: absolute; bottom: 0; left: 0; right: 0; z-index: 11; max-height: clamp(160px, 24vh, 360px)`. Visible only when `body.dev-mode` is set (URL `?dev=1`, `localStorage.utopia:devMode === "1"`, or the Ctrl+Shift+D chord). The dock contained six telemetry cards (Global & Gameplay, A* + Boids, AI Trace, Logic Consistency, System Timings, Objective / Event Log) plus Collapse All / Expand All / Reset Layout controls.

In production view (no `?dev=1`), the existing `body:not(.dev-mode) .dev-only { display: none !important; }` gate already hid the dock — so production was already correct. The user's intent: the dock is the dominant visual difference between dev mode and production, and they want them to match. With the dock force-hidden via CSS in all modes, even `?dev=1` mode now renders the production-deploy UI.

### Other dev surfaces preserved (no overreach)

The Debug sidebar tab, dev-only Settings sub-panels, AI Decision / AI Exchange / AI Policy floating panels, "Why no WHISPER?" status badge, and engineering footer all remain. The dock was the only large bottom-anchored debug surface; the other surfaces are all opt-in clicks from the right sidebar and don't claim viewport real estate by default.

## Approach decision

Two options weighed:

1. **Full DOM deletion** of `<section id="devDock">…</section>` + every `#devDock*` CSS rule + the toggle button + the inline click handler.
2. **CSS force-hide** — collapse the `#devDock` rule body to `display: none !important;` while leaving the markup, descendants, button, and JS untouched.

Chose **(2) CSS force-hide** for these reasons:

- Single-line revert (one CSS property) restores the dock if a future iteration wants it back behind a stricter gate.
- No churn to `DeveloperPanel.js` (1000+ LOC of engineering telemetry formatting that other dev surfaces may consult for strings).
- No churn to `BuildToolbar.#setDockCollapsed` + the legacy `utopiaDockCollapsed` localStorage round-trip.
- DOM lookups in `GameStateOverlay.js` and `DeveloperPanel.js` keep their existing null-guarded paths — no new branches to test.
- Smaller diff = lower regression risk on a hard-freeze hotfix loop.

The user said "删了" (delete it). The visible effect is identical: the panel is gone from every view. The code-level distinction (CSS hide vs. DOM strip) is invisible to the user and preserves a clean revert path.

## Files changed

1. **`index.html`** — single CSS edit:
   - Replaced the `#devDock` rule body (lines 1782-1791, eight property declarations: `position`, `bottom`/`left`/`right`/`z-index`, `background`, `border-top`, `display`/`flex-direction`, `max-height`, `backdrop-filter`, `pointer-events`, `transition`) with `display: none !important;` plus a comment block explaining the batch F intent.
   - All other CSS rules (`#wrap.dock-collapsed #devDock`, `#devDockHeader`, `#devDockControls`, `#devDockGrid`, `.dock-card`, `details.dock-card[open]`, `.dock-title`, `.dock-body`, the responsive `@media` overrides) intentionally kept as harmless-when-parent-hidden no-ops.
   - The `<section id="devDock" class="dev-only" aria-label="Developer telemetry">` element + its 6 `<details class="dock-card">` cards + the `Collapse All / Expand All / Reset Layout` buttons + the `<button id="toggleDevDockBtn">Hide Dev Telemetry</button>` toggle in the Debug sidebar + the inline `toggleDevDockBtn` click handler are all untouched in markup, but invisible at runtime because the parent's `display: none` cascades.

2. **`src/app/GameApp.js`** — two `closest()` selector trims (with comments referencing batch F):
   - `#isNodeInUiArea`: `"#ui, #devDock, #entityFocusOverlay, #gameStateOverlay"` → `"#ui, #entityFocusOverlay, #gameStateOverlay"`.
   - `#shouldIgnoreGlobalShortcut`: same trim.
   - Avoids walking through a hidden subtree on every selection / shortcut event.

3. **`src/ui/hud/GameStateOverlay.js`** — added a 4-line comment above the existing `document.getElementById("devDock")` null-guard documenting the new behaviour. The runtime lookup + `if (devDock) devDock.style.display = …` toggle is preserved as a backward-compat null-coalesce; with `!important` on the CSS rule, the JS toggle has no visible effect.

4. **`CHANGELOG.md`** — Batch F entry under HW7 Final Polish Loop Hotfix iter4.

5. **`assignments/homework7/Final-Polish-Loop/Hotfix/iter4-batchF.md`** — this file.

## Browser verification (Playwright at 1058×639)

| View | Before | After |
| --- | --- | --- |
| `http://127.0.0.1:5174/` (production, no `?dev=1`) | No bottom debug panel (`dev-only` CSS gate hid the dock). Bottom of viewport: Entity Focus left, Pause/Play/Speed/Autopilot/AI Log center, Build sidebar right. | **Identical** — no behavior change. `getComputedStyle(devDock).display === "none"`. |
| `http://127.0.0.1:5174/?dev=1` (dev mode) | Bottom 160 px occupied by full-width "Developer Telemetry" dock with 6 cards + Collapse All / Expand All / Reset Layout buttons. | **No bottom panel.** Bottom of viewport now matches production view exactly: Entity Focus left, Pause/Play/Speed/Autopilot/AI Log center, Build sidebar right. `body.dev-mode === true` (gate still works for other dev surfaces); `getComputedStyle(devDock).display === "none"`; `devDock.getBoundingClientRect()` returns `{w:0, h:0, bottom:0}`. |

**Screenshots (project root):**
- Before (production menu): `batchF-before-prod-menu.png`
- Before (production in-game): `batchF-before-prod-ingame.png`
- Before (`?dev=1` in-game, dock visible): `batchF-before-devmode-ingame.png`
- After (production in-game): `batchF-after-prod-ingame.png`
- After (`?dev=1` in-game, dock gone): `batchF-after-devmode-ingame.png`

Programmatic asserts after the change (in `?dev=1` mode):
- `document.body.classList.contains('dev-mode')` → `true` (dev-mode gate still active for other surfaces)
- `document.getElementById('devDock')` → `<section>` element (DOM intact)
- `getComputedStyle(devDock).display` → `"none"` (CSS force-hide active)
- `devDock.getBoundingClientRect()` → `{w:0, h:0, bottom:0}` (zero footprint)

## Tests

```
node --test test/*.test.js
# tests 1784
# pass 1776
# fail 5
# skipped 3
```

Identical to baseline — no new regressions. The 5 fails are pre-existing (matches "~4 pre-existing fails OK" in the brief; same failures as before this batch).

## Hard rules compliance

- HW7 hard freeze: no new tile/role/building/mood/mechanic/audio/UI panel. Hiding/gating an existing panel is OK. Confirmed.
- track=code: only `index.html` + `src/app/GameApp.js` + `src/ui/hud/GameStateOverlay.js` touched (plus CHANGELOG + this log). Confirmed.
- Did NOT touch `src/data/prompts/*` (Batch D). Confirmed.
- Did NOT touch `src/config/balance.js`, `src/simulation/population/*`, recruit logic (Batch E). Confirmed.
- Did NOT touch right sidebar tab strip / sidebar panel area (Batch E). The `<button id="toggleDevDockBtn">` lives inside the Debug sidebar panel but I did not edit it — only force-hid its target via CSS in the head `<style>` block. Confirmed.
- Did NOT touch top status bar. Confirmed.
- One commit. Prefix `chore(hotfix iter4): batch F — remove/gate bottom debug panel`. (To be applied at commit time.)
- Not `--amend`, not `--no-verify`, no push. Confirmed.

## Commit message (to be applied)

```
chore(hotfix iter4): batch F — remove/gate bottom debug panel

User playtest issue #10: "把 dev 模式下的 debug (最底端面板) 删了,
一切对准我们正式部署的界面." (Delete the dev-mode bottom debug panel;
align with production-deploy UI.)

Force-hid `<section id="devDock">` "Developer Telemetry" dock via CSS
`display: none !important;`. The dock was already hidden in production
via the `body:not(.dev-mode) .dev-only` gate, so production view is
unchanged. Dev view (`?dev=1`, `localStorage.utopia:devMode === "1"`,
Ctrl+Shift+D chord) now matches production: same Entity Focus
inspector left, same playback controls center, same Build sidebar
right. Other dev surfaces (Debug sidebar tab, dev-only Settings, AI
Decision/Exchange/Policy floating panels, "Why no WHISPER?" badge)
preserved.

Markup, six telemetry cards, toggle button, inline click handler, and
DeveloperPanel.js render path are intact (CSS-only fix). One-line
revert restores the dock if a future iteration brings it back behind
a stricter gate. Trimmed `#devDock` from two `closest()` selectors in
GameApp.js (selection + shortcut routing) so they don't walk a hidden
subtree.

Files: index.html (CSS rule body collapsed to display:none, +comment),
src/app/GameApp.js (-2 selectors, +comment), src/ui/hud/GameStateOverlay.js
(+comment above existing null-guard), CHANGELOG.md, iter4-batchF.md
log.

Tests: 1784 / 1776 pass / 5 fail / 3 skip — identical to baseline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
