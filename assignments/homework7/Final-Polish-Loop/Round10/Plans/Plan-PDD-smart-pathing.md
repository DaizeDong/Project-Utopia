# Plan-PDD-smart-pathing — Dual-Search Road Planning + Multi-Tile Bridge Sequences

**Plan ID:** Plan-PDD-smart-pathing
**Source feedback:** `assignments/homework7/Final-Polish-Loop/Round10/Feedbacks/PDD-road-bridge-smart-pathing.md`
**Track:** code (planner architecture; A* cost model + proposer generalisation)
**Priority:** P0 (archipelago scenarios are functionally unplayable — 81% water, zero bridges placed in 3 minutes despite "causeway" labels naming them)
**Freeze policy:** hard
**Rollback anchor:** `d2a83b5`
**Estimated scope:** ~120 LOC across 2 files (RoadPlanner.js + BridgeProposer.js)

---

## Problem statement (one paragraph)

The user reports — correctly — that road planning ignores bridges as shortcuts even on archipelago maps where straight bridge crossings would be the shortest path. Two layers of bug: (1) `BridgeProposer.js:60-79` only places bridges on 1-tile pinch points (requires land on both N/S OR both E/W neighbours of every candidate WATER tile), so 2+ tile straits are structurally invisible; and (2) `RoadPlanner.js:26-33` sets `BRIDGE_STEP_COST = max(5, woodCost+stoneCost) = 5.0`, meaning A* treats 1 bridge step as equivalent to a 5-tile grass detour while ignoring that workers will traverse the result thousands of times forever. Live evidence: archipelago_isles run at t=3:01 with 1302 grass / 5604 water tiles, zero warehouses placed, workers stuck "Hungry / Wander hungry" because the colony cannot route off-island. Direct A* port to the page found 2 of 5 grass↔grass pairs would be 4 tiles shorter via bridge but tied on cost — A* tiebreak resolved toward going around. The user's exact ask — "do two searches (with/without obstacles), comprehensively pick best" — is the architecturally correct fix.

## Hard-freeze posture

NO new tile / role / building / mood / mechanic / audio / UI panel. Touch only:
- One BALANCE-style numeric constant in `RoadPlanner.js` (`BRIDGE_STEP_COST` 5→2 stopgap).
- One `roadAStar` invocation pattern in `planRoadConnections` (call twice with `allowBridge:false`/`true`, score, pick lower).
- One `roadAStar` parameter (`{ allowBridge }` flag — already accepted as an options object internally per the feedback's snippet, just exposed at the call site).
- One generalisation of `BridgeProposer.proposeBridgesForReachability` from "1-tile pinch point scan" to "shoreline-pair multi-tile sequence scan." Same function, broader candidate set; existing 30s throttle and one-bridge-per-call cap retained.

No new TILE id (bridges already exist as TILE.BRIDGE=13 since v0.8.4). No new building. No new system order entry. No new HUD overlay. The fix is entirely inside the road-planning pipeline that already exists.

---

## Atomic steps

### Step 1 — Lower `BRIDGE_STEP_COST` 5 → 2 (stopgap, lands first)

**File:** `src/simulation/ai/colony/RoadPlanner.js:26-33`

**Before:**
```js
const BRIDGE_STEP_COST = (() => {
  const c = BUILD_COST?.bridge ?? {};
  const total = Number(c.wood ?? 0) + Number(c.stone ?? 0); // 3 + 1 = 4
  return Math.max(5.0, total); // → 5.0
})();
```

**After:**
```js
// PDD R10: bridge step amortizes over expected lifetime traffic. Lower than build-cost
// floor so a 1-bridge shortcut wins against ≥2 grass detour. Floor 2.0 still 2× grass step.
const BRIDGE_STEP_COST = 2.0;
```

This unblocks the 2/5 cases the live trace identified as "4 tiles shorter, tied on cost." A* now prefers the bridge variant in those cases. Risk: A* may pick water freely on land-reachable plans; mitigate by Step 2's affordability gate AND `BridgeProposer.canAfford` (line 52, existing).

### Step 2 — Add `allowBridge` flag to `roadAStar` and dual-search in `planRoadConnections`

**File:** `src/simulation/ai/colony/RoadPlanner.js` — `roadAStar` function (cost-function block ~lines 124-131) and `planRoadConnections` (line 211).

**Step 2a — Plumb the flag through `roadAStar`:**

If `roadAStar(grid, sx, sz, dx, dz, options)` already accepts an options object (typical for the planner family — verify by grep), add `allowBridge` to the options destructure with default `true` (preserves current behaviour for any other caller):

```js
function roadAStar(grid, sx, sz, dx, dz, { allowBridge = true } = {}) {
  // ...existing setup
  // In the neighbour-expansion loop, when considering a WATER tile:
  if (tileType === TILE.WATER) {
    if (!allowBridge) continue; // skip water entirely in landOnly mode
    stepCost = BRIDGE_STEP_COST;
  }
  // ...rest of cost function unchanged
}
```

If `roadAStar` does NOT currently accept an options bag, wrap the existing positional signature: keep the old signature working and add a new overload that takes options as the 6th arg. Do NOT rename — preserve binary compatibility with any other call site.

**Step 2b — Dual-search in `planRoadConnections`:**

**File:** `src/simulation/ai/colony/RoadPlanner.js:211` (the per-disconnected-building loop).

**Before** (paraphrased — single A* call):
```js
const path = roadAStar(grid, b.ix, b.iz, wh.ix, wh.iz);
if (!path) continue;
```

**After:**
```js
// PDD R10: dual-search and pick by total-cost-of-ownership (build + amortized traversal)
const pathLand   = roadAStar(grid, b.ix, b.iz, wh.ix, wh.iz, { allowBridge: false });
const pathBridge = roadAStar(grid, b.ix, b.iz, wh.ix, wh.iz, { allowBridge: true });

const TRAFFIC_AMORTIZATION = 50; // ~50 round trips assumed lifetime traversal
const sumBuildCost = (p) => {
  if (!p) return 0;
  let cost = 0;
  for (const node of p) {
    if (node.tileType === TILE.WATER) cost += (BUILD_COST.bridge.wood + BUILD_COST.bridge.stone);
    else if (node.tileType !== TILE.ROAD) cost += BUILD_COST.road.wood; // road build cost on grass
  }
  return cost;
};
const score = (p) => {
  if (!p) return Infinity;
  return sumBuildCost(p) + (p.length * TRAFFIC_AMORTIZATION) / 100;
  // Divide by 100 because TRAFFIC is in "trip-tile-cost-units"; build cost is in resource units.
  // Tune the divisor empirically; the goal is parity-of-magnitude not perfect calibration.
};
const path = score(pathBridge) <= score(pathLand) ? pathBridge : pathLand;
if (!path) continue;
```

Failure case handling: if the destination is on a separate island (`pathLand === null`), `score(null) = Infinity` and `pathBridge` wins automatically. If both are null, the existing `continue` skips this building.

Atomic edit guarantee: dual-search wraps the existing call site; the path returned still flows into the same downstream "tile-by-tile build queue" pipeline. No new build-step type, no new resource type.

### Step 3 — Generalise `BridgeProposer` from 1-tile pinch to multi-tile shoreline-pair scan

**File:** `src/simulation/ai/colony/proposers/BridgeProposer.js:60-79`

**Before:**
```js
const isLand = (t) => t !== TILE.WATER && t !== undefined;
const NS = isLand(N) && isLand(S);
const EW = isLand(E) && isLand(W);
if (!NS && !EW) continue;  // ← only 1-tile pinch points qualify
```

**After:** replace the single-tile pinch-point scan with a shoreline-pair scan. Outline:

```js
// PDD R10: generalise bridge proposer to multi-tile shoreline-pair crossings.
// A shore tile is land 4-adjacent to water. Pair shore tiles within radius R
// where the Manhattan land-detour > 1.5× the water-crossing length, queue the
// water tiles between them as a multi-bridge candidate run.

const RADIUS_TILES = 8;
const DETOUR_RATIO_THRESHOLD = 1.5;

const shoreTiles = collectShoreTiles(grid); // existing helper or 4-neighbour scan
const candidates = [];

for (const a of shoreTiles) {
  for (const b of shoreTiles) {
    if (a === b) continue;
    const manhattan = Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
    if (manhattan > RADIUS_TILES) continue;

    // Water-crossing length: count WATER tiles on the straight line a → b
    const crossing = waterCrossingLength(grid, a, b);
    if (crossing <= 0) continue;

    // Land-detour length: roadAStar(a, b, { allowBridge: false }).length
    const landDetour = roadAStar(grid, a.x, a.z, b.x, b.z, { allowBridge: false });
    const detourLen = landDetour ? landDetour.length : Infinity;

    if (detourLen / crossing >= DETOUR_RATIO_THRESHOLD) {
      candidates.push({ from: a, to: b, crossing, detourLen, savings: detourLen - crossing });
    }
  }
}

// Sort by savings desc, take top candidate's first water tile (existing one-bridge-per-call cap).
candidates.sort((p, q) => q.savings - p.savings);
const top = candidates[0];
if (!top) return; // no eligible crossings — same fallthrough as old code

// Queue the FIRST water tile of the run; subsequent calls find the partial run extended by
// the prior bridge and continue (the old narrow-water filter NOW matches because the
// previous bridge tile turns adjacent water tiles into 1-tile-pinch candidates).
const firstWaterTile = computeFirstWaterTileOnLine(grid, top.from, top.to);
proposeBridgeAt(firstWaterTile, state); // existing helper
```

If `roadAStar` is heavyweight to call O(shoreTiles²), gate the inner pair loop on `manhattan <= RADIUS_TILES` first (already done) AND only run the A* when `crossing × DETOUR_RATIO_THRESHOLD < manhattan + RADIUS_TILES` (cheap upper-bound prune). If perf is still a concern, sample shore tiles at stride 2 instead of all-pairs — error tolerance is fine here since the 30s throttle only fires the proposer once per 30 sim-seconds.

The 30-second throttle (`BridgeProposer.js:49`) and one-bridge-per-call return (line 92) are RETAINED — they now act as a build-rate limiter rather than an existence gate. Once the first bridge of a 3-tile run lands, the next iteration's narrow-water scan picks up the now-1-tile-pinch on either side and continues the run incrementally. This is the same incremental-build pattern the old code already supported; we are just opening the entry condition.

### Step 4 — Add tests for the dual-search and multi-tile cases

**File:** Create `test/road-planner-dual-search.test.js` (new test file is permitted under hard-freeze).

Three test cases:

1. **`roadAStar` with `allowBridge:false` skips water** — assert path-or-null on a grid with grass connectivity vs water-only connectivity.
2. **Dual-search picks bridge when amortized score is lower** — fixture grid with a 3-tile water gap and a 30-tile land detour. Assert `planRoadConnections` chose the bridge variant.
3. **`BridgeProposer` queues a multi-tile crossing** — fixture grid with a 3-wide strait between two shores at Manhattan distance 4 with land-detour length 20. Assert at least one water tile was proposed for bridge construction (the prior code would have proposed zero).

Pattern from any existing `test/road-planner-*.test.js` if present.

### Step 5 — Run the suite and confirm green

`node --test test/*.test.js` — baseline preserved. Existing road-planner tests must stay green; if any existing test asserted "bridges only place on 1-tile pinch" as current behaviour, that assertion now reflects the bug and should be updated. Note in CHANGELOG.

### Step 6 — Manual Playwright re-verification

Re-run the PDD scenario: `localhost:19090/?dev=1`, `archipelago_isles`. After 3 sim-minutes of autopilot, expect: at least one bridge placed (TILE.BRIDGE somewhere on grid), at least one warehouse placed (cross-island routing now works so the colony can expand), and worker hunger labels resolve from "Wander hungry" to active hauling.

---

## Suggestions (≥2, ≥1 not freeze-violating)

### Suggestion A (in-freeze, RECOMMENDED) — Steps 1–6 as written (Fix A + Fix B + Fix C from feedback)

The user's "two searches" intuition is the architecturally correct fix; pair it with the lowered cost (so the dual-search has a real preference to express) and the multi-tile proposer (so the planner has multi-tile candidates to place). Hard-freeze compliant: no new tiles (TILE.BRIDGE exists), no new buildings, no new resources.

### Suggestion B (in-freeze, MINIMAL VARIANT) — Steps 1, 2, 4, 5, 6 only (skip Step 3 multi-tile)

If the multi-tile shoreline-pair scan is judged too risky (it's the largest LOC delta and the most algorithmically novel), ship the dual-search + cost reduction alone. Per the feedback: "the dual-search will surface multi-tile bridge plans (it will, because `roadAStar` already emits them — the bug is just that nothing executes the resulting plan when there's no `disconnected` building to trigger it)." With dual-search live and `BRIDGE_STEP_COST=2`, A* will produce multi-tile bridge paths whenever the amortized score wins, AND `planRoadConnections` will execute them (because the paths come back from A* with WATER nodes in them, and the existing "build each tile of the path" pipeline already handles WATER → BRIDGE conversion via the v0.8.6 auto-bridge invocation in terrain generators).

The multi-tile proposer (Step 3) becomes a dedicated proactive-proposal layer; without it, dual-search reactively discovers them when a disconnected building appears. Often sufficient. Recommended if reviewer flags Step 3 as too algorithm-heavy for a hard-freeze pass.

### Suggestion C (FREEZE-VIOLATING — flagged, do not ship in R10) — Add a "Bridge Plan" HUD preview

Show the planner's proposed bridge path as a faint blue line before construction starts, so the player can see what the AI is about to build. **NEW UI overlay = freeze violation.** Tagged for v0.10.2 polish.

---

## Acceptance criteria

1. `node --test test/road-planner-dual-search.test.js` passes all three cases (Step 4).
2. `node --test test/*.test.js` baseline preserved.
3. Manual repro (Step 6): on `archipelago_isles` after 3 sim-minutes, ≥1 BRIDGE tile exists on grid AND ≥1 warehouse placed AND worker hunger labels are not stuck on "Wander hungry."
4. Direct A* probe on the live grid (per feedback Run 2): the 2/5 cases that were "4 tiles shorter, tied on cost" now resolve to `pathBridge` not `pathLand`.
5. No new TILE ids, no new buildings, no new resource categories, no new HUD elements, no new system-order entries.

## Rollback procedure

`git checkout d2a83b5 -- src/simulation/ai/colony/RoadPlanner.js src/simulation/ai/colony/proposers/BridgeProposer.js && rm test/road-planner-dual-search.test.js` reverts cleanly.
