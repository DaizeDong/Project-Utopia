---
plan: Plan-R13-fog-aware-build
round: 13
priority: P0
parent_commit: 8918bb1
track: code
freeze_policy: hard
---

# Plan-R13-fog-aware-build — implementation log

## Status
Implemented. All plan acceptance criteria met. Test baseline preserved (2020 pass / 1 pre-existing fail / 3 skip).

## Parent → head
- parent: `8918bb1` (feat(events r13): Plan-R13-event-mitigation)
- head: see `git log --oneline -2` confirmation below

## Summary

Half (a) — autopilot fog respect was already in place: `BuildAdvisor.evaluateBuildPreview` (since v0.8.0 Phase 3 / M1b) rejects HIDDEN tiles via `isTileHidden` with reason `"hidden_tile"`. The autopilot tile-pickers (`findPlacementTile` etc.) call through `previewToolAt`, so fogged candidates were already silently skipped. The missing piece was a *signal* to the rest of the system that placement attempts failed because no visible tile existed — added as a per-tick latch in `ColonyDirectorSystem.update` that sets `state.ai.scoutNeeded = true` when every attempted build's `findPlacementTile` returned null this tick. Cleared on the next tick where any build succeeds in finding a candidate.

Half (b) — IDLE worker fog-edge bias added via new `pickFogEdgeTileNear(worker, state, services)` helper in `WorkerAISystem.js`. Scans a Manhattan box (default radius 12 from `BALANCE.workerExploreFogEdgeScanRadius`) around the worker, samples up to 24 random offsets, returns the first EXPLORED+passable tile that has at least one HIDDEN 4-neighbour (i.e. on the fog edge). Wired into `WorkerStates.IDLE.tick` BEFORE the existing `pickWanderNearby` call: when `state.ai.scoutNeeded === true` always tries fog-edge first; otherwise tries it stochastically per `BALANCE.workerExploreFogEdgeBiasWeight=0.6`. Falls back to `pickWanderNearby` if no edge in radius. The two halves close the loop: when the autopilot can't build, IDLE workers proactively reveal terrain so the next director tick has visible candidates.

## Files

- `src/simulation/world/VisibilitySystem.js` — added standalone `isTileExplored(state, ix, iz)` export + matching static method on `VisibilitySystem` class.
- `src/simulation/meta/ColonyDirectorSystem.js` — `attemptedBuilds` / `buildsWithNoVisibleTile` counters in the build loop + post-loop latch on `state.ai.scoutNeeded` / `scoutNeededReason`.
- `src/simulation/npc/WorkerAISystem.js` — exported `pickFogEdgeTileNear` helper.
- `src/simulation/npc/fsm/WorkerStates.js` — IDLE.tick imports `pickFogEdgeTileNear` and consults it before falling back to `pickWanderNearby` (always when `scoutNeeded`, stochastically otherwise).
- `src/config/balance.js` — added `workerExploreFogEdgeBiasWeight=0.6` and `workerExploreFogEdgeScanRadius=12`.
- `test/fog-aware-build-r13.test.js` — new test file, 4 cases (isTileExplored × 2, pickFogEdgeTileNear × 2).
- `CHANGELOG.md` — new section under v0.10.1-n.

LOC delta (source only): roughly +80 LOC across 5 source files (matches plan estimate).

## Tests

- New file: `test/fog-aware-build-r13.test.js` — 4 cases, all pass.
- Full suite: `node --test test/*.test.js` → **2020 pass / 1 fail / 3 skip**. Failure is pre-existing `exploit-regression: exploit-degradation — distributed layout outproduces adjacent cluster` (latent since v0.8.7 per CLAUDE.md notes). Verified by stashing my changes and running the same test — still fails on the unmodified baseline (background task `bk0ufcrtr` exited 1).

Adjacent test runs all green:
- `test/fog-visibility.test.js`, `test/fog-aware-build-r13.test.js`, `test/fog-reset-on-regenerate.test.js`, `test/build-advisor*.test.js`, `test/worker-fsm-priority-fsm-tick.test.js` → 9/9 pass.
- `test/worker-fsm*.test.js`, `test/colony-director*.test.js` → 43/43 pass.

## Confirmation
`git log --oneline -2` confirmation in commit step.
