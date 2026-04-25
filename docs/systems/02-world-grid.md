# World Grid System

This document covers the tile-based world grid: its data layout, coordinate transforms,
tile type catalogue, terrain generation pipeline, elevation/moisture/fertility systems,
pathfinding, road network connectivity, soil exhaustion, salinization, and resource nodes.

---

## Grid Data Structure

The world is a flat 2-D grid of integer tile IDs stored in a `Uint8Array`.

| Property | Value | Source |
|---|---|---|
| Default width | 96 tiles | `DEFAULT_GRID.width` |
| Default height | 72 tiles | `DEFAULT_GRID.height` |
| Tile size (world units) | 1.0 | `DEFAULT_GRID.tileSize` |
| Total cells | 6,912 | 96 × 72 |
| Storage type | `Uint8Array` | `grid.tiles` |

The `createInitialGrid()` function in `src/world/grid/Grid.js` is the sole constructor.
It accepts optional overrides for `width`, `height`, `tileSize`, `templateId`, `seed`,
and `terrainTuning`. Minimum enforced dimensions are 24 × 24.

The grid object returned by `createInitialGrid` carries:

```
{
  width, height, tileSize,
  tiles: Uint8Array,          // flat tile-ID array
  tileState: Map<number, TileStateEntry>,  // per-tile metadata keyed by flat index
  tileStateVersion: number,   // incremented on every tileState write
  version: number,            // incremented on every tiles write
  templateId: string,
  seed: number|string,
  terrainTuning: object,      // sanitised tuning params
  emptyBaseTiles: number,     // diagnostic count
  elevation: Float32Array,    // normalised 0..1 height field
  moisture: Float32Array,     // normalised 0..1 moisture field
}
```

### Flat Index Formula

```js
// src/world/grid/Grid.js
export function toIndex(ix, iz, width) {
  return ix + iz * width;
}
```

Z (`iz`) is the row (north–south axis in 3-D). X (`ix`) is the column (east–west axis).
The `iz` axis maps to the Three.js `z` axis in the renderer; the visual layout is
row-major with `iz = 0` at the top of the map.

### Coordinate Transforms

Two helper functions convert between world-space positions and tile coordinates:

```js
// World (Three.js) → tile grid
export function worldToTile(x, z, grid) {
  const ix = Math.floor(x / grid.tileSize + grid.width / 2);
  const iz = Math.floor(z / grid.tileSize + grid.height / 2);
  return { ix, iz };
}

// Tile grid → world centre of tile
export function tileToWorld(ix, iz, grid) {
  return {
    x: (ix - grid.width / 2 + 0.5) * grid.tileSize,
    z: (iz - grid.height / 2 + 0.5) * grid.tileSize,
  };
}
```

The world origin `(0, 0)` sits at the centre of the grid, i.e. tile `(48, 36)` for the
default 96 × 72 map. Tiles outside `[0, width)` × `[0, height)` are treated as
impassable (`getTile` returns `TILE.WALL` for out-of-bounds lookups).

### Version Tracking and Caching

`grid.version` is incremented by `setTile()` on every write. `RoadNetwork` uses this
to lazily invalidate its Union-Find graph. A `WeakMap`-backed `TILE_LIST_CACHE` caches
`listTilesByType()` results against the current `grid.version`, avoiding full scans for
every pathfinding call.

---

## Tile Types

All tile IDs are defined in `src/config/constants.js` as the frozen `TILE` object.
`TILE_INFO` records passability, base movement cost, visual height, and colour for
each ID.

| ID | Constant | Passable | Base Move Cost | Category |
|---|---|---|---|---|
| 0 | `TILE.GRASS` | yes | 1.0 | Terrain |
| 1 | `TILE.ROAD` | yes | 0.65 | Infrastructure |
| 2 | `TILE.FARM` | yes | 1.0 | Production |
| 3 | `TILE.LUMBER` | yes | 1.0 | Production |
| 4 | `TILE.WAREHOUSE` | yes | 1.0 | Logistics |
| 5 | `TILE.WALL` | **no** | 1000 | Defence |
| 6 | `TILE.RUINS` | yes | 1.6 | Terrain |
| 7 | `TILE.WATER` | **no** | 1000 | Terrain |
| 8 | `TILE.QUARRY` | yes | 1.2 | Production |
| 9 | `TILE.HERB_GARDEN` | yes | 1.0 | Production |
| 10 | `TILE.KITCHEN` | yes | 1.0 | Processing |
| 11 | `TILE.SMITHY` | yes | 1.0 | Processing |
| 12 | `TILE.CLINIC` | yes | 1.0 | Processing |
| 13 | `TILE.BRIDGE` | yes | 0.65 | Infrastructure |

**Production tiles** (`FARM`, `LUMBER`, `HERB_GARDEN`) maintain `tileState` entries
that track fertility, yield pool, salinization, fallow status, and node flags.

**Infrastructure tiles** (`ROAD`, `BRIDGE`, `WAREHOUSE`) form the road network used by
`RoadNetwork` for connectivity checks. Roads and bridges share the same base cost of
0.65, giving a ~35 % speed bonus over grass.

**Processing tiles** (`KITCHEN`, `SMITHY`, `CLINIC`) convert raw resources into refined
goods (meals, tools, medicine) and use separate `ProcessingSystem` update logic; they
do not carry yield pools.

**RUINS** are passable but slow (cost 1.6). Building on a ruin tile receives a 30 %
construction discount (`TERRAIN_MECHANICS.ruinsBuildDiscount = 0.3`).

---

## Terrain Generation Pipeline

Generation is invoked by `generateTerrainTiles(width, height, templateId, seed, tuning)`
inside `createInitialGrid`. The pipeline has six phases:

1. **Specialised terrain pass** — one of six dedicated generator functions, or the
   generic `baseTerrainPass + carveRiver` fallback.
2. **Hub selection** — Poisson-weighted land candidates become road hub nodes.
3. **Road drawing** — `drawOrganicRoad` connects hubs with jitter-biased weighted
   random walks (directional bias + noise weight `roadJitter`).
4. **Warehouse placement** — up to 3 warehouses placed near hubs and road-connected.
5. **Resource blob placement** — radial-zone–biased `placeDistrictBlobs` for
   FARM, LUMBER, QUARRY, HERB_GARDEN, and RUINS.
6. **Post-processing** — `applyWalls`, `ensureMinimumInfrastructure`, `trimRoadOverflow`,
   `finalizeTileCoverage`.

### Noise Functions

All terrain generators share a deterministic noise library built on integer hashes:

| Function | Description |
|---|---|
| `hash2D(ix, iz, seed)` | 2-D integer hash → float [0, 1] |
| `valueNoise2D(x, z, seed)` | Bilinear-interpolated value noise with smoothstep |
| `fbm2D(x, z, seed, octaves, lacunarity, gain)` | Fractal Brownian motion, 5-octave default |
| `domainWarpedFbm(x, z, seed, warpAmp)` | Two-layer warp applied before FBM |
| `recursiveWarp(x, z, seed, depth, amp)` | Iterative warp for organic terrain outlines |
| `worleyNoise(x, z, seed, cellSize)` | Returns `{f1, f2, edge}` nearest-cell distances |
| `poissonDiskSample(width, height, minDist, rng, maxPoints)` | Blue-noise point set |

The seeded RNG used throughout generation is a linear congruential generator:

```js
function createRng(seed) {
  let s = normalizeSeed(seed);
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
```

Strings are hashed via FNV-1a before entering the LCG, so both numeric and string seeds
are reproducible across runs.

### Resource Blob Placement and Zone Bias

`placeDistrictBlobs` places elliptical noise-jittered blobs of a resource tile type.
Each blob's centre is chosen by `pickDistrictCenter` using a scored scan that factors in:

- **Farm blobs**: moisture score × 1.4 + road adjacency bonus 0.9
- **Lumber blobs**: ridge score × 1.2 + low-moisture bonus 0.4 + road adjacency 0.45
- **Quarry blobs**: ridge score × 1.6 + edge-of-map bias
- **Herb garden blobs**: moisture score × 1.6 + farm adjacency bonus 0.8
- **Ruins blobs**: ridge score × 1.2 + edge-of-map bias

A **radial zone penalty** (`radialZoneBias`) discourages resource blobs close to the
colony spawn (grid centre):

| Distance from centre | Score modifier |
|---|---|
| < 12 tiles | `-Infinity` (hard exclusion) |
| 12–16 tiles | Up to −4.0 (steep penalty) |
| 16–25 tiles | 0 (neutral) |
| ≥ 25 tiles | +0.6 × distance bonus (reward exploration) |

A minimum separation of 12 tiles (`BLOB_MIN_SPREAD`) prevents consecutive blobs of the
same type from merging into one mass.

---

## Map Templates

The six templates are defined in `MAP_TEMPLATES` and `TEMPLATE_PROFILES` in `Grid.js`.
Each template has a dedicated terrain generator function plus a profile that configures
noise parameters, blob counts, road density, validation thresholds, and more.

### Template Profiles at a Glance

| Template ID | Water Level | Mountain Strength | Road Density | Settlement Density | Rivers |
|---|---|---|---|---|---|
| `temperate_plains` | 0.16 | 0.08 | 0.72 | 0.78 | 1 horizontal |
| `rugged_highlands` | 0.16 | 0.52 | 0.44 | 0.42 | 2 horizontal |
| `archipelago_isles` | 0.22 | 0.16 | 0.24 | 0.45 | 1 |
| `coastal_ocean` | 0.27 | 0.06 | 0.22 | 0.50 | 0 (ocean side: east) |
| `fertile_riverlands` | 0.21 | 0.10 | 0.80 | 0.86 | 2 vertical |
| `fortified_basin` | 0.19 | 0.22 | 0.56 | 0.65 | 0 |

### temperate_plains (`generateTemperatePlainsTerrain`)

Gentle rolling hills via recursive-warp FBM. One meandering river of varying width 1–6
tiles drawn with domain-warped meander. Two to four noise-shaped lakes via Poisson
sampling. Lumber clusters placed by Poisson disk; farms placed on high-moisture (≥ 0.4)
grass tiles. Moisture is boosted within 4 tiles of the river centre.

### rugged_highlands (`generateRuggedHighlandsTerrain`)

High-elevation recursive-warp base with heavy ridge overlay. Worley-noise crevasses
(where `f2 - f1 < 0.05`) become water; edge regions become impassable wall. Worley cell
interiors flatten into plateaus. 8–13 % of grass tiles (by ridge value) are converted
to wall via dynamic threshold sort. Mountain streams walk downhill from random high-
elevation points (40 steps max). Isolated land regions are flood-fill detected and
connected to the centre by 2-wide carved road passes.

### archipelago_isles (`generateArchipelagoTerrain`)

Four to nine islands placed with minimum spacing `min(width, height) × 0.14`. Main
(central) island is largest. Organic coastlines use FBM wobble on polar distance. 60 %
of island pairs receive a 1–2-tile wide land strip connector. Elevation within islands
uses recursive warp; water tiles hold a fixed elevation of 0.08.

### coastal_ocean (`generateCoastlineTerrain`)

A domain-warped coastline separates land from a deep-water ocean side (default: east).
Cliff terraces rise steeply from coast with `recursiveWarp`. Tidal pools carved with
Worley noise within 6 tiles of the coast. Three to five offshore islands with wobbled
ellipses. Domain-warped bays bite into the coast for inlets. Moisture decreases
linearly inland from the coastline; ridge computed per-tile via FBM.

### fertile_riverlands (`generateFertileRiverlandsTerrain`)

Two to three convergent rivers flow from map edges to a central confluence lake via
domain-warped meanders. River width widens approaching confluence (0.8 × to 1.6 ×).
Oxbow lakes placed alongside rivers (1–2 per river). Delta distributary channels radiate
from the confluence. Marshland patches near water via Worley noise. Floodplain ponds via
Poisson disk sampling (only placed within 10 tiles of water). Moisture computed by BFS
distance-to-water with FBM variation; floodplain elevation reduced near water.

### fortified_basin (`generateFortifiedBasinTerrain`)

Irregular fortress wall drawn using 16 angular control points with hermite interpolation,
recursive domain warping, and anisotropic radius. An outer moat (water band) follows the
wall offset. Three to five asymmetric gate positions punch through both moat and wall.
Interior Voronoi-based districts (FARM/LUMBER/QUARRY) placed via Poisson disk and
connected to the centre with organic roads. Outer wilderness receives scattered ruins and
lumber blobs via Poisson sampling.

---

## Elevation, Moisture, and Fertility

### Elevation and Moisture Fields

Both fields are `Float32Array(width × height)` stored on the grid object, indexed by
the same `toIndex(ix, iz, width)` formula as the tile array. Values are normalised
to `[0, 1]`.

- **Elevation** encodes relative terrain height. Water tiles are initialised to 0.08–0.12.
  Highlands have base elevation around 0.45–0.70 before ridge overlay.
- **Moisture** encodes soil wetness. Higher values near rivers and water bodies.
  In `fertile_riverlands`, moisture is a BFS distance-to-water gradient; in other
  templates it comes from `domainWarpedFbm`.

### How Elevation Affects Gameplay

At pathfinding time, `AStar.js` adds an elevation penalty to each step cost:

```js
stepCost += (grid.elevation[nKey] ?? 0.5) * TERRAIN_MECHANICS.elevationMovePenalty;
// TERRAIN_MECHANICS.elevationMovePenalty = 0.3
```

Additional terrain effects defined in `TERRAIN_MECHANICS`:

| Constant | Value | Effect |
|---|---|---|
| `elevationMovePenalty` | 0.3 | Added to base tile cost per elevation unit |
| `elevationBuildCostPerLevel` | 0.15 | Increases build cost at higher elevation |
| `lowMoistureStoneCostThreshold` | 0.3 | Below this moisture, quarry costs more |
| `lowMoistureStoneCostFlat` | 1 | Flat stone cost added when moisture is low |
| `ruinsBuildDiscount` | 0.3 | 30 % cost discount when building on ruins |
| `wallElevationDefenseBonus` | 0.5 | Defense multiplier bonus per elevation unit for walls |

### Fertility

Fertility is a per-tile `[0, 1]` value stored in `tileState.fertility` for production
tiles (`FARM`, `LUMBER`, `HERB_GARDEN`). It is not a separate array — it lives in the
`tileState` Map.

**Moisture cap:** Fertility cannot exceed a per-tile cap derived from moisture:

```js
// TERRAIN_MECHANICS.moistureFertilityCap = { scale: 1.4, base: 0.25 }
const moistCap = Math.min(1.0, moisture[idx] * 1.4 + 0.25);
```

This means tiles with near-zero moisture cap fertility at 0.25 and tiles at full moisture
cap at 1.0, rewarding placement near rivers.

**Passive recovery:** `TileStateSystem` recovers fertility by `0.002 × 2.0 = +0.004`
per 2-second update interval (toward the moisture cap).

**Harvest drain:** Each harvest drains fertility by `0.08 × (1 + exhaustion × 0.12)`,
where `exhaustion` accumulates per harvest (max 8.0) and decays by 0.1 per tick.

**Adjacency effects:** Neighbours modify fertility each 2-second interval:

| Neighbour tile | Target: FARM | Target: HERB_GARDEN | Target: LUMBER |
|---|---|---|---|
| `HERB_GARDEN` | +0.003 | — | +0.002 |
| `KITCHEN` | +0.001 | — | — |
| `QUARRY` | −0.004 | −0.003 | — |
| `LUMBER` | — | +0.002 | — |

Adjacency bonuses are capped at ±0.008 (`TERRAIN_MECHANICS.adjacencyFertilityMax`).

**Growth stage:** `Math.min(3, Math.floor(fertility × 4))` — drives visual growth stage
0–3 on production tiles, which in turn affects procedural texture rendering.

---

## Fog of War

Managed by `VisibilitySystem` in `src/simulation/world/VisibilitySystem.js`.

A `Uint8Array(width × height)` at `state.fog.visibility` stores one of three states per
tile (defined in `FOG_STATE`):

| Constant | Value | Meaning |
|---|---|---|
| `FOG_STATE.HIDDEN` | 0 | Never seen |
| `FOG_STATE.EXPLORED` | 1 | Previously visible, currently out of sight |
| `FOG_STATE.VISIBLE` | 2 | Inside an actor's reveal radius this tick |

Each tick, all VISIBLE tiles are downgraded to EXPLORED (pass 1), then a Manhattan
(Chebyshev) square of radius `fogRevealRadius = 5` is marked VISIBLE around every
live actor (pass 2).

Initial reveal on map load uses `fogInitialRevealRadius = 6`, producing a 13 × 13
(169-tile) explored square centred on the colony spawn. Fog can be disabled globally
via `BALANCE.fogEnabled = false` (used by benchmarks needing full vision from tick 0).

---

## Pathfinding

### A* Algorithm

`src/simulation/navigation/AStar.js` implements A* with a binary `MinHeap` (min-heap
backed by an array, standard sift-up/sift-down). State arrays are typed:

| Array | Type | Purpose |
|---|---|---|
| `cameFrom` | `Int32Array(area)` | Parent tile flat index, -1 = none |
| `gScore` | `Float32Array(area)` | Best known cost from start |
| `closed` | `Uint8Array(area)` | Visited flag |

**Heuristic:** Manhattan distance to goal — admissible since all base costs are ≥ 0.65.

**Step cost formula:**

```
stepCost = TILE_INFO[tile].baseCost
         + elevation[nKey] * 0.3          (if elevation field present)
         × weatherMoveCostMultiplier       (non-road tiles only; roads bypass)
         × hazardPenalty                  (if tile in weather hazard set)
         × trafficPenalty                 (if tile in traffic hotspot map)
```

`TILE.WALL` and `TILE.WATER` are impassable (`passable: false`); the algorithm skips
them entirely. `getTile` returns `TILE.WALL` for out-of-bounds indices.

Supported dynamic cost overlays via the `dynamicCosts` parameter:

- **Weather hazards** — a `Set<"x,z">` of tile keys with a penalty multiplier (and
  optionally a per-tile multiplier map `hazardPenaltyByKey`).
- **Traffic penalties** — a `Record<"x,z", number>` from `state.metrics.traffic`.

### Path Cache

`src/simulation/navigation/PathCache.js` is an LRU cache (default 800 entries) keyed
by `gridVersion:costVersion:startX,startZ->goalX,goalZ`. Hits avoid re-running A*.
The `costVersion` component tracks traffic/weather overlay changes independently of
the tile grid version.

### Movement Directions

All pathfinding and adjacency checks use 4-directional (cardinal) movement:

```js
MOVE_DIRECTIONS_4 = [{ dx:1,dz:0 }, { dx:-1,dz:0 }, { dx:0,dz:1 }, { dx:0,dz:-1 }]
```

Diagonal movement is not supported. Manhattan distance is used as both the heuristic
and the adjacency check (`findNearestTileOfTypes` uses Manhattan nearest-neighbour).

---

## Road Network

`src/simulation/navigation/RoadNetwork.js` maintains a Union-Find (Disjoint Set Union)
graph of all connected **road tiles**, where "road tile" means `TILE.ROAD`,
`TILE.BRIDGE`, or `TILE.WAREHOUSE`.

### Union-Find Implementation

`UnionFind` uses **path compression** and **union by rank**, with a parallel `size`
array (`Uint16Array`) for O(1) component-size queries. The full grid is allocated once:

```js
this.parent = new Int32Array(n);   // n = width * height
this.rank   = new Uint8Array(n);
this.size   = new Uint16Array(n);
```

### Rebuild Trigger

`RoadNetwork.rebuild(grid)` is lazy — it only rebuilds when `grid.version` has changed
since the last call. The rebuild is O(tiles) and scans the entire tile array.

### Key Queries

| Method | Description |
|---|---|
| `areConnected(ix1, iz1, ix2, iz2, grid)` | True if both tiles are road tiles in the same component |
| `connectedWarehouse(ix, iz, grid)` | Returns warehouse flat index reachable from this road tile, or -1 |
| `isAdjacentToConnectedRoad(ix, iz, grid)` | True if any 4-neighbour is a road tile connected to a warehouse |
| `getComponentSize(ix, iz, grid)` | Size of the road component containing this tile |

**Logistics efficiency** is derived from road connectivity: workers delivering to
warehouses that are not road-connected receive a deposit rate penalty
(`isolationDepositPenalty = 0.8`) defined in `BALANCE`.

### Road Speed Bonus

Workers moving on ROAD or BRIDGE tiles benefit from:

- **Base cost reduction:** 0.65 vs 1.0 — approximately 35 % faster per tile.
- **Speed multiplier:** `BALANCE.roadSpeedMultiplier = 1.35` applied by `WorkerAISystem`
  and movement code.
- **Road-stack compounding (M4):** Each consecutive on-road step accumulates an
  additional `0.03` speed bonus, capped at 20 steps max (×1.6 effective bonus at full
  stack). The stack resets when the worker leaves ROAD/BRIDGE.
- **Logistics efficiency bonus:** `BALANCE.roadLogisticsBonus = 1.15` applied to
  delivery throughput when the destination warehouse is road-connected.

---

## Soil Exhaustion and Salinization

Soil mechanics are managed by `TileStateSystem` (`src/simulation/economy/TileStateSystem.js`)
and triggered in `WorkerAISystem` on each farm harvest.

### Per-Tile State Fields

`tileState.salinized` and `tileState.fallowUntil` are stored in the `tileState` Map
alongside fertility, wear, yield pool, and node flags:

```js
// createTileStateEntry() canonical schema
{
  fertility:       0,   // [0..1] current soil fertility
  wear:            0,   // [0..1] road/building wear accumulator
  growthStage:     0,   // 0..3 visual growth stage
  salinized:       0,   // [0..1] salt accumulation on FARM tiles
  fallowUntil:     0,   // simulation tick at which fallow ends
  yieldPool:       0,   // remaining harvestable units on this tile
  nodeFlags:       0,   // NODE_FLAGS bitmask: FOREST=1, STONE=2, HERB=4
  lastHarvestTick: -1,
}
```

### Salinization Mechanics

Each FARM harvest increments `salinized` by `soilSalinizationPerHarvest = 0.012`.
Approximately 67 harvests exhaust a fresh farm tile before it enters fallow (`0.8 / 0.012`).

| Constant | Value | Meaning |
|---|---|---|
| `soilSalinizationPerHarvest` | 0.012 | Increment per harvest |
| `soilSalinizationThreshold` | 0.8 | Triggers fallow entry |
| `soilFallowRecoveryTicks` | 1200 | Ticks in fallow before auto-recovery (~3.3 min at 6 ticks/sec) |
| `soilSalinizationDecayPerTick` | 0.00002 | Passive background decay each tick |

When `salinized ≥ threshold`:
- `fallowUntil` is set to `currentTick + 1200`.
- `fertility` is hard-capped at 0 for the fallow duration (no harvests possible).

When `tick ≥ fallowUntil`:
- `fertility` resets to 0.9.
- `salinized` resets to 0.
- `yieldPool` refills to `farmYieldPoolInitial = 120`.

The `soilSalinizationDecayPerTick = 0.00002` passive decay is negligible relative to
per-harvest accumulation but self-limits the worst-case without player intervention.

### Yield Pool

The yield pool (`yieldPool`) is a per-tile budget that gates harvest output:

| Constant | Value | Note |
|---|---|---|
| `farmYieldPoolInitial` | 120 | Seeded at map generation and fallow recovery |
| `farmYieldPoolRegenPerTick` | 0.1 | Passive regen per sim tick |
| `farmYieldPoolMax` | 180 | Upper cap |
| `yieldPoolDepletedThreshold` | 60 | Below this, tile is "depleted" (planner signal) |

LUMBER and HERB_GARDEN nodes have separate initial pool values and regen rates:

| Node type | Pool initial | Regen per tick | Notes |
|---|---|---|---|
| `FOREST` (LUMBER) | 80 | 0.05 | Regenerates |
| `STONE` (QUARRY) | 120 | 0.0 | Does **not** regenerate (finite deposit) |
| `HERB` (HERB_GARDEN) | 60 | 0.08 | Regenerates |

### Drought Wildfire

During `WEATHER.DROUGHT`, `TileStateSystem._updateFire()` runs every 2-second interval.
Flammable tiles (`FARM`, `LUMBER`, `HERB_GARDEN`) with moisture below
`fireMoistureThreshold = 0.25` and not water-adjacent can spontaneously ignite
(`fireIgniteChance = 0.005` per tile per interval). Burning tiles:

- Accumulate `wear += 0.5` per tick.
- Spread to flammable 4-neighbours at twice the ignite chance, up to 3 spread generations
  (`fireMaxSpread`).
- Burn down to `TILE.GRASS` when `wear ≥ 1.0`; node flags are preserved.
- Firebreaks: ROAD, BRIDGE, WATER, and WALL are immune to fire spread.

---

## Node Resources

Resource nodes are sub-tile metadata flags (`nodeFlags` bitmask) that gate building
placement. They are defined in `NODE_FLAGS` in `src/config/constants.js`:

| Flag | Value | Meaning |
|---|---|---|
| `NODE_FLAGS.NONE` | 0 | No node present |
| `NODE_FLAGS.FOREST` | 1 | Valid surface for LUMBER |
| `NODE_FLAGS.STONE` | 2 | Valid surface for QUARRY |
| `NODE_FLAGS.HERB` | 4 | Valid surface for HERB_GARDEN |

FARM is **not** node-gated; any tile with sufficient fertility and moisture qualifies.

### Node Count Ranges

Nodes are seeded at map generation end. The balance constants define per-map ranges:

| Type | Balance constant | Range |
|---|---|---|
| FOREST | `forestNodeCountRange` | 18–32 |
| STONE | `stoneNodeCountRange` | 10–18 |
| HERB | `herbNodeCountRange` | 12–22 |

### Node Persistence

`nodeFlags` are **preserved across build and erase operations**. The `setTile()` function
extracts `prev?.nodeFlags` before writing a new `tileState` entry, then restores it:

```js
const preservedNodeFlags = Number(prev?.nodeFlags ?? 0);
// ... new entry created with nodeFlags: preservedNodeFlags
```

This ensures that demolishing a LUMBER building does not silently destroy the forest
node on that tile — the node remains and a new LUMBER can be placed there again. The
same persistence applies during wildfire burn-down: `tileState` entries with non-zero
`nodeFlags` are kept even when the tile is reverted to GRASS.

### Node Placement Logic

`ScenarioFactory.js` and map generation seed node flags after the terrain tiles are
finalised. Nodes are placed on tiles matching their type (LUMBER blobs → FOREST flags,
QUARRY blobs → STONE flags, HERB_GARDEN blobs → HERB flags) so the building placement
constraint is automatically consistent with the visual resource distribution baked into
the generated map.

---

## Grid Validation

`validateGeneratedGrid(grid)` enforces per-template constraints after generation to
guarantee a playable map. Checks include:

- Water tile ratio within `[waterMinRatio, waterMaxRatio]`.
- Passable tile ratio within `[passableMin, passableMax]`.
- Minimum road, farm, lumber, and warehouse counts.
- Wall density ≤ 35 % of total area.
- Ruin density ≤ 20 % of total area.
- **Connectivity check:** The largest flood-fill connected passable region must cover
  ≥ 40 % of all passable tiles (ensures the colony spawn is not isolated).

Loose templates (`archipelago_isles`, `coastal_ocean`) permit zero roads and buildings
at validation time because the specialised generators handle these post-hoc.
