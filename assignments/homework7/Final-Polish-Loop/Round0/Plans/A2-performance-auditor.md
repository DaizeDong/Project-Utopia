---
reviewer_id: A2-performance-auditor
reviewer_tier: A
feedback_source: Round0/Feedbacks/A2-performance-auditor.md
round: 0
date: 2026-05-01
build_commit: 3f87bf4
priority: P1
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 4
  loc_delta: ~120
  new_tests: 1
  wall_clock: 35
conflicts_with: []
rollback_anchor: 3f87bf4
---

## 1. 核心问题

1. **Sim tick saturated far below requested 8x** — at ~20 entities + ~60 road tiles, `timeScaleActualWall` collapses to ×0.3 of the requested ×8 (P4 in the audit). The per-frame `maxStepsPerFrame=12` cap (`src/config/balance.js:377`) is being hit because individual steps cost too many ms. We do not yet know *which* system eats the budget — `state.debug.systemTimingsMs` is recorded (`src/app/GameApp.js:426`) but no automated regression captures the top-N hot systems at a stress preset, so any tuning is blind.
2. **Drawcalls are not bounded by entity count** — 51 → 137 → 203 per RAF tick from P2 → P3 → P4 even though tile/agent rendering already uses `InstancedMesh` (`src/render/SceneRenderer.js:1051,1113,1334-1337`). The growth correlates with infrastructure (buildings + path overlays + lens markers). At a real 60 fps this would be 12k drawcalls/sec — an integrated-GPU risk. Root cause is per-building / per-overlay individual `THREE.Mesh` instantiation that bypasses the existing instanced pipeline.
3. **Headless RAF cap (1 Hz) blocks future blind audits** — A2 explicitly calls this out as methodology, not a project bug. We need a sim-loop-derived FPS surface (`window.__fps_observed`) so reviewers in headless Chromium can certify the 60-fps target without a foreground display. This is a small observability addition, not a behavior change.

## 2. Suggestions（可行方向）

### 方向 A: Wire a `?perftrace=1` URL hint that snapshots `systemTimingsMs` + a foreground-loop FPS counter to `window.__fps_observed`, then add one stress-preset test that asserts top-N system budget shape

- 思路：add observability *before* tuning — capture which systems consume the per-tick budget at the P3/P4 stress profile, expose a render-loop-driven FPS so blind reviewers can certify the 60-fps target inside headless Chromium (the A2 methodology gap). No mechanic / asset / panel changes.
- 涉及文件：
  - `src/app/GameApp.js` (the sim+render driver — add `window.__fps_observed` write inside its RAF body, ~10 LOC)
  - `src/app/longRunTelemetry.js` (already aggregates per-frame metrics — add top-3 system timings to its sample shape)
  - `src/ui/panels/PerformancePanel.js` (already reads `timeScaleActualWall` — extend to render top-3 hot systems when `?perftrace=1`)
  - `test/perf-system-budget.test.js` (NEW — smoke test that runs ConfigA stress preset for 600 ticks and asserts the top hot system stays under a soft budget)
- scope：小
- 预期收益：unlocks data-driven tuning in Round 1+. Hard-locks a regression budget. Resolves A2's headless-RAF certification gap. Zero behavior change.
- 主要风险：if the soft budget threshold is set too tight, the new test flakes on slow CI. Mitigation: use a generous 2× current observed value as the gate, and tag the test as advisory (skipped on `process.env.CI_FAST=1`).
- freeze 检查：OK — pure observability + one test file. No new tile / role / building / mood / mechanic / audio / UI panel (PerformancePanel already exists; we extend its body).

### 方向 B: Reduce per-tick drawcall count by routing the ~10 building tile types through a single shared `InstancedMesh` per type (mirror the existing tile-base pipeline in `#setupTileMesh`)

- 思路：tile rendering already collapses 6912 tiles into ~14 drawcalls via `InstancedMesh` keyed by tile type (`src/render/SceneRenderer.js:1037-1062`). Buildings (BARRACK, FARM, KITCHEN, etc., tile IDs 4-13) are likely producing per-instance overhead through individual `THREE.Mesh` creations elsewhere. Audit + collapse them into the same per-type instanced buckets.
- 涉及文件：
  - `src/render/SceneRenderer.js` (extend `#setupTileMesh` and the building-render path to use one `InstancedMesh` per building tile type; estimated ~80 LOC delta; reuses existing `tileMeshesByType` map keyed by `TILE` constant)
- scope：中
- 预期收益：drawcall count should flatten — at 60 buildings instead of 60 individual draws, expect 10-14 (one per tile type) rather than 137-203 today. Directly addresses A2 finding (c).
- 主要风险：visual regression — building meshes may use per-instance materials (e.g., construction-progress tinting). Need to audit per-instance state before collapsing. Risk of breaking the `BuildSystem`/`ConstructionSystem` overlay rendering. Without a prior trace (方向 A), we are guessing which renderer is the cost driver.
- freeze 检查：OK — no new tile / building / mechanic added; this is a render-pipeline collapse of *existing* tile types into the *existing* InstancedMesh pattern. No new asset.

### 方向 C: Raise `BALANCE.maxStepsPerFrame` from 12 → 24 to let the player's requested 8× actually execute

- 思路：simplest possible tuning — the cap is the obvious chokepoint at `src/config/balance.js:377`.
- 涉及文件：`src/config/balance.js:377`, comment at `src/app/simStepper.js:17-22`.
- scope：小
- 预期收益：bumps `timeScaleActualWall` headroom by ~2×.
- 主要风险：**Phase 10 hardening contract** — `simStepper.js:14-22` explicitly notes that maxSteps=12 was validated by Phase 10 long-horizon determinism tests. Doubling it risks long-horizon determinism regression and accumulator overflow under tab-throttle. Worse: if the per-step cost is the real problem (likely — A2's "drawcalls scale with infra" hint suggests render or pathfinding cost, not step count), raising the cap just lets each frame burn more wall-clock without fixing root cause, hurting render FPS.
- freeze 检查：OK on the freeze axis (no new tile / role / building / mechanic), but FAILS the "fix root cause, not symptom" criterion in the enhancer spec §3. Not selecting.

## 3. 选定方案

选 **方向 A**，理由：

- **A2 is a Tier-A blind audit at Round 0** — the auditor explicitly recommends "expose `window.__fps_observed` populated by the game's own render loop … so blind reviewers can verify the 60-fps target without needing a non-headless display" and "run one local non-headless FPS sweep … and pin the numbers in `docs/perf-baseline.md`." 方向 A operationalizes both recommendations literally.
- **Smallest safe step** — observability before tuning. We do not yet know which system eats the budget at P4. 方向 B may target the wrong renderer; 方向 C contradicts the Phase 10 determinism contract. 方向 A is purely additive.
- **Unlocks Round 1+** — once the perftrace data lands, Round 1's enhancer can pick from {InstancedMesh collapse, pathfinding cache warming, fog/lens recompute throttling, role-assignment dedup} with evidence rather than guesswork.
- **Closes the headless-RAF methodology gap** that A2 cites as the only reason verdict is YELLOW rather than GREEN.

## 4. Plan 步骤

- [ ] Step 1: `src/app/GameApp.js:RAF-loop-callback` — `edit` — at the end of the per-frame RAF handler (where `state.metrics.timeScaleActualWall` is updated near line 641), compute `framesPerSecond = 1 / max(frameDt, 1e-6)`, exponentially smoothed (alpha=0.15 like `timeScaleActual`), and assign to `window.__fps_observed = { fps: smoothed, p5: rolling5thPctOfLast60Samples, sampleCount: n, frameDtMs: frameDt*1000 }`. Guard with `typeof window !== "undefined"`.

- [ ] Step 2: `src/app/GameApp.js:RAF-loop-callback` — `edit` — when `URLSearchParams(location.search).get("perftrace") === "1"` (compute once at construct, cache flag), additionally write the top-3 entries of `state.debug.systemTimingsMs` (sorted by `.peak` then `.avg`) to `window.__perftrace = { topSystems: [{name, last, avg, peak}, ...], maxStepsPerFrame, simStepsThisFrame, timeScaleActualWall }` once per RAF tick.
  - depends_on: Step 1

- [ ] Step 3: `src/app/longRunTelemetry.js:236` (`simStepsThisFrame: ...` line in the sample shape) — `edit` — after the existing `simStepsThisFrame` field, add `topSystemMs` field that captures the same top-3 entries from `state.debug.systemTimingsMs` per sample. Pure read of existing data; no new instrumentation tap.
  - depends_on: Step 2

- [ ] Step 4: `src/ui/panels/PerformancePanel.js:218` (the `Number(this.state.metrics.timeScaleActualWall ?? requested)` line) — `edit` — when `window.__perftrace` exists (i.e., user opened with `?perftrace=1`), append a "Top systems" sub-section under the existing PerformancePanel body that renders `state.debug.systemTimingsMs` top-3 by `.peak`. Reuse existing styling — no new panel.
  - depends_on: Step 3

- [ ] Step 5: `test/perf-system-budget.test.js` — `add` — NEW test file (Node `node --test`). Use existing benchmark harness (`src/benchmark/`) to run ConfigA stress preset for 600 ticks at a fixed seed; assert (a) no single system in `state.debug.systemTimingsMs` has `.avg > 12 ms` (≈ frame budget at 8× target), (b) sum of `.avg` across systems < `BALANCE.maxStepsPerFrame * (1000/30)` ms. Use generous 2× thresholds initially; mark test soft-skip via `t.skip()` when `process.env.CI_FAST === "1"`.
  - depends_on: Step 4

- [ ] Step 6: `CHANGELOG.md` — `edit` — add a v0.10.1-n entry under the unreleased section under category "Observability": "A2 perftrace surface — `window.__fps_observed` (always-on render-loop FPS) + `window.__perftrace` (URL-gated top-system budget snapshot) + perf-system-budget regression test. Resolves A2 headless-RAF measurement gap; unlocks data-driven sim-tick tuning in Round 1+." Per CLAUDE.md convention, every commit must include a CHANGELOG.md update.
  - depends_on: Step 5

## 5. Risks

- **PerformancePanel layout overflow** — the existing panel has fixed height; adding a 3-line top-systems sub-section may push it past the visible region. Mitigation: use `overflow-y: auto` on the new sub-section container; confirm via manual screenshot at `?perftrace=1`.
- **`window.__perftrace` write cost** — sorting `state.debug.systemTimingsMs` once per RAF tick allocates a new array each frame, contributing to A2's GC sawtooth concern. Mitigation: gate the write behind the URL flag (no allocation when flag absent); reuse a pre-allocated 3-slot array when the flag is on.
- **Soft budget test flakiness** — first run will calibrate the threshold from observed values, not theory. If the recorded `.avg` for any system exceeds 12 ms on the dev machine, the test is supposed to fail (it is the regression we want to learn about). Decision: keep the test failing-on-purpose at first run; the follow-up plan (Round 1) will tune the budget.
- **Possible double-write of `simStepsThisFrame` in `longRunTelemetry.js`** — Step 3 only adds a sibling field; the original line is untouched. No risk to existing telemetry consumers.
- 可能影响的现有测试：
  - `test/longRunTelemetry.test.js` (if it asserts on the exact sample shape — Step 3 adds a field, which is additive, but a deep-equal assertion would fail; mitigation: pre-check before the edit)
  - `test/PerformancePanel.test.js` (if such a test exists; new sub-section renders only when `window.__perftrace` exists, default off in test env)
  - `test/simStepper.test.js` and `test/long-horizon-bench.mjs` — should be unaffected (no logic change to step planner or balance constants)

## 6. 验证方式

- 新增测试：`test/perf-system-budget.test.js` covering ConfigA stress preset / fixed seed / 600 ticks / top-system avg-ms budget.
- 手动验证：
  1. `npx vite` → open `http://localhost:5173?perftrace=1`
  2. Start scenario, advance to ~6 minutes sim time (autopilot ON, 8× speed) to match A2's P3 profile
  3. Open DevTools console → confirm `window.__fps_observed` reports realistic foreground-FPS (expected ≥ 30 in non-headless Chromium, vs the 1.0 RAF cap A2 saw)
  4. Confirm `window.__perftrace.topSystems` lists 3 entries with non-zero `.avg`
  5. Open Performance panel → confirm "Top systems" sub-section renders without layout breakage
- FPS 回归：`mcp__plugin_playwright_playwright__browser_evaluate` → read `window.__fps_observed.fps` after a 5 s sample. In headless this will still be RAF-throttled but the new surface lets the validator at least *read* the value the game thinks it is rendering at — which is the methodology fix A2 requested.
- benchmark 回归：`scripts/long-horizon-bench.mjs` seed 42 / temperate_plains, DevIndex must not drop below baseline − 5 % (this plan adds no sim-side logic, so DevIndex should be unchanged).
- prod build：`npx vite build` no errors; `vite preview` 3-minute smoke with `?perftrace=1` no console errors.
- Test baseline: 1646 pass / 0 fail / 2 skip from v0.10.0 closeout (per CLAUDE.md). After Step 5, expect 1647 pass (or 1646 pass + 1 advisory-skip if test enters its calibration phase).

## 7. 回滚锚点

- 当前 HEAD: `3f87bf4`
- 一键回滚：`git reset --hard 3f87bf4`（仅当 Implementer 失败时由 orchestrator 触发）

## 8. UNREPRODUCIBLE 标记

Not applicable — A2's findings about (b) sim-tick saturation and (c) drawcall scaling are recorded with concrete numbers from a Playwright session at build_commit=`3f87bf4`. The headless-RAF 1-Hz cap is acknowledged as environmental (per Runtime Context note); this plan addresses (b) and (c) directly and adds an observability surface so the next round's validator can re-measure (a) honestly.
