---
round: 4
date: 2026-04-23
feedback_total: 10
score_average: 2.70
score_min: 2.0
score_max: 4.0
verdict: STRUCTURAL_WORK_REQUIRED
---

# Round 4 Stage A Summary

## 1. Scores

| reviewer | score | verdict | structural read |
|---|---:|---|---|
| 01a-onboarding | 2.0 | fail | The game explains many concepts, but still does not teach a reliable first-action loop. |
| 01b-playability | 3.0 | fail | The player is surrounded by systems and goals, yet still feels like a spectator beside a self-running sandbox. |
| 01c-ui | 3.0 | fail | The UI has coverage, but not hierarchy; debug/developer signals compete with player-critical information. |
| 01d-mechanics-content | 3.0 | fail | Mechanic labels and building names exist, but the underlying cause-effect chain is still too weakly observable. |
| 01e-innovation | 2.0 | fail | The project talks like an AI-driven colony sim, but the actual play difference is still mostly packaging. |
| 02a-rimworld-veteran | 2.0 | fail | A veteran can smell intent, but not yet a trustworthy long-horizon system spine. |
| 02b-casual | 3.0 | fail | The game looks more finished than a prototype, but still does not carry a casual player into confident action. |
| 02c-speedrunner | 2.0 | fail | Experimental play, restart value, and optimization depth are blocked before the run loop feels stable enough to evaluate. |
| 02d-roleplayer | 3.0 | fail | The world has labels and scenario framing, but not enough people, stakes, or event weight to grow story. |
| 02e-indie-critic | 4.0 | partial | There is a faint authorial signal in the “Broken Frontier” framing, but the project still reads more like a structured system prototype than a finished independent work. |

## 2. What Round 4 Feedback Changes

Round 4 feedback is harsher than Round 3 because the reviewers are no longer mainly reacting to missing clarity or missing surface explanation. They are reacting to a deeper mismatch:

- the game promises many systems very early;
- the UI foregrounds those systems aggressively;
- the player then struggles to feel a load-bearing decision loop underneath them.

The repeated complaint is no longer “I cannot see enough.” It is “I can see a lot, but I still do not trust what matters, what is driving the colony, or why this game is meaningfully different.”

That means Round 4 should **not** spend its budget on more help text, more glossary content, more milestone copy, or more decorative guidance. The reviewers already see plenty of wording. What they do not yet see is a strong system contract.

## 3. Repeated Structural Findings

### F1. The Game Still Over-Promises Relative To What The Player Can Verify

Mentioned by: 01d, 01e, 02a, 02e, 02c.

The build exposes many high-level nouns early:

- AI director
- autopilot
- supply-chain heat lens
- routes / depots / warehouses / Dev
- multiple templates and infrastructure tools

But reviewers still cannot consistently observe the concrete, local cause-effect chain that makes those systems feel real. The product currently feels more like a control surface for a colony sim than a colony sim whose underlying logic is unmistakably landing on the player.

### F2. First Actions Are Still Not Reliable, Even After Earlier Guidance Work

Mentioned by: 01a, 01b, 02b.

The player sees goals such as `Build Farm 4/6` or `Recover food now`, but still lacks a tight action loop:

- where exactly to act;
- why that action is the current priority;
- what success will look like;
- what to do when the first attempt fails.

This is no longer mainly a copy problem. It is a control and consequence problem. The player needs fewer ambiguous states between choosing an action and seeing whether the colony actually improved.

### F3. Food / Logistics / Recovery Still Do Not Feel Like A Stable System Spine

Mentioned by: 01b, 01d, 02a, 02c, 02e.

Reviewers repeatedly see warehouses, routes, depot language, recovery prompts, and supply-chain framing, yet they do not come away believing that the food/logistics loop is reliably understandable or strategically tractable.

The strongest code-side sidecar read from the explorer matches this: likely bottlenecks remain in intent order, delivery throughput, hauling ramp, and build priorities that over-favor logistics scaffolding over robust food recovery.

### F4. AI / Autopilot Is Still More Brand Promise Than Distinctive Play

Mentioned by: 01e, 02b, 02e, 01b.

The build keeps advertising `Autopilot`, `DIRECTOR`, AI decisions, and fallback states. But the player-facing question remains unresolved:

What does AI control actually change about how this game is played, compared with a conventional colony sim?

If the answer is still mostly “it produces extra labels, status strings, and system flavor,” then this layer is not yet differentiating the game. It is instead raising expectations the current loop cannot cash.

### F5. Narrative / Authorial Voice Exists Mostly In Naming, Not In Load-Bearing Play

Mentioned by: 02d, 02e, 01e, 02a.

`Broken Frontier`, “reconnect the west lumber line,” and similar language give the project a more specific tone than a generic sandbox. That is real progress.

But reviewers still do not encounter enough:

- memorable individual workers,
- event weight,
- consequences with emotional texture,
- situation-specific narrative payoff.

Under the current HW06 freeze, this should **not** trigger a new character, relationship, grief, or story-generation system. The correct interpretation is narrower: the existing game state is not yet producing enough lived meaning by itself.

### F6. Player-Facing UI Still Leaks Too Much Debug / System-Internal Framing

Mentioned by: 01c, 02b, 02e.

`Dev`, autopilot fallback wording, dense resource trends, and other developer-leaning signals still compete with player-critical information. This matters, but it is secondary to the deeper problem above: the UI is noisy partly because it is compensating for a weakly grounded loop.

## 4. Priority Queue For Stage B

P0 candidates:

1. **Food delivery and stock-buffer contract**  
   Tighten the worker intent order around carrying, eating, and delivering so food compounds into a real colony buffer instead of disappearing into shallow survival churn.

2. **Warehouse / hauling / unload throughput recovery**  
   Reduce the layered friction that keeps food stuck in carry or warehouse queues, especially in the small-colony phase where one bad delivery loop collapses the run.

3. **Director / planner priority rebalance toward survival throughput**  
   Reduce warehouse-and-road overbuilding when basic coverage is already acceptable, and let kitchen / food recovery / survival-critical production rise earlier.

4. **Autopilot / AI truth contract or demotion**  
   Either make the AI/autopilot layer materially informative and trustworthy in current play, or reduce its front-stage prominence so it stops over-promising a difference the loop cannot support.

P1 candidates:

5. **Run-entry / restart stability for experimentation**  
   Reproduce and harden the speedrunner-reported gap between “ready to start a run” and “sustainably inside a run.” If real, this is a gating issue for replayability and benchmark-like experimentation.

6. **UI hierarchy cleanup tied to a structural fix**  
   Reduce developer-facing text and noise only when attached to one of the P0 fixes above. Do not accept a standalone polish pass.

7. **Narrative surfacing from existing state**  
   Use existing scenario / worker / event state to give more human weight to failures and recoveries, but without inventing a new character-sim layer.

D5 / defer by default:

- new tutorial level or dedicated onboarding scenario
- new buildings, tools, tiles, factions, victory conditions, or score systems
- new relationship / mood / grief / memory mechanics
- new audio, VO, or bitmap asset pipeline
- copy-only, tooltip-only, or help-only fixes that are not attached to a structural correction

## 5. Stage B Instruction

Round 4 Stage B should accept **fewer, more structural** plans.

Default review filter:

- Reject plans whose main effect is “clearer wording.”
- Reject plans whose main effect is “more visible labels.”
- Reject plans whose main effect is “more onboarding text.”
- Prefer plans that directly affect the colony’s actual recovery path, throughput, or player trust in the system contract.

The strongest Round 4 plans will likely cluster around:

- delivery-before-eat or carry/stock logic,
- warehouse queue and unload friction,
- early hauler availability,
- director / planner overbuilding priorities,
- AI/autopilot truthfulness as a real mechanic boundary rather than a cosmetic status layer.
