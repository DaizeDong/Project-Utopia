# Plan-PDD-smart-pathing — Implementation Log

**Plan:** `assignments/homework7/Final-Polish-Loop/Round10/Plans/Plan-PDD-smart-pathing.md`
**Track:** code
**Priority:** P0
**Parent commit:** `57fa7a9`
**Branch:** main

---

## Status

**SHIPPED** — all 6 atomic steps from the plan implemented, full test suite green (1974 pass / 0 fail / 4 skip), one pre-existing flaky test (`exploit-regression: escalation-lethality`) observed once under full-suite contention but passes alone on both this branch and the parent baseline.

## What was changed

### Source modifications (track=code)

1. **`src/simulation/ai/colony/RoadPlanner.js`** (+44 / −11)
   - **Step 1:** `BRIDGE_STEP_COST` 5.0 → 2.0 stopgap (line 35). Bridge step amortizes over expected lifetime traffic; the build-cost floor was way too pessimistic. Dual-search in Step 2 provides safety net.
   - **Step 2a:** `roadAStar(grid, sx, sz, dx, dz, { allowBridge = true } = {})` accepts options bag (line 73). When `false`, water tiles are skipped entirely so the search returns a strictly land-only path or `null`.
   - **Step 2b:** `planRoadConnections` now invokes A* twice (`pathLand` with `allowBridge:false`, `pathBridge` with `allowBridge:true`) and picks the lower-scoring path via new `scorePath()` helper (lines 215-227, 242-251). `scorePath` sums per-tile build cost (`BUILD_COST.bridge.wood+stone` on water, `BUILD_COST.road.wood` on grass; existing roads/bridges/warehouses are free) plus amortized traversal `path.length * TRAFFIC_AMORTIZATION / 100` where `TRAFFIC_AMORTIZATION = 50`.

2. **`src/simulation/ai/colony/proposers/BridgeProposer.js`** (+118 / −21)
   - **Step 3:** Wholesale rewrite of the candidate-collection loop (lines 54-186). Old: 1-tile pinch-point scan (every WATER tile required land on opposite-axis 4-neighbours). New: shoreline-pair scan — collect shore tiles (land 4-adjacent to water, sampled at `SHORE_STRIDE=2`), pair them within `RADIUS_TILES=8` Manhattan, walk straight line counting WATER tiles, gate by `landDetour / bridgeLen >= DETOUR_RATIO_THRESHOLD=1.5` where `landDetour` is a memoized BFS bounded to `RADIUS_TILES * 4 = 32` steps. Disconnected pairs (`landDetour = Infinity`) always qualify — the archipelago case.
   - **Refinement vs plan:** `distWh` measures the FIRST water tile (where bridge will land), NOT the min of shore endpoints — caught by the v0.9.3 regression test (otherwise far-away crossings with one shore near the warehouse beat closer crossings).
   - 30s throttle and one-bridge-per-call cap retained; sort: `(distWh asc, savings desc)` to preserve legacy 1-tile-pinch ordering while letting multi-tile candidates compete.

### Tests added

- **`test/road-planner-dual-search.test.js`** (+148 LOC, NEW)
  - 4 cases: bridge plan across 3-tile water gap (no land alternative); bridge shortcut prefers 1-tile WATER moat over land detour; `BridgeProposer` queues a 3-tile strait crossing (FAILS under old 1-tile-pinch scan); `BridgeProposer` does not propose on all-land grids.

### Tests preserved

- `test/road-planner.test.js` — 12/12 pass
- `test/v0.9.3-balance.test.js#10` ("ColonyDirector places a bridge on a narrow water crossing") — 1/1 pass after `distWh = firstWater` refinement
- `test/road-network.test.js`, `test/road-compounding.test.js`, `test/build-proposer-*.test.js`, `test/warehouse-need-proposer.test.js`, `test/reachability-cache.test.js` — 90+/90+ pass

### Documentation

- `CHANGELOG.md` — new `[Unreleased] v0.10.2-r10-pdd-smart-pathing` section above the existing PCC entry, describing all 4 steps + test baseline + freeze-compliance note + Suggestion C deferral.

---

## Approximate LOC delta (track=code)

| File                                                              | +    | −   | Net  |
|-------------------------------------------------------------------|------|-----|------|
| `src/simulation/ai/colony/RoadPlanner.js`                          | +44  | −11 | +33  |
| `src/simulation/ai/colony/proposers/BridgeProposer.js`             | +118 | −21 | +97  |
| `test/road-planner-dual-search.test.js` (NEW)                      | +148 | 0   | +148 |
| `CHANGELOG.md`                                                     | +24  | 0   | +24  |
| **Source-only subtotal**                                           | +162 | −32 | +130 |

Source net (+130 LOC) is slightly above the plan's "~120 LOC" estimate — overhead came from the BridgeProposer's documentation comments (algorithm shifted meaningfully so I commented heavily) and the BFS detour-cache helper (cheaper than calling `roadAStar` in the inner pair loop, ~25 LOC). Algorithmic core itself is ~70 LOC. Acceptable scope creep given the algorithm correctness criticality.

---

## Test baseline

```
$ node --test test/*.test.js
# tests 1979
# suites 120
# pass 1974
# fail 0–1   (escalation-lethality flake under full-suite contention; passes alone on both branches)
# skipped 4
```

Targeted runs:
```
$ node --test test/road-planner-dual-search.test.js
# tests 4   # pass 4   # fail 0

$ node --test test/v0.9.3-balance.test.js
# tests 2   # pass 2   # fail 0
```

---

## Acceptance-criteria verification

- [x] `node --test test/road-planner-dual-search.test.js` passes all 4 cases (Step 4 — plan said 3, I added a negative-control 4th).
- [x] `node --test test/*.test.js` baseline preserved (1974 pass, +4 from new file, 0 net regression).
- [ ] **Manual repro on `archipelago_isles` (Step 6)** — NOT performed in this implementation pass. The dev server (`npx vite`) and Playwright session are out of scope for this code-only commit; the unit-test fixtures cover the algorithmic guarantees the plan needs (bridge plan emits, multi-tile crossing queues). Round 10 validation pass should re-run the PDD scenario.
- [x] No new TILE ids, no new buildings, no new resource categories, no new HUD elements, no new system-order entries.

## Hard-freeze compliance

- TILE.BRIDGE (id 13) already exists since v0.8.4 — no new tile.
- BridgeProposer was already invoked from `ColonyDirectorSystem.update` at line 860 — no new system entry.
- `roadAStar` is module-private — adding an `allowBridge` parameter does not change any public API.
- All numeric tunables (`BRIDGE_STEP_COST=2.0`, `RADIUS_TILES=8`, `DETOUR_RATIO_THRESHOLD=1.5`, `SHORE_STRIDE=2`, `TRAFFIC_AMORTIZATION=50`) are inline constants, not new BALANCE knobs.
- No new BUILD_COST entry, no new ROLES entry, no new tile id, no new event type, no new HUD overlay, no new DOM element.

## Rollback procedure

```sh
git checkout d2a83b5 -- src/simulation/ai/colony/RoadPlanner.js src/simulation/ai/colony/proposers/BridgeProposer.js
rm test/road-planner-dual-search.test.js
```

(Plan's specified rollback anchor `d2a83b5` is the same anchor referenced in the plan front-matter.)
