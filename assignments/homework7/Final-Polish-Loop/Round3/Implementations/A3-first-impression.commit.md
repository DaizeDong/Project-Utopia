---
reviewer_id: A3-first-impression
plan_source: Round3/Plans/A3-first-impression.md
round: 3
date: 2026-05-01
parent_commit: d999a76
head_commit: 68833f0
status: DONE
track: code
freeze_check: PASS
track_check: PASS
steps_done: 7/7
tests_passed: 1743/1752
tests_new:
  - test/click-router-tool-priority.test.js (16 test points)
---

## Steps executed

- [x] Step 1 (click router pure-helper): VERIFIED EXISTING — `decidePointerTarget` in `src/render/SceneRenderer.js:426` already short-circuits to "place" when `activeTool && activeTool !== "select" && activeTool !== "inspect"` and the tile is placeable. The R2 work (commit `e5d754a`) already wired this into `#onPointerDown`. New test (Step 7) pins the priority matrix across all 11 placement tools so a future refactor cannot regress this.
- [x] Step 2 (BuildToolbar toggle): `src/ui/tools/BuildToolbar.js:#setupToolButtons` — added a guarded early-return at the top of the click handler: `if (c.tool === tool && tool !== "select") { c.tool = "select"; ... }`. Second-click on the active tool now explicitly returns to "select" with status "Tool deselected — left click now inspects tiles." and a `utopia:clearToasts` event so leftover build toasts don't linger over the toggled-off tool.
- [x] Step 3 (Help → briefing single source): `index.html:3399-3413` — replaced the misleading "Open the Build panel (top-left) and place a Farm" text with right-sidebar guidance pointing players at the menu briefing's "First build" line (rendered into `#overlayMenuPriority` by `formatTemplatePriority(templateId)`, which reads `voice.hintInitial` from `ScenarioFactory.js`). The Help text no longer prescribes a specific tool, deferring to the per-scenario briefing as the single source of truth.
- [x] Step 4 (briefing alignment): VERIFIED — briefing strings in `src/world/scenarios/ScenarioFactory.js` already use scenario-specific first-build prose (e.g., "Build a road to the west forest...", "Repair the north gate..."). With Step 3 the Help text no longer fights with the briefing. No edit to ScenarioFactory needed; the contradiction was Help-side prescription, not scenario voice.
- [x] Step 5 (Best Runs banner): `index.html` — added `<div id="overlayLeaderboardBanner" class="overlay-board-banner" hidden>` above the `<ol id="overlayLeaderboardList">`, plus `.overlay-board-banner` CSS (amber-tinted, italic, low-key). `src/ui/hud/GameStateOverlay.js:#renderLeaderboard` — gates banner visibility: shown only when `safeList.length > 0 && safeList.every(e => e.cause === "loss")`, hidden otherwise. Empty-state ("No runs yet — finish a run to record one.") was already correct via the existing CSS `:empty::before` placeholder; the banner closes the gap for streaks of failures.
- [x] Step 6 (B/R/T hint): `src/render/SceneRenderer.js:2259` — replaced `<span>B = build &nbsp;·&nbsp; R = road &nbsp;·&nbsp; T = fertility</span>` with `<span>Press 1-12 to select a build tool</span>`. Single-line edit; tooltip layout unchanged.
- [x] Step 7 (test): `test/click-router-tool-priority.test.js` — 16 test points across 4 sections: (a) `decidePointerTarget` priority matrix asserts "place" wins for any of 11 placement tools (`road, farm, lumber, quarry, herb_garden, warehouse, kitchen, smithy, clinic, wall, gate`) when the tile is legal and no entity is in the 14 px guard; (b) entity-nearby and inspect/select/null tools never enter the place branch; (c) BuildToolbar source-text guard for the toggle branch (regresses if the toggle code is removed); (d) source-text guards against the deprecated `B = build &nbsp;` HTML row returning to SceneRenderer.js, and against the misleading "Open the Build panel (top-left)" Help string returning to index.html.

## Tests

- pre-existing skips: 3 (unchanged across parent commit and head)
- new tests added: 16 (all green)
- pre-existing failures (6, identical on parent commit `d999a76` — verified via stash/pop):
  - `exploit-regression: escalation-lethality — median loss tick ∈ [2000, 5000]`
  - `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires`
  - `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
  - `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
  - `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)`
  - `v0.10.0-c #2: scenario E walled-warehouse — FSM keeps all workers alive (carry-eat works)`
  - (intermittent: `worker-ai-bare-init.test.js Fix 2/3 stuck >3.0s simulated` flaked once on baseline; same as A1 R3 reported.)
- failures resolved during iteration: 1 — initial test/click-router-tool-priority.test.js Step (d) regex `/B = build/.test(src)` matched the explanatory comment block I wrote ABOVE the replacement push() call. Tightened to `/B = build &nbsp;/` so the assertion only catches the rendered HTML row, not narrative comments. Re-run: 16/16 green.

## Deviations from plan

- Step 1: plan said "add a short-circuit at click handler entry"; the short-circuit was already in place from R2 (`e5d754a`'s pointer guard rewrite). Rather than re-add, I (a) verified the priority logic in `decidePointerTarget` covers the spec exactly, and (b) added 11-tool exhaustive priority test coverage so future refactors can't reintroduce the regression. Behavioural intent preserved.
- Step 2: plan suggested setting `state.controls.activeTool = null` on toggle; the codebase uses `controls.tool` (not `activeTool`) and "select" (not `null`) as the neutral sentinel — matching existing button semantics in BuildToolbar (`tool === "select"` branch already exists). Used the codebase's idiomatic neutral state.
- Step 3: plan asked to read `scenario.briefing.firstBuild`; that field doesn't exist on the scenario object — the scenario voice's `hintInitial` (already wired to the menu via `formatTemplatePriority`) IS the per-scenario first-build source. Updated Help to point players at the briefing line in the right sidebar rather than rendering the scenario-specific text into the static Help dialog (which has no live state binding).
- Step 5: plan said "replace 10 placeholder loss entries with positive guidance"; the leaderboard is fed from real localStorage entries (no placeholder pool exists) — the empty-state already shows "No runs yet — finish a run to record one." via CSS `:empty::before`. The actual gap was for streaks of REAL losses; added the all-loss banner as the spec's secondary guidance ("Survival mode — every run ends; aim for higher score").

## Freeze / Track check 结果

- freeze_check: PASS — no new TILE / role / building / mood / UI panel / audio asset. Only edits to existing UI text, an existing tile-tooltip row, an existing build-toolbar click handler, and one new banner DOM node (a `<div>` inside the existing Best Runs panel — not a new panel) plus its CSS.
- track_check: PASS — only `src/**/*.js`, `index.html`, `test/*.test.js`, and `CHANGELOG.md` modified. Zero touches to README / assignments / docs / Round3/Plans.

## Handoff to Validator

- **Manual smoke (F1 click-router)**: `npx vite` → enter game → press `1` (Road) → LMB on a green tile → expect the road segment to appear with success toast `"Road at (x,y): ..."` and NO tile-inspector popup. Press `1` again → expect status `"Tool deselected — left click now inspects tiles."` and the Road button to deselect. LMB on a tile → expect tile-inspector popup to appear (selected tile updates in the right sidebar Inspector panel).
- **Manual smoke (F6 Help/briefing)**: Press `F1` → Controls tab → Getting Started → expect text says "Open the Build tab in the right sidebar — the menu briefing's 'First build' line tells you which tool..." (no more "top-left" or "place a Farm"). Close Help → expect the menu briefing's First build line to match the active scenario voice (e.g., for `temperate_plains` it reads "First build: Build a road to the west forest...").
- **Manual smoke (F2 Best Runs)**: Open dev tools → `localStorage.removeItem("utopia:leaderboard:v1")` → reload → expect Best Runs shows "No runs yet — finish a run to record one." italic. Play a quick failed run → return to menu → expect a single loss row + the new amber banner above: "Survival mode — every run ends. Aim for a higher score on the next one." Survive past day 30 (or use dev console to inject `cause: "max_days_reached"`) → expect the banner to disappear (since not all runs are losses).
- **FPS check**: zero new per-tick work (banner gate runs only inside `#renderLeaderboard` which is already gated by sig-diff; BuildToolbar toggle is per-click). Expect FPS unchanged.
- **prod build**: `npx vite build` → 0 errors. The new banner DOM is static HTML inside `gameStateOverlay`, no bundler-impacting changes.
- **Rollback**: `git reset --hard d999a76` (single commit on top).
