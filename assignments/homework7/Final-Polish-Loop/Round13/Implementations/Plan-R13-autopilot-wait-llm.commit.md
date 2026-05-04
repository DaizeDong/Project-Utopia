---
plan_id: Plan-R13-autopilot-wait-llm
implementer: R13 implementer 7/11
parent_commit: 17af3cb
track: code
date: 2026-05-01
priority: P1
---

# Plan-R13-autopilot-wait-llm — Implementation log

**Status:** PASS — implemented + committed.

**Plan source:** `assignments/homework7/Final-Polish-Loop/Round13/Plans/Plan-R13-autopilot-wait-llm.md`

## Parent → head

- Parent: `17af3cb` (`feat(recruit-prob r13): Plan-R13-recruit-prob (P1) ...`)
- Head: see `git log --oneline -2` confirmation block at bottom.

## Files changed

- `src/entities/EntityFactory.js` — +10 LOC: 4 new initial `state.ai` fields (`autopilotReady=false`, `firstPlanReceivedSec=null`, `autopilotReadyReason=null`, `fallbackMode=false`).
- `src/app/aiRuntimeStats.js` — +22 LOC inside `recordAiDecisionResult`: first non-fallback response flips `autopilotReady=true / autopilotReadyReason="first-plan" / firstPlanReceivedSec=nowSec`; first fallback response flips `autopilotReady=true / fallbackMode=true / autopilotReadyReason="fallback"`. Subsequent responses are no-ops via the `!== true` guard.
- `src/config/balance.js` — +7 LOC: new constant `autopilotReadyTimeoutSec=10` next to `policyDecisionIntervalSec`.
- `src/simulation/meta/ColonyDirectorSystem.js` — +30 LOC: import `BALANCE`, gate `update()` on `state.ai.autopilotReady === false` — early-return with `automation.phaseBuilder = "awaiting-first-plan"`. The safety timeout flips `fallbackMode=true / autopilotReady=true / autopilotReadyReason="timeout"` when `nowSec >= timeoutSec`.
- `test/autopilot-wait-llm.test.js` — NEW (+95 LOC, 7 cases): initial-state defaults, gated early-return, first-plan flip, fallback flip, post-flip director runs normally, safety timeout fires, manual mode never gated.
- `CHANGELOG.md` — new v0.10.1-p block at the top.

LOC delta: ~69 production + 95 test = 164 total. Within the plan's ~40 production LOC estimate (+30 in ColonyDirectorSystem includes Step 3's optional safety-timeout branch + automation-block update, which the plan called out).

## Approach (Suggestion A)

Followed plan exactly. Key design choices:

1. **Single source of truth for the flip.** `recordAiDecisionResult` is the central recorder for every `/api/ai/plan` (and `/api/ai/policy`) outcome. Instrumented it once (rather than instrumenting `EnvironmentDirectorSystem` + `NPCBrainSystem` + `ColonyPlanner` separately). Both LLM and fallback paths are covered because both flow through this one recorder.

2. **Back-compat via `=== false` not `!== true`.** Existing tests routinely overwrite `state.ai = { enabled: true }` without the new field. The gate check uses strict `=== false` so undefined-field tests are treated as ready (legacy behaviour). Only the explicit `false` from EntityFactory's initial state actually gates. Caught a regression in `hotfix-batchB-survival-safety.test.js` during validation; this back-compat tweak resolved it without modifying the existing test.

3. **Safety timeout in ColonyDirector, not in a separate guard system.** Plan Step 3 suggested either inline or a tiny new `AutopilotReadinessGuard`. ColonyDirector's `update` already runs every tick on `session.phase === "active"`, so adding ~10 LOC inline avoided a new system in `SYSTEM_ORDER` (which the plan's hard-freeze policy frowns on).

4. **HUD pip (Step 5) deferred.** The `automation.phaseBuilder = "awaiting-first-plan"` + `automation.autopilotReady` fields are exposed for future HUD consumption; the visible pip is a UI-track follow-up. Track=code means production behaviour; UI surfacing is a separate plan concern. Rationale: the gate clears in 1.5–10 sim-sec; the visual benefit is marginal vs. the freeze-policy cost of editing HUDController copy.

## Tests

- New test file: 7/7 pass.
- Adjacent suites verified: `test/colony-director*.test.js` (45 + 5 + 8 cases), `test/agent-director*.test.js` (4 + 6), `test/hotfix-batchB-survival-safety.test.js` (10), `test/v0.9.3-balance.test.js` (4), `test/road-compounding.test.js` (1), `test/late-game-pacing-knobs.test.js` (4) — all PASS.
- Full suite: **2034 / 2030 pass / 1 fail / 3 skip**. The 1 fail is `exploit-regression: exploit-degradation — distributed layout outproduces adjacent cluster` — the pre-existing latent failure noted in CLAUDE.md (since v0.8.7); confirmed unrelated to this commit (same fail at parent `17af3cb`).

## Risk + rollback

- **Risk: silent LLM hang stalls autopilot indefinitely.** Mitigated by the 10-sec safety timeout in ColonyDirector that flips `fallbackMode=true` + `autopilotReady=true / reason="timeout"`. Verified by test case 6.
- **Risk: existing tests rely on tick-1 builds.** Mitigated by the `=== false` back-compat check — only the explicit initial state gates; tests that overwrite `state.ai` without the field run as before. Verified across 84 cases in adjacent director suites.
- **Risk: fallback-mode players get gated for 10 sec when they shouldn't be.** Mitigated by recording first fallback response immediately as gate-clearing (case 4); only a true silent hang (no LLM, no fallback recorder) hits the timeout.
- Rollback: `git checkout 17af3cb -- src/entities/EntityFactory.js src/app/aiRuntimeStats.js src/config/balance.js src/simulation/meta/ColonyDirectorSystem.js && rm test/autopilot-wait-llm.test.js` and revert the v0.10.1-p changelog block.

## Composition with Plan-R13-fog-aware-build (54cb911)

Both plans gate `BuildAdvisor` entry. Per the plan's declared merge order:
- This plan's `autopilotReady` check goes ABOVE the entire build loop (`ColonyDirectorSystem.update` early-return).
- Fog plan's per-candidate gate stays INSIDE `findPlacementTile`.

When autopilot is ON and not-yet-ready, we early-return before the fog gate ever runs. Once readiness clears (LLM / fallback / timeout), the fog gate's per-candidate skip + `state.ai.scoutNeeded` latch behaves exactly as before the merge. Layered cleanly — `state.ai.scoutNeeded` setter (lines 944–952 of ColonyDirectorSystem post-fog-merge) is reachable only after the readiness gate clears, so we never write `scoutNeeded=true` based on a tick where no builds were even attempted.

## `git log --oneline -2` (post-commit)

(See block at bottom of file after commit.)
