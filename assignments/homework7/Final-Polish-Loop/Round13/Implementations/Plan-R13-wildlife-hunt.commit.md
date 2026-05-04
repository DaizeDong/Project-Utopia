---
plan: Plan-R13-wildlife-hunt
priority: P1
track: code
parent_commit: 30f28a0
date: 2026-05-01
---

# Plan-R13-wildlife-hunt — Implementation Log

## Status

**SHIPPED.** Three-part patch lands per the plan: (a) `BALANCE.wildlifeSpawnIntervalMult=0.5` halves wildlife spawn cooldowns; (b) `BALANCE.wildlifeSpeciesRoundRobin=true` makes `WildlifePopulationSystem.spawnAnimals` pick the least-represented predator species so bear+raider_beast actually appear; (c) `BALANCE.wildlifeHuntFoodReward=4` drops 4 food into the killer's carry (overflow → stockpile) on every wildlife predator kill, recorded as `food/produced`.

## Parent → Head

`30f28a0` → (new commit on this run)

## Files Changed

- `src/config/balance.js` — +10 LOC (3 new constants near `wildlifeSpawnRadiusBonus` with commentary citing this plan).
- `src/simulation/ecology/WildlifePopulationSystem.js` — +~30 LOC (`PREDATOR_SPECIES_POOL`, `pickRoundRobinPredatorSpecies` helper reading `state.metrics.ecology.predatorsBySpecies`, plumbed forced species through `createAnimal` 5th arg in `spawnAnimals`, `intervalMult` applied to all 3 `nextRecoveryAtSec` / `nextBreedAtSec` / `nextPredatorRecoveryAtSec` cooldown gates).
- `src/simulation/npc/fsm/WorkerStates.js` — +~22 LOC (import `recordResourceFlow`; existing kill block in `FIGHTING.tick` now drops `wildlifeHuntFoodReward` food into carry up to `workerDeliverThreshold × 2` cap, overflows into `state.resources.food`, records `food/produced` flow; only fires when `target.type==="ANIMAL" && target.kind==="PREDATOR"` so saboteur kills are NOT food-rewarded).
- `test/wildlife-hunt-reward.test.js` — +~110 LOC NEW (3 cases: cooldown halved, round-robin picks least-represented, kill drops food + records flow via `WorkerFSM.tickWorker` to avoid the existing WorkerTransitions ↔ WorkerStates load-order quirk).
- `CHANGELOG.md` — new v0.10.1-q entry.

Total: ~62 production LOC + ~110 test LOC. Within plan's ~60 production LOC scope.

## Tests

- `node --test test/wildlife-hunt-reward.test.js` → 3/3 pass.
- `node --test test/*.test.js` → **2033 pass / 0 fail / 4 skip** (baseline preserved).

## Confirm `git log --oneline -2`

```
74da308 feat(wildlife-hunt r13): Plan-R13-wildlife-hunt (P1) — wildlife spawn cadence 2x faster + predator round-robin + worker hunt food reward
30f28a0 feat(autopilot-wait-llm r13): Plan-R13-autopilot-wait-llm (P1) — gate ColonyDirector phase-builder until first /api/ai/plan response or fallback or 10s timeout
```
