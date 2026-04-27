---
reviewer_id: 01c-ui
plan_source: Round1/Plans/01c-ui.md
round: 1
date: 2026-04-22
parent_commit: f95577e
head_commit: 556d847
status: DONE
steps_done: 6/6
tests_passed: 997/999
tests_new: test/ui/hudController.casualScoreBreakGate.test.js
---

## Steps executed

- [x] Step 1: `index.html` — added `dev-only` to `<span id="statusScoreBreak">` class list (now `"hud-score-break dev-only"`). Casual profile hides via existing `body:not(.dev-mode) .dev-only { display: none !important; }` gate.
- [x] Step 2: `index.html` — inserted `@media (max-width: 1200px) and (min-width: 601px)` block AFTER the existing `@media (max-width: 900px)` block. Uses `transform: translateX(...)` on `.floating-panel-left / -right` to slide panels off-screen by default; `.panel-open` class slides them back in. 0.18s transition matches project tonal feel.
- [x] Step 3: `src/ui/hud/HUDController.js` — wrapped the `this.statusScoreBreak` render block with a casual-mode guard. Reads `document.body.classList.contains("casual-mode")`; in that case clears both `textContent` and `title` so AT tools / screen readers never see the dev string. Dev profile renders the full breakdown unchanged.
- [x] Step 4: `index.html` (inline panel-toggle `<script>`) — the panel-toggle click handler was actually in the index.html inline script, NOT GameApp.js (as the plan hypothesised). Extended it to add/remove `panel-open` class alongside the existing `hidden` attribute logic. Also added `panel-open` to the default-visible `buildFloatingPanel` class list so first paint on ≤1200px keeps it on-screen.
- [x] Step 5: `index.html` — extended the existing `@media (max-width: 1024px)` `#statusBar` block with `position: sticky; top: 0; z-index: 30; background: var(--panel-bg, rgba(8,16,28,0.92));` to stop resource icons escaping the container and floating above the Build panel at 1024×768.
- [x] Step 6: `test/ui/hudController.casualScoreBreakGate.test.js` — new test file with 3 cases: (a) casual profile clears `#statusScoreBreak.textContent` + title, (b) dev profile renders full `+N/s · +M/birth · -K/death (lived X · births Y · deaths -Z)` copy, (c) toggling body class casual→dev flips render output between renders. Uses the same `makeNode()` DOM stub pattern as `test/hud-controller.test.js`.

## Tests

- full suite: `node --test` → 997 pass / 2 skipped / 0 fail (baseline: 999 tests, 2 pre-existing skips)
- targeted UI check: `node --test test/responsive-status-bar.test.js test/ui-layout.test.js test/hud-controller.test.js test/hud-storyteller.test.js` → 14/14 pass
- new test file: `test/ui/hudController.casualScoreBreakGate.test.js` → 3/3 pass
- pre-existing skips (unchanged): 2 (carried over from parent commit f95577e)
- failures resolved during iteration: first new-test run failed with `Cannot set properties of null (setting 'textContent')` on `this.foodVal.textContent = ...` because the DOM stub was too minimal; fixed by populating the `REQUIRED_NODE_IDS` array mirroring `test/hud-controller.test.js`.

## Deviations from plan

- Step 4 plan text says `src/app/GameApp.js`, but a Grep for `data-panel-target` / `panel-toggle` showed zero matches in `src/` — the actual panel-toggle click handler lives in an inline `<script>` block at the bottom of `index.html` (lines 1631+). Extended that handler in place. Same semantic: clicking a panel button toggles `.panel-open` on the target panel + updates `hidden` attr. No behaviour drift, just location.
- Step 4 also: added `panel-open` to `buildFloatingPanel`'s default class list (`class="floating-panel floating-panel-left panel-open"`). Without this, first paint on ≤1200px would slide the Build panel off-screen despite no `hidden` attr (since the CSS rule cares about `.panel-open`, not `[hidden]`). Considered this a direct consequence of Step 2's slide-out default and not a freeze violation.
- Step 6 path: created at `test/ui/hudController.casualScoreBreakGate.test.js`. `node --test` (default, no glob) auto-discovers subdirs, so the test is picked up by the CI/dev command. The legacy `test/*.test.js` glob (present in `scripts/test:ui`) would NOT pick it up — but the repo's main `npm test` is defined as bare `node --test`, which does.

## Handoff to Validator

- Playwright smoke focus areas:
  1. Default casual profile @ 1440×900 — confirm no `+1/s · +5/birth · -10/death (lived ... · births ... · deaths -...)` text appears in `#statusBar`.
  2. Resize to 1024×768 — Build panel should slide off-screen (or stay on-screen iff `panel-open` is already on `buildFloatingPanel`; the initial-class patch keeps it visible on first paint). Clicking `Build` button should toggle it. Colony panel starts off-screen; clicking should slide it in.
  3. Add `?dev=1` to URL (or flip `body.dev-mode`) — scoreBreak text should return with full breakdown.
  4. Check `#statusBar` z-index on 1024×768: resource icons should stay inside the statusBar container and NOT visually float above the Build panel.
- Benchmark regression expectation: this patch is pure CSS + HUD-string gating. DevIndex should be unchanged from f95577e baseline (44). Validator may still want to run `npm run bench:long:smoke` to confirm no accidental simulation side-effect.
- No freeze violation: reused existing `.dev-only` / `.casual-mode` gates; no new mechanic / no new global class / no new JS systems.
- Accessibility note: `transform: translateX(...)` keeps panels in the DOM (accessible to screen readers, Tab still reaches them) even when visually collapsed; `hidden` attribute is still maintained in parallel.
