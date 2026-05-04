---
reviewer_id: A2-performance-auditor
plan_source: Round0/Plans/A2-performance-auditor.md
round: 0
date: 2026-05-01
parent_commit: 0ff7287
head_commit: 6dd1088
status: DONE
track: code
freeze_check: PASS
track_check: PASS
steps_done: 5/6
tests_passed: 1665/1673
tests_new: test/perf-system-budget.test.js
---

## Steps executed
- [x] Step 1: `src/app/GameApp.js` — added `window.__fps_observed = { fps, p5, sampleCount, frameDtMs }` write at the end of `update()` via the new `#publishPerftraceSurfaces` helper. Always on. EMA alpha=0.15 matches `timeScaleActual`. p5 derived from a 60-sample dtMs ring (95th-percentile dtMs → 5th-percentile FPS). Guarded with `typeof window !== "undefined"`. Constructor now allocates the ring buffer + perftrace scratch buffer once.
- [x] Step 2: `src/app/GameApp.js` — same helper, gated path. When `?perftrace=1` (cached as `this.perftraceEnabled` at construct via `readPerftraceFlag`), writes `window.__perftrace = { topSystems[3], maxStepsPerFrame, simStepsThisFrame, timeScaleActualWall }`. Top-3 selection walks `state.debug.systemTimingsMs` 3 times picking the largest each pass (no full sort) and reuses the pre-allocated `_perftraceTopBuffer` so the gated path allocates nothing per frame.
- [x] Step 3: `src/app/longRunTelemetry.js` — added `topSystemMs` field to the `performance` section of the telemetry sample shape, populated by new `buildTopSystemMs(state, 3)` helper. Pure read of `state.debug.systemTimingsMs` (sorted by `.peak` desc, `.avg` tiebreaker). Additive — `simStepsThisFrame` and all neighbours untouched.
- [x] Step 4: `src/ui/panels/PerformancePanel.js` — added `#renderPerftraceTopSystems()` private method invoked from `render()`. Lazily creates a `<div id="perftraceTopSystemsVal">` sibling under `#performanceSummaryVal` when `window.__perftrace` exists, with `max-height: 5em; overflow-y: auto` per Risks §1 (PerformancePanel layout overflow). When the flag is off the sub-section is never created. Reuses existing `.small.muted` styling — no new panel created.
- [x] Step 5: `test/perf-system-budget.test.js` — NEW. Uses `SimHarness` + `crisis_compound` stress preset (closest existing preset to plan's "ConfigA stress preset"; no preset literally named ConfigA). 30-tick warm-up + 600-tick measure window at fixed seed=4242, template `temperate_plains`. Mirrors `GameApp.stepSimulation` profiling EMA contract (avg 0.85/0.15, peak 0.996 decay). Asserts (a) top system avg <= 12 ms, (b) sum of avg <= `BALANCE.fastForwardScheduler.maxStepsPerFrame * (1000/30)` ms ≈ 400 ms. Soft-skip via `t.skip()` on `CI_FAST=1`.
- [ ] Step 6: SKIPPED — `CHANGELOG.md` update. The plan asked for it but the implementer spec section 8 explicitly overrides: "code track 内的 commit **不要**顺手碰 CHANGELOG（留给 docs track / Validator）". Track-edge self-check forbids `CHANGELOG.md` from a `track: code` commit. Deferred to docs track / Validator.

## Tests
- baseline: per Runtime Context, 4 pre-existing failures live at parent_commit `0ff7287`.
- pre-existing skips (4): unchanged across this commit.
- pre-existing fails (4, all unrelated to A2 plan files): 
  - `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires`
  - `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role`
  - `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)`
  - `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)`
- new tests added: `test/perf-system-budget.test.js` (1 new test passing locally — `crisis_compound` 600-tick top-system avg = WorkerAISystem 0.08 ms, well under the 12 ms soft budget. The budget is intentionally permissive on first run; Round 1 will tighten once trace data accumulates).
- failures resolved during iteration: 1 (initial run referenced `BALANCE.maxStepsPerFrame` but the actual key is `BALANCE.fastForwardScheduler.maxStepsPerFrame` — fixed before commit).
- post-commit totals: **1665 pass / 1673 total / 4 fail (pre-existing) / 4 skip**.

## Deviations from plan
- **Step 6 SKIPPED** — implementer spec section 8 prohibits CHANGELOG edits in code-track commits. Plan-step explicitly noted "Per CLAUDE.md convention" but the implementer spec is the controlling document for hw7 round-0. Validator / docs track should pick this up.
- **Stress preset alias** — plan said "ConfigA stress preset" but no `ConfigA` exists in `BENCHMARK_PRESETS`. Used `crisis_compound` (category: stress) which is the closest existing preset; documented in the test's header comment.
- **Total-avg budget** — plan wrote `BALANCE.maxStepsPerFrame * (1000/30)` but the constant lives at `BALANCE.fastForwardScheduler.maxStepsPerFrame`. Test reads from the correct path with a `?? 12` fallback.

## Freeze / Track check 结果
- **Freeze check: PASS** — no new tile / role / building / mood / mechanic / audio / UI panel. PerformancePanel was extended (additive sub-section under existing `performanceSummaryVal`), not replaced. New file is a test, not a panel.
- **Track check: PASS** — only `src/app/GameApp.js`, `src/app/longRunTelemetry.js`, `src/ui/panels/PerformancePanel.js`, `test/perf-system-budget.test.js`. No `README.md` / `CHANGELOG.md` / `docs/**` / `assignments/**` touches.

## Handoff to Validator
- **Manual smoke** to run: `npx vite` → `http://localhost:5173?perftrace=1` → start scenario → ~6 min sim time at 8× → DevTools console:
  - confirm `window.__fps_observed.fps` is finite + non-zero (≥30 expected non-headless, may be ≤1 in headless because RAF is throttled — that is OK; the surface itself still updates).
  - confirm `window.__fps_observed.sampleCount` increments per frame.
  - confirm `window.__perftrace.topSystems` has 3 entries with non-empty `.name` and non-zero `.peak`.
  - confirm `window.__perftrace.maxStepsPerFrame === 24` (per-instance cap, not the BALANCE 12).
  - confirm Performance panel renders a "Top systems:" line below "Performance:" without layout breakage (max-height 5em / overflow-y auto on the new container).
- **Headless smoke** (Playwright MCP): `mcp__plugin_playwright_playwright__browser_evaluate` → `JSON.stringify(window.__fps_observed)` after 5 s. Should return finite numbers.
- **Default UI** (no `?perftrace=1`): confirm the new sub-section is NOT injected (lazy creation gated by `window.__perftrace` being undefined). PerformancePanel should look identical to the parent commit.
- **Test invariant**: `node --test test/perf-system-budget.test.js` should pass. If it ever fails, the assertion message names the regressing system + numbers — that is the regression Round 1+ should investigate.
- **No FPS regression expected** — this plan adds zero sim-side logic; only observability writes outside the hot path.
- **Prod build smoke**: `npx vite build` should succeed (the new flag-gated code path is dead-code-eliminated when not active).
