---
plan_id: Plan-R13-chip-label
implementer: subagent (R13 P1)
parent_commit: 54cb911
track: code
priority: P1
date: 2026-05-01
---

# Plan-R13-chip-label — implementation log

## Status

DONE. Commit landed on `main` head. Test baseline preserved: 2018 pass / 1 pre-existing fail / 3 skip (the failing test, `exploit-regression: exploit-degradation`, also fails at parent commit 54cb911 — verified by stashing the patch and re-running `node --test test/exploit-regression.test.js` which produced 5 pass / 1 fail / 1 skip identically).

## Parent → head

- parent: `54cb911` feat(fog-aware-build r13): Plan-R13-fog-aware-build (P0)
- head: see `git log --oneline -2` confirmation below

## Files changed (track=code)

1. `src/ui/hud/HUDController.js` (+~17 LOC) — added `capitalizeChipName(name)` helper (single word + snake_case handling) near the top of file alongside `formatDevDimLabel`; swapped the literal `${chip.name} ` in `#renderGoalChips` chip-name span for `${capitalizeChipName(chip.name)} ` so the rendered chip reads "Farms 3/8" instead of "farms 3/8". Underlying `chip.name` (the lowercase data) untouched so `chip.label`, the `title=` attribute, and dev-mode plain text all keep their existing form.
2. `test/hud-goal-chips.test.js` (2 lines relaxed) — `/warehouses \d+\/\d+/` and `/farms \d+\/\d+/` matchers gained the `/i` flag so both the lowercase legacy form AND the new capitalized form pass.
3. `test/hud-goal-chip-label.test.js` (NEW, ~190 LOC) — regression test asserting (a) chip name span starts uppercase + contains no digits, and (b) chip count span keeps the bare `N/T` text. Reuses the in-process DOM mock pattern from the sibling chip tests so we don't pull in jsdom.
4. `CHANGELOG.md` (+~8 LOC) — added new top entry under `[Unreleased] — v0.10.1-n (R13 Plan-R13-chip-label, P1)`.

Total source delta: ~17 LOC + ~3 LOC test relax + ~190 LOC new test (within plan's ~30 LOC source + ~25 LOC test budget; the larger new-test LOC is the boilerplate DOM mock copied from the sibling `hud-chip-responsive.test.js`).

## Tests

```
node --test test/hud-goal-chip-label.test.js test/hud-goal-chips.test.js test/hud-chip-responsive.test.js
# tests 9
# pass 9
# fail 0
```

Full suite:
```
node --test test/*.test.js
# tests 2022
# pass 2018
# fail 1   (pre-existing exploit-regression: exploit-degradation, verified at parent)
# skipped 3
```

## Acceptance

- [x] Each chip's visible text shows building name + count (e.g. "Farms 3/8") — confirmed by new test asserting `/[A-Z][a-z]+ \d+\/\d+/` over chip textContent.
- [x] Long names use existing flex-wrap fallback — no CSS change needed (existing `.hud-goal-list { gap: 4px; flex-wrap: wrap; min-width: 0 }` handles spacing/overflow; verified visually that the ≤1280 band still hides the verbose name span via the unchanged media block).
- [x] Test baseline preserved (no new failures).
- [x] CHANGELOG.md updated.

## Confirm `git log --oneline -2`

```
06f1745 feat(chip-label r13): Plan-R13-chip-label (P1) — capitalize scenario goal chip name
54cb911 feat(fog-aware-build r13): Plan-R13-fog-aware-build (P0) — autopilot scoutNeeded latch + IDLE worker fog-edge bias
```
