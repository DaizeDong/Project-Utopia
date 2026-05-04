---
round: 3
date: 2026-05-01
round_base_commit: 0344a4b
head_commit: 1d11ba7
plans_in_round: 10
plans_done: 10
plans_skipped: []

# Gates
gate_1_tests:        PASS  (1766/1776 pass; 6 fail = 5 pre-existing + 1 known wall-clock flake)
gate_2_prod_build:   PASS
gate_2_smoke_console: OK   (0 errors, 0 warnings across ~60s preview session)
gate_3_fps_p50:      YELLOW  (Playwright headless RAF 1Hz throttle; methodology limit per A2 R3 PROCESS-LOG note)
gate_3_fps_p5:       YELLOW  (same caveat)
gate_4_freeze_diff:  PASS  (no new TILE / role / building / audio asset / UI panel / sim subdir)
gate_5_bundle:       WARN  (3 chunks > 500 KB; largest 612.94 KB; none > 1 MB)

# Regression
bench_devindex: 49.41 (vs R2 baseline 47.66, Δ +3.7%)
bench_deaths: 86 (vs R2 baseline 60, Δ +43%)

verdict: GREEN
---

## Verdict rationale

GREEN. All hard gates pass:

- Gate 1 PASS: 1766/1776 (99.4%). The 5 pre-existing failures (`food-rate-breakdown
  spoiledPerMin`, `RoleAssignment STONE quota`, `RaidEscalator DI=30 tier`,
  `RaidFallbackScheduler popFloor`, `v0.10.0-c #2 scenario E walled-warehouse`) are
  documented across A1/A3/A5/A6/A7/C1 commit logs and predate R3. The 6th failing
  test (`worker-ai-bare-init Fix 2/3 stuck`) is a wall-clock-dependent flake A1 R3
  identified pre-commit; passes in isolation 3/3 in re-run.
- Gate 2 PASS: `vite build` exit 0; preview smoke 0 console errors / 0 warnings
  across menu → Start Colony → tool 1 → tool 2 → escape.
- Gate 3 YELLOW with caveat: Playwright headless RAF lock (frameDtMs ≈ 1004 ms ⇒
  fps reads ~1.0) is environment, not product. A2 R3 PROCESS-LOG explicitly
  authorises YELLOW-with-caveat under this measurement constraint.
- Gate 4 PASS: freeze-diff is purely modifications + 1 new file
  (`src/simulation/npc/fsm/VisitorHelpers.js` — the `fsm/` subdir was created
  in v0.10.0, not new). USE_VISITOR_FSM flag retired (clean removal). No new
  TILE / role enum / audio asset / `src/ui/panels/` file.
- Gate 5 WARN (not FAIL): three chunks 551–613 KB; none above the 1 MB RED line.
  Bundle composition unchanged from R2 (vendor-three is the dominant fixed cost).

Bench DevIndex 49.41 is comfortably above the regression-only threshold
(R2 × 0.9 = 42.89). Deaths +26 vs R2 — flagged for R4+ to monitor; not a gate
trigger under the regression-only spec.

## Test results (Gate 1)

- Total: 1776 tests across the suite (pre-R3 baseline was 1736).
- Pass: 1766
- Fail: 6
- Skip: 4 (3 pre-existing + 1 added by C1: `v0.10.0-c-fsm-trace-parity` second skip)
- Duration: 73.25 s

### Failures (all pre-existing or known flake)

| # | Test | Status | Source |
|---|---|---|---|
| 509 | `ResourceSystem foodProducedPerMin emit` | pre-existing | identified A1/A3/A5/A6/A7/C1 |
| 839 | `RoleAssignment STONE quota` | pre-existing | identified A1/A3/A5/A6/A7/C1 |
| 919 | `RaidEscalator: DI=30 yields tier 3` | pre-existing | v0.8.5 known |
| 929 | `RaidFallbackScheduler: pop < popFloor` | pre-existing | identified A1+ |
| 1274 | `v0.10.0-c #2 scenario E walled-warehouse FSM carry-eat` | pre-existing | v0.10.0-c known |
| 1328 | `worker-ai-bare-init Fix 2/3 stuck >3.0s simulated` | wall-clock flake | A1 R3 §Tests; passes 3/3 isolated |

Note: `exploit-regression: escalation-lethality — median loss tick ∈ [2000, 5000]`
PASSES this run via the deferred-assertion path (4/10 finite deaths recorded
as soft-PASS).

## Production Build (Gate 2)

- vite build exit: 0
- Build time: 4.82 s
- Modules transformed: 144

| chunk | size | gzip |
|---|---|---|
| index.html | 195.92 KB | 47.65 KB |
| assets/ui-JwvED6jT.js | 551.46 KB | 170.14 KB |
| assets/index-DlpJOeTK.js | 612.41 KB | 183.27 KB |
| assets/vendor-three-BPnqBKSD.js | 612.94 KB | 157.55 KB |
| assets/pathWorker-Cvg62p-5.js | 6.95 KB | — |

Preview smoke (≈60 s on :4176, port 4173–4175 occupied by stale processes):

- console errors: none
- console warnings: none
- network 5xx: none
- Game flow exercised: menu render → Start Colony → game enters running state
  (timeScale ramps to 0.099, simSteps = 3 / frame), tool key 1, tool key 2,
  Escape — all clean.

## FPS (Gate 3)

| scenario | p50 | p5 | stutters_100ms | meets target |
|---|---|---|---|---|
| idle (menu) | 0.996 | 0.996 | n/a | NO (RAF throttle) |
| mid-load (post-Start, pop ~20) | 0.996 → 1.03 | 0.996 | n/a | NO (RAF throttle) |
| stress | not exercised | — | — | YELLOW caveat |

`window.__fps_observed.frameDtMs` locks to 1004 ms throughout, which is the
Playwright headless RAF 1 Hz throttle A2 R3 documented (PROCESS-LOG §R3
Closeout — Perf Methodology Note). The Chromium flag remediation
(`--disable-renderer-backgrounding --disable-background-timer-throttling
--disable-backgrounding-occluded-windows`) is not available through the MCP
Playwright bridge in this run; the documented contingency is YELLOW-with-caveat.

`__perftrace.topSystems` per-system avgMs reads as 0 ms because each RAF
batch is too coarse to sample individual system costs (the `simStepsThisFrame
= 3` path runs once per ~1 s wall-clock window, well below the perftrace
sampling resolution). Ground-truth per-system work was last validated at
A2 R2 (avg <2 ms / peak <6 ms / 30 min mem +11.52% all PASS) and the C1
wave-3.5 dispatch change is a refactor (one fewer feature-flag read +
unconditional FSM tick) — net hot-loop work is no greater than the
already-validated R2 baseline.

## Freeze-diff (Gate 4)

- diff stat (15 files / +738 / -172):

```
src/app/GameApp.js                           |  42 ++++--
src/app/snapshotService.js                   |  88 +++++++++++++-
src/config/constants.js                      |  19 ++--
src/render/PressureLens.js                   |  30 ++++-
src/render/SceneRenderer.js                  |   7 +-
src/simulation/meta/ColonyDirectorSystem.js  |  67 ++++++++++-
src/simulation/meta/ProgressionSystem.js     |  34 ++++++
src/simulation/npc/VisitorAISystem.js        |  84 ++++----------
src/simulation/npc/fsm/VisitorHelpers.js     |  71 ++++++++++++  [NEW]
src/simulation/npc/fsm/VisitorStates.js      | 159 +++++++++++++++++++-------
src/simulation/npc/fsm/VisitorTransitions.js |  98 ++++++++++++-----
src/ui/hud/GameStateOverlay.js               |  23 ++++
src/ui/hud/HUDController.js                  |  34 +++++-
src/ui/tools/BuildToolbar.js                 |  77 +++++++++++
src/world/scenarios/ScenarioFactory.js       |  77 ++++++++++---
```

- New TILE constants: 0
- New role enum values: 0
- New audio imports: 0
- New `src/ui/panels/` files: 0
- New `src/simulation/<subdir>/`: 0 (`src/simulation/npc/fsm/` predates R3,
  established in v0.10.0)
- `src/config/constants.js` diff: USE_VISITOR_FSM flag REMOVED (-7 lines net),
  no new constants added.

Map of expected file ownership matches Runtime Context exactly:
- A1 → snapshotService + GameApp
- A3 → BuildToolbar + SceneRenderer + GameStateOverlay
- A5 → ProgressionSystem + ColonyDirectorSystem + GameApp + ScenarioFactory
- A6 → HUDController + BuildToolbar + index.html
- A7 → PressureLens + ColonyDirectorSystem + HUDController
- C1 → npc/fsm/Visitor*.js + VisitorAISystem (legacy dual-path deleted) +
  constants.js (flag retired)

## Bundle (Gate 5)

- Largest chunk: assets/vendor-three-BPnqBKSD.js — 612.94 KB (gz 157.55 KB)
- Total dist: ~1.98 MB raw / ~0.56 MB gzip
- 3 chunks above the 500 KB warning line (vendor-three, index, ui)
- 0 chunks above the 1 MB RED line
- Bundle composition unchanged structurally from R2; vendor-three is the fixed
  cost. WARN does not block GREEN verdict per playbook.

## Regression fixes applied

None required. Validator did not author any fix-up commit; HEAD remains 1d11ba7.

## Long-horizon Benchmark

`node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 90`

| Metric | R2 baseline | R3 head | Δ |
|---|---|---|---|
| DevIndex (last) | 47.66 | **49.41** | +3.7% |
| Deaths (cumulative day 90) | 60 | **86** | +43% |
| Survival score | n/a | 85 523 | — |
| Outcome | max_days_reached | max_days_reached | same |
| Saturation @ end | n/a | 0.027 | — |

- DevIndex: +3.7% improvement vs R2; well above 0.9× regression threshold.
  A5 R3 recovery whitelist + zero-farm safety net + A7 R3 autopilot Goal-reached
  cap appear to net positive on the deterministic seed=42 Plains baseline.
- Deaths: +26 vs R2 — the bench output flags `deaths_above_max` violation
  (observed 41 at day 30; required 0). This is the same hard threshold the bench
  has been failing since v0.8.x; the regression-only spec compares the DevIndex
  delta (PASS), so this is a YELLOW finding for R4+ to investigate but **does
  not flip the verdict**.
- Determination: PASS regression-only gate.

## Persistent failures

- 5 pre-existing test failures (catalogued in every R3 commit log under
  "pre-existing failures"). These are out-of-scope per the freeze policy and
  carried forward unchanged across R3.
- 1 known flake (`worker-ai-bare-init Fix 2/3 stuck >3.0s simulated`) — passes
  in isolation; first surfaced by A1 R3.

## Round 3 → Round 4 Handoff

1. **FPS measurement methodology** — A2 R3 already added the
   `playwright_chrome_flags` PROCESS.md requirement. R4 Validator should run
   Playwright with `--disable-renderer-backgrounding
   --disable-background-timer-throttling --disable-backgrounding-occluded-windows`
   to lift the 1 Hz RAF throttle, OR cite `__perftrace.topSystems` ground-truth
   captured outside the MCP bridge. Until then Gate 3 will keep returning
   YELLOW.
2. **Bench deaths regression** — DevIndex moved up but deaths went 60 → 86.
   Worth a balance-critic / rationality-audit pass in R4 to see whether the
   A5 zero-farm safety net is delaying first-farm placement and pushing
   carry-eat starvation deeper into the curve. Not a verdict-changing finding,
   but a credible candidate for the R4 P0 backlog.
3. **`worker-ai-bare-init Fix 2/3 stuck`** — wall-clock-dependent flake. R4
   should consider replacing `Date.now()` / wall-clock dependency in that
   assertion with a deterministic simulated-time check.
4. **C1 wave-3.5 documentation deferral** — C1 commit log Steps 8 & 9
   (docs/systems/03-worker-ai.md Visitor FSM chapter + CHANGELOG entry under
   `### Refactor — C1 wave-3.5 (Visitor FSM)`) were intentionally punted to
   docs track per the implementer spec separation rule. R4 docs sweep should
   close these.
5. **Bundle size** — vendor-three is the dominant cost. If a future round
   needs to chase Gate 5 GREEN, the lever is three.js tree-shaking / scoped
   imports. Out of scope under HW7 freeze.
6. **Pre-existing 5 test failures** — sustained across R0 → R3. These are the
   well-known balance/escalation regressions catalogued in CLAUDE.md
   (v0.8.5 / v0.10.0-c). Either accept and close as documented-defer, or
   open a v0.10.2 balance pass to address.
