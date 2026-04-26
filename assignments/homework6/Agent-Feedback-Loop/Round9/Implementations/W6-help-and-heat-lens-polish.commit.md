---
round: 9
stage: C
wave: W6
plan: help-and-heat-lens-polish
date: 2026-04-26
commit: "pending final Round9 commit"
status: implemented
source: "Round9/Plans/summary.md"
---

# W6 - help-and-heat-lens-polish

## Implementation

- Help modal static HTML now defaults the Controls tab/page to active.
- Help script now uses `setHelpTab()` and makes `openHelp(tabKey = 'controls')` explicit so each open returns to Controls by default.
- `PressureLens` now ranks heat labels by actionable priority and exports `heatLabelBudgetForZoom()`.
- Heat Lens markers carry label priority and hover tooltip details so lower-priority context can remain available without flooding normal zoom.
- `SceneRenderer` applies the zoom-aware heat label budget, sorts visible candidates by rank, tracks hidden label count, and sets titles for visible labels.
- `SceneRenderer` also caps fallback instanced mesh counts to GPU buffer capacity, raises worker fallback capacity to 1200 for the 1000-stress-worker control, lowers high-load pixel ratio, and throttles entity matrix refresh under stress.

## Files

- `index.html`
- `src/render/PressureLens.js`
- `src/render/SceneRenderer.js`
- `test/help-modal.test.js`
- `test/heat-lens-label-budget.test.js`

## Validation Evidence In Diff

- Added Help modal tests proving Controls is the static default and `openHelp()` defaults to Controls.
- Added Heat Lens tests for label ranking, normal-zoom label budget, SceneRenderer budget wiring, fallback instancing capacity, and high-load entity refresh throttling.
