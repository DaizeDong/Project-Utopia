---
reviewer_id: B1-action-items-auditor
reviewer_tier: B
feedback_source: assignments/homework7/Final-Polish-Loop/Round0/Feedbacks/B1-action-items-auditor.md
round: 0
date: 2026-05-01
build_commit: 3f87bf4
priority: P2
track: code
freeze_policy: hard
estimated_scope:
  files_touched: 3
  loc_delta: ~80
  new_tests: 1
  wall_clock: 25
conflicts_with: []
rollback_anchor: 3f87bf4
---

## 1. 核心问题

B1 reports verdict GREEN, score 9/10: nine action items closed, **one partial** (AI-1: ultra/high-speed stability under 75-100 worker stress), zero regressions. The single root cause of B1's "partial" call is a verification-tooling gap, not a runtime bug:

- **Root problem (single)** — The reviewer attempted to reproduce Round 9's 75-80 worker stutter scenario by calling `window.__utopiaLongRun.startRun({ devStressWorkers: 200, ... })`, but `startRun()` ignores its argument (see `src/main.js:192` — `startRun: () => app?.startSession?.()` with no parameter). The `devStressWorkers` field never existed in the harness; it was a hallucinated parameter the reviewer assumed by analogy to the Round 9 D-validation harness (which is a separate Node.js path: `scripts/long-run-support.mjs`). With no in-browser way to inflate worker count, AI-1 cannot be re-confirmed inside a Playwright session, even though the Round 9 D-validator independently passed the perf bar (1020 entities @ 7.83x @ 54 FPS).

The underlying perf work is in (validator-confirmed). What is missing is an **in-browser stress hook** that lets B1 (and any future Tier-A perf reviewer) reproduce the 75-100 worker case directly, without invoking the Node harness.

## 2. Suggestions（可行方向）

### 方向 A: Extend `__utopiaLongRun.configure` with a `devStressWorkers` knob that fast-forwards the recruit queue

- 思路：Add a single helper on the existing `window.__utopiaLongRun` object that bumps `state.controls.recruitQueue` to the requested target, bypasses food cost / cooldown for the stress fill only, and triggers spawns at warehouses (or a fallback grass tile if no warehouse exists) until the worker count reaches the target. This is the API surface B1's repro script expected; closing the gap retroactively makes AI-1 verifiable in a Playwright window.
- 涉及文件：
  - `src/main.js:187-210` (extend the `__utopiaLongRun` object literal — one new method `devStressSpawn(targetCount, options?)`)
  - `src/simulation/population/PopulationGrowthSystem.js` (export an internal `__devForceSpawn(state, count)` helper that reuses the existing spawn path, with the food-cost / cooldown gates skipped)
  - `src/main/App.js` or equivalent root app object (small `devStressSpawn(target)` method that the global wrapper calls)
- scope：小（≤ 80 LOC, including a focused unit test)
- 预期收益：AI-1 becomes directly reproducible in B1's Playwright session in Round 1; future perf reviewers can reach 75 / 100 / 200 worker scenarios without spinning up `scripts/long-run-support.mjs`. Zero impact on production code paths (gated behind the dev-only `__utopiaLongRun` object that is already optionally exposed; the new method is additive to that single existing surface).
- 主要风险：
  - The forced spawn helper must not corrupt `state.metrics.recruitTotal` accounting (mitigation: route through the same spawn helper, just bypass cost gates; increment a separate `state.metrics.devStressSpawnTotal` counter so analytics stays clean).
  - Spawns at warehouse-less colonies need a deterministic fallback tile (mitigation: pick first GRASS tile via existing seeded RNG; documented in the helper's JSDoc).
- freeze 检查：**OK** — no new tile / role / building / mood / mechanic / audio asset / UI panel. The new method extends an **existing** debug API surface (`window.__utopiaLongRun`), per the orchestrator's explicit note ("extending an existing `window.__utopia*` debug API; not a new API surface").

### 方向 B: Pure-docs defer — mark AI-1 as "documented-defer" with validator-evidence note in CHANGELOG and PROCESS-LOG

- 思路：Leave the runtime untouched. Add a short note to `CHANGELOG.md` under the v0.10.1 unreleased section documenting that AI-1's "75-80 worker stutter" scenario is verifiable only via the Node validator (`scripts/long-run-support.mjs`), and capture the validator scenario template (`pathWorkers: true, autopilot: true, speed: 'ultra', target: 100 workers`) in `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` (or create the doc if absent in this loop) so any future Round-N reviewer can follow the same path B1 was looking for.
- 涉及文件：
  - `CHANGELOG.md` (add a "Documented Defers" subsection under Unreleased)
  - `assignments/homework7/Final-Polish-Loop/PROCESS-LOG.md` (append "AI-1 validator scenario" section; create file if missing)
  - `README.md` is NOT touched (avoid scope creep)
- scope：小 (≤ 30 LOC, pure docs)
- 预期收益：Honest accounting of the partial-verifiability gap; hands the next reviewer a reproducible recipe via the validator path.
- 主要风险：Does not actually close the in-browser repro gap → AI-1 will likely re-appear as "partial" in Round 1 from any reviewer who tries the same in-browser path. Closes the audit trail but not the tooling defect.
- freeze 检查：**OK** — docs only.

### 方向 C: Both — small code hook + docs note

- 思路：Combine A + B (helper + docs).
- scope：小+ (≤ 110 LOC)
- 预期收益：Maximally durable closure of AI-1 (in-browser repro AND validator-path documentation).
- 主要风险：Marginally larger blast radius; mostly additive.
- freeze 检查：**OK**.

## 3. 选定方案

选 **方向 A** (small code hook).

理由：

1. B1 is already GREEN at 9/10; the only deduction is a verification-tooling gap (the `devStressWorkers` parameter the reviewer expected does not exist). Closing this gap with a tiny additive helper on the **existing** `__utopiaLongRun` surface costs ~80 LOC and directly upgrades AI-1 to "closed" in Round 1.
2. Method extends an existing debug API per the orchestrator's explicit guidance; no new public surface, no freeze violation.
3. The deferred-docs alternative (方向 B) leaves the same gap open and any future Tier-A perf reviewer will re-discover it. Spending 25 wall-clock minutes once eliminates the recurrence.
4. 方向 C is unnecessary — the in-browser hook itself becomes self-documenting via JSDoc on the new method, and `CHANGELOG.md` will already get a one-line entry per the project's per-commit changelog rule.

## 4. Plan 步骤

- [ ] **Step 1**: `src/simulation/population/PopulationGrowthSystem.js:end-of-file` — `add` — Export a new helper `export function __devForceSpawnWorkers(state, targetCount, rng)` that:
  - Reads current worker count from `state.npcs` (filter `kind === 'worker'`).
  - If `current >= targetCount`, returns `{ spawned: 0, total: current }` (no-op).
  - Otherwise spawns `(targetCount - current)` workers by reusing the same spawn factory the queue-drain branch uses (around line ~108 onward — locate via `recruitFoodCost` constant). The helper bypasses food-cost debit and cooldown reset, but still uses the seeded RNG for spawn-tile selection (warehouse-anchored if any warehouse exists; else first reachable GRASS tile).
  - Increments a new `state.metrics.devStressSpawnTotal = (state.metrics.devStressSpawnTotal || 0) + spawned` counter (additive, does not pollute `recruitTotal` / `birthsTotal`).
  - Returns `{ spawned, total: targetCount, fallbackTilesUsed: <int> }`.

- [ ] **Step 2**: `src/main/App.js` (or wherever `app.startSession` is defined — locate via Grep `startSession\s*\(`) — `add` — Add a thin instance method `devStressSpawn(target, options = {})` that:
  - Validates `target` is finite int in `[0, 500]` (clamped silently); returns `{ ok: false, reason: 'invalid_target' }` otherwise.
  - Returns `{ ok: false, reason: 'no_session' }` if no active session.
  - Calls the helper from Step 1 with `(this.state, target, this.rng)` and returns the result.
  - depends_on: Step 1

- [ ] **Step 3**: `src/main.js:187-210` — `edit` — Add one line to the `window.__utopiaLongRun` object literal:
  ```
  devStressSpawn: (target, options) => app?.devStressSpawn?.(target, options) ?? null,
  ```
  Keep alphabetical/grouping consistent with neighboring methods (`startRun`, `regenerate`).
  - depends_on: Step 2

- [ ] **Step 4**: `test/long-run-api-shim.test.js` — `edit` — Append one new `test()` case asserting:
  - `window.__utopiaLongRun.devStressSpawn` is a function (after shim setup).
  - Calling it with `target=0` returns `{ ok: true, spawned: 0 }` (or appropriate no-op shape).
  - Calling it with no session returns `{ ok: false, reason: 'no_session' }`.
  - Reuse the existing shim harness in that file; do not introduce a new test file.
  - depends_on: Step 3

- [ ] **Step 5**: `CHANGELOG.md:Unreleased section` — `edit` — Add a one-line entry under v0.10.1:
  > `dev: __utopiaLongRun.devStressSpawn(target) — fast-fill worker count for in-browser perf stress repro (closes AI-1 verification gap from HW7 Final-Polish-Loop Round 0).`
  - depends_on: Step 1-4 (changelog reflects the actual change)

## 5. Risks

- **R1 — Spawn-tile fallback may pick water/wall tiles** in degenerate maps if GRASS scan logic is naive. Mitigation: reuse the **exact** tile-selection helper the existing recruit-spawn branch already uses (do not reimplement). If that helper rejects all candidates, return `{ ok: false, reason: 'no_spawn_tile' }`.
- **R2 — Bypassing food cost may invalidate downstream economy assumptions** in long-running simulations. Mitigation: this helper is dev-only (`__utopia*`), not exposed in production builds. Add a JSDoc `@warning` block. The new `devStressSpawnTotal` metric provides an audit trail.
- **R3 — Adding a method to `__utopiaLongRun`** may break the `long-run-api-shim.test.js` snapshot if it asserts an exact method list. Mitigation: Step 4 explicitly extends that test rather than relying on snapshot equality.
- **R4 — Pop cap (`infraCap`) may silently clamp the spawn count** below the requested target. Mitigation: helper returns `{ spawned, total }` honestly so callers see the cap; do NOT bypass the cap in the helper itself (preserves balance invariants — bypassing it would require a freeze-violating "ignore infrastructure" path).
- **可能影响的现有测试**：
  - `test/long-run-api-shim.test.js` (extending, not breaking)
  - `test/PopulationGrowthSystem.*.test.js` (if any — search for population-system tests; new export should be additive and not interfere)

## 6. 验证方式

- **新增测试**：`test/long-run-api-shim.test.js` (extension, +1 case)
  - Covers: API exposure, no-session guard, `target=0` no-op, `target=N` spawn count match (when session active).
- **手动验证**：
  1. `npx vite` → open `http://127.0.0.1:5173/` → Start Colony.
  2. DevTools console: `await __utopiaLongRun.devStressSpawn(75)` → expect `{ ok: true, spawned: ~63, total: 75 }` (assuming 12-worker baseline).
  3. Read `__utopiaLongRun.getTelemetry().population.workerCount` → expect `~75`.
  4. Switch to ultra-speed (`8x`); observe `getTelemetry().performance.fps` over 30s → expect ≥ 30 FPS sustained (the Round-9 acceptance bar).
  5. Confirm "performance capped" copy fires if/when `headroomFps < 60` (existing UI; no new copy).
- **FPS 回归**：via `browser_evaluate` 5-second average ≥ 50 FPS at the **default** 12-worker baseline (helper must be no-op when not invoked).
- **benchmark 回归**：`scripts/long-horizon-bench.mjs seed=42 template=temperate_plains` → DevIndex within baseline ± 5% (helper is dev-only and uninvoked by the headless bench, so should be a true no-op here).
- **prod build**：`npx vite build` no errors; `npx vite preview` 3-minute smoke with no console errors; `__utopiaLongRun` should still expose `devStressSpawn` (the harness is keyed on `__utopia` for dev-only paths but `__utopiaLongRun` is intentionally always-on for validators — confirm this matches the Round 9 D-validation contract `hasLongRun=true, hasDevApp=false`).
- **node test suite**：`node --test test/*.test.js` → 1646 pass / 0 fail / 2 skip (preserve v0.10.0 baseline; +1 new pass from Step 4).

## 7. 回滚锚点

- 当前 HEAD: `3f87bf4`
- 一键回滚：`git reset --hard 3f87bf4`（仅当 Implementer 失败时由 orchestrator 触发）
- All five steps are additive (no file deletions, no signature changes to existing exports). Rollback is clean.

## 8. UNREPRODUCIBLE 标记（如适用）

Not applicable in the negative sense — B1's feedback is itself a verification report (GREEN, 9/10), not a defect report. The "partial" item AI-1 is partial **because the reviewer's repro tooling did not exist**, not because the underlying perf work is missing. This plan closes the tooling gap (方向 A) so the next reviewer can directly reproduce the 75-100 worker scenario in a Playwright session and upgrade AI-1 to "closed".

The Round 9 D-validation report (referenced in B1's feedback) independently confirms the engine reaches 7.83x speed at 1020 entities @ 54 FPS via the Node validator path — that is the perf-acceptance evidence; this plan only adds the **second** verification path (in-browser).
