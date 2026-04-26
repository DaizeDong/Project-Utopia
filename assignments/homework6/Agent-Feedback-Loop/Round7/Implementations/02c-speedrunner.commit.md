---
plan_id: 02c-speedrunner
round: 7
commit: 0faab87
date: 2026-04-26
status: complete
---

# Implementation: 02c-speedrunner

## Commit Message
`feat(v0.8.2 Round-7 02c): COOK deadlock root fix — kitchen-driven allocation + settings quota floor + ColonyPlanner advisory mode`

## What Changed

### Root cause fix (P0 COOK=0 deadlock)
- **Kitchen-driven allocation** (`src/simulation/meta/ColonyPlanner.js`): Removed the `food >= idleChainThreshold` gate from the COOK reassign step. The gate was preventing COOK assignment when food was low — exactly when a Cook was most needed. Now: if `kitchens >= 1 && cookWorkers === 0`, ColonyPlanner emits a `reassign_role` COOK step unconditionally. COOK priority elevated from "high" to "critical".

### Settings quota floor
- **Role quota reading** (`src/simulation/meta/ColonyPlanner.js`): `generateFallbackPlan()` now reads `state.settings?.roleQuotaCook`, `roleQuotaSmith`, `roleQuotaHerbalist` as hard lower bounds. Role sliders are no longer silently ignored.

### Advisory mode (for 02b manual players)
- **`getAdvisoryRecommendation(state)`** (`src/simulation/meta/ColonyPlanner.js`): New static read-only method returning `{ text, urgency }` covering 4 cases: idle kitchen, food ETA < 90s, incomplete frontier, stable colony. Exposes ColonyPlanner strategic knowledge to manual-mode HUD.

## Validation
- `node --test test/*.test.js` — 1415/1422 pass
- `test/colony-planner-idle-chain.test.js`: kitchen=1 + COOK=0 + food=5 now asserts `reassign_role` IS emitted (updated from old buggy assertion)
- Settings role quota floor: manual role-slider assignments now respected
