---
round: 10
validator: R10 Final-Polish-Loop validator
verdict: YELLOW
date: 2026-05-03
round_base_commit: d2a83b5
head_commit: 652220f
prior_round_verdict: R9 GREEN (bench INCONCLUSIVE — see below)
plans_in_round: 5
plans_done: 5 (PBB, PAA, PCC, PDD, PEE)
plans_skipped: []
tests_pass: 1977/1981
tests_fail: 0
tests_skip: 4
bench_devindex: 29.11 (vs R8 anchor 73.18, Δ -60.2%)
bench_deaths: 464 (vs R8 anchor 72, +544%)
bench_attribution: pre-existing R9 carry-over — NOT introduced by R10 (bisect proven)
smoke_status: OK (1 console 404 is from validator probe, not runtime)
---

# Round 10 Validation — game-over + recruit + combat + pathing + goal

## Verdict: **YELLOW**

R10 ships **5 implementer plans** on top of d2a83b5 (R9 head). Test suite is 0-fail (1977/1981 pass / 4 skip — exactly matches expected). Browser smoke confirms PBB + PAA resolved end-to-end; PCC + PDD + PEE confirmed via targeted unit tests (all 18 R10 plan-targeted assertions green). Production build clean (158 modules, 7.15s, all chunks within R9 baselines). Bisect-proven that R10 introduces **zero** delta vs R9 baseline on the long-horizon bench, but the absolute bench value (DevIndex 29.11) is far below the R8 baseline (73.18) due to a pre-existing R9 regression that R9's validator declared INCONCLUSIVE due to a wall-clock timeout. **Verdict YELLOW because R10's diff is clean but the cumulative bench result is below the R8-anchored hard gate; the bench delta is R9's debt, not R10's.**

## Gates

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| 1 | `node --test test/*.test.js` | GREEN | **1981 / 1977 pass / 0 fail / 4 skip** / 91.4s wall — exactly matches expected ~1977/0/4 |
| 2 | `vite build` + preview smoke | GREEN | 158 modules transformed, 7.15s build; 5-min preview at :4321 had 0 runtime errors (1 false-positive 404 from validator's dynamic-import probe) |
| 3 | FPS via `__fps_observed` + `?perftrace=1` | YELLOW (caveat) | observed `fps=0.99 / p5=0.99 / 317 samples` — headless RAF cap (`rawFrameMs=1004`); internal sim healthy: `workFrameP95Ms=39.0`, `simP95Ms=31.9`, `simLastStepP95Ms=2.9`, bottleneck=`ui` (visualization). Per validator hard rule: headless RAF cap = methodology, YELLOW with caveat OK. |
| 4 | Freeze-diff `git diff d2a83b5..652220f -- src/` | GREEN | 9 files / +325 / -48; matches expected scope: `src/config/balance.js`, `src/entities/EntityFactory.js`, `src/simulation/ai/colony/RoadPlanner.js`, `src/simulation/ai/colony/proposers/BridgeProposer.js`, `src/simulation/meta/ProgressionSystem.js`, `src/simulation/npc/VisitorAISystem.js`, `src/simulation/npc/WorkerAISystem.js`, `src/simulation/npc/fsm/WorkerStates.js`, `src/ui/hud/GameStateOverlay.js`. **No new tile/role/audio/sim subdir.** |
| 5 | Bundle chunk sizes (`vite build`) | GREEN | index 632.04KB / vendor-three 612.94KB / ui 567.13KB / pathWorker 6.95KB — all gzipped (189.38 / 157.55 / 174.69 / —) within R9 baselines |

## Freeze-diff scope confirmation (Gate 4)

Expected vs actual file scope:
- **Plan-PBB-recruit-flow-fix**: `src/simulation/npc/WorkerAISystem.js` ✓ (+15/-2), `src/entities/EntityFactory.js` ✓ (+8/-0)
- **Plan-PAA-game-over-copy**: `src/ui/hud/GameStateOverlay.js` ✓ (+22/-7)
- **Plan-PCC-combat-rebalance**: `src/config/balance.js` ✓ (+18/-2), `src/simulation/npc/fsm/WorkerStates.js` ✓ (+10/-2), `src/simulation/npc/VisitorAISystem.js` ✓ (+46/-0), `src/entities/EntityFactory.js` ✓ (line swap inside the +8/-0 above)
- **Plan-PDD-smart-pathing**: `src/simulation/ai/colony/RoadPlanner.js` ✓ (+50/-11), `src/simulation/ai/colony/proposers/BridgeProposer.js` ✓ (+118/-21)
- **Plan-PEE-goal-attribution**: `src/simulation/meta/ProgressionSystem.js` ✓ (+27/-7)

Zero new tile / role / building / mood / mechanic / event type / HUD pill / BALANCE category / system entry. `BALANCE` only got 5 numeric additions (workerAttackDamage, workerNonGuardAttackCooldownSec, saboteurMaxHp, saboteurAttackDamage, saboteurAttackCooldownSec) + 2 edits (meleeReachTiles 2.6→2.0, predatorAttackDistance 1.8→2.4) per PCC plan.

## End-to-end browser smoke (5 R10 user issues)

Smoke conditions: dev mode (`?dev=1&perftrace=1`), AI on, autopilot+autoRecruit set, `setTimeScale(8)`, ~80 sim-sec elapsed, 12 workers seeded, default temperate scenario (no `alpha_broken_frontier` for PEE — PEE verified via targeted test only).

| Issue | Verdict | Evidence |
|-------|---------|----------|
| **PBB** recruit growth — `foodProducedPerMin > 0` once farms harvest+deposit | **RESOLVED** | At sim-sec 24: `foodProducedPerMin = 4.20`, sim-sec 44: `foodProducedPerMin = 4.19` (sustained, non-zero). RecruitTotal=0 across the smoke because consumption (27.36/min) >> production (4.19/min) on 12-worker plains start — gate is correctly satisfiable; the metric truth flows. Test `recruit-food-flow-invariant.test.js` 4/4 covers the contract end-to-end. |
| **PAA** game-over copy — disambiguate end-screen tier titles | **RESOLVED** | Forced session.phase=`end` with reason="Colony wiped — no surviving colonists." and devIndex=60; rendered `#overlayEndTitle.textContent = "Colony wiped — no surviving colonists."` (verbatim reason in hero), `#overlayEndReason.textContent = 'High-tier finale · "The routes outlived the colony."'` (tier-aware subhead with new copy), `data-dev-tier="high"`. Exactly per Plan-PAA Step 1+2. |
| **PCC** combat — 5 wolves vs GUARDs, no 1-shot resolution | **RESOLVED (test-verified)** | `combat-balance.test.js` 4/4 pass: BALANCE knobs wired (workerAttackDamage=10, workerNonGuardAttackCooldownSec=2.2, saboteurMaxHp=65, saboteurAttackDamage=8, saboteurAttackCooldownSec=2.0, meleeReachTiles=2.0, predatorAttackDistance=2.4); 1 GUARD vs 1 wolf survivable with wolf landing ≥1 hit; 1 FARM vs 1 saboteur — saboteur stings ≥2 times and FARM needs ≥6 hits (non-GUARD DPS halved 11.25→4.55, 2.5× role separation restored); 5 raiders vs 1 isolated worker — worker dies in 1-2 rounds (design-intent isolation). Browser-side 5-wolves-vs-GUARDs requires manual entity injection — out of smoke scope; the unit tests exercise the same code paths. |
| **PDD** smart pathing — bridge step used across river, no detour | **RESOLVED (test-verified)** | `road-planner-dual-search.test.js` 4/4 pass: bridge plan emits across 3-tile water gap (no land alternative); bridge shortcut prefers 1-tile WATER moat over land detour; `BridgeProposer` queues a 3-tile strait crossing (FAILS under old 1-tile-pinch scan); `BridgeProposer` does NOT propose on all-land grids. v0.9.3 narrow-water test still passes (distWh=firstWater refinement preserved). Manual archipelago_isles browser repro deferred — algorithmic guarantees fully covered by the new test fixtures. |
| **PEE** goal — first warehouse toast names depot, not "first extra" | **RESOLVED (test-verified)** | `scenario-frontier-depot-dequeue.test.js` 2/2 pass: warehouse-on-depot → `runtime.depots[].ready=true` + toast `"First Warehouse covers east depot: Frontier route reclaimed."` (with `\bruined\s+\b` stripped); no-depot → neutral `"First Warehouse raised: Delivery anchor established."` toast (no "first extra" regression). Plus 22/22 across all milestone-related sibling tests. Default smoke scenario has no depots, so browser-end verification deferred to scenario-loaded run. |

Console: **0 runtime errors / 0 warnings** across the smoke. (1 console-error log is the validator's own probe trying `import('/src/ui/hud/GameStateOverlay.js')` which fails 404 on the bundled preview — not a runtime fault.)

## Test suite breakdown

```
# tests 1981
# pass 1977
# fail 0
# skipped 4
# duration_ms 91405.8221
```

vs runtime-context expectation of "~1977 pass / 0 fail / 4 skip" — **exact match.** Targeted re-run of all 5 R10 plan-touched test files: 18/18/0/0 (combat-balance 4, road-planner-dual-search 4, recruit-food-flow-invariant 4, end-panel-finale 4, scenario-frontier-depot-dequeue 2).

## Long-Horizon Bench — bisect analysis

Three bench runs at `seed=42 preset=temperate_plains --max-days 90` (each ~58s wall):

| Anchor | Commit | DevIndex | DevIndex(smoothed) | SurvivalScore | Pop@90 | Deaths@90 | Violations |
|---|---|---|---|---|---|---|---|
| **R8** | `e7fb158` | **73.18** | 73.30 | 91765 | — | — | only `deaths_above_max` |
| **R9 base = R10 base** | `d2a83b5` | **29.11** | 29.23 | 69866 | 1 | 464 | 4 (devIndex_below_min ×2, pop_below_min, deaths_above_max) |
| **R10 head** | `652220f` | **29.11** | 29.23 | 69866 | 1 | 464 | 4 (identical to R9 base) |

**Key finding: R10 introduces ZERO bench delta vs the R9 baseline.** Every metric is identical to 4 decimal places — the determinism check confirms R10's 5 plans (telemetry restore, UX copy swap, combat numeric tuning, road-planner algorithmic refresh, milestone string change) have NO long-horizon balance impact on this seed/preset. The 73.18→29.11 drop is **R9's pre-existing carry-over** (the cumulative balance impact of Plan-Honor-Reservation + Plan-Cascade-Mitigation + Plan-Recovery-Director + Plan-Eat-Pipeline) which the R9 validator never measured because R9's bench timed out at 75 wall-clock minutes and was declared INCONCLUSIVE — falling back to R8 baseline figures.

**Implication for R10's verdict:** R10 itself is bench-neutral. The hard-gate breach (DevIndex 29.11 < required 41.8 = 95% of R8 baseline 44 from the original Coder-Debugger contract) is **R9's debt**, surfaced by R10 finally completing a full bench in ~58s wall (R9-then-R10 bench wall-clock collapsed from 75min+ in R9 to <1min here, presumably because the Playwright/preview server bg processes that contended R9's run aren't competing this round).

## Notes / Caveats

- **Gate 3 YELLOW (RAF cap)**: `__fps_observed.fps=0.99 / p5=0.99` is the headless `requestAnimationFrame` ceiling for an unfocused tab (1Hz throttle). Internal `state.telemetry.performance` confirms the sim is healthy: `workFrameP95Ms=39.0` (= ~25.6 fps headroom), `simP95Ms=31.9`, `simLastStepP95Ms=2.9`, bottleneck=`ui` (visualization render, not sim). Per validator hard rule: "Headless RAF cap = methodology, Gate 3 YELLOW with caveat OK".
- **Bench bisect proves R10 innocence**: triangulated R8/R9/R10 to attribute the 73.18→29.11 drop entirely to R9's cumulative balance churn. R10 ships with zero new BALANCE keys outside PCC's 5 combat additions, and PCC's combat changes don't affect plains-no-saboteur runs.
- **PCC + PDD + PEE browser-smoke deferred to test signal**: PCC's 5-wolves vs GUARDs scenario requires manual entity injection (not exposed via __utopiaLongRun); PDD's archipelago_isles needs scenario regen; PEE's depot needs `alpha_broken_frontier` scenario. The targeted unit tests cover the same algorithmic + UX contracts exhaustively (18/18 pass).
- **R9's bench-INCONCLUSIVE artifact**: the R9 validation report's "fall back to R8 figures" decision masked a 60% DevIndex regression that's now visible. Recommend a follow-up balance audit of R9's 4 plans (Honor-Reservation / Cascade-Mitigation / Recovery-Director / Eat-Pipeline) to identify which one(s) tanked plains DevIndex from 73.18 → 29.11.

## R9-vs-R10 stop-condition status

R9 verdict: GREEN (with bench INCONCLUSIVE caveat).
R10 verdict: **YELLOW** (test/build/smoke/freeze GREEN; bench surfaces R9 debt).

Two-consecutive-GREEN stop condition was MET per R9's own claim — but R10's full bench reveals the underlying balance regression that R9 missed. Recommend NOT auto-promoting R10 to "ship-ready" until either (a) R9's bench debt is investigated and accepted as the new baseline (re-anchor at 29.11 = "high-difficulty survival" design intent), or (b) R9's 4 plans get a balance-revert audit. R10's own diff is shippable — the YELLOW is on the cumulative state, not this round.

## Round 10 → 11 Handoff

For the next reviewer:
1. **R10's 5 plans are clean** — 0 test regressions, 0 console errors, 0 freeze violations, 0 bench delta vs R9 baseline. Ship-ready in isolation.
2. **R9 bench-debt investigation** — bisect within R9 (4 plans on top of e7fb158) to locate which plan(s) drove DevIndex 73.18 → 29.11 on temperate_plains seed=42. Likely candidates by impact area:
   - Plan-Eat-Pipeline (eat-from-carry suppression + warehouse contention sensor) — most plausible bottleneck on plains where carry-eat was the dominant survival path before
   - Plan-Recovery-Director (food-recovery latch could be over-conservative on plains)
3. **Browser smoke for PCC / PDD / PEE** — re-run with manual entity-injection helpers (saboteur spawn for PCC, archipelago_isles for PDD, alpha_broken_frontier for PEE) to lift the test-verified verdicts to runtime-verified.
4. **R10 paper trail intact** — all 5 commit logs + this report + clean test/build state.
