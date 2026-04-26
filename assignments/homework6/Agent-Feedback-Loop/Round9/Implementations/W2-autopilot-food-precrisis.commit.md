---
round: 9
stage: C
wave: W2
plan: autopilot-food-precrisis
date: 2026-04-26
commit: "pending final Round9 commit"
status: implemented
source: "Round9/Plans/summary.md"
---

# W2 - autopilot-food-precrisis

## Implementation

- `ResourceSystem` now exports `isFoodRunwayUnsafe()` and emits `FOOD_PRECRISIS_DETECTED` before starvation deaths when Autopilot is on and food runway is unsafe.
- `GameApp` consumes recent pre-crisis events into `state.ai.foodRecoveryMode`, sets warning copy, pauses expansion intent, and clears recovery after food production stabilizes.
- `ColonyDirectorSystem` prioritizes farms, warehouses, roads, and lumber during recovery mode instead of routine expansion.
- `PopulationGrowthSystem` blocks births while food runway is unsafe and records `populationGrowthBlockedReason`.
- `MortalitySystem` avoids expensive nutrition reachability checks until hunger reaches the risk band, reducing starvation-path churn during normal hunger states.

## Files

- `src/simulation/economy/ResourceSystem.js`
- `src/simulation/meta/GameEventBus.js`
- `src/app/GameApp.js`
- `src/simulation/meta/ColonyDirectorSystem.js`
- `src/simulation/population/PopulationGrowthSystem.js`
- `src/simulation/lifecycle/MortalitySystem.js`
- `test/autopilot-food-crisis-autopause.test.js`
- `test/colony-director.test.js`

## Validation Evidence In Diff

- Added test coverage that low runway emits `FOOD_PRECRISIS_DETECTED` before any starvation crisis event.
- Added director coverage proving phase builders stay idle when Autopilot is off.
