---
reviewer_id: 01c-ui
plan_source: Round2/Plans/01c-ui.md
round: 2
date: 2026-04-23
parent_commit: 7065647
head_commit: ed8d1de
status: DONE
steps_done: 10/10
tests_passed: 1026/1028
tests_new:
  - test/hud-death-alert.test.js
  - test/hud-goal-chips.test.js
---

## Steps executed
- [x] Step 1: Added red death toast styling and death-specific toast animation.
- [x] Step 2: Added `#alertStack` for fixed HUD death alert stacking.
- [x] Step 3: Converted casual scenario progress into goal-chip styling.
- [x] Step 4: Tightened scenario/action max-width rules with viewport-aware limits.
- [x] Step 5: Added 1025-1200 mid-compact rules and 1024-and-below guards.
- [x] Step 6: Exposed `SceneRenderer.spawnDeathToast(...)` over the existing floating toast layer.
- [x] Step 7: HUD death count increments now push alert-stack entries, severity styling, and renderer death toasts once per new death.
- [x] Step 8: Casual HUD scenario progress now renders structured done/pending chips; dev profile remains plain text.
- [x] Step 9: Added death alert regression coverage.
- [x] Step 10: Added casual goal chip regression coverage.

## Tests
- `node --test test/hud-death-alert.test.js test/hud-goal-chips.test.js` -> 3/3 passing.
- `node --test test/hud-controller.test.js test/hud-latest-death-surface.test.js test/ui/hudController.casualScoreBreakGate.test.js test/toast-title-sync.test.js test/ui-layout.test.js` -> 12/12 passing.
- `node --test test/*.test.js` -> 1026/1028 passing, 0 fail, 2 pre-existing skips.

## Deviations from plan
- The death alert text uses ASCII separators (`died - reason`) to avoid introducing new non-ASCII copy.
- The world-position death pulse reuses the existing floating toast layer; no new render mesh or mechanic was introduced.

## Handoff to Validator
- Recheck `#statusBar` overflow at 1024, 1200, and 1366 once Wave 2 adds resource sublabels and the top-bar autopilot toggle.
- Recheck that 02b only subscribes to death/milestone events and calls the `spawnDeathToast` API without redefining it.
