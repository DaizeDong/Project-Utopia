# PFF — R9 Regression Audit

**Reviewer**: PERF-Audit specialist (R11)
**Date**: 2026-05-01
**Mission**: Bisect R9 to find which of its 4 commits caused the ~60% bench regression that R10's validator detected (R8 73.18 → R10 head 29.11).

## Bench bisection results

Bench: `node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 30 --tick-rate 4`

| Commit | Plan | DevIndex (last) | SurvivalScore | Outcome | Days |
| --- | --- | --- | --- | --- | --- |
| `e7fb158` | R8 baseline (PU-hud-honesty) | 31.04 | 8105 | loss | 8 |
| `564a866` | Plan-Honor-Reservation | **43.87** | **26092** | max_days_reached | 30 |
| `2f87413` | **Plan-Cascade-Mitigation** | **28.68** | **7955** | **loss** | **9** |
| `abb0f94` | Plan-Recovery-Director | 28.68 | 7955 | loss | 9 |
| `d2a83b5` | Plan-Eat-Pipeline (R9 ship) | 28.68 | 7955 | loss | 9 |

Note: at `--max-days 30 --seed 42`, R8 baseline itself shows a loss-day-8 outcome (the long-horizon profile reported in the R10 validator at 73.18 was at a longer/different bench window). What matters is the **delta** across R9's chain — and it is unambiguous.

**Plan-Honor-Reservation (564a866) was a major win** (+12 DevIndex, +18 K survival, lifted from loss-day-8 → 30-day max-days survive). Then **Plan-Cascade-Mitigation (2f87413) wiped the win and pushed below R8 baseline** (DevIndex 43.87 → 28.68, survival 26092 → 7955, lost back to a day-9 cliff). The two subsequent commits (abb0f94, d2a83b5) produced **identical numbers** to 2f87413 — they neither helped nor hurt this seed.

**Identified regression commit: `2f87413` — Plan-Cascade-Mitigation.**

## Root-cause hypothesis

The regression lives in `src/simulation/lifecycle/MortalitySystem.js` lines 552–579 (the new "phase-offset" desync block). The intent was to **stretch** the starvation cliff by giving each worker a deterministic ±10s phase offset hashed from `worker.id`, so deaths spread across ~50 sim-sec instead of clustering in ~25 sim-sec. The implementation **does the opposite** for half the population:

```js
const phaseOffset = ((Math.abs(h) % 21) - 10);  // -10 .. +10 sim-sec
entity.starvationSec = Number(entity.starvationSec ?? 0) + phaseOffset;
```

`holdSec` for WORKER is **34 sim-sec** (line 20, `deathThresholdFor`). The shouldDie test is `starvationSec >= holdSec`. So:

- A worker whose id-hash gives `phaseOffset = +10` enters the unreachable-food accumulator with `starvationSec = +10`, and dies in `34 - 10 = 24` sim-sec — **29% earlier than baseline**.
- A worker whose id-hash gives `phaseOffset = -10` enters with `starvationSec = -10`, then accumulates +dt every tick and dies in `34 - (-10) = 44` sim-sec — 29% later (intended).
- Mean across the cohort is unchanged (zero-mean offset), but the *fastest* deaths now arrive **10 sim-sec sooner**, which is enough to fall below the recovery latch's response window before any food can be re-routed. The cohort that should have been the "stretched tail" of the cliff instead becomes a **front-loaded spike**.

In other words: the desync intended to dampen cascades by widening their footprint instead **accelerated the head of the cascade** by 10 sim-sec, which is enough to break the recovery loop's latency budget. The cliff doesn't stretch — it **arrives earlier**, then continues just as steep.

Secondary contributing surface (lower confidence): `ProgressionSystem.maybeTriggerRecovery` now suppresses `actionMessage = "The colony breathes again..."` when `foodHeadroomSec < 20`. The mechanical resource grant still applies, so this is unlikely to affect bench numbers — but worth noting that the `cascadeArming` gate fires on a metric that itself depends on the very cohort that the MortalitySystem change just front-loaded. If `foodHeadroomSec` is computed from live worker count and workers die ~10s earlier, the gate's reading is a moving target.

The HUD chip (`scenarioGoalChips`), the `maybeRecordFamineChronicle` helper, and the test file are all telemetry/UX and cannot affect simulation throughput.

## Suggested fix

**Make the phase offset non-positive only**: change `((Math.abs(h) % 21) - 10)` to `-(Math.abs(h) % 11)`, range -10..0. This preserves the spread (workers die at `holdSec + 0` through `holdSec + 10`), but **never advances** death past baseline. Bench at 564a866 (+44/+26K) should be reachable again.

Alternative: keep the symmetric range but **clamp to non-positive** at apply time:
```js
entity.starvationSec = Math.min(0, Number(entity.starvationSec ?? 0) + phaseOffset);
```

Either fix is a one-line change in `src/simulation/lifecycle/MortalitySystem.js` line 567 or 568.

## Hard-rule compliance

- No commits made.
- No simulation files modified — bisection was checkout-only.
- All bench runs were `--max-days 30` (not 90) per spec, completed without timeout.
- Working tree restored to original state.
