# Q&A Preparation — 12 Anticipated Questions

For the live 2-min Q&A. Each answer is **30–60 seconds** spoken. Practice the ones marked ⭐.

---

## ⭐ Q1: "Your spec said Behavior Trees but you shipped FSM. Why? Is that a downgrade?"

A: Not a downgrade — a **better fit**. BTs are great when the question is "given conditions A, B, C, what action?" But in our problem the question is more "given current state, what events can preempt?" — that's a state machine. The crucial property I needed was **priority-ordered preemption**: a HARVESTING worker who sees a saboteur 2 tiles away needs to switch to FIGHTING immediately, not wait for the harvest tree to short-circuit. The flat priority FSM expresses that as a single transition with `priority: 1`. With a tree I'd be putting interrupt checks at every node. The intent — autonomous interpretable agents — is what mattered; FSM happens to express it more cleanly.

---

## ⭐ Q2: "How is the LLM actually involved? Is it just a fancy text generator?"

A: It's a real strategic decision-maker. The Director hits `/api/ai/plan` with a JSON-summarized world state — resource counts, building counts, role distribution, threat level, scenario goals. The model returns a structured plan: `[{action: "build", type: "warehouse", priority: 90}, {action: "recruit"}, ...]`. We use `gpt-5.4-nano` via direct OpenAI API. The plan goes into a queue; the FSM picks up the work. Critically, the LLM **never moves a worker directly** — it changes priorities. So if the LLM is offline, a rule-based fallback director emits the same plan shape and gameplay continues. That separation is what makes the LLM safe to use in a real-time game.

---

## ⭐ Q3: "How did you handle the AI not being deterministic?"

A: Two ways. (1) The simulation itself is deterministic — seeded RNG, fixed-step physics, every system runs in `SYSTEM_ORDER`. The LLM only injects high-level intents; if the LLM went rogue, the worst case is a bad build queue, not a corrupted simulation. (2) For testing, we have a deterministic fallback director that emits the same plan shape from rule-based heuristics. So `node --test` can cover the entire AI surface without ever calling out to the LLM. We have ~2060 tests passing, all deterministic.

---

## Q4: "What was the hardest bug?"

A: A six-round-old self-inflicted regression. In round 5 I added a 4-second `roleChangeCooldownSec` to prevent worker role-thrashing — workers were flipping between FARM and BUILDER too fast. Three rounds later, a playtest reviewer reported "BUILDER never claims construction sites; blueprints sit unbuilt forever." The cooldown was blocking FARM→BUILDER promotion. Took an entire reviewer-driven bisect to trace it back to my own fix. The fix was a one-line predicate: bypass the cooldown when sites are unclaimed. Lesson: cross-round regressions are real, and self-imposed safeguards can become the bug.

---

## Q5: "How is path-following + Boids different from just Boids?"

A: Pure Boids gives you flocking — convoys would clump and drift. Pure A* gives you robotic single-file movement that ignores collisions. The hybrid is: A* gives the **route** (which tiles to walk over), Boids handles **local avoidance** (don't bump into the worker in front of you, don't walk through a deer). The trick is **separation dampening on path** — when a worker has an active A* path, separation weight drops to 0.35× of normal so path-following can dominate. Without that dampening, a 12-worker convoy on a road jitters as separation pushes them aside and path snaps them back. With it, you get visible **flowing convoys** along roads.

---

## Q6: "Why dual-search A* for bridges? Why not just weighted A*?"

A: Because the cost of a bridge isn't a fixed number — it depends on **how many times** you'll cross it. Weighted A* with a fixed water cost can't tell the difference between "shortcut you'll use 50 times" and "novelty crossing you'll use once." Dual-search runs A* twice, once with bridges allowed and once without, then scores both with a `length × TRAFFIC_AMORTIZATION` factor (50 round trips assumed). If the bridge variant beats detour even after amortizing build cost over 50 trips, we build. So a 3-tile bridge that saves 20 detour tiles → win. A 1-tile bridge that saves 2 detour tiles → no, just walk around.

---

## Q7: "What did AI coding assistance change about how you worked?"

A: Three things. (1) **Speed of iteration** — I ran 13 review/plan/implement/validate rounds, ~140 commits, in maybe 2 weeks of wall-clock work. That's 10×–20× of what I could do manually. (2) **Quality of self-criticism** — letting one subagent review code another wrote caught issues I would have rationalized away. (3) **Hard guardrails matter more than clever prompts** — frozen feature scope, named rollback anchors, file-ownership tracks. Constraints turned the agents from creative-but-unreliable into trustworthy. The biggest surprise: the LLM was best at **bisecting cross-round regressions** — at one point it caught a 5-round-old bug by running a 4-commit binary search.

---

## Q8: "Why don't you have audio?"

A: Adopted a hard freeze in the final-polish phase that forbade adding new assets. Audio assets — even free ones — would have introduced licensing decisions, file-pipeline plumbing, and a debug surface I didn't have time to validate. So audio is a documented deferral in Post-Mortem §4.5. The substitute is **toast notifications** for important events (raid incoming, worker died with name + cause, milestone reached). It's not as good as audio but it preserves the "you can look away and trust the colony" interaction.

---

## Q9: "How does the colony handle scaling — say, 200 workers?"

A: We tested up to 50 workers + 30 buildings + multi-saboteur stress (R9 PW) and the dispatcher held — `multiClaim=0` across 16 sites at 50 workers. Per-tick budget at 50 workers is around 4ms (~470 fps headroom). The bottlenecks at scale are (1) **AgentDirector planner** which is gated to 0.5s sim-time intervals, and (2) **Boids separation queries** which I haven't optimized to a quadtree — currently O(N²) within a worker's neighborhood. For 200+ workers you'd want spatial partitioning. We didn't ship that because the gameplay never demanded it.

---

## Q10: "What's the most surprising thing the LLM agents did?"

A: Two stories. (1) During R7, a perf reviewer agent found a **latent ReferenceError** in WorkerAISystem.js — a constant called `WORKER_EMERGENCY_RATION_HUNGER_THRESHOLD` was referenced but never declared. It would have crashed the moment any code path called it. The function was unreachable in current state, but if I'd ever flipped a feature flag, instant breakage. The agent caught it because it noticed the symbol wasn't in the file's exports table while doing a perf trace. (2) During R11, an audit agent **bisected a 4-commit regression** I didn't know existed — it ran the long-horizon benchmark at every commit between R8 and R10, found a -60% DevIndex drop, and traced it to a single line of phase-offset math in the cascade-mitigation fix.

---

## Q11: "How do you know the game is fun?"

A: I don't, fully. I have proxy metrics: 13 rounds of a "holistic playability rank" reviewer that scored the game on a 1–10 scale per round; we trended 5.5 → 4.0 (during structural rebuild) → back up to 5.5 over the last few rounds. We also tracked DevIndex bench numbers — went from 28 (early collapse mode) to 73 (full 90-day survival). But the honest answer is: subjective fun is something only **human playtesters** can judge. I tested ~50 hours myself, the orchestrator's blind reviewer agents tested another ~20 hours, but I haven't had outside playtesters yet. That's documented as a gap in Post-Mortem §3.

---

## ⭐ Q12: "If you had two more weeks, what would you do?"

A: Three things, ranked. (1) **AnimalAI migration** — currently still on the legacy StatePlanner framework, while Worker and Visitor have been migrated to PriorityFSM. Finishing the migration would unify the entire NPC AI layer under one framework (~1 wave of work). (2) **Refactor the two Grade-D systems** — ColonyPlanner (1884 LOC) and ColonyPerceiver (1970 LOC) — they're functioning code but architecturally they're patch-piles. (3) **Real audio + walk-cycle animation** — both deferred under the freeze. The minimalist sphere-on-grid aesthetic was intentional from a1.md, but a tasteful audio layer would lift the "living system" feel a lot. None of this is core gameplay; the loop works.

---

## Bonus: short cheat-sheet for live moments

- "Can you show…" → switch to game tab; demo while talking
- "How did you test…" → mention the 2060+ test suite running in CI on every commit
- "Why a sphere?" → a1.md committed to minimalist; it scales to 200+ entities at 60fps; rendering is one InstancedMesh per role
- "How did you avoid scope creep?" → hard-freeze in HW7 that forbade new tile/role/building/mood/mechanic/audio/UI panel; every plan in the 13 rounds had to pass that gate
- "What's the most fragile system?" → ColonyPlanner because of size; the migration to BuildProposer interface (R5+R6) extracted the safety-net logic but the planner itself is still monolithic
