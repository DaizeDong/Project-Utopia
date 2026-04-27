---
plan_id: 02a-rimworld-veteran
round: 7
commit: 19b196d
date: 2026-04-26
status: complete
---

# Implementation: 02a-rimworld-veteran

## Commit Message
`feat(v0.8.2 Round-7 02a): starving-preempt threshold + seek_food protected state + carry-eat emergency + fire/runout → objectiveLog + EventPanel 3→6`

## What Changed

### Root fixes
- **starving-preempt threshold** (`src/simulation/npc/WorkerAISystem.js`): Workers with hunger below `BALANCE.starvingPreemptThreshold` (0.22) immediately interrupt current task to seek food, preventing death from ignoring hunger while carrying resources.
- **seek_food protected state** (`src/simulation/ai/state/StateGraph.js`): `seek_food` state is now protected — it cannot be preempted by a lower-urgency intent, only by an equally critical or higher-priority interrupt.
- **carry-eat emergency** (`src/simulation/npc/WorkerAISystem.js`): Workers carrying food with hunger < 0.25 now eat directly from carry, bypassing the warehouse trip — fixes the starvation-while-carrying bug.

### Visibility
- **fire/runout → objectiveLog** (`src/simulation/economy/EconomySystem.js`, `WorldEventSystem.js`): WAREHOUSE_FIRE and resource runout events now push a line to `state.gameplay.objectiveLog` so they appear in the EventPanel immediately, not just as floating toast.
- **EventPanel 3→6** (`src/ui/panels/EventPanel.js`): Max visible event rows expanded from 3 to 6, reducing critical event scroll-off.

## Validation
- `node --test test/*.test.js` — 1415/1422 pass
- Boundary test for preempt threshold (0.22) updated and passing
- Workers carrying food now eat in-place when starving
