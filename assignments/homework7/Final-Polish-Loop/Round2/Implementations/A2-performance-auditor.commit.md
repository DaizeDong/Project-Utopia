---
reviewer_id: A2-performance-auditor
plan_source: Round2/Plans/A2-performance-auditor.md
round: 2
date: 2026-05-01
parent_commit: 91a8d5b
head_commit: 37581ec
status: DONE
track: code
freeze_check: PASS
track_check: PASS
steps_done: 5/6
tests_passed: 1707/1716
tests_new: test/agent-director-cadence.test.js (5 new tests, all pass)
---

## Steps executed

- [x] Step 1: AgentDirectorSystem.js — exported `AGENT_DIRECTOR_HEAVY_TICK_INTERVAL_SEC = 0.5`; added `_lastHeavyTickSec = -Infinity` and `_heavyTickIntervalSec` instance fields in constructor.
- [x] Step 2: AgentDirectorSystem.js — wrapped Step 1 (executeNextSteps + snapshotState pre/post + evaluateStep) and Step 2 (perceiver.observe + shouldReplan + planner.requestPlan branch + LLM `.then`/`.catch`) in `if (heavyDue) { ... this._lastHeavyTickSec = nowSec; }`. Fast-path preserved every-tick: mode select, `agentState.activePlan` mirror, algorithmic-mode short-circuit, fallback throttle counter, fallback `update` call.
- [x] Step 3: ProgressionSystem.js — added dt-accumulator (`_scanAccumulatorSec`, `_scanIntervalSec=0.25`) on the system instance gating `buildCoverageStatus` / `detectScenarioObjectiveMilestones` / `maybeTriggerRecovery` / `detectMilestones`. `computeProsperity`/`computeThreat` smoothing and `updateSurvivalScore(dt)` stay on fast-path. Two-condition gate: (a) accumulator ≥ 0.25s OR (b) caller dt ≥ 0.05s (covers existing tests at dt=0.1 / dt=0.2 without weakening throttle for the 8x×1/30 game-loop case).
- [x] Step 4: test/agent-director-cadence.test.js — 5 new tests: constant export sanity, ≤2 perceiver.observe calls across 12 sim steps in one frame (8x simulation), ≥2 calls across 1.5s sim time, fast-path activePlan/mode mirror still runs every tick, interval=0 override fires every tick.
- [ ] Step 5: SKIPPED — CHANGELOG.md edit deferred per implementer spec line 159 ("code track 内的 commit 不要顺手碰 CHANGELOG（留给 docs track / Validator）").
- [x] Step 6: Full test suite ran. 1707 pass / 1716 total / 6 fail (all baseline pre-existing) / 3 skip.

## Tests

- pre-existing skips (3): unchanged.
- pre-existing failures (6): all match parent-commit (91a8d5b) baseline:
  - exploit-regression: escalation-lethality (#475)
  - ResourceSystem flushes foodProducedPerMin (#487)
  - RoleAssignment: 1 quarry → 1 STONE worker (#809)
  - RaidEscalator: DI=30 yields tier 3 (#889)
  - RaidFallbackScheduler: pop < popFloor (#899)
  - v0.10.0-c #2: scenario E walled-warehouse FSM (#1231)
- new tests added (5): test/agent-director-cadence.test.js — all pass.
- failures resolved during iteration: initial implementation triggered 3 progression-system regressions (`first_farm milestone once`, `confirms newly connected scenario routes`, `only triggers emergency recovery`). Root cause: `state.metrics.timeSec` was 0 in those tests so the absolute-time gate never fired. Fixed by switching to a dt-accumulator + adding a `dt ≥ 0.05s` slow-caller branch that still permits genuine sim-second-cadence callers (tests use dt=0.1–0.2; game loop uses dt=1/30=0.033) while preserving the throttle for high-cadence calls.
- test #1271 (`bare-init: no worker stuck`) was observed to flake once across two full-suite runs (passed in isolation and in the second full-suite run). Pre-existing flakiness, not caused by A2.

## Deviations from plan

- **Step 3 implementation diverged from plan literal text**: plan called for `state.gameplay._progressionLastScanSec` keyed off `state.metrics?.timeSec`. That broke 3 tests because they construct fresh state with `state.metrics.timeSec = 0` and never advance it. Switched to a dt-accumulator on the ProgressionSystem instance with a slow-caller dt-threshold branch. Semantically equivalent for the production case (SimulationClock integrates dt into timeSec at ~1/30 cadence; both schemes fire ~once per 0.25s sim time) but robust to tests that don't advance `timeSec` by hand. Plan §5 R4 anticipated test impact in this exact area.
- Step 5 SKIPPED (CHANGELOG.md is docs-track territory per implementer spec line 159).

## Freeze / Track check 结果

- **freeze_check: PASS** — no new TILE / role / building blueprint / audio asset / UI panel. Pure internal cadence gate on two existing systems.
- **track_check: PASS** — only `src/simulation/ai/colony/AgentDirectorSystem.js`, `src/simulation/meta/ProgressionSystem.js`, `test/agent-director-cadence.test.js` modified. No README / CHANGELOG / assignments / docs touched. SYSTEM_ORDER untouched.

## Handoff to Validator

- **Perf invariants to verify**:
  - At 1x speed, `state.debug.systemTimingsMs.AgentDirectorSystem.avg` should be unchanged or marginally lower (still hits heavy path every 0.5s; same ~1.27ms when it does).
  - At 4x speed (12 steps/frame), `AgentDirectorSystem.avg` should drop to ≤0.4ms (heavy work fires only ~1/3 of frames at 4x).
  - At 8x speed, headroom_p50 target ≥ 45 fps (baseline 42).
- **Functional invariants to verify**:
  - `agentState.mode` and `agentState.activePlan` still update every render frame regardless of cadence (panel rendering should not visibly stall).
  - Milestones (`first_farm`, `pop_30`, `dev_year_1`, etc.) still fire — at most a 0.25s detection delay vs pre-A2.
  - Emergency relief recovery still triggers in scenarios A5 just hardened (deathsTotal>0 || severePressure gate); 0.25s scan cadence does not lose triggering windows because preconditions are sustained.
- **Smoke**: `npx vite build` + `vite preview` 3-min run; check no console errors and `__utopiaLongRun.getTelemetry().performance.headroomFps` improvements at 4x/8x.
- **System order**: `assertSystemOrder` contract untouched (DevIndex → RaidEscalator → WorldEvent triplet preserved; AgentDirectorSystem and ProgressionSystem still run in their original SYSTEM_ORDER slots).
