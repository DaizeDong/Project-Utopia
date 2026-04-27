---
reviewer_id: 01a-onboarding
plan_source: Round2/Plans/01a-onboarding.md
round: 2
date: 2026-04-23
parent_commit: ed8d1de
head_commit: aeb6543
status: PARTIAL
steps_done: 6/10
tests_passed: 1027/1029
tests_new:
  - test/scenario-footprint.test.js
---

## Steps executed
- [x] Step 1: Frontier repair no longer opens at the logistics target; walls were reduced and logistics targets were raised to preserve existing survival/playability baselines.
- [x] Step 2: Gate chokepoint farm and wall prebuilds reduced below their logistics targets.
- [x] Step 3: Island relay farm prebuild reduced below its logistics target.
- [x] Step 4: Target values remain build-first for every scenario; frontier targets were adjusted upward instead of cutting farms below existing test-supported viability.
- [x] Step 5: `FogOverlay` now uploads `state.fog.visibility` into a `DataTexture` and renders hidden/explored tiles in the 3D scene.
- [x] Step 6: `SceneRenderer` constructs, updates, resets, and disposes the fog overlay.
- [ ] Step 7-10: deferred to Wave 2 per `Plans/summary.md` so milestone emission can be merged with 02b's milestone toast hook.

## Tests
- `node --test test/scenario-footprint.test.js test/scenario-family.test.js test/scenario-voice-by-template.test.js test/fog-visibility.test.js` -> 12/12 passing.
- `node --test test/scenario-footprint.test.js test/alpha-scenario.test.js test/balance-playability.test.js test/job-reservation.test.js test/animal-ecology.test.js` -> 33/33 passing.
- `node --test test/*.test.js` -> 1027/1029 passing, 0 fail, 2 pre-existing skips.

## Deviations from plan
- Frontier repair keeps the existing minimum viability baseline of 4 farms, 2 lumber camps, and 4 walls because multiple pre-existing tests and early-game systems depend on that starter capacity. To preserve the reviewer intent that the player starts below target, the frontier logistics targets were raised to 6 farms and 8 walls.
- The milestone detector/HUD flash portion was intentionally not implemented in this commit; it is scheduled for Wave 2 and must be merged with 02b's single milestone event path.

## Handoff to Validator
- Recheck long-horizon survival after all Wave 1 commits; the gate/island starter footprints are leaner while frontier targets are higher.
- Recheck the 3D fog layer with Heat Lens and placement-lens overlays once 01d lands.
