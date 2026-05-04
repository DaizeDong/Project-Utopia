---
reviewer_id: A7-rationality-audit
reviewer_tier: A
feedback_source: Round2/Feedbacks/A7-rationality-audit.md
round: 2
date: 2026-05-01
build_commit: d242719
priority: P0
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 6
  loc_delta: ~140
  new_tests: 2
  wall_clock: 35
conflicts_with: []
rollback_anchor: d242719
---

## 1. 核心问题

A7 R2 went RED(4) → YELLOW(5). Three structural root causes drive the 10 new
findings — fixing them collapses ~8 of the 10 surface symptoms:

1. **Engineering vocabulary leaks past the dev-mode gate.** `AIAutomationPanel`
   prints the `coverage=… mode=… proxy=… model=…` footer unconditionally; the
   gate at `isDevMode(state)` (already used by `autopilotStatus.js`) is not
   consulted. Findings #6 (model=deepseek-v4-flash with LLM OFF) and the
   "fallback/llm" / "proxy=unknown" leaks (R6 §1) all fan out from this single
   line (`AIAutomationPanel.js:131`).

2. **Empty markers still render the `▾` glyph because `::after` is unconditional
   CSS.** `index.html:593` emits the chevron via `content: '\25BE'` for every
   `.pressure-label`, even pool slots with empty `textContent`. The renderer
   already calls `el.style.display = "none"` on hidden slots (Pass 3,
   `SceneRenderer.js:2425-2437`) but A7's evaluator dump shows 4 of 6 nodes
   visible-but-empty — i.e. the renderer kept them visible because their marker
   carried a non-empty `kind` while resolving to an empty `label`. Finding #2.

3. **Default seed 1337 is a hard-coded constant on every fresh boot.**
   `Grid.js:44 DEFAULT_MAP_SEED = 1337` + `BuildToolbar.js:472,1381` +
   `createServices.js:97` all funnel new runs through seed 1337, so the
   leaderboard records every loss as `seed 1337 · loss`. The Best Runs widget
   is doing exactly what it was told. Finding #7.

The remaining items in the feedback (#1 T overlay label, #3 disabled-tooltip
"why", #4 hidden 0-1 floats, #5 threat unit consistency, #8 "Other" /
"Director" / "Blocked" overload, #9 auto-build-queue label, #10 score-rising
copy) are P1/P2 polish — the P0 gate is the engineering-leak, blank-chevron,
and seed-1337 trio plus a verified fix for the T-overlay label cycle.

## 2. Suggestions（可行方向）

### 方向 A: Targeted P0 fixes — leak gate, chevron suppress, seed randomize, T-cycle verify

- 思路：Surgically fix the 3 root causes + verify the T-overlay cycle that A7
  reports broken. Each fix is a 1-3 line edit at a known site:
  (a) gate the `coverage=/mode=/proxy=/model=` footer in
  `AIAutomationPanel.js` behind `isDevMode(state)`;
  (b) gate `.pressure-label::after { content: '\25BE' }` in `index.html` on
  `:not(:empty)` (CSS-only, no JS);
  (c) randomize the boot seed in `createServices.js`/`GameApp` so every fresh
  page load rolls a new seed instead of 1337;
  (d) add a Playwright reproduction test for the T-cycle. The label cycle code
  in `GameApp#toggleTerrainLens` looks correct (MODE_LABELS has 4 entries,
  `#syncTerrainLensLabel` writes `textContent`). A7's symptom — "label always
  reads `Fertility overlay ON`" — most likely reflects `_lastAutoOverlay`
  resyncing the overlay back to "fertility" each time the auto-switch hook
  fires (see `GameApp.js:2229`). Add an integration test that presses T four
  times and asserts the label string changes; if the test fails, the fix is
  to bypass the auto-switch when the user toggled within the last N ms.
- 涉及文件：`src/ui/panels/AIAutomationPanel.js`, `index.html` (CSS only),
  `src/app/createServices.js`, `src/world/grid/Grid.js`,
  `src/app/GameApp.js`, `test/a7-r2-rationality.test.js` (new).
- scope：小
- 预期收益：Closes findings #6, #2, #7 outright; adds a regression test that
  catches future re-leaks of `model=…` strings; verifies #1.
- 主要风险：Randomizing the default boot seed changes the deterministic boot
  state used by ~12 tests that pass `seed: 1337` explicitly. Mitigation:
  randomize ONLY when no seed is in `state.controls.mapSeed` AND
  `state.benchmarkMode !== true` AND no URL `?seed=` is present (existing
  test entry points all set seed explicitly via `regenerateWorld` or
  `createServices(1337)` so test flow is unaffected).
- freeze 检查：OK — no new tile / building / role / mechanic / mood / audio /
  UI panel. Two CSS rule edits, three JS line edits, one new test file.

### 方向 B: Full P0+P1 sweep — also collapse Director/Blocked/Other vocab + add 0-1 affect color cues

- 思路：Direction A plus rename one of the three "Director" subsystems (split
  splash phrase from StrategicDirector / EnvironmentDirector), define
  `Other` filter chip, split `Blocked` for visitor vs worker, and add
  threshold color cues to `Mood/Morale/Social/Rest` floats in InspectorPanel.
- 涉及文件：A's set + `src/ui/panels/InspectorPanel.js`,
  `src/ui/hud/EntityFilters.js`, splash strings in `index.html`, plus a
  vocabulary mapping in a new `src/ui/labels.js`.
- scope：中
- 预期收益：Closes ~12 of 14 unclear-label findings, raising A7 verdict from
  YELLOW(5) toward GREEN(7+).
- 主要风险：Touches many UI surfaces; risks regressing existing tests
  (`hud-controller.test.js`, `entity-names.test.js`,
  `game-state-overlay.test.js`); LOC delta likely 350+, exceeds the
  HARD-freeze 35-min wall-clock budget for a P0 plan. R3 enhancer guidance
  reserves P0 for "small scope / quick landing".
- freeze 检查：OK on freeze (no new mechanics) but the wall-clock and
  test-regression risk push this to P1 territory; not the right shape for
  the 35-min P0 deadline.

## 3. 选定方案

选 **方向 A**。Reasons:
- A7 R2 verdict is YELLOW(5), not RED — the call is for surgical leak-fixes,
  not a full vocab refactor. R1 → R2 already showed +1 from the previous
  enhancer's targeted approach; staying on the same trajectory.
- Direction A lands cleanly in the 35-min budget with ~140 LOC delta, well
  inside the C1 §3 LOC ceiling and inside hard-freeze (no new mechanics).
- Direction B exceeds the budget, fans out across UI surfaces, and risks
  test churn that would invalidate the round if the validator flips red.
- The 3 fixes in A target the **highest-frequency** A7 complaints (every AI
  Log render leaks `model=`; every empty marker frame paints a `▾`; every
  default boot pollutes the leaderboard). Closing them moves the YELLOW
  needle the most per LOC.
- B's polish items become Round-3 candidates if R2 validator stays green.

## 4. Plan 步骤

- [ ] **Step 1**: `src/ui/panels/AIAutomationPanel.js` near line 128-132 —
  `edit` — wrap the `<span class="muted"> coverage=… mode=… proxy=… model=…
  </span>` line in `${isDevMode(state) ? "<span …>…</span>" : ""}`. Import
  `isDevMode` from `../../app/devModeGate.js` at the top of the file. Casual
  players see only `Autopilot ON (rule-based)` without engineering metadata.
  Closes finding #6.

- [ ] **Step 2**: `index.html` line 593-601 — `edit` — change CSS rule
  `.pressure-label::after { content: '\25BE'; … }` to
  `.pressure-label:not(:empty)::after { content: '\25BE'; … }`. Apply the
  same `:not(:empty)` selector to the `[data-anchor="top"]::after`
  upward-triangle rule at line 615-620. CSS-only fix; no JS change. Empty
  pool slots that the renderer leaves on-screen for any reason now stop
  emitting the chevron glyph. Closes finding #2.

- [ ] **Step 3**: `src/world/grid/Grid.js` line 44 — `edit` — keep
  `DEFAULT_MAP_SEED = 1337` as the deterministic-test default, and add an
  exported `pickBootSeed({ urlParams, storage } = {})` helper that returns a
  `Math.floor(Math.random() * 0x7fffffff)` value when no `?seed=` URL param
  and no `localStorage.utopia:bootSeed` is set. Pure function — unit-testable.

- [ ] **Step 4**: `src/app/createServices.js` line 97 — `edit` —
  `createServices(seed = 1337, options = {})` signature is preserved so all
  test call sites (which pass an explicit seed) are unchanged. Add a
  sibling export `createServicesForFreshBoot()` that resolves the seed via
  `pickBootSeed()` and forwards to `createServices(resolvedSeed, options)`.
  GameApp's boot path will switch to this; tests stay on the explicit form.
  - depends_on: Step 3

- [ ] **Step 5**: `src/app/GameApp.js` — `edit` — at the GameApp constructor
  /boot site that calls `createServices`, route through
  `createServicesForFreshBoot()` when `options.benchmarkMode !== true` and
  no explicit seed was supplied. (Locate via `Grep "createServices("` in
  GameApp.js to find the single call site.) Each fresh boot now generates a
  unique seed; the leaderboard records varied seed values. Closes finding #7.
  - depends_on: Step 4

- [ ] **Step 6**: `test/a7-r2-rationality.test.js` — `add` — new test file
  (Node `node:test`) with three assertions:
  (a) `getAutopilotStatus` + `AIAutomationPanel.render` output does NOT
  contain `model=` or `proxy=` substrings when `isDevMode(state)` returns
  false (regression lock for finding #6);
  (b) `pickBootSeed({ urlParams: new URLSearchParams(""), storage: null })`
  returns a value !== 1337 across 5 invocations (regression lock for #7);
  (c) two consecutive calls to `SceneRenderer#toggleTerrainLens` produce
  distinct `MODE_LABELS` strings via `#syncTerrainLensLabel` (regression
  lock for #1; if the assertion fails, the cycle is genuinely broken and a
  follow-up fix is filed; if it passes, A7's symptom was a transient
  auto-switch artefact and is captured in the test).
  - depends_on: Step 1, Step 3

- [ ] **Step 7**: `CHANGELOG.md` — `edit` — add a v0.10.1-A7-r2 bullet group
  under unreleased: "**A7 R2 rationality** — gated AIAutomationPanel
  engineering footer (model=/proxy=) behind isDevMode; pressure-label
  chevron suppressed on empty content (CSS :not(:empty)); fresh-boot seed
  randomized via pickBootSeed() to stop seed 1337 dominating Best Runs;
  added test/a7-r2-rationality.test.js to lock the three regressions."
  - depends_on: Step 5

## 5. Risks

- **Test seed-stability**: existing tests that read `state.world.mapSeed`
  expect 1337 by default. Mitigation: `createServices` keeps its 1337
  default; only the new `createServicesForFreshBoot` randomizes. All
  existing tests continue calling `createServices(1337, …)`. Spot-check
  candidates: `test/start-button-applies-template.test.js`,
  `test/map-generation.test.js`, `test/scenario-family.test.js`.
- **CSS `:not(:empty)` regression**: a label whose textContent is
  whitespace-only (`" "`) is NOT `:empty` in CSS. Renderer writes either
  the resolved label or `el.style.display = "none"` — never whitespace. Low
  risk. Verify in manual smoke (Step "manual" below).
- **AIAutomationPanel template-string error**: ternary inside template
  literal needs careful grouping. Wrap in a `${(() => isDevMode(state) ?
  "…" : "")()}` IIFE if the inline ternary tangles with `escapeHtml`. Low.
- **Leaderboard schema**: existing entries persisted with `seed: 1337`
  remain in `localStorage`. Not a regression — old entries display as
  before; new entries diversify. No migration needed.
- **Possibly-affected tests**:
  `test/hud-autopilot-status-contract.test.js` (already gates on devMode
  so should pass); `test/pressure-lens-label-dedup.test.js` (CSS-only
  change won't affect JS dedup); `test/grid-cache.test.js` (consumes
  Grid.js exports; pickBootSeed is additive).

## 6. 验证方式

- **新增测试**：`test/a7-r2-rationality.test.js` covering:
  - `AIAutomationPanel` render output does not include `model=` /
    `proxy=` strings when `isDevMode(stubState) === false`
  - `pickBootSeed()` returns ≠ 1337 across ≥5 fresh invocations
  - SceneRenderer T-cycle produces distinct mode labels across 4 toggles
- **手动验证**：
  1. `npx vite` → open `http://localhost:5173` (no `?dev=1`).
  2. Confirm AI Automation panel does NOT show `coverage=/mode=/proxy=/
     model=` line. Open `?dev=1` and confirm it reappears.
  3. Drop a single tile to trigger pressure markers; confirm any empty
     `.pressure-label` slot shows zero text and zero `▾`.
  4. Reload page 3 times; confirm `state.world.mapSeed` (visible in
     BuildToolbar's seed input or Inspector) differs each time.
  5. Press T four times in active phase; confirm the label cycles
     "Overlay: Fertility" → "Overlay: Elevation" → "Overlay: Connectivity"
     → "Overlay: Node Health" → off.
- **prod build**：`npx vite build` no errors; `vite preview` 60-second
  smoke (boot → place road → no console error).
- **test suite**：`node --test test/*.test.js` baseline must remain
  ≥1646 pass / 0 fail / 2 skip (per CLAUDE.md v0.10.0 baseline).

## 7. 回滚锚点

- 当前 HEAD: `d242719`
- 一键回滚：`git reset --hard d242719`（仅当 Implementer 失败时由 orchestrator
  触发）

## 8. UNREPRODUCIBLE 标记

Did not boot the running build during enhancer pass — A7 R2 feedback is rich
with screenshots and DOM dumps that establish the symptoms unambiguously, and
the orchestrator deadline is 35 min. The T-overlay label cycle (finding #1)
is the only finding I was unable to fully verify by static read alone — the
code path looks correct (4 distinct mode labels written into
`#terrainLensLabel`), so Step 6 (c) is added as a **belt-and-suspenders
regression test**: if the T cycle truly is broken, the new test fails and
the Implementer files a follow-up before landing. If it passes, A7's
"Fertility ON" observation was a transient auto-switch override (see
GameApp.js:2229 `_lastAutoOverlay` logic) which is informational, not a bug.
