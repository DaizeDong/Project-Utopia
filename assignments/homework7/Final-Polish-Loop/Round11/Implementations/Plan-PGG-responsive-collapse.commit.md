---
plan: Plan-PGG-responsive-collapse
implementer: R11 implementer 3/6
date: 2026-05-01
parent_commit: 474c50f
track: code
status: shipped
---

# Plan-PGG-responsive-collapse — Implementation Log

## Status

Shipped. CSS-only patch in `index.html` adds a single `@media (max-width: 1440px) and (min-width: 1025px)` block (~60 LOC) wedged just above `</style>` at line 2470. Three coordinated rules:

1. **Sidebar → 60 px icon-rail.** `#wrap.sidebar-open #sidebar` pins `--sidebar-width: 60px` (= 36 px tab strip + 24 px panel-edge sliver). `#sidebarPanelArea` opacity 0 + `pointer-events: none`. `:hover` / `:focus-within` restores the prior `clamp(280px, 22vw, 460px)` + opacity 1. The existing CSS already wires the sidebar's transform contracts off `--sidebar-width`, so the collapse rides along automatically. `#statusBar` and `#alertStack` right-edges retargeted to the 60 px rail.
2. **Entity Focus translucent.** `#entityFocusOverlay` background swapped from solid `var(--panel-bg)` → `rgba(20, 28, 40, 0.62)`; `backdrop-filter` bumped 8 px → 10 px. `-webkit-backdrop-filter` mirror added.
3. **Topbar `#statusObjective` demoted.** `display: none` inside `#statusBar`. The Run-time data is still globally visible via `#gameTimer` (top-right speedControls) and Day-N via `#colonyHealthDay` in the Colony tab; Score/Dev were already globally hidden (line 194-195) so nothing else is lost.

Plan Step 4 (conditional add of run-status block to Colony tab) was skipped — the data is already redundantly available, per the plan's Step 2 contingency.

## Files Changed

- `index.html` — +63 LOC inside `<style>` (one new `@media` block + comment header)
- `CHANGELOG.md` — new v0.10.1-n entry above the existing Plan-PGG-sphere-dominance entry

No source files in `src/` touched. No tests added (CSS-only).

## Tests

Full suite green at the v0.10.1-n baseline:

```
# tests 1985
# pass 1981
# fail 0
# skipped 4
```

Identical to pre-fix counts. The `@media` rule fires only at 1025-1440 px viewports, which no test fixture asserts against.

## Parent → Head

- Parent: `474c50f` (ux(render r11): Plan-PGG-sphere-dominance — sphere 0.42 + halo + glyph 0.75 + grid hairlines)
- Head: see CONFIRM block below

## CONFIRM `git log --oneline -2`

```
0fe2b9c ux(responsive r11): Plan-PGG-responsive-collapse — <1440px sidebar 60px rail + entity-focus blur + topbar Run-timer demote
474c50f ux(render r11): Plan-PGG-sphere-dominance — sphere 0.42 + halo + glyph 0.75 + grid hairlines
```
