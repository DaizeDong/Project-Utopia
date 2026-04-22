---
reviewer_id: 01c-ui
plan_source: assignments/homework6/Agent-Feedback-Loop/Round0/Plans/01c-ui.md
round: 0
date: 2026-04-22
parent_commit: a8dd845
head_commit: bf24945
status: DONE
steps_done: 9/10
tests_passed: 882/884
tests_new:
  - test/dev-mode-gate.test.js
  - test/responsive-status-bar.test.js
---

## Steps executed

- [x] **Step 1**: `index.html:624` — added `player-mode` to `#wrap`.
  (Class is unused by CSS directly; serves as a documented baseline marker.
  Dev-mode gating is done via `body.dev-mode` instead, which is simpler
  because the body element is the natural host for the `.dev-only` CSS
  selector.)
- [x] **Step 2**: `index.html` — inserted `body:not(.dev-mode) .dev-only
  { display:none !important; }` plus `@media (max-width: 1024px)` and
  `@media (max-width: 640px)` blocks immediately after `.legacy-hidden`.
- [x] **Step 3**: `index.html` — marked Settings and Debug `.panel-toggle`
  buttons with `dev-only`. Heat Lens button deliberately left visible.
- [x] **Step 4**: `index.html` — marked the `<div>` wrapping
  `#toggleDevDockBtn` and the `<section id="devDock">` itself with
  `dev-only` so the dock is both hidden AND unreachable from the Debug
  panel in player mode.
- [x] **Step 5**: `index.html` — tagged the Advanced Runtime `<details>`
  subpanel, the Terrain Tuning `<details class="card">`, and the
  Population Control `<details class="card">` with `dev-only`.
  Deviation: plan suggested a shared wrapper; tagged each card directly
  instead because the three regions are not contiguous siblings (Advanced
  Runtime nests inside a parent card).
- [x] **Step 6**: `src/app/GameApp.js` — added `#initDevModeGate()` called
  from constructor. Helpers extracted to new `src/app/devModeGate.js`
  (`readInitialDevMode`, `applyInitialDevMode`, `isDevModeChord`,
  `toggleDevMode`) so they can be unit-tested without standing up the
  full GameApp (which requires a live canvas + three.js). All storage
  accesses are try/catch-guarded (Safari private mode).
- [x] **Step 7**: `index.html` — rewrote `#heatLensBtn` title to
  `"Supply-Chain Heat Lens (L) — click/press L to cycle: pressure ... →
  heat ... → off"`. Added tooltip to the `#warningVal` row in the Debug
  panel.
- [x] **Step 8**: created `test/dev-mode-gate.test.js` with 9 unit tests
  covering URL query, localStorage, chord detection, storage-failure
  graceful degradation, and toggle persistence.
- [x] **Step 9**: created `test/responsive-status-bar.test.js` with 5
  static assertions on `index.html` (1024px breakpoint + `flex-wrap:
  wrap` + `order:-1`, `.dev-only` count ≥ 3, named dev-only elements,
  Heat Lens stays player-visible, Heat Lens tooltip mentions all three
  cycle states).
- [ ] **Step 10**: `CHANGELOG.md` — **deferred to Validator per Runtime
  Context instruction** ("CHANGELOG.md 留给 Validator 统一追加，你不要
  动"). Not counted as skipped — explicit handoff.

## Tests

- pre-existing skips: 2 (unchanged from baseline)
- new tests added:
  - `test/dev-mode-gate.test.js` (9 assertions)
  - `test/responsive-status-bar.test.js` (5 assertions)
- failures resolved during iteration:
  - First run of `responsive-status-bar.test.js` failed because the
    regex assumed `data-panel-target=...` came before `class=...` in the
    HTML attribute order. Rewrote the test to tag-scan with
    `findTag(attrMatcher)` that matches full `<... >` tags and then
    checks for `\bdev-only\b` inside them. Order-independent.

## Deviations from plan

1. **Extracted helpers to `src/app/devModeGate.js`** — plan says
   `#initDevModeGate` is a private method; I kept it private on GameApp
   but delegated the reusable logic (URL parsing, chord detection,
   toggle) to pure exported helpers in a new file. This was the only
   way to make the gate *unit-testable* — GameApp's constructor depends
   on three.js, canvas, and the full DOM, which is far beyond what our
   existing Node test harness supports. The behavior is identical to
   the plan's spec; only the code organization is split.
2. **Step 5 wrapping strategy** — plan suggests a single `dev-only`
   wrapper around the three advanced regions. Used per-card `dev-only`
   classes instead because the Advanced Runtime `<details>` is nested
   inside the Map & Doctrine card, so a single contiguous wrapper
   would have had to include player-visible controls too.
3. **`#wrap.player-mode` class is decorative only** — the actual gating
   selector is `body:not(.dev-mode) .dev-only`. The `player-mode` class
   is left on `#wrap` as a documentation anchor per plan Step 1, but
   does not drive any CSS rule. This matches the plan's intent ("Default
   进入 'player mode', dev-only 元素通过 CSS 选择器 ... 隐藏").

## Handoff to Validator

- **Benchmark**: not run. Changes are pure DOM/CSS + one gated keydown
  listener. Zero sim/ECS touch points. Plan itself marks DevIndex
  regression as "sanity check, not real risk". Recommend Validator
  skips long-horizon benchmark unless policy requires.
- **CHANGELOG.md**: pending. Suggested entry under v0.8.2 unreleased
  `### UX / Polish`:
  ```
  - Developer Mode gate: Settings terrain sliders, Debug panel, and Dev
    Telemetry dock now hidden for first-time players. Enable with
    ?dev=1 URL query or Ctrl+Shift+D chord (persisted via localStorage).
    (01c-ui feedback, Round0)
  - Responsive status bar: panel-toggle buttons wrap to their own row
    on viewports <=1024px, fixing the 800x600 button-clipping regression
    reported in reviewer screenshot 15.
  - Heat Lens button tooltip expanded to explain the pressure/heat/off
    cycle.
  ```
- **Playwright smoke checks** (if desired):
  1. `http://localhost:5173/` — verify only `Build | Colony | Heat Lens`
     toggles are visible; no Settings/Debug buttons; `#devDock` absent.
  2. `http://localhost:5173/?dev=1` — verify all original toggles return.
  3. From (1), press `Ctrl+Shift+D` — verify dev toggles appear and
     `statusAction` shows "Developer mode ON."; press again to toggle
     off; refresh page and verify state persists via `localStorage`.
  4. Resize viewport to 800×600 — verify `#panelToggles` row wraps
     above the resource row; no horizontal clipping of Settings/Debug
     buttons (when dev mode is on).
- **Regression risk**: the only JS surface-area change is the new
  `keydown` listener on `window`. It matches only `Ctrl+Shift+D` and
  calls `event.preventDefault()` — should not collide with
  `#onGlobalKeyDown` (which filters out events with `ctrlKey` before
  reaching the shortcut resolver except for Z/Y undo-redo).
- **Test baseline**: 884 total, 882 passing, 2 pre-existing skips, 0
  failing. Matches pre-change baseline except +14 new assertions
  across the two new test files.
