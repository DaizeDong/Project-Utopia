# Two CG Pillars — Deep Dive

This file is the **technical-detail companion** to `PRESENTATION-SCRIPT.md`. Use it for slides, Q&A reference, or hand-out.

---

## Pillar 1 — NPC AI

### The challenge

Every entity in the world (workers, visitors, animals) is an autonomous agent. They need to:

- Continuously evaluate their own state (hunger, carry, role, surroundings)
- Choose among many possible behaviors (harvest, deliver, build, eat, fight, rest)
- React to global colony state (food shortage, raid incoming, blueprint placed)
- Be **interpretable** — the player can click any agent and understand "why is this one wandering?"

The a1.md proposal: **Behavior Trees with a shared blackboard**. The player would not micromanage; instead a "lightweight resource manager" would assign roles, and BT-driven workers would execute.

### Why we shipped a different shape

Behavior Trees express **conditional branching** very well: "if hungry → eat; else if carrying → deliver; else → harvest." But our actual problem turned out to be **transition-driven**, not condition-driven:

- A HARVESTING worker doesn't ask "should I be HARVESTING?" every tick — that's wasteful re-evaluation
- A worker mid-deposit who suddenly sees a saboteur 2 tiles away needs to **interrupt** and FIGHT
- An LLM-issued plan saying "build a quarry" doesn't change the worker's tree; it changes what targets are available

So the shape we needed was a **flat priority-ordered FSM** where each state owns its transitions, and the dispatcher picks the highest-priority transition whose `when()` predicate fires.

### Architecture

**File: `src/simulation/npc/PriorityFSM.js` (~125 LOC)**

```js
export class PriorityFSM {
  constructor({ states, transitions, initialState, displayLabels }) { ... }

  tick(entity, state, services) {
    const fsm = entity.fsm;
    const transitionsForState = this.transitions[fsm.state];
    for (const transition of transitionsForState) {  // priority-ordered
      if (transition.when(entity, state, services)) {
        this.#exit(entity, state, services);
        fsm.state = transition.to;
        this.#enter(entity, state, services);
        break;
      }
    }
    this.states[fsm.state].tick(entity, state, services);
  }
}
```

**12 worker states** (`src/simulation/npc/fsm/WorkerStates.js`):

```
IDLE
SEEKING_HARVEST → HARVESTING → DELIVERING → DEPOSITING
SEEKING_BUILD → BUILDING
SEEKING_PROCESS → PROCESSING
SEEKING_REST → RESTING
FIGHTING
```

**Each transition is a priority + when + to:**

```js
COMBAT_PREEMPT: {
  priority: 1,  // highest — preempts everything
  when: (e, s) => hostileInAggroRadius(e, s),
  to: "FIGHTING"
},
SURVIVAL_EAT: {
  priority: 2,
  when: (e, s) => e.hunger < 0.15 && e.carry.food > 0,
  to: "EATING"  // (R9 added carry-eat survival bypass)
},
...
```

Result: a HARVESTING worker can transition straight to FIGHTING when a wolf walks into aggro range, no matter what state they were in.

### LLM integration

The colony has a **two-layer AI**:

- **High level (LLM)** — `/api/ai/plan` endpoint hits a real GPT-class model with a JSON-summarized world state. Model returns a structured plan: `[{action: "build", type: "quarry", priority: 90}, {action: "recruit", role: "BUILDER"}, ...]`. We use `gpt-5.4-nano` via OpenAI direct API.

- **Low level (FSM)** — workers execute. The LLM never moves a worker directly; it just changes priorities and what's enqueued in `state.constructionSites`. The FSM picks the next available work tile.

A **rule-based fallback director** (`ColonyDirectorSystem.js`) emits the same shape of plan when the LLM is offline, unreachable, or the player toggles autopilot off. So gameplay never depends on network.

### Numbers

| metric | value |
|---|---|
| FSM states | 12 worker + 9 visitor (R5 wave-3.5 migration) + 5 animal (legacy StatePlanner) |
| Dispatcher LOC | 125 (PriorityFSM.js generic class) + 55 (WorkerFSM.js facade) |
| Transitions | 38 worker priority-ordered transition rules |
| Tests | 60+ FSM/transition/contract tests |
| Real LLM round-trip | ~1.5–3s; planner runs on a 0.5s sim-time cadence gate |
| Fallback director | matches LLM plan shape; deterministic |

### Two interesting bug stories (Q&A material)

**Bug 1 — "BUILDER never claims sites"** (R8). Workers visibly idled while red blueprints sat un-built. Root cause was a 4-second `roleChangeCooldownSec` I had added in R5 to prevent role-thrash. It blocked FARM→BUILDER promotion forever once a worker had been FARM. Fix: bypass cooldown when sites are unclaimed. **The bug took 3 rounds and 100+ commits to surface** — a self-inflicted regression caught only by playtest.

**Bug 2 — "MortalitySystem.recomputeCombatMetrics() runs only on death tick"** (R5). Live raiders walking into the colony were invisible to the role allocator because the metrics that drive GUARD draft only refreshed when something died. Workers didn't fight; they just got eaten. One-line fix; hours to find.

---

## Pillar 2 — Pathfinding & Navigation

### The challenge

Workers walk on a **96×72 = 6912-tile grid**. The path needs to:

- Avoid impassable terrain (water without a bridge, walls)
- Cost realistic effort (mountains slower than roads; bridges expensive but valuable)
- Avoid colliding with other workers and animals **without breaking the path**
- Adapt to fog-of-war (don't path through unrevealed terrain when planning autopilot builds)

a1.md committed to: **A\*** for global routes + **Boids** for local steering.

### Layer 1: A*

Standard 8-neighbor A* on the tile grid. Cost weighting from `TILE_INFO`:

```
GRASS    1.0   passable: true
ROAD     0.5   (faster = preferred)
BRIDGE   0.7
WATER    Infinity if !allowBridge, else 2.0
WALL     blocked unless faction-ally
```

The **interesting part** isn't the A* algorithm — it's how the colony director uses it.

### The "dual-search bridge interleave" problem

If you mark WATER as impassable, the road planner refuses to plan across rivers — even when a 3-tile bridge would save 20 tiles of detour. If you mark WATER as low-cost, the planner routes through water everywhere with no awareness that "this requires a building you haven't built yet."

**Solution (R10 PDD):** dual-search.

```js
function planRoadConnections(grid, fromIx, fromIz, toIx, toIz, options) {
  const noBridgePath  = roadAStar(grid, ..., { allowBridge: false });
  const withBridge    = roadAStar(grid, ..., { allowBridge: true  });
  if (!noBridgePath) return withBridge;
  if (!withBridge)   return noBridgePath;

  const TRAFFIC_AMORTIZATION = 50;  // assumed round trips per route lifetime
  const scoreNoBridge = noBridgePath.length;  // pure traversal
  const scoreWithBridge =
    withBridge.length +
    (withBridge.bridgeCount * BRIDGE_BUILD_COST) / TRAFFIC_AMORTIZATION;

  return scoreWithBridge < scoreNoBridge ? withBridge : noBridgePath;
}
```

So a 3-tile bridge saves ~20 traversal-tile-rounds × 50 trips = 1000 worker-traversal units, justifying ~50 build-cost units = clear win. A 1-tile bridge that saves 2 detour tiles is **not** a win unless traffic is heavy.

### The BridgeProposer

A separate system (`src/simulation/ai/colony/proposers/BridgeProposer.js`) scans the map for **shoreline pairs** within a 8-tile radius where a multi-tile bridge would close a gap. It's not just "1-tile pinch points" — it can propose 2-, 3-, even 4-tile bridge sequences.

```
DETOUR_RATIO_THRESHOLD = 1.5  // bridge proposed only if land-detour is 1.5x longer
RADIUS_TILES = 8              // shoreline-pair search radius
```

The proposer plugs into the BuildProposer registry (the same architectural pattern as Plan-A or Plan-B for "we need a farm" — see `BuildProposer.js`).

### Layer 2: Boids

Standard 3-rule Boids: **separation**, **alignment**, **cohesion** + a **path-following** pull toward the next tile center. Implemented in `src/simulation/movement/BoidsSystem.js`.

The **interesting part** here is the path-dampening:

```js
const sepWeight =
  (entity.path && entity.pathIndex < entity.path.length)
    ? 0.35  // worker on a path: dampen to let A* dominate
    : 1.0;  // animal/no-path entity: full Boids
```

Without this, a 12-worker convoy on a road jitters as separation pushes them aside and path-following snaps them back. With it, workers flow in single file along roads (visible in-game as **convoys**).

### Layer 3: Fog-aware planning (R13)

The colony director's BuildProposer now consults `VisibilitySystem.isTileExplored(grid, tx, tz)` before placing a blueprint. If all candidate tiles for a needed building are fogged:

```js
state.ai.scoutNeeded = true;
```

Workers in IDLE state then bias their wander toward fog-edge tiles using a `pickFogEdgeTileNear` helper, scouting the map. So the LLM saying "build a quarry near stone" can't succeed until workers have revealed where the stone is — the same constraint a player faces.

### Numbers

| metric | value |
|---|---|
| Grid size | 96 × 72 = 6912 tiles |
| Tile types | 14 (GRASS / ROAD / WATER / FOREST / ... / BRIDGE / GATE) |
| A* algorithm | Standard 8-neighbor with cost-weighted heuristic |
| Boids weights | sep 1.0 (or 0.35 on path) + align 0.6 + coh 0.4 + seek 1.2 |
| Bridge interleave | Dual-search with TRAFFIC_AMORTIZATION = 50 |
| BridgeProposer scan radius | 8 tiles, DETOUR_RATIO_THRESHOLD = 1.5× |

### Demo flag for talk

To show this convincingly, **regenerate to Archipelago Isles before talk** (lots of water, immediate bridge demos). Or use the dev panel (`?dev=1`) to spawn workers and watch them path through bridges.

---

## Cross-pillar integration story

The two pillars **compose**:

1. LLM (Pillar 1) decides "build a quarry near the stone cluster"
2. BuildProposer checks visibility (Pillar 2 fog gate); if hidden, sets `scoutNeeded`
3. Workers' FSM (Pillar 1) IDLE.tick reads `scoutNeeded`, biases toward fog edges (Pillar 2)
4. Once revealed, BuildProposer proposes a quarry blueprint
5. BUILDER worker's SEEKING_BUILD state runs A* (Pillar 2) to plan the path
6. On the road, separation drops to 0.35× (Pillar 2 dampening), Boids (Pillar 2 local steering) handles other workers
7. On site, FSM transitions to BUILDING (Pillar 1)
8. If a saboteur appears mid-walk, COMBAT_PREEMPT (Pillar 1 priority transition) fires immediately

The pillars aren't separate features. They're **the same system seen from two angles**.

---

## What we did NOT ship (be honest if asked)

- **Audio**: zero audio elements in the build. Frozen by HW7 design (no new asset). Documented in Post-Mortem §4.5.
- **Multiplayer**: explicit a1.md "won't have"
- **Day-night lighting**: shipped as parameter modulation of existing AmbientLight + DirectionalLight (R1+R2 lighting tint). No shadow rig, no sun mesh.
- **Walk-cycle animation**: workers are spheres without skeletal animation. Faded motion trails (R11 PHH) added to suggest movement.
- **AnimalAI is still on legacy StatePlanner** — wave-4 migration deferred to HW8. Worker + Visitor migrated to PriorityFSM successfully.
- **2 Grade-D systems still pending refactor**: ColonyPlanner.js (1884 LOC) + ColonyPerceiver.js (1970 LOC) — known debt. Documented in C1 reviews across all 13 rounds.
