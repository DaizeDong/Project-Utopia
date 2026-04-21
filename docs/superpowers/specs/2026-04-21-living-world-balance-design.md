# Living World Balance Pass — Design Spec

**Date**: 2026-04-21
**Author**: Daize Dong (with Claude brainstorm)
**Scope**: Compact balance adjustment (~10 days, 3-5 new mechanics)
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

Four interlocking economy mechanics plus a survival-mode replacement for the objective system. All mechanics reuse existing system slots in `SYSTEM_ORDER`; one new system (`WarehouseQueueSystem`) and one new meta system (`RaidEscalatorSystem`) are added.

```
[Existing]                [New / Modified]
SimulationClock         → unchanged
ProgressionSystem       → updateObjectiveProgress() replaced with updateSurvivalScore()
RoleAssignmentSystem    → unchanged
PopulationGrowthSystem  → tracks lastBirthTick for death condition
StrategicDirector       → unchanged
EnvironmentDirectorSystem → unchanged
WeatherSystem           → unchanged
WorldEventSystem        → accepts new event types: warehouse_fire, vermin_swarm
                          bandit raids now driven by RaidEscalatorSystem
[+] RaidEscalatorSystem → NEW. Time-scaled raid injector
NPCBrainSystem          → unchanged
WorkerAISystem          → carry-state fatigue, in-transit spoilage, road speed stack
VisitorAISystem         → unchanged
WildlifeAISystem        → unchanged
LifecycleSystem         → unchanged
BuildSystem             → unchanged
BoidsSystem             → unchanged
ResourceSystem          → intake throttle, deposit application hook
ProcessingSystem        → unchanged
[+] WarehouseQueueSystem → NEW. Runs before WorkerAISystem
TileStateSystem         → yieldPool, salinization, crowding factor
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

**Lumber / Quarry / Herb Garden nodes**
- New tile-local state: `yieldPool: number` (initial reserve)
- Initial pool:
  - `FARM_INITIAL_POOL = 200`
  - `LUMBER_INITIAL_POOL = 300`
  - `QUARRY_INITIAL_POOL = 400`
  - `HERB_INITIAL_POOL = 180`
- Each harvest deducts `yield × (1 + tool_bonus)` from pool
- On depletion (pool ≤ 0):
  - **Farm**: enters long fallow (`FARM_FALLOW_TICKS = 300 * tickRate`), then pool regenerates to 60% of initial
  - **Herb garden**: same as farm (`HERB_FALLOW_TICKS = 300`, 60% regen)
  - **Lumber**: visual stump silhouette, `LUMBER_REGROW_TICKS = 400`, 80% regen
  - **Quarry**: **permanent** depletion, pit decal remains, tile cannot be harvested until erased

**Files**
- `src/simulation/economy/TileStateSystem.js` — add `yieldPool`, `salinized`, `fallowUntil` fields + tick logic
- `src/simulation/npc/WorkerAISystem.js:283-289` — harvest deducts from pool; respect caps/fallow
- `src/render/ProceduralTileTextures.js` — soil crack overlay (< 30% fertility), stump sprite, pit decal
- `src/config/balance.js` — new `TILE_DEPLETION` frozen config

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

### 5.4 Raid Escalator

**`src/simulation/meta/RaidEscalatorSystem.js`** (NEW, runs after `WorldEventSystem`):

```
elapsed_game_minutes = state.clock.elapsedGameSeconds / 60
threat_tier          = min(RAID_TIER_CAP, floor(sqrt(elapsed_game_minutes / 3)))
raid_interval_gamesec = max(45, 180 - 15 * tier)   // game-seconds, matches event cooldowns
raid_strength_mult    = 1.0 + 0.35 * tier
```

All time units in the escalator formula are **in-game seconds**, consistent with existing `WorldEventSystem` cooldowns. With `TIME_COMPRESSION = 60`, tier 3 raids fire every ~135 game-seconds = ~2.25 real seconds of play time scaled by the active speed setting.

Behavior:
- Track `lastRaidGameSec` per session
- When `state.clock.elapsedGameSeconds - lastRaidGameSec >= raid_interval_gamesec`, emit `bandit_raid` event via existing `WorldEventSystem.js:432-464` handler
- Payload includes `intensity = base_intensity × raid_strength_mult`
- Raid outcome (defeat / flee / damage) remains driven by existing combat logic in `WorldEventSystem`
- Max tier capped at `RAID_TIER_CAP = 6` to keep late-game survivable but extreme

### 5.5 HUD Changes

**`index.html`** + `src/ui/hud/GameStateOverlay.js`:
- `#statusObjective` → `#statusSurvival`: "Day 34 · Threat Tier III · Score 12,450"
- Top-right threat tier bar: `● ● ● ○ ○ ○` (filled dots = current tier)
- Next-raid countdown badge, visible when `tier >= 1`
- End-game screen: "Survived 34 days · Repelled 12 raids · Final Score 12,450"

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
| 6 | M1 Soil salinization + fertility rewrite | `TileStateSystem.js`, `WorkerAISystem.js` |
| 7 | M1 Yield pools for lumber/quarry/herb + visual hooks | `TileStateSystem.js`, `ProceduralTileTextures.js` |
| 8 | Remove objectives; add survival score accumulation | `ScenarioFactory.js`, `runOutcome.js`, `ProgressionSystem.js` |
| 9 | RaidEscalatorSystem + HUD survival mode + death condition | `RaidEscalatorSystem.js` (NEW), `GameStateOverlay.js`, `PopulationGrowthSystem.js`, `index.html` |
| 10 | Supply-chain heat lens + new tests + CHANGELOG + regression fixes | `PressureLens.js`, `test/exploit-regression.test.js`, `CHANGELOG.md` |

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
