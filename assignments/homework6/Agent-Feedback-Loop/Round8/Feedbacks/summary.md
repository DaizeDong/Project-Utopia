---
round: 8
stage: A
date: 2026-04-26
reviewers: 10
avg_score: 5.42
verdict: NEEDS_WORK
---

# Round 8 Stage A - Reviewer Summary

## Scores

| Reviewer | Focus | Score |
|----------|-------|-------|
| 01a-onboarding | Onboarding | 4.0 / 10 |
| 01b-playability | Playability | 5.5 / 10 |
| 01c-ui | UI | 1.0 / 10 |
| 01d-mechanics-content | Mechanics / content | 6.2 / 10 |
| 01e-innovation | Innovation | 6.8 / 10 |
| 02a-rimworld-veteran | Colony-sim veteran | 6.4 / 10 |
| 02b-casual | Casual player | 6.5 / 10 |
| 02c-speedrunner | Speedrunner / optimizer | 6.0 / 10 |
| 02d-roleplayer | Roleplayer | 6.0 / 10 |
| 02e-indie-critic | Indie critic | 5.8 / 10 |

Average: **5.42 / 10**.

Note: `01c-ui` reported `localhost:5173` as unreachable / blank, while the other 9 reviewers successfully played the same build URL and produced screenshots. Treat this as a valid blind-review observation but likely runtime/tool isolation anomaly, not enough by itself to prioritize "app does not open" as a product-wide code finding. Excluding this single anomaly, the average is **5.91 / 10**.

## P0 Findings

### P0-1 Manual action feedback does not close the loop

Multiple reviewers could place or attempt roads, farms, warehouses, kitchens, and resource buildings, but could not reliably tell:

- whether a click succeeded
- whether a route or depot objective was completed
- which building action caused a milestone
- what an invalid placement means in player language
- what exact next action fixes a blocked placement or starving worker

This appears in 01a, 01b, 02b, 02c, and 02e. It is now the main blocker for turning the build from "watchable simulation" into "controllable game".

### P0-2 First-session objective chain is not actionable enough

The opening briefing says what matters, but the in-game experience lacks a persistent first-run checklist, map targeting, completion confirmation, and recovery guidance. Players understand "west lumber route / east ruined depot" but not exactly which tiles or buildings advance that goal.

This appears in 01a, 01b, 02b, and 02e.

### P0-3 Autopilot is useful but too black-box and dominant

Autopilot/fast-forward is repeatedly described as the easiest way to enjoy the game. Manual play feels higher effort with weaker feedback. Reviewers asked for an explicit autopilot plan card, next action, why-this-action explanation, and clearer manual-vs-AI boundary.

This appears in 01b, 01e, 02b, 02c, and 02e.

### P0-4 Worker survival and food failures remain hard to diagnose

Starvation still appears as a key failure mode. Reviewers can see hungry/starving workers, but not enough explanation for why food did not reach them: production shortage, kitchen conversion, delivery path, task lock, carry/eat timing, or priority.

This appears in 02a, 02b, and 02c.

## P1 Findings

### P1-1 AI differentiation is visible in labels, not yet in decisions

WHISPER / DIRECTOR / DRIFT, AI Log, fallback, and Autopilot all create a strong concept, but reviewers do not consistently see decision inputs, candidates, chosen action, rejected alternatives, and outcome.

Sources: 01e, 02e, 01b.

### P1-2 Character systems have names and events but not durable memory

Births, deaths, family names, backstories, and traits exist. Roleplayer and veteran feedback both say these do not yet leave enough persistent per-character history or relationship consequences to create retellable stories.

Sources: 02d, 02a, 01e.

### P1-3 Traits are stated but not behaviorally legible

Swift, hardy, careful, social, and specialist labels exist, but reviewers cannot see enough behavior difference or explanation linking trait to action.

Sources: 02d, 02a, 01d.

### P1-4 Resource and heat-lens diagnostics need a problem-to-cause-to-action chain

The heat lens and resource chains are praised, but reviewers need a click path from a red/blue/starved point to missing input, nearest stock, responsible worker, blocked route, and suggested fix.

Sources: 01d, 02a, 01e.

### P1-5 Speedrunner balance and repeatability issues

Free roads appear dominant; pause-build + fast-forward can become the best strategy; `8x` can degrade to actual `4x`; deaths may not be punished enough relative to Dev/Score.

Sources: 02c, 02e.

### P1-6 Birth and family cadence weakens story credibility

Births can happen too frequently and children become normal workers too quickly, turning family history into population churn rather than story.

Sources: 02a, 02d.

### P1-7 Developer-facing UI leaks into player experience

Debug / benchmark / snapshot / tuning / dev telemetry language is still too visible for casual/commercial play.

Sources: 02b, 02e.

## Positive Signals

- Reviewers now see a real colony simulation frame, not an empty prototype.
- The supply-chain heat lens concept is repeatedly praised.
- Opening map labels and scenario briefings are effective.
- Author voice in building descriptions and storyteller text is noticed.
- Worker names, roles, family events, and per-worker details create a strong base for future narrative work.
- Speedrunner feedback found actual routes and strategy hypotheses, indicating the game now has optimizable structure.

## Stage B Priorities

1. Build a first-session objective and manual-action confirmation loop: checklist, map target, completion confirmation, invalid-placement recovery language.
2. Add an Autopilot/AI decision plan card or log summary: next action, reason, expected outcome, manual boundary.
3. Add starvation/resource diagnosis surfaces: why a worker cannot eat, which chain is blocked, what action fixes it.
4. Add durable character memory / family history / trait explanation without introducing a large new relationship mechanic.
5. Defer full economy rebalance, new buildings, new threat systems, or broad score redesign unless a small fix directly supports the above.
