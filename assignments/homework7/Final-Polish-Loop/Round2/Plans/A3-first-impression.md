---
reviewer_id: A3-first-impression
reviewer_tier: A
feedback_source: Round2/Feedbacks/A3-first-impression.md
round: 2
date: 2026-05-01
build_commit: d242719
priority: P0
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 4
  loc_delta: ~85
  new_tests: 2
  wall_clock: 28
conflicts_with: []
rollback_anchor: d242719
---

## 1. 核心问题

R1 closed the camera-frame and route-toast bugs but left the **two onboarding P0s** still standing:

1. **P0 — LMB-on-grass still selects a worker instead of placing the building (F1).**
   The R1 patch added the `decidePointerTarget` helper and reordered `#onPointerDown` so a placement-tool tile-click is *attempted first*. The unit tests pass. But the live behaviour is still broken because the **guard radius is too generous**: `ENTITY_PICK_GUARD_PX = 36` (`src/render/SceneRenderer.js:122`). On a 96×72 grid with workers wandering, almost any grass tile within 36 *screen pixels* of a wandering unit triggers the "fall-through to entity-pick" branch (`SceneRenderer.js:3659–3707`) and emits "Selecting nearby unit (release the build tool to place)" — which the reviewer reads as "my click did nothing". The fix logic is correct in shape; the threshold is wrong (it should match the worker sprite's actual hitbox ≈ 12 px, not the 36 px **guard annulus** that the R1 comment mistakenly applied here). On top of that, no **ghost preview** follows the cursor in placement mode, so the player has no signal that placement is even possible at the cursor location.

2. **P0 — Start Colony button below the fold at 1049×630 (F2).**
   `index.html:2497–2501` defines `<ol id="overlayLeaderboardList">` with CSS `max-height: 140px; overflow-y: auto` (line 1418–1424), but the leaderboard sits **inside** the overlay panel **above** `<div class="overlay-actions">` containing `Start Colony` (line 2521). Combined with map-template + map-size selectors and two control-hint rows, the overlay panel exceeds 630 px and `Start Colony` is pushed below the viewport. The overlay container has `padding: 18px` (line 1273) and the panel itself has `padding: 24px` (line 1286) — so even a moderate viewport overflows on the cheaper laptop class.

3. **P1 — HUD resource sublabels are hidden by `!important` (F4) and overlay-flip lacks "you toggled an overlay" affordance (F5); hotkey badges missing on toolbar buttons (F3).**
   - F4 root cause: `index.html:227` declares `#statusBar .hud-sublabel { display: none !important; }`, hiding the already-rendered "Food/Wood/Stone/Herbs" labels at line 2294/2302/2310/2318. Reviewer needs hover to read them.
   - F3 root cause: BuildToolbar buttons (`index.html:2597–2608`) only carry hotkey numbers in `title=` tooltip; no inline visible badge. Visual order *is* correct (Road=1, Farm=2) but the reviewer mis-mapped a 2-column grid layout to "Road must be 2".
   - F5 root cause: `terrainLensLabel` exists (`index.html:2568`) but is `hidden` by default and only flashes; no border / animation when an overlay auto-toggles via tool selection.

## 2. Suggestions（可行方向）

### 方向 A: Threshold + ghost-cursor + sticky Start CTA + sublabel reveal (minimal-surgical)
- 思路：
  1. **Pointer fix**: drop `ENTITY_PICK_GUARD_PX` from 36 → 14 in `SceneRenderer.js:122` so only clicks that *actually overlap* a worker sprite fall through; keep `decidePointerTarget` and the test as-is. Add a second test asserting that a placement-tool click 20 px from a worker still returns "place".
  2. **Ghost preview**: extend the existing `#onPointerMove` placement-preview path so when `state.controls.tool` is a placement tool, a low-opacity tile-footprint highlight follows the hover tile and tints **green** when `placeToolAt` would succeed and **red** when blocked. Reuses the existing `state.controls.buildPreview` slot already populated on click; we additionally compute it on hover.
  3. **Start CTA**: cap `.overlay-leaderboard` height (`index.html:1400`) `max-height: 96px` (was 140 px on the inner `<ol>`), pin `.overlay-actions` with `position: sticky; bottom: 0; background: var(--panel-bg); padding-top: 8px;` so Start Colony stays visible even when the panel scrolls.
  4. **Sublabel reveal**: delete the `display: none !important` rule on `#statusBar .hud-sublabel` (line 227) — sublabels are already rendered in the DOM and styled at 8 px (line 239); revealing them costs ~8 px of HUD height.
  5. **Hotkey badges**: add `::before` pseudo-element badge on `[data-tool]` buttons reading from a `data-hotkey` attribute (added inline on the 12 buttons at lines 2597–2608); CSS-only render of "1"–"12" / "−" / "=" badges in the top-left corner.
- 涉及文件：
  - `src/render/SceneRenderer.js` (one constant + a hover-preview branch)
  - `index.html` (CSS: leaderboard cap, overlay-actions sticky, sublabel rule delete, hotkey-badge ::before; HTML: `data-hotkey` on 12 buttons)
  - `src/ui/tools/BuildToolbar.js` (no-op verify — buttons render statically from index.html)
  - `test/scene-renderer-pointer-priority.test.js` (extend with a "20 px from worker → place" case)
- scope：小
- 预期收益：Closes the two onboarding P0s + three P1s in one pass; keeps tier-A reviewer's "I can place a road on first try" path open; adds the ghost-preview that aligns Utopia's cursor semantics with RimWorld / Banished expectation.
- 主要风险：(a) Lowering guard to 14 may regress `entity-pick-hitbox.test.js` if it asserts the 24/36 px guard; (b) `position: sticky` on `.overlay-actions` may overlap the leaderboard at very short viewports (< 480 px) — kept inside `min(520px, …)` panel so spillover is contained; (c) revealing sublabels widens HUD by ~8 px and may push secondary tier resources off-screen on 1366 wrap-mode — mitigated because `#ui.compact` (line 256) keeps the existing hide for compact mode.
- freeze 检查：OK — no new tile / role / building / mood / mechanic / audio / UI panel; only constants + CSS + DOM attributes + a hover code-path that already exists for click.

### 方向 B: Force "Select" tool on enter + auto-pop tutorial overlay
- 思路：On scene start, force `state.controls.tool = "select"` and pop a one-shot modal that tells the player to press "1" → click; only after dismissal does the build tool become clickable.
- 涉及文件：`src/app/GameApp.js` (force select), new `src/ui/panels/TutorialOverlay.js`, `index.html`
- scope：中
- 预期收益：Bypasses the click-priority bug entirely by gating discovery.
- 主要风险：Adds a UI panel; reviewer explicitly flagged "Best Runs / loss list / dense info" as friction — adding *another* panel makes it worse. Doesn't fix the underlying threshold bug for returning players who skip the overlay.
- freeze 检查：**FREEZE-VIOLATION** — adds a new UI panel (TutorialOverlay). Not selected.

### 方向 C: Replace LMB-pick-entity entirely with "Alt+LMB selects entity, plain LMB always places"
- 思路：When a placement tool is active, LMB is **only** placement; entity selection requires Alt+LMB or `Esc → 0` then click. This is what the reviewer expected from RimWorld.
- 涉及文件：`src/render/SceneRenderer.js` (`#onPointerDown`), `src/app/shortcutResolver.js` (no change), help dialog copy
- scope：小-中
- 预期收益：Hardest-line fix; placement is unambiguous.
- 主要风险：(a) Breaks muscle-memory of users who learned to click workers in v0.9.x; (b) breaks `pointerdown-expands-entity-focus.test.js` and `entity-pick-hitbox.test.js`; (c) requires updating SHORTCUT_HINT (`src/app/shortcutResolver.js:23`) and the help modal copy. Heavy churn, multiple test rewrites — too aggressive for a 30-min P0 polish window.
- freeze 检查：OK (no new mechanic, just an interaction-mapping change).

## 3. 选定方案

选 **方向 A**，理由：

- All five reviewer findings (F1, F2, F3, F4, F5) are addressed; F6 (Entity Focus mixed list) and F7 (Best Runs "loss") are P2 and explicitly punted to a follow-up plan.
- Smallest possible code surface (one constant change + four CSS rules + 12 attribute additions + a hover code-path that mirrors the existing click code-path).
- HARD freeze respected; no new tile / role / building / mood / panel.
- Testable with one new unit-test case + manual Playwright at 1049×630.
- Direct fix at the root cause for #1: the click logic was correct in shape after R1, only the threshold was too generous. Inverting the priority entirely (方向 C) over-corrects and rewrites three test files.

## 4. Plan 步骤

- [ ] **Step 1**: `src/render/SceneRenderer.js:122` — `edit` — change `ENTITY_PICK_GUARD_PX` default from `36` to `14` (matches worker sprite 12 px hitbox + 2 px slop). Update the JSDoc/comment block at lines 109–125 to explain "14 px is the *visual hitbox* of a worker; the previous 36 px was a perception-buffer that mis-treated entity-near as entity-on".
- [ ] **Step 2**: `test/scene-renderer-pointer-priority.test.js` — `add` — append a case "placement tool with entity 20 px away (outside 14 px guard) → place" verifying `decidePointerTarget({ activeTool:"road", entityNearby:false, tilePlaceable:true, tileOccupiedByEntity:false })` returns `"place"`. (Pure decision helper; threshold is enforced by the caller passing `entityNearby:false` when `proximity > 14`.)
  - depends_on: Step 1
- [ ] **Step 3**: `src/render/SceneRenderer.js:#onPointerMove` — `edit` — when `state.controls.tool` is a placement tool AND `hoverTile` resolves, call `buildSystem.placeToolAt(state, tool, ix, iz, { dryRun: true })` and store the result in `state.controls.buildPreview` so the existing tile-mesh tint code (look up `state.controls.buildPreview.ok`) can render a green/red ghost on the hovered tile. If the function does not yet support `dryRun`, add a 6-line read-only branch that returns `{ ok, reason }` without mutating the grid. Reset preview to `null` on `pointerleave` (already wired at line 723).
  - depends_on: Step 1
- [ ] **Step 4**: `index.html:227` — `delete` — remove the `#statusBar .hud-sublabel { display: none !important; }` declaration so Food/Wood/Stone/Herbs labels render under each icon by default. Keep the `#ui.compact .hud-sublabel { display: none; }` rule at line 256 untouched so compact-mode behaviour is preserved.
- [ ] **Step 5**: `index.html:1418–1424` — `edit` — change `.overlay-leaderboard-list { max-height: 140px }` to `max-height: 96px` so the Best Runs list cannot grow past ~3 rows visible (rest scrolls inside the bounded `<ol>`). Reduces panel height by ~44 px, enough to fit Start Colony on a 630 px viewport.
- [ ] **Step 6**: `index.html:1521` (inside `.overlay-actions` rule) — `edit` — pin `.overlay-actions` with `position: sticky; bottom: 0; background: var(--panel-bg); padding-top: 8px; margin-top: 8px;` so even if the panel still overflows on a narrower viewport (e.g. 600 px), Start Colony stays visible at the bottom of the panel viewport. (Find the existing `.overlay-actions` selector via Grep before editing; if absent, add the rule under `.overlay-leaderboard` at line 1408.)
  - depends_on: Step 5
- [ ] **Step 7**: `index.html:2597–2608` — `edit` — add `data-hotkey="1"` … `data-hotkey="9"`, `data-hotkey="-"`, `data-hotkey="="` to the 12 `<button data-tool=...>` elements in toolbar order (Road=1, Farm=2, Lumber=3, Warehouse=4, Wall=5, Bridge=6, Demolish=7, Quarry=8, Herbs=9, Kitchen=10/0?, Smithy=11/`-`, Clinic=12/`=`). Match existing `TOOL_SHORTCUTS` from `src/app/shortcutResolver.js:7-20` (Digit0=select is intentionally NOT in toolbar).
- [ ] **Step 8**: `index.html` (CSS section near line 1500) — `add` — add a `[data-tool][data-hotkey]::before` rule that renders `content: attr(data-hotkey)` as a 14×14 absolute-positioned badge in the top-left corner of each toolbar button (background var(--accent-dim), color var(--text), font-size 9px, font-weight 800, border-radius 3px). Matches the existing `hk-key` aesthetic at line 418.
  - depends_on: Step 7
- [ ] **Step 9**: `index.html:2568` (terrainLensLabel) — `edit` — drop the `hidden` attribute and add CSS `transition: opacity 200ms ease;` plus a 1.4 s pulse animation on `body.overlay-just-toggled` so a player who triggers an overlay (via tool select that auto-flips Connectivity / Fertility) sees a brief "Overlay: Connectivity" badge fade in and out. The class flip lives in the existing overlay-toggle code path (look up `terrainLensMode` setter); a 4-line change adds `document.body.classList.add('overlay-just-toggled'); setTimeout(() => document.body.classList.remove('overlay-just-toggled'), 1400);` at the toggle site.
  - depends_on: none (independent F5 polish)
- [ ] **Step 10**: `CHANGELOG.md` — `edit` — add a `v0.10.1-A3-R2` section under unreleased, listing: "(F1) Pointer guard 36→14 px so road-on-grass places instead of selecting wandering animals; (F1) tile placement preview ghost on hover; (F2) Start Colony sticky in overlay actions, leaderboard capped at 96 px; (F4) HUD resource sublabels visible by default; (F3) toolbar hotkey badges; (F5) overlay-toggle pulse cue."
  - depends_on: Steps 1–9

## 5. Risks

- **R1**: `test/entity-pick-hitbox.test.js` may assert specific guard / fallback values; lowering 36→14 may break it. Mitigation: read that test before Step 1; if it pins 36, update it to 14 with the same justification ("guard ≈ visual hitbox, not perception buffer").
- **R2**: Adding a `dryRun` branch to `BuildSystem.placeToolAt` (Step 3) may regress build-system tests if `dryRun` flag is silently ignored or if an existing test calls without the flag and asserts mutation. Mitigation: implement as a no-op early-return at the top of the function so the existing call-paths are untouched.
- **R3**: Removing `display: none !important` on `.hud-sublabel` may push secondary HUD items off-screen on 1366×768 wrap mode. Mitigation: verify on 1366 wrap viewport in Playwright; the existing `#ui.compact` hide-rule at line 256 catches narrow viewports.
- **R4**: `position: sticky` on `.overlay-actions` requires the parent `.overlay-panel` to have `overflow-y: auto`; if not present, sticky degrades to `static`. Mitigation: verify by adding `overflow-y: auto; max-height: calc(100vh - 36px)` on `.overlay-panel` if the sticky doesn't activate at 1049×630.
- **R5**: `data-hotkey` attribute clutters the toolbar HTML; if a future Implementer renames a tool, the badge must be hand-synchronized with `TOOL_SHORTCUTS`. Mitigation: add a 1-line dev-only assertion in `BuildToolbar.js` init that walks toolbar buttons and verifies `[data-hotkey]` matches `TOOL_SHORTCUTS[Digit{n}]`.
- **可能影响的现有测试**: `test/scene-renderer-pointer-priority.test.js`, `test/entity-pick-hitbox.test.js`, `test/pointerdown-expands-entity-focus.test.js`, any `test/build-*.test.js` that calls `placeToolAt` (dryRun branch).

## 6. 验证方式

- 新增测试：`test/scene-renderer-pointer-priority.test.js` extended with a `placement tool, entity 20 px away → place` case.
- 手动验证：
  - `npx vite` → open `http://localhost:5173` at 1049×630 viewport.
  - Confirm Start Colony visible without scrolling; click → enter game.
  - Press "1" (Road), hover grass adjacent to a wandering worker → expect green ghost-preview tile.
  - LMB on the green tile → expect road placed, "Built road" toast; selectedEntityId stays null.
  - LMB directly on worker sprite (within ~14 px) → expect Selected Worker-X.
  - Press "T" → expect "Overlay: Terrain" pulse cue.
  - Hover Food icon → expect "Food" label visible without hover (line 2294 sublabel).
  - Each toolbar button → expect a "1"…"12" badge in the top-left corner of the button.
- FPS 回归：`browser_evaluate` 5-second average ≥ 30 fps at standard map size (no FPS regression expected — Step 3 hover-preview only runs on pointer move, which already runs).
- benchmark 回归：`scripts/long-horizon-bench.mjs` seed 42 / temperate_plains, DevIndex unchanged (no balance changes).
- prod build：`npx vite build` → no errors; `vite preview` 3-minute smoke at 1049×630 with no console error.

## 7. 回滚锚点

- 当前 HEAD: `d242719`
- 一键回滚：`git reset --hard d242719`（仅当 Implementer 失败时由 orchestrator 触发）

## 8. UNREPRODUCIBLE 标记

不适用 —— Friction reproduced via static read of `SceneRenderer.js:122` (`ENTITY_PICK_GUARD_PX = 36`) and `index.html:227` (`.hud-sublabel` hidden); reviewer's 1049×630 Start-Colony-below-fold reproduces deterministically because the leaderboard `<ol>` `max-height: 140px` plus map-template/size selectors plus two control-hint rows plus 24 px panel padding plus 18 px overlay padding = ~640 px panel height, exceeding 630 px viewport.
