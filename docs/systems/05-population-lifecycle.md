# 05 — Population & Lifecycle

This document covers every system that governs how workers come into existence,
how they survive day-to-day, and how the game evaluates and escalates pressure as
the colony grows. Source files referenced throughout:

- `src/simulation/population/PopulationGrowthSystem.js` (re-exports `RecruitmentSystem`)
- `src/simulation/lifecycle/MortalitySystem.js`
- `src/simulation/population/RoleAssignmentSystem.js`
- `src/simulation/meta/DevIndexSystem.js`
- `src/simulation/meta/RaidEscalatorSystem.js`
- `src/simulation/meta/ProgressionSystem.js`
- `src/simulation/telemetry/EconomyTelemetry.js`
- `src/dev/forceSpawn.js` — dev-only stress helper (`__devForceSpawnWorkers`),
  re-exported from PopulationGrowthSystem for back-compat
- `src/config/balance.js` (all numeric constants)
- `src/entities/EntityFactory.js` (worker construction)

---

## Population Growth — Recruitment Mechanics

Population growth is handled by `RecruitmentSystem` (exported under the legacy
name `PopulationGrowthSystem` for back-compat with `GameApp.createSystems` and
`SimHarness`). It runs on a fixed check interval and the spawn path is now
**recruit-only** — there is no organic birth path in v0.10.x. Each tick it
evaluates these gates:

1. **Warehouse infrastructure gate** — at least one `WAREHOUSE` tile must
   exist. Recruited workers spawn at a randomly selected warehouse.
2. **Effective cap gate** — `effectiveCap = min(recruitTarget, infraCap)`.
   The workers + queue total must be strictly below this cap (see Population
   Cap Mechanics).
3. **Food buffer gate** — `state.resources.food` must be at or above
   `recruitMinFoodBuffer` for both auto-fill and spawn drain (the double gate
   prevents a built-up queue from draining the colony into a starvation
   spiral).
4. **Recruit cost gate** — spawning debits `recruitFoodCost` (default
   **25 food**) from `state.resources.food`.
5. **Cooldown gate** — `state.controls.recruitCooldownSec` must be 0 (default
   between successive spawns: `recruitCooldownSec` = 30 s, halved to 12 s in
   v0.8.4 round-2 polish to restore long-horizon throughput).

When all gates pass, a new worker entity is created at a seeded-random
warehouse tile via `createWorker()`, the food stockpile is decremented by
`recruitFoodCost`, the queue advances by 1, and these counters update on
`state.metrics`:

- `birthsTotal` — monotonic integer, incremented once per spawn.
- `recruitTotal` — Phase 11 split-out so analytics can distinguish organic
  births (zero in v0.8.4+) from explicit recruits.
- `lastBirthGameSec` — current `state.metrics.timeSec` at spawn time.

The spawn event is emitted on the `GameEventBus` as `VISITOR_ARRIVED` with
`reason: "recruited"` and as `WORKER_BORN` with the same reason. Recruits do
NOT carry parents (`lineage.parents = []`) — they're hired, not born.

### Manual Recruit Button (Right Sidebar)

`#recruitOneSidebarBtn` was added to the always-open Population card on the
right Colony sidebar (`index.html` ~line 2873) so players can queue a single
recruit (cost: 25 food) without digging into `Settings > Dev Tools >
Population Control`. `BuildToolbar.#setupRecruitControls` resolves both the
sidebar nodes (`#recruitOneSidebarBtn`, `#autoRecruitSidebarToggle`,
`#recruitStatusSidebarVal`) and the existing dev-panel nodes; both buttons
share a single `handleRecruitClick` closure (food/cost gate + queue clamp).
Disabled tooltips surface the blocking reason, e.g. "Need 25 food (have 12)"
or "Recruit queue full (12/12)". Status colour cues: red when
`food < recruitFoodCost`, amber when queue is full.

### RNG Determinism

The recruitment system requires a deterministic RNG (`services.rng.next`) so
that benchmark replays are reproducible. If no services are threaded (e.g.
legacy unit tests) it falls back to `Math.random`.

---

## Population Cap Mechanics

The dynamic cap is computed inline inside `RecruitmentSystem.update()` every
check interval. The formula is:

```
infraCap = 12
         + warehouses × 3
         + floor(farms × 0.5)
         + floor(lumbers × 0.5)
         + quarries × 2
         + kitchens × 2
         + smithies × 2
         + clinics × 2
         + herbGardens × 1

effectiveCap = min(recruitTarget, infraCap)
```

Both values are published to `state.metrics.populationInfraCap` and
`state.metrics.populationEffectiveCap` so the HUD can show the live cap
alongside the population count.

### Hard Cap Removed (HW7 hotfix iter4 Batch E — Issue #9)

Players reported workers stuck at 16 in late game ("后期 worker 到 16 个就
不增长了"). All hard caps have been removed:

- `RecruitmentSystem` — the legacy `Math.min(80, ...)` ceiling on `infraCap`
  is gone. `infraCap` is still infrastructure-derived (warehouses + farms +
  lumbers + quarries + kitchens + smithies + clinics + herbGardens) but no
  longer clipped to a global ceiling.
- `ColonyPerceiver` — the companion `popCap` estimate (used by the LLM
  observation packet) lost its matching `Math.min(80, ...)` clamp.
- `EntityFactory` + `BuildToolbar` — initial / backfill default for
  `state.controls.recruitTarget` raised **16 → 500** (matches the
  `workerTargetInput` slider's `max="500"`). Auto-recruit still respects the
  food buffer + cooldown — this just removes the artificial 16 bottleneck.

Other design choices embedded in the formula:

- **Warehouses are the primary multiplier (×3)**. Without logistics
  infrastructure the colony cannot support many workers.
- **Farms and lumbers use 0.5 coefficient** (reduced in v0.8.1 from 0.8 and
  1.0 respectively). Tighter coefficients prevent runaway food-production
  loops from inflating population faster than the food supply can sustain.
- **Processing buildings (kitchens, smithies, clinics) each contribute 2
  slots**, rewarding investment in the refined-goods chain.
- **Quarries and herb gardens contribute directly** (×2 and ×1) as secondary
  infrastructure.

If `workers + queue >= effectiveCap` the auto-fill branch exits without
enqueuing more recruits. The cap is re-evaluated every tick, so tearing down
buildings can cause it to drop below the live population count — the
population will not be forcibly culled but no new recruits will be enqueued
until natural deaths bring the count below the new cap.

---

## Food Consumption Model

### Worker Hunger Decay (Two-Path)

Each worker has a `hunger` value in [0, 1] (1 = full, 0 = starving). Hunger
decay was rewired in v0.10.1 with a two-path model so the colony has a real
fail-state again (the v0.10.1-l rewrite originally swapped per-entity hunger
for a fixed global drain on `state.resources.food`, which never wired through
to `entity.hunger` and made starvation unreachable — "do-nothing wins").

**Path 1 — global food drain (v0.10.1-l).** A fixed colony-wide drain on
`state.resources.food` at `workerFoodConsumptionPerSecond` (**0.038/s**,
tightened from 0.050/s in r0-A5). At 12 workers this is ~0.456 food/s —
combined with `INITIAL_RESOURCES.food = 320` it stretches pure-burn runway
~702 s (~11:42), targeting a realistic crash-to-recovery window of ~6:30.

**Path 2 — per-entity hunger decay (v0.10.1-r1-A5 reconnect, r2-A5 widened).**
When `state.resources.food < workerHungerDecayLowFoodThreshold` (**8 units**),
each worker's `entity.hunger` decays at `workerHungerDecayWhenFoodLow`
(**0.020/s**) so `MortalitySystem.shouldStarve` can fire (`hunger <= 0.045
+ holdSec=34`). Time-to-first-death once food enters the low band: ~50 s
(decay) + 34 s (holdSec) ≈ 84 s — gives the player a clear "act or die"
window without instant collapse. Pre-r2 the trigger was strict `food == 0`
but TRADE_CARAVAN trickle (+0.5/s, since halved to +0.22/s) and ProgressionSystem
emergency relief charges kept food asymptotically above zero, so AFK still
won. The threshold-band trigger closes that loophole.

### Per-Entity Hunger Recovery

Workers seek food when `hunger` drops below `workerHungerSeekThreshold` (0.18
global; `metabolism.hungerSeekThreshold` per worker in `[0.12, 0.20]`).
At-warehouse fast-eat (v0.10.1-h P4) drains
`warehouseEatRatePerWorkerPerSecond` = **0.60/s** (global cap
`warehouseEatCapPerSecond` = **4.0/s** shared across at-most ~6.7 workers;
overflow workers spill to carry-eat at the same per-worker rate). Recovery
target: `workerEatRecoveryTarget` = 0.70. A worker recovers fully (0.10 →
0.70) in ≈ 9 s, with a 94.5 s work cycle this is ~91% productive (up from
~83% at 0.30/s).

### Recruit Food Cost

Each spawn debits `recruitFoodCost` = **25 food**. This is the only food
cost for new workers (no organic birth path).

### Emergency Threshold

`BALANCE.foodEmergencyThreshold` = **18 units** is the global low-food
trigger. Below this level:
- `RoleAssignmentSystem` forces `effectiveRatio` to at least 0.82 (heavily
  biased toward farming), and specialist slots are capped at
  `emergencyFloor = 1`.
- The AI ColonyPlanner and ProgressionSystem treat this as a collapse
  precursor.

### Supply vs Demand Balance

The food rate visible in `state.metrics.foodRatePerMin` is a derived metric
updated by `ResourceSystem` and `EconomyTelemetry`. RoleAssignmentSystem
uses this rate (and raw food stock vs `fallbackIdleChainThreshold` = 15
units) to decide whether to boost kitchen (COOK) slot allocation. The
dynamic farm-ratio shift in `RoleAssignmentSystem` adjusts the FARM/WOOD
split based on `foodShare / (food + wood)` to continuously rebalance toward
whichever resource is in deficit.

---

## Worker Lifecycle — Spawning to Death

### Worker Creation

`createWorker(x, z, rngFn)` in `EntityFactory.js` constructs a fully
initialised worker entity. Key fields set at spawn:

| Field | Value at Spawn |
|---|---|
| `hunger` | Random in `[0.40, 0.95]`, capped at 1.0 |
| `rest` | Random in `[0.70, 1.00]` |
| `morale` | Random in `[0.60, 1.00]` |
| `hp` | 100 / maxHp 100 |
| `role` | `ROLE.FARM` (default until `RoleAssignmentSystem` reassigns) |
| `skills` | Each of farming/woodcutting/mining/cooking/crafting drawn from `[0.3, 1.0]` |
| `traits` | 1 or 2 traits drawn from `["hardy","swift","careful","efficient","social","resilient"]` |
| `starvationSec` | 0 |

The displayed name is a personalised `<Name>-<seq>` pair (e.g. `"Aila-10"`)
drawn from a 40-name bank in deterministic RNG order so replays stay stable.

Workers spawn at a warehouse tile's world position, applying a small
seeded-random velocity offset so newly arrived workers do not stack exactly
on the depot.

### Initial Population

`INITIAL_POPULATION` in `balance.js` sets the starting state:

- workers: 12
- visitors: 4 (alternating trader/saboteur)
- herbivores: **8** (raised 3→8 in HW7 hotfix-A Issue #4 — playtest
  reported "动物太少", world felt empty; per-zone caps in `longRunProfile.js`
  still gate breed/recovery)
- predators: **2** (raised 1→2)

Starting resources (v0.10.1-r0-A5 opening-runway extension): food **320**,
wood 35, stone 15, herbs 8.

### Worker Needs Over Time

Three need axes decay continuously in the background:

- **Hunger** — see "Two-Path" section above (`workerFoodConsumptionPerSecond`
  global drain + `workerHungerDecayWhenFoodLow` per-entity decay when in the
  low-food band).
- **Rest** — decays at `workerRestDecayPerSecond` (0.004/s), faster during
  night (`workerRestNightDecayMultiplier` = 2.4×) and while carrying
  (fatigue multiplier 1.5×). Workers seek rest when below 0.2; recover to
  0.5 threshold.
- **Morale** — decays at `workerMoraleDecayPerSecond` (0.001/s), recovers at
  0.02/s. Witnessing the death of a colleague or friend pushes a narrative
  entry into the worker's `memory.recentEvents` ring (6 entries max).

### Role Assignment

`RoleAssignmentSystem` runs every `BALANCE.managerIntervalSec` (1.2 seconds)
and reassigns all live workers to roles based on:

1. A minimum FARM reserve (`farmMin = min(2, n)`) and WOOD reserve (1 if
   lumber tiles exist and budget permits).
2. Specialist slots computed by `computePopulationAwareQuotas(n)`, which
   uses discrete band tables for populations ≤ 7 and a per-worker scaling
   formula for populations ≥ 8.
3. Player-exposed `state.controls.roleQuotas` slider caps (default 99 =
   unlimited for all specialist types).
4. Building gates: COOK requires kitchen, SMITH requires smithy, HERBALIST
   requires clinic, STONE requires quarry, HERBS requires herb garden, HAUL
   requires warehouses and `n >= haulMinPopulation` (lowered to **6** in
   v0.8.5 Tier 1 B4 to honour the `bandTable` haul=1 entry for pop 6-7).
5. Emergency override: when food < 18 the system forces `effectiveRatio >=
   0.82` and caps specialist slots to `emergencyFloor = 1`.

Role counts are published to `state.metrics.roleCounts` every tick so the
ColonyPlanner's idle-chain feedback loop can detect `COOK = 0` with a
kitchen present.

---

## Death Conditions and Starvation

`MortalitySystem` (now under `src/simulation/lifecycle/`) runs every frame
(no internal timer). It iterates all agents and animals and evaluates two
death paths for each live entity:

### HP-Based Death

If `entity.hp <= 0` the entity is marked dead with `deathReason = "event"`
(or a custom reason set by the attacking system). Predator attacks deal
`BALANCE.predatorAttackDamage` (26 HP) per hit and are the primary source
of combat deaths.

### Starvation

Starvation is gated by both a hunger threshold and a hold timer, with
different values per entity type:

| Entity Type | Death Hunger Threshold | Hold Seconds |
|---|---|---|
| Worker | 0.045 | 34 |
| Visitor | 0.040 | 40 |
| Herbivore | 0.035 | 20 |
| Predator (default) | 0.030 | 28 |

The starvation clock (`entity.starvationSec`) only advances toward death
when **no reachable nutrition source exists**. Workers and visitors are
checked for reachability using a cached A* path (refreshed at most every
2.5 s) against:

1. Their own carry (food > 0 counts immediately, no pathfinding needed).
2. Nearest reachable warehouse with food > 0 in the stockpile.
3. Nearest reachable FARM tile within path length ≤ 16 steps.

When a reachable source exists the starvation clock actually decreases at
1.2× the normal rate (recovery buffer). Death only fires when
`starvationSec >= holdSec AND reachability = false`.

### Per-Entity Hunger Reconnect (v0.10.1 R1 A5)

The v0.10.1-l rewrite swapped per-entity hunger for a colony-wide drain on
`state.resources.food`, which short-circuited the per-entity death chain
above (no worker ever crossed the 0.045 threshold because their hunger
field was no longer being touched). R1-A5 reconnected `entity.hunger` so
the chain fires when both `food < workerHungerDecayLowFoodThreshold` (8)
AND `hunger <= 0.045` AND `holdSec` elapses — see the "Two-Path" hunger
section above. R2-A5 widened the trigger from `food == 0` to `food < 8` so
trickle income (TRADE_CARAVAN, emergency relief) can no longer fully offset
decay.

### Death Recording

On death:
- `state.metrics.deathsTotal` is incremented.
- `state.metrics.deathsByReason` and `deathsByGroup` are updated.
- A narrative line is pushed to `state.gameplay.objectiveLog` (capacity 24
  entries) for colonist deaths.
- Up to 3 related workers (by relationship opinion) and 3 nearby workers
  (within Manhattan distance 12) receive a witness memory entry.
- The entity is emitted on `GameEventBus` as `WORKER_STARVED` or
  `WORKER_DIED`.
- Dead entities are filtered out of `state.agents` at the end of
  `MortalitySystem.update()`.

There is **no respawn mechanic**. Once a worker dies it is permanently
removed. Population recovery relies entirely on `RecruitmentSystem` spawning
new workers when the food/cap gates allow.

### Medicine Healing

`MortalitySystem` also applies medicine each frame. The most-injured living
worker (by current HP) is healed at `BALANCE.medicineHealPerSecond` (8 HP/s)
as long as `state.resources.medicine > 0`. Medicine is consumed at 0.1
units per second of healing.

---

## Survival Mode

v0.8.0 introduced Survival Mode as the primary game loop, replacing the
legacy 3-objective win path.

### Win Condition

There is **no win condition** in Survival Mode. The game runs indefinitely;
the goal is to maximise `state.metrics.survivalScore` while keeping at least
one worker alive.

### Loss Condition

The colony is wiped — `state.agents` contains zero living workers — after
the **loss grace period** (`BALANCE.lossGracePeriodSec` = 90 seconds).
`resourceCollapseCarryGrace` (raised 0.5 → **1.5** in v0.10.1-r0-A5) widens
the carry-in-transit grace so the first-warehouse construction window
doesn't trip the loss-state while workers are mid-haul.

### Survival Score

`ProgressionSystem.updateSurvivalScore()` accrues the score each frame:

```
survivalScore += survivalScorePerSecond × dt          // +1 per sim-second survived
survivalScore += survivalScorePerBirth × newBirths     // +5 per new birth
survivalScore -= survivalScorePenaltyPerDeath × deaths // -10 per colonist death
```

Birth and death deltas are tracked via monotonic cursors
(`survivalLastBirthsSeen`, `survivalLastDeathsSeen`) so every event scores
exactly once, even when multiple events fire within the same integer second.

### Recovery Charges

`ProgressionSystem` includes an emergency recovery system. When
`collapseRisk` exceeds `recoveryTriggerRiskThreshold` (58%) and resources
are critically low, a relief package fires automatically — but only when
`deaths > 0` (v0.10.1-r2-A5 P0-1: pre-r2 the trigger fired purely on
collapseRisk, which let AFK runs farm relief charges indefinitely). Up to
`recoveryChargeCap` (3) charges are available per run, with a
`recoveryCooldownSec` (30 s) between triggers.

Recovery branches respect the exported `RECOVERY_ESSENTIAL_TYPES` whitelist
(frozen `Set` of `farm` / `lumber` / `warehouse` / `road`) and the helper
`isRecoveryEssential(type)`. `state.gameplay.recovery.essentialOnly` is set
each tick from `state.ai.foodRecoveryMode || isFoodRunwayUnsafe(state)`.
ColonyDirectorSystem imports the same whitelist, additionally pushing a
`lumber@92` need when `wood < 10` (so wood-floor doesn't strand the farm
build queue) and a zero-farm safety net (`farm@99` when
`currentFarms === 0 && timeSec < 180`).

---

## DevIndex — Development Index

The DevIndex is a 0–100 composite score that measures overall colony
health. It is computed every tick by `DevIndexSystem` and smoothed over a
60-tick ring buffer.

### Six Dimensions

Each dimension is independently scored 0–100 by
`EconomyTelemetry.scoreAllDims()`:

#### 1. Population

```
score = (agentCount / devIndexAgentTarget) × 80
```

`devIndexAgentTarget` = 30. Scores 80 points at 30 live workers, with
further gains possible up to 100 at ~37 workers. Counts all non-dead
workers and visitors.

#### 2. Economy

```
score = mean over {food, wood, stone} of min(100, (stockpile / target) × 80)
```

Targets: food 200, wood 150, stone 100. Each resource is scored
independently (80 points at target, 100 at 125% of target), then averaged
equally.

#### 3. Infrastructure

```
coverage = (roadTiles + warehouseTiles) / mapTileArea
score    = (coverage / 0.06) × 80
```

Full score requires approximately 6% of the 96×72 map to be road or
warehouse tiles (~414 tiles). This rewards building out a logistics network
rather than concentrating infrastructure.

#### 4. Production

```
producers = farm + lumber + quarry + herbGarden + kitchen + smithy + clinic tiles
score     = (producers / devIndexProducerTarget) × 80
```

`devIndexProducerTarget` = 24. Counts every producer tile regardless of
type, rewarding diversity and scale in the production chain.

#### 5. Defense

```
defensePoints = wallTiles + militiaCount × 2
score         = (defensePoints / devIndexDefenseTarget) × 80
```

`devIndexDefenseTarget` = 12. Each wall tile is worth 1 point; each militia
worker is worth 2 (force multiplier).

#### 6. Resilience

```
meanDistress = (hungerDistress + fatigueDistress + moraleDistress) / 3
score        = (1 − meanDistress) × 100
```

Each distress axis is `1 − mean(needValue)` across all live workers.

### Composite Formula

```
devIndex = (pop + eco + infra + prod + def + res) / 6
```

All six weights are equal at 1/6 by default (`BALANCE.devIndexWeights`), so
the composite is a simple arithmetic mean.

### Smoothing

The per-tick composite is appended to a ring buffer of length
`devIndexWindowTicks` (60 ticks). `devIndexSmoothed` is the arithmetic mean
of the ring, preventing per-tick noise from triggering raid escalation tier
changes.

### Target: 70 / 100

The design target is a `devIndexSmoothed` of 70 for a "healthy, developed"
colony surviving to day 365. HW7 R0 → R3 trajectory on the canonical
`seed=42 / temperate_plains` day-90 run: **46.66 → 53.53 → 47.66 → 49.41**
(see `08-benchmark-metrics.md` for the full bench history including the
intentional R1 → R2 dip when fail-state was restored).

Published state fields:

| Field | Description |
|---|---|
| `state.gameplay.devIndex` | Latest per-tick composite, float [0, 100] |
| `state.gameplay.devIndexSmoothed` | Ring-buffer mean, float [0, 100] |
| `state.gameplay.devIndexDims` | Object with all 6 dimension scores |
| `state.gameplay.devIndexHistory` | Ring buffer array (≤ 60 entries) |

---

## Raid Escalator

`RaidEscalatorSystem` runs immediately after `DevIndexSystem` in
`SYSTEM_ORDER` and converts `devIndexSmoothed` into a raid cadence +
intensity bundle that `WorldEventSystem` consumes when rolling bandit
raids.

### Tier Calculation

```
raidTier = clamp(floor(devIndexSmoothed / devIndexPerRaidTier), 0, raidTierMax)
```

`devIndexPerRaidTier` = 15, `raidTierMax` = 10.

| DevIndex Smoothed | Tier | Interval (ticks) | Intensity Multiplier |
|---|---|---|---|
| 0 | 0 | 3600 | 1.0× |
| 15 | 1 | 3300 | 1.3× |
| 30 | 2 | 3000 | 1.6× |
| 45 | 3 | 2700 | 1.9× |
| 60 | 4 | 2400 | 2.2× |
| 75 | 5 | 2100 | 2.5× |
| 100 | 6 | 1800 | 2.8× |

### Interval & Intensity Formulas

```
intervalTicks = max(raidIntervalMinTicks,
                    raidIntervalBaseTicks − raidTier × raidIntervalReductionPerTier)
             = max(600, 3600 − tier × 300)

intensityMultiplier = 1 + raidTier × raidIntensityPerTier
                    = 1 + tier × 0.3
```

### Published State

`state.gameplay.raidEscalation`:

```js
{
  tier: number,                // current escalation tier [0, 10]
  intervalTicks: number,       // ticks between raids
  intensityMultiplier: number, // raid damage/size scale factor
  devIndexSample: number,      // devIndexSmoothed value used this tick
}
```

---

## System Execution Order

The population and lifecycle systems execute in this order within
`SYSTEM_ORDER` (verified against `src/config/constants.js`):

```
SimulationClock
VisibilitySystem
ProgressionSystem          — survival score, recovery, milestones
DevIndexSystem             — composite DevIndex from EconomyTelemetry
RaidEscalatorSystem        — tier/interval/intensity from devIndexSmoothed
EventDirectorSystem
AgentDirectorSystem        — wraps ColonyDirectorSystem as `_fallback`
RoleAssignmentSystem       — role distribution across live workers
PopulationGrowthSystem     — recruit gate check and spawn (RecruitmentSystem)
EnvironmentDirectorSystem
WeatherSystem
WorldEventSystem
TileStateSystem
NPCBrainSystem
WarehouseQueueSystem
WorkerAISystem
ConstructionSystem
VisitorAISystem
AnimalAISystem
MortalitySystem            — hunger/hp death evaluation and entity removal
BoidsSystem
ResourceSystem
ProcessingSystem
```

This ordering ensures each tick's DevIndex is based on the previous tick's
economic state before raid escalation is recalculated, and that role
assignments are stable before any recruits or deaths alter the population
count.

---

## Dev-Only Stress Helper

`__devForceSpawnWorkers(state, count)` was relocated from
`PopulationGrowthSystem` to `src/dev/forceSpawn.js` in HW7 Round 1 wave-2
(C1-code-architect, debt-pop-2). The `RecruitmentSystem` module re-exports
the symbol so existing callers (`src/app/GameApp.js`,
`test/long-run-api-shim.test.js`) keep working. The helper bypasses all
food/cap/cooldown gates and is reachable only via
`window.__utopiaLongRun.devStressSpawn(...)` under `?dev=1`.
