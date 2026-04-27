# 05 — Population & Lifecycle

This document covers every system that governs how workers come into existence,
how they survive day-to-day, and how the game evaluates and escalates pressure as
the colony grows. Source files referenced throughout:

- `src/simulation/population/PopulationGrowthSystem.js`
- `src/simulation/population/MortalitySystem.js`
- `src/simulation/population/RoleAssignmentSystem.js`
- `src/simulation/meta/DevIndexSystem.js`
- `src/simulation/meta/RaidEscalatorSystem.js`
- `src/simulation/meta/ProgressionSystem.js`
- `src/simulation/telemetry/EconomyTelemetry.js`
- `src/config/balance.js` (all numeric constants)
- `src/entities/EntityFactory.js` (worker construction)

---

## Population Growth — Birth Mechanics

Population growth is handled by `PopulationGrowthSystem`, which runs on a fixed
**10-second check interval** (first check fires after 5 s to stagger the cold
start). On every check it evaluates two hard gates before spawning a new worker:

1. **Infrastructure gate** — at least one `WAREHOUSE` tile must exist. Spawning
   occurs at a randomly selected warehouse, so the colony needs a depot to
   anchor new arrivals.
2. **Population cap** — the current live worker count must be strictly below the
   computed dynamic cap (see Population Cap Mechanics below).
3. **Food gate** — `state.resources.food` must be at or above `MIN_FOOD_FOR_GROWTH`
   (currently **30 units**, raised from 25 in v0.8.1 to require a modest buffer
   before triggering a birth).

When all gates pass, a new worker entity is created at a seeded-random warehouse
tile via `createWorker()`, the food stockpile is decremented by
`FOOD_COST_PER_COLONIST` (**10 units** as of v0.8.1), and two counters are
updated on `state.metrics`:

- `birthsTotal` — monotonic integer, incremented once per spawn.
- `lastBirthGameSec` — current `state.metrics.timeSec` at spawn time (used by
  HUD and telemetry; not used as the birth cursor since v0.8.0 to avoid
  collisions when multiple births land within the same integer second).

The birth event is also emitted on the `GameEventBus` as `VISITOR_ARRIVED` with
`reason: "colony_growth"`.

### RNG Determinism

The growth system requires a deterministic RNG (`services.rng.next`) so that
benchmark replays are reproducible. If no services are threaded (e.g. legacy unit
tests) it falls back to `Math.random`.

---

## Population Cap Mechanics

The dynamic cap is computed inline inside `PopulationGrowthSystem.update()` every
check interval. The formula is:

```
cap = min(80,
          8
          + warehouses × 3
          + floor(farms × 0.5)
          + floor(lumbers × 0.5)
          + quarries × 2
          + kitchens × 2
          + smithies × 2
          + clinics × 2
          + herbGardens × 1)
```

Key design choices embedded in this formula:

- **Hard ceiling of 80** prevents simulation performance from degrading at
  extreme colony sizes.
- **Warehouses are the primary multiplier (×3)**. Without logistics
  infrastructure the colony cannot support many workers.
- **Farms and lumbers use 0.5 coefficient** (reduced in v0.8.1 from 0.8 and 1.0
  respectively). The tighter coefficients prevent runaway food-production loops
  from inflating population faster than the food supply can sustain.
- **Processing buildings (kitchens, smithies, clinics) each contribute 2 slots**,
  rewarding investment in the refined-goods chain.
- **Quarries and herb gardens contribute directly** (×2 and ×1) as secondary
  infrastructure.

If `workers.length >= cap` the check exits immediately without spawning, even
if food is abundant. The cap is re-evaluated every check interval, so tearing
down buildings can cause it to drop below the live population count — the
population will not be forcibly culled but no new births will occur until natural
deaths bring the count below the new cap.

---

## Food Consumption Model

### Raw Food: Worker Hunger Decay

Each worker has a `hunger` value in [0, 1] (1 = full, 0 = starving). Hunger
decays continuously at `BALANCE.workerHungerDecayPerSecond` (**0.0055 per
second** baseline). The actual decay is per-worker metabolised:

- Each worker gets a `metabolism.hungerDecayMultiplier` sampled from
  `[0.88, 1.12]` at creation, so individuals have slightly different appetites.
- When carrying any resources (`carry.total > 0`) the `carryFatigueLoadedMultiplier`
  (**1.5×**) is applied to rest decay, indirectly taxing the worker harder.

Workers seek food when `hunger` drops below `workerHungerSeekThreshold` (0.18
global; individual `metabolism.hungerSeekThreshold` drawn from `[0.12, 0.20]`).
They eat from warehouses or carried food, recovering at
`workerHungerEatRecoveryPerFoodUnit` (**0.11 per food unit**) until reaching
`workerEatRecoveryTarget` (0.70 global; individual `metabolism.eatRecoveryTarget`
drawn from `[0.62, 0.74]`).

### Colony-Level Food Cost per Birth

When a new worker is born the colony-wide stockpile is debited
`FOOD_COST_PER_COLONIST` = **10 units**. This is a one-time spawn tax; ongoing
maintenance comes from the individual hunger decay rate.

### Emergency Threshold

`BALANCE.foodEmergencyThreshold` = **18 units** is the global low-food trigger.
Below this level:
- `RoleAssignmentSystem` forces `effectiveRatio` to at least 0.82 (heavily
  biased toward farming), and specialist slots are capped at `emergencyFloor = 1`.
- The AI ColonyPlanner and ProgressionSystem treat this as a collapse precursor.

### Supply vs Demand Balance

The food rate visible in `state.metrics.foodRatePerMin` is a derived metric
updated by `ResourceSystem` and `EconomyTelemetry`. RoleAssignmentSystem uses
this rate (and raw food stock vs `fallbackIdleChainThreshold` = 15 units) to
decide whether to boost kitchen (COOK) slot allocation. The dynamic
farm-ratio shift in `RoleAssignmentSystem` also adjusts the FARM/WOOD split
based on `foodShare / (food + wood)` to continuously rebalance toward whichever
resource is in deficit.

---

## Worker Lifecycle — Spawning to Death

### Worker Creation

`createWorker(x, z, rngFn)` in `EntityFactory.js` constructs a fully initialised
worker entity. Key fields set at spawn:

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

Workers spawn at a warehouse tile's world position, applying a small seeded-
random velocity offset so newly arrived workers do not stack exactly on the
depot.

### Initial Population

`INITIAL_POPULATION` in `balance.js` sets the starting state:

- workers: 12
- visitors: 4 (alternating trader/saboteur)
- herbivores: 3
- predators: 1

Starting resources: food 100, wood 80, stone 15, herbs 0.

### Worker Needs Over Time

Three need axes decay continuously in the background:

- **Hunger** — decays at `workerHungerDecayPerSecond` (0.0055/s). Workers
  self-interrupt to eat when hunger drops below their individual threshold.
- **Rest** — decays at `workerRestDecayPerSecond` (0.004/s), faster during
  night (`workerRestNightDecayMultiplier` = 2.4×) and while carrying
  (fatigue multiplier 1.5×). Workers seek rest when below 0.2; recover to
  0.5 threshold.
- **Morale** — decays at `workerMoraleDecayPerSecond` (0.001/s), recovers at
  0.02/s. Witnessing the death of a colleague or friend pushes a narrative
  entry into the worker's `memory.recentEvents` ring (6 entries max).

### Role Assignment

`RoleAssignmentSystem` runs every `BALANCE.managerIntervalSec` (1.2 seconds) and
reassigns all live workers to roles based on:

1. A minimum FARM reserve (`farmMin = min(2, n)`) and WOOD reserve (1 if lumber
   tiles exist and budget permits).
2. Specialist slots computed by `computePopulationAwareQuotas(n)`, which uses
   discrete band tables for populations ≤ 7 and a per-worker scaling formula
   for populations ≥ 8.
3. Player-exposed `state.controls.roleQuotas` slider caps (default 99 =
   unlimited for all specialist types).
4. Building gates: COOK requires kitchen, SMITH requires smithy, HERBALIST
   requires clinic, STONE requires quarry, HERBS requires herb garden, HAUL
   requires warehouses and `n >= haulMinPopulation` (8).
5. Emergency override: when food < 18 the system forces `effectiveRatio >=
   0.82` and caps specialist slots to `emergencyFloor = 1`.

Role counts are published to `state.metrics.roleCounts` every tick so the
ColonyPlanner's idle-chain feedback loop can detect `COOK = 0` with a kitchen
present.

---

## Death Conditions and Starvation

`MortalitySystem` runs every frame (no internal timer). It iterates all agents
and animals and evaluates two death paths for each live entity:

### HP-Based Death

If `entity.hp <= 0` the entity is marked dead with `deathReason = "event"` (or
a custom reason set by the attacking system). Predator attacks deal
`BALANCE.predatorAttackDamage` (26 HP) per hit and are the primary source of
combat deaths.

### Starvation

Starvation is gated by both a hunger threshold and a hold timer, with different
values per entity type:

| Entity Type | Death Hunger Threshold | Hold Seconds |
|---|---|---|
| Worker | 0.045 | 34 |
| Visitor | 0.040 | 40 |
| Herbivore | 0.035 | 20 |
| Predator (default) | 0.030 | 28 |

The starvation clock (`entity.starvationSec`) only advances toward death when
**no reachable nutrition source exists**. Workers and visitors are checked for
reachability using a cached A* path (refreshed at most every 2.5 s) against:

1. Their own carry (food > 0 counts immediately, no pathfinding needed).
2. Nearest reachable warehouse with food > 0 in the stockpile.
3. Nearest reachable FARM tile within path length ≤ 16 steps.

When a reachable source exists the starvation clock actually decreases at
1.2× the normal rate (recovery buffer). Death only fires when
`starvationSec >= holdSec AND reachability = false`.

This design means workers surrounded by farms or warehouses almost never die
of starvation even when hungry — the reachability check is the real safeguard
against false positives during short supply dips.

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

There is **no respawn mechanic**. Once a worker dies it is permanently removed.
Population recovery relies entirely on `PopulationGrowthSystem` spawning new
workers when the food/cap gates allow.

### Medicine Healing

`MortalitySystem` also applies medicine each frame. The most-injured living worker
(by current HP) is healed at `BALANCE.medicineHealPerSecond` (8 HP/s) as long as
`state.resources.medicine > 0`. Medicine is consumed at 0.1 units per second of
healing.

---

## Survival Mode

v0.8.0 introduced Survival Mode as the primary game loop, replacing the legacy
3-objective win path.

### Win Condition

There is **no win condition** in Survival Mode. The game runs indefinitely; the
goal is to maximise `state.metrics.survivalScore` while keeping at least one
worker alive.

### Loss Condition

The colony is wiped — `state.agents` contains zero living workers — after the
**loss grace period** (`BALANCE.lossGracePeriodSec` = 90 seconds). The grace
period means a momentary all-dead state (e.g. during a raid) does not immediately
end the run; the colony has 90 s to receive a recovery event or have a visitor
survive long enough to recount as "alive".

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

`ProgressionSystem` includes an emergency recovery system. When `collapseRisk`
exceeds `recoveryTriggerRiskThreshold` (58%) and resources are critically low,
a relief package fires automatically:

- +food (default 12–24 depending on doctrine), +wood (10–20)
- Threat reduced by 8–16 points
- Prosperity boosted by 6–10 points

Up to `recoveryChargeCap` (3) charges are available per run, with a
`recoveryCooldownSec` (30 s) between triggers. A HUD message and an
objectiveLog narrative line are emitted on each trigger.

---

## DevIndex — Development Index

The DevIndex is a 0–100 composite score that measures overall colony health. It
is computed every tick by `DevIndexSystem` and smoothed over a 60-tick ring
buffer.

### Six Dimensions

Each dimension is independently scored 0–100 by `EconomyTelemetry.scoreAllDims()`:

#### 1. Population

```
score = (agentCount / devIndexAgentTarget) × 80
```

`devIndexAgentTarget` = 30. Scores 80 points at 30 live workers, with further
gains possible up to 100 at ~37 workers. Counts all non-dead workers and
visitors.

#### 2. Economy

```
score = mean over {food, wood, stone} of min(100, (stockpile / target) × 80)
```

Targets: food 200, wood 150, stone 100. Each resource is scored independently
(80 points at target, 100 at 125% of target), then averaged equally. Scores 80
on the economy dimension when all three resources are at their targets
simultaneously.

#### 3. Infrastructure

```
coverage = (roadTiles + warehouseTiles) / mapTileArea
score    = (coverage / 0.06) × 80
```

Full score requires approximately 6% of the 96×72 map to be road or warehouse
tiles (~414 tiles). This rewards building out a logistics network rather than
concentrating infrastructure.

#### 4. Production

```
producers = farm + lumber + quarry + herbGarden + kitchen + smithy + clinic tiles
score     = (producers / devIndexProducerTarget) × 80
```

`devIndexProducerTarget` = 24. Counts every producer tile regardless of type,
rewarding diversity and scale in the production chain.

#### 5. Defense

```
defensePoints = wallTiles + militiaCount × 2
score         = (defensePoints / devIndexDefenseTarget) × 80
```

`devIndexDefenseTarget` = 12. Each wall tile is worth 1 point; each militia
worker is worth 2 (force multiplier). Scores 80 at 12 defense points.

#### 6. Resilience

```
meanDistress = (hungerDistress + fatigueDistress + moraleDistress) / 3
score        = (1 − meanDistress) × 100
```

Each distress axis is `1 − mean(needValue)` across all live workers. A colony
with fully rested, fed, happy workers scores 100. A colony where all workers
are at 0 need scores 0.

### Composite Formula

```
devIndex = weighted mean of [population, economy, infrastructure,
                              production, defense, resilience]
         = (pop×(1/6) + eco×(1/6) + infra×(1/6) + prod×(1/6)
            + def×(1/6) + res×(1/6)) / sum_of_weights
```

All six weights are equal at 1/6 by default (`BALANCE.devIndexWeights`), so
the composite is a simple arithmetic mean. Non-default weight distributions can
be applied via the balance file for targeted balance sweeps.

### Smoothing

The per-tick composite is appended to a ring buffer of length
`devIndexWindowTicks` (60 ticks). `devIndexSmoothed` is the arithmetic mean of
the ring, preventing per-tick noise from triggering raid escalation tier changes.

### Target: 70 / 100

The design target is a `devIndexSmoothed` of 70 for a "healthy, developed" colony
surviving to day 365. As of v0.8.1 the benchmark achieves ~44 (up from 39 in
v0.8.0). The gap between 44 and 70 is primarily attributed to the structural
carry/deposit policy (workers eat from carry directly, bypassing warehouse
replenishment) — tracked for Phase 9.

Published state fields:

| Field | Description |
|---|---|
| `state.gameplay.devIndex` | Latest per-tick composite, float [0, 100] |
| `state.gameplay.devIndexSmoothed` | Ring-buffer mean, float [0, 100] |
| `state.gameplay.devIndexDims` | Object with all 6 dimension scores |
| `state.gameplay.devIndexHistory` | Ring buffer array (≤ 60 entries) |

---

## Raid Escalator

`RaidEscalatorSystem` runs immediately after `DevIndexSystem` in `SYSTEM_ORDER`
and converts `devIndexSmoothed` into a raid cadence + intensity bundle that
`WorldEventSystem` consumes when rolling bandit raids.

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

### Interval Formula

```
intervalTicks = max(raidIntervalMinTicks,
                    raidIntervalBaseTicks − raidTier × raidIntervalReductionPerTier)
             = max(600, 3600 − tier × 300)
```

### Intensity Formula

```
intensityMultiplier = 1 + raidTier × raidIntensityPerTier
                    = 1 + tier × 0.3
```

The intensity multiplier is passed to `WorldEventSystem` which uses it to scale
raider counts and damage output. The smoothed DevIndex (not the raw per-tick
value) is used to prevent short-term economic spikes from immediately escalating
raids.

### Published State

`state.gameplay.raidEscalation` is the live bundle:

```js
{
  tier: number,               // current escalation tier [0, 10]
  intervalTicks: number,      // ticks between raids
  intensityMultiplier: number, // raid damage/size scale factor
  devIndexSample: number,     // devIndexSmoothed value used this tick
}
```

---

## System Execution Order

The population and lifecycle systems execute in this order within `SYSTEM_ORDER`:

```
ProgressionSystem          — survival score, recovery, milestones
DevIndexSystem             — composite DevIndex computed from EconomyTelemetry
RaidEscalatorSystem        — tier/interval/intensity from devIndexSmoothed
RoleAssignmentSystem       — role distribution across live workers
PopulationGrowthSystem     — birth gate check and spawn
...
MortalitySystem            — hunger/hp death evaluation and entity removal
```

This ordering ensures each tick's DevIndex is based on the previous tick's
economic state before raid escalation is recalculated, and that role assignments
are stable before any births or deaths alter the population count.
