---
reviewer_id: 01d-mechanics-content
plan_source: assignments/homework6/Agent-Feedback-Loop/Round0/Plans/01d-mechanics-content.md
round: 0
date: 2026-04-22
parent_commit: bf24945
head_commit: 0a0658e
status: DONE
steps_done: 9/9
tests_passed: 887/889
tests_new:
  - test/hud-resource-rate.test.js
  - test/toast-title-sync.test.js
---

## Steps executed

- [x] **Step 1**: `index.html:638` — removed `dock-collapsed` from `<div id="wrap" class="dock-collapsed player-mode">` → `<div id="wrap" class="player-mode">`. Button initial text at `index.html:1157` flipped from "Show Dev Telemetry" → "Hide Dev Telemetry" so the label matches the now-expanded state. The toggle JS at `:1310-1312` was left untouched (it already flips label correctly on click).
- [x] **Step 2**: `src/app/GameApp.js:379-382` — removed `const wrapRoot = document.getElementById("wrap"); if (!wrapRoot?.classList.contains("dock-collapsed")) { ... }` guard around `DeveloperPanel.render()`. The panel now renders unconditionally on every UI-refresh tick. Left the throttle at `:346-349` in place so collapsed dock still refreshes at 1/3s.
- [x] **Step 3**: `index.html:1175,1179,1183,1187,1191,1195` — six `<pre class="dock-body">loading...</pre>` placeholders replaced with `Initializing telemetry…`. Used `replace_all` with a targeted anchor (`class="dock-body">loading...</pre>`) for atomic replacement of all 6 occurrences.
- [x] **Step 4**: `index.html:92-96` — `.hud-action` `max-width: 140px;` → `max-width: 420px;`. `overflow/text-overflow/white-space` preserved.
- [x] **Step 5**: `src/ui/hud/HUDController.js:282-295` — in the `state.controls.actionMessage` branch, added `this.statusAction.setAttribute("title", state.controls.actionMessage)`; `else` branch now calls `setAttribute("title", "")` to clear stale tooltips.
- [x] **Step 6**: `src/ui/hud/HUDController.js:95-109` (constructor, 7 new `foodRateVal..medicineRateVal` handles + `_lastResourceSnapshot / _lastSnapshotSimSec / _lastComputedRates` caches) and `:129-170` (render body: snapshot every 3 sim-seconds, compute `(delta/dt)*60 → /min`, format `▲ +/▼ -/= 0.0`). Idle (`|rate| < 0.05`) uses the `=` glyph to distinguish "definitely zero" from "not yet computed" (`—`).
- [x] **Step 7**: `index.html:97-101` — added `.hud-rate` CSS (9px, 0.7 opacity, 6px left margin, 600 weight). `index.html:825-841` — wrapped each of the 7 resource value `<div>`s into `<div><span id="xVal">0</span><span id="xRateVal" class="hud-rate">—</span></div>` to preserve the `.kv` two-column layout while placing the rate badge inline after the value. Expanded to all 7 resources (food/wood/stone/herbs/meals/tools/medicine) rather than the 2-start minimum suggested in the plan because the surrounding markup made the full roll-out atomic.
- [x] **Step 8**: `test/hud-resource-rate.test.js` — 3 tests (not 1 as plan suggested): negative rate (food 100→40 over 60s → `▼ -60.0/min`), positive rate + idle flat-rate (wood +60/min, stone 0 → `= 0.0/min`), pre-window placeholder (elapsed < 3s → `—`).
- [x] **Step 9**: `test/toast-title-sync.test.js` — 2 tests: full-message title mirror (84-char emergency message), empty title clear on no-message frame.

## Tests

- **pre-existing skips**: 2 (unchanged from baseline a8dd845)
- **baseline before Plan**: 882/884 pass
- **after Plan**: 887/889 pass (+5 new tests, all green; zero regression)
- **new tests added**:
  - `test/hud-resource-rate.test.js` — 3 subtests
  - `test/toast-title-sync.test.js` — 2 subtests
- **failures resolved during iteration**:
  - First pass: 5 new tests failed with `this.speedPauseBtn?.addEventListener is not a function` because the `makeNode()` stub in both new files lacked `addEventListener/removeEventListener`. Fixed by adding noop methods to `makeNode()`; all 5 tests then pass on next run.
- **ui-layout.test.js**: verified unchanged (87 lines, asserts ID whitelist only; my new `*RateVal` ids are additive and do not remove any required id).

## Deviations from plan

- **Line numbers shifted**: Plan references `index.html:624`/`:1161-1181`/`:1298` are now `:638`/`:1175-1195`/`:1157` (due to 01c-ui insertions). Edits applied by text-match, not by line number.
- **Step 7 scope**: plan proposed "2 rate spans as starter"; I added all 7 at once because the existing `.kv` layout refactor (`<div>` → `<div><span><span>`) touched every row atomically — splitting it was strictly more LOC.
- **Idle glyph**: plan only specified `▲`/`▼`; I added `= 0.0/min` for `|rate| < 0.05` to differentiate "stable supply" from "rate not yet computed" (`—`). No test in plan required the `=` form, but the third new test "positive wood rate and idle flat rate" asserts it to lock the behavior.
- **Test count**: plan said 2 new tests total. Delivered 5 subtests across 2 files (`hud-resource-rate.test.js` has 3, `toast-title-sync.test.js` has 2). File count matches plan.
- **CHANGELOG**: not touched per implementer contract (left to Validator).

## Handoff to Validator

- **Benchmark smoke** recommended per plan §6: `node scripts/long-horizon-bench.mjs` seed 42 / temperate_plains; DevIndex baseline ≈ 44, acceptance ≥ 42. If DevIndex regresses, the prime suspect is the rate-snapshot block (`HUDController.js:~130`) — it runs on every UI refresh, but the `(simSec - _lastSnapshotSimSec) >= 3` guard means the division/object-create path fires at most 1/3s, so it *should* be free in the sim loop.
- **Manual UI smoke** (not automated):
  1. Open `npx vite` → dev mode (`?dev=1`). Dev dock should be visible from frame 0 with cards reading "Initializing telemetry…" briefly, then populating within 1/3s — never stuck on "loading...".
  2. Hover any long toast (trigger by building/demolishing something) — the browser tooltip should show the full text even when the pill ellipses after ~50 chars.
  3. After 3 game-seconds, Food/Wood/Stone/etc. values should show a trailing `▲ +x.x/min` or `▼ -x.x/min` badge that updates every 3s.
  4. Toggle "Hide Dev Telemetry" button — label should flip correctly (existing behavior, but the *initial* label is now "Hide" to match the dock being expanded by default).
- **Regressions to watch**:
  - `ui-layout.test.js` ID whitelist (verified passing).
  - `test/ai-decision-panel.test.js` (plan flagged as at-risk; verified in green final run).
  - `test/hud-controller.test.js` (3 existing tests) — continues to pass because all new HUD fields are behind `if (this.x)` guards; the new rate code gracefully no-ops when the rate nodes aren't mocked.
- **No FREEZE-VIOLATION**: all changes are polish on existing systems (DOM copy, CSS max-width, JS render path, HTML placeholder text). No new mechanic, building, resource, role, or tile type introduced.
