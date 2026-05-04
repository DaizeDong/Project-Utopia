---
reviewer_id: A3-first-impression
reviewer_tier: A
feedback_source: Round1/Feedbacks/A3-first-impression.md
round: 1
date: 2026-05-01
build_commit: 1f6ecc6
priority: P0
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 3
  loc_delta: ~70
  new_tests: 2
  wall_clock: 25
conflicts_with: []
rollback_anchor: 1f6ecc6
---

## 1. 核心问题

1. **Initial viewport frames a sliver of the grid (F1, P0).** `SceneRenderer` constructor sets `this.orthoSize = max(96,72) * 0.65 = 62.4` and immediately applies `camera.zoom = 1.12`, so the visible window is ~55.7 world units against a 96-wide grid — only ~58% of the map width is on screen at first frame. The reviewer perceives the grid as "central palm-sized" and assumes water/black is the world edge until the first successful build re-frames the camera.
2. **`#onPointerDown` picks an entity *before* it considers the active build tool (F2, P0).** When Road is pre-selected and the player clicks a grass tile that happens to be within `ENTITY_PICK_FALLBACK_PX` of a wandering bear, the entity branch returns at line 3522 and the road never gets placed; the player only sees "Selected Bear-20" and a `Target tile is unchanged` red toast. The 24 px guard at lines 3525–3539 only protects the *guard annulus*, not the inner entity-pick zone.
3. **`routes 0/1` is a connectivity gauge, not a placement counter (F3, P0).** `getScenarioRuntime` defines `connectedRoutes = routes.filter(r => r.connected).length` where `r.connected` requires BFS over network tiles to link `anchors[from]` ↔ `anchors[to]`. Placing one mid-map road that touches neither anchor leaves the count at 0 forever, but `BuildAdvisor` line 628 still tells the player "Road extends the first network line" — toast and chip disagree, so the player loses progress signal.

## 2. Suggestions（可行方向）

### 方向 A: Minimal three-fix patch (camera frame + tool-priority pointer + honest road toast)
- 思路：Tighten `SceneRenderer` constructor to frame the full grid on first paint; reorder `#onPointerDown` so a pre-selected build tool clicks the tile first and falls back to entity-pick only when the placement is illegal; rewrite `BuildAdvisor`'s road branch to surface the *connectivity-progress* truth ("Road segment placed; 0/2 anchors linked").
- 涉及文件：
  - `src/render/SceneRenderer.js` (constructor camera defaults + `#onPointerDown` reorder)
  - `src/simulation/construction/BuildAdvisor.js` (road summary copy + endpoint count)
  - `src/world/scenarios/ScenarioFactory.js` (export a `getRouteEndpointStatus(grid, anchors, routeLink)` helper used by BuildAdvisor)
- scope：小
- 预期收益：Closes 3 P0 onboarding bugs without touching mechanics; reviewer's first-3-min "I don't know if my action did anything" loop goes away.
- 主要风险：(a) Reordering pointer events may regress entity-selection tests; (b) road toast copy change may break a snapshot test; (c) camera framing change may regress `applyViewState` callers expecting `zoom=1.12`.
- freeze 检查：OK — no new tile / role / building / mood / mechanic / audio / UI panel; only copy + a counter readout + camera default + click-priority swap.

### 方向 B: Add a "tutorial mode" overlay that explains the click semantics and counter meaning
- 思路：Bolt a one-shot onboarding modal on first launch that walks through "Road tool → click → counter explanation".
- 涉及文件：`src/ui/panels/*` (new tutorial panel), `index.html`, `src/app/GameApp.js`
- scope：大
- 预期收益：Educates the player around the bug rather than fixing it.
- 主要风险：Adds a UI panel; doesn't fix the underlying interaction bug; players who skip the modal still hit F2/F3.
- freeze 检查：**FREEZE-VIOLATION** — adds a new UI panel. Not selected.

### 方向 C: Auto-snap first road to nearest scenario anchor + rescale camera-on-zoom-event hook only
- 思路：When the player places their first road and it doesn't touch any anchor, auto-extend a 1-tile stub toward the closest anchor; only fix camera by hooking `applyViewState` to a `firstFrame` flag.
- 涉及文件：`src/simulation/construction/BuildSystem.js`, `src/render/SceneRenderer.js`
- scope：中
- 预期收益：Hides issue F3 by making the counter advance even if the player misclicks.
- 主要风险：(a) Auto-extending a road silently violates "what you click is what you place" trust and adds new placement *behaviour* (mechanic shift); (b) doesn't fix F2 at all.
- freeze 检查：**FREEZE-VIOLATION (borderline)** — the auto-snap stub is a new placement mechanic. Not selected.

## 3. 选定方案

选 **方向 A**。理由：

- P0 + tight deadline → smallest scope wins.
- All three sub-fixes are localised root-cause patches (camera default, click priority, toast copy), not workarounds.
- Hard freeze respected: no new entities, mechanics, or panels.
- Each sub-fix is independently rollback-safe and independently testable.

## 4. Plan 步骤

- [ ] **Step 1**: `src/render/SceneRenderer.js:524` — `edit` — Replace `this.orthoSize = Math.max(state.grid.width, state.grid.height) * 0.65;` with `this.orthoSize = Math.max(state.grid.width, state.grid.height) * 1.05;` so the orthographic frustum spans the full grid plus a small margin. Also replace the `this.camera.zoom = 1.12;` literal at line 530 with `this.camera.zoom = 1.0;`. Mirror the same `1.05` constant change at line 3944 (the `#onResize` orthoSize recompute).

- [ ] **Step 2**: `src/render/SceneRenderer.js:372` — `edit` — Update the `DEFAULT_CAMERA_VIEW` frozen object so `zoom: 1.12` becomes `zoom: 1.0` (matches Step 1 so `applyViewState(DEFAULT_CAMERA_VIEW)` re-frames identically; otherwise the camera snaps back to a too-tight view on reset).
  - depends_on: Step 1

- [ ] **Step 3**: `src/render/SceneRenderer.js:#onPointerDown` (lines 3485–3571) — `edit` — Reorder so that when `state.controls.tool` is a placement tool (i.e. not `"select"` and not `"inspect"`), the click first attempts `#pickTile` + `buildSystem.placeToolAt`. If the placement returns `ok: true`, return early; if it returns `ok: false` AND the failure reason is an entity collision (e.g. tile occupied by a unit), fall through to `#pickEntity`. For `"select"`/`"inspect"` tools, keep the existing entity-first order. Concretely:
  1. Hoist `const activeTool = this.state.controls?.tool;` to the top of the function.
  2. If `activeTool && activeTool !== "select" && activeTool !== "inspect"`: pick tile first; on `ok: false` with `reason === "occupied" | "blocked_by_entity"` (whichever BuildSystem actually emits — read `BuildAdvisor.js` reason codes), then fall through to `#pickEntity` so the bear still becomes selectable explicitly via long-press or right-click later. On any other `ok: false`, set `actionMessage = summarizeBuildPreview(buildResult)` and **return without selecting an entity** so the rejection reason ("Road can't replace WATER", etc.) is the dominant feedback.
  3. Keep the existing 24 px guard (lines 3525–3539) for the case where the tile-pick succeeded but the user was clearly aiming at a worker — repurpose it as the "user wanted to select instead of place" escape hatch by switching to entity-pick under that guard.
  - depends_on: none

- [ ] **Step 4**: `src/world/scenarios/ScenarioFactory.js:1182` (after `hasInfrastructureConnection`) — `add` — Export a new helper `getRouteEndpointStatus(grid, anchorFrom, anchorTo)` returning `{ fromOnNetwork: bool, toOnNetwork: bool, connected: bool }`. Implementation: check `isInfrastructureNetworkTile(grid.tiles[anchorFrom.ix + anchorFrom.iz * grid.width])` for each endpoint; reuse `hasInfrastructureConnection` for the connected boolean. No new mechanic — purely a read-only diagnostic.
  - depends_on: none

- [ ] **Step 5**: `src/simulation/construction/BuildAdvisor.js:622` (the `else if (tool === "road")` branch ending at line 629) — `edit` — Replace the three road-summary literals with copy that names the *connectivity progress*, not the act of placement:
  - When `hasRoadTouch` is true: keep `Road at ${tilePoint} connects directly into the current network.` (already accurate).
  - When `!hasRoadTouch && hasWarehouse`: `Road at ${tilePoint}: 1 segment placed, no anchor linked yet (warehouse ${formatTileDistance(warehouseDistance)} away).`
  - Else: `Road at ${tilePoint}: 1 segment placed, 0/${anchorCount} route anchors linked.` where `anchorCount` is read from the scenario runtime via `getScenarioRuntime(state).routes.length` × 2 (each route has from+to). Pass `state` into `evaluateBuildPreview` only if it is already available in scope; otherwise read from `tags.routeLinks` length already in scope at line 606.
  - depends_on: Step 4

- [ ] **Step 6**: `test/build-toast-feedback.test.js` — `edit` (or add a new sibling `test/build-toast-routes-honest-progress.test.js` if the existing file is heavily snapshotted) — `add` a test case "road placed mid-map without touching anchor reports `0/N anchors linked` not `extends the first network line`". Set up a 16×16 grid with two scenario anchors at (2,2) and (14,14), `placeToolAt(state, "road", 8, 8)`, assert `result.summary` matches `/0\/\d+ route anchors linked/`.
  - depends_on: Step 5

- [ ] **Step 7**: `test/scene-renderer-pointer-priority.test.js` — `add` (new file) — Headless test that constructs a `SceneRenderer`-like fixture (or directly tests an extracted pure helper if `#onPointerDown` is hard to instantiate without WebGL — in that case extract the priority decision into a pure module function `decidePointerTarget({ activeTool, entityAtCursor, tileAtCursor }) → "place" | "select"` and unit-test that). Cases: (a) `tool="road"`, entity nearby, legal tile → returns `"place"`; (b) `tool="road"`, illegal tile (water) → returns `"select"`; (c) `tool="select"`, entity nearby → returns `"select"`.
  - depends_on: Step 3

- [ ] **Step 8**: `CHANGELOG.md` — `edit` — Add a v0.10.1-n entry under "Bug Fixes":
  - "Initial camera frames the full 96×72 grid (was clipped to ~58% width)."
  - "Pre-selected build tool now wins over entity-selection on left-click; entity-pick falls through only when placement is illegal."
  - "Road placement toast reports `0/N anchors linked` instead of the misleading `extends the first network line` so it agrees with the `routes 0/1` HUD chip."
  - depends_on: Steps 1, 3, 5

## 5. Risks

- **Step 1 / 2 zoom change** could alter `cameraSnapshot`-style tests if any assert literal `zoom=1.12`. Mitigation: grep for `1\.12` in `test/` before edit; update any literal to `1.0`.
- **Step 3 reorder** risks regressing the existing 24 px worker-guard UX — workers near grass should still be selectable when the player intends to. Mitigation: the guard logic moves with the code; explicit test in Step 7 covers the toggle.
- **Step 5 copy change** may break snapshot/string-equality tests in `test/build-consequence-preview.test.js` or `test/build-toast-feedback.test.js`. Mitigation: grep `"extends the first network line"` first; update assertions to the new copy or relax to a regex.
- **Step 4** adds a new exported helper — name collision check via Grep before adding.
- 可能影响的现有测试：`test/build-toast-feedback.test.js`, `test/build-consequence-preview.test.js`, `test/scenario-objective-regression.test.js`, `test/alpha-scenario.test.js`, any cameraSnapshot-related test.

## 6. 验证方式

- 新增测试：
  - `test/scene-renderer-pointer-priority.test.js` — 3 cases for tool-vs-entity click priority.
  - `test/build-toast-routes-honest-progress.test.js` (or extension to `build-toast-feedback.test.js`) — road-placed-no-anchor case asserts `0/N anchors linked` copy.
- 手动验证：
  1. `npx vite` → load http://localhost:5173 → click "Start Colony".
  2. Expect: full 96×72 grid visible end-to-end on first paint; both `west lumber route` and `east ruined depot` markers in same frame.
  3. With Road pre-selected (default), click any grass tile near a wandering animal → expect a road blueprint to appear, NOT the bear becoming selected.
  4. Click a water tile with Road still selected → expect a red toast `Road can't replace water` (or equivalent BuildAdvisor reason), NOT entity selection.
  5. Place a road in the middle of the map (no anchor touched) → toast should read `... 0/N route anchors linked`; `routes 0/1` chip stays at 0; this is now consistent.
  6. Place a road that bridges from the warehouse anchor toward the lumber anchor → once the BFS path closes, `routes 0/1` flips to `1/1` and the chip turns green.
- FPS 回归：`browser_evaluate` average over 5 s ≥ 30 fps (camera change should not affect render cost — same number of draw calls).
- benchmark 回归：`scripts/long-horizon-bench.mjs` seed 42, temperate_plains — DevIndex must stay within −5% of v0.10.1-m baseline. Pointer / camera / toast changes should be telemetry-neutral.
- prod build：`npx vite build` no error; `vite preview` 3 min smoke with no console errors.

## 7. 回滚锚点

- 当前 HEAD: `1f6ecc6`
- 一键回滚：`git reset --hard 1f6ecc6`（仅当 Implementer 失败时由 orchestrator 触发）

## 8. UNREPRODUCIBLE 标记（如适用）

不适用 — feedback 复现路径在静态代码中可直接验证：

- F1：`SceneRenderer.js:524` 的 `0.65` 系数 + `1.12` 默认 zoom 数学上限制 ≈ 58% 视野。
- F2：`SceneRenderer.js:3492` 的 `#pickEntity` 调用先于 `#pickTile`（line 3541）。
- F3：`BuildAdvisor.js:628` 的字符串与 `ScenarioFactory.js:1368` 的 `connected` BFS 语义脱钩。

三个根因均已在源码中定位，无需 Playwright 复现即可生成确定性 patch.
