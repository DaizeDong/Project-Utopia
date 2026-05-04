---
reviewer_id: B1-action-items-auditor
plan_source: assignments/homework7/Final-Polish-Loop/Round0/Plans/B1-action-items-auditor.md
round: 0
date: 2026-05-01
parent_commit: 7b4526b
head_commit: 1f1eea5
status: DONE
track: code
freeze_check: PASS
track_check: PASS
steps_done: 4/5
tests_passed: 1651/1659
tests_new:
  - test/long-run-api-shim.test.js (+5 cases — extension, no new file)
---

## Steps executed

- [x] **Step 1**: `src/simulation/population/PopulationGrowthSystem.js` — added `__devForceSpawnWorkers(state, targetCount, rng)` helper. No-op when current >= target; respects `populationInfraCap` when set; warehouse-anchored spawn (matches `RecruitmentSystem.update`'s spawn branch) with `randomPassableTile` fallback when no warehouse exists. Tags spawned workers `isStressWorker = true`. Increments separate `state.metrics.devStressSpawnTotal` counter (does NOT pollute `recruitTotal` / `birthsTotal`). Returns `{ spawned, total, fallbackTilesUsed }`.
- [x] **Step 2**: `src/app/GameApp.js` — imported the helper; added `GameApp.devStressSpawn(target, _options)` instance method right after `loadSnapshot()`. Validates `target` finite; returns `{ ok: false, reason: 'invalid_target' }` on bad input, `{ ok: false, reason: 'no_session' }` when no active session (phase !== 'active'), `{ ok: true, spawned, total, fallbackTilesUsed }` on success. Calls `#recomputePopulationBreakdown()` after spawn.
- [x] **Step 3**: `src/main.js` — added one new method to the `__utopiaLongRun` object literal: `devStressSpawn: (target, options) => app?.devStressSpawn?.(target, options) ?? { ok: false, reason: 'no_session' }`. Located right after `loadSnapshot` to keep snapshot-related shims grouped.
- [x] **Step 4**: `test/long-run-api-shim.test.js` — appended 5 new `test()` cases:
  - `devStressSpawn shim: undefined app yields {ok:false, reason:'no_session'}` (mirrors snapshot-shim no-app pattern)
  - `devStressSpawn shim: passes through {ok:true, spawned, total} from app` (pure-shape mock per existing test pattern)
  - `devStressSpawn shim: target=0 reaches the helper as a clean no-op shape`
  - `__devForceSpawnWorkers helper: no-op when current >= target` (real helper import + minimal state)
  - `__devForceSpawnWorkers helper: missing state is a safe no-op`
- [ ] **Step 5**: SKIPPED — CHANGELOG entry. Implementer spec section 8 explicitly forbids touching CHANGELOG from a code-track commit ("code track 内的 commit 不要顺手碰 CHANGELOG (留给 docs track / Validator)"). The plan's Step 5 conflicts with the implementer spec hard rule; spec wins. Validator (or a future docs-track plan) should add the one-line v0.10.1 unreleased entry.

## Tests

- pre-existing skips: `test/exploit-regression.test.js` road-roi (3 skips), plus 1 other (4 total skipped)
- pre-existing failures (4, all unrelated to this plan):
  - `ResourceSystem flushes foodProducedPerMin when a farm-source emit fires` (pre-existing, economy)
  - `RoleAssignment: with 1 quarry, exactly 1 worker gets STONE role` (pre-existing, role assignment)
  - `RaidEscalator: DI=30 yields tier 3 (v0.8.5 log curve)` (pre-existing, raid balance)
  - `RaidFallbackScheduler: pop < popFloor does not trigger (defense-in-depth)` (pre-existing, raid)
- new tests added: 5 cases inside `test/long-run-api-shim.test.js` (file goes 17 → 22 cases, all green)
- failures resolved during iteration: none — tests passed first run
- baseline target was "1646 pass / 0 fail / 2 skip" per plan's Step 6 expectation; actual upstream baseline drift to 1646 + 5 new = 1651 pass and the 4 fails are pre-existing per orchestrator's runtime context (parent_commit 7b4526b is downstream of CLAUDE.md's last-known clean baseline).

## Deviations from plan

1. **Step 5 SKIPPED** (see above) — implementer spec section 8 hard rule overrides the plan.
2. **Helper signature naming**: plan specified `__devForceSpawnWorkers(state, targetCount, rng)` — followed exactly. Plan also said worker filter should use `kind === 'worker'`; actual code uses `type === 'WORKER'` (the convention used everywhere else in the codebase, e.g. `GameApp.setExtraWorkers` line 754, `WorkerAISystem` line 1951, `applyPopulationTargets` line 790). Followed the codebase convention.
3. **Spawned workers are tagged `isStressWorker = true`** — not strictly required by the plan but mirrors the existing `setExtraWorkers` pattern (line 764) so downstream telemetry / debug overlays can distinguish dev-stress-injected workers from organically recruited ones. Additive; harmless if any caller ignores the tag.
4. **Helper imports**: the plan's Step 1 said "reuse the existing recruit-spawn branch's spawn factory". The actual recruit branch inlines `createWorker(pos.x, pos.z, rngNext)` rather than going through a separate factory function, so the helper does the same — same call shape, no new abstraction.

## Freeze / Track check 结果

- **Freeze check: PASS** — extends an existing debug API (`window.__utopiaLongRun`) per the plan's explicit freeze-check note. No new tile / role / building / mood / mechanic / audio asset / UI panel. New `state.metrics.devStressSpawnTotal` counter is a metric-namespace addition, not a freeze-tracked surface.
- **Track check: PASS** — only `src/**` and `test/**` files touched (4 total: 3 in `src/`, 1 in `test/`). README / CHANGELOG / docs / assignments all untouched (Step 5 skipped to honour the spec).

## Handoff to Validator

**Recommended verification**:
1. **Headless smoke**: `node --test test/long-run-api-shim.test.js` → expect 22/22 pass.
2. **Full suite**: `node --test test/*.test.js` → expect 1651 pass / 4 pre-existing fail / 4 skip; +5 over baseline 1646 pass.
3. **In-browser repro** (closes the original AI-1 gap):
   - `npx vite` → open `http://127.0.0.1:5173/` → Start Colony.
   - DevTools console: `__utopiaLongRun.devStressSpawn(75)` → expect `{ ok: true, spawned: ~63, total: 75, fallbackTilesUsed: 0 }` (assuming ~12-worker baseline + ≥1 warehouse).
   - `__utopiaLongRun.getTelemetry()` → confirm `population.workerCount ≈ 75`.
   - Switch ultra-speed (8x); observe `getTelemetry().performance.fps` over 30s → expect ≥30 FPS sustained (Round-9 acceptance bar).
4. **No-session guard**: before clicking Start Colony, call `__utopiaLongRun.devStressSpawn(75)` → expect `{ ok: false, reason: 'no_session' }`.
5. **Invalid target guard**: `__utopiaLongRun.devStressSpawn('foo')` → expect `{ ok: false, reason: 'invalid_target' }`.
6. **Prod build**: `npx vite build` → no errors. `npx vite preview` 3-min smoke → no console errors. `__utopiaLongRun.devStressSpawn` should be defined (always-on shim, matches `__utopiaLongRun` always-exposed contract; only `__utopia` is dev-mode-gated).
7. **CHANGELOG entry to be added by docs-track validator/closeout**: one-line under v0.10.1 unreleased — `dev: __utopiaLongRun.devStressSpawn(target) — fast-fill worker count for in-browser perf stress repro (closes AI-1 verification gap from HW7 Final-Polish-Loop Round 0).`

**Risk surface for D-validator attention**:
- `__devForceSpawnWorkers` deliberately does NOT bypass `populationInfraCap` — preserving the documented balance invariant. A reviewer expecting "200 workers no matter what" will see `{ spawned: <less>, total: <less> }` honestly clamp; this is by design.
- Spawn helper increments `state.metrics.devStressSpawnTotal` — should NOT appear in long-horizon-bench output (the bench never calls this shim).
- `isStressWorker = true` tag is set; if any downstream telemetry or AI policy treats stress workers differently (e.g. `setExtraWorkers` zero-cost upkeep — see GameApp:765-768 which sets `hunger=1, rest=1, morale=1`), the helper does NOT set those — stress workers from `devStressSpawn` start with default needs. This is intentional: the goal is to reproduce real worker load, not idealized patrols.
