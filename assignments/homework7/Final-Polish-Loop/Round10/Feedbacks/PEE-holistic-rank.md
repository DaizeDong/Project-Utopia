# PEE — Holistic Playability Rank (R10, blind)

**Build under test:** HEAD `d2a83b5` (R9 PZ ship), Round 10 freeze.
**Method:** Cold-start in real browser (Chromium via Playwright @ http://localhost:19090/), Temperate Plains / Broken Frontier scenario, default seed. Manual play through opening (warehouse + 3 farms + roads), then idle observation through ~70s sim time. AI Storyteller in fallback mode.

---

## Score: **5.0 / 10** (Δ vs R9 PZ 4.5 = **+0.5**)

The slide stays arrested. R10 cleanly extends R9's first-arrest with two visible wins — a recognizable, narratable opening loop and a Storyteller voice that finally ties combat events to colony state ("Someone fell, but the colony holds. Steady the line"). The fundamentals are there. But the holistic experience is still capped under 6 because three of R10's four targeted issues (game-over readability, recruit, combat, road/bridge) only got *partial* credit in actual play, and a perf regression on idle (FPS 14 → 1.5 at 70s) is a new visible drop.

**Why +0.5 and not +1.0:** R10 fixed the things R9 left exposed (recruit queue UI is now legible, combat narration lands, saboteur deaths attribute correctly to "killed-by-worker"), but didn't lift the *opening confusion* ceiling — the scenario hint says "rebuild the east warehouse" yet placing a warehouse on the depot tile leaves `frontier.unreadyDepots: ['east ruined depot']` unsatisfied. That's the same "I did the thing the briefing asked, why isn't it counted?" feel that capped R8 at 4.0.

---

## Most frustrating moment

**Built-but-not-counted scenario goal.** Briefing: *"clear a path back, then rebuild the east warehouse."* I placed `warehouse` at (53,36) — toast reads "Warehouse at (53,36) creates the first delivery anchor for the colony" — successful blueprint, builders mobilized, structure completes. Yet 70 simulated seconds later, telemetry still reports `frontier.connectedRoutes: 0/1`, `readyDepots: 0/1`, `unreadyDepots: ['east ruined depot']`. The scenario completion criterion is invisible to the player — there's no on-map ghost / outline / pulse on the *exact* tile the scenario expects, no "depot 70%" progress bar, nothing that says "needs to be built ON this specific ruin tile, not adjacent." This is the single biggest holistic-fun killer in the freeze: the **game tells me what to do but doesn't tell me when I've done it.**

Compounding it: the action toast then says *"First extra Warehouse raised: The logistics net has a second anchor"* — calling my **only** warehouse the "extra" one. Strongly implies the scenario already counts a phantom warehouse somewhere, which gaslights the player.

## Most satisfying moment

**The Storyteller line after the first saboteur kill.** A roaming saboteur "Thorne-14" engages, a worker (Marek Grove) goes Combat/Engage in the entity panel, and the top banner says *"Last: Thorne-14, roaming saboteur, died of killed-by-worker near (16,31) (12s ago)"* — then the Colony tab AI Storyteller card updates to *"DIRECTOR picks rebuild the broken supply lane: Someone fell, but the colony holds. Steady the line."* Cause → effect → narration → strategic redirect, all in one beat, all human-readable. This is the moment R10 most clearly out-feels R9 — saboteur combat is no longer just a number ticking in the threat bar; it has a name, a place, a verdict, and a colony-level reaction. **Genuinely satisfying.**

---

## Top 3 fun-lifts (in-freeze, no code changes)

1. **Add a faint outline / "BUILD HERE" pulse on the literal scenario-goal tiles** (the east-ruined-depot ruin tile and the west-lumber-route gap tile). The labels exist as floating text already; adding a 1-tile cyan ring on the *exact* scenario-target tile would close the gap between "the briefing told me what to do" and "I know I've done it." This single change would lift the score by another full point — it's the entire frustration moment above.

2. **Rename the "+1 Worker (25 food)" auto-checkbox row from `Auto · Queue: 1 · Cooldown: 0s · Food: 312/25`** to something with a human verb: `Auto-recruit when food ≥ 25 (next: ready)`. The current label is a debug dump that reads as five disconnected facts; the player has to mentally join them to learn "yes, recruits will keep coming." With Auto on and 312 food on hand, the player should *feel* "growth is on autopilot," not have to parse a status line.

3. **Surface the scenario-goal completion state in the top banner**, next to "Run 00:01:09." A simple "**Frontier 0/2 ✕ depot ✕ route**" pill that ticks to "**Frontier 1/2 ✓ depot ✕ route**" the moment the warehouse-on-ruin is recognized. Right now the only way to know progress is to open the Colony tab AND read the Storyteller prose AND reverse-engineer it. Promote it to the chrome where the run timer lives — the Best Runs board already shows "loss" verdicts there, so the affordance exists.

---

## Quick perf note (out-of-rubric, flagging for next round)

FPS measurements during the run: t=0:04 → 6.5fps (boot), t=0:42 → 54fps (active play), t=1:00 → 14fps (idle), t=1:09 → 1.5fps (continued idle). The order-of-magnitude drop on idle suggests the renderer is not throttling correctly when the tab loses focus or when no entities move (browser may have been backgrounded). Worth a parallel investigation in R11 — this *would* be a frustration moment for a real player who tabs away to read Discord and tabs back to a slideshow.
