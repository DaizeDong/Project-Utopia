---
plan: Plan-PM-delete-animal-combat-metrics-twin.md
reviewer_id: PM-deep-perf
reviewer_tier: A
round: 7
priority: P0
track: code
parent_commit: d2b864e
date: 2026-05-01
---

# PM-delete-animal-combat-metrics-twin — Implementation Log

## Status

SHIPPED. Surgical deletion executed. Net negative LOC achieved. Zero new test failures.

## Parent → Head

- parent_commit: `d2b864e` (PL-terrain-min-guarantee)
- head_commit: see `git log --oneline -2` confirmation below

## Files Touched

1. `src/simulation/npc/AnimalAISystem.js` — deleted 42-line inline combat-metrics block (lines 1215-1256), replaced with 8-line provenance comment. Net **-34 LOC**.
2. `CHANGELOG.md` — added v0.10.2-r7-PM unreleased entry under existing R7 cluster.

## Verification

- **Grep audit (Step 2):** `recomputeCombatMetrics` / `metrics.combat` only writers post-deletion are `MortalitySystem.recomputeCombatMetrics` + `recomputeCombatMetricsThrottled` (R6 PK canonical) and `NPCBrainSystem` (policy-delta merge). All readers (`ColonyPlanner`, `ThreatPlanner`, `RoleAssignmentSystem`, `NPCBrainAnalytics`) tolerate the throttle window.
- **Test files referencing AnimalAISystem:** none assert on `state.metrics.combat` after `AnimalAISystem.update` (verified `Grep "metrics.combat"` empty in `animal-ecology.test.js`, `v0.10.0-c-fsm-trace-parity.test.js`).
- **Focused test run** (10 combat/animal/role files): 44 pass / 0 fail / 0 skip.
- **Full test run:** 1920 tests / 1911 pass / 5 fail / 4 skip — IDENTICAL to parent `d2b864e` (verified by `git stash && node --test test/*.test.js` rerun). All 5 failures pre-existing on parent (ResourceSystem flush, RoleAssignment quarry, RaidEscalator DI=30, RaidFallback popFloor, Fallback planner recruit-step). Zero new failures introduced.

## Plan Step Status

- Step 1: VERIFIED — block confirmed anonymous inline at lines 1215-1256.
- Step 2: VERIFIED — Grep confirms zero callers, MortalitySystem is canonical writer, deleted twin missed `activeSaboteurs`.
- Step 3: DONE — block deleted in full.
- Step 4: DONE — 8-line provenance comment inserted.
- Step 5: SKIPPED — plan-permitted (the deletion is its own invariant; R6 PK `combat-metrics-throttle.test.js` already enforces MortalitySystem-as-sole-writer behavior). Adding a duplicative test would have inflated LOC against the net-negative goal.
- Step 6: DONE — CHANGELOG updated.

## Behaviour Notes

- The deleted twin was strictly **inferior** to MortalitySystem's writer — it never counted `activeSaboteurs`, so a saboteur-only threat reaching `state.metrics.combat` via the AnimalAISystem path would have shown `activeThreats=0` and missed GUARD draft signals. Deleting it is a quiet correctness win on top of the perf win.
- One-tick staleness risk (Risk #1 in plan): mitigated because R6 PK throttle is the documented canonical path; readers already tolerate it.
- Estimated runtime saving per PM measurement: ~2.0 ms/tick avg on AnimalAISystem at 80-worker / 6-hostile bench profile.

## Test Confirmation

- Pre-change baseline (parent `d2b864e`): 1920 tests / 1911 pass / 5 fail / 4 skip.
- Post-change result: 1920 tests / 1911 pass / 5 fail / 4 skip.
- Delta: 0 new failures, 0 new passes (no new tests added). Net change is purely deletion + provenance comment.
