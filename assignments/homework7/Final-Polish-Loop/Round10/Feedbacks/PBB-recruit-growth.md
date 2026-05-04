# PBB-recruit-growth — Worker Auto-Recruit Never Fires

**Reviewer:** PBB (Playability — Recruit-Growth)
**Round:** R10 / Final-Polish-Loop
**Mode:** STRICTLY BLIND. Direct browser observation via Playwright + `window.__utopia` state introspection.
**Build:** `localhost:19090` preview, `?dev=1`, scenario `alpha_broken_frontier`, AI=ON (LLM mode), timeScale=8.
**User report:** "worker 数量似乎不会 AI 主动增加,是不是限制太严格了"

## TL;DR

**The user is correct, and the gate is more than "too strict" — it is mathematically unsatisfiable in early-mid game.** Across ~80 sim-seconds with autopilot enabled and the LLM driving, **`birthsTotal=0` and `recruitTotal` was never incremented even once**. The `recruitMinFoodHeadroomSec=60s` PC-1/PC-2 gate added in R5 is permanently failing because **`state.metrics.foodProducedPerMin` is hard-wired to 0** — no production-side codepath in the game ever calls `recordResourceFlow(state, "food", "produced", ...)`.

Top blocker: **`foodProducedPerMin` telemetry is broken (always 0)** → `computeFoodHeadroomSec` always reports `food / (workers × 0.6)` ≈ 44s with the default 320 food/12 workers → headroom is **structurally below the 60s gate** regardless of whether the colony is actually thriving.

## Run Setup

- URL: `http://localhost:19090/?dev=1`
- `__utopia.setAiEnabled(true, { manualOverride: true, coverageTarget: "llm" })`
- `state.controls.timeScale = 8` (ultra speed)
- Sampler: every 5 wall-seconds, 34 samples covering sim 0.0s → ~80s

Observed wall-time-to-sim-time ratio at this load: ~5 wall-sec ≈ 1.3-2.7 sim-sec (fps ≈ 1.2 with 8× scale; the project's stutter is real but orthogonal). 80 sim-seconds was sufficient to demonstrate the gate failure mode.

## Worker Count Time Series

| Sim sec | Workers | Food | foodPerMin | foodHeadroomSec | recruitQ | birthsTotal | infraCap | Buildings (wh/fm/lm) | Blocked Reason |
|---|---|---|---|---|---|---|---|---|---|
| 0.0 | 12 | 320.0 | 0.00 | 0.0 (init) | 0 | 0 | — | 0/0/0 | — |
| 9.7 | 12 | 315.6 | 0.00 | **40.5** | 0 | 0 | 15 | 1/0/0 | `food headroom 40s < 60s (auto-fill skipped)` |
| 11.1 | 12 | 315.1 | 0.00 | 40.4 | 0 | 0 | 15 | 1/0/0 | same |
| 14.7 | 12 | 333.7 | 0.00 | 42.8 | 0 | 0 | 15 | 2/0/0 | same (note: food *jumped* +18, proving harvest occurred — but `foodPerMin` still 0) |
| 17.4 | 12 | 332.9 | 0.00 | 42.7 | 0 | 0 | 18 | 2/0/0 | same |
| 20.1 | 12 | 331.9 | 0.00 | 42.6 | 0 | 0 | 18 | 2/1/0 | first farm built — no effect on metric |
| 25.9 | 12 | 328.7 | 0.00 | 42.1 | 0 | 0 | 18 | 2/1/1 | lumber added |
| 47.0 | 12 | 319.8 | 0.00 | 41.0 | 0 | 0 | 18 | 2/1/1 | same |
| 53.4 | 12 | 317.8 | 0.00 | 40.8 | 0 | 0 | 18 | 2/1/1 | same |
| 59.6 | 12 | 316.4 | 0.00 | 40.6 | 0 | 0 | 18 | 2/1/1 | same |
| ~80 | 12 | 308.2 | **0.00** | 39.6 | 0 | **0** | 20 | — | `food headroom 40s < 60s (auto-fill skipped)` |

Final-tick raw accumulator dump (sim ~80s):

```
state._resourceFlowAccum.food = { produced: 0, consumed: 0.27, spoiled: 0.06, recovered: 0 }
state.metrics.foodProducedPerMin = 0          ← always 0
state.metrics.foodConsumedPerMin = 27.36      ← consumption tracked correctly
state.metrics.foodSpoiledPerMin  = 5.56       ← spoilage tracked correctly
state.metrics.foodHeadroomSec    = 39.56
state.metrics.birthsTotal        = 0          ← zero recruits in 80 sim-sec
state.metrics.recruitTotal       = undefined  ← never even initialised
state.controls.autoRecruit       = true       ← gate is ON
state.controls.recruitTarget     = 500        ← effectively unlimited
state.controls.recruitQueue      = 0          ← stuck at 0 forever
state.controls.recruitCooldownSec= 0          ← cooldown is irrelevant; queue never fills
state.metrics.populationInfraCap = 20         ← infraCap is generous
state.metrics.populationGrowthBlockedReason = "food headroom 40s < 60s (auto-fill skipped)"
```

## Per-Recruit-Attempt Outcome

**There were no recruit attempts.** The auto-fill branch in `RecruitmentSystem.update`
(`src/simulation/population/PopulationGrowthSystem.js:196-217`) reaches the PC-1/PC-2
projection check, computes `projectedHeadroom < 60`, sets `populationGrowthBlockedReason`,
and `return`s before incrementing `recruitQueue`. With `recruitQueue=0`, the spawn branch
at line 224 short-circuits on `if (recruitQueue <= 0) return;`. **The cooldown counter
never decrements from a fresh resets because no spawn ever happens** — cooldown stayed at 0.00 throughout.

## Root-Cause Analysis

`computeFoodHeadroomSec` (`src/simulation/population/PopulationGrowthSystem.js:69-77`):

```js
const producedPerMin = Number(state?.metrics?.foodProducedPerMin ?? 0);
const productionPerSec = producedPerMin / 60;
const drainRate = Math.max(0, workersCount) * eatPerWorker - productionPerSec;
if (drainRate <= 0) return Infinity;
return food / Math.max(0.01, drainRate);
```

For 12 workers + 320 food + producedPerMin=0:
- drainRate = 12 × 0.6 − 0 = **7.2 food/s**
- headroom = 320 / 7.2 ≈ **44.4 s**

For headroom to ever ≥ 60s with 12 workers, you need food/drainRate ≥ 60 → drainRate ≤ food/60.
With food=320 → drainRate ≤ 5.33 → producedPerMin ≥ (12×0.6 − 5.33) × 60 = **112 food/min**.

That floor is achievable in principle, but only if `foodProducedPerMin` is actually populated — which it **never is**.

### Grep-confirmed: nothing produces food into the flow accumulator

```
$ rg 'recordResourceFlow.*"food".*"produced"' src/
(no matches)
```

Compare with consumed/spoiled (which work correctly):
- `ResourceSystem.js:390` — `recordResourceFlow(state, "food", "spoiled", spoiled)` ✓
- `ResourceSystem.js:418` — `recordResourceFlow(state, "food", "consumed", actualConsumed)` ✓
- `ProcessingSystem.js:184` — `recordResourceFlow(state, "food", "consumed", foodCost)` ✓ (kitchen input)

Worker farm-deposit path (`WorkerAISystem.js:846`):
```js
state.resources.food += unloadFood;   // ← raw mutation, no recordResourceFlow call
```

The "delta fallback" in `ResourceSystem.js:567-575` only patches *unexplained-negative* food deltas into `consumed`. Unexplained-positive deltas (the entire farm pipeline) are silently dropped from telemetry.

This bug pre-dates R5. R5's PC-recruit-flow-rate-gate weaponised it: before R5 the broken metric was just a HUD curiosity (showing "0 food/min"); now it is the load-bearing gate for population growth.

## Suggested Gate Relaxation (in order of preference)

### Option A (proper fix) — Add the missing `recordResourceFlow` calls

In `WorkerAISystem.js` around line 846 (the warehouse unload path) and any other
path that grows `state.resources.food` (farm-direct deposits in the no-warehouse
bootstrap branch added in v0.8.6 Tier 0), record the produced food:

```js
state.resources.food += unloadFood;
recordResourceFlow(state, "food", "produced", unloadFood);
```

This restores the truth of the metric and the 60s gate becomes meaningful instead of
unsatisfiable. Audit also: meal/medicine/tool/wood/stone/herb production-side flows;
the same pattern likely affects `wood/stone/herbsProducedPerMin` (the loop at
`ResourceSystem.js:586-591` projects them too, presumably with the same zero result).

### Option B (immediate hotfix if A is too risky for R10) — Use a delta-fallback for produced

Mirror the existing consumed-side delta fallback (`ResourceSystem.js:567-575`):
when the unexplained food delta is **positive**, fold it into `accum.food.produced`.
Two-line change.

### Option C (config-level relaxation if neither A nor B lands in time)

Lower `BALANCE.recruitMinFoodHeadroomSec` from 60 to **20** — or, better, gate on
**food stock vs raw drain** instead of headroom. With the broken metric, headroom always
≈ `food / (workers × 0.6)`. So the equivalent food-stock gate is `food ≥ workers × 0.6 × 20 = 144`,
which is satisfied at the default 320 food and lets the colony bootstrap.

### Option D (defensive secondary) — Treat `producedPerMin === 0` as "unknown"

In `computeFoodHeadroomSec`, when `producedPerMin === 0` AND there are farms in
`state.buildings.farms > 0`, fall back to `Infinity` (assume net-positive). This
acknowledges the broken metric without requiring a fix to the production telemetry path.

## Secondary Findings

1. `state.metrics.recruitTotal` is **never initialised** (only incremented inside the spawn branch at `PopulationGrowthSystem.js:262`). Any consumer doing `+ 1` on `state.metrics.recruitTotal` will see `NaN`. Initialise to 0 in `RecruitmentSystem.constructor` or at session start.
2. The R8 hotfix Iter 4 raising `recruitTarget` 16 → 500 is correct and is **not** the bottleneck. `effectiveCap=18-20` is well above current population in this trace.
3. `autoRecruit` defaults to `true` (verified in trace and in `EntityFactory.js:1204`). Not a defaults bug.
4. The 9-second `recruitCooldownSec` (R6 PC) is **never reached** because the queue never fills. So R6 PC pacing is currently dead code in practice.
5. `infraCap` is healthy (15 with one warehouse, 18 with two). The "old 16-cap" memory in CLAUDE.md is fully resolved by R8 Iter 4.

## Files Touched / Referenced

- `C:\Users\dzdon\CodesOther\Project Utopia\src\simulation\population\PopulationGrowthSystem.js` — gate logic, `computeFoodHeadroomSec`
- `C:\Users\dzdon\CodesOther\Project Utopia\src\simulation\economy\ResourceSystem.js` — `recordResourceFlow`, flow window flush at line 579
- `C:\Users\dzdon\CodesOther\Project Utopia\src\simulation\economy\ProcessingSystem.js` — has produced calls for meals/tools/medicine but NOT raw food
- `C:\Users\dzdon\CodesOther\Project Utopia\src\simulation\npc\WorkerAISystem.js:846` — silent food deposit
- `C:\Users\dzdon\CodesOther\Project Utopia\src\config\balance.js:1191` — `recruitMinFoodHeadroomSec: 60`
- `C:\Users\dzdon\CodesOther\Project Utopia\src\entities\EntityFactory.js:1202-1204` — defaults `recruitTarget=500`, `autoRecruit=true`

## Verdict

The user's complaint is **fully validated**. The R5 PC-recruit-flow-rate-gate is functionally a "do not auto-recruit" switch in the early-to-mid game on the default scenario, because the metric it gates on is structurally always 0. Recommended action: **Option A (fix the production telemetry) + Option C (lower the threshold to 20s as belt-and-braces)**, with Option D as a defensive guard. Without one of these landing, no amount of LLM cleverness or building production can grow the colony past 12 workers on this scenario.
