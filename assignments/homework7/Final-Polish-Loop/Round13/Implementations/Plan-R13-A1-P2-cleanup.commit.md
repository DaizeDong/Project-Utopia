---
reviewer_id: Plan-R13-A1-P2-cleanup
plan_source: Round13/Plans/Plan-R13-A1-P2-cleanup.md
round: 13
date: 2026-05-01
parent_commit: 74da308
head_commit: 5a74b58
status: DONE
track: code
freeze_check: PASS
track_check: PASS
steps_done: 5/6
tests_passed: 2060/2064
tests_new: test/r13-a1-p2-cleanup.test.js
---

## Steps executed
- [x] Step 1: Audited configureLongRunMode (line 1443) and startSession (line 2520, the public method `startRun` aliases via main.js shim).
- [x] Step 2: configureLongRunMode + startSession now accept `{templateId}` (canonical) and `{template}` (deprecated). Legacy key forwards via pushWarning gated by `state.__deprecationWarned.template` so it fires once per session.
- [x] Step 3: devStressSpawn @returns JSDoc already comprehensive at lines 1798-1812. Existing return shape `{ok, spawned, total, fallbackTilesUsed}` retained (changing to `spawnedCount` per plan would have broken `test/long-run-api-shim.test.js`); shape pinned via __devForceSpawnWorkers test instead.
- [x] Step 4: Added `#hudWarningsCountPill` (amber, hidden when zero) inside Warning row label. CSS in index.html, populated from `state.metrics.warnings.length` in HUDController.render.
- [x] Step 5: Added `test/r13-a1-p2-cleanup.test.js` (6 cases covering all four (i)-(iv) gates).
- [ ] Step 6: SKIPPED — implementer.md rule "code track 内的 commit 不要顺手碰 CHANGELOG" overrides plan's CHANGELOG step.

## Tests
- pre-existing skips: 4 (unchanged)
- new tests added: test/r13-a1-p2-cleanup.test.js (6 cases)
- failures resolved: none

## Deviations from plan
- devStressSpawn shape kept as `spawned` (not `spawnedCount`) to preserve existing harness contract.
- CHANGELOG.md skipped per implementer track-boundary rule.
- Plan's "pushWarning(state, "deprecated-template-key", message, {dedupKey})" pseudo-code does not match real pushWarning signature (no dedupKey support); implemented via `state.__deprecationWarned.template` flag instead. Plan-R13-sanity-toast-dedup later refactors this to route through pushToastWithCooldown.

## Freeze / Track check 结果
PASS — no new TILE/role/building/audio/UI panel files. Pure cleanup + 1 new HTML pill element + 1 CSS class.

## Handoff to Validator
- Smoke: load index.html, verify warning pill renders amber when warnings present, hidden at 0.
- Manual: `__utopiaLongRun.configure({template: "rugged_highlands"})` should emit one deprecation warning + load the template; second call same key should not re-warn (plan 1 only — overridden by plan 2 cooldown helper afterward).
