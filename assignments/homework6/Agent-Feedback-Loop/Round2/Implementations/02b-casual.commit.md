---
round: 2
reviewer_id: 02b-casual
wave: 2
commit: 2dff83d
parent_commit: 4edd744
tests: 1038/1040 pass, 2 skipped, 0 failed
---

## Summary
- Added `metrics.resourceEmptySec` tracking for food/wood and snapshot defaults.
- Expanded death event payloads with tile/world coordinates and empty-food duration.
- Wired `SceneRenderer` event toasts for death and `COLONY_MILESTONE`, added milestone toast styling, and guarded HUD obituary duplication.
- Added primary resource sublabels for Food/Wood/Stone/Herbs/Workers.

## Verification
- `node --test test/hud-death-toast-event.test.js test/hud-resource-sublabel.test.js test/progression-milestone.test.js test/milestone-emission.test.js test/hud-death-alert.test.js test/hud-controller.test.js test/snapshot-service.test.js`
- `node --test test/*.test.js`

## Notes
- Reused the single `01a` milestone detector; no second detector path was introduced.
- No new mechanic, resource, tile, building, or asset was added.
