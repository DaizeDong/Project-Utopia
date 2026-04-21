# Living World Balance Pass — Design Spec

**Date**: 2026-04-21
**Author**: Daize Dong (with Claude brainstorm)
**Scope**: Living-world balance overhaul (~15 days, M1–M4 + node/fog/DevIndex + long-horizon bench)
**Version**: v3 (M1a node layer, M1b fog, M1c recycling, Plan C adaptive raids, DevIndex, long-horizon benchmark)
**Related commit**: 7652d7e (HW05 beta cleanup)

---

## 1. Problem Statement

Project Utopia's current optimal strategy is to place FARM / LUMBER / QUARRY / HERB_GARDEN tiles directly adjacent to a WAREHOUSE. Worker harvest is 2.5s, haul is a single tile step with no cost, and the warehouse is an infinite sink. Road bonuses (+15% harvest, 1.35× speed) cannot compensate for zero haul distance, so roads are strictly negative EV at adjacency.

Result: the spatial game collapses to a point. Map terrain, fertility, and road infrastructure become ornamental. The colony feels like a spreadsheet.

Compounding this, the game ends at an arbitrary "3 objectives completed" state, which gives no incentive for long-horizon planning, ecological care, or defensive depth.

## 2. Design Goals

1. Make worksite placement a continuous trade-off, not a binary gate.
2. Give each resource tile a real-world-flavored cost (exhaustion, crowding, spoilage).
3. Make roads genuinely dominant at non-zero distance.
4. Replace the win condition with an open-ended survival challenge that escalates over time.
5. Every mechanic must be readable on-screen at a glance (no invisible bookkeeping).
6. Preserve the existing 14 tile types, 9 worker roles, and most of the 731 tests.

## 3. Architecture Overview

Four interlocking economy mechanics + node-gated placement + fog-of-war discovery + survival-mode replacement + DevIndex development score + long-horizon benchmark. Five new systems are added; most other slots in `SYSTEM_ORDER` are modified in place.

```
[Existing]                [New / Modified]
SimulationClock         → unchanged
[+] VisibilitySystem    → NEW (M1b). Runs after SimulationClock; reveals fog around actors
ProgressionSystem       → updateObjectiveProgress() replaced with updateSurvivalScore()
RoleAssignmentSystem    → unchanged
PopulationGrowthSystem  → tracks lastBirthTick for death condition
StrategicDirector       → DevIndex-aware goal selection; prospect/recycle skills
EnvironmentDirectorSystem → unchanged
WeatherSystem           → unchanged
WorldEventSystem        → accepts new event types: warehouse_fire, vermin_swarm
                          bandit raids now driven by RaidEscalatorSystem
[+] DevIndexSystem      → NEW (§ 5.6). Composes 6 dims every 10 game-sec
[+] RaidEscalatorSystem → NEW (Plan C). Reads DevIndex; unbounded log tier
NPCBrainSystem          → unchanged
WorkerAISystem          → carry-state fatigue, in-transit spoilage, road speed stack,
                          explore_fog intent
VisitorAISystem         → unchanged
WildlifeAISystem        → unchanged
LifecycleSystem         → unchanged
BuildSystem             → node-gate check routed through BuildAdvisor; demo recycling
BoidsSystem             → unchanged
ResourceSystem          → intake throttle, deposit application hook
ProcessingSystem        → unchanged
[+] WarehouseQueueSystem → NEW. Runs before WorkerAISystem
TileStateSystem         → yieldPool, salinization, crowding factor, node flags
[+] EconomyTelemetry    → NEW (§ 5.6 helper). Ring buffers for DevIndex dims
ColonyDirectorSystem    → unchanged
```

## 4. Mechanic Specifications

### M1 — Soil & Node Depletion

**Farms**
- New tile-local state: `salinized: bool`, `fallowUntil: tick` (on `state.grid.tileState` map)
- Trigger: when fertility drops below `SOIL_SALINIZATION_THRESHOLD = 0.15`, set `salinized = true`
- Effects while salinized:
  - Fertility recovery rate × `SALINIZATION_RECOVERY_MULT = 0.10`
  - Harvest yield multiplier × `SALINIZATION_YIELD_MULT = 0.5`
  - Fertility cap at `SALINIZATION_FERTILITY_CAP = 0.5`
- Recovery: after `SALINIZATION_FALLOW_TICKS = 180 * tickRate` ticks of zero harvest, clear the flag

**Lumber / Quarry / Herb Garden nodes** → fully node-gated; see **§ 3a Resource Node Layer**. Farms remain placeable on any fertile tile.

- Only FARMs use fertility-driven yieldPool (initial `FARM_INITIAL_POOL = 200`, 60% regen after fallow).
- LUMBER / QUARRY / HERB_GARDEN yieldPool is per-node, defined at map generation time (see § 3a).
- Each harvest deducts `yield × (1 + tool_bonus)` from the node's pool.

**Files**
- `src/simulation/economy/TileStateSystem.js` — add `yieldPool`, `salinized`, `fallowUntil` fields + tick logic
- `src/simulation/npc/WorkerAISystem.js:283-289` — harvest deducts from pool; respect caps/fallow
- `src/render/ProceduralTileTextures.js` — soil crack overlay (< 30% fertility), stump sprite, pit decal
- `src/config/balance.js` — new `TILE_DEPLETION` frozen config

### M1a — Resource Node Layer (§ 3a)

A new map-layer bitmask sits parallel to the tile grid, assigning discrete resource nodes that act as **placement prerequisites** for LUMBER / QUARRY / HERB_GARDEN. Nodes exist from the moment of map generation but start hidden under fog (see § 3b).

**Node types**

| Flag | Count/Map | Generation rule (96×72) | Cluster size | Prerequisite for |
|------|-----------|--------------------------|--------------|------------------|
| `FOREST_NODE` | 18–32 | moisture > 0.55 AND elevation < 0.7; Poisson disk with r=5 | 3–7 tiles | LUMBER |
| `STONE_NODE` | 10–18 | elevation > 0.55, prefer mountain skirts | 2–4 tiles | QUARRY |
| `HERB_NODE` | 12–22 | moisture 0.4–0.7 AND within 4 tiles of a FOREST_NODE | 1–3 tiles (sparse) | HERB_GARDEN |

**Enforcement**
- `BuildAdvisor.canPlace(tile, kind)` rejects LUMBER / QUARRY / HERB_GARDEN if `!tile.nodeFlags.has(required_flag)`; returns `reason: "missing_resource_node"` with a hint "Send a scout — prospect for a <kind>_node"
- Farms still place on any GRASS with `fertility ≥ 0.25`; node-agnostic
- Each node owns its `yieldPool`:
  - `LUMBER_NODE_POOL = 300` (80% regen after `LUMBER_REGROW_TICKS = 400`)
  - `STONE_NODE_POOL = 400` (**permanent** depletion — pit decal persists)
  - `HERB_NODE_POOL = 180` (60% regen after `HERB_FALLOW_TICKS = 300`)

**Long-horizon math**: Seed budget ≈ 14 stone-nodes × 500 = 7,000 stone per map. At ~20 stone/day consumption this sustains ~350 days pre-expansion; after that the colony must prospect remaining unexplored map area or recycle from demolitions (see M1c below).

**Visuals**
- FOREST_NODE: denser tree cluster on base tile texture; prospect reveal animates trees fading in
- STONE_NODE: exposed bedrock streak; depleted = crater decal with scree
- HERB_NODE: mossy patch with small flower sprites

**Files**
- `src/world/grid/Grid.js` — extend `tileState` with `nodeFlags: Uint8` bitmask (3 bits used)
- `src/world/scenarios/ScenarioFactory.js` — node seeding step runs after terrain
- `src/simulation/construction/BuildAdvisor.js` — add node-requirement check, route to new reason string
- `src/render/ProceduralTileTextures.js` — per-node overlay sprites

### M1b — Fog of War & Vision (§ 3b)

Node discovery is tied to a permanent-reveal fog layer. Essence of "exploration" is uncovering map area to find the next resource node.

**Visibility grid**
- `state.world.visibility: Uint8Array(96 * 72)`, values `{ FOG = 0, SEEN_ONCE = 1, REVEALED = 2 }`
- Initial state: 9×9 square around spawn is `REVEALED`; all else `FOG`
- Per tick: every actor in `{workers, visitors, herbivores, predators}` marks tiles within `VISION_RADIUS = 4` as `REVEALED` (Chebyshev)
- Reveal is **permanent** — once `REVEALED`, never reverts

**UI**
- Fogged tiles rendered at 0.15 opacity, monochrome; animated mist wisp shader
- BuildAdvisor forbids placing any building on `FOG` tiles (uses `reason: "unexplored"`)
- Nodes under fog are invisible until reveal; on first reveal, HUD ping + "New <kind> node discovered at (x,y)"
- Minimap reflects fog state

**Prospector behavior (AI integration)**
- Idle workers opportunistically walk toward the nearest fog boundary when no economic intent is available (new low-priority `explore_fog` intent)
- `StrategicDirector` raises exploration priority when all known nodes of a type have `yieldPool < 100`
- No new role — any worker can prospect (keeps 9-role constraint)

**Files**
- `src/simulation/world/VisibilitySystem.js` — **NEW**. Runs after `WorldEventSystem`; reveals tiles around actors
- `src/render/FogOverlay.js` — **NEW**. Shader-based fog layer on top of tile grid
- `src/simulation/npc/WorkerAISystem.js` — add `explore_fog` intent as final fallback
- `src/simulation/ai/perception/ColonyPerceiver.js` — emit `revealedFraction`, `knownNodeCount` signals
- `src/ui/hud/Minimap.js` — render fog state

### M1c — Demolition Recycling (stone endgame guard)

To preserve "infinite development except when tiles run out" while keeping permanent quarry depletion:
- Demolishing any building refunds `DEMO_STONE_RECOVERY = 0.35 × original_stone_cost` (rounded down)
- Applies only to stone (wood rots, herbs dry out)
- Communicates in UI: "Salvaged X stone from demolition"

### M2 — Warehouse Throughput & Density Risk

**Throughput gate**
- New tick property per warehouse: `intakePendingThisTick: number`
- Each warehouse accepts max `WAREHOUSE_INTAKE_PER_TICK = 2` deposits per tick
- Excess workers enter `queuedAt` state:
  - Fatigue accrual × `QUEUE_FATIGUE_MULT = 1.5` while queued
  - After `QUEUE_MAX_WAIT_TICKS = 180`, worker attempts reroute to next-nearest warehouse (if any)
- Queue visualized as workers standing within 1 tile of the warehouse door

**Density risk**
- Each warehouse tracks total stored resources within `DENSITY_RADIUS = 6` tile Chebyshev distance (sum across all warehouses' shares of `state.resources`, apportioned by Voronoi nearest-depot)
- Thresholds:
  - `DENSITY_RISK_THRESHOLD = 400` (units of any single resource type in radius)
  - Every `VERMIN_CHECK_INTERVAL = 60s`, if density > threshold, `VERMIN_CHANCE = 0.05` → spawn `vermin_swarm` event (food loss 5-10%)
  - Every `FIRE_CHECK_INTERVAL = 120s`, if density > threshold, `FIRE_CHANCE = 0.01 × (density / 400)²` → spawn `warehouse_fire` event (damages adjacent buildings, 10-20% local resource loss)
- Warning UI: at 70% threshold, warehouse shows amber pulse

**Files**
- `src/simulation/economy/WarehouseQueueSystem.js` — **NEW**. Runs before `WorkerAISystem` in SYSTEM_ORDER
- `src/simulation/economy/ResourceSystem.js` — consult queue state before applying deposits
- `src/world/events/WorldEventSystem.js` — register `vermin_swarm`, `warehouse_fire` handlers
- `src/render/SceneRenderer.js` — roof crate stack (0-4 tiers), queue billboards, amber/red pulse
- `src/config/balance.js` — new `WAREHOUSE_DENSITY` frozen config

### M3 — Carry Cost: Fatigue & In-Transit Spoilage

**Carry fatigue**
- When `worker.carry.total > 0`, multiply the worker's fatigue accumulation by `CARRY_FATIGUE_MULT = 1.5`

**Spoilage**
- Per-tick decay applied in `WorkerAISystem` before intent selection:
  - `worker.carry.food × (1 - FOOD_SPOILAGE_RATE × dt)` where `FOOD_SPOILAGE_RATE = 0.005` (0.5%/sec)
  - `worker.carry.herbs × (1 - HERB_SPOILAGE_RATE × dt)` where `HERB_SPOILAGE_RATE = 0.01` (1%/sec)
  - `wood` and `stone` are immune
- **Exception**: if the worker's current tile is `TILE.ROAD` or `TILE.BRIDGE`, spoilage rate × 0 (frozen). Models "covered roads preserve cargo."
- **Grace period**: before `tickCount < EARLY_GAME_GRACE_TICKS = 500`, all spoilage rates × 0.5

**Files**
- `src/simulation/npc/WorkerAISystem.js:216-258` (intent) — apply spoilage decay at the top of the tick
- `src/simulation/npc/WorkerAISystem.js:449-483` (deliver) — deposit uses post-spoilage `carry` values
- `src/config/balance.js` — new `CARRY_COST` frozen config
- `src/render/SceneRenderer.js` — sweat droplet billboard over fatigued workers, desaturated role color

### M4 — Road Compounding Bonus

**Speed stack**
- New per-worker field: `roadStep: number` (0 when off-road)
- On movement:
  - If current tile is ROAD/BRIDGE: `roadStep = min(roadStep + 1, ROAD_STACK_CAP_STEPS = 20)`
  - Else: `roadStep = 0`
- Effective speed multiplier = `min(ROAD_STACK_CAP = 1.6, 1.0 + roadStep × ROAD_STACK_PER_STEP = 0.03)`
- Applied multiplicatively to existing pathfind speed

**Isolation adjustment**
- Merge with existing `LogisticsSystem` tiers; new tiers:
  - `ROAD_CONNECTED` (road/warehouse within 2 tiles, path exists to a warehouse): 1.15× harvest, 1.0× deposit
  - `ROAD_ADJACENT` (road within 1 tile, no full path): 1.0× harvest, 1.0× deposit
  - `ISOLATED` (no road within 2 tiles): 0.85× harvest, 0.8× deposit (the deposit penalty is new; the harvest penalty already existed)

**Files**
- `src/simulation/economy/LogisticsSystem.js:52-66` — retier
- `src/simulation/npc/WorkerAISystem.js` — update `roadStep` each movement tick; apply speed multiplier
- `src/config/balance.js` — new `ROAD_STACK` frozen config

## 5. Survival Mode Replacement

### 5.1 Remove Win Condition

- `src/world/scenarios/ScenarioFactory.js:138-165` — `buildObjectivesForScenario()` returns `[]` (keep function signature for back-compat, may delete later)
- `src/app/runOutcome.js:3-13` — outcome possible values: `"loss"` | `"ongoing"`. Remove `"win"`.
- `src/simulation/meta/ProgressionSystem.js:356-479` — replace `updateObjectiveProgress()` with `updateSurvivalScore()` (see 5.3)

### 5.2 Death Condition

- `state.gameplay.lastBirthTick: number` (updated by `PopulationGrowthSystem` on every successful spawn, and initialized to 0 at session start)
- Game loss trigger (uses **in-game hours**, which map 1:1 to the game's existing HUD timer):
  ```
  workers.length === 0 AND (currentGameHour - lastBirthGameHour) >= 48
  ```
  where `currentGameHour = elapsedGameSeconds / 3600` and `elapsedGameSeconds` is the existing accumulated game clock (`state.clock.elapsedGameSeconds`). With the project's default `TIME_COMPRESSION = 60×`, this resolves to 48 real minutes of zero population before `loss` triggers.
- Countdown UI: when `workers.length === 0`, show "Colony silent — XX:YY until failure" where XX:YY is the remaining in-game hours:minutes until the 48h threshold.

### 5.3 Survival Scoring

**Formula** (confirmed by user):
```
score = days_survived × avg_population × 100
      + raids_repelled × 500
      + refined_goods_produced_total × 0.1
```

Where:
- `days_survived`: floor(elapsed_game_minutes / (24 * 60))  (1 in-game day = 24 in-game hours)
- `avg_population`: running average of `workers.length` over the session
- `raids_repelled`: count of `bandit_raid` events that ended with `event.outcome === "defeated"` (tracked in event log)
- `refined_goods_produced_total`: cumulative `meals + tools + medicine` produced since session start

**Fields added to `state.gameplay`**:
- `survivalScore: number`
- `avgPopulation: { sum: number, samples: number }` — sampled once per game-second
- `raidsRepelled: number`
- `refinedGoodsProduced: number`
- `lastBirthGameSec: number` — set whenever PopulationGrowthSystem spawns a worker

### 5.4 Raid Escalator — Plan C Adaptive (DevIndex-coupled)

**`src/simulation/meta/RaidEscalatorSystem.js`** (NEW, runs after `WorldEventSystem` and after `DevIndexSystem` — see § 5.6):

```
elapsed_game_minutes = state.clock.elapsedGameSeconds / 60
base_tier            = log2(elapsed_game_minutes / 3 + 1) * 1.6   // unbounded log curve
dev_tier             = clamp((DevIndex - 40) / 10, 0, 4.0)        // prosperity tax
threat_tier          = base_tier + dev_tier
raid_interval_gamesec = max(30, 180 / (1 + 0.18 * threat_tier))
raid_strength_mult    = 1.0 + 0.22 * threat_tier
```

**Rationale**
- **No hard cap** — log2 grows forever but slowly (tier 6 at ~189 game-minutes, tier 7 at ~381, tier 8 at ~765). Meaningful late-game challenge without overflow.
- **DevIndex coupling** — a prosperous colony attracts more raiders. Prevents DevIndex saturation: if you grow your colony but never fortify, raids scale with you.
- **Opportunity cost** — late-game DevIndex ≥ 80 (tier +4) meaningfully raises raid frequency (30–45 game-sec intervals), forcing wall/defense investment.

Behavior:
- Track `lastRaidGameSec` per session
- When `state.clock.elapsedGameSeconds - lastRaidGameSec >= raid_interval_gamesec`, emit `bandit_raid` event via existing `WorldEventSystem.js:432-464` handler
- Payload includes `intensity = base_intensity × raid_strength_mult`
- Raid outcome (defeat / flee / damage) remains driven by existing combat logic in `WorldEventSystem`
- DevIndex read from `state.gameplay.devIndex` (updated every 10 game-seconds by DevIndexSystem; see § 5.6)

**Grace window**
- First `RAID_GRACE_GAME_MINUTES = 3` (~3 real-minutes) suppress all raids (matches old behavior)
- DevIndex factor zeroed while `elapsed_game_minutes < 6` to avoid penalizing early setup

All time units are **in-game seconds**, consistent with existing `WorldEventSystem` cooldowns.

### 5.5 HUD Changes

**`index.html`** + `src/ui/hud/GameStateOverlay.js`:
- `#statusObjective` → `#statusSurvival`: "Day 34 · Threat Tier III · Score 12,450"
- Top-right threat tier bar: `● ● ● ○ ○ ○` (filled dots = current tier)
- Next-raid countdown badge, visible when `tier >= 1`
- End-game screen: "Survived 34 days · Repelled 12 raids · Final Score 12,450"
- DevIndex badge (see § 5.6) in top-right: "DevIndex 72 (Econ 78 · Pop 65 · Infra 70 · Def 62 · Res 80 · AI 75)"

### 5.6 DevIndex — Development Index

A composite 6-dimension quality score in **[0, 100]**, updated every 10 game-seconds by a new `DevIndexSystem` (runs after `ResourceSystem`, before `RaidEscalatorSystem`). Stored at `state.gameplay.devIndex` (scalar) and `state.gameplay.devIndexDims` (object of 6 floats).

**Dimensions**

| Dim | Weight | Computation |
|-----|--------|-------------|
| **econThroughput** | 25 | `refined_per_gamemin × smoothness`; smoothness = `1 - stddev(refined_per_gamemin window) / mean` |
| **populationHealth** | 20 | `roleEntropy(9 roles) × populationStability`; stability = `1 - (births_lost_last_5min / births_total_last_5min)` |
| **infrastructureDiversity** | 15 | `tileEntropy(14 types) + roadCoverage × 0.5`; roadCoverage = roads / revealed-tiles |
| **defenseResilience** | 15 | `wallCoverage × raidRepelRate_last_10min` |
| **recoveryResilience** | 15 | slope of economy rebound after last event (positive slope → high) |
| **aiDecisionQuality** | 10 | `1 - goalFlipRate_normalized`; baseline from § 15 is 71 flips / 120 s |

`DevIndex = Σ dim_i × weight_i / 100`, clamped to `[0, 100]`. Each dim is computed independently, clamped to `[0, 100]`, and exposed in `state.gameplay.devIndexDims` for HUD and benchmarks.

**Sampling windows**
- 5-minute rolling for econ smoothness and population stability
- 10-minute rolling for defenseResilience and aiDecisionQuality
- Event-triggered (30s post-event) for recoveryResilience

**Failure mode: saturation detection**
- `saturationIndicator = usedTiles / revealedUsableTiles`
- When `saturationIndicator > 0.85`, DevIndex plateau is accepted (benchmark stops demanding growth; see § 16)

**Files**
- `src/simulation/meta/DevIndexSystem.js` — **NEW**. Composes dim values from existing telemetry
- `src/simulation/telemetry/EconomyTelemetry.js` — **NEW**. Ring buffer for econ time series
- `src/ui/hud/GameStateOverlay.js` — render DevIndex badge
- `src/config/balance.js` — weights and window sizes exposed

## 6. Supply-Chain Heat Lens (Free Addendum)

Extension of `src/render/PressureLens.js`:
- New toggle bound to **L key** (and HUD button)
- Channels:
  - Red: tiles with surplus input and backlog (e.g., farm adjacent to saturated warehouse)
  - Blue: tiles starving / waiting for input (idle processing buildings, empty depots)
  - Grey: idle / unused
- Zero new art. One extra shader uniform + a precompute pass over `state.resources` flow.

## 7. Data Model Changes

Additions to existing state shape:

```javascript
// state.grid.tileState[tileKey] — per-tile extended state (NEW or extended)
{
  fertility: number,         // existing
  moisture: number,          // existing
  elevation: number,         // existing
  salinized: boolean,        // NEW (M1)
  fallowUntil: number,       // NEW (M1), tick count
  yieldPool: number,         // NEW (M1), per harvesting tile
}

// state.gameplay — survival mode (5.3)
{
  // objectiveIndex, objectives[] — REMOVED or kept as empty stubs
  survivalScore: number,              // NEW
  avgPopulation: { sum, samples },    // NEW
  raidsRepelled: number,              // NEW
  refinedGoodsProduced: number,       // NEW
  lastBirthTick: number,              // NEW
  lastRaidTick: number,               // NEW (5.4)
  currentThreatTier: number,          // NEW (5.4)
}

// state.colony (NEW namespace, replaces scattered colony-wide fields)
// Or: add lastBirthTick directly to state.gameplay

// Worker entity extension
{
  // ...existing...
  roadStep: number,          // NEW (M4)
  queuedAt: string | null,   // NEW (M2), warehouse id or null
}
```

## 8. Testing Strategy

### 8.1 Existing tests (731)
Expected impacts:
- ~6 tests in `test/build-system.test.js` — already adjusted in commit 7652d7e
- ~4 tests in `test/progression.test.js` (objective-related) — **will need rewrite** to assert survival-score accumulation instead
- ~3 tests in `test/world-events.test.js` — ensure new `vermin_swarm` / `warehouse_fire` don't break existing assertions
- Expected net: ~720 tests pass after patch, ~15 new tests added → ~735 total

### 8.2 New regression suite — `test/exploit-regression.test.js`

1. **`exploit-degradation`**: seed a fixed scenario, place 6 farms adjacent to a single warehouse vs 6 farms distributed 4-6 tiles away on roads; simulate 3000 ticks; assert distributed layout has `foodProducedPerTick ≥ 1.2 × adjacent layout`.

2. **`strategy-diversity`**: run 15 benchmark presets with AI director; cluster survivors by mean worksite-to-depot distance (k-means, k=3); assert ≥ 2 clusters are represented in the top quartile of `survivalScore`.

3. **`road-roi`**: single-worksite isolated case; measure throughput at distance 6 with connected road vs distance 1 without road; assert road-distant ≥ 0.95 × road-adjacent.

4. **`survival-scaling`**: simulate 30 in-game minutes without any player input; assert `currentThreatTier` reaches ≥ 3 and `raid_interval_sec` ≤ 135 at tier 3.

5. **`escalation-lethality`**: run default preset 10× with fixed seeds, no player actions; assert median loss tick ∈ [2000, 5000] (colony neither instantly dies nor survives forever).

6. **`death-condition`**: induce `workers.length = 0` at tick T; assert outcome transitions to `"loss"` exactly at `T + DEATH_CONFIRMATION_SECONDS × tickRate`, not earlier.

7. **`score-formula`**: given known inputs (10 days, avg pop 15, 3 raids repelled, 200 refined goods), assert `survivalScore = 10 × 15 × 100 + 3 × 500 + 200 × 0.1 = 16520`.

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Early game becomes unplayable due to spoilage/fatigue piling on | 500-tick grace period halves spoilage; tier 0 for first 3 minutes has no raids |
| Warehouse throttle stalls tiny colonies | `WAREHOUSE_INTAKE_PER_TICK` tuned so 4 workers never queue; overflow only at 6+ |
| Fire events feel random and punishing | Amber pulse warning at 70% density; density UI overlay; fire radius ≤ 2 tiles |
| Permanent quarry depletion frustrates players | Quarry pool is largest (400); pit decal acts as landmark; players learn to prospect |
| AI fallback policy can't adapt to new mechanics | Update `src/simulation/ai/fallback/*.js` to include "check soil/congestion/pool" in Tactical policies (day 6) |
| Removing objectives breaks soak-sim baselines | Regenerate `docs/logic-baseline-2026-03.json` after patch; version bump to 0.8.0 |

## 10. Implementation Timeline

| Day | Task | Primary Files |
|-----|------|---------------|
| 1 | M4 Road Compounding (smallest, unblocks M3) | `LogisticsSystem.js`, `WorkerAISystem.js`, `balance.js` |
| 2 | M3 Carry fatigue | `WorkerAISystem.js`, `balance.js` |
| 3 | M3 In-transit spoilage + grace period | `WorkerAISystem.js`, `ResourceSystem.js` |
| 4 | M2 Warehouse throughput queue system | `WarehouseQueueSystem.js` (NEW), `ResourceSystem.js`, `GameApp.js` SYSTEM_ORDER |
| 5 | M2 Density risk events (vermin, fire) | `WorldEventSystem.js`, `balance.js` |
| 6 | M1 Soil salinization + farm yieldPool | `TileStateSystem.js`, `WorkerAISystem.js` |
| 7 | M1a Node layer generation + BuildAdvisor node gate + M1c demo recycling | `Grid.js`, `ScenarioFactory.js`, `BuildAdvisor.js`, `ProceduralTileTextures.js` |
| 8 | M1b Fog-of-war + VisibilitySystem + reveal rendering + explore_fog intent | `VisibilitySystem.js` (NEW), `FogOverlay.js` (NEW), `Minimap.js`, `WorkerAISystem.js` |
| 9 | Remove objectives; add survival score accumulation | `ScenarioFactory.js`, `runOutcome.js`, `ProgressionSystem.js` |
| 10 | Plan C RaidEscalatorSystem + HUD survival mode + death condition | `RaidEscalatorSystem.js` (NEW), `GameStateOverlay.js`, `PopulationGrowthSystem.js`, `index.html` |
| 11 | DevIndexSystem (6 dims + rolling telemetry + saturation detection) | `DevIndexSystem.js` (NEW), `EconomyTelemetry.js` (NEW), `balance.js` |
| 12 | AI Perceiver + Planner adaptation (tile state, density, carry spoilage, survival stats, node inventory, fog, DevIndex) | `ColonyPerceiver.js`, `ColonyPlanner.js`, `PromptBuilder.js` |
| 13 | AI Evaluator + StrategicDirector + SkillLibrary (postconditions, prospect, recycle, DevIndex-aware goals) | `PlanEvaluator.js`, `StrategicDirector.js`, `SkillLibrary.js`, fallback policies |
| 14 | Long-horizon benchmark harness (`bench:long`) + JSON output schema + CI integration | `scripts/long-horizon-bench.mjs` (NEW), `docs/benchmarks/` schema |
| 15 | Parameter retuning pass via long-horizon fit + supply-chain heat lens + regression tests + CHANGELOG | `balance.js`, `PressureLens.js`, `test/exploit-regression.test.js`, `CHANGELOG.md` |

**Version bump**: 0.7.1 → **0.8.0** ("Living World")

## 11. Out of Scope (explicitly deferred)

- New tile types (keep 14)
- New worker roles (keep 9)
- New entity types (bandit raids use existing event mechanics)
- Multi-season crop rotation
- Trade / diplomacy systems
- Bandit faction with AI (current raid system is sufficient)
- Full art overhaul — only the minimal visual hooks listed per mechanic
- Scoreboard persistence across sessions (leaderboard is a separate project)

## 12. Success Criteria

Design is successful if, after implementation:
1. All 7 new regression tests pass.
2. Default preset 30-minute AI-driven soak produces ≥ 2 distinct viable colony archetypes in the top-quartile scorers.
3. Manual playthrough: placing 6 farms against a warehouse produces strictly worse 30-minute survival than placing 4 farms in a road-connected radial layout.
4. Average new-player colony survives ≥ 10 in-game days without micromanagement.
5. No regression in frame time or tick time > 10% (measured via `npm run bench:perf`).
6. **Long-horizon soak (§ 16)**: day-365 DevIndex ≥ 70 and no single dimension < 50, across ≥ 8 of 10 seeds, until `saturationIndicator > 0.85`.
7. **Monotonic development**: Day-N DevIndex ≥ Day-(N/2) DevIndex × 0.85 for all checkpoints up to saturation (no regression phase).

## 13. AI Agent Adaptation

The existing hierarchical AI stack (Perceiver → Planner → Evaluator + StrategicDirector + Tactical policies + MemoryStore + SkillLibrary) has no awareness of M1–M4 state. Without adaptation, the AI fallback will still recommend warehouse-adjacent layouts and will not recognise spoilage, density, or escalation risk. The following 15 patches (~240 lines across 5 files) bring full coverage.

### 13.1 ColonyPerceiver (`src/simulation/ai/perception/ColonyPerceiver.js`)
1. **Tile-state sampling** — emit `salinizedCount`, `fallowCount`, `avgYieldPool.{farm,lumber,quarry,herb}`, `depletedTileCount` per snapshot.
2. **Warehouse density stats** — for each warehouse, compute producer-tiles inside `DENSITY_RADIUS=6`; emit `maxWarehouseDensity`, `densityRiskActive` boolean.
3. **Carry-spoilage risk** — sample worker carry ages; emit `avgCarryAgeTicks`, `spoilageInTransitLastMinute`.
4. **Survival stats** — emit `currentThreatTier`, `secondsUntilNextRaid`, `refinedGoodsProducedTotal`, `avgPopulationWindow`, `hoursSinceLastBirth`.
5. **Node inventory (M1a)** — emit `knownNodes.{forest,stone,herb}` with per-node `{x, y, yieldPool, depleted}`; `nodeUtilizationRatio` (built / discovered); `nextExhaustionMinutes` per type.
6. **Fog state (M1b)** — emit `revealedFraction`, `fogBoundaryLength`, `suspectedNodeCandidates` (fog tiles with terrain priors suggesting node presence).
7. **DevIndex dimensions** — emit all 6 dim values + composite + `saturationIndicator` for planner-level goal selection.

### 13.2 ColonyPlanner (`src/simulation/ai/planner/ColonyPlanner.js` + `PromptBuilder.js`)
5. **SYSTEM_PROMPT extension** — add M1–M4 quantification block ("A farm with `yieldPool<50` produces at 40%; a warehouse with density>400 has 0.8%/s fire ignite chance; carried food spoils at 0.005/s off-road; roads grant 3%/step stacking speed up to 1.6× at 20 steps").
6. **Depletion-aware fallback** — when LLM unavailable, the fallback policy checks `yieldPool` and `salinized` on each candidate placement and down-ranks sites with pool < 60.
7. **Isolation-sensitive scoring** — fallback scorer applies 0.8× penalty when placing on a tile with no connected road path to any warehouse ≥ 3 steps away.

### 13.3 PlanEvaluator (`src/simulation/ai/evaluator/PlanEvaluator.js`)
8. **Tile-state postconditions** — detect plan steps that place producers on `salinized` tiles or tiles with `yieldPool<50`; log `violatedPostcondition: "depleted_site"` to MemoryStore for Planner to learn.
9. **Density postcondition** — flag placements that push a warehouse's producer-count above `DENSITY_RISK_THRESHOLD=400`; feed back as `violatedPostcondition: "density_saturated"`.
10. **Spoilage postcondition** — detect worker haul chains where expected transit time > `spoilageHalfLifeSeconds`; annotate plan with `riskSpoilage` flag.

### 13.4 StrategicDirector (`src/simulation/ai/strategic/StrategicDirector.js`)
11. **Threat-tier detection** — read `currentThreatTier` from perception; when tier ≥ 3, switch strategic goal from "economic growth" to `"fortify_and_survive"`.
12. **Survival-mode goal chain** — new goal template: `preserve_food_reserve → maintain_worker_count → maintain_wall_perimeter → repel_raid`.
13. **Opportunity-cost prompts** — when a prime tile (high fertility + adjacent warehouse) is a candidate, emit a "consider distributed layout for long-term survival" hint to fallback.

### 13.5 SkillLibrary & Fallback (`src/simulation/ai/skills/SkillLibrary.js`, `src/simulation/ai/fallback/*`)
14. **Isolation-recovery skill** — new skill `relocate_depleted_producer`: detects producers with `yieldPool<30` + connected road; recommends demolish + rebuild 4-6 tiles away on road network.
15. **Fatigue-aware dispatch** — Tactical policy respects `workerRestDecayPerSecond × carryMassMultiplier`; prefers roaded assignments when worker rest < 0.35.
16. **Prospect skill (M1b)** — new skill `prospect_fog_frontier`: when all discovered nodes of a type have `yieldPool < 120`, queue workers with `explore_fog` intent toward highest-prior fog boundary.
17. **Demolish-and-recycle skill (M1c)** — new skill `recycle_abandoned_worksite`: when a producer sits on a depleted node, suggest demolish to recoup stone.
18. **DevIndex-aware strategic goal (§ 5.6)** — StrategicDirector reads `devIndexDims`; when any dim < 50 for 60+ game-seconds, emits a targeted repair goal (`rebalance_<dim>`).

## 14. Parameter Tuning Table

Audit of `src/config/balance.js` revealed **166 exposed** + **72 inline** parameters. The following targeted adjustments align the old tuning with the new M1–M4 mechanics and close three documented rebalance gaps (goal thrash, wood bottleneck, raid lethality).

### 14.1 New parameters (M1–M4)

| Key | Value | Mechanic | Notes |
|-----|-------|----------|-------|
| `soilSalinationThreshold` | `0.85` | M1 | exhaustion frac at which tile becomes `salinized` |
| `fallowDurationTicks` | `400` | M1 | ticks before salinized tile auto-recovers (if not rebuilt) |
| `farmYieldPoolInitial` | `200` | M1 | food units before depletion |
| `lumberYieldPoolInitial` | `300` | M1 | wood units before regrowth cooldown |
| `quarryYieldPoolInitial` | `400` | M1 | stone — **permanent** depletion |
| `herbYieldPoolInitial` | `180` | M1 | herbs |
| `yieldPoolLowOutputFraction` | `0.4` | M1 | output multiplier when `yieldPool<50` |
| `warehouseIntakePerTick` | `2` | M2 | max deliveries accepted per warehouse per tick |
| `warehouseDensityRadius` | `6` | M2 | radius for producer-density scan |
| `warehouseDensityRiskThreshold` | `400` | M2 | aggregate producer score above this triggers fire/vermin roll |
| `warehouseFireIgniteChancePerTick` | `0.008` | M2 | when density risk active |
| `verminSwarmIgniteChancePerTick` | `0.005` | M2 | when density risk active |
| `carryFatigueLoadedMultiplier` | `1.5` | M3 | extra rest decay when carrying |
| `foodSpoilageRatePerSec` | `0.005` | M3 | fraction/sec off-road/off-bridge |
| `herbSpoilageRatePerSec` | `0.01` | M3 | higher than food (delicate) |
| `spoilageGracePeriodTicks` | `500` | M3 | first 500 ticks of run halve rates |
| `roadStackPerStep` | `0.03` | M4 | per-tile cumulative speed bonus |
| `roadStackStepCap` | `20` | M4 | max 1.6× at 20 consecutive road steps |
| `isolationDepositPenalty` | `0.8` | M4 | when no road path ≥3 tiles |
| `raidBaseTierLogScale` | `1.6` | Plan C Survival | `base_tier = log2(gameMin/3 + 1) × 1.6`, no hard cap |
| `raidDevTierOffset` | `40` | Plan C Survival | DevIndex threshold above which dev_tier accumulates |
| `raidDevTierMax` | `4.0` | Plan C Survival | cap for DevIndex-driven surcharge |
| `raidIntervalBaseSec` | `180` | Plan C Survival | numerator in `180 / (1 + 0.18 × threat_tier)` |
| `raidIntervalFloorSec` | `30` | Plan C Survival | absolute minimum interval |
| `raidStrengthPerTier` | `0.22` | Plan C Survival | `strength_mult = 1 + 0.22 × tier` |
| `raidGraceGameMin` | `3` | Plan C Survival | initial silent window |
| `deathConfirmationGameSeconds` | `172800` | Survival | 48 in-game hours |
| `survivalScoreDayCoef` | `100` | Survival | days × pop × 100 |
| `survivalScoreRaidCoef` | `500` | Survival | raids × 500 |
| `survivalScoreGoodsCoef` | `0.1` | Survival | refined × 0.1 |
| `forestNodeCountRange` | `[18, 32]` | M1a Nodes | per-map spawn range |
| `stoneNodeCountRange` | `[10, 18]` | M1a Nodes | per-map spawn range |
| `herbNodeCountRange` | `[12, 22]` | M1a Nodes | per-map spawn range |
| `nodeClusterMinMax` | `{forest:[3,7], stone:[2,4], herb:[1,3]}` | M1a Nodes | cluster footprint |
| `lumberNodeYieldPool` | `300` | M1a Nodes | wood per forest node |
| `stoneNodeYieldPool` | `400` | M1a Nodes | stone per quarry node (permanent) |
| `herbNodeYieldPool` | `180` | M1a Nodes | herbs per herb node |
| `demoStoneRecovery` | `0.35` | M1c Recycling | stone refund fraction on demolish |
| `initialRevealRadius` | `4` | M1b Fog | 9×9 square around spawn |
| `actorVisionRadius` | `4` | M1b Fog | per-tick reveal radius (Chebyshev) |
| `fogOpacityUnseen` | `0.15` | M1b Fog | render alpha for FOG tiles |
| `exploreFogIntentPriority` | `0.25` | M1b Fog | lowest-priority idle intent |
| `devIndexTickIntervalSec` | `10` | DevIndex | recompute cadence (game-seconds) |
| `devIndexWeights` | `{econ:25, pop:20, infra:15, def:15, res:15, ai:10}` | DevIndex | dimension weights |
| `devIndexSmoothingWindowMin` | `5` | DevIndex | short-window rolling buffer |
| `devIndexResilienceWindowMin` | `10` | DevIndex | long-window rolling buffer |
| `saturationIndicatorThreshold` | `0.85` | DevIndex | used/revealed tile ratio triggering plateau-ok |

### 14.2 Rebalance adjustments (existing params)

| Key | Current | Proposed | Rationale |
|-----|---------|----------|-----------|
| `kitchenCycleSec` | `3.0` | `2.8` | reduce wood-equivalent bottleneck (see § 15) |
| `warehouseSoftCapacity` | `3` | `4` | small colonies no longer queue after M2 intake cap |
| `banditRaidLossPerPressure` | `0.36` | `0.28` | escalator handles lethality; avoid double-tax |
| `foodEmergencyThreshold` | `14` | `18` | aligns with 48h death grace, fewer AI panic flips |
| `workerIntentCooldownSec` | `1.5` | `2.2` | reduce goal thrash (goalFlipCount 71→target ≤40) |
| `objectiveHoldDecayPerSecond` | `0.6` | `0.4` | slower switching → more coherent long-range plans |
| `lumberProductionPerSecond` (implicit) | — | bump weather modifiers by +0.05 across the board | wood undersupply (see § 15) |
| `MIN_FOOD_FOR_GROWTH` | `20` | `25` | pair with new 48h birth window |
| `FOOD_COST_PER_COLONIST` | `5` | `6` | survival mode rewards lean populations |

All new parameters land in a new section of `balance.js` labelled `// --- Living World (v0.8.0) ---` to keep the diff readable.

## 15. Baseline Benchmark Findings & Improvement Targets

Three benchmarks were run against the pre-M1/M2/M3/M4 baseline (`v0.7.1`) to anchor the regression targets.

### 15.1 `bench:perf` (`docs/assignment4/metrics/perf-baseline.csv`)
- Grid generation: temperate 18–43 ms, rugged 22–32 ms, archipelago 6–7 ms. No regression expected (M1 adds only per-tile struct fields).
- A* pathfinding: all runs sub-ms. M4 compounding bonus is read from `tileFlags[]` — no path cost.
- **Target**: post-patch tick time ≤ 1.10× baseline (contractual from § 12.5).

### 15.2 `logic-baseline-2026-03.json`
- `goalFlipCount = 71` over 120 s of AI control → **AI thrashing**. Root cause: `workerIntentCooldownSec=1.5` too short given new tile-state signals would amplify switching.
- `invalidTransitionCount = 0` → state planner is sound; no action.
- `deathsTotal = 3` in 120 s → baseline lethality is high; escalator must not compound this early.
- **`deliverWithoutCarryCount = 23`** → silent bug: worker enters deliver state with empty carry. Fix in day 12 regression pass (likely an unchecked state transition in `StatePlanner.js`).
- **Targets**: `goalFlipCount ≤ 40`, `deliverWithoutCarryCount = 0`, `deathsTotal ≤ 2` at baseline preset.

### 15.3 `soak-report.json` (3 × 3-minute runs)
- Average pop 22–23 (healthy), food 115–138 (surplus), **wood 10–19** (chronic shortfall).
- `peakThreat` 25–33 → within grace window at current balance; escalator will push this up after patch.
- 0–1 deaths per run → baseline is stable enough for survival-mode extension.
- **Target**: post-patch 30-minute soak should sustain wood ≥ 30 median and pop ≥ 15 median across ≥ 8/10 seeds.

### 15.4 Improvement Targets rollup

| Metric | Baseline | Post-M1..M4 Target | Measurement |
|--------|----------|--------------------|-------------|
| Adjacency exploit throughput | distributed = 0.72× adj | distributed ≥ 1.2× adj | `exploit-degradation` test |
| Goal-flip rate (AI thrashing) | 71 / 120 s | ≤ 40 / 120 s | `logic-baseline` |
| Empty-carry deliveries | 23 | 0 | `logic-baseline` |
| Median wood (soak 3 min) | 10–19 | ≥ 30 | `soak-sim` |
| Median survival days | N/A (objectives) | ≥ 10 for default preset | new `survival-scaling` test |
| Raid tier @ 30 min | N/A | ≥ 3 (tier 3) | new `survival-scaling` test |
| Frame time regression | — | ≤ +10% | `bench:perf` |

These targets are the exit criteria for v0.8.0.

## 16. Long-Horizon Benchmark (`bench:long`)

Existing benchmarks (`bench:perf`, `bench:logic`, `soak-sim`) are 1–3 minutes of wall-clock — they cannot answer "does the colony develop steadily over 365+ days?" This section defines a new harness that simulates up to 730 in-game days at high tick rate (~60× real time), with zero player input, and emits a per-checkpoint quality snapshot. It is **the** parameter-tuning reference.

### 16.1 Command

```bash
npm run bench:long -- --seed 42 --max-days 730 --preset temperate_plains
```

Runs headless (no Three.js), uses the same deterministic simulation loop, streams tick output to stdout, writes JSON to `docs/benchmarks/long-horizon-<seed>-<preset>.json` and a Markdown summary to `docs/benchmarks/long-horizon-<seed>-<preset>.md`. Typical wall-clock: 2–8 minutes for 365 days depending on tick density.

**CLI flags**
- `--seed` (int, required): PRNG seed
- `--max-days` (int, default 365): early-stop at saturation or this value
- `--preset` (string): one of the 6 map templates
- `--tick-rate` (float, default 12): sim ticks per real-time second (trades accuracy for speed)
- `--stop-on-death` (bool, default true): early exit on colony loss
- `--stop-on-saturation` (bool, default true): early exit when `saturationIndicator > 0.85`

### 16.2 Checkpoints

Sampled at day boundaries `{30, 90, 180, 365, 548, 730}` + final tick:

| Checkpoint | Minimum requirement |
|-----------|---------------------|
| Day 30 | DevIndex ≥ 40; population ≥ 8; 0 deaths |
| Day 90 | DevIndex ≥ 55; ≥ 50% of map nodes discovered; avg food reserves ≥ 60 |
| Day 180 | DevIndex ≥ 65; saturation < 0.40; no single dim < 45 |
| Day 365 | **DevIndex ≥ 70**; saturation < 0.70; **no single dim < 50**; ≥ 10 raids repelled |
| Day 548 | DevIndex ≥ 72 OR saturation > 0.80 (plateau acceptable) |
| Day 730 | DevIndex ≥ 72 OR saturation > 0.85 (plateau expected) |

**Monotonicity rule**: for any adjacent pair `(D_i, D_{i+1})`, `DevIndex(D_{i+1}) ≥ 0.85 × DevIndex(D_i)` UNLESS `saturationIndicator(D_{i+1}) > 0.85`. A monotonicity violation fails the benchmark.

### 16.3 Output schema

```json
{
  "seed": 42,
  "preset": "temperate_plains",
  "version": "0.8.0",
  "finalOutcome": "saturated" | "loss" | "max_days_reached",
  "daysCompleted": 365,
  "terminatedAtGameSec": 31536000,
  "survivalScore": 82450,
  "checkpoints": [
    {
      "day": 30,
      "devIndex": 48.2,
      "dims": { "econ": 55.1, "pop": 42.0, "infra": 38.5, "def": 25.0, "res": 60.0, "ai": 71.2 },
      "saturation": 0.08,
      "population": 14,
      "resources": { "food": 138, "wood": 42, "stone": 22, "herbs": 9, "meals": 18, "tools": 4, "medicine": 2 },
      "nodes": { "forest": {"known": 8, "depleted": 0}, "stone": {"known": 3, "depleted": 0}, "herb": {"known": 5, "depleted": 0} },
      "raidsRepelled": 1,
      "raidTier": 1.2
    }
  ],
  "passed": true,
  "violations": []
}
```

### 16.4 CI integration

- A "smoke" subset (`--max-days 90 --seed 1`) runs on every PR (~30s)
- The full 365-day matrix (10 seeds × 3 presets = 30 runs) runs nightly on main branch, writing to `docs/benchmarks/nightly/`
- Monotonicity violation, DevIndex < minimum at any checkpoint, or loss before day 180 fails the matrix

### 16.5 Parameter tuning loop

The benchmark output is the **ground truth** for parameter tuning:

1. Run `bench:long` on a suite (10 seeds × default preset)
2. Compute median DevIndex per checkpoint
3. If median DevIndex < target at checkpoint D_k, identify weakest dim at D_k
4. Map dim → controlling parameters (e.g., `econThroughput` low → check `warehouseIntakePerTick`, `kitchenCycleSec`, `foodSpoilageRatePerSec`)
5. Tune one parameter, rerun, compare — accept if ΔDevIndex > +2 at D_k and no regression at earlier checkpoints
6. Commit parameter change with benchmark delta in commit message

This replaces eyeball tuning with an objective, time-indexed loop.

### 16.6 Test coverage

- **`test/long-horizon-smoke.test.js`**: runs `bench:long --max-days 90 --seed 1` and asserts Day 30 DevIndex ≥ 40, Day 90 DevIndex ≥ 55.
- **`test/monotonicity.test.js`**: for seeds {1, 2, 3}, runs 180 days and asserts the 15% monotonicity rule holds.
- Full 365/730 runs are CI-nightly only (too slow for per-PR).

### 16.7 Known limits

- Fog-exploration driven by AI fallback may leave up to 30% of the map unexplored on average — acceptable because the harness measures development quality within the explored area, not global map utilization.
- On 96×72 grids with default node counts, expect natural saturation around day 500–600 for most seeds; plateau is the design endgame.
- Benchmark cannot validate visual quality (artist review remains manual).

