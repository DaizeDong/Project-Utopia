# Slide Outline (10 slides, optional)

If you decide to use slides instead of pure live demo. Each slide has a title + 3-5 bullets + a suggested visual. Speaker notes match `PRESENTATION-SCRIPT.md`.

---

## Slide 1 — Title

**Visual**: hero screenshot of colony with workers, bridges, fog edge

> **Project Utopia**
> Indie colony simulation with autonomous agents
>
> Daize Dong · NetID dd1376 · Solo project
> CG pillars: NPC AI · Pathfinding & Navigation
> github.com/DaizeDong/Project-Utopia

---

## Slide 2 — What it is

**Visual**: split — left: gameplay screenshot with Inspector open; right: pillar list from a1.md

- Minimalist colony sim — simple spheres on 96×72 tile grid
- Player builds infrastructure + sets priorities; **agents execute**
- 12+ autonomous workers, visitors, herds, predators
- Three pillars (a1.md): NPC AI · Boids · A* Pathfinding
- Talk covers two: NPC AI deep-dive + Pathfinding (which integrates Boids)

---

## Slide 3 — Pillar 1: NPC AI — The challenge

**Visual**: Inspector panel screenshot with worker FSM state visible

> "Workers must be **autonomous** and **interpretable**"

- Each agent decides: harvest? deliver? build? eat? fight?
- Player should be able to click any agent → see why it's doing what it's doing
- Original spec (a1.md): **Behavior Trees** with shared blackboard
- Built it. Realized BT was the wrong shape for our problem.

---

## Slide 4 — Pillar 1: PriorityFSM (the actual ship)

**Visual**: simplified state diagram — 12 states + arrows

> "BT asks 'what to do given conditions'. FSM asks 'what transitions can fire from current state'."

- 12 named worker states (IDLE, HARVESTING, DELIVERING, FIGHTING, ...)
- Each state has **priority-ordered transition list**
- COMBAT_PREEMPT priority 1 → preempts anything (e.g., HARVESTING → FIGHTING when wolf in range)
- 125-LOC generic dispatcher hosts both Worker + Visitor AI
- Same FSM execution layer below LLM **and** rule-based fallback director
- LLM emits *intents* (build a quarry); FSM picks up the work

---

## Slide 5 — Pillar 1: Cool result

**Visual**: animated GIF or screenshot of worker entering FIGHTING from HARVESTING

- Inspector panel shows FSM state, intent, hunger, target — fully observable
- LLM (gpt-5.4-nano) issues plans every 0.5s sim-time
- Deterministic fallback director shipping same plan-shape — game runs without network
- Bug we fixed: `roleChangeCooldown` → BUILDER never claims sites; took 6 rounds to surface

---

## Slide 6 — Pillar 2: A* + Boids hybrid — The challenge

**Visual**: archipelago map with workers crossing bridges

> "Workers walk on a grid with water, walls, predators, and other workers. Path needs to **avoid all four** without breaking visual flow."

- A* gives the **route** (which tiles)
- Boids handles **local avoidance** (don't collide with neighbors)
- Two interesting problems:
  1. Bridges across water — when to build?
  2. Boids vs path-following — visible jitter

---

## Slide 7 — Pillar 2: Dual-search bridge interleave

**Visual**: side-by-side — left: A* without bridge (long detour); right: A* with bridge (3-tile shortcut)

```
  noBridgePath  = roadAStar({ allowBridge: false })
  withBridgePath = roadAStar({ allowBridge: true  })

  scoreNoBridge   = noBridgePath.length
  scoreWithBridge = withBridge.length +
                    (bridgeCount × buildCost) / TRAFFIC_AMORTIZATION
                                                ^^ assumed 50 round trips

  return scoreWithBridge < scoreNoBridge ? withBridge : noBridgePath
```

- 3-tile bridge saving 20 detour-tiles × 50 trips = clear win → build
- 1-tile bridge saving 2 detour-tiles → not worth → just walk around
- BridgeProposer scans 8-tile shoreline pairs; proposes multi-tile sequences

---

## Slide 8 — Pillar 2: Boids dampening for convoys

**Visual**: GIF or screenshot of worker convoy on a road

> "Boids vs path-following: separation pushes, path snaps back, jitter."

```js
sepWeight = (entity.path && entity.pathIndex < length)
  ? 0.35  // worker on path: dampened, A* dominates
  : 1.0;  // animal/no-path: full Boids
```

- Result: workers flow in single file along roads
- Animals still scatter organically (deer don't share path semantics)
- **Composes with fog-aware planning**: BuildProposer sets `scoutNeeded` → IDLE workers wander toward fog edge to scout (R13)

---

## Slide 9 — Cross-pillar story

**Visual**: numbered diagram showing the integration loop

1. LLM (Pillar 1) → "build a quarry near stone"
2. BuildProposer (Pillar 2 fog gate) → "stone hidden, scoutNeeded=true"
3. Worker FSM (Pillar 1) IDLE.tick → bias toward fog edge (Pillar 2)
4. Stone revealed → BuildProposer queues quarry blueprint
5. BUILDER FSM (Pillar 1) SEEKING_BUILD → A* path (Pillar 2)
6. On road: Boids (Pillar 2) handles other workers, separation = 0.35×
7. Predator appears mid-walk → COMBAT_PREEMPT (Pillar 1) fires immediately
8. Combat resolved → resume path (Pillar 2)

> "The pillars aren't separate features — they're the same system seen from two angles."

---

## Slide 10 — Takeaways + closing

**Visual**: PROCESS-LOG.md screenshot showing 13 rounds; chart of DevIndex trajectory

**Three takeaways:**

1. **Spec fidelity isn't the goal — design fidelity is.** Pitch said BT, ship was FSM. Same intent, better fit.
2. **Telemetry first, optimization second.** Lost 2 rounds chasing FPS bugs that were Playwright headless RAF caps. Measure your measurement before measuring your subject.
3. **AI agents need hard guardrails, not clever prompts.** Frozen scope, named rollback anchors, file-ownership tracks — these turned subagents from creative-but-flaky into trustworthy.

**Bonus AI-coding insight:** the LLM was best at **bisecting cross-round regressions** — 4-commit binary search over `node scripts/long-horizon-bench.mjs` to trace a 60% regression to a single line of phase-offset math.

> Questions?

---

## Slide deck builder shortcut

If using slides, recommend:

- **Tool**: Google Slides or PowerPoint (works offline if classroom AV is sketchy)
- **Theme**: dark background (matches the game's aesthetic)
- **Font**: monospace for code, sans for body
- **Transitions**: none — instant cuts
- **Total deck**: 10 slides at ~40 sec/slide = 6:40 → 0:20 buffer to 7:00 target
- **Backup**: PDF export — works on any classroom machine

Speaker-notes lines from `PRESENTATION-SCRIPT.md` correspond 1:1 to slides.
