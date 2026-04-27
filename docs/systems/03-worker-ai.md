# Worker AI System

This document covers the full worker intelligence pipeline: how a worker decides what to do
(`chooseWorkerIntent`), how that intent is translated into a finite-state machine transition
(`StatePlanner` / `StateGraph`), and how the `WorkerAISystem` drives physical actions each
tick. Secondary topics include job reservation, occupancy-aware target scoring, the carry and
fatigue systems, and how the colony-level LLM brain feeds into individual worker behaviour.

---

## Pipeline Overview

Worker decisions are resolved in three layers every simulation tick:

```
  State (world snapshot)
        │
        ▼
  1. INTENT  ── chooseWorkerIntent() ──────────────────────────────────┐
        │       Stateless priority rule-set.                            │
        │       Produces a string key: "farm", "deliver", "eat", …     │
        ▼                                                               │
  2. STATE   ── planEntityDesiredState() / StatePlanner ───────────────┤
        │       Merges local intent with policy weights from NPC Brain  │
        │       and group-level AI state targets.  Runs feasibility     │
        │       checks and returns a desired FSM state node.            │
        │                                                               │
        │       transitionEntityState() / StateGraph                    │
        │       Advances the FSM one step along the shortest valid      │
        │       path toward the desired state, enforcing a 0.8 s hold.  │
        │       Returns the active FSM state node (e.g. "harvest").     │
        ▼                                                               │
  3. ACTION  ── WorkerAISystem.update() ──────────────────────────────┘
              Reads the FSM state and calls the matching handler:
              handleEat / handleDeliver / handleHarvest /
              handleProcess / handleRest / handleWander.
              Updates carry, hunger, fatigue, movement velocity.
```

Source files:
- `src/simulation/npc/WorkerAISystem.js` — action handlers, intent function, system class
- `src/simulation/npc/state/StatePlanner.js` — planning, feasibility, policy/AI merging
- `src/simulation/npc/state/StateGraph.js` — FSM graph definition and transition engine
- `src/simulation/npc/state/StateFeasibility.js` — per-state precondition checks
- `src/simulation/npc/JobReservation.js` — per-tile claim registry

---

## Worker Roles

Roles are defined in `src/config/constants.js` under `ROLE` (frozen object). Each role maps
directly to a target tile type and a resource the worker produces:

| Role constant   | String value  | Work tile       | Resource produced | Notes                                          |
|-----------------|---------------|-----------------|-------------------|------------------------------------------------|
| `ROLE.FARM`     | `"FARM"`      | `TILE.FARM`     | `carry.food`      | Yield modified by ecology pressure, fertility  |
| `ROLE.WOOD`     | `"WOOD"`      | `TILE.LUMBER`   | `carry.wood`      | Yield modified by weather, tile fertility      |
| `ROLE.STONE`    | `"STONE"`     | `TILE.QUARRY`   | `carry.stone`     | Yield modified by weather, tools multiplier    |
| `ROLE.HERBS`    | `"HERBS"`     | `TILE.HERB_GARDEN` | `carry.herbs`  | Yield modified by weather, tile fertility      |
| `ROLE.COOK`     | `"COOK"`      | `TILE.KITCHEN`  | `state.resources.meals` | Processing role; no carry involved        |
| `ROLE.SMITH`    | `"SMITH"`     | `TILE.SMITHY`   | `state.resources.tools` | Processing role; no carry involved        |
| `ROLE.HERBALIST`| `"HERBALIST"` | `TILE.CLINIC`   | `state.resources.medicine` | Processing role; no carry involved     |
| `ROLE.HAUL`     | `"HAUL"`      | Any worksite    | Any raw resource  | Opportunistic; adapts type to current tile     |

`ROLE.HAUL` is special: it targets any of `FARM / LUMBER / QUARRY / HERB_GARDEN` and derives
the effective resource type from whichever tile type the worker is standing on.

Processing roles (`COOK`, `SMITH`, `HERBALIST`) do not accumulate carry. The actual
conversion (raw → refined) is performed by `ProcessingSystem`; the worker's job is to be
present at the correct building so the system counts it as staffed.

---

## Intent Selection — `chooseWorkerIntent`

`chooseWorkerIntent(worker, state)` runs each tick (subject to a 0.5 s re-plan cooldown) and
returns a string intent key. The evaluation is a strict priority list — the first matching
condition wins:

```
Priority 1: hunger < hungerSeekThreshold (0.18) AND food available
            → "eat"

Priority 2: has carry AND warehouse exists AND any of:
              carryTotal >= deliverThreshold (1.6)
              OR already delivering
              OR no valid worksite for this role
              OR carryAgeSec >= carryPressureSec (3.8 s)
              OR nearestWarehouseDistance >= farDepotDistance (12)
            → "deliver"

Priority 3: role-specific work available
            FARM   → "farm"
            WOOD   → "lumber"
            STONE  → "quarry"
            HERBS  → "gather_herbs"
            COOK   → "cook"
            SMITH  → "smith"
            HERBALIST → "heal"
            HAUL   → "haul"

Priority 4: fog frontier tiles exist
            → "explore_fog"

Priority 5: (fallback)
            → "wander"
```

Relevant constants (from `BALANCE`):

| Constant                         | Default | Purpose                                      |
|----------------------------------|---------|----------------------------------------------|
| `workerHungerSeekThreshold`      | 0.18    | Hunger level that triggers eat intent        |
| `workerHungerRecoverThreshold`   | 0.42    | Hysteresis — stay in eat/seek_food until here|
| `workerEatRecoveryTarget`        | 0.70    | Target hunger after a full eating session    |
| `workerDeliverThreshold`         | 1.6     | Carry units that trigger deliver             |
| `workerDeliverLowThreshold`      | 0.85    | Lower threshold while already delivering / HAUL role |
| `workerCarryPressureSec`         | 3.8     | Seconds of carry age that force delivery     |
| `workerFarDepotDistance`         | 12      | Warehouse Manhattan distance that forces delivery |

---

## State Machine — `StateGraph`

The FSM graph for workers is defined in `StateGraph.js` as a frozen adjacency list. States
and allowed transitions:

```
  ┌──────────────────────────────────────────────────────────────┐
  │                     WORKER STATE GRAPH                       │
  │                                                              │
  │   idle ──────────────────────────────────────► seek_food     │
  │    │ └──────────────────────────► seek_task      │           │
  │    │  └────────────────────────► seek_rest       │           │
  │    │   └───────────────────────► wander          │           │
  │    │                                             ▼           │
  │  seek_food ──────────────────────────────────► eat           │
  │    │        └────────────────────────────────► seek_task     │
  │    │                                                         │
  │  eat ─────────────────────────────────────────► seek_task    │
  │   │   └──────────────────────────────────────► wander        │
  │   │    └─────────────────────────────────────► idle          │
  │                                                              │
  │  seek_task ─────────────────────────────────► harvest        │
  │     │       └─────────────────────────────── deliver         │
  │     │        └────────────────────────────── wander          │
  │     │         └───────────────────────────── process         │
  │                                                              │
  │  harvest ─────────────────────────────────── deliver         │
  │    │       └──────────────────────────────── seek_food       │
  │    │        └─────────────────────────────── seek_task       │
  │                                                              │
  │  deliver ─────────────────────────────────── seek_task       │
  │    │       └──────────────────────────────── seek_food       │
  │    │        └─────────────────────────────── idle            │
  │                                                              │
  │  process ─────────────────────────────────── seek_task       │
  │    │       └──────────────────────────────── seek_food       │
  │    │        └─────────────────────────────── idle            │
  │                                                              │
  │  wander ──────────────────────────────────── seek_task       │
  │    │      └────────────────────────────────── seek_food      │
  │    │       └───────────────────────────────── seek_rest      │
  │    │        └──────────────────────────────── idle           │
  │                                                              │
  │  seek_rest ─────────────────────────────────► rest           │
  │     │        └────────────────────────────── seek_food       │
  │     │         └───────────────────────────── idle            │
  │                                                              │
  │  rest ──────────────────────────────────────► seek_task      │
  │   │    └───────────────────────────────────── seek_food      │
  │   │     └──────────────────────────────────── idle           │
  │   │      └─────────────────────────────────── wander         │
  └──────────────────────────────────────────────────────────────┘
```

The default initial state is `"idle"`.

### Transition Engine

`transitionEntityState(entity, groupId, desiredState, nowSec, reason, options)` is the single
entry point to advance the FSM. Its behaviour:

1. **Hold window**: if the FSM changed less than `DEFAULT_STATE_HOLD_SEC` (0.8 s) ago and
   `options.force` is not set, the current state is kept and returned unchanged. This prevents
   rapid oscillation.

2. **Shortest-path traversal**: the graph is searched with BFS. If the desired state is not
   a direct neighbour of the current state, the FSM moves only one hop toward it per tick.
   For example, `idle → harvest` routes through `idle → seek_task → harvest` over two ticks.

3. **History**: the last 8 transitions are recorded in `entity.blackboard.fsm.history` with
   timestamps and reasons for debugging.

4. **Force flag**: when `{ force: true }` is passed (used by the deliver-stuck guard), the
   hold window is bypassed and the transition fires immediately.

### Display Labels

`mapStateToDisplayLabel` converts FSM state keys to human-readable strings shown in the HUD:

| FSM state   | Display label |
|-------------|---------------|
| `idle`      | Idle          |
| `seek_food` | Seek Food     |
| `eat`       | Eat           |
| `seek_task` | Seek Task     |
| `harvest`   | Harvest       |
| `deliver`   | Deliver       |
| `process`   | Process       |
| `wander`    | Wander        |
| `seek_rest` | Seek Rest     |
| `rest`      | Rest          |

---

## StatePlanner — Three-Source Resolution

`planEntityDesiredState(entity, state)` in `StatePlanner.js` fuses three intent sources into
a single desired FSM state. Sources are evaluated in priority order:

```
Local rules  ──► policy intent weights  ──► AI group state target
     │                   │                          │
     ▼                   ▼                          ▼
  deriveWorkerDesiredState()   applyPolicyIntentPreference()   applyGroupTargetOverride()
     │                                                              │
     └────────────────────────────────────────────────────────────►│
                                                                    ▼
                             normalizeDesiredStateWithFeasibility()
                             (feasibility guard — rejects infeasible states)
                                          │
                                          ▼
                                  resolved { desiredState, source, rejects }
```

### Local Rules (`deriveWorkerDesiredState`)

Priority-ordered rule set. Key rules in order:

1. Hunger hysteresis — stay eating until `workerHungerRecoverThreshold` (0.42).
2. Hunger threshold — enter seek_food when below `workerHungerSeekThreshold` (0.18).
3. Rest hysteresis — stay resting until `workerRestRecoverThreshold` (0.6).
4. Rest threshold — enter seek_rest when below `workerRestSeekThreshold` (0.2).
5. Night rest — prefer rest if `isNight && rest < 0.65`.
6. Storm shelter — rest if weather is storm and rest < 0.92.
7. Winter / drought / rain rest thresholds.
8. Deliver — if warehouse exists, carry > 0, and carry meets threshold or no worksite.
9. Role-specific work rules (`rule:farm`, `rule:lumber`, etc.).
10. No-worksite fallback — `wander`.

### Policy Intent Preference

The NPC Brain publishes `intentWeights` maps per group (e.g. `{ farm: 0.8, deliver: 0.3 }`).
`applyPolicyIntentPreference` converts the top-weighted intent to a state node via
`POLICY_INTENT_TO_STATE` and overrides the local desired state if the signal is strong enough
(`topWeight >= 0.95 AND dominance >= 0.25`). Protected states (`deliver`, `seek_food`, `eat`)
require a very strong signal (`topWeight >= 1.35`) to be overridden.

### AI Group Target Override

`applyGroupTargetOverride` reads `state.ai.groupStateTargets` — a timed directive published
by `NPCBrainSystem` — and overrides the policy-merged desired state when priority >= 0.35
(and >= 0.75 for protected states). The target expires after `ttlSec` seconds.

### Feasibility Guard

`isStateFeasible` enforces hard preconditions before any desired state is accepted:

| State            | Precondition                                        |
|------------------|-----------------------------------------------------|
| `deliver`        | carry > 0 AND at least one warehouse exists         |
| `seek_task` / `harvest` | worker's role has a matching building type  |
| `seek_food` / `eat`     | food in colony resources OR in carry         |

Infeasible states are downgraded to the fallback (`seek_task` for workers) and the rejection
is recorded in `entity.debug.feasibilityReject`.

### Commitment Cycle

Once a worker enters a task-lock state (`harvest`, `deliver`, `eat`, `process`, `seek_task`),
a `commitmentCycle` latch is set. While committed, the FSM ignores plan outputs that would
exit to non-work states (`idle`, `wander`). Commitment is cleared on:
- Survival interrupt: `hunger < 0.12`.
- Worker leaves the task-lock state set.
- deliver-stuck guard fires (empty carry or warehouse lost mid-deliver).

---

## Occupancy-Aware Target Scoring

`chooseWorkerTarget(worker, state, targetTileTypes)` selects the best tile from all matching
tiles on the grid. Each candidate receives a composite score:

### Score Formula

```
score = -sqrt(distance) * 0.18           // distance penalty (diminishing)
      + roadNeighbors * 0.1 * P(road)    // road adjacency bonus
      + wallCoverage * 0.07 * P(safety)  // wall protection bonus
      + frontierAffinity * 0.42 * P(frontier)  // near broken route gaps
      + depotAffinity * 0.38 * P(depot)         // near unready depots
      + tileTypeBonus                    // per-type flat bonus (0.54–0.58)
      - occupancyPenalty                 // workers already targeting this tile
      - sameRolePenalty                  // same-role clustering
      - jobReservationPenalty            // reserved by another worker (-2.0)
```

Distance penalty curve (sqrt): dist=1 gives −0.18, dist=4 gives −0.36, dist=9 gives −0.54,
dist=16 gives −0.72. This is intentionally shallow at long range so far tiles can win when
nearby tiles are overcrowded.

### Per-Tile-Type Base Bonuses

| Tile type     | Bonus | Policy priority key  |
|---------------|-------|----------------------|
| `WAREHOUSE`   | +0.58 | `"warehouse"`        |
| `KITCHEN`     | +0.58 | `"kitchen"`          |
| `SMITHY`      | +0.58 | `"smithy"`           |
| `CLINIC`      | +0.58 | `"clinic"`           |
| `FARM`        | +0.54 | `"farm"`             |
| `LUMBER`      | +0.54 | `"lumber"`           |
| `QUARRY`      | +0.54 | `"quarry"`           |
| `HERB_GARDEN` | +0.54 | `"herb_garden"`      |

Policy `targetPriorities` values (0–3, default 1) multiply each bonus via
`resolveTargetPriority`. The NPC Brain can adjust these per group.

### Occupancy Penalty

For non-warehouse tiles:
- Per occupant already targeting this tile: `−0.45 * n / (1 + 0.3 * (n-1))` (diminishing)
- Per same-role occupant: additional `−0.25` per worker

This encourages spreading across multiple tiles of the same type rather than clustering.

### Phase Jitter

To desynchronize re-evaluation waves, each worker's next retarget time receives a phase
offset derived from `(workerId.charCodeAt(0) % 7) * 0.12` seconds, preventing all workers
from simultaneously flooding the same newly-vacated tile.

---

## Job Reservation System

`JobReservation` (`src/simulation/npc/JobReservation.js`) is a per-game-state singleton
instantiated on `state._jobReservation`. It prevents workers from targeting the same tile by
maintaining a map of `tileKey → { workerId, intentKey, timestamp }`.

### API

| Method                              | Purpose                                                    |
|-------------------------------------|------------------------------------------------------------|
| `reserve(workerId, ix, iz, intent, nowSec)` | Claim a tile; auto-releases prior reservation of same worker |
| `release(workerId, ix, iz)`         | Release one tile reservation                               |
| `releaseAll(workerId)`              | Release all reservations for a worker (on retarget / death)|
| `isReserved(ix, iz, excludeId)`     | True if tile is claimed by someone other than excludeId    |
| `getReservationCount(ix, iz)`       | Returns 0 or 1 (at most one claim per tile)                |
| `getWorkerReservation(workerId)`    | Current tile reserved by a worker, or null                 |
| `cleanupStale(nowSec, maxAgeSec=30)`| Evict reservations older than `maxAgeSec`                  |

### Interaction with Scoring

During target selection, `isReserved(candidate, worker.id)` returns true when the candidate
is held by a different worker. This applies a hard penalty of `−2.0` to the candidate score,
effectively preventing double-booking without a strict exclusion that would deadlock all
workers when tiles are scarce.

Warehouses are exempt from both occupancy and reservation penalties because multiple workers
must be able to unload simultaneously.

### Lifecycle

`WorkerAISystem.update` calls `reservation.cleanupStale(timeSec)` at the top of every tick.
When a worker retargets (in `maybeRetarget`), it calls `reservation.releaseAll(worker.id)`
before picking a new tile, then immediately calls `reservation.reserve(...)` with the new
target. Dead workers trigger `reservation.releaseAll(worker.id)` before being skipped.

---

## Carry System

Each worker maintains a `carry` object with four resource slots:

```js
worker.carry = { food: 0, wood: 0, stone: 0, herbs: 0 }
```

`carryTotal` is the sum of all four slots. There is no hard per-slot capacity enforced in
code — capacity is softly regulated by the deliver threshold and carry-pressure timer.

### Carry Accumulation

`resolveWorkCooldown` drives incremental accumulation during harvest. Each work cycle:
1. On the first call with `cooldown <= 0`, a new cooldown is randomised:
   `baseDuration (2.5 s) * skillMultiplier * nightPenalty * rng(0.8–1.3)`.
2. On subsequent calls, `cooldown -= dt` and `progress` is updated (0–1).
3. When `cooldown` crosses zero, `carry[resourceType] += amount` and progress resets.

### Carry Age and Pressure

`worker.blackboard.carryAgeSec` counts seconds of continuous non-zero carry. When it exceeds
`workerCarryPressureSec` (3.8 s), `chooseWorkerIntent` returns `"deliver"` regardless of
carry quantity. This prevents workers from holding resources indefinitely.

### In-Transit Spoilage

Perishables (`food`, `herbs`) decay while carried off-road:
- Loss rate: `foodSpoilageRatePerSec` and `herbSpoilageRatePerSec` per second.
- Grace period: for the first `spoilageGracePeriodTicks` ticks of non-road carry, the loss
  rate is halved (scale factor 0.5).
- On-road tiles (`TILE.ROAD`, `TILE.BRIDGE`) fully suppress spoilage.
- `carryTicks` (counter of off-road ticks) is reset to 0 on full unload at a warehouse.

### Warehouse Unload

`handleDeliver` unloads carry into `state.resources` when the worker reaches a warehouse:
- A per-warehouse intake token cap (`warehouseIntakePerTick`, default 2) limits simultaneous
  unloads per tick. Workers exceeding the cap are enqueued.
- Unload rate: `workerUnloadRatePerSecond (4.2) / warehouseLoadPenalty * dt`.
- An isolation multiplier further reduces the rate for warehouses with no road connection.
- Full unload resets `carryAgeSec` and `carryTicks`.

---

## Fatigue System

Fatigue is tracked on `worker.rest` (0–1, starts at 1 = fully rested). Workers also carry
`worker.morale`, `worker.social`, and `worker.mood` (composite).

### Rest Decay

Every tick:
```
restDecay = workerRestDecayPerSecond (0.004)
          * nightMultiplier          // 2.4× at night
          * carryFatigueMultiplier   // >1 when carry is non-zero
worker.rest -= restDecay * dt
```

`carryFatigueLoadedMultiplier` (from `BALANCE`) scales rest decay when the worker carries
anything. Both multipliers stack multiplicatively.

### Night Behaviour

`isNight` is read from `state.environment.isNight`. During night:
- Rest decays 2.4× faster.
- Harvest cooldowns are extended (inverse of `workerNightProductivityMultiplier`, default 0.6
  → cooldown 1.67× longer).
- `StatePlanner` adds `rule:night-rest` when `rest < workerNightRestThreshold (0.65)`.

### Rest Recovery

`handleRest` runs when FSM state is `rest` or `seek_rest`:
```
worker.rest += workerRestRecoveryPerSecond (0.08) * dt   (clamped 0–1)
worker.morale += workerMoraleRecoveryPerSecond (0.02) * dt
```

The worker is considered recovered when `rest >= workerRestRecoverThreshold (0.6)`.

### Mood Composite

Every tick, mood is recomputed as a weighted average:

```
mood = 0.35 * hunger + 0.30 * rest + 0.20 * morale + 0.15 * social
```

When mood drops below 0.3, a `WORKER_MOOD_LOW` event is emitted (once per episode).

### Social Need

Every 30 ticks, nearby worker count (Manhattan distance < 4) is sampled. The social stat
drifts by `+0.005 * nearbyCount * dt` when other workers are close, and `−0.003 * dt` when
isolated. A `WORKER_SOCIALIZED` event fires every 300 ticks when `nearbyWorkers > 0`.

---

## Hunger System

Hunger is on `worker.hunger` (0–1, starts at 1 = full). It decays continuously and triggers
eat behaviour when low.

### Decay

```
hungerDecay = workerHungerDecayPerSecond (0.0055)
            * metabolism.hungerDecayMultiplier (default 1.0)
worker.hunger -= hungerDecay * dt
```

Per-worker `metabolism` overrides allow individual variation (multiplier clamped 0.5–1.5).

### Eating

`handleEat` navigates the worker to the nearest warehouse. On arrival:
1. Meals (`state.resources.meals`) are consumed first (with `mealHungerRecoveryMultiplier`,
   default 2.0× efficiency vs raw food).
2. If no meals, raw `state.resources.food` is consumed.
3. Recovery per food unit: `workerHungerEatRecoveryPerFoodUnit (0.11) * multiplier`.
4. Eating stops when `hunger >= workerEatRecoveryTarget (0.70)`.

### Emergency Rations

If a worker is below `WORKER_EMERGENCY_RATION_HUNGER_THRESHOLD` (0.18) and cannot reach a
warehouse (e.g. `reachableFood` flag false), `consumeEmergencyRation` draws directly from
`state.resources.food` at a reduced rate, with a 2.8 s cooldown between draws. This prevents
death from warehouse-path failures.

---

## LLM Integration

The LLM pipeline is hierarchical: `StrategicDirector` → `NPCBrainSystem` → per-entity
policy/target injection → `StatePlanner` merge.

### NPCBrainSystem

`NPCBrainSystem` (`src/simulation/ai/brains/NPCBrainSystem.js`) runs on the system tick
order before `WorkerAISystem`. Each decision cycle:

1. **Summary construction**: `buildPolicySummary(state)` assembles a structured world
   snapshot (resources, workforce, weather, building counts, etc.).
2. **LLM request**: `services.llmClient.requestPolicies(summary, state.ai.enabled)` sends
   the summary to an OpenAI-compatible endpoint (or triggers the state-adaptive fallback
   policy if the LLM is disabled or unavailable).
3. **Response parsing**: the response is validated through `normalizePoliciesForRuntime`,
   which sanitises `intentWeights` and `targetPriorities` into bounded numeric maps, and
   `normalizeStateTargetsForRuntime`, which validates group/state keys against the actual FSM
   graph.
4. **Policy write**: each group policy is stored in `state.ai.groupPolicies` with an
   expiration time (`expiresAtSec = nowSec + policy.ttlSec`, typically 8–90 s).
5. **State target write**: group-level directives are stored in
   `state.ai.groupStateTargets`.
6. **Per-entity fanout**: `NPCBrainSystem.update` copies the relevant group policy into
   `entity.policy` and the group state target into `entity.blackboard.aiTargetState` for each
   living agent and animal each tick.

### ColonyPlanner (LLM Construction Planner)

`ColonyPlanner` (`src/simulation/ai/colony/ColonyPlanner.js`) is a separate LLM-powered
system responsible for construction strategy, not worker micromanagement. It generates build
plans with a goal, reasoning, and ordered steps. It is relevant to workers indirectly:

- A `reassign_role` pseudo-action in a plan writes `state.ai.fallbackHints.pendingRoleBoost`
  which `RoleAssignmentSystem` consumes to force a role slot allocation — potentially
  reassigning a currently idle worker to a processing role.
- Build steps feed `policy.buildQueue`, which `WorkerAISystem.attemptAutoBuild` can consume
  during a wander state to place buildings automatically.

### Fallback Mode

When `state.ai.enabled` is false or the LLM call fails, `NPCBrainSystem` uses
`services.fallbackPolicies(summary)` — a state-adaptive rule set tuned for long-horizon
survival that mirrors the LLM output schema without requiring an API call. `state.ai.mode`
reflects `"llm"` or `"fallback"`. All downstream code in `StatePlanner` is identical
regardless of source.

### Flow into Worker Decisions

```
NPCBrainSystem.update()
  │  writes state.ai.groupPolicies["workers"].data.intentWeights
  │  writes state.ai.groupStateTargets["workers"].targetState
  │  copies both onto entity.policy and entity.blackboard.aiTargetState
  │
  ▼
WorkerAISystem.update()  (runs later in SYSTEM_ORDER)
  │  calls planEntityDesiredState(worker, state)
  │    ├─ deriveWorkerDesiredState()  (local rules)
  │    ├─ applyPolicyIntentPreference()  (reads entity.policy.intentWeights)
  │    └─ applyGroupTargetOverride()    (reads state.ai.groupStateTargets)
  │    └─ feasibility + fallback resolution
  │  calls transitionEntityState() → FSM hop
  └─ calls action handler (handleHarvest / handleDeliver / etc.)
```

Policy TTL means that if the LLM does not respond for 90 s, the policy expires and workers
fall back to pure local rules. The system continues to function correctly at all times
regardless of AI availability.

---

## System Update Order

`WorkerAISystem` occupies position 15 in `SYSTEM_ORDER` (defined in `constants.js`):

```
SimulationClock → VisibilitySystem → ProgressionSystem → DevIndexSystem
→ RaidEscalatorSystem → ColonyDirectorSystem → RoleAssignmentSystem
→ PopulationGrowthSystem → EnvironmentDirectorSystem → WeatherSystem
→ WorldEventSystem → TileStateSystem → NPCBrainSystem
→ WarehouseQueueSystem → WorkerAISystem → VisitorAISystem
→ AnimalAISystem → MortalitySystem → BoidsSystem
→ ResourceSystem → ProcessingSystem
```

Key ordering dependencies:
- `NPCBrainSystem` runs before `WorkerAISystem` so policies are current when workers plan.
- `WarehouseQueueSystem` resets intake tokens before workers attempt unloads.
- `TileStateSystem` updates soil salinization and fallow states before workers harvest.
- `ProcessingSystem` converts resources after workers have had a chance to staff buildings.

---

## Debug Fields

Workers populate `worker.debug` with diagnostics available in the HUD and benchmark output:

| Field                       | Description                                              |
|-----------------------------|----------------------------------------------------------|
| `lastStateNode`             | FSM state node before current tick                       |
| `lastIntent`                | Role-mapped intent (e.g. `"farm"`, `"deliver"`)          |
| `stateReason`               | Reason string from last FSM transition                   |
| `localDesiredState`         | Output of local rule set before policy/AI merging        |
| `policyDesiredState`        | After policy intent preference applied                   |
| `aiDesiredState`            | After AI group target override applied                   |
| `finalDesiredState`         | Final resolved state sent to FSM                         |
| `policyApplied`             | True when policy overrode the local desired state        |
| `policyTopIntent`           | Highest-weight intent from current group policy          |
| `policyTopWeight`           | Weight of top intent                                     |
| `policyRejectedReason`      | Feasibility rejection reason for policy state, if any    |
| `aiTargetApplied`           | True when AI state target overrode local+policy          |
| `policyTargetScore`         | Score of the winning target tile                         |
| `policyTargetFrontier`      | Frontier affinity of winning target                      |
| `lastFarmPressure`          | Ecology pressure on current farm tile                    |
| `lastFarmYieldMultiplier`   | Combined farm yield multiplier (ecology × fertility)     |
| `carryAgeSec`               | Age of current carry in seconds                          |
| `nearestWarehouseDistance`  | Manhattan tile distance to nearest warehouse             |
| `lastPathLength`            | Length of current path in tiles                          |
| `invalidTransitionCount`    | Count of FSM transitions with no valid path              |
