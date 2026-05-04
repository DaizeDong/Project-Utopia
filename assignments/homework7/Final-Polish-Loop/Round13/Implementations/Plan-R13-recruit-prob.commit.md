---
plan_id: Plan-R13-recruit-prob
implementer: R13 implementer 6/11
parent_commit: 5115e14
track: code
date: 2026-05-01
priority: P1
---

# Plan-R13-recruit-prob — Implementation log

**Status:** PASS — implemented + committed.

**Plan source:** `assignments/homework7/Final-Polish-Loop/Round13/Plans/Plan-R13-recruit-prob.md`

## Parent → head

- Parent: `5115e14` (`feat(build-reorder r13): Plan-R13-build-reorder (P1) ...`)
- Head: see commit hash from `git log --oneline -2` confirmation below.

## Files changed

- `src/config/balance.js` — added 3 constants (`recruitFastTrackHeadroomSec=120`, `recruitFastTrackPendingJobs=3`, `recruitFastTrackCooldownMult=0.5`) under the `recruit*` block with commentary citing this plan.
- `src/simulation/population/PopulationGrowthSystem.js` — pre-tick compute of `fastTrackArmed` gate (food headroom for current pop AND `state.constructionSites.length >= 3`), then apply `drainMult = 1 / mult = 2×` to the existing dt drain. Surfaces `state.metrics.recruitFastTrackArmed` boolean for HUD/inspector consumers.
- `test/recruit-fast-track.test.js` — NEW (~110 LOC, 5 cases): baseline / headroom-only / jobs-only / both-armed / mid-tick toggle.
- `CHANGELOG.md` — new v0.10.1-o entry at the top.

LOC delta ≈ 12 (balance.js) + 22 (PopulationGrowthSystem.js) + 110 (test) + ~12 (changelog) ≈ ~156 total, ~34 production LOC. Within ~40 production LOC scope estimate.

## Approach (Suggestion A)

Followed plan exactly: additive cooldown multiplier, no RNG, fully deterministic. Used existing `computeFoodHeadroomSec` helper (already exported from PopulationGrowthSystem) and existing `state.constructionSites` array (canonical pending-build source per grep across the codebase). Gate is re-checked every frame so drain reverts to 1× the moment either condition fails — no latch needed.

One micro-deviation from plan Step 2 wording: plan suggested checking `state?.construction?.blueprintQueue?.length ?? state?.metrics?.pendingBuildJobs ?? 0`. The actual codebase uses `state.constructionSites` — verified via grep. Used the canonical field directly.

## Tests

- New test file: 5/5 pass.
- Adjacent suite (`test/recruitment-system.test.js` + `test/recruit-food-flow-invariant.test.js`): 17/17 pass.
- Full suite: **2027 / 2023 pass / 1 fail / 3 skip**. The 1 fail is `exploit-regression: exploit-degradation — distributed layout outproduces adjacent cluster` — this is the pre-existing latent failure noted in CLAUDE.md (since v0.8.7); confirmed to reproduce at parent commit `5115e14` via `git stash && node --test test/exploit-regression.test.js` (5 pass / 1 fail / 1 skip at parent — identical pattern). Unrelated to this commit.

## Risk + rollback

- Risk: faster ramp could overshoot infraCap or food-runway. Mitigated: both gates re-checked every tick; existing `effectiveCap = Math.min(recruitTargetRaw, infraCap)` and PC-recruit-flow-rate-gate at the spawn branch still apply — fast-track only changes cooldown drain, not cap or food gate.
- Rollback: `git checkout 5115e14 -- src/config/balance.js src/simulation/population/PopulationGrowthSystem.js && rm test/recruit-fast-track.test.js` and revert the v0.10.1-o changelog block.

## `git log --oneline -2` (post-commit)

See terminal output appended at end of session by orchestrator. Confirmed the head commit message `feat(recruit-prob r13): Plan-R13-recruit-prob (P1) ...` precedes parent `5115e14 feat(build-reorder r13): ...`.
