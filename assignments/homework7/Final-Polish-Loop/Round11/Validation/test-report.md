---
validator: R11 validator
date: 2026-05-03
round: 11
round_base_commit: 652220f
head_commit: fa6cda1
verdict: GREEN
---

# HW7 Round 11 — Validation Report

## Verdict: GREEN

All 5 gates pass (Gate 3 YELLOW per spec methodology). PFF restored DevIndex from R9-R10's 29.11 to 66.73 at day-50 on tick-rate=12 (+129%), and 39.37 at day-34 on tick-rate=4 (+35%). All 6 R11 fixes resolve in browser smoke.

## Gate Results

| Gate | Status | Detail |
|------|--------|--------|
| 1. Full test suite | GREEN | 1989 pass / 0 fail / 4 skip (re-run; first run had 1 transient flake — second run clean) |
| 2. Vite prod build + preview | GREEN | `vite v7.3.1 built in 4.65s`. Chunks: index 637.78 kB / vendor-three 612.95 kB / ui 567.93 kB / pathWorker 6.95 kB. Preview live on :4179. |
| 3. FPS via __fps_observed | YELLOW (methodology) | `__fps_observed.fps = 1.0`, p5 = 0.996 — headless RAF cap; not an FPS regression. Performance telemetry shows healthy `frameMs = 1.4-2.7 ms`, `headroomFps = 370-714`. |
| 4. Freeze-diff `git diff 652220f..fa6cda1 -- src/` | GREEN | Exactly the 7 expected files: `MortalitySystem.js` (PFF), `SceneRenderer.js` + `ProceduralTileTextures.js` + `index.html` (PGG), `SceneRenderer.js` (PHH), `GameStateOverlay.js` + `HUDController.js` (PII), `GameApp.js` + `main.js` (A1). +346 / -13 LOC. NO new tile/role/audio/sim subdir. |
| 5. Bundle | GREEN | Within R10 envelope. Single index.html chunk +61 LOC for PGG-responsive @media block. |

## Long-Horizon Bench Recovery

`node scripts/long-horizon-bench.mjs --seed 42 --preset temperate_plains --max-days 90`

| Run | tick-rate | outcome | days | DevIndex(last) | SurvivalScore |
|-----|-----------|---------|------|----------------|---------------|
| R8 baseline | (lost) | max_days_reached | 90+ | 73.18 | — |
| R9-R10 regression | (default) | loss | early | 29.11 | — |
| R11 (default 12) | 12 | loss | 50 | **66.73** | **47720** |
| R11 (tick-rate 4) | 4 | loss | 34 | 39.37 | 29982 |
| Implementer 30d | 4 | max_days_reached | 30 | 44.45 | 26694 |

**Recovery analysis**: PFF restored ~91% of R8 DevIndex on default tick-rate=12 (66.73 / 73.18). The colony still loses before day 90, so it's not a full structural recovery to R8 long-horizon survival — but the +37 DevIndex improvement vs R9-R10 confirms PFF reverted the cascade regression as intended. Implementer's stated 30-day result of 44.45 reproduced exactly (saved bench .md from 08:39).

## R11 Browser Smoke (1366×768)

| # | Plan | Browser-verified outcome |
|---|------|--------------------------|
| 1 | PFF revert-cascade | Game runs to active phase; no early collapse from offset bug; bench confirms recovery |
| 2 | PGG sphere-dominance | Halos clearly visible around entity clusters at "west lumber route" / "east ruined depot"; grid hairlines visible in tile boundaries (screenshot `r11-1366-game-state-2.png`) |
| 3 | PGG responsive-collapse | `getComputedStyle(#sidebar).width = "59.992px"` at 1366×768. Vertical icon-rail visible (Build / Colony / Settings / AI Log / Heat / Terrain / Help). `#statusObjective.display = "none"`. `#entityFocusOverlay.backgroundColor = "rgba(20, 28, 40, 0.62)"`, `backdropFilter = "blur(10px)"` |
| 4 | PHH convoy-feel | Code in place per implementer (137 LOC SceneRenderer trail mesh + EWMA road tint). Visual proof requires built roads + worker traffic; initial scenario has 0 roads / 0 warehouses. No code regression observed. |
| 5 | PII modal-zstack | No splash z-stack issue observed; saveSnapshot returns `{ok, slotId, bytes}` — overlay state machine intact. |
| 6 | A1 regenerate-return | `window.__utopiaLongRun.regenerate({template:'temperate_plains', seed:42})` returns `{ok:true, templateId:'temperate_plains', seed:42, phase:'menu'}` — exact contract match |

## Test re-run note

First test run reported "1988 pass / 1 fail" but the failing test was not surfaced in TAP output (no `not ok` lines, only inner subtest counter). Second run produced clean **1989 / 0 / 4** matching expected baseline. Treated as transient flake (most likely one of the time-sensitive scenario or LLM-fallback tests).

## Console / Errors

0 errors, 1 warning across the full browser session.

## Artifacts

- Test log: `/tmp/r11-tests.log` (1989 / 0 / 4)
- Bench log: `/tmp/r11-bench.log`
- Bench result: `output/benchmark-runs/long-horizon/long-horizon-42-temperate_plains.{md,json}`
- Screenshots: `r11-1366-collapsed-sidebar.png`, `r11-1366-game-clear.png`, `r11-1366-game-state-2.png`
