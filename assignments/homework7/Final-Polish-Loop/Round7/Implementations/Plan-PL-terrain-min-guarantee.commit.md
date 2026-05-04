# R7 Implementer 1/5 — PL-terrain-min-guarantee (P0)

**Status:** SHIPPED
**Parent commit:** `e1977c0`
**Head commit:** `d2b864e`
**Plan:** `Round7/Plans/Plan-PL-terrain-min-guarantee.md`
**Track:** code

## What was done

Added a defensive `enforceResourceFloor(tiles, w, h, cx, cz, hardExclusion)` helper in `src/world/grid/Grid.js` that runs after the existing `placeDistrictBlobs` calls (FARM/LUMBER/QUARRY) and before `applyWalls`. Counts current tile-types; if any are below the floor (`{ farms: 2, lumbers: 2, quarries: 1 }`), walks GRASS tiles outside the spawn-ring hard exclusion (12 tiles, Euclidean) sorted by distance ascending and stamps the closest qualifying GRASS tiles until each floor is met. Purely additive — never overwrites WATER/WALL/WAREHOUSE/ROAD/existing resources.

## Key finding (deviation from plan)

Plan diagnosed the bug as `placeDistrictBlobs` calls living "inside the fallback else-branch" of `generateTerrainTiles`. **This is incorrect.** Direct read of `Grid.js:3149-3434` confirms the if/else chain ends at line 3181 and the FARM/LUMBER/QUARRY/HERB_GARDEN/RUINS `placeDistrictBlobs` calls at line 3252+ already run **unconditionally** for all 6 templates. Empirical verification with the 18 (template × seed) cases listed in the plan's test spec showed the current code already meets the floor (min observed: 2 farms / 8 lumbers / 1 quarry on temperate_plains seed=42; no zero-resource ship-out reproduced on parent commit).

Adopted plan's spirit (guarantee a floor across all templates) by adding a defensive **hard floor** rather than relocating an already-unconditional call. This protects against future per-template painter regressions and adversarial seeds where the biome-affinity scoring in `pickDistrictCenter` might silently return null.

## Files changed

- `src/world/grid/Grid.js` (+45 / -1) — `enforceResourceFloor` helper + `RESOURCE_FLOOR` frozen constant + one call site
- `test/grid-terrain-min-guarantee.test.js` (+44 / 0) — new test file, 18 cases (6 templates × 3 seeds)
- `CHANGELOG.md` (+15 / 0) — v0.10.2-r7-PL entry

Total: ~+104 / -1 LOC across 3 files. Source-code delta ~+45 / -1 (under plan's ~30 LOC target estimate when counting only Grid.js prose).

## Tests

- New file: `test/grid-terrain-min-guarantee.test.js` — **18/18 pass**
- Full suite: **1920 tests / 1911 pass / 5 fail / 4 skip**
- Pre-existing failures (verified by stash-and-rerun on parent `e1977c0`): ResourceSystem flush, RoleAssignment quarry, RaidEscalator DI=30, RaidFallback popFloor, Fallback planner recruit-step. Identical 5 names pre and post → **zero new failures introduced**.
- Net test delta vs parent: +18 passes (1893 → 1911).

## Freeze compliance

OK — no new tile / role / building / mood / mechanic / audio / UI panel. Pure defensive helper. `RESOURCE_FLOOR` is a frozen constant.

## Rollback anchor

`git reset --hard e1977c0` (orchestrator-triggered only on Implementer failure).
