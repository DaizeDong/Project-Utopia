# PHH — Living-System Feel Audit (R11, BLIND)

**Reviewer role:** Living-system-feel inspector. Theme expectation (a1.md): the colony should *feel* alive — moving crowds, organic herds, dynamic visitor pressure, traffic patterns reshaped by player buildings, "flowing convoys along roads."

**Method:** Single live playthrough at preview build (`localhost:19090`, `?dev=1&perftrace=1`). Two colony attempts observed (Temperate Plains seed 160304153 + Archipelago Isles seed 7777 trailer). Autopilot ON at 4x simspeed (effective ~0.4–0.7x — see Gap #2). Total observed sim-time ≈ 1m45s of in-colony life across attempts; real-time ~10 min including reloads. 13 screenshots captured (PHH-01 → PHH-13, in `.playwright-mcp/`). Did not read source — strictly observational.

---

## Per-aspect scores (0–10)

| Aspect | Score | Evidence |
|---|---|---|
| **Worker convoys flowing along roads** | **3 / 10** | Workers move as solitary dots. At 12-worker baseline density I never observed two workers traveling adjacent on a road tile in the same direction. Some clustering occurs *at* construction sites (3–5 workers), but not *along* paths. (PHH-04, PHH-08, PHH-10) |
| **Animal herds — organic gathering / wandering** | **3.5 / 10** | White herbivore-shaped sprites visible on perimeter islands (top of PHH-02 & PHH-06), but they appear solitary and ~static between frames. No visible herding/grazing rhythm. One predator combat event ("Raider-beast-26 killed-by-worker", PHH-05) confirms wildlife is alive — just not *herded*. |
| **Visitors / saboteurs creating dynamic pressure** | **5 / 10** | One Raider-beast spawned and was killed by the colony within ~25 sim-sec. Toast surfaced cleanly. "fallback steering" banner indicates LLM director is dormant the entire run, so no narrative-driven traders/visitors during this window. Pressure exists but is sporadic and lacks visual escalation. |
| **Resource-flow visualisation legibility** | **6.5 / 10** | Heat-lens (L) tiles (red surplus / blue starved) are clear (PHH-07). Floating annotations like *"warehouse idle"*, *"east ruined depot x2"*, *"west lumber route"*, *"west frontier wilds"* explicitly narrate flow state — strong design choice. But there is **no traffic-density overlay** (no breadcrumbs, no per-road usage tint), so "convoys reshape traffic" is asserted, not shown. |
| **Crowd density at warehouses / kitchens during peak** | **3.5 / 10** | Peak observed cluster: ~5 workers around the central construction island at 0:40 (PHH-06). Never witnessed a *crowded* warehouse — workers arrive in 1s and 2s, deposit, leave. The Entity Focus list shows realistic role mix (BUILDERS / GUARDS / FARM / WOOD / STONE / HAUL) but those bodies don't *spatially* cluster. |

**Aggregate living-system score: 4.3 / 10.**

---

## Top-3 living-system gaps (in-freeze polishable)

### Gap 1 — "Convoy" promise unfulfilled at default density
**Symptom.** With 12 workers spread across 4–5 active job sites (farm, wood node, blueprint cluster, depot, warehouse), the spatial law of small numbers means ≤2 workers per route at any moment. No Boids-style flocking is *visually* perceptible — workers look like independent ants, not "flowing crowds." The theme document leans hard on the convoy image; the live result reads as a thin solo-worker simulation.
**In-freeze polish (no balance changes):**
- **Add a fading motion trail** (3–5 tile breadcrumbs, decaying alpha over ~2 sim-sec) on every worker. Even a single worker walking a road would now visibly *paint* the path. This converts sparse motion into apparent flow without spawning entities.
- **Tint road tiles by recent foot traffic** (rolling EWMA of worker-on-tile events, mapped to a warm-amber overlay; cap 5 levels). This is the missing "traffic reshapes patterns" overlay — and it's one shader/canvas pass over the existing road grid.
- Both above are render-only; no AI/sim changes; safe for freeze.

### Gap 2 — Sim throttle (`running ×0.4 (capped)`) makes motion sluggish, killing kinetic feel
**Symptom.** Speed indicator persistently reads `target ×4.0 / running ×0.4 (capped)` (PHH-04, PHH-06, PHH-08, PHH-10). Even at "Fast forward 4x", the colony moves at ~10% of intended pace. This single number is the largest killer of "living system" feel: a colony that *should* bustle instead drifts. Workers crawl between job sites, herds appear frozen, build progress glacially trickles. I suspect a perf cap (frame-budget watchdog?) but it triggers under what should be a featherweight scenario (12 workers, 23 entities total, default Temperate Plains).
**In-freeze polish:**
- Surface a one-line cause hint next to the cap badge: e.g. `"capped: tickMs 18ms > budget 12ms — Boids:8ms"`. Right now the player sees only the symptom, not the cause; a hint converts a confusing UX bug into a transparent perf disclosure. Pure HUD text.
- Optionally raise the cap floor for sub-30-entity scenarios (one constant in the throttle policy) — but this strays into balance and may be deferrable.

### Gap 3 — Wildlife "herd" is currently solitary fauna, not a herd
**Symptom.** I counted 4–6 white herbivore sprites scattered on north-edge islands (PHH-02, PHH-05, PHH-06, PHH-08). Across ~90 sim-sec of observation each remained roughly stationary; none coalesced, and none migrated. Combat (Raider-beast) showed predators *do* engage workers, so the entity layer is wired — but the "organic herd motion" advertised in the theme is absent at default density.
**In-freeze polish:**
- **Render-side herd halo:** when ≥3 herbivores are within 4 tiles of each other, draw a subtle low-alpha "grazing patch" oval underneath. Even with the same individual wandering AI, the player perceives a herd. (Visual gloss only; herds either form occasionally or never, but at least when they do, they read.)
- **Idle-fauna nudge:** if a herbivore has been within 1 tile of its previous position for >30 sim-sec, schedule one wander step. Trivial timer, no AI rewrite, prevents the "frozen sheep" look.

---

## Theme alignment %

Computed from per-aspect scores against the a1.md "living system" pillars (convoys 25%, herds 15%, visitors 15%, flow viz 20%, crowd peaks 25%):

`(3·25 + 3.5·15 + 5·15 + 6.5·20 + 3.5·25) / 1000 = 412.5 / 1000 = **41% theme alignment**`

The strongest pillar (flow viz @ 65%) is what the team built well — heat-lens, named annotations, role-tagged Entity Focus. The weakest pillars (convoys & crowds, both ≈35%) are *render-only* gaps that two render passes (motion trail + road wear tint) could close to ~60%+ without touching simulation. Sim throttle (Gap 2) is the most consequential — until it lifts, every other "alive" promise reads at quarter-speed.

---

## Notes for the freeze

- All three top gaps' polishes are render-layer only (no economy/AI/balance touch), so they are freeze-safe and can land in v0.10.1.
- LLM director was *quiet → fallback steering* the entire run. This isn't a living-system bug per se, but it does mean today's "alive feel" is the *floor* — not the ceiling.
- One soft positive: the *narrative toast* layer ("The colony breathes again. Rebuild your routes…", PHH-06; "Scrappy outpost, still finding its rhythm", PHH-10) genuinely contributes to system-feel. Don't lose those in any HUD trim pass.

— PHH (BLIND audit)
