---
reviewer_id: PJ-pacing
implementer: R6 implementer 2/6
round: 6
date: 2026-05-01
parent_commit: d62cdf0
priority: P0
track: code
---

# PJ-pacing implementation log

## Status

DONE. Plan executed end-to-end (Steps 1-8): 5 BALANCE.* knobs adjusted, EventDirector first-anchor offset applied, EVENT_STARTED log surface added, 1 existing test updated, 2 new test files added, CHANGELOG entry written, committed.

## Parent → HEAD

- parent_commit: `d62cdf0` (R6 PG-bridge-and-water)
- HEAD: see `git log --oneline -2` confirmation below

## Files changed (track=code)

Source (3):
- `src/config/balance.js` — `raidFallbackScheduler.graceSec` 180→90, flat alias `raidFallbackGraceSec` 180→90, `eventDirectorBaseIntervalSec` 360→90, `eventDirectorWeights.banditRaid` 0.30→0.18, `eventDirectorWeights.animalMigration` 0.25→0.40 (Steps 1-4).
- `src/simulation/meta/EventDirectorSystem.js` — first-anchor `nowSec → nowSec - intervalSec*0.5` (Step 5); `emitEvent(state, EVENT_STARTED, {...})` after `enqueueEvent` (Step 6).
- `src/simulation/meta/GameEventBus.js` — added `EVENT_STARTED: "event_started"` entry to `EVENT_TYPES` registry (Step 6 dependency).

Tests (3):
- `test/event-director.test.js` — updated 1 assertion in "first tick anchor" test for new `nowSec - intervalSec*0.5` formula.
- `test/balance-event-pacing.test.js` (NEW) — 4 invariant locks (Step 7).
- `test/event-director-first-dispatch.test.js` (NEW) — 2 cases: first-anchor offset cadence + event_started log emission (Step 8).

Docs (1):
- `CHANGELOG.md` — `[Unreleased] v0.10.2-r6-PJ` section added at top.

LOC delta (excluding tests + docs): +33 / -5 (~28 net) — within plan target (~25).

## Tests

- New tests: `test/balance-event-pacing.test.js` (4 pass), `test/event-director-first-dispatch.test.js` (2 pass) → 6 / 6 pass.
- Existing event-director suite: 5 / 5 pass after the 1-assertion update.
- Existing raid-fallback suites: 5 / 6 pass on `raid-fallback-scheduler.test.js` (1 pre-existing failure on `popFloor < threshold` test — confirmed-present on parent `d62cdf0`, not caused by PJ-pacing); 3 / 3 pass on `raid-fallback-foodfloor-30.test.js`.
- Full suite: 1867 tests / 1858 pass / 5 fail (all pre-existing on parent — ResourceSystem flush, RoleAssignment quarry, RaidEscalator DI=30, RaidFallback popFloor, Fallback planner recruit-step) / 4 skip. Net +6 passes vs parent baseline. Zero new failures introduced.

## Confirm `git log --oneline -2`

(see commit step below)
