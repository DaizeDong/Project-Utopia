# Presentation Script — Project Utopia

**Total target**: 7:00 (5–8 min window with 1-min buffer)
**Delivery style**: speak conversationally, don't read line-by-line; bracketed `[stage direction]` is your cue, not your line.

---

## §1 — Intro & How It Works (1:30)

> *[Open game on screen — splash visible]*

"Hi, I'm Daize, NetID dd1376, solo project. This is **Project Utopia** — a minimalist colony simulation where the player **doesn't micromanage individuals**. You build infrastructure and set high-level priorities; **autonomous agents** living on a tile grid figure out the rest. Every living thing — workers, visitors, predators, herds — is rendered as a simple sphere on a 96×72 tile grid."

> *[Click Start Colony — game loads, ~12 worker spheres visible, food draining]*

"Each of those spheres is independently deciding what to do every tick. The colony has a global resource pool — food, wood, stone, herbs — and as soon as anything goes critical, you'll see workers re-prioritize. That's the gameplay loop: **the system reacts; you steer**."

> *[Click on a worker — Inspector panel opens]*

"Each agent has a backstory, a current FSM state, an intent, hunger and morale, and a 'food diagnosis' explaining what they're trying to do and why. The whole point is to make the AI **interpretable** — you can always click and see why."

> *[Optional 5-sec — open AI Log briefly]*

"There's also an AI Log showing the strategic director's decisions, and the system can be driven by a real LLM — GPT-class model — that reads the colony state and emits high-level plans. Those plans become tasks the FSM executes."

---

## §2 — Pillar 1: NPC AI (2:00)

"Now the two CG pillars. **First, NPC AI.**"

> *[Show Inspector with worker FSM state highlighted]*

"My original spec proposed **Behavior Trees with a shared blackboard**. After building the first version I realized BT was the wrong shape for our problem — and I'll explain why."

"A behavior tree answers '**what should I do if condition X holds**'. But for an autonomous worker the right question is: '**given my current state, what transitions can fire**?' That's a state machine."

"So I built a **PriorityFSM** — a flat priority-ordered state-machine dispatcher."

> *[If you have time — open `src/simulation/npc/PriorityFSM.js` briefly]*

"Each worker has 12 named states: IDLE, SEEKING_HARVEST, HARVESTING, DELIVERING, BUILDING, FIGHTING, RESTING, etc. Each state defines onEnter, onExit, tick, plus a list of priority-ordered transitions. The dispatcher walks the transition list and the first matching `when()` predicate fires — so a deeply hungry worker in HARVESTING can transition to FIGHTING the moment a predator enters aggro range, without waiting for the harvest to finish."

> *[Show worker transitioning state in real-time if possible — one click on a worker, watch FSM]*

"The same generic `PriorityFSM<StateName>` dispatcher hosts both **Worker AI** and **Visitor AI** — the visitor migration was a 4-wave refactor I shipped over two rounds. AnimalAI still runs the older `StatePlanner` framework — that's documented as known debt for HW8."

"For the LLM half: a Claude-class model reads colony state via `/api/ai/plan` and emits 'build a quarry; recruit a builder; reassign role X to GUARD'. The FSM is the **execution layer** below that — the LLM doesn't move workers directly; it just changes priorities and the FSM picks them up. That separation means the game still runs cleanly even when the LLM is offline — there's a **deterministic fallback director** that emits the same shape of plan from rule-based heuristics."

"Result: 12 named FSM states, ~880 LOC dispatcher with the entire transition table fitting on one screen, **fully observable**, **fully replaceable** between LLM and rule-based modes."

---

## §3 — Pillar 2: Pathfinding & Navigation (2:00)

"**Second pillar: Pathfinding & Navigation.**"

> *[Show colony with multiple workers walking on roads — convoys forming]*

"Workers need to walk from A to B on a 6912-tile grid with **water, walls, predators, and other workers** in the way. The classical solution is two layers: **A\*** for the global route and **Boids** for local steering."

"Standard stuff — except we hit two interesting problems."

"**Problem one — bridges across water.** A* with WATER marked impassable just refuses to plan across rivers. Adding a fixed water-traversal cost penalizes player roads even when a 3-tile bridge would be the shortest path."

"My solution: **dual-search A* with bridge interleave**. The road planner runs A\* twice — once with `allowBridge:false` (forced detour around water), once with `allowBridge:true` (water tiles cost a fixed bridge step). Then it scores both by `buildCost + length × TRAFFIC_AMORTIZATION` — assumes ~50 round trips of worker traffic — and picks the lower. So the planner builds bridges only when they're actually a payoff."

> *[Show archipelago map if possible — bridges visible across water]*

"**Problem two — Boids dampening on path.** Pure Boids around a moving worker convoy fights the A* path: separation pushes everyone aside, then path-following snaps them back, and the visible result is jitter."

"Fix: when a worker has an **active path**, separation weight drops to 0.35× of normal. Animals keep full Boids; only entities-with-path get dampened. So a convoy on a road flows; a herd of deer still scatters away from each other organically."

> *[If autopilot has revealed enough map — show worker convoy on a road]*

"And one more: **fog-aware planning.** The colony director won't propose buildings on un-revealed tiles, and IDLE workers bias their wander toward fog-edges to scout. So the LLM saying 'build a quarry near stone' literally cannot succeed until a worker has walked over to reveal the stone first — the same constraint a player would face."

---

## §4 — Key Takeaways (1:30)

"Three takeaways."

"**One: spec fidelity isn't the goal — design fidelity is.** My pitch said Behavior Trees; I shipped FSM. Same intent, better fit. The 'autonomous agent with shared blackboard' design intent is what mattered — the data structure followed."

"**Two: telemetry first, optimization second.** I lost two rounds chasing FPS bugs that turned out to be a Playwright headless quirk capping `requestAnimationFrame` at 1 Hz. The actual sim was running at 200+ fps the whole time. Lesson: **measure your measurement** before measuring your subject."

"**Three: AI-driven development workflow.** I built a 4-stage pipeline — review, plan, implement, validate — that runs as orchestrated subagents. Across 13 rounds, I logged 140+ commits. The interesting findings:"

"- The LLM was best at **bisecting cross-round regressions** — at one point it found that one of my own previous fixes (a worker role-change cooldown) was the root cause of a later builder-stuck bug, six rounds and a hundred commits removed."

"- The LLM was best as a **reviewer not a writer** — even more than as a coder. Letting one subagent design, another implement, and a third audit caught issues a single agent would have rationalized away."

"- The hard guardrails — frozen feature scope, named rollback anchors, per-track file ownership — were worth more than any clever prompt. Constraints made the agents trustworthy."

"That's the project. Happy to take questions."

---

## Timing notes

- §1 includes ~10s of click-and-show time for splash + Inspector
- §2 should leave room for 1 visible FSM transition; if hard to demo live, jump to inspector screenshot
- §3 needs water on map; if Temperate Plains has none, regen to Archipelago Isles before talk
- §4 is conversational — reduce to 1:00 if running over

## Words-per-minute calibration

This script reads to ~900 words, ~7:00 at conversational pace. If you ran rehearsal at 10:00, **cut §3 examples** rather than §4 takeaways — examiners weigh insight higher than detail.
