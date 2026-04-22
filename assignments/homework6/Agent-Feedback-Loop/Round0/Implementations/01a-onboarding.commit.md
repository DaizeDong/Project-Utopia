---
reviewer_id: 01a-onboarding
plan_source: Round0/Plans/01a-onboarding.md
round: 0
date: 2026-04-22
parent_commit: bdb874d
head_commit: 4693e38
status: DONE
steps_done: 10/10
tests_passed: 928/930
tests_new:
  - test/help-modal.test.js (6 tests)
  - test/entity-focus-player-view.test.js (5 tests)
---

## Steps executed

- [x] **Step 1** — Added `#helpBtn` in `#panelToggles` (status bar) and
      `#overlayHelpBtn` in the overlay menu `.overlay-actions` row
      (between Start Colony and New Map). Both share the `data-tip`
      tooltip pipeline because the existing `migrateTitles` script
      converts every `title` to `data-tip` on load.
- [x] **Step 2** — Inserted `#helpModal` (role=dialog, aria-modal=true,
      initial `hidden`) before `</body>` with 3 tabs (Controls /
      Resource Chain / Threat & Prosperity) as static HTML. CSS block
      added before the `#customTooltip` section: z-index 1500
      (comfortably above `#devDock` at 11), backdrop-blur backdrop,
      sticky header/footer, scrollable body.
- [x] **Step 3** — Help Modal keybindings (`F1`, `?`, `ESC`) wired via
      a capture-phase `keydown` listener inside the inline module script.
      Close handlers for `#helpModalCloseBtn`, backdrop click, and tab
      switching. First-run auto-open gated by
      `localStorage.utopia:helpSeen`. `isTypingInInput()` guard prevents
      shortcuts from intercepting typing in form fields.
- [x] **Step 4** — Dev-dock gating validated against the pre-existing
      01c gate (`body:not(.dev-mode) .dev-only { display: none !important }`
      already hides `#devDock`, `#toggleDevDockBtn`, and Settings/Debug
      toggles). No new `?debug=1` param was added because the merged
      conflicts note explicitly routes this through the existing
      `devModeGate.js` / `?dev=1` / Ctrl+Shift+D path. Ran no changes
      to `shortcutResolver.js` (02b casual gate already covers
      phase-gated L/0/1-6).
- [x] **Step 5** — `src/ui/panels/EntityFocusPanel.js` render template
      refactored: `engBlockOpen`/`engBlockClose`/`engClasses` helpers
      wrap FSM / Policy Influence / Decision Time / Velocity / Path /
      Path Recalc / AI Agent Effect / Policy Focus/Summary/Notes /
      Decision Context / Target Selection / Path Nodes details / Last AI
      Exchange details in BOTH `casual-hidden` AND `dev-only` classes
      (OR relation). Added a human-readable Hunger label
      ("Well-fed" / "Peckish" / "Hungry" / "Starving") above the divider
      so casual players get a friendly "Needs / Task" summary.
- [x] **Step 6** — Updated `#hudProsperity` title to
      "Prosperity — higher is better. Colony well-being score..." and
      `#hudThreat` title to "Threat — lower is safer. ...". The existing
      `#customTooltip` migration script converts `title` to `data-tip`
      on load, so no new `data-tooltip` attribute was introduced (the
      migration is idempotent and already produces a styled tooltip).
- [x] **Step 7** — Tooltip system already exists in index.html
      (`#customTooltip` + migration script ~L1266-1332). No new
      `TooltipController.js` file was created; reused existing.
- [x] **Step 8** — Added a second `.overlay-controls-hint` row
      (`LMB build * RMB drag-pan * click a worker to inspect * ? or F1 open Help`).
      Seed moved behind `body.dev-mode` in `GameStateOverlay.#menuMeta`
      rendering (casual players now see
      `Quick Start Guide * 96x72 tiles` instead of `... seed 1337`).
- [x] **Step 9** — Created `test/help-modal.test.js` with 6 tests
      covering modal DOM contract, aria roles, initial hidden attr,
      keybinding string presence, first-run storage flag, and z-index.
      Placed at `test/` top level (not `test/ui/`) because the repo
      test runner glob is `test/*.test.js` (flat).
- [x] **Step 10** — Created `test/entity-focus-player-view.test.js`
      with 5 tests asserting the engBlock wrapper carries both gate
      classes, the hunger label rows are present, and FSM/Policy rows
      live inside the gated span.

## Tests

- Baseline (from `node --test test/*.test.js` pre-change):
  pass=917 fail=0 skip=2 (total 919 checks in 628 subtests).
- Post-change: pass=928 fail=0 skip=2 (total 930 checks in 641 subtests).
- Net: +11 tests from the two new files.
- failures resolved during iteration: `test/game-state-overlay.test.js`
  failed once with `SyntaxError: Private field '#lastPhase' must be
  declared in an enclosing class`. Fixed by declaring
  `#lastPhase = null` as a class field in `GameStateOverlay`.
- pre-existing skips: 2 (unchanged; not introduced by this plan).
- new tests added:
  - test/help-modal.test.js
  - test/entity-focus-player-view.test.js

## Deviations from plan

- Plan Step 4 called for a new `?debug=1` URL param + a separate
  `utopiaDebugMode` localStorage key. Per the orchestrator's
  `known_conflicts_merged` note, this is redundant with the existing
  `?dev=1` / `utopia:devMode` / Ctrl+Shift+D gate from 01c. Implementer
  reused the existing gate — `#devDock`, Settings, Debug, and Dev
  Telemetry toggle are all already `.dev-only` and hidden to
  first-timers. No parallel gate introduced.
- Plan Step 5 instructed wrapping debug content in a `<details open=false>`
  "Debug Info" summary. Implementer instead used the
  `casual-hidden dev-only` span wrapper that 02b-casual already established,
  because the orchestrator's merged-conflicts note explicitly favored the
  class-based approach: "你本 plan 的'把 FSM 整块移到 dev-mode-only'可以
  直接沿用 .casual-hidden/.dev-only 契约". The details block already existed
  for Path Nodes and Last AI Exchange; added the two gate classes to them.
- Plan Step 6 called for a new `data-tooltip` attribute. Implementer
  reused the existing `data-tip` migration system (inline script in
  `index.html`) which already captures `title` -> `data-tip` and
  styles tooltips with a 0.12s fade via `#customTooltip.visible`.
  Only the `title` text was updated to add the directional hint.
- Plan Step 7 called for creating `src/ui/hud/TooltipController.js`.
  Not created; `#customTooltip` inline script already implements the
  same behavior (mouseenter/leave listeners, edge-clamp via
  `getBoundingClientRect`, z-index 9999 above `#devDock`).
- Plan Step 9/10 placed tests in `test/ui/`. The repo test runner glob
  is `test/*.test.js` (flat); files were placed at `test/` top-level
  to remain discoverable without config changes. Test bodies follow
  the repo convention established by `test/responsive-status-bar.test.js`
  (static HTML parsing rather than jsdom).
- Plan did not call for end-panel read gate, but the runtime context's
  task 3 explicitly requested it ("防止 reviewer 在看到 stats 之前点
  'New Map'"). Implemented as a 2.5s button-disable with countdown
  label on both `#overlayRestartBtn` and `#overlayResetBtn`; resets
  on every re-entry into the `end` phase.

## Handoff to Validator

- **Playwright smoke areas**:
  1. Fresh localStorage load at `http://localhost:5173/` should
     auto-open the Help Modal (first-run).
  2. Closing via ESC, reopening via F1 / `?` / `#helpBtn` click.
  3. `#hudProsperity` / `#hudThreat` hover: 100ms styled tooltip with
     "higher is better" / "lower is safer" copy.
  4. Click a worker: should NOT see FSM / Policy Influence / Decision
     Time rows in casual (`?ui=casual`, default) or non-dev (no `?dev=1`)
     sessions. Only the power-user combo `?dev=1&ui=full` exposes
     full engineering telemetry.
  5. End-of-run: restart/new-map buttons should briefly disable with
     a `(2)` / `(1)` countdown label before becoming clickable.
  6. Main menu overlayMenuMeta should read
     `Quick Start Guide * 96x72 tiles` (no seed) unless Ctrl+Shift+D
     has been pressed this session.

- **Benchmark regression**: none expected. No simulation / scoring /
  system-order code touched. `scripts/long-horizon-bench.mjs` does
  not query `#devDock` / `#helpModal` / `#overlayEndStats` — UI
  changes are isolated to rendered HTML/CSS and one panel component.
  Recommend a smoke run at seed=42 / temperate_plains to confirm
  DevIndex stays >= 42 (5% tolerance below Phase 8's 44).

- **No changes** to system order, balance constants, AI code, pathing,
  or save/replay formats. The GameStateOverlay `#lastPhase` field
  addition is mock-compatible (existing `test/game-state-overlay.test.js`
  passes unchanged).
