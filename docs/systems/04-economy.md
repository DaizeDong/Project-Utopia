# Economy & Resource System

**Version**: v0.10.1 (HW7 Final-Polish-Loop R0 → R3 + Hotfix iter 1-4) | **Last updated**: 2026-05-01

Source of truth: `src/config/balance.js`, `src/config/constants.js`, `src/simulation/economy/*`, `src/simulation/meta/ProgressionSystem.js`, `src/world/events/WorldEventSystem.js`.

---

## 1. Resources & Flow

### 1.1 Raw resources (colony stockpile)

`state.resources` holds four raw resources, all replenished by worker harvesting:

- **food** — produced at `FARM`
- **wood** — produced at `LUMBER`
- **stone** — produced at `QUARRY`
- **herbs** — produced at `HERB_GARDEN`

`INITIAL_RESOURCES` (HW7 R0 A5-balance-critic update — extends opening runway from ~3:11 to ~6:30):

```js
INITIAL_RESOURCES = { food: 320, wood: 35, stone: 15, herbs: 8 }
```

### 1.2 Processed goods (colony stockpile, no carry)

Processing buildings convert raw resources directly into colony-wide stocks:

- **meals** — produced at `KITCHEN` (2 food → 0.95 meals per `kitchenCycleSec = 2.3 s`)
- **tools** — produced at `SMITHY` (3 stone + 2 wood → 1 tool per `smithyCycleSec = 8 s`)
- **medicine** — produced at `CLINIC` (1 herbs → 1 medicine per `clinicCycleSec = 4 s`)

Workers do **not** carry processed goods — they consume them directly from `state.resources`.

### 1.3 Carry structure

Each worker maintains a `carry` object with four raw-resource slots:

```js
worker.carry = { food: 0, wood: 0, stone: 0, herbs: 0 }
```

`carryTotal` = sum of all four slots. There is no hard per-slot cap; capacity is softly regulated by `workerDeliverThreshold = 2.5` and the `workerCarryPressureSec = 3.8 s` non-zero-carry timer (both checked by `STATE_TRANSITIONS[HARVESTING]` in the worker FSM).

### 1.4 Flow diagram

```
Production tiles (FARM/LUMBER/QUARRY/HERB_GARDEN)
   │  worker harvests → worker.carry[type]
   ▼
DELIVERING → DEPOSITING (worker FSM)
   │  handleDeliver() unloads at WAREHOUSE intake
   ▼
state.resources.{food,wood,stone,herbs}                 ← colony stockpile
   ├─→ KITCHEN  (2 food   → 0.95 meals  / 2.3 s)
   ├─→ SMITHY   (3 stone + 2 wood → 1 tool / 8 s)
   ├─→ CLINIC   (1 herbs  → 1 medicine / 4 s)
   ├─→ Worker eat (warehouse fast-eat path; meals 2.0× more efficient)
   └─→ MortalitySystem (medicine: 6 hp/s per active medicine)
```

In-transit spoilage on perishables (food / herbs) — see §8.4.

---

## 2. Building catalogue (production cost + role + output)

| Building     | Wood | Stone | Herbs | Worker role  | Output                       | Cycle / rate              |
|--------------|:----:|:-----:|:-----:|:------------:|------------------------------|---------------------------|
| FARM         | 5    | —     | —     | FARM         | `worker.carry.food`          | per-harvest, fertility-gated |
| LUMBER       | 5    | —     | —     | WOOD         | `worker.carry.wood`          | per-harvest, weather-modified |
| QUARRY       | 6    | —     | —     | STONE        | `worker.carry.stone`         | 0.45 / s, weather-modified |
| HERB_GARDEN  | 4    | —     | —     | HERBS        | `worker.carry.herbs`         | 0.28 / s, weather-modified |
| KITCHEN      | 8    | 3     | —     | COOK         | `state.resources.meals`      | 2 food → 0.95 meals / 2.3 s |
| SMITHY       | 6    | 5     | —     | SMITH        | `state.resources.tools`      | 3 s + 2 w → 1 tool / 8 s   |
| CLINIC       | 6    | —     | 4     | HERBALIST    | `state.resources.medicine`   | 1 h → 1 m / 4 s            |
| WAREHOUSE    | 10   | —     | —     | (HAUL hub)   | (storage / intake)           | spacing ≥ 5 tile (Manhattan) |
| ROAD         | 1    | —     | —     | —            | logistics + speed bonus      | +35 % move speed (compounding) |

Costs scale with `softTarget` overrun (see `BUILD_COST` in `balance.js`); ruins discount = 0.7×; elevation surcharge = `1 + elevation × 0.15`.

---

## 3. Soil System

### 3.1 Salinization mechanics

```js
soilSalinizationPerHarvest:    0.012   // increment per FARM harvest
soilSalinizationThreshold:     0.8     // triggers fallow entry (~67 harvests fresh → fallow)
soilFallowRecoveryTicks:       1200    // ~3.3 min @ 6 ticks/sec
soilSalinizationDecayPerTick:  0.00002 // negligible passive decay
```

When `salinized ≥ 0.8`: `fallowUntil = currentTick + 1200`; `fertility` hard-capped at 0 for the fallow duration. On recovery: `fertility = 0.9`, `salinized = 0`, `yieldPool = 120`.

### 3.2 Yield pool

```js
farmYieldPoolInitial:        120
farmYieldPoolMax:            180
farmYieldPoolRegenPerTick:   0.1
yieldPoolDepletedThreshold:  60   // planner signal
```

Per-node-type pool variants:

| Node type | Initial | Regen / tick | Notes |
|---|---|---|---|
| FOREST (LUMBER) | 80  | 0.05 | Regenerates |
| STONE  (QUARRY) | 120 | 0.0  | **Does not** regenerate (finite deposit) |
| HERB   (HERB_GARDEN) | 60 | 0.08 | Regenerates |

---

## 4. Processing chain

### 4.1 Food chain

```
FARM (per-harvest food, fertility/moisture-gated)
  → worker.carry.food → DEPOSITING → state.resources.food
       ├─→ Worker eat (warehouse fast-eat path; +0.11 hunger / food unit)
       └─→ KITCHEN (2 food + COOK staffed, 2.3 s cycle, output = 0.95 meals)
              → state.resources.meals
                 → Worker eat (mealHungerRecoveryMultiplier = 2.0× = +0.22 / meal)
```

### 4.2 Tool chain

```
QUARRY (0.45 stone/s) → state.resources.stone
                            └─→ SMITHY (3 stone + 2 wood + SMITH, 8 s cycle, output = 1 tool)
                                  → state.resources.tools
                                     → +0.12 harvest speed bonus per tool, capped at 5 tools (+0.60)
```

### 4.3 Medicine chain

```
HERB_GARDEN (0.28 herbs/s) → state.resources.herbs
                                 └─→ CLINIC (1 herb + HERBALIST, 4 s cycle, output = 1 medicine)
                                       → state.resources.medicine
                                          → MortalitySystem: 6 hp/s per active medicine
```

---

## 5. Warehouse & Logistics

### 5.1 Warehouse selection

```js
worksiteCoverageSoftRadius:  10    // green zone
worksiteCoverageHardRadius:  16    // amber zone (warning); >16 → isolation penalty
warehouseSpacingRadius:      5     // Manhattan separation between warehouses
```

### 5.2 Intake throttling (M2)

```js
warehouseIntakePerTick:        2      // ≤ 2 workers unload per warehouse per tick
warehouseQueueMaxWaitTicks:    120    // queue timeout
warehouseSoftCapacity:         4      // load penalty kicks in beyond this
```

### 5.3 Unload rate

```js
baseRate          = workerUnloadRatePerSecond = 4.2 res/s
queuePenalty      = 1 + max(0, load - 1) × warehouseQueuePenalty (0.32)
isolationPenalty  = isolationDepositPenalty   = 0.85 (warehouse not road-connected)
roadLogisticsBonus = 1.15 (warehouse road-connected)
effectiveRate     = baseRate / queuePenalty × isolation × roadBonus
```

### 5.4 Warehouse spoilage (HW7 R0 + R2)

Slow passive spoilage on the warehouse stockpile caps indefinite hoarding without choking
active construction loops:

```js
warehouseFoodSpoilageRatePerSec: 0.0003   // ~9.5 food/day @ 1000-stock (HW7 R0)
warehouseWoodSpoilageRatePerSec: 0.00015  // half as aggressive (HW7 R2 NEW)
```

A 35-60 wood active-construction stockpile loses ~0.005-0.009 wood/s — negligible. A
no-op 235+ wood stockpile slowly decays back toward equilibrium.

---

## 6. Build cost & placement rules

Base cost via `BUILD_COST` table; modifiers:

```js
softTarget overrun:  cost *= min(cap, 1 + perExtra × max(0, count - softTarget))
elevation:           cost *= 1 + elevation × 0.15
ruins discount:      cost *= 0.7
```

Placement constraints:
1. Tile must be passable and not WATER / HIDDEN.
2. **Node gating** (M1a): `lumber → FOREST node`, `quarry → STONE node`, `herb_garden → HERB node`. FARM is fertility-gated, not node-gated.
3. Production buildings need a warehouse within 10 tile (Manhattan).
4. Warehouses ≥ 5 tile (Manhattan) apart.

Demolish recovery (M1c): `wood 25 %`, `stone 35 %`, `food/herbs 0`.

---

## 7. Resource metrics & crisis detection

### 7.1 Flow telemetry

`EconomyTelemetry` snapshots per-resource production / consumption / spoilage on a 3-s sliding window — exposed as `state.metrics.foodProducedPerMin`, `foodConsumedPerMin`, `foodSpoiledPerMin`, etc.

### 7.2 Crisis thresholds

```js
foodEmergencyThreshold:        18    // food < 18 → warning
foodEmergencyCrisisThreshold:  0     // → autopilot pause
resourceCollapseCarryGrace:    1.5   // (HW7 R0; was 0.5) widens carry-in-transit grace
                                     //   so first-warehouse construction window
                                     //   doesn't trip loss-state mid-haul
```

### 7.3 Warehouse density risk (M2)

Score from producer-tile count proxy; at score ≥ 400 the warehouse rolls fire (0.008 / tick → 20 % loss + 30 cap) and vermin (0.005 / tick → 15 % loss + 40 cap) checks.

### 7.4 Survival score (HW7 R2 NEW)

```js
survivalScorePerProductiveBuildingSec: 0.08   // bonus per productive building per second
```

A "do nothing" run accrues only the time floor (`perSec = 1`); a built-up colony scores 2-3× faster. Productive buildings counted: farms + lumbers + quarries + herbGardens + kitchens + smithies + clinics. ~6 productive buildings → +0.48 / s ≈ 1.5× time floor; 30+ → +2.4 / s ≈ 3.4× time floor.

### 7.5 Recovery gating (HW7 R3 NEW)

`ProgressionSystem.RECOVERY_ESSENTIAL_TYPES = Set(["farm", "lumber", "warehouse", "road"])`
defines the build types allowed during the "recovery" budget window after a near-collapse.
`ColonyDirectorSystem` reads this whitelist (via `isRecoveryEssential`) so non-essential
builds (kitchen / smithy / clinic / herb_garden / wall / gate) are deferred until the
colony exits recovery.

---

## 8. Worker economy

### 8.1 Hunger drain & per-entity reconnect (HW7 R1 + R2)

The v0.10.1-l rewrite replaced the per-entity hunger FSM with a **fixed global drain** to
simplify accounting:

```js
workerFoodConsumptionPerSecond:  0.038   // (HW7 R0; was 0.05) global per-worker drain on state.resources.food
                                         // pairs with INITIAL_RESOURCES.food = 320 to stretch
                                         // pure-burn runway to ~702 s (~11:42)
```

**Bug + fix history (HW7 R1 → R2):** the global drain alone left `entity.hunger` static
forever — workers never starved, so AFK runs trivially won. R1 (commit f385318)
**reconnected** `entity.hunger` to the legacy MortalitySystem starvation chain by re-
introducing a per-second hunger-decay knob that fires when the colony's food stockpile
drops into a "low" band:

```js
workerHungerDecayPerSecond:           0.0055   // fallback per-second hunger decay (legacy chain)
workerHungerDecayWhenFoodLow:         0.020    // (HW7 R1 NEW; renamed from WhenFoodZero in R2)
                                               //   per-second entity.hunger decay when
                                               //   state.resources.food < threshold
workerHungerDecayLowFoodThreshold:    8        // (HW7 R2 NEW) the "low" food band threshold
                                               //   sits below recoveryCriticalResourceThreshold (12)
```

R2 (commit 91a8d5b) widened the trigger from strict `food == 0` to `food < 8` because
TRADE_CARAVAN's previous +0.5 food/s plus ProgressionSystem's emergency-relief charges
kept food asymptotically above 0 — AFK still won under R1. With the band trigger, passive
trickle income can no longer fully offset the 0.020/s decay; total time-to-first-death =
~50 s decay (hunger 1.0 → 0.045) + 34 s holdSec ≈ 84 s after food enters the low band.

**Eat target:**

```js
workerHungerSeekThreshold:                0.18   // FSM survival-preempt trigger
workerEatRecoveryTarget:                  0.70   // exit EATING when hunger ≥ 0.70
workerHungerEatRecoveryPerFoodUnit:       0.11   // raw food
mealHungerRecoveryMultiplier:             2.0    // meals = 0.22 hunger / meal
warehouseEatRatePerWorkerPerSecond:       0.60   // per-worker fast-eat flow (HW7 v0.10.1-h)
warehouseEatCapPerSecond:                 4.0    // global shared cap (~6.7 uncapped workers)
```

### 8.2 Emergency rations

When `worker.hunger < 0.18` AND no warehouse is reachable:

```js
emergencyRationCooldownSec: ~2.8 s
eatRate: ~1.1 / s drawn directly from state.resources.food
```

Prevents death from warehouse-path failures.

### 8.3 Carry pressure & in-transit spoilage

```js
foodSpoilageRatePerSec:        0.005   // off-road, after grace
herbSpoilageRatePerSec:        0.01    // off-road, after grace
spoilageGracePeriodTicks:      500     // first 500 off-road ticks: ×0.5 loss rate
workerCarryPressureSec:        3.8     // non-zero-carry timer triggers force-deliver transition
spoilageOnRoadMultiplier:      0       // ROAD/BRIDGE fully suppress in-transit spoilage
```

### 8.4 Trade caravan rebalance (HW7 R2)

`WorldEventSystem` TRADE_CARAVAN per-tick yield was halved during HW7 R2 (commit 91a8d5b)
to fix "AFK food self-regen 18 → 313" runs:

```js
// Pre-R2: state.resources.food += dt * 0.50 * intensity * mult
//         state.resources.wood += dt * 0.34 * intensity * mult
// R2:
state.resources.food += dt * 0.22 * event.intensity * yieldMultiplier;
state.resources.wood += dt * 0.18 * event.intensity * yieldMultiplier;
```

A 20 s caravan at intensity = 1 now injects ~4.4 food (was ~10) — still meaningful relief
for active colonies but cannot single-handedly sustain a no-op run.

### 8.5 Autopilot quarry early boost (HW7 R2)

```js
autopilotQuarryEarlyBoost: 12   // raises early-game (t < 300 s) quarry/herb priority
                                //   so ColonyDirector promotes processing above farm
                                //   in bootstrap when the wood-gate (≥ 6) lets
                                //   farm-spam (priority 80) win otherwise.
```

---

## 9. Population & wildlife (HW7 hotfix iter4 — caps removed)

### 9.1 Pop cap removed (Batch E, Issue #9)

The `Math.min(80, ...)` clamp on `infraCap` was deleted from both
`PopulationGrowthSystem.js` and `ColonyPerceiver.js`. The infrastructure-derived formula
(warehouses + farms + lumbers + quarries + kitchens + smithies + clinics + herb_gardens)
is preserved as a soft cap that grows with build-out. `state.controls.recruitTarget`
default raised 16 → 500 (matches the slider's `max="500"`); pre-fix, every fresh save
opened with the slider at 16 and most players never realised they had to drag it.

### 9.2 Wildlife spawn (HW7 hotfix iter1, Batch A — Issue #4)

```js
INITIAL_POPULATION = {
  workers: 12,
  visitors: 4,
  herbivores: 8,    // (HW7 hotfix-A; was 3)
  predators: 2,     // (HW7 hotfix-A; was 1)
}
wildlifeSpawnRadiusBonus: 6   // (HW7 hotfix-A; was 3)
                              //   widens initial-spawn box so the bumped INITIAL_POPULATION
                              //   finds enough candidate tiles within wildlife-zone radius
                              //   (was returning null silently → under-target spawn counts)
```

Per-zone caps in `longRunProfile.js` (herbivores max 6 / zone, predators max 2 / zone) still gate breed/recovery; initial spawn now populates multiple zones (or duplicates within zones for templates with a single zone) so the world feels alive from second 1 instead of looking empty.

---

## 10. System update order (relevant slice)

```
TileStateSystem          → soil fertility, salinization, fallow, fire spread
NPCBrainSystem           → LLM/fallback policy fan-out
WarehouseQueueSystem     → reset intake tokens
WorkerAISystem           → harvest / deliver / deposit / eat (FSM)
ConstructionSystem       → builder workSec accrual + completion
VisitorAISystem          → trader / saboteur (PriorityFSM via VisitorFSM)
AnimalAISystem           → herbivore / predator (legacy StatePlanner)
MortalitySystem          → hunger death + medicine healing
BoidsSystem              → flocking velocity (path-dampened separation)
ResourceSystem           → flow accounting, spoilage, crisis detection
ProcessingSystem         → kitchen / smithy / clinic cycles
```

Full `SYSTEM_ORDER` lives in `src/config/constants.js`. See `docs/systems/01-architecture.md` for the canonical 23-system pipeline.

---

## 11. Key tunables — quick reference

| Parameter                                  | Value    | Source                                  |
|--------------------------------------------|:--------:|-----------------------------------------|
| `INITIAL_RESOURCES.food`                   | 320      | HW7 R0 A5 — opening runway              |
| `workerFoodConsumptionPerSecond`           | 0.038    | HW7 R0 A5 — global drain                |
| `workerHungerDecayWhenFoodLow`             | 0.020    | HW7 R1 + R2 — entity.hunger reconnect   |
| `workerHungerDecayLowFoodThreshold`        | 8        | HW7 R2 — band trigger                   |
| `resourceCollapseCarryGrace`               | 1.5      | HW7 R0 A5 — wider grace                 |
| `warehouseFoodSpoilageRatePerSec`          | 0.0003   | HW7 R0                                  |
| `warehouseWoodSpoilageRatePerSec`          | 0.00015  | HW7 R2 NEW                              |
| `survivalScorePerProductiveBuildingSec`    | 0.08     | HW7 R2 NEW                              |
| `autopilotQuarryEarlyBoost`                | 12       | HW7 R2 NEW                              |
| TRADE_CARAVAN food rate                    | 0.22 / s | HW7 R2 (was 0.50)                       |
| TRADE_CARAVAN wood rate                    | 0.18 / s | HW7 R2 (was 0.34)                       |
| `INITIAL_POPULATION.herbivores`            | 8        | HW7 hotfix-A (was 3)                    |
| `INITIAL_POPULATION.predators`             | 2        | HW7 hotfix-A (was 1)                    |
| `wildlifeSpawnRadiusBonus`                 | 6        | HW7 hotfix-A (was 3)                    |
| `state.controls.recruitTarget` default     | 500      | HW7 hotfix iter4 batch E (was 16)       |
| `infraCap` ceiling                         | (none)   | HW7 hotfix iter4 batch E (`Math.min(80,…)` removed) |
| `kitchenCycleSec`                          | 2.3      | v0.8.5.1 hotfix                         |
| `kitchenMealOutput`                        | 0.95     | v0.8.5.1 hotfix                         |
| `toolHarvestSpeedBonus`                    | 0.12     | v0.8.5.1 hotfix                         |
| `toolMaxEffective`                         | 5        | v0.8.5                                  |
| `medicineHealPerSecond`                    | 6        | balance.js                              |

`RECOVERY_ESSENTIAL_TYPES = { farm, lumber, warehouse, road }` exported from `ProgressionSystem.js` (HW7 R3 NEW).

---

## File inventory

- `src/config/balance.js`
- `src/config/constants.js`
- `src/simulation/economy/ResourceSystem.js`
- `src/simulation/economy/ProcessingSystem.js`
- `src/simulation/economy/TileStateSystem.js`
- `src/simulation/economy/LogisticsSystem.js`
- `src/simulation/economy/WarehouseQueueSystem.js`
- `src/simulation/construction/BuildSystem.js`
- `src/simulation/construction/BuildAdvisor.js`
- `src/simulation/construction/ConstructionSystem.js`
- `src/simulation/meta/ProgressionSystem.js` (RECOVERY_ESSENTIAL_TYPES, survival score)
- `src/simulation/npc/WorkerAISystem.js` (carry / deliver / eat)
- `src/world/events/WorldEventSystem.js` (TRADE_CARAVAN yield)
- `src/entities/EntityFactory.js`
