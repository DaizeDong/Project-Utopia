# Plan-PN-test-triage — Implementation Log

**Implementer:** R7 implementer 3/5 — PN-test-triage
**Date:** 2026-05-01
**Status:** SUCCESS — single commit, all 5 pre-existing failures resolved

## Parent → Head

- Parent: `25e846c` (perf(arch r7): PM-delete-animal-combat-metrics-twin)
- Head: see `git log --oneline -2` confirmation below.

## Files Changed (8 files, ~+55 / -25 LOC)

**Test files (5, surgical edits):**
- `test/food-rate-breakdown.test.js` — spoilage threshold `< 2` → `< 3` at lines :69 and :96 (tracks v0.10.1-j live `warehouseFoodSpoilageRatePerSec = 0.0003/s`).
- `test/raid-fallback-scheduler.test.js` — dropped stale `?? 18` fallback, replaced with live-config read + `Number.isFinite` guard; `primeStateForFallback` helper now truncates oversize agent lists (initial pop=12 was masking the popFloor=8 case after live `BALANCE.raidFallbackPopFloor = 10` retune).
- `test/recruitment-system.test.js` — primed `state.metrics.foodProducedPerMin = 600` to satisfy v0.10.1 R5 PC food-headroom gate.
- `test/phase1-resource-chains.test.js` — primed `state.resources.stone = 25` to clear v0.8.5 urgent-stone override; relaxed assertion from `equal(stoners, 1)` to `>= 1` since perWorker formula at pop=12 naturally gives 2 STONE slots.
- `test/raid-escalator.test.js` — DI=30 tier assertion 3 → 5; intensity formula `1+3×perTier` → `1+5×perTier`; test renamed to reflect v0.10.2 `devIndexPerRaidTier 15 → 8` retune.

**Source docstrings (2, non-functional):**
- `src/simulation/meta/RaidEscalatorSystem.js:59-67` — log-curve example table refreshed for `devIndexPerRaidTier = 8`.
- `src/config/balance.js:236-239` — `warehouseFoodSpoilageRatePerSec` docstring rate `0.00011/s` → `0.0003/s`.

**Plus:** CHANGELOG.md entry under v0.10.2-r7-PN.

## Test Results

- 5 target files (pre-fix): 59 pass / 5 fail / 0 skip
- 5 target files (post-fix): **64 pass / 0 fail / 0 skip**
- Full suite: **1916 pass / 0 fail / 4 skip** across 1920 tests (was 1911 pass / 5 fail / 4 skip on parent `25e846c`)
- Net: +5 pass, -5 fail. Zero new failures introduced.

## Notable Plan Adjustments

The plan's `state.resources.stone = 25` prime alone wasn't sufficient for the phase1 quarry test. At initial pop=12 with `stonePerWorker = 1/5`, the perWorker formula gives `floor(12 × 0.2) = 2` STONE slots regardless of stockpile. The fix required also relaxing the test assertion to `>= 1` (preserving the test intent: "STONE workers assigned when 1 quarry exists"). Similarly, `raid-fallback-scheduler.test.js` needed its `primeStateForFallback` helper to TRUNCATE oversize agent lists (`state.agents.length = pop`) — the original helper only grew, so initial pop=12 stayed at 12 even when caller requested pop=8.

## Confirmation

`git log --oneline -2` output is included in the parent task report.
