---
reviewer_id: A6-ui-design
round: 3
status: green
parent_commit: 668b6e8
head_commit: ffa012f
track: code
plan: assignments/homework7/Final-Polish-Loop/Round3/Plans/A6-ui-design.md
---

## Status

GREEN. P0 #1 (1366×768 chip clipping) closed; P1 #2 (disabled-button
tooltip), P1 #4 (toast z-order vs EntityFocus), P1 #6 (themed scrollbar)
also closed in the same commit. Hard-rule "track=code only, one commit"
satisfied — no Process-Log / Post-Mortem / Plan files touched.

Parent → Head: `668b6e8` → `ffa012f`.

## Files

- `src/ui/hud/HUDController.js` (+18/-1) — `scenarioGoalChips()` returns
  `name`+`count` fields; `#renderGoalChips` emits `<span class="hud-goal-chip-name">`
  + `<span class="hud-goal-chip-count">` and sets chip `title=` to the
  full label.
- `src/ui/tools/BuildToolbar.js` (+59/-0) — exported new pure helper
  `describeBuildToolCostBlock()` returning "Need 5 wood (have 0)"
  strings; cost-blocked sync loop caches original button title in
  `data-cost-title-original` and writes the deficit; un-blocking
  restores the cache.
- `index.html` (+48/-0) — extended 1366+1025 media block with
  `min-width:0` + tighter chip font; new 1280+1025 block hides
  `.hud-goal-chip-name` (icon-only collapse); wildcard themed
  scrollbar (8 px, rgba(58,160,255,0.28)) + Firefox shorthand;
  documented `#floatingToastLayer` z:25 contract vs `#entityFocusOverlay` z:12.
- `test/hud-chip-responsive.test.js` (+212/-0, NEW) — 4 static CSS
  contract assertions against `index.html` + 1 live HUDController
  DOM-shape assertion (each chip emits the two spans + title=).
- `CHANGELOG.md` (+44/-0) — added A6 entry describing all 5 fixes.

## Tests

- New: `test/hud-chip-responsive.test.js` — 5 points, all pass.
- Full suite: 1767 / 1758 pass / 6 fail / 3 skip.
- Parent baseline: 1762 / 1753 pass / 6 fail / 3 skip.
- Net: **+5 pass, 0 regressions**. Identical fail set (escalation-lethality,
  foodProducedPerMin flush, RoleAssignment-1-quarry, RaidEscalator DI=30,
  RaidFallbackScheduler popFloor, FSM scenario E walled-warehouse — all
  pre-existing per R3 baseline; carried since v0.10.1-i / v0.8.5).

## Hard-rule compliance

- track=code: only `src/`, `index.html`, `test/`, `CHANGELOG.md` touched.
  No Process-Log / Plan / Post-Mortem updates.
- One commit: `ffa012f` (single commit on top of `668b6e8`).
- Reviewer freeze respected: no new panels, roles, or game mechanics —
  pure CSS / DOM-shape / tooltip surfacing.
