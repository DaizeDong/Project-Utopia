---
round: 2
reviewer_id: 01a-onboarding
wave: 2
commit: 4edd744
parent_commit: d912248
tests: 1033/1035 pass, 2 skipped, 0 failed
---

## Summary
- Added a single `ProgressionSystem` milestone detector for first farm, lumber, extra warehouse, kitchen, meal, and tool milestones.
- Stored milestone baseline/seen state under `state.gameplay` as snapshot-safe arrays/objects.
- Rendered recent `COLONY_MILESTONE` events as a short storyteller-strip flash without adding a second detector path.

## Verification
- `node --test test/milestone-emission.test.js test/progression-system.test.js test/snapshot-service.test.js test/hud-controller.test.js`
- `node --test test/*.test.js`

## Notes
- Scenario bootstrap counts are treated as baseline, so existing starting farms/lumbers do not emit fake first-build events.
- This commit intentionally leaves `COLONY_MILESTONE` styling/spatial toast polish for `02b-casual`.
