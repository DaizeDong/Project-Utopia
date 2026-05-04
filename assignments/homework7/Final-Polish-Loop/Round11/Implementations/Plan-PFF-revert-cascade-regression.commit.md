---
plan: Plan-PFF-revert-cascade-regression
implementer: R11 implementer 1/6
priority: P0 CRITICAL
parent_commit: 652220f
track: code
status: COMPLETE
---

# Plan-PFF-revert-cascade-regression — Implementation Log

## Status

COMPLETE — all 3 plan acceptance gates met, 4 plan steps executed (Steps 1–6 minus the bench step 5 was a verify, not a write).

## Parent → Head

- parent: `652220f` (R10 Plan-PEE-goal-attribution)
- head: `36a1f9e` (R11 Plan-PFF-revert-cascade-regression — see CONFIRM block below)

## Files changed

- `src/simulation/lifecycle/MortalitySystem.js` — line 567 operator + range fix (+4 / -1 LOC including expanded inline comment). Symmetric `((Math.abs(h) % 21) - 10)` (range -10..+10) → strictly non-positive `-(Math.abs(h) % 11)` (range -10..0). Cohort-spread design intent preserved; regressive half eliminated by construction.
- `test/mortality-phase-offset-non-positive.test.js` — NEW, 73 LOC, 4 test cases. Mirrors id-hash derivation literally; iterates 1024 string ids + 1024 numeric ids + 4096 distribution-coverage ids; asserts `-10 <= phaseOffset <= 0` for every one. Visitor-safe id (empty/null/undefined) → 0. Distribution coverage ≥8 of 11 buckets.
- `CHANGELOG.md` — new top-most `[Unreleased] — v0.10.1-n` section explaining the regression, the fix, the bench numbers, and why Suggestions B/C/D were not taken.

## Tests

- New invariant suite: 4 / 4 pass, 0 fail (~88 ms).
- Full suite: **1981 pass / 0 fail / 4 skip** (1586 top-level tests across 120 suites; +4 from the new invariant test, **0 net regression** vs. parent baseline).
- No pre-existing tests pinned the exact post-offset starvationSec of a specific worker id (clean bisection per the audit), so the operator change was safe with no test relaxations needed.

## Bench verification

`node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 30 --tick-rate 4`:

| Metric | Pre-fix (`2f87413`) | Target | Post-fix (this commit) | `564a866` baseline |
| --- | --- | --- | --- | --- |
| outcome | `loss` @ day 9 | `max_days_reached` | **`max_days_reached` @ day 30** ✓ | `max_days_reached` @ day 30 |
| DevIndex(last) | 28.68 | ≥ 40 | **44.45** ✓ | 43.87 |
| SurvivalScore | 7 955 | ≥ 20 000 | **26 694** ✓ | 26 092 |

All three plan acceptance gates met; post-fix numbers actually slightly exceed `564a866`'s pre-regression baseline. The `passed=false` flag in bench output reflects the bench harness's separate population/death thresholds — independent of this plan's gates.

## CONFIRM `git log --oneline -2`

```
36a1f9e fix(lifecycle r11): Plan-PFF-revert-cascade-regression — clamp starvation phase-offset to -10..0
652220f ux(milestone r10): Plan-PEE-goal-attribution — depot-aware "first warehouse" toast (drop "first extra" misnomer)
```
