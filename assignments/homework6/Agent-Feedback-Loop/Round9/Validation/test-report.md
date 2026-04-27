---
round: 9
stage: D
date: 2026-04-26
status: FULL_GREEN
---

# Round 9 Stage D - Validation Report

## Targeted Tests

```powershell
node --test test/storyteller-strip.test.js test/hud-storyteller.test.js test/next-action-advisor.test.js test/hud-next-action.test.js test/world-explain.test.js test/ai-automation-panel.test.js
```

Result: 40/40 passing.

## Full Suite

```powershell
npm test
```

Result recorded from the latest local full-suite run:

- tests: 1473
- pass: 1471
- fail: 0
- skipped: 2
- duration_ms: 238365.2705

## Build And Diff Hygiene

```powershell
npm run build
```

Result: passed.

```powershell
git diff --check
```

Result: passed.

## Visible Browser Verification

All browser checks used a visible headed Chromium session, not only background command confirmation. The generated screenshots and raw logs were local temporary verification artifacts and were cleaned before push; the key assertions are retained below.

| Run | Duration | Evidence |
|-----|----------|----------|
| Initial strict review | 180s wall clock | Storyteller and AI Log issues reproduced |
| Post-fix long run | 120s wall clock at ultra speed | final sim clock `1000.3s` |
| Spacing smoke | short smoke | Storyteller text spacing verified |
| Final AI Log smoke | short smoke | AI Log and LLM/autopilot boundary verified |

Final smoke sample:

- Storyteller text: `MILESTONE First Kitchen raised: Meals can now turn raw food into stamina.`
- `llmBoundary: true`
- `hasLongRun: true`
- `hasDevApp: false`
- `duplicateDirector: false`
- `milestoneJoined: false`

Long-run post-fix sample:

- reached ultra-speed long-run state: true
- food-crisis advice concrete: true
- duplicate director text: false
- joined milestone text: false
- Autopilot OFF / LLM-disabled copy explicit: true

## Max-CPU Movement/Pathing Verification

Visible headed Chromium stress run after the follow-up performance pass:

- Target: 1000 dev stress workers, 8x time scale, path workers enabled.
- Hardware concurrency reported by browser: 32.
- t+10s: 1020 entities, 1009/1012 workers moving, 991/1012 workers with paths, actual speed 7.83x, average FPS 54.1, work p95 10.7 ms.
- t+20s: 1019 entities, 1008/1012 workers moving, 1003/1012 workers with paths, actual speed 7.75x, average FPS 53.9, work p95 11.8 ms.
- Path worker pool at t+20s: 32 workers, 37,539 completed jobs, 0 dropped jobs, queue length 0.
- Residual console noise: AI proxy HTTP 500 health-check warnings; these do not affect local fallback simulation/pathing.

## Residual Risk

- The full suite still contains 2 skipped tests, carried as skips rather than failures.
- Worktree contains Round 8 and Round 9 code/doc changes; generated browser and test artifacts were intentionally cleaned before push.
- Economy balance was not re-tuned. Round 9 improved player-facing diagnosis and AI visibility, not benchmark survival policy.
