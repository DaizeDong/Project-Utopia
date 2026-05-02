# PG-bridge-and-water — R6 Implementation Log

**Status:** completed.
**Track:** code only.
**Parent commit:** `351bff6` (refactor(arch round-5): C1-build-proposer …)
**Head commit (will be):** populated after `git commit` lands.

## Summary

P0 fix for the user's two coupled bridge / water-pathfinding complaints.

- **F1 (workers can't build bridges)** — `SEEKING_BUILD.onEnter` and `BUILDING.onEnter` now split the BUILDER's navigation target ("stand-on tile", a 4-neighbour land tile when the site is on impassable WATER) from the construction target (the actual site coordinates, stashed in `worker.fsm.payload.{siteIx,siteIz,adjacentArrival}`). `arrived()` (state body) and `arrivedAtFsmTarget` (transition predicate) accept `Manhattan ≤ 1` from the site coords when `payload.adjacentArrival === true`, leaving strict-equality semantics for every other state. `fsmTargetGone` looks up the construction site by `payload.siteIx/siteIz` instead of the navigation target so the SEEKING_BUILD/BUILDING transitions don't bounce immediately to IDLE. `BUILDING.tick` gates `applyConstructionWork` on `arrived(...)` so a still-walking worker doesn't silently complete a bridge from across the map.
- **F2 (AI road planner stops at the water edge)** — `roadAStar` now admits TILE.WATER as a neighbour at `BRIDGE_STEP_COST = max(5.0, BUILD_COST.bridge.wood + BUILD_COST.bridge.stone)` so a land path is preferred when one exists; `reconstructPath` tags each step with `type: 'bridge' | 'road'`; `planRoadConnections` consumes both GRASS and WATER tiles when building `roadSteps`; `roadPlansToSteps` and `planLogisticsRoadSteps` propagate the per-step type. `ColonyPlanner.planFallbackPlan` now emits a `bridge` step kind for `rs.type === "bridge"` instead of hardcoding `"road"` (the latter would be rejected by BuildSystem with `waterBlocked`).

## Files changed

| File | Net LOC | Purpose |
|------|---------|---------|
| `src/simulation/construction/ConstructionSites.js` | +27 / -2 | New `getBuildStandTile(grid, site)` helper |
| `src/simulation/npc/fsm/WorkerStates.js` | +66 / -8 | Stand-on tile + payload in SEEKING_BUILD/BUILDING; Manhattan ≤ 1 in `arrived` |
| `src/simulation/npc/fsm/WorkerConditions.js` | +29 / -3 | Adjacent-arrival in `arrivedAtFsmTarget`; payload-aware `fsmTargetGone` |
| `src/simulation/ai/colony/RoadPlanner.js` | +60 / -12 | WATER admitted to A* with bridge step cost; per-step type tagging |
| `src/simulation/ai/colony/ColonyPlanner.js` | +6 / -3 | Honour `rs.type === "bridge"` in fallback planner step emission |
| `test/construction/bridge-completes.test.js` | +120 / 0 (new) | F1 regression — BUILDER on shore completes bridge; helper shape contract |
| `test/world/pathfinding/road-astar-bridge-interleave.test.js` | +56 / 0 (new) | F2 regression — A* crosses water with bridge step + still detours when land exists |
| `CHANGELOG.md` | +18 / 0 | v0.10.2-r6-PG entry under [Unreleased] |

Total src delta: **+194 / -26 LOC = 168 net**. Plan estimated ~75; over-delivered because the transition predicates (`arrivedAtFsmTarget`, `fsmTargetGone`) needed parallel adjacent-arrival branches alongside the state-body `arrived()` helper — without them the SEEKING_BUILD → BUILDING transition never fired.

## Tests

- **New:** 4 cases across 2 files, all pass.
- **Full-suite baseline:** 1895 tests / 1885 pass / 6 fail (all pre-existing on parent `351bff6` per the stash-then-rerun probe — ResourceSystem flush, RoleAssignment quarry, RaidEscalator DI=30, RaidFallback popFloor, Fallback planner recruit-step, HUDController score+dev tooltip) / 4 skip. Net **+2 passes** vs parent. Zero new failures.
- **Targeted regression sweep (96 tests):** `astar.test.js`, `road-compounding.test.js`, `road-network.test.js`, `road-planner.test.js`, `v0.10.0-a/b/c-fsm-*`, `visitor-fsm-invariants.test.js`, `worker-fsm-doc-contract.test.js`, `navigation-repath.test.js`, `build-system.test.js`, `construction-in-progress.test.js`, plus the two new tests — all 96 green.

## Notable design decisions

1. **Two predicates, not one.** Both the `arrived()` state-body helper AND the `arrivedAtFsmTarget` transition predicate had to learn the adjacent-arrival branch — the former gates `BUILDING.tick`'s work application, the latter gates the `SEEKING_BUILD → BUILDING` transition itself. Forgetting the latter (which I did first) meant the BUILDER reached the shore but never transitioned to BUILDING and just stood still. Caught by the regression test.

2. **Payload reset on every transition.** PriorityFSM's `_enterState` wipes `entity.fsm.payload` on every transition (per `PriorityFSM.js:111-120`). That's why both `SEEKING_BUILD.onEnter` AND `BUILDING.onEnter` re-derive the stand-on tile + adjacent flag — the SEEKING_BUILD payload doesn't survive into BUILDING. `findOrReserveBuilderSite` is idempotent so the double call is cheap (the site already has `builderId` set; the second call returns the same site).

3. **5× land-step floor for water.** `BRIDGE_STEP_COST` floors at 5.0 (4 wood + 1 stone = 5 in v0.10) so the A* cannot pick water as a tie-breaker on land-reachable plans. The "all-land detour preferred" regression test pins this.

4. **Mid-ocean orphan blueprints.** `getBuildStandTile` returns `null` only when the site is impassable AND no 4-neighbour is passable. The SEEKING_BUILD.onEnter falls back to the site tile in that case, preserving the old failure mode (BUILDER cycles forever) so the planner — which should never produce mid-ocean blueprints — gets the visible signal. A future tertiary fix in `BuildAdvisor` (mentioned in the feedback) can outright reject mid-ocean placement.

## Confirm

```
$ git log --oneline -2
<populated below after commit>
```
