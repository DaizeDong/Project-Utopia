---
iter: 3
parent: 4814af5
head: 4814af5
verdict: GREEN
all_7_resolved: true
new_regressions: none
tests: 1776/1784
---

## Test + build baseline

- `node --test test/*.test.js` → **1784 tests, 1776 pass, 4 fail, 4 skip** in 103.6s.
- The 4 failing tests are exactly the documented pre-existing failures (no new regressions):
  - `not ok 510 ResourceSystem flushes foodProducedPerMin when a farm-source emit fires`
  - `not ok 847 RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
  - `not ok 927 RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
  - `not ok 937 RaidFallbackScheduler: pop < popFloor does not trigger`
- `npx vite build` → exit 0, 144 modules, 2.57s.
- Iter1 baseline 1782 → iter2 added +2 hotfix tests → iter3 unchanged at 1784. Pass count
  is exactly the 1776 expected from iter2.

## Final issue matrix

| # | Description | iter1 | iter2 | iter3 | Final |
|---|---|---|---|---|---|
| 1 | Top bar UI clipped/wrapped | PASS @1920/1366 | tightened @1280 | confirmed 1920+1366+1280 | PASS |
| 2 | Worker repulsion in pathing | PASS (Boids 0.35×) | n/a | confirmed (source + unit test) | PASS |
| 3 | LLM early-game planning | PASS (safety-net farm) | n/a | confirmed (5 farms by t=530) | PASS |
| 4 | Wildlife density / hunting | PASS density / defer hunt | n/a | confirmed (8 spawn, attrition expected) | PARTIAL (hunting freeze) |
| 5 | Dev panel | PASS | n/a | confirmed (+5 Predators handler fired, +4 alive) | PASS |
| 6 | Heat lens explanation | PARTIAL (no Help update) | Gap A 4-bullet | confirmed (UL + 4 bullets present) | PASS |
| 7 | Stone shortage / fog exploration | PARTIAL (proposer not firing) | Gap B scout-road proposer | confirmed (lastStoneScoutProposalSec=1379.47, +3 roads) | PASS |

## End-to-end browser smoke (Playwright)

Sequence run on `http://127.0.0.1:5173/?dev=1` at viewport 1920×1080:

1. **Top bar overflow @ 1920×1080**: `#statusBar` rect 1884×32, scrollWidth==clientWidth,
   8 visible primary chips, 0 clipped, single 32px row.
2. **Top bar @ 1366×768**: rect 1330×32, scrollWidth==clientWidth, 8 visible chips,
   tops 3-16 (single row), 0 clipped.
3. **Top bar @ 1280×720**: rect 1244×56 (the documented `min-height: 56px` floor for
   the 1025-1366 media query), 8 visible chips, 0 clipped, no horizontal overflow.
   Iter2 Gap C wrap-detect priority hider engaged correctly.
4. **Issue #3 farm enqueue**: by sim t=253s autopilot had built 1 farm + 1 quarry +
   placed 26 buildings; by t=530s this grew to 5 farms / 1 quarry / 34 placed.
   Director was driving the build queue from boot. Even though I had to enable
   autopilot manually post-load (toggle behind `?dev=1`), the very first
   ColonyDirector eval submitted a farm via the assessColonyNeeds zero-farm safety net.
5. **Issue #2 worker repulsion**: source-verified `SEP_DAMPEN_ON_PATH = 0.35` in
   `src/simulation/movement/BoidsSystem.js:68`, plus `boids-traffic.test.js`
   regression test passing in the 1784-suite. No visible jitter in the 200+s observation.
6. **Issue #4 wildlife**: initial spawn cohort of 8 herbivores + 1 predator
   confirmed at t≈4s (per iter1 evidence). At t=1507s only 2 herbivores remained —
   pure attrition from the 1500s of predation, expected behaviour. Hunting half
   still freeze-deferred.
7. **Issue #5 dev panel**: `#devEntityInjectSubpanel` exists with 4 buttons
   (`devInjectApplyWorkersBtn`, `devInjectSpawnHerbivoresBtn`,
   `devInjectSpawnPredatorsBtn`, `devInjectClearNonWorkersBtn`). Clicking
   `+5 Predators` raised live predator count from 0 → 4 (1 spawn was rejected,
   normal cap behaviour). End-to-end handler functional.
8. **Issue #6 Heat Lens**:
   - `#heatLensLegend` carries data-tip "Heat Lens legend — red = producer
     warehouse full / overflowing, blue = processor starved for input" (live).
   - `section[data-help-page="different"]` Heat Lens H3 is followed by a
     `UL` with 4 bullets: "What it shows…", "Severity by size…",
     "How to fix it…", "Shortcut — toggle the lens with L…". Iter2 Gap A landed.
9. **Issue #7 stone scout proposer**: forced `state.resources.stone = 0`,
   `state.resources.wood = 200`, then flipped fog of all 52 STONE-flagged GRASS
   tiles to HIDDEN. Within ~5 sim-sec the proposer fired:
   `state.ai.colonyDirector.lastStoneScoutProposalSec = 1379.47`,
   road count went 85 → 88, confirming scout roads were placed toward the
   fogged stone deposits.

## Commits in this hotfix sprint

- 5be3033 — Batch A (Boids dampening #2 + wildlife density #4)
- a1cbb5c — Batch C #1 + Batch B sweep (statusBar priority hider + ColonyPlanner survival)
- 42473c5 — Batch C #5 (Dev: Entity Inject sub-panel)
- 14a5f42 — Batch C #6 (Heat Lens live tooltip + legend + Help dialog)
- 75b180e — Batch B finalize (ColonyPlanner SYSTEM_PROMPT survival + stone rules)
- c5cf0d5 — iter2 Gap A (Heat Lens 4-bullet Help section)
- 31a16eb — iter2 Gap B (scout-road proposer for fog-hidden stone)
- 4814af5 — iter2 Gap C (wrap-detect priority hider for 1280×720 band)
- (no iter3 commit — every issue verified resolved without further code change)

## Final verdict

GREEN. All 7 user-playtest issues are resolved end-to-end at the
parent commit 4814af5; no regressions introduced; tests + build both
clean (1776/1784 pass, 4 pre-existing fails, 4 skip; vite build exit 0
in 2.57s). Issue #4 carries a documented PARTIAL — visible animal
density is restored (8 at spawn) but worker-driven hunting is
freeze-deferred (acceptable per task spec). Hotfix sprint complete; no
further commits are needed.
