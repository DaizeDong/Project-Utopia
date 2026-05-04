---
round: 0
date: 2026-05-01
round_base_commit: 3f87bf4
head_commit: 1f6ecc6
plans_in_round: 10
plans_done: 10
plans_skipped: []

# Gates
gate_1_tests:        PASS  (1665/1673; 4 fail = pre-existing known list; 4 skip)
gate_2_prod_build:   PASS
gate_2_smoke_console: OK   (0 errors / 0 unhandled rejections / 0 5xx on port 4173)
gate_3_fps_p50:      YELLOW (headless RAF methodology cap — see Gate 3 section)
gate_3_fps_p5:       YELLOW (same caveat)
gate_4_freeze_diff:  PASS  (0 violations)
gate_5_bundle:       WARN  (3 chunks 500KB-1MB, none > 1MB; total raw ~1.95 MB / gzip ~0.55 MB)

# Regression
bench_devindex: 46.66 (vs HW6 baseline 37.77, Δ +23.5%)
bench_deaths: 43 (vs HW6 baseline 157, Δ -72.6%)

verdict: YELLOW
---

## Verdict rationale

5 hard gates: 3 PASS (1, 2, 4), 1 WARN (5 bundle), 1 YELLOW with documented methodology caveat (3 FPS — headless RAF cap is not a project bug per debugger.md hard rules). Long-horizon bench is well above regression thresholds (DevIndex +23.5% vs baseline, deaths -72.6%). Verdict YELLOW because gate 5 is WARN and gate 3 is YELLOW; no FAIL/RED conditions hit.

## Test results (Gate 1)

- Total: 112 suites / 1673 tests
- **Pass: 1665**
- **Fail: 4** (all pre-existing known list, verified unchanged):
  1. `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires`
  2. `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
  3. `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
  4. `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)`
- **Skip: 4** (pre-existing)
- Duration: 122s baseline / 112s post-fix
- Both pre-fix and post-fix runs returned identical pass/fail tallies — the round 0 + fixup commits introduced **zero new test regressions**.

## Production Build (Gate 2)

- vite build exit: 0 (2.34s)
- chunks (post-fix `1f6ecc6`):
  | chunk | size | gz |
  | --- | --- | --- |
  | `index-BqJcAoZX.js` | 618.31 kB | 184.91 kB |
  | `vendor-three-BPnqBKSD.js` | 612.94 kB | 157.55 kB |
  | `ui-BIDe3noL.js` | 531.05 kB | 163.77 kB |
  | `pathWorker-Cvg62p-5.js` | 6.95 kB | — |
  | `index.html` | 179.69 kB | 42.49 kB |
- preview smoke (port 4173, 3-min run, perftrace=1):
  - menu rendered, Start Colony clicked
  - help modal popped on first launch (A3 first-launch gate working as specified)
  - help modal closed via close-button
  - mid-load: `devStressSpawn(30)` → `{ok:true, spawned:18, total:30, fallbackTilesUsed:18}`
  - stress: `devStressSpawn(100)` → `{ok:true, spawned:70, total:100, fallbackTilesUsed:70}` (population infra-cap honoured by design)
  - tool keys 1/2/3/4/L/Space pressed → no errors
  - Inspector / panels switched
  - **console errors from 4173 prod: 0**
  - **network 5xx: 0**
  - vendor Three.js WebGL warnings (`texImage3D FLIP_Y`) present but unrelated to project changes — same in v0.10.1 baseline; documented Three.js library issue.

### Regression caught & fixed during Gate 2 smoke

`devStressSpawn(30)` initially threw `ReferenceError: randomPassableTile is not defined` from B1's commit `1f1eea5`. Root cause: `src/simulation/population/PopulationGrowthSystem.js:313` calls `randomPassableTile(state.grid, rngNext)` as the warehouse-less fallback path, but the import on line 32 only included `{ listTilesByType, tileToWorld }`. B1's +5 new tests in `test/long-run-api-shim.test.js` use a stub state with no `state.grid`, so the fallback path was never exercised.

**Minimal fix** (1 line, 1 file, commit `1f6ecc6`):
```diff
-import { listTilesByType, tileToWorld } from "../../world/grid/Grid.js";
+import { listTilesByType, randomPassableTile, tileToWorld } from "../../world/grid/Grid.js";
```

Verified: post-fix `devStressSpawn(30)` returns `{ok:true, spawned:18, total:30, fallbackTilesUsed:18}`, full test suite still 1665/1673 (no regression).

## FPS (Gate 3)

| Scenario | observed.p50 | observed.p5 | telemetry.fps | Methodology |
|----------|--------------|-------------|---------------|-------------|
| idle (post-Start) | 1.00 | 0.99 | 15.74 | RAF-capped headless |
| mid-load (~30 workers) | 1.00 | 0.99 | 7.50 | RAF-capped headless |
| stress (~100 workers) | 0.99 | 0.99 | 3.00 | RAF-capped headless |

Targets: p50 ≥ 60, p5 ≥ 30.

**Headless RAF methodology cap** — Per A2-performance-auditor's documented limitation (Implementations/A2-performance-auditor.commit.md L48): headless Chromium throttles `requestAnimationFrame` to ~1Hz when the page is not focused / not painting, mechanically failing 60/30 regardless of true sim performance. Both `window.__fps_observed` (A2's render-loop probe) and `state.metrics.performance.fps` (GameApp's EMA) read off RAF and are equally affected.

**Sim-side health (perftrace, NOT RAF-throttled)**:
- `WorkerAISystem` peak = 7.45 ms / avg = 0.36 ms
- `NPCBrainSystem` peak = 7.29 ms / avg = 0.11 ms
- `EnvironmentDirectorSystem` peak = 5.80 ms / avg = 0.0006 ms
- `__perftrace.maxStepsPerFrame === 24` (verified per A2 spec)
- `__perftrace.topSystems` has 3 entries with non-empty names + non-zero peaks (verified per A2 spec)

All system peaks are well within the 16ms-per-frame budget. The sim is healthy at 100 workers; the FPS reading is a measurement artifact of headless mode. Per debugger.md hard-rule: "headless RAF cap is METHODOLOGY, not project bug". Marked YELLOW as the spec recommends, not RED.

**Recommended for Round 1+**: A reviewer can verify Gate 3 in a real browser tab (non-headless) by following B1's manual repro: `npx vite preview --port 4173` → open `http://localhost:4173/?perftrace=1` in a real Chrome/Firefox window → Start → `devStressSpawn(75)` → observe `__fps_observed` for 30s.

## Freeze-diff (Gate 4)

- Diff stat (3f87bf4..1f6ecc6, src/ only): 13 files modified, +691 / -45 LOC
- All 13 files are **modifications**; **0 new files** in `src/` (verified via `git diff --name-status`).
- New TILE constants: **0** (constants.js untouched)
- New role enum values: **0**
- New audio asset imports: **0**
- New `src/ui/panels/` files: **0** (PerformancePanel.js / EntityFocusPanel.js / InspectorPanel.js are pre-existing)
- New `src/simulation/<dir>/` directories: **0**
- `src/render/AtmosphereProfile.js` — pre-existing at 3f87bf4 (verified via `git ls-tree`); A4 modified it (+104 LOC), did not create it.

**Gate 4: PASS — 0 violations.**

## Bundle (Gate 5)

- Largest chunk: `index-BqJcAoZX.js` 618.31 kB (gzip 184.91 kB) — under 1 MB threshold (RED)
- Three chunks in 500 kB – 1 MB band → WARN per spec
- Total raw size: ~1.95 MB; total gzip: ~549 kB — well below 5 MB total threshold
- No chunk exceeds RED (1 MB) threshold

**Gate 5: WARN (YELLOW)** — bundle is shipping production chunks above the 500 KB warning threshold but below the 1 MB hard-fail. This is consistent with the v0.10.1 baseline and the WARN matches the pattern from earlier closeouts (Three.js + game logic + UI shipped as separate chunks already split for caching).

## Regression fixes applied

- **commit `1f6ecc6`**: `fix(polish-loop round-0): import randomPassableTile in PopulationGrowthSystem` — 1 line / 1 file — restores `__utopiaLongRun.devStressSpawn` runtime correctness; root-caused during Gate 2 prod-build smoke; was hidden from B1's +5 tests because their stub state has no `state.grid` (so the fallback path was unreached). No test was deleted, no test was skipped, no balance constant changed.

## Long-horizon Benchmark (sequel gate)

Command: `node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 90`

(Note: spec invocation used `--days` which the script does not accept; correct flag is `--max-days`.)

| Metric | Day-90 value | HW6 baseline | Δ vs baseline | Threshold | Status |
|--------|--------------|--------------|---------------|-----------|--------|
| DevIndex (last) | 46.66 | 37.77 | **+23.5%** | ×0.9 = 33.99 (WARN) / ×0.7 = 26.44 (FAIL) | **PASS** |
| Total deaths | 43 | 157 | **-72.6%** | informational | major improvement |
| Final population | 16 | — | — | informational | survival sustained |
| Survival score | 21,210 | — | — | informational | — |
| Saturation | 0.027 | — | — | informational | — |
| Raids repelled | 171 (tier 6) | — | — | informational | defense holding |

The bench's internal `passed=false` flag fires on `deaths_above_max` and `devIndex_below_min` — but those thresholds are HW7's *new* aspirational targets (DevIndex ≥ 55, deaths == 0 by day 30), NOT the regression-gate the validator spec defines. Against the regression-gate (HW6 baseline × 0.7), DevIndex of 46.66 is **76% above the FAIL line**.

A5's balance-tweak rationale (`food 200 → 320`, `consumption 0.050 → 0.038`, `carry-grace 0.5 → 1.5`) is validated by the data: opening runway extended without long-horizon collapse — DevIndex *up* and deaths *down* together is the strong-signal pattern.

**Bench: PASS regression-gate, with documented note that HW7 stricter targets are not yet hit (this is expected; round 0 is the first polish iteration and Round 1+ work is pre-allocated to those targets).**

## Persistent failures

None. The 4 pre-existing test failures (food-rate-breakdown / role-assignment / raid-escalator / raid-fallback) match the known list verbatim and were verified by all implementers' stash-and-rerun logs. No 5-round attempt was needed; no tests were skipped or deleted.

## Round 0 → Round 1 Handoff

Items the next reviewer / enhancer should focus on:

1. **Bundle splitting (gate 5 WARN)** — three chunks in 500–1000 KB band. If round 1 has spare effort, lazy-loading the LLM-prompt-builder pathways or splitting `vendor-three` deeper could move at least one chunk under 500 KB. Not a blocker.
2. **HW7 stricter bench targets (DevIndex ≥ 55, deaths ≤ 0 by day 30)** — current is 46.66 / 43-deaths. A5's runway extension delivered +23.5% DevIndex over HW6, but the day-90 ceiling sits ~8 points below the HW7 aspiration. Round 1 should look at production bottlenecks; perftrace shows EnvironmentDirectorSystem averaging near zero so this is policy-side, not perf-side.
3. **B1 `devStressSpawn` test coverage gap** — the stub-state in `test/long-run-api-shim.test.js` did not include a real grid, so the fallback-no-warehouse branch was untested. Round 1 should add a fixture-grid integration test before another regression like `1f6ecc6` slips through.
4. **Headless FPS measurement methodology** — the spec acknowledges the RAF cap, but the team needs a Playwright-based real-frame harness (e.g., a worker thread that polls `state.metrics.performance.fps` while Chrome runs in non-headless visible mode). A2 left `__fps_observed` in place; add a `puppeteer` or `playwright` `page.exposeBinding` call to read it from a visible-mode context.
5. **Help modal dismiss UX** — first-launch gate works (A3), but the close interaction required clicking the close button manually; round 1 could add a "click outside to dismiss" or "Enter to confirm" affordance for non-mouse users.
6. **Vendor Three.js WebGL warnings** — `texImage3D FLIP_Y` warnings spam the console (60+ per second) on certain platforms. Tracked as upstream issue; consider patching three.js or suppressing via the existing benign-error filter A1 added.

## Round 0 closeout summary

- 10 wave-0/1/2 plans applied; 0 skipped
- 1 regression caught + fixed (`1f6ecc6`)
- 5 gates: 3 PASS / 1 WARN / 1 YELLOW (methodology)
- Long-horizon bench: DevIndex +23.5% / deaths -72.6% vs HW6 baseline
- Verdict: **YELLOW** — orchestrator may proceed to Round 1 if YELLOW is acceptable for HW7 final polish loop progression; otherwise treat the bundle WARN and FPS YELLOW as Round-1 inputs.
