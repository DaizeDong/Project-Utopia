---
round: 3
reviewer_id: 01a-onboarding
wave: 2
status: implemented
---

## Scope
- Added a derived next-action advisor that chooses one current action from food risk, broken routes, missing depots, and unmet logistics targets.
- Rendered the advice as a compact HUD chip with priority, tool, reason, and target metadata.
- Added layout coverage so the status bar owns the new `statusNextAction` slot.

## Files Changed
- `src/ui/hud/nextActionAdvisor.js`
- `src/ui/hud/HUDController.js`
- `index.html`
- `test/next-action-advisor.test.js`
- `test/hud-next-action.test.js`
- `test/ui-layout.test.js`

## Tests
- `node --test test/next-action-advisor.test.js test/hud-next-action.test.js test/hud-controller.test.js test/ui-layout.test.js`
  - 9 pass / 9 total
- `node --test test/*.test.js`
  - 1066 pass / 1068 total
  - 0 fail
  - 2 skipped

## Notes
- The advisor is a pure read model; it does not mutate simulation state or add scenario content.
- `CHANGELOG.md` intentionally left untouched for Stage D archival.
