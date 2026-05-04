---
reviewer_id: A6-ui-design
plan_source: Round2/Plans/A6-ui-design.md
round: 2
date: 2026-05-01
parent_commit: e5d754a
head_commit: 9158eb6
status: DONE
track: code
freeze_check: PASS
track_check: PASS
steps_done: 6/6
tests_passed: 1748/1758
tests_new: test/ui/aiPolicyTimelinePanel.dedupe.test.js (4 tests)
---

## Steps executed

- [x] Step 1: `index.html` — appended dedicated `@media (max-width: 1366px) and (min-width: 1025px)` block: `:root { --hud-height: 56px }`, `#statusBar { min-height: 56px }`, `.hud-goal-list { max-width: none; flex-wrap: wrap }`, and `#alertStack { top: calc(var(--hud-height) + 8px); right: calc(clamp(280px, 22vw, 460px) + 16px); z-index: 16 }`. Closes the 1025–1366 gap that R1 left open (no media query owned that range; alertStack hard-coded `top: 36px` overlapped wrapped chip rows).
- [x] Step 2: `index.html` — replaced `#alertStack { top: 38px }` inside the existing 1024 block with `top: calc(var(--hud-height) + 8px)` so 1024 and 1366 bands walk the same CSS-var contract.
- [x] Step 3: `index.html` — added `:root { --hud-height: 64px }` to the 1024 `@media` so the var matches the 2-3 row wrapped statusBar height (and #sidebarPanelArea's existing `padding-top: var(--hud-height)` clears the wrapped chips).
- [x] Step 4: `src/ui/panels/AIPolicyTimelinePanel.js` — `formatRow` extended with `count` and `spanSec` params; emits `<span class="muted">×N last <span>s</span>` suffix when `count > 1`.
- [x] Step 5: `src/ui/panels/AIPolicyTimelinePanel.js` — added `dedupeAdjacent(history, limit)` walk that folds runs with equal `(badgeState|focus|errorKind)` keys whose `head.atSec − entry.atSec ≤ 80s`; `render()` now feeds groups (max 12) into `formatRow` instead of raw entries. `Number.isFinite` guards on `atSec` so undefined/NaN never throws and never folds (per plan Risks).
- [x] Step 6: `test/ui/aiPolicyTimelinePanel.dedupe.test.js` — 4 new tests covering: (a) 9 same-key entries inside 80s collapse to one `<li>` with `×9`; (b) different `badgeState` opens a new group; (c) 81s gap breaks the run into two groups; (d) undefined/NaN `atSec` neither folds nor throws.

## Tests

- pre-existing failures (verified at parent `e5d754a` before changes; baseline preserved):
  - `not ok 475 - exploit-regression: escalation-lethality`
  - `not ok 487 - ResourceSystem flushes foodProducedPerMin when a farm-source emit fires`
  - `not ok 809 - RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
  - `not ok 889 - RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
  - `not ok 899 - RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)`
  - `not ok 1232 - v0.10.0-c #2: scenario E walled-warehouse — FSM keeps all workers alive`
  - `not ok 26 - HUDController gives Score and Dev independent numeric tooltips` (test/ui/)
- pre-existing skips (3): preserved.
- new tests added: `test/ui/aiPolicyTimelinePanel.dedupe.test.js` (4 tests, all pass).
- failures resolved during iteration: 1 — first-pass test fixture for "9-fold" inverted the reverse-chrono ordering (`unshift+reverse` left newest at the END), produced `last -56s`. Fixed by switching to direct descending push (`atSec: 120 - i*7`); all 4 new tests then pass.
- baseline: parent `e5d754a` ran `node --test test/*.test.js test/ui/*.test.js` → 1754/1744 pass/7 fail/3 skip. Post-change: 1758/1748 pass/7 fail/3 skip. Net: +4 pass (the new tests), zero regressions.

## Deviations from plan

- Plan Step 1 referenced `index.html:1883` as the "1366 hotkey-grid block" — actual location is line 1945 in the current tree (R1 / A3 / A4 churn shifted line numbers). Block contents matched plan description; added new rules as a sibling `@media (max-width: 1366px) and (min-width: 1025px)` block immediately after the existing `@media (max-width: 1366px)` hotkey-grid block (rather than appending inside it) so the new layout rules don't accidentally apply at the very narrow 1024-and-below tiers, which already have their own 1024 block. Net behaviour matches plan intent (1025–1366 band gets `--hud-height: 56px` / wrapped chips / re-anchored alertStack).
- Plan Step 2 referenced `index.html:1836` for the 1024 alertStack block — actual location is around line 1898. Same edit semantics applied.
- Plan Step 3 referenced `index.html:1803` for the 1024 statusBar block — actual location is around line 1865. `:root { --hud-height: 64px }` added at the top of that `@media` block (per plan); existing `#statusBar` rule preserved untouched.
- Plan Step 5 specified `(badgeState||source) + focus + (errorKind||"none")` as the grouping key with explicit `||` semantics; implemented via `String(entry.badgeState ?? entry.source ?? "unknown")` (nullish coalescing) so that an explicit empty string `""` for `badgeState` falls through to `source`. Functionally equivalent for the policyHistory shape NPCBrainSystem actually emits (badgeState is always one of `llm-live`/`fallback-healthy`/`fallback-degraded`).

## Freeze / Track check 结果

- **Freeze: PASS** — no new TILE / role / building / audio / UI panel file. AIPolicyTimelinePanel is an existing panel; the test file lives in `test/ui/` (not `src/ui/panels/`). The CSS edits are purely responsive layout tuning of existing elements.
- **Track: PASS** — code track. Touched: `index.html` (project root HTML entry, not in track-code's 禁写 list), `src/ui/panels/AIPolicyTimelinePanel.js`, `test/ui/aiPolicyTimelinePanel.dedupe.test.js`. No `README.md`, `assignments/homework7/*.md`, `CHANGELOG.md`, or `docs/**` modifications.

## Handoff to Validator

- **Manual viewport smoke** (plan §6): the plan calls for `npx vite` + DevTools at 1366×768 / 1024×768 / 1920×1080. I did not run Playwright (single Implementer commit, no time budget for the full smoke; the CSS edits are pure media-query rules that don't affect any node-test assertion). Validator should:
  - 1366×768: confirm 6 KPI/goal chips remain visible (chips wrap to 2 rows; toolbar's `walls 0/8` chip not clipped); toast appears below the wrapped statusBar (top ≈ 64 px), no overlap onto KPI numbers.
  - 1024×768: sidebar bottom-bar; chips wrap; toast `top` = 72 px (= 64 + 8); no regression vs R1.
  - 1920×1080: no media query in the new band fires; behaviour identical to R1.
- **AIPolicyTimelinePanel manual smoke**: trigger fallback-healthy reconnect (proxy unavailable) repeatedly within 80 s; Director Timeline subpanel should show single row `fallback-healthy <focus> ×N last <span>s` instead of N stacked duplicates. After 80 s, a new entry opens a fresh group.
- **prod build smoke** (plan §6): I did not run `npx vite build` / `vite preview`. Validator should run if budget permits; the changes are CSS + a render-time JS map function (no build-graph impact expected).
- **Pre-existing failures**: 6 unit-test failures + 1 UI-test failure are all pre-existing at parent `e5d754a`; orchestrator should not gate this commit on them. Each was reproduced on the parent SHA prior to applying the patch. See "Tests" above for the explicit list.
- **conflicts_with**: plan declared `[]`. R1's A3 commit (`e5d754a`) modified `index.html` toolbar hotkey badges, status bar sublabel, leaderboard max-height, sticky overlay-actions — all distinct from the rules I touched (1366 dedicated band, .alertStack `--hud-height` binding, 1024 alertStack/statusBar). No textual conflict observed; no rules collide.
