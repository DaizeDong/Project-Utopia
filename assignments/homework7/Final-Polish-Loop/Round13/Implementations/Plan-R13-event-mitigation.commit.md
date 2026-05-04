---
plan_id: Plan-R13-event-mitigation
round: 13
priority: P0
track: code
parent_commit: a1a501f
implementer: 2/11
date: 2026-05-01
---

# Plan-R13-event-mitigation — implementation log

## Status

DONE — committed. Track=code only (no plan/feedback authoring). All four acceptance criteria met.

## Parent → Head

- Parent: `a1a501f` (R13 Plan-R13-fog-reset, P0)
- Head:   see `git log --oneline -2` confirmation below

## Files

**Source (2):**
- `src/config/balance.js` — +12 LOC. Adds `eventPreWarningLeadSec=30`, `eventPreparednessFullCapAtWalls=12`, `eventPreparednessGuardWeight=1.5`, `eventPreparednessMaxMitigation=0.7` with R13 commentary block.
- `src/world/events/WorldEventSystem.js` — +~50 LOC net. Adds `computePreparednessFraction(state)` helper, queue-deferred spawn for BANDIT_RAID via `_spawnAtSec` field, single-fire warning toast via `_warningEmitted` dedup, and `(1 - prepFraction)` multiplier on three drain paths (raid food/wood, fire food/wood/stone/herbs, vermin food).

**Tests (1 new + 5 modified):**
- `test/event-mitigation.test.js` — NEW (+~150 LOC, 4 cases): warning emits exactly once per raid lifecycle; raid stays queued for the lead window then drains; full-prep colony takes ≤50% of zero-prep drain; over-prep (50 walls + 20 guards) caps at 70% mitigation and does not zero damage.
- `test/world-event-spatial.test.js`, `test/world-explain.test.js` (×2 sites), `test/pr-r8-resource-drain-cap.test.js`, `test/pressure-lens.test.js`, `test/survival-scaling.test.js` (×3 sites) — 1-line `state.events.queue[0]._spawnAtSec = 0` opt-out per test that pre-dates the warning lead.

**Docs:**
- `CHANGELOG.md` — entry under unreleased v0.10.1-n.

## Design pivot from plan

Plan §4 Step 3 proposed extending the lifecycle `prepare` phase from 1s → 30s. That broke 4 existing tests because they expected `system.update(1.1, state)` to land the raid in `active`. Pivoted to a queue-deferred spawn model: BANDIT_RAID stamps `_spawnAtSec = currentSec + 30s` and stays in the queue until the scheduled time. Existing tests opt out via `_spawnAtSec = 0`. Functionally identical from the player's POV (30 sim-sec gap between warning and damage); cleaner boundary because the lifecycle phases keep their existing semantics.

## Tests

Full suite: **2012 pass / 0 fail / 4 skip** (parent baseline 2008 / 0 / 4; +4 from the new mitigation tests). Per-test impact zone (12 related tests): 52/52 pass.

## CONFIRM `git log --oneline -2`

```
8918bb1 feat(events r13): Plan-R13-event-mitigation (P0) — 30s pre-event warning + preparedness-capped intensity
a1a501f fix(fog-reset r13): Plan-R13-fog-reset (P0) — clear fog state on regenerate
```

Head: `8918bb1`. Parent: `a1a501f` (matches plan rollback anchor's chain).
