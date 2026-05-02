# Worker AI System

This document covers the full worker intelligence pipeline: how a worker decides what to do
each tick (`WorkerFSM` priority dispatcher), how state-specific behaviour is organised
(`WorkerStates` / `WorkerTransitions`), and how the `WorkerAISystem` host wraps that
dispatcher into the simulation update loop. Secondary topics include job reservation,
occupancy-aware target scoring, the carry and fatigue systems, and how the colony-level LLM
brain feeds into individual worker behaviour.

> **v0.10.0 architecture rewrite.** Worker AI was previously a three-layer pipeline
> (`chooseWorkerIntent` → `StatePlanner.planEntityDesiredState` → `StateGraph.transitionEntityState`)
> with a `commitmentCycle` latch and a `DEFAULT_STATE_HOLD_SEC` (0.8 s) hold window to dampen
> oscillation. The v0.9.x utility-scoring `JobScheduler` layer that briefly replaced it
> (v0.9.0) was also retired. The current implementation is a flat priority FSM
> (`WorkerFSM`) with discrete, named transitions. See §9 of
> `assignments/homework7/Final-Polish-Loop/Round0/Plans/C1-code-architect.md` for the full
> old → new mapping table.

---

## Pipeline Overview (v0.10.0+: PriorityFSM)

`worker.fsm = { state, enteredAtSec, target, payload }` is the single source of truth for
worker behaviour. The dispatcher is intentionally tiny so behaviour lives entirely in the
state-behaviour map and the transition table.

Per tick, `WorkerFSM.tickWorker(worker, state, services, dt)` does three things:

1. **Walk the priority-ordered transition list** for the current state
   (`STATE_TRANSITIONS[currentState]`). The first `when(worker, state, services)` that
   returns `true` wins. The dispatcher fires the previous state's `onExit`, rewrites
   `worker.fsm` to the new state (resetting `target` and `payload`), and fires the new
   state's `onEnter`. Array order is the priority order — callers must insert pre-sorted.
2. **Tick the (possibly new) current state's body**: `STATE_BEHAVIOR[fsm.state].tick(...)`.
3. **Write `worker.stateLabel = DISPLAY_LABEL[fsm.state]`** as a single source of truth for
   the HUD.

There is **no hold window**, **no commitment latch**, and **no hysteresis**. Oscillation is
prevented structurally: a state can only change when a `when()` clause returns true, and
priority ordering picks the most important transition. Survival preempts (e.g. low hunger
forcing exit from `HARVESTING`) are simply higher-priority entries in that state's
transition list.

Source files (the four "FSM" files plus the host system):

- `src/simulation/npc/fsm/WorkerFSM.js` — generic priority dispatcher (~125 LOC).
- `src/simulation/npc/fsm/WorkerStates.js` — `STATE` enum, `STATE_BEHAVIOR` map, `DISPLAY_LABEL` map.
- `src/simulation/npc/fsm/WorkerTransitions.js` — `STATE_TRANSITIONS[fromState] = [{ priority, to, when }, …]`.
- `src/simulation/npc/fsm/WorkerConditions.js` / `WorkerHelpers.js` — pure predicates and
  movement / reservation helpers shared across states.
- `src/simulation/npc/WorkerAISystem.js` — host: per-tick mood / social / morale-break
  bookkeeping, plus the `tickWorker` call that drives every living worker.
- `src/simulation/npc/JobReservation.js` — per-tile claim registry, used by
  `HARVESTING` / `BUILDING` `onEnter` to prevent two workers racing the same tile.

---

## State Inventory (12 states)

The `STATE` enum is frozen in `WorkerStates.js` and is the single source of state names.
Lock-test `test/worker-fsm-doc-contract.test.js` asserts the names listed below match
`STATE` exactly — adding a new state requires updating both this document and the enum in
the same commit.

- `IDLE` — wandering / no committed work. Refreshes a wander target every ~1.4–2.6 s. Display label: **Wander**. Exits to almost any other state when its `when()` fires.
- `SEEKING_REST` — pathing to a rest spot (currently the worker's own tile; future phases may pick a barracks). Display label: **Seek Rest**. Exits to `RESTING` on arrival or to a survival-preempt state.
- `RESTING` — recovering `worker.rest` and `worker.morale` in place. Display label: **Rest**. Exits when rest crosses `workerRestRecoverThreshold` or a higher-priority need fires.
- `FIGHTING` — engaging the nearest hostile (raider, predator, saboteur). Display label: **Engage**. Exits when no hostile remains in aggro range or the worker is recalled.
- `SEEKING_HARVEST` — pathing to a chosen harvest tile (FARM / LUMBER / QUARRY / HERB_GARDEN), reserving the tile via `JobReservation`. Display label: **Seek Task**. Exits to `HARVESTING` on arrival or releases the reservation on preempt.
- `HARVESTING` — at a harvest tile, applying `applyHarvestStep` each tick. Display label: **Harvest**. Exits to `DELIVERING` when `carryTotal` exceeds the deliver threshold, or to a survival state on hunger / hostile pressure.
- `DELIVERING` — pathing to the chosen warehouse tile. Display label: **Deliver**. Exits to `DEPOSITING` on arrival.
- `DEPOSITING` — at the warehouse, calling `handleDeliver` to unload `carry` into `state.resources` (subject to `WarehouseQueueSystem` intake caps). Display label: **Deliver**. Exits to `IDLE` / `SEEKING_HARVEST` once carry is empty.
- `SEEKING_BUILD` — pathing to a builder site reserved via `findOrReserveBuilderSite`. Display label: **Seek Construct**. Exits to `BUILDING` on arrival; releases the claim on preempt-without-arrival.
- `BUILDING` — at a construction site, calling `applyConstructionWork` each tick. Display label: **Construct**. Exits to `DELIVERING` / `IDLE` when the site completes (or claim is lost).
- `SEEKING_PROCESS` — pathing to a processing building (KITCHEN / SMITHY / CLINIC) for COOK / SMITH / HERBALIST roles. Display label: **Seek Process**. Exits to `PROCESSING` on arrival.
- `PROCESSING` — standing in the building so `ProcessingSystem` counts the worker as staffed. Display label: **Process**. Exits to a higher-priority state when needs fire.

---

## v0.9.x → v0.10.0 State Mapping

The previous FSM (`WorkerStateGraph`) had 10 states: `idle / seek_food / eat / seek_task /
harvest / deliver / process / wander / seek_rest / rest`. It was retired in v0.10.0 and is
no longer present in the codebase. The current 12-state PriorityFSM is documented above; the
old → new mapping is in §9 of the plan that introduced this rewrite
(`assignments/homework7/Final-Polish-Loop/Round0/Plans/C1-code-architect.md`). Notable
differences: `seek_food` / `eat` collapse into the survival-preempt `HARVESTING` exit (the
worker re-routes to a warehouse and consumes via `handleDeliver` / fast-eat-on-arrival);
`FIGHTING` and `SEEKING_BUILD` / `BUILDING` are new states reflecting v0.8.4 construction
and v0.8.x defense work; `seek_task` splits into the role-specific seek states
(`SEEKING_HARVEST` / `SEEKING_BUILD` / `SEEKING_PROCESS`).

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
present at the correct building so the system counts it as staffed (`PROCESSING` state).

---

## Transition Table Shape

`STATE_TRANSITIONS` (in `WorkerTransitions.js`) is a frozen map keyed by source-state name.
Each entry is an array of transition descriptors:

```js
STATE_TRANSITIONS[STATE.HARVESTING] = [
  { priority: 1, to: STATE.SEEKING_REST, when: (w, s) => survivalCriticalRest(w, s) },
  { priority: 1, to: STATE.IDLE,         when: (w, s) => survivalCriticalEat(w, s) },
  { priority: 5, to: STATE.DELIVERING,   when: (w, s) => carryFull(w, s) },
  // …
];
```

Lower `priority` is more urgent. The dispatcher walks the array in array order (callers
must insert pre-sorted), and the first `when()` returning `true` wins. There is no
breadth-first search, no shortest-path traversal, and no hold window — discrete events
only.

---

## Display Labels

The dispatcher writes `worker.stateLabel = DISPLAY_LABEL[fsm.state]` once per tick after
the transition + tick pass. State bodies do **not** write `worker.stateLabel`. The
`DISPLAY_LABEL` map lives in `src/simulation/npc/fsm/WorkerStates.js` next to the
`STATE_BEHAVIOR` map; new states must add a row in both maps.

State bodies do still write `worker.blackboard.intent` (e.g. `"harvest"`, `"deliver"`),
which carries semantic meaning distinct from the display label (e.g. `SEEKING_HARVEST` →
label "Seek Task" but intent `"harvest"`). `EntityFocusPanel` and other UI consumers read
both fields independently.

---

## Occupancy-Aware Target Scoring

`chooseWorkerTarget(worker, state, targetTileTypes)` selects the best tile from all matching
tiles on the grid. It is invoked from `SEEKING_HARVEST.onEnter`, `DELIVERING.onEnter`, and
`SEEKING_PROCESS.onEnter`. Each candidate receives a composite score:

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

### Boids Path-Dampening (HW7 hotfix iter1, Batch A)

Workers/visitors with an active A* path receive a strongly attenuated separation force
inside `BoidsSystem.computeBoidsForce`. The dampening factor is a hard-coded constant
`SEP_DAMPEN_ON_PATH = 0.35` (NOT a `BALANCE` knob), applied only when
`entity.type === "WORKER" || "VISITOR"` AND `entity.path` is non-empty AND
`pathIndex < path.length`. Animals (no `path`) keep full separation.

Rationale: at the v0.10.x worker boids weights (`separation: 2.6`, `seek: 1.22`),
separation wins ~2:1 on a single crowded tile, pushing path followers off narrow
warehouse-approach lanes. With the dampening, effective separation while pathing
(2.6 × 0.35 ≈ 0.91) sits below seek (1.22), letting the A*-derived `desiredVel` drive
net steering. The integrator's impassable-tile revert plus the traffic-penalty A* layer
already handle real congestion.

---

## Job Reservation System

`JobReservation` (`src/simulation/npc/JobReservation.js`) is a per-game-state singleton
instantiated on `state._jobReservation`. It is used by FSM `HARVESTING` / `BUILDING`
`onEnter` (and the corresponding `SEEKING_*` states) to prevent two workers from racing the
same tile. See `WorkerHelpers.acquireJobReservation` for the canonical call site.

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
FSM `onExit` of `SEEKING_*` states releases the worker's reservation if the worker leaves
without arriving; the corresponding `onEnter` of `HARVESTING` / `BUILDING` re-reserves on
arrival. Dead workers trigger `reservation.releaseAll(worker.id)` before being skipped.

---

## Carry System

Each worker maintains a `carry` object with four resource slots:

```js
worker.carry = { food: 0, wood: 0, stone: 0, herbs: 0 }
```

`carryTotal` is the sum of all four slots. There is no hard per-slot capacity enforced in
code — capacity is softly regulated by the deliver threshold and carry-pressure timer, both
checked in `STATE_TRANSITIONS[HARVESTING]`.

### Carry Accumulation

`resolveWorkCooldown` drives incremental accumulation during harvest. Each work cycle:
1. On the first call with `cooldown <= 0`, a new cooldown is randomised:
   `baseDuration (2.5 s) * skillMultiplier * nightPenalty * rng(0.8–1.3)`.
2. On subsequent calls, `cooldown -= dt` and `progress` is updated (0–1).
3. When `cooldown` crosses zero, `carry[resourceType] += amount` and progress resets.

### Carry Age and Pressure

`worker.blackboard.carryAgeSec` counts seconds of continuous non-zero carry. When it exceeds
`workerCarryPressureSec` (3.8 s), the `HARVESTING → DELIVERING` transition's `when()` fires
regardless of carry quantity. This prevents workers from holding resources indefinitely.

### In-Transit Spoilage

Perishables (`food`, `herbs`) decay while carried off-road:
- Loss rate: `foodSpoilageRatePerSec` and `herbSpoilageRatePerSec` per second.
- Grace period: for the first `spoilageGracePeriodTicks` ticks of non-road carry, the loss
  rate is halved (scale factor 0.5).
- On-road tiles (`TILE.ROAD`, `TILE.BRIDGE`) fully suppress spoilage.
- `carryTicks` (counter of off-road ticks) is reset to 0 on full unload at a warehouse.

### Warehouse Unload

`handleDeliver` (called by `DEPOSITING.tick`) unloads carry into `state.resources` when the
worker reaches a warehouse:
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
- Survival-preempt transitions out of `HARVESTING` / `IDLE` into `SEEKING_REST` fire at a
  higher rest threshold when `isNight && rest < workerNightRestThreshold (0.65)`.

### Rest Recovery

`RESTING.tick` runs:
```
worker.rest += workerRestRecoveryPerSecond (0.08) * dt   (clamped 0–1)
worker.morale += workerMoraleRecoveryPerSecond (0.02) * dt
```

The worker is considered recovered when `rest >= workerRestRecoverThreshold (0.6)`, at
which point a transition out of `RESTING` fires.

### Mood Composite

Every tick, mood is recomputed in `WorkerAISystem.update` (not in the FSM) as a weighted
average:

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

Hunger is on `worker.hunger` (0–1, starts at 1 = full). It decays continuously. When low,
it triggers a survival-preempt transition out of any state into the eat-routing chain.

### Decay

```
hungerDecay = workerHungerDecayPerSecond (0.0055)
            * metabolism.hungerDecayMultiplier (default 1.0)
worker.hunger -= hungerDecay * dt
```

Per-worker `metabolism` overrides allow individual variation (multiplier clamped 0.5–1.5).

### Eating

When hunger is low and a warehouse is reachable, a survival-preempt transition routes the
worker into the deliver→deposit chain (`DELIVERING` / `DEPOSITING`); on arrival, the
at-warehouse fast-eat path inside `handleDeliver` consumes:

1. Meals (`state.resources.meals`) first (with `mealHungerRecoveryMultiplier`,
   default 2.0× efficiency vs raw food).
2. Otherwise raw `state.resources.food`.
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
policy / target injection → priority-FSM transitions read those policies as inputs to their
`when()` predicates.

### NPCBrainSystem

`NPCBrainSystem` (`src/simulation/ai/brains/NPCBrainSystem.js`) runs on the system tick
order before `WorkerAISystem`. Each decision cycle:

1. **Summary construction**: `buildPolicySummary(state)` assembles a structured world
   snapshot (resources, workforce, weather, building counts, etc.).
2. **LLM request**: `services.llmClient.requestPolicies(summary, state.ai.enabled)` sends
   the summary to an OpenAI-compatible endpoint (or triggers the state-adaptive fallback
   policy if the LLM is disabled or unavailable).
3. **Response parsing**: the response is validated through `normalizePoliciesForRuntime`,
   which sanitises `intentWeights` and `targetPriorities` into bounded numeric maps.
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
  during an `IDLE` tick to place blueprints automatically (the resulting builder sites are
  then claimed by `SEEKING_BUILD.onEnter`).

### Fallback Mode

When `state.ai.enabled` is false or the LLM call fails, `NPCBrainSystem` uses
`services.fallbackPolicies(summary)` — a state-adaptive rule set tuned for long-horizon
survival that mirrors the LLM output schema without requiring an API call. `state.ai.mode`
reflects `"llm"` or `"fallback"`. Downstream FSM transition predicates are identical
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
  │  per worker:
  │  ├─ this._workerFSM.tickWorker(worker, state, services, dt)
  │  │     ├─ walk STATE_TRANSITIONS[fsm.state] (predicates may read entity.policy)
  │  │     ├─ tick STATE_BEHAVIOR[fsm.state]
  │  │     └─ write worker.stateLabel = DISPLAY_LABEL[fsm.state]
  │  └─ post-FSM mood / social / morale-break bookkeeping
```

Policy TTL means that if the LLM does not respond for 90 s, the policy expires and FSM
transition predicates fall back to pure local conditions. The system continues to function
correctly at all times regardless of AI availability.

---

## System Update Order

`WorkerAISystem` occupies a fixed slot in `SYSTEM_ORDER` (defined in `constants.js`):

```
SimulationClock → VisibilitySystem → ProgressionSystem → DevIndexSystem
→ RaidEscalatorSystem → EventDirectorSystem → AgentDirectorSystem
→ RoleAssignmentSystem → PopulationGrowthSystem → EnvironmentDirectorSystem
→ WeatherSystem → WorldEventSystem → TileStateSystem → NPCBrainSystem
→ WarehouseQueueSystem → WorkerAISystem → ConstructionSystem
→ VisitorAISystem → AnimalAISystem → MortalitySystem → BoidsSystem
→ ResourceSystem → ProcessingSystem
```

`AgentDirectorSystem` (HW6 LLM colony planner wave) wraps the legacy `ColonyDirectorSystem` as a fallback so non-LLM runs are unchanged. `ConstructionSystem` (v0.8.4 Agent A) sits **after** `WorkerAISystem` so any builder `workAppliedSec` increment from the same tick is reflected before completion is checked.

Key ordering dependencies:
- `NPCBrainSystem` runs before `WorkerAISystem` so policies are current when FSM
  transitions evaluate their `when()` predicates.
- `WarehouseQueueSystem` resets intake tokens before workers attempt unloads in `DEPOSITING`.
- `TileStateSystem` updates soil salinization and fallow states before workers harvest.
- `ProcessingSystem` converts resources after workers have had a chance to staff buildings
  (i.e. enter `PROCESSING` for the current tick).

---

## Debug Fields

Workers populate `worker.debug` and adjacent fields with diagnostics available in the HUD
and benchmark output:

| Field                       | Description                                              |
|-----------------------------|----------------------------------------------------------|
| `worker.fsm.state`          | Current FSM state name (one of `STATE`)                  |
| `worker.fsm.enteredAtSec`   | `state.metrics.timeSec` at last transition into the state|
| `worker.fsm.target`         | `{ ix, iz, meta? }` chosen by current state's `onEnter`  |
| `worker.fsm.payload`        | Free-form per-state scratch (cleared on transition)      |
| `worker.stateLabel`         | Display label (single-write by dispatcher)               |
| `worker.blackboard.intent`  | Semantic intent string (`"harvest"`, `"deliver"`, …)     |
| `worker.debug.lastFarmPressure` | Ecology pressure on current farm tile                |
| `worker.debug.lastFarmYieldMultiplier` | Combined farm yield multiplier (ecology × fertility) |
| `worker.debug.carryAgeSec`  | Age of current carry in seconds                          |
| `worker.debug.nearestWarehouseDistance` | Manhattan tile distance to nearest warehouse |
| `worker.debug.lastPathLength` | Length of current path in tiles                        |
| `worker.debug.lastConstructApplySec` | `state.metrics.timeSec` at last `applyConstructionWork` (set by `BUILDING.tick`) |

---

## Known Architectural Debt (C1 Round 0 inventory)

> The list below is the C1-code-architect Round 0 baseline; the project's overall verdict is
> **YELLOW** (60% of systems graded A or B). The Top-3 refactor opportunities are summarised
> at the bottom; the full per-system audit lives in
> `assignments/homework7/Final-Polish-Loop/Round0/Feedbacks/C1-code-architect.md`.

Each entry below is a debt id, a one-line summary, and the source path to look at.

### ProgressionSystem

- **debt-prog-1** — `DOCTRINE_PRESETS` is 5 hard-coded preset objects with ~15 fields each; new doctrine = copy/paste. Source: `src/simulation/meta/ProgressionSystem.js:6-77`.
- **debt-prog-2** — survival-score / objectives / milestones are three independent subsystems sharing one `update()`. Recommend split into `DoctrineSystem` / `ObjectiveSystem` / `MilestoneSystem`. Source: `src/simulation/meta/ProgressionSystem.js`.

### EventDirectorSystem

- **debt-evt-1** — `NON_RAID_FALLBACK_ORDER` is hard-coded; new event types must edit two places. Source: `src/simulation/meta/EventDirectorSystem.js:28-34`.

### AgentDirectorSystem

- **debt-agent-1** — `algorithmic` / `hybrid` / `agent` modes go through three different code paths; should unify behind a `PlanProvider` interface. Source: `src/simulation/ai/colony/AgentDirectorSystem.js:13`.

### ColonyDirectorSystem

- **debt-col-1** — `assessColonyNeeds` is a long if-stack of carve-outs (~600 LOC). Recommend abstracting each carve-out into a `BuildHeuristic = (state) => Need[]` strategy. Source: `src/simulation/meta/ColonyDirectorSystem.js:84+`.
- **debt-col-2** — phase determination is hard-coded (`buildings.farms >= N && buildings.warehouses >= M`); 5 phases, each new one edits two functions. Source: `src/simulation/meta/ColonyDirectorSystem.js`.

### RoleAssignmentSystem

- **debt-role-1** — guard / builder dynamic promotion goes through a separate path from the band-table quota. Recommend table-driving the dynamic block too. Source: `src/simulation/population/RoleAssignmentSystem.js`.

### PopulationGrowthSystem

- **debt-pop-1** — file is named `PopulationGrowthSystem.js` but the class is `RecruitmentSystem`; needs an export alias hack. Recommend rename. Source: `src/simulation/population/PopulationGrowthSystem.js:1-12`.

### StrategicDirector

- **debt-strat-1** — multiple `pickXxx` functions are flat if-chains; recommend a generic `pickField(field, candidates, scorer)`. Source: `src/simulation/ai/strategic/StrategicDirector.js`.

### EnvironmentDirectorSystem

- **debt-env-1** — fragility classification (`critical / fragile / watchful / stable / thriving`) is a 5-branch if-stack; recommend `FRAGILITY_RULES` table + first-match. Source: `src/simulation/ai/director/EnvironmentDirectorSystem.js:32+`.

### WeatherSystem

- **debt-weather-1** — `lastTransitionSec` is a side-channel scratch field read by `ProcessingSystem`. Recommend an explicit `state.weather.transitionEvents[]` queue. Source: `src/world/weather/WeatherSystem.js`.

### WorldEventSystem

- **debt-wevt-1** — 6 event handlers (BANDIT_RAID / TRADE_CARAVAN / ANIMAL_MIGRATION / DISEASE_OUTBREAK / WILDFIRE / MORALE_BREAK) each 100–200 LOC, no common interface. Recommend `EventHandler` interface. Source: `src/world/events/WorldEventSystem.js`.
- **debt-wevt-2** — bandit raid spawn / sabotage / migration handlers have an implicit ordering dependency; recommend explicit `priority` field. Source: `src/world/events/WorldEventSystem.js`.
- **debt-wevt-3** — file lives outside `src/simulation/`, violating the "all sim systems under simulation/" convention. Recommend `mv → src/simulation/events/`. Source: `src/world/events/WorldEventSystem.js`.

### TileStateSystem

- **debt-tile-1** — `FERTILITY_RECOVERY_PER_SEC` etc. are file-level consts, not in `BALANCE`. Recommend moving to `BALANCE.tileState`. Source: `src/simulation/economy/TileStateSystem.js:7-12`.

### NPCBrainSystem

- **debt-brain-1** — `POLICY_INTENT_TO_STATE` is duplicated in `NPCBrainSystem.js:28-61` and `npc/state/StatePlanner.js:34-74`; the two copies have already drifted (workers entries differ). Recommend a single source in `src/config/aiConfig.js`. Source: `src/simulation/ai/brains/NPCBrainSystem.js:28-61`.

### WorkerAISystem

- **debt-worker-1** — `update()` includes ~250 LOC of mood / social / morale-break / relationship bookkeeping that has nothing to do with the FSM dispatcher. Recommend split into `WorkerMoodSystem` + `WorkerSocialSystem`, listed in `SYSTEM_ORDER`. Source: `src/simulation/npc/WorkerAISystem.js:1500-1680`.
- **debt-worker-2** — FSM-dependency helpers (`handleDeliver`, `handleHarvest`, `handleProcess`, `chooseWorkerTarget`, `pickWanderNearby`, `setIdleDesired`) are still exported from `WorkerAISystem.js`, not `WorkerHelpers.js`. Recommend moving them. Source: `src/simulation/npc/WorkerAISystem.js`.
- **debt-worker-3** — 53 grep hits across 15 files for legacy compat reads (`worker.debug.lastIntent`, `blackboard.fsm.state`); v0.10.0 retrospective deferred this cleanup. Recommend standardising reads on `worker.fsm.state` / `worker.stateLabel`. Source: `src/simulation/npc/WorkerAISystem.js` (and 14 other files).

### ConstructionSystem

- **debt-cons-1** — `regenerateWallHp` and construction-completion check are two independent algorithms in one `update()`. Recommend split into `WallRegenSystem`. Source: `src/simulation/construction/ConstructionSystem.js:37-138`.

### VisitorAISystem

- **debt-vis-1** — still imports `StatePlanner` + `StateGraph` (v0.9.x decision skeleton), inconsistent with v0.10.0 worker FSM framework. Recommend migrating to a `VisitorFSM` sharing a generic dispatcher with `WorkerFSM`. **(Refactor-1 Wave-3 — the next-step entry from this round.)** Source: `src/simulation/npc/VisitorAISystem.js:8-9`.
- **debt-vis-2** — sabotage handler is an implicit state machine inside an if-stack. Recommend exposing as sub-states. Source: `src/simulation/npc/VisitorAISystem.js`.

### AnimalAISystem

- **debt-anim-1** — same root cause as debt-vis-1: still imports `StatePlanner` + `StateGraph`. Recommend merging with debt-vis-1 onto the generic FSM dispatcher. **(Refactor-1 Wave-4.)** Source: `src/simulation/npc/AnimalAISystem.js:8-9`.
- **debt-anim-2** — `handlePredator` / `handleHerbivore` are 400+ LOC if-stacks; species profile is table-driven, but state behaviour is not. Recommend extracting `STATE_BEHAVIOR` triples. Source: `src/simulation/npc/AnimalAISystem.js`.

### MortalitySystem

- **debt-mort-1** — `medicineHealing` (lines 783-806) is unrelated to mortality; it is a healing subsystem. Recommend extracting to `HealingSystem`. Source: `src/simulation/lifecycle/MortalitySystem.js:783-806`.
- **debt-mort-2** — `recomputeCombatMetrics` (lines 362-435) belongs in `RoleAssignmentSystem` or a dedicated `CombatMetricsSystem`, not in MortalitySystem. Source: `src/simulation/lifecycle/MortalitySystem.js:362-435`.

### WildlifePopulationSystem

- **debt-wild-1** — `assignAnimalHabitat` / `pickPredatorSpawnTile` / `pickHerbivoreSpawnTile` share zone-anchor / radius computation. Recommend `getZoneCandidates(state, zone, kind)` helper. Source: `src/simulation/ecology/WildlifePopulationSystem.js`.

### BoidsSystem

- **debt-boids-1** — `TRAFFIC_NEIGHBOR_OFFSETS` duplicates direction tables that should live as a single source in `src/config/constants.js`. Source: `src/simulation/movement/BoidsSystem.js:7-13`.

### ResourceSystem

- **debt-res-1** — five subsystems (flow tracking / spoilage / crisis detection / per-tile production telemetry / warehouse density risk) share one file. Recommend split. Source: `src/simulation/economy/ResourceSystem.js`.
- **debt-res-2** — `recordResourceFlow(state, resource, kind, amount)` is a side-channel pseudo-event-bus used by 3 systems via direct import. Recommend formalising as `state.events.resourceFlow` queue. Source: `src/simulation/economy/ResourceSystem.js`.

### ProcessingSystem

- **debt-proc-1** — `#processKitchens` / `#processSmithies` / `#processClinics` are three structurally identical methods. Recommend `PROCESSING_RECIPES` table. Source: `src/simulation/economy/ProcessingSystem.js`.

### ColonyPlanner

- **debt-cp-1** — 1867 LOC with no `PlanProvider` interface; LLM and fallback paths are 95% non-shared. Recommend `PlanProvider { proposePlan(state, hints) → Plan }`. Source: `src/simulation/ai/colony/ColonyPlanner.js`.
- **debt-cp-2** — `shouldReplan` is a giant OR-of-conditions (~150 LOC). Recommend `REPLAN_TRIGGERS = [(state) => bool | reason]` table. Source: `src/simulation/ai/colony/ColonyPlanner.js`.
- **debt-cp-3** — large business-logic duplication with `ColonyDirectorSystem` (phase / emergency / warehouse-ratio). Recommend a shared `ColonyAssessment` module. Source: `src/simulation/ai/colony/ColonyPlanner.js` + `src/simulation/meta/ColonyDirectorSystem.js`.

### ColonyPerceiver

- **debt-perc-1** — 1966 LOC (largest single file) with no `FieldContributor` interface; adding a prompt field means editing one giant `perceive()`. Recommend `PERCEIVER_FIELDS = [{ key, compute, importance }]`. Source: `src/simulation/ai/colony/ColonyPerceiver.js`.
- **debt-perc-2** — large overlap with `WorldSummary.js` (both build colony snapshots for LLM consumption, with different field sets and call sites). Recommend merging into a single `ColonySnapshotBuilder`. Source: `src/simulation/ai/colony/ColonyPerceiver.js` + `src/simulation/ai/memory/WorldSummary.js`.

### LogisticsSystem

- **debt-log-1** — instantiated lazily inside `WorkerAISystem.update()` rather than listed in `SYSTEM_ORDER`; invisible to audits and profilers. Recommend listing it in `SYSTEM_ORDER` next to `TileStateSystem`. Source: `src/simulation/economy/LogisticsSystem.js` + `src/simulation/npc/WorkerAISystem.js:1327`.

### Top-3 Refactor Opportunities (round-by-round)

1. **Refactor-1: extract a generic `PriorityFSM<StateName>` dispatcher** — abstract
   `src/simulation/npc/fsm/WorkerFSM.js` so it accepts injected `STATE_BEHAVIOR` /
   `STATE_TRANSITIONS` / `DISPLAY_LABEL` maps; then migrate `VisitorAISystem` (debt-vis-1)
   and `AnimalAISystem` (debt-anim-1) onto it; retire `npc/state/*` (StatePlanner / StateGraph
   / StateFeasibility, ~1167 LOC). Plan is split into 4 waves; **wave-1 (this Round 0) is
   docs-only**, wave-2 lifts the dispatcher in Round 1, wave-3 migrates Visitor in Round 2,
   wave-4 migrates Animal in Round 3.
2. **Refactor-2: split WorkerAISystem mood / social out** — debt-worker-1 + debt-worker-2.
   Targets `WorkerAISystem (B → A)`. Two waves: extract `WorkerMoodSystem` / `WorkerSocialSystem`,
   then move FSM-dependency helpers into `WorkerHelpers.js`. Touches `SYSTEM_ORDER` in wave-1.
3. **Refactor-3: ColonyAssessment + PlanProvider unification** — debt-cp-1 / cp-3 /
   perc-1 / perc-2 / agent-1. Targets `ColonyPlanner / ColonyPerceiver (D → B)`. Four
   waves; not started in Round 0; deferred to Round 2+.

See `assignments/homework7/Final-Polish-Loop/Round0/Feedbacks/C1-code-architect.md` for the
full per-system grading table, the LLM-pipeline retreat-points, and the dead-code inventory.
