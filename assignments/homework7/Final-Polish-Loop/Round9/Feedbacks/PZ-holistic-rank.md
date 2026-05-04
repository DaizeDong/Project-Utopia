# PZ — Playability Holistic Rank (R9, BLIND)

## Score
**4.5 / 10**  ·  Δ vs R8 PU 4.0 = **+0.5**

First arrest of the slide since R5 (PF 5.5 → PK 5.0 → PO 4.5 → PU 4.0 → **PZ 4.5**). The trend is broken but only barely; the rise is purely on the back of two transparency lifts (per-worker Food Diagnostic + Policy Notes / "Why is this worker doing this?") that finally tell me *why* the colony is failing. The underlying playability is still broken: autopilot fails the very task its own diagnostic flags, and the engine is wall-clock starved.

## Most Frustrating Moment
**Autopilot reads its own diagnostic and ignores it.** Within 14 in-game seconds the inspector pinned the Food Diagnostic in red: *"Food exists, but there is no warehouse access point. Next: Build or reconnect a warehouse so workers have a reachable eating target."* That message stayed pinned, unchanged, for the entire run (still showing at 1:18). Meanwhile the Director's own Policy Focus reads "rebuild the broken supply lane" and queues a Lumber camp instead of a Warehouse. The game tells me what's wrong, the AI agrees in writing, and then refuses to do it. Watching food drift 318 → 288 with no warehouse rebuilt while 3 builders sit "Idle/BUILDER · Wander · a bit hungry" is the most annoying single moment I have logged across PF–PZ — it's strictly worse than blind failure because the loop has the awareness baked in.

**Honourable mention — engine capped at 0.5–0.6×.** The footer's `target ×8.0 / running ×0.6 (capped)` is honest, which is good, but it means an "8x" ultra-speed survival run actually moves at *just over half* real-time. ~6 real minutes for 1:18 of game time. That is unshippable for a survival sim where the pitch is "see how long you last." A 30-minute leaderboard run is a 90+ minute real session. Killer for ranking-loop fun.

## Most Satisfying Moment
**Per-worker "Food Diagnosis" + "Why is this worker doing this?" panel.** Brand new since R8. Click any worker and you get: Policy Focus ("rebuild the broken supply lane"), 2–3 Policy Notes that read like actual director reasoning ("Broken routes mean workers should favor sites that reconnect or shorten logistics", "Depot congestion is real, so steering should reduce cargo stalls"), Food Diagnosis with a concrete *Next* action, plus Hunger %, Carry, State, Intent, and Health. This is the single biggest legibility lift since R3. R8 told me the colony was healthier (DevIndex +148.7%) but couldn't tell me *why*; R9 finally explains itself. If the AI obeyed the diagnostic, this alone would lift the score by another full point.

Honourable mention: combat works cleanly (Wolf-26, Bear-25, Harrow-16 saboteur all dispatched by workers in the opening 90 seconds with a clean toast each, no stuck combat states observed) and the new POI reveals ("traffic hotspot", "west frontier wilds", `east ruined depot ×3` count) make the map feel alive on first contact.

## Top 3 Fun-Lifts (in-freeze, code-freeze friendly)

1. **Wire Director queue to its own Food Diagnostic.** When `worker.diagnostic === "no warehouse access point"` is true for ≥N workers (e.g. ≥30% of pop) for ≥10s, autopilot must promote a Warehouse blueprint to top of the build queue, ahead of any Lumber/Farm/processing tier. Pure priority-table edit — no new systems, no new art. This is the difference between a 4.5 and a 6.5: the diagnostic already ships, the AI just needs to read its own writing. Zero risk, single file change in `ColonyPlanner` / autopilot priority weights.

2. **Honest speed cap + a "Sprint to Day 5" seek button.** Either un-cap ultra-speed (profile what's actually budget-bound — the snapshot shows 0 console errors and only 12 workers, so it's almost certainly the LLM round-trip on the autopilot path, not sim cost) OR add a "skip ahead 5 minutes / 1 day / next event" button that runs the sim headless-fast and only re-enters render at a checkpoint. Survival-mode pitch dies if a 30-minute run takes 90 real minutes. Even a `running ×2.0` cap instead of `×0.6` would double scoreboard throughput overnight.

3. **Sticky toast for "no warehouse" emergency.** The first-build briefing already says "build a warehouse on the broken east platform" — but once the run starts, that hint vanishes and the only signal that no one rebuilt it is buried in the per-worker inspector. Promote the Food Diagnostic to a top-bar amber chip (next to the existing "Autopilot ON · llm/llm" chip): `⚠ No warehouse · workers can't eat from stockpile`. Reuses the existing chip component. Closes the loop between "game knows what's wrong" and "player notices what's wrong" without requiring the autopilot fix from #1 — a manually-playing player still benefits.

## Net Read
R9 fixes the *legibility* gap (R8's biggest remaining sin per the PU report) but exposes the *agency* gap underneath: the AI now narrates its failures in plain English. That's a strict improvement over R8 silently failing, but it's only worth +0.5 because narrating a fire isn't putting it out. Fix-list item #1 is the cheapest 2-point lift in the entire PF–PZ window.
