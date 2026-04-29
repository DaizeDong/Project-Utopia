# 2026-04-28 — Building Lifecycle, Walls, & Recruitment Rework

This document is the **shared design contract** for four cross-cutting features
implemented in parallel by four sub-agents. All four agents MUST follow it so
the changes compose. Anything not specified here is left to the implementing
agent's judgement, but the data shapes, tool names, action names, and
balance-constant names below are **load-bearing** — changing one breaks the
others.

## Goals (from user prompt)

1. **Demolish** — Players can demolish buildings; the LLM and rule fallback
   can also demolish (consuming a small resource cost). Currently ruins
   accumulate forever because no AI ever clears them.
2. **Construction-in-progress** — Buildings are no longer instant. Workers
   must travel to the site and apply build labor; the tile renders
   semi-transparent with a progress bar; placement times are reasonable.
3. **Strategic walls + gates** — Walls currently block colony pathfinding
   AND raiders symmetrically. Add **GATE** tile (passable to colony, blocked
   for hostiles). Walls have HP and can be attacked by hostiles. Walls
   become a real defensive geometry, not just visual.
4. **Food-cost recruitment** — Replace automatic reproduction with an
   explicit recruit action (food cost). Both the player and the AI
   (LLM + rules) plan recruitment for controlled growth.

## Non-Goals

- No combat overhaul beyond wall HP + raider wall-attack.
- No world-event redesign (raid escalator stays).
- No new map templates.
- No new building types beyond GATE.

---

## 1. Data Model Additions

### 1.1 New TILE constant — GATE = 14

```js
// src/config/constants.js
export const TILE = Object.freeze({
  // ... existing 0..13
  BRIDGE: 13,
  GATE: 14,   // NEW — passable to colony faction, blocked for hostiles
});
```

```js
// TILE_INFO additions
[TILE.GATE]: { passable: true, baseCost: 0.85, height: 0.45, color: 0x8b6f47 },
```

`passable: true` is the **default** answer for callers that don't pass a
faction. Faction-aware passability is checked separately (§ 4).

### 1.2 New ROLE constant — BUILDER

```js
// src/config/constants.js
export const ROLE = Object.freeze({
  // ... existing
  GUARD: "GUARD",
  BUILDER: "BUILDER",  // NEW — workers who construct/demolish blueprints
});
```

### 1.3 tileState.construction overlay

Construction state lives on `tileState` as an **overlay** — the tile keeps
its `oldType` (usually GRASS) until the build completes, at which point it
mutates to `targetTile`. This keeps pathfinding correct during construction
(walls don't pre-emptively block; warehouses don't pre-emptively count).

Shape on `state.grid.tileState.get(idx).construction`:

```js
{
  kind: "build" | "demolish",         // build = blueprint→target; demolish = target→GRASS
  tool: "warehouse" | "gate" | ...,   // for build: the tool name
  targetTile: TILE.WAREHOUSE,          // for build: tile after completion
  originalTile: TILE.GRASS,            // for demolish: tile before demolition (used for refund)
  workTotalSec: 8.0,                   // total worker-seconds required (BALANCE.constructionWorkSec[tool])
  workAppliedSec: 0,                   // accumulator; ConstructionSystem ticks completion
  builderId: null | <worker.id>,       // currently-assigned builder; -1 = unassigned
  startedAt: <simSec>,
  cost: { wood, stone, food, herbs },  // resources spent at blueprint placement (for cancel-refund)
  refund: { wood, stone, food, herbs },// for demolish: salvage to grant on completion
  owner: "player" | "ai-llm" | "ai-fallback",
  cancelable: true,                    // whether the player can cancel for refund
}
```

When construction completes or is canceled, this entry is **deleted** from
`tileState`.

### 1.4 state.constructionSites — index for fast lookup

```js
state.constructionSites = [
  { ix, iz, kind, tool, builderId, workAppliedSec, workTotalSec, ... },
  // mirror of tileState.construction; rebuilt on add/remove/complete
];
```

This is an **index** so WorkerAISystem and SceneRenderer can iterate sites
without scanning the whole tileState map. The authoritative state is on
`tileState`; `constructionSites` is recomputed when:

- Blueprint placed (push)
- Construction completes (splice)
- Construction canceled (splice)
- Site loaded from save (rebuild whole array)

A helper `rebuildConstructionSites(state)` that scans tileState should live
in a shared module (e.g. `src/simulation/construction/ConstructionSites.js`).

### 1.5 Wall HP — tileState.wallHp

```js
// On WALL tiles only
tileState.get(idx).wallHp = 50;  // default BALANCE.wallMaxHp
```

When wallHp ≤ 0, the wall mutates to RUINS (via `mutateTile`).

### 1.6 Recruit queue + cooldown

```js
state.controls.recruitTarget = 16;       // user-set worker count target (UI slider)
state.controls.recruitQueue = 0;         // pending recruits awaiting cooldown/food
state.controls.recruitCooldownSec = 0;   // ticks down
state.controls.autoRecruit = true;       // whether AI may auto-recruit toward target
```

### 1.7 Entity faction

Each agent gets a derived `faction` field (or accessor):

- `WORKER` (any role): faction = `"colony"`
- `VISITOR.kind === TRADER`: faction = `"colony"` (peaceful — passes gates)
- `VISITOR.kind === SABOTEUR`: faction = `"hostile"`
- `ANIMAL.kind === HERBIVORE`: faction = `"neutral"` (blocked by gates)
- `ANIMAL.kind === PREDATOR` (incl. raider_beast): faction = `"hostile"`

Implementations should add a small helper `getEntityFaction(entity)` in
`src/simulation/navigation/Faction.js` so all sites stay consistent.

---

## 2. Balance Constants (add to `src/config/balance.js`)

```js
// Construction work durations in worker-seconds
constructionWorkSec: Object.freeze({
  road: 1.5,
  farm: 4.0,
  lumber: 4.0,
  warehouse: 8.0,
  wall: 3.5,
  quarry: 5.0,
  herb_garden: 3.5,
  kitchen: 7.0,
  smithy: 7.5,
  clinic: 6.0,
  bridge: 5.5,
  gate: 4.0,
}),
demolishWorkSec: Object.freeze({
  default: 3.0,    // built structure
  ruins: 1.5,      // RUINS clear faster
  wall: 2.5,
  gate: 2.5,
}),
demolishToolCost: { wood: 1 },     // small commissioning cost

// Recruitment
recruitFoodCost: 25,                // per worker
recruitCooldownSec: 30,             // pacing between auto-spawns
recruitMaxQueueSize: 12,            // queue cap
recruitMinFoodBuffer: 80,           // don't auto-recruit if food drops below this

// Walls + gates
wallMaxHp: 50,
wallAttackDamagePerSec: 5,          // per attacking hostile
gateCost: { wood: 4, stone: 1 },    // baseline; escalator can apply

// Builder role scaling
builderPerSite: 1.5,                // target builders per active site, ceil
builderMin: 0,                      // 0 when no sites
builderMax: 6,                      // hard cap
```

Update `BUILD_COST`:

```js
gate: { wood: 4, stone: 1 },
```

Update `BUILD_COST_ESCALATOR` with a gate entry (mirroring wall):

```js
gate: { softTarget: 4, perExtra: 0.15, cap: 2.0, perExtraBeyondCap: 0.05, hardCap: 24 },
```

---

## 3. BuildSystem & Construction lifecycle

### 3.1 BuildSystem.placeToolAt — blueprint mode

Existing signature: `placeToolAt(state, tool, ix, iz, options)`.

Add `options.instant` (default `false` in production, `true` in tests via
helpers or fixture flags). When `instant: false`:

1. Validate via `previewToolAt` (unchanged).
2. **Spend resources** (so the player commits — preserves current
   anti-spam UX). The `cost` field on the construction overlay records
   what was spent so cancel can refund.
3. **Do NOT call `setTile`** for the target tile. Tile stays as `oldType`.
4. **Write the construction overlay** on tileState.
5. **Push** to `state.constructionSites`.
6. **Emit** `BUILDING_PLACED` event with `phase: "blueprint"` (existing
   listeners that watch for `BUILDING_PLACED` may want to filter — see
   migration note in § 9).
7. Return ok with `{ ...preview, phase: "blueprint" }`.

When `instant: true` (test mode): existing behavior — tile mutates
immediately, no overlay, fires `BUILDING_PLACED` with `phase: "complete"`.

### 3.2 Demolish via erase tool

Existing `erase` tool path:

- If target tile has a construction overlay → cancel that blueprint
  (refund `cost`, remove overlay). No work required.
- If target tile is built (FARM, WAREHOUSE, WALL, KITCHEN, etc.) → write a
  `kind: "demolish"` overlay with `originalTile = currentTile`,
  `targetTile = TILE.GRASS` (or `TILE.WATER` for BRIDGE), `refund =
  getTileRefund(currentTile, rng)`. Do NOT mutate the tile yet. Spend
  `BALANCE.demolishToolCost` from resources upfront.
- If target tile is RUINS → write demolish overlay with the salvage roll.
  Faster `workTotalSec` from `demolishWorkSec.ruins`.

### 3.3 ConstructionSystem (new)

Add a new system in `src/simulation/construction/ConstructionSystem.js`.
Insert into `SYSTEM_ORDER` AFTER `WorkerAISystem` (so worker contributions
this tick are applied) and BEFORE `ResourceSystem` (so newly-completed
buildings count this tick).

Per tick:

1. For each entry in `state.constructionSites`:
   - Tick down builder reservation if builder is dead/missing.
   - If `workAppliedSec >= workTotalSec`:
     - For `kind: "build"`: call `mutateTile(state, ix, iz, targetTile)` —
       this fires the existing tile-mutation cascade (rebuild building
       counts, release reservations, invalidate paths). Then for WALL,
       initialize `tileState.wallHp = BALANCE.wallMaxHp`. For GATE, no
       extra state.
     - For `kind: "demolish"`: call `mutateTile(state, ix, iz,
       targetTile)` (usually GRASS). Apply `refund` to `state.resources`.
     - Delete `tileState.construction` overlay.
     - Splice from `constructionSites`.
     - Emit `BUILDING_PLACED` (build) or `BUILDING_DESTROYED` (demolish)
       with `phase: "complete"`.

The actual `workAppliedSec += dt` increment happens in WorkerAISystem when
a builder is at the site (§ 5).

### 3.4 BuildSystem.cancelBlueprint

New method `cancelBlueprint(state, ix, iz)`:

- If overlay exists and `cancelable !== false`:
  - Refund `cost` to resources.
  - Delete overlay.
  - Splice from constructionSites.
  - Emit `BUILDING_DESTROYED` with `phase: "blueprint-cancel"`.

UI binds to right-click on a blueprint (or the cancel button). LLM/rule AI
do NOT cancel blueprints (out of scope for v1).

---

## 4. Faction-aware pathfinding (Walls + Gates)

### 4.1 AStar API extension

Update `aStar(grid, start, goal, weatherMoveCostMultiplier, dynamicCosts,
options = {})` to accept `options.faction`:

```js
const faction = options.faction ?? "colony";
// in the neighbor loop:
if (!isTilePassableForFaction(tileType, faction)) continue;
```

`isTilePassableForFaction(tileType, faction)`:

```js
import { TILE, TILE_INFO } from "../../config/constants.js";

const HOSTILE_BLOCKED = new Set([TILE.WALL, TILE.GATE]);
const NEUTRAL_BLOCKED = new Set([TILE.WALL, TILE.GATE]);

export function isTilePassableForFaction(tileType, faction) {
  const info = TILE_INFO[tileType];
  if (!info?.passable) return false;       // WATER, etc. — always blocked
  if (tileType === TILE.WALL) return false; // walls are never walkable
  if (tileType === TILE.GATE) return faction === "colony";
  return true;
}
```

Live in `src/simulation/navigation/Faction.js` along with
`getEntityFaction(entity)`.

### 4.2 Navigation.setTargetAndPath

Read `entity.faction` (via `getEntityFaction(entity)`) and pass it through
to `aStar`. Include faction in the path-cache key so colony-only paths
don't get returned to hostiles.

```js
// PathCache key extension
buildPathCacheKey(gridVersion, start, goal, costVersion, faction);
```

### 4.3 Hostile wall-attack

When a hostile (predator/raider/saboteur) cannot find a path to its
target AND there is an adjacent WALL or GATE within 1 tile (manhattan):

- Switch to behavior `attack_structure` (new state for animals/saboteurs).
- Apply `BALANCE.wallAttackDamagePerSec * dt` to `tileState.wallHp` of
  the adjacent wall/gate. Multiple hostiles stack damage.
- When `wallHp <= 0`: `mutateTile(state, ix, iz, TILE.RUINS)`. This frees
  the path for everyone (raiders can now path through; colony can also
  walk on RUINS).

Implementation lives in `AnimalAISystem` and `VisitorAISystem` (saboteur
branch).

### 4.4 Auto-suggest gates (UX nicety, optional)

When the player places a wall such that A* fails to find a path between
two warehouses (or worker → nearest warehouse), surface a UI hint
"Walls block your supply route — consider placing a gate". Optional —
implement only if time permits.

---

## 5. Worker AI for construction (BUILDER role)

### 5.1 New state — "construct"

Add `"construct"` to `GROUP_STATE_GRAPH.workers` in
`src/simulation/npc/state/StateGraph.js`. Lock-state: yes (mark in
`TASK_LOCK_STATES` so workers don't flip out during construction).

### 5.2 StatePlanner — BUILDER role

In `deriveWorkerDesiredState`:

- Add a branch: if `worker.role === ROLE.BUILDER` AND `state.constructionSites`
  has at least one site without a builder (or assigned to this worker):
  - `desiredState = atSite ? "construct" : "seek_construct"`
  - reason: `rule:builder`

Insert AFTER the deliver branch and BEFORE the FARM/WOOD/etc. role
branches.

`seek_construct`: behaves like `seek_task` but targets the nearest
unassigned construction site (or the worker's reserved site).

### 5.3 WorkerAISystem.handleConstruct

Add new action handler:

```js
handleConstruct(worker, state, dt, services) {
  const site = findOrReserveBuilderSite(state, worker);
  if (!site) {
    // No site — fall back to deliver/wander
    worker.state = "idle";
    return;
  }
  if (!isAtTile(worker, site.ix, site.iz, state.grid)) {
    setTargetAndPath(worker, { ix: site.ix, iz: site.iz }, state, services);
    return;
  }
  // At site — apply work
  const overlay = state.grid.tileState.get(toIndex(site.ix, site.iz, state.grid.width))?.construction;
  if (!overlay) {
    // Site disappeared (canceled or completed by another builder)
    releaseBuilderSite(state, worker);
    return;
  }
  overlay.workAppliedSec += dt;
  // ConstructionSystem (next system in tick) will check completion
}
```

### 5.4 RoleAssignmentSystem — auto-assign BUILDERs

When `state.constructionSites.length > 0`:

- target BUILDER count = `clamp(ceil(sites * BALANCE.builderPerSite),
  BALANCE.builderMin, BALANCE.builderMax)`.
- Recruit BUILDERs from idle workers (or other roles that have surplus).
- When sites empty, revert BUILDERs to HAUL/idle.

Existing role assignment uses pop bands (`bandTable`). Splice BUILDER in
as a high-priority specialist (above HAUL).

---

## 6. Recruitment system

### 6.1 Replace PopulationGrowthSystem auto-spawn

Rename `PopulationGrowthSystem` → `RecruitmentSystem` (or keep filename
and gut the logic).

Per-tick logic:

1. Tick down `state.controls.recruitCooldownSec` by `dt`.
2. Auto-recruit (if `state.controls.autoRecruit === true`):
   - If current `WORKER` count < `state.controls.recruitTarget`:
   - And food >= `BALANCE.recruitMinFoodBuffer`:
   - And `recruitQueue + currentWorkers < recruitTarget`:
   - Add to `recruitQueue` (don't spawn yet — let cooldown gate it).
3. If `recruitQueue > 0` AND `recruitCooldownSec <= 0` AND
   `food >= recruitFoodCost` AND warehouses exist:
   - Spawn worker (use existing `createWorker`).
   - Deduct `recruitFoodCost` from food.
   - Decrement queue.
   - Set cooldown to `BALANCE.recruitCooldownSec`.
   - Emit `WORKER_BORN` event with `reason: "recruited"`.

### 6.2 UI

Add to BuildToolbar / population panel:

- **Recruit button**: "+1 worker (25 food)" — increments queue.
- **Auto-recruit toggle**: matches `state.controls.autoRecruit`.
- **Recruit target slider**: 0..80 — sets `state.controls.recruitTarget`.
- **Status line**: "Queue: 3 · Cooldown: 12s · Food: 240/25".

Wire into existing `worker target` slider if present (`workerTargetInput`
in BuildToolbar — already in DOM ids).

### 6.3 LLM action — recruit

Add to LLM action vocabulary (next section).

---

## 7. AI integration — LLM + rule fallback

### 7.1 New action types in plan steps

`src/simulation/ai/colony/ColonyPlanner.js` and `PlanExecutor.js`:

```js
// VALID_BUILD_TYPES additions:
const VALID_BUILD_TYPES = new Set([
  ...Object.keys(BUILD_COST),  // includes new "gate"
  "reassign_role",
  "demolish",                  // NEW
  "recruit",                   // NEW
]);
```

#### `demolish` action shape

```js
{
  id: "step-3",
  action: { type: "demolish", hint: "<ix>,<iz>" | "ruins_cluster" | "depleted_farm" },
  reason: "Clear ruins to free up tile",
  depends_on: [],
}
```

Cost: `BALANCE.demolishToolCost` (1 wood). The grounded tile must contain
a built structure or RUINS. Affordance score uses cost vs resources.

PlanExecutor: when grounded, calls `buildSystem.placeToolAt(state,
"erase", ix, iz, { recordHistory: false, services, owner: "ai-llm" })`.

#### `recruit` action shape

```js
{
  id: "step-1",
  action: { type: "recruit", count: 2 },
  reason: "Population behind food curve",
  depends_on: [],
}
```

PlanExecutor: increments `state.controls.recruitQueue` by `count`
(clamped to `BALANCE.recruitMaxQueueSize`).

### 7.2 ResponseSchema validation

In `ResponseSchema.js`, the LLM's plan response is currently a group
policy (intentWeights). The build plan goes through `ColonyPlanner` (its
own validator). Add validation in **ColonyPlanner**'s sanitize pass:

- `step.action.type === "demolish"` → require `hint` is a valid coord
  string or whitelisted keyword.
- `step.action.type === "recruit"` → require `count` is integer 1..10.

### 7.3 Rule fallback (ColonyPlanner.generateFallbackPlan)

Add fallback generation rules:

- **Demolish ruins**: if `ruinsCount > 5` and at least one ruin is
  adjacent to a road or warehouse, emit a demolish step targeting the
  oldest ruin.
- **Demolish depleted producer**: if a FARM has been fallow for >2 cycles
  AND there's a fresh fertile tile nearby, emit demolish + new build.
- **Recruit**: if `food > recruitMinFoodBuffer + 30` AND
  `currentWorkers < recruitTarget` AND not in foodRecoveryMode, emit
  `recruit { count: 1..2 }`.

### 7.4 System prompt update

Add to `SYSTEM_PROMPT` in ColonyPlanner.js:

```text
- demolish (1 wood) — clears a built structure or RUINS for salvage. Use
  to remove depleted/abandoned worksites that block better placement.
  Hint: "ruins_cluster", "depleted_farm", or "<ix>,<iz>".
- recruit { count } (no tile, no wood; food cost paid by RecruitmentSystem)
  — request <count> new workers. Use when food rate is positive and
  population is below the colony's recruit target. Recruits arrive
  spaced by cooldown.
- gate (4 wood + 1 stone) — passable doorway in walls. Hostiles cannot
  cross. Use to keep supply lines open through wall lines. Hint:
  "<ix>,<iz>" inside or adjacent to a wall line.
```

And to "Hard Rules":

```text
- Do not stack walls without gates — colony pathing will be blocked.
- Demolish RUINS that have been salvaged or that block road expansion.
- Match recruit count to food surplus: never recruit when food rate < 0.
```

### 7.5 Faction propagation for AStar in PlanExecutor

When PlanExecutor uses A* for placement reasoning (it does: see
`RoadPlanner.planLogisticsRoadSteps` calls), pass `faction: "colony"` so
walls/gates are respected appropriately.

---

## 8. Rendering (SceneRenderer)

### 8.1 Construction blueprint rendering

For each entry in `state.constructionSites`:

- Render the **target tile** at the site's (ix, iz) with:
  - Material opacity = 0.35..0.55 (semi-transparent).
  - Optional emissive color tint (cyan for build, red for demolish).
- Above the tile, render a **progress bar** (small horizontal billboard
  or 2D HUD overlay):
  - Width = full tile width.
  - Fill = `workAppliedSec / workTotalSec`.
  - Color: gold for build, red for demolish.

### 8.2 Wall HP indicator

For WALL tiles where `wallHp < wallMaxHp`:

- Tint or saturate the wall mesh (more red as HP drops).
- Optional: small chip texture.

### 8.3 Gate render

Distinct mesh from WALL — opening/door asset. Color from TILE_INFO.GATE.

### 8.4 Test-only fast path

When tests construct a state without a real renderer, skip — these are
DOM-detected. Existing renderer guards apply.

---

## 9. Migration and test compatibility

### 9.1 Build tests using `instant: true`

Tests that build a structure and immediately assert state:

```js
buildSystem.placeToolAt(state, "warehouse", 5, 5, { instant: true });
```

Tests should opt in to the instant path. Most existing tests can be
updated by adding this flag in their fixture / helper. Provide a helper:

```js
// test/helpers/build.js
export function placeBuildingInstant(state, tool, ix, iz, options = {}) {
  return buildSystem.placeToolAt(state, tool, ix, iz, { ...options, instant: true });
}
```

### 9.2 Population tests

Tests that rely on auto-reproduction must set
`state.controls.autoRecruit = true` and `state.controls.recruitTarget =
80` in their fixture. Update `createTestState()` (or wherever) to default
these in test mode.

### 9.3 Event filtering

`BUILDING_PLACED` now fires with two phases — `blueprint` and `complete`.
Listeners that count "buildings placed" should filter by `phase ===
"complete"` to preserve old semantics.

`BUILDING_DESTROYED` fires with `blueprint-cancel` and `complete`. Same
filter pattern.

---

## 10. SYSTEM_ORDER changes

Insert `ConstructionSystem` after `WorkerAISystem`:

```js
"WorkerAISystem",
"ConstructionSystem",   // NEW — checks build/demolish completion
"VisitorAISystem",
// ...
```

`PopulationGrowthSystem` → `RecruitmentSystem` (rename in SYSTEM_ORDER).

---

## 11. File ownership map (per agent)

To minimize merge conflicts, each agent owns these files. Where two
agents must touch the same file, agent **C** (construction) is the
arbiter — others coordinate through it.

### Agent A — Construction-in-progress (owner of)

- `src/simulation/construction/ConstructionSystem.js` (new)
- `src/simulation/construction/ConstructionSites.js` (new helper)
- `src/simulation/construction/BuildSystem.js` — modify placeToolAt for blueprint mode + cancelBlueprint
- `src/simulation/construction/BuildAdvisor.js` — small additions for gate tool info, demolish overlay awareness
- `src/simulation/npc/WorkerAISystem.js` — add handleConstruct
- `src/simulation/npc/state/StateGraph.js` — add "construct", "seek_construct"
- `src/simulation/npc/state/StatePlanner.js` — add BUILDER branch
- `src/simulation/population/RoleAssignmentSystem.js` — auto-assign BUILDER
- `src/render/SceneRenderer.js` — blueprint rendering + progress bar
- `src/config/constants.js` — add ROLE.BUILDER
- `src/config/balance.js` — add constructionWorkSec, demolishWorkSec, builderPerSite, etc.
- `src/config/constants.js` — add SYSTEM_ORDER entry for ConstructionSystem
- `test/construction-in-progress.test.js` (new)
- `test/helpers/build.js` (new) — `placeBuildingInstant`

### Agent B — Demolish (UI + AI)

- `src/ui/tools/BuildToolbar.js` — surface erase as Demolish button (label, tooltip, sync)
- `src/simulation/ai/colony/ColonyPlanner.js` — add demolish action validator + fallback
- `src/simulation/ai/colony/PlanExecutor.js` — handle demolish action type
- `src/simulation/ai/llm/ResponseSchema.js` — accept demolish in plan
- `src/simulation/ai/llm/Guardrails.js` — sanity-check demolish targets
- `src/simulation/ai/llm/PromptBuilder.js` — add demolish to SYSTEM_PROMPT (in PromptBuilder if it references the system prompt; otherwise also touch ColonyPlanner SYSTEM_PROMPT)
- `test/demolish-action.test.js` (new)

### Agent C — Strategic walls + GATE

- `src/config/constants.js` — add TILE.GATE, TILE_INFO[GATE]
- `src/world/grid/TileTypes.js` — add gate tool→tile mapping
- `src/simulation/construction/BuildAdvisor.js` — add gate to TOOL_INFO + allowedOldTypes (must extend from wall)
- `src/config/balance.js` — wallMaxHp, wallAttackDamagePerSec, gateCost, BUILD_COST.gate, BUILD_COST_ESCALATOR.gate
- `src/simulation/navigation/Faction.js` (new) — `getEntityFaction`, `isTilePassableForFaction`
- `src/simulation/navigation/AStar.js` — accept options.faction; replace `tileInfo.passable` check
- `src/simulation/navigation/Navigation.js` — pass faction into A*
- `src/simulation/navigation/PathCache.js` — include faction in cache key
- `src/simulation/npc/AnimalAISystem.js` — predator faction + wall-attack behavior
- `src/simulation/npc/VisitorAISystem.js` — saboteur faction + wall-attack behavior
- `src/render/SceneRenderer.js` — render GATE distinctly + wall HP tint
- `src/render/ProceduralTileTextures.js` — gate texture
- `test/gate-faction-pathing.test.js` (new)
- `test/wall-hp-attack.test.js` (new)

### Agent D — Recruitment

- `src/simulation/population/PopulationGrowthSystem.js` — rewrite as RecruitmentSystem
- `src/config/constants.js` — update SYSTEM_ORDER entry name (if changed)
- `src/config/balance.js` — recruitFoodCost, recruitCooldownSec, recruitMaxQueueSize, recruitMinFoodBuffer
- `src/ui/tools/BuildToolbar.js` — recruit button, auto-recruit toggle, recruit target slider, status line
- `src/simulation/ai/colony/ColonyPlanner.js` — recruit action validator + fallback
- `src/simulation/ai/colony/PlanExecutor.js` — handle recruit action type
- `src/simulation/ai/llm/ResponseSchema.js` — accept recruit in plan
- `src/simulation/ai/llm/PromptBuilder.js` / `ColonyPlanner.SYSTEM_PROMPT` — document recruit action
- `src/entities/EntityFactory.js` — initialize `state.controls.recruitTarget`, `recruitQueue`, `autoRecruit`, `recruitCooldownSec`
- `test/recruitment-system.test.js` (new)

### Shared/coordination

- `CHANGELOG.md` — each agent appends an entry under v0.8.4 unreleased
- `src/config/constants.js` — multiple agents touch this; keep diff small
  and **only** add new TILE / ROLE / SYSTEM_ORDER entries (no existing
  edits)
- `src/config/balance.js` — multiple agents touch this; only **add new
  fields** at end of BALANCE block (no existing edits)
- `src/ui/tools/BuildToolbar.js` — agents B + D both touch; coordinate
  via clear function-level boundaries (B owns demolish-tool surfacing; D
  owns recruit panel)

---

## 12. CHANGELOG entries (template)

Under `v0.8.4 (unreleased) - Building Lifecycle, Walls, Recruitment`:

- Add: TILE.GATE — passable doorway, faction-blocked for hostiles
- Add: ROLE.BUILDER — workers who construct/demolish blueprints
- Add: ConstructionSystem — workers must travel to and labor at sites
- Add: tileState.construction overlay — blueprint state on per-tile
- Add: state.constructionSites — fast index for AI/UI
- Add: tileState.wallHp + raider wall-attack — walls can be attacked
- Add: BALANCE.constructionWorkSec, demolishWorkSec, recruitFoodCost, etc.
- Change: BuildSystem.placeToolAt now blueprint-mode by default; tests use `{ instant: true }`
- Change: PopulationGrowthSystem → RecruitmentSystem; no auto-reproduction
- Change: AStar accepts `options.faction`; PathCache key includes faction
- Add: LLM action types `demolish`, `recruit`; rule fallback supports both
- Add: SceneRenderer renders blueprints semi-transparent + progress bars

---

## 13. Acceptance criteria

- All new and existing tests pass: `node --test test/*.test.js`
- A 5-min benchmark run completes without throwing.
- Manual smoke (in dev server):
  - Place a warehouse → blueprint appears, semi-transparent, progress
    bar fills as workers labor; on completion, tile becomes WAREHOUSE.
  - Place walls + gate; verify worker passes gate but raider is blocked.
  - Click Demolish on a built structure; verify it disappears after the
    construction-time, with salvage refund.
  - Click Recruit (+1); verify a new worker spawns within 30s if food
    available.
  - LLM run (or fallback): verify demolish/recruit actions show up in
    AIDecisionPanel within 5 minutes.
