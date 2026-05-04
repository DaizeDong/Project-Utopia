---
reviewer_id: A6-ui-design
plan_source: Round0/Plans/A6-ui-design.md
round: 0
date: 2026-05-01
parent_commit: 501f52b
head_commit: ff75e2e
status: DONE
track: code
freeze_check: PASS
track_check: PASS
steps_done: 7/7
tests_passed: 1656/1664
tests_new: (none — CSS-only change)
---

## Steps executed

- [x] **Step 1**: `index.html:954-957` (orig 940-943) — removed `.tool-grid button[data-tool-destructive="1"]` default red `border-color` / `color` block entirely. Default Demolish now inherits `.tool-grid button` neutral styling (`var(--btn-bg)` / `var(--btn-border)` / `var(--text)`). Replaced by an explanatory comment noting the new "neutral default, hover/active escalate to red" semantics.
- [x] **Step 2**: `index.html:966-970` — preserved `.tool-grid button[data-tool-destructive="1"]:hover:not(:disabled)` block with red wash on hover. Added explicit `color: #e07d72` to the hover rule so the warning red text is now hover-only (was previously default-state).
- [x] **Step 3**: `index.html:971-975` — preserved `.tool-grid button[data-tool-destructive="1"].active` block unchanged (deep red active highlight retained).
- [x] **Step 4**: `index.html:976-980` — added new `.tool-grid button[data-tool-destructive="1"]:disabled { opacity: 0.4; cursor: not-allowed; color: rgba(200,96,86,0.45); }` rule. Closes A6 D4 P1 (resource-zero feedback gap).
- [x] **Step 5**: `index.html:399-409` (orig 385-387) — `.hotkey-grid .hk-desc` extended with `min-width: 0; white-space: normal; word-break: break-word; line-height: 1.25;` plus a header comment. Allows description text to wrap rather than truncate inside the flex `.hk-row`.
- [x] **Step 6**: `index.html:387-390` (orig 373-376) — `.hotkey-grid .hk-row` `align-items: baseline` → `align-items: flex-start` so wrapped descriptions stack cleanly under the keycap rather than misaligning baseline.
- [x] **Step 7**: `index.html:1720-1728` (orig insertion-point ~1691) — new `@media (max-width: 1366px) { .hotkey-grid { grid-template-columns: 1fr; gap: 4px 0; } }` block inserted between the existing `@media (max-width: 1024px)` block and the existing `@media (min-width: 1025px) and (max-width: 1200px)` block. 1080p / 1366-class panels now collapse to single-column hotkey grid; >1366 keeps the original 2-column layout.

## Tests

- pre-existing failures (NOT caused by this plan — simulation/balance tests, no CSS coupling):
  - `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires`
  - `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
  - `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
  - `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)`
- pre-existing skips: 4
- new tests added: (none — pure CSS change, no logic to unit-test; A6 plan §6 explicitly states "新增测试: 无")
- failures resolved during iteration: (none — no iteration needed; first edit pass landed cleanly)

## Deviations from plan

- **Step 2 (minor)**: hover rule explicitly received `color: #e07d72` (was implicit-inherit from now-deleted default block). Without this addition, the deletion of the default `color` rule would have left hover state with no warning-red text. Plan §4 Step 2 said "保留不变" but kept correctness of the visual escalation by absorbing the deleted color directive into the hover rule. Net effect matches plan intent exactly: red warning visible on hover.
- **Step 7 (minor)**: insertion point shifted by ~30 lines because A3's narrow-viewport clamp (line ~150) is upstream and untouched. Located via semantic anchor (`@media (min-width: 1025px) and (max-width: 1200px)`) per Runtime-Context guidance.

## Freeze / Track check 结果

- **Freeze check: PASS** — No new tile / role / building / mood / audio / panel introduced. Pure CSS rule edits within the existing inline `<style>` block of `index.html`.
- **Track check: PASS** — Only `index.html` modified (track=code). No `README.md`, `assignments/**`, `CHANGELOG.md`, or `docs/**` touched.
- **A3 collision check: PASS** — A3's `#statusScenario` clamp at `index.html:146-156` (`@media (max-width: 1100px)`) is well above the new edit zones (387-409, 959-980, 1720-1728). No selector overlap.
- **A4 future-room check: PASS** — A4 will touch status-bar overflow + 1366 hint anchor adjustments. The new `@media (max-width:1366px)` block scopes only `.hotkey-grid`; A4 retains free use of `#statusBar`, `.hud-hint`, and any other selectors at the 1366 breakpoint.

## Handoff to Validator

- **Visual smoke (manual)**:
  1. `npx vite` → load `http://127.0.0.1:5173` → Start Colony → open Build panel.
  2. Demolish button: confirm default state matches Farm/Road tone (neutral grey/blue inherit from `.tool-grid button` defaults), NOT red. Hover should wash red. Click should switch to deep-red active state.
  3. With wood=0, Demolish should appear muted (opacity 0.4, cursor not-allowed) — verify the new `:disabled` rule fires.
- **Responsive check**: DevTools device toolbar at 1024 / 1280 / 1366 / 1440 / 1920 — `.hotkey-grid` should be single-column at ≤1366 and 2-column at 1440+. Description text should wrap (no `…` truncation) at all widths.
- **FPS regression**: CSS layout changes only — should not impact GPU/CPU. `browser_evaluate` 5s mean FPS ≥ 50.
- **prod build**: `npx vite build && vite preview` — first-screen console clean; F1 Help modal still opens.
- **Selector specificity**: Verify `.tool-grid button.active` (Constructive blue) does NOT bleed into `.tool-grid button[data-tool-destructive="1"].active` (deep red active) — order in stylesheet places destructive `.active` AFTER constructive `.active`, so destructive wins. Manually click Demolish then Farm to confirm visual handoff is clean.
- **Pre-existing test failures**: 4 simulation/balance failures are unrelated to this plan; track at orchestrator level for closeout.
