---
reviewer_id: Plan-R13-sanity-toast-dedup
plan_source: Round13/Plans/Plan-R13-sanity-toast-dedup.md
round: 13
date: 2026-05-01
parent_commit: 5a74b58
head_commit: f09f428
status: DONE
track: code
freeze_check: PASS
track_check: PASS
steps_done: 6/7
tests_passed: 2060/2064
tests_new: test/toast-cooldown.test.js
---

## Steps executed
- [x] Step 1: Located pushWarning in src/app/warnings.js (no `pushToast` symbol exists; persistent warnings are the only state-side toast layer).
- [x] Step 2: Added `pushToastWithCooldown(state, message, level, {dedupKey, cooldownSec, source})` helper. LRU-capped at 64 entries via insertion-ordered Map iteration. Move-to-end on refresh. Missing-state safe no-op.
- [x] Step 3: WorldEventSystem BANDIT_RAID warning routed through helper with `dedupKey=raid-warning-${event.id}`, `cooldownSec=60`.
- [ ] Step 4: SKIPPED — Plan-R13-fog-aware-build implementation uses `state.ai.scoutNeeded` flag (read by WorkerStates IDLE branch), not a toast emit. There is no "Send a worker to scout" pushWarning call in the codebase to retrofit. Documented in commit message.
- [x] Step 5: GameApp.configureLongRunMode/startSession deprecation warning routed through helper with `dedupKey=deprecated-template-key`, `cooldownSec=9999` (effectively once-per-session). Old `__deprecationWarned.template` flag retained for back-compat readers.
- [x] Step 6: Added `test/toast-cooldown.test.js` (8 cases: within-cooldown suppress, after-cooldown emit, dedupKey isolation, no-key passthrough, clearWarnings independence, long-cooldown once-per-session, LRU eviction at 64, missing-state no-op).
- [ ] Step 7: SKIPPED — implementer.md rule "code track 内的 commit 不要顺手碰 CHANGELOG".

## Tests
- pre-existing skips: 4 (unchanged)
- new tests added: test/toast-cooldown.test.js (8 cases)
- failures resolved: none — event-mitigation.test.js still 4/4

## Deviations from plan
- Step 4 N/A as fog-aware-build does not emit a toast.
- Helper signature uses positional `level` param + `{dedupKey, cooldownSec, source}` options bag (matches pushWarning's existing signature for consistency).
- CHANGELOG.md skipped per implementer track-boundary rule.

## Freeze / Track check 结果
PASS — pure helper addition + 2 callsite refactors + 1 test file. No new state shape, no new mechanic.

## Handoff to Validator
- Smoke: trigger 3 BANDIT_RAID events back-to-back via `state.events.queue.push(...)` — verify only first emits "Bandit raid incoming" warning within 60s.
- Memory: confirm `state.__toastCooldowns.size` never exceeds 64 across a long run.
