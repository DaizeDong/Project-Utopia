# PDD — Road & Bridge Smart Pathing (R10)

**Reviewer:** PDD-road-bridge-smart-pathing
**User report (zh):** "道路建造还是不是很智能, 很多时候直线建造桥梁可以最短路径, 但桥梁似乎只用来填充一些边缘. 我理解应该多次搜索(考虑/不考虑障碍地形)，综合考虑最优路径来进行修建道路与桥梁"
**Translation:** Road planning still isn't smart. Often a straight bridge crossing would be the shortest path, but bridges only get used to fill 1-tile edges. Should run multiple searches (with/without obstacle terrain) and pick the comprehensive optimum.

**Methodology:** STRICTLY BLIND — Playwright session on `archipelago_isles?dev=1`, port 19090, plus source-side cost-function analysis of `src/simulation/ai/colony/RoadPlanner.js` (the R6 PG bridge-and-water work) and `src/simulation/ai/colony/proposers/BridgeProposer.js`. I ported the live `roadAStar` algorithm into the page eval and ran it against the loaded archipelago grid (1302 grass / 5604 water tiles, 14 agents, no warehouses or roads at t=3:01) on five real grass↔grass pairs separated by water.

---

## TL;DR

**The user is right.** The bug is two layers deep:

1. **`BridgeProposer` only places bridges on "narrow water" (1-tile crossings)** — explicitly requires land on both N/S or both E/W neighbours of every candidate WATER tile. Strait crossings 2+ tiles wide are structurally invisible to it.
2. **`roadAStar` BRIDGE_STEP_COST = 5.0** (= bridge resource cost in wood+stone) makes every water step 5× a grass step, but only counts construction cost — never amortizes the **future worker traversal savings** of a permanent shortcut. A 5-tile-around detour ties a 1-tile-bridge crossing in the cost function. Ties favor expansion order (typically the land detour).

The user's ask — **"do two searches and compare"** — is exactly the right architectural fix. Current code does one mixed search where the bridge cost is a flat per-step penalty with no awareness of the alternative.

---

## Observed bridge placement patterns

### Run 1 — `archipelago_isles`, dev=1, t=00:03:01

Map composition: **GRASS = 1302 (19%) · WATER = 5604 (81%) · RUINS = 6**. Zero warehouses / lumber / farms / roads / bridges placed by the AI in 3 minutes. Worker chrome shows "Hungry / FARM Wander hungry · Hungry / WOOD Wander hungry" — workers can't even reach resources because the colony can't expand off-island.

Tile labels visible mid-screen: "harbor relay causeway", "central relay depot", "east fields causeway" — the *naming* anticipates causeways but **no causeway tile actually exists**. The autopilot OFF state shows "manual; builders/director idle" — the BridgeProposer simply found nothing it considered eligible.

### Run 2 — direct `roadAStar` evaluation on the live grid

I ported the R6 bridge-aware A* into the page and ran it against five real grass↔grass pairs. Comparing **`withBridge` (current planner)** vs a forked **`landOnly`** baseline:

| from | to | manhattan | withBridge len/cost | landOnly len/cost | Δlength | Δcost |
|---|---|---|---|---|---|---|
| 45,8 | 55,9 | 11 | 16 / 16 | 16 / 16 | 0 | 0 |
| 30,18 | 30,32 | 14 | 23 / **27** | 27 / **27** | -4 | **0 (tie)** |
| 22,20 | 33,21 | 12 | 13 / 13 | 13 / 13 | 0 | 0 |
| 33,22 | 22,25 | 14 | 19 / 19 | 19 / 19 | 0 | 0 |
| 33,21 | 30,30 | 12 | 15 / **19** | 19 / **19** | -4 | **0 (tie)** |

In two of five cases the bridge-aware path is **4 tiles shorter** for **identical cost**. This means workers walk 4 fewer tiles **forever**, but A* is indifferent. In a planner with deterministic neighbour expansion order this can flip either way per seed; on the live grid above the bridge variant won twice and tied three times — but only because the resource-richness multiplier and elevation noise broke ties.

The harder case the user is describing — a 6-tile water gap where the only land detour is 30+ tiles around an island — never showed up in my five samples because the tested archipelago map happens to be one big amoeba-shaped landmass with thin water inlets, not the canonical island chain. **The 81% water coverage is mostly ocean *around* the central continent, not straits *between* destinations the AI wants to connect.** That alone is a separate scenario-design issue (an "archipelago" map with one island isn't an archipelago), but it also means `BridgeProposer`'s narrow-water heuristic has nothing to work with.

---

## Cost analysis — why the planner prefers going around

### Layer 1: `BridgeProposer.js` (lines 60-79)

```js
const isLand = (t) => t !== TILE.WATER && t !== undefined;
const NS = isLand(N) && isLand(S);
const EW = isLand(E) && isLand(W);
if (!NS && !EW) continue;  // ← only 1-tile pinch points qualify
```

A 2-wide strait is invisible to this. There is **no code path** in the colony AI that proposes a 2- or 3-tile bridge sequence. `BridgeProposer.proposeBridgesForReachability` runs at most once per 30 sim-seconds (line 49) and only places one bridge per call (line 92). It cannot build a multi-segment bridge even over 30 minutes.

This is exactly what the user sees: bridges only get used for "edges" (1-tile narrow points along a coast), never for cross-water shortcuts.

### Layer 2: `RoadPlanner.js` BRIDGE_STEP_COST (lines 26-33)

```js
const BRIDGE_STEP_COST = (() => {
  const c = BUILD_COST?.bridge ?? {};
  const total = Number(c.wood ?? 0) + Number(c.stone ?? 0); // 3 + 1 = 4
  return Math.max(5.0, total); // → 5.0
})();
```

`BUILD_COST.bridge = { wood: 3, stone: 1 }` (config/balance.js:15) — total 4, floored to 5. Comparison with grass step cost (1.0) and existing-road step cost (0.1):

| step type | cost in A* | implied trade-off |
|---|---|---|
| existing ROAD | 0.1 | nearly free |
| GRASS | 1.0 | baseline |
| WATER | **5.0** | "1 bridge ≡ 5 grass detour" |

So the planner happily walks 4 grass tiles around to avoid 1 bridge. In the user's mental model — "the bridge gives us a permanent shortcut, workers will walk it 1000 times" — that 5× discount is way too high. The function is solving a **construction-cost minimization** problem, not a **total-cost-of-ownership minimization** problem.

Compounding: when `landOnly` and `withBridge` tie, the open-set tie-break favours whichever node was inserted first. The land path expands earlier (lower `f` heuristic on the first step), so ties resolve toward going-around. The user observes this as "bridges never used for shortcuts."

### Layer 3 (latent): `RoadPlanner.planRoadConnections` only triggers on `disconnected` buildings

Lines 213, 222: the planner only fires for buildings with **no** road-network connectivity. A worksite that has a 30-tile detour to the warehouse is "connected" and never gets a bridge shortcut considered. The user's complaint covers exactly this state: there's *a* path, just a stupid one.

---

## Suggested fix — the user's "two searches" is correct

### Fix A (small, surgical): lower BRIDGE_STEP_COST and add a savings check

In `RoadPlanner.js`:

```js
// New: bridge cost = build cost amortized over expected lifetime traffic
// 1 bridge tile saves ~D detour tiles forever; D ≈ avg straits-around delta
// on this map. Tune to ~2.0 so a 1-bridge shortcut wins against 2+ grass detour.
const BRIDGE_STEP_COST = 2.0; // was 5.0
```

This alone flips the 2/5 cases above and likely many on real island chains. Risk: A* now picks water freely on land-reachable plans, so we'd spend wood+stone where wood-only roads would do. Mitigate by keeping the floor at 2.0 (still 2× a grass step) and letting the construction-affordability gate in `BridgeProposer.canAfford` (line 52) be the brake.

### Fix B (the user's "two searches"): dual-search compare

In `planRoadConnections` (RoadPlanner.js:211):

```js
const pathLand   = roadAStar(grid, b.ix, b.iz, wh.ix, wh.iz, { allowBridge: false });
const pathBridge = roadAStar(grid, b.ix, b.iz, wh.ix, wh.iz, { allowBridge: true });

// Score each by total-cost-of-ownership:
//   build cost (current A* output) + traversal cost over expected lifetime
const TRAFFIC = 50; // rough: ~50 round trips amortization
const score = (p) => {
  if (!p) return Infinity;
  const built = sumBuildCost(p);    // wood+stone
  const travel = p.length * TRAFFIC; // permanent traversal multiplier
  return built + travel;
};
const path = score(pathBridge) < score(pathLand) ? pathBridge : pathLand;
```

This is exactly the user's request: *do two searches (with/without obstacles), compare comprehensively*. Implementation cost: ~30 LOC + a `{ allowBridge }` flag through `roadAStar`. The `landOnly` evaluation also handles the failure case gracefully (returns null when the destination is on a separate island; bridge path then wins automatically).

### Fix C (the proposer hole): generalize BridgeProposer to multi-tile crossings

Replace the 1-tile pinch-point scan in `BridgeProposer.js:60-79` with a **shoreline-pair scan**:

1. Find all "shore" tiles (land tiles 4-adjacent to water).
2. For pairs of shore tiles within radius R (say 8 tiles) where Manhattan land-path > 1.5× water-crossing length, queue the water tiles between them as a multi-bridge candidate run.
3. Build the run incrementally (one bridge tile per 30s throttle is fine) — once the run starts, the next iteration finds the partial run and continues it because the previous bridges are now adjacent to land via the prior bridge.

The current 30-second throttle then acts as a build-rate limiter, not an existence gate.

### Combined recommendation

- **Fix B** is the conceptually correct one and matches the user's intuition.
- **Fix A** is a 1-line stopgap that helps immediately.
- **Fix C** is needed for any seed where the connection is between two large landmasses with no narrow pinch — the current proposer simply has no entry point for that case.

Ship A+B together; defer C until the dual-search actually surfaces multi-tile bridge plans (it will, because `roadAStar` already emits them — the bug is just that nothing executes the resulting plan when there's no `disconnected` building to trigger it).

---

## Files relevant to the fix

- `C:\Users\dzdon\CodesOther\Project Utopia\src\simulation\ai\colony\RoadPlanner.js` — BRIDGE_STEP_COST (line 26-33), `roadAStar` cost function (lines 124-131), `planRoadConnections` trigger (line 211, 222).
- `C:\Users\dzdon\CodesOther\Project Utopia\src\simulation\ai\colony\proposers\BridgeProposer.js` — narrow-water-only filter (lines 60-79), 30s throttle (line 49), one-bridge-per-call return (line 92).
- `C:\Users\dzdon\CodesOther\Project Utopia\src\config\balance.js:15` — `BUILD_COST.bridge = { wood: 3, stone: 1 }` baseline.

## Live evidence

- `assignments/homework7/Final-Polish-Loop/Round10/Feedbacks/screenshots/archipelago-overview.png` (existing) — shows the dev archipelago at t=3:01 with zero bridges placed despite 81% water coverage and visible "causeway" tile labels naming bridges that never get built.
