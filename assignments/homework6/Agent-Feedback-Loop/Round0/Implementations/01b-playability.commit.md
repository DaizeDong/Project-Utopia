---
reviewer_id: 01b-playability
plan_source: Round0/Plans/01b-playability.md
round: 0
date: 2026-04-22
parent_commit: 0a0658e
head_commit: 568bdb6
status: DONE
steps_done: 9/9
tests_passed: 897/899
tests_new:
  - test/build-toast-feedback.test.js
  - test/hud-menu-phase.test.js
---

## Steps executed

- [x] **Step 1** — `index.html` — inserted `#floatingToastLayer` div inside
  `#viewport` (below `<canvas id="c">`, above `#gameStateOverlay`), added
  `.build-toast` + `.build-toast--ok/--err` + `@keyframes toastFloat` and
  `@keyframes flashAction` + `#buildPreviewVal[data-kind="error"|"warn"]`
  tint rules. Placed in the CSS block between the 01d `.hud-rate` section
  and the panel-toggle section, so it does NOT touch 01c's `.dev-only` rules
  or 01d's `.hud-action max-width: 420px`.
- [x] **Step 2** — `src/render/SceneRenderer.js` constructor — added
  `this.toastLayer`, `this.toastPool`, `this.lastToastTileKey`,
  `this.lastToastTimeMs` next to `boundOnPointerDown`.
- [x] **Step 3** — `src/render/SceneRenderer.js` — added `#spawnFloatingToast`
  method AND exported a pure `formatToastText(buildResult, resources)` helper
  at module top (so the new test can import it without touching WebGL). The
  method projects world→screen via `THREE.Vector3.project(camera)`, then
  positions a recycled div; 100 ms throttle on repeat-tile clicks; pool size
  capped at 6 nodes to satisfy Risk 1.
- [x] **Step 4** — `src/render/SceneRenderer.js#onPointerDown` — after both
  success and failure action-message branches, spawn the toast at the clicked
  tile's world coord. Success shows `-N wood` (from `buildResult.cost`);
  failure shows `Need N more wood, M more stone` (shortfall-diff against
  `state.resources`) or falls back to `reasonText` for non-cost reasons.
- [x] **Step 5** — `src/ui/tools/BuildToolbar.sync` — read
  `state.controls.buildPreview`; when `ok === false` with a reasonText,
  prepend a `✗` glyph, set `data-kind="error"`, and expose `data-tooltip`
  (the "first build toolbar data-tooltip introduction" called out in the
  runtime context). When `ok === true` with warnings, prepend `⚠` and set
  `data-kind="warn"`. Default path preserves the original `previewSummary`
  text exactly, so prior UX for clean placements is unchanged.
- [x] **Step 6** — `src/ui/hud/HUDController.js` — added
  `this.lastActionMessage = ""` constructor field; in `statusAction` render,
  when the new `state.controls.actionMessage` differs from the cached copy,
  remove/force-reflow/re-add the `flash-action` class. Wrapped in `try/catch`
  so mock nodes without `classList` don't throw (covered in
  `test/hud-controller.test.js` and `test/toast-title-sync.test.js`).
- [x] **Step 7** — `src/ui/hud/HUDController.js` — both Survival render blocks
  (sidebar `objectiveVal` lines 233-252, status-bar `statusObjective` lines
  325-345) now guard on `state.session?.phase === "active" && totalSec > 0`.
  Non-active phase renders `Survived --:--:--  Score —` and suppresses the
  `· Dev N/100` suffix. Risk 4 mitigation applied (`totalSec > 0` extra
  guard as plan suggested).
- [x] **Step 8** — `test/build-toast-feedback.test.js` — 7 cases covering
  success single-resource, success multi-resource, success zero-cost,
  insufficientResource shortfall (`Need 3 more wood, 2 more stone`),
  non-resource failure fallback to reasonText, insufficientResource without
  resources arg, malformed input (null/undefined/no reason).
- [x] **Step 9** — `test/hud-menu-phase.test.js` — 3 cases covering
  `phase="menu"`, `phase="active"` (live ticker recovers), and
  `phase="end"` (also frozen so the post-loss overlay stays quiet).

## Tests

- **baseline** (pre-change): 887 pass / 2 skip / 889 total
- **final**: 897 pass / 2 skip / 899 total (+10 tests, 0 regressions)
- pre-existing skips: same 2 as baseline (unchanged)
- new tests added:
  - `test/build-toast-feedback.test.js` (7 cases)
  - `test/hud-menu-phase.test.js` (3 cases)
- failures resolved during iteration: none — green on the first run after
  all Edit/Write completed.

## Deviations from plan

- **Plan says line 170 / 268 / etc — actual line offset minimal**. The
  `#onPointerDown` insertion landed around line 1935 (not 1884) because
  two upstream refactors shifted the file, but the surrounding landmarks
  (`buildResult` branches, `actionMessage` assignments) matched the plan
  exactly.
- **`formatToastText` extracted as an exported module-level helper**
  instead of an instance method. This keeps the unit test pure and avoids
  pulling Three.js/DOM into the test bundle (Step 8 fitness).
- **Step 5** was expanded slightly: besides the `ok===false`/reasonText
  blocker tint, I also added a warnings tint (`ok===true` +
  `warnings[0]`) so hover-preview surfaces "wildlife pressure high" /
  "hazard zone" style soft-blockers. Same CSS hook (`data-kind="warn"`,
  pre-declared in Step 1), still within plan scope (hover-side channel
  for build feedback).
- **Step 6** the plan suggested the `@keyframes flashAction` block include
  `scale(1.08) → scale(1)`. I added `filter: brightness(1.35) →
  brightness(1)` on top so the pulse is visible even when the 01d
  `max-width: 420px` truncates the text mid-render (Risk 3 mitigation:
  `#ui.compact .hud-action.flash-action { animation: none; }` disables
  the whole animation in compact mode, as specified).
- **Risk 4 extra guard applied**: the phase guard also checks
  `totalSec > 0` so the first few render frames during menu→active
  transition don't flash `00:00:00` — they stay at `--:--:--` until
  the timer has actually ticked.
- **Screenshots at repo root (200+ `.png`/`.jpeg`) were NOT staged**
  (per implementer.md hard constraint 4 and the runtime context warning).
  Only `index.html`, the three `src/` files, and the two new `test/`
  files went into the commit.

## Handoff to Validator

- **UI smoke (Playwright MCP suggested)**:
  1. Open fresh page → `#statusObjective` should read
     `Survived --:--:--  Score —` with no Dev suffix.
  2. Hover Build → Farm with insufficient wood on a valid tile → sidebar
     `#buildPreviewVal` should be red and start with `✗`.
  3. Click the same tile → a red "Need N more wood" toast should float
     upward from the cursor, 1.2 s animation, fade to 0.
  4. Build Road on grass when wood >=1 → green `-1 wood` toast.
  5. Repeat-click same tile within 100 ms → only one toast renders
     (throttle check).
  6. Resize window / toggle compact mode → `.hud-action.flash-action`
     animation should be suppressed in compact.
- **Benchmark regression**: Plan target is DevIndex ≥ 41.8 / deaths ≤ 500
  on seed 42 / temperate_plains after ~365 days. This plan touches only
  UI render layers (no state mutations beyond `actionMessage` /
  `buildPreview` which SceneRenderer was already writing), so numbers are
  expected to match the 01d baseline within noise (±2%). Recommend the
  validator runs `node scripts/long-horizon-bench.mjs --seed 42 --template
  temperate_plains` as a safety check; anything >±2% means something in
  HUD render path leaked into sim state and must be rolled back.
- **Coverage with 01c + 01d merge**: the three conflict points from the
  runtime context were all respected:
  - S1 HUDController.render — action channel extension is ADDITIVE
    (new `flash-action` class + `lastActionMessage` field), did not
    touch 01c's Heat Lens priority, did not touch 01d's resourceRate
    block or the `title=` mirroring.
  - S2 BuildToolbar.sync — this is the FIRST introduction of
    `data-tooltip` on `#buildPreviewVal`. Pattern is documented in the
    sync block comment for downstream reviewers (01a/02b/02e).
  - index.html — inserted new CSS in an independent slot between
    01d's `.hud-rate` and the panel-toggle block; did NOT modify
    `.dev-only` gates or the `.hud-action max-width: 420px` cap. New
    DOM (`#floatingToastLayer`) placed inside `#viewport`, after the
    canvas and before `#gameStateOverlay`.
- **No feature-freeze concerns**: all changes are polish / UX surfacing
  of already-existing `buildResult.reasonText` / `buildPreview` / `cost`
  fields. No new simulation mechanic, no new public API on BuildSystem.
