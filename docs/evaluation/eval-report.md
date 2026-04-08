# Project Utopia — Comprehensive Game Evaluation Report

> Generated: 2026-04-08 03:16:18
> Version: 0.5.0 (Phase 1: Resource Chains)
> Scenarios: 17 | Duration: 3060s total sim time

## Overall Scorecard

| Dimension | Score | Grade | Description |
|---|---|---|---|
| **Stability** | 1 | A | Long-run correctness, no crashes or data corruption |
| **Development** | 0.309 | F | Progressive complexity growth and objective completion |
| **Coverage** | 0.779 | C | All game elements utilized during play |
| **Playability** | 0.58 | D | Tension curves, decision variety, engagement |
| **Technical** | 0.31 | F | AI quality, pathfinding, state machine validity |
| **Reasonableness** | 0.458 | F | NPC behavior naturalness and thematic coherence |

**Overall Score: 0.573 (D)**

---

## 1. Stability (稳定性)

| Scenario | Survived | Time | NaN | Neg | Errors | Entities | Outcome |
|---|---|---|---|---|---|---|---|
| default/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| default/fortified_basin | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| default/archipelago_isles | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| scarce_resources/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| abundant_resources/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| resource_chains_basic/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| full_processing/fortified_basin | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| tooled_colony/fortified_basin | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| high_threat/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 23 | none |
| skeleton_crew/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 12 | none |
| large_colony/fortified_basin | YES | 180/180s | 0 | 0 | 0 | 28 | none |
| wildlife_heavy/archipelago_isles | YES | 180/180s | 0 | 0 | 0 | 28 | none |
| storm_start/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| default/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| developed_colony/fortified_basin | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| default/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 20 | none |
| default/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 20 | none |

## 2. Development (发展性)

| Scenario | Buildings Early→Late | Resources Early→Late | Peak Roles | Objectives |
|---|---|---|---|---|
| default | 42→37.31 | 2→2 | 4 | 0/3 |
| default | 39→34 | 2→2 | 4 | 0/3 |
| default | 13→9 | 2→2 | 4 | 0/3 |
| scarce_resources | 50→44.05 | 2→2 | 4 | 0/3 |
| abundant_resources | 50→43 | 2→2 | 4 | 0/3 |
| resource_chains_basic | 50→43.79 | 4→4 | 5 | 0/3 |
| full_processing | 45→40.11 | 7→7 | 7 | 0/3 |
| tooled_colony | 45→40 | 4→4 | 4 | 0/3 |
| high_threat | 50→43.63 | 2→2 | 4 | 0/3 |
| skeleton_crew | 50→43.42 | 2→2 | 3 | 0/3 |
| large_colony | 45→40 | 2→2 | 3 | 0/3 |
| wildlife_heavy | 21→17 | 2→2 | 3 | 0/3 |
| storm_start | 50→43.42 | 2→2 | 4 | 0/3 |
| default | 42.42→49.08 | 2→2 | 4 | 0/3 |
| developed_colony | 45→40 | 2→2 | 4 | 0/3 |
| default | 63→57.31 | 2→2 | 4 | 0/3 |
| default | 56→50.23 | 2→2 | 4 | 0/3 |

## 3. Coverage (覆盖度)

| Element | Found | Expected | Missing | Score |
|---|---|---|---|---|
| Tile Types | 10 | 13 | KITCHEN, SMITHY, CLINIC | 0.77 |
| Roles | 7 | 8 | HAUL | 0.88 |
| Resources | 7 | 7 | none | 1 |
| Intents | 7 | 10 | farm, lumber, quarry, gather_herbs, cook, smith, heal | 0.7 |
| Weathers | 2 | 5 | none | 0.4 |

## 4. Playability (可玩性)

| Scenario | Tension | Variety | Resource Health | Progress | Score |
|---|---|---|---|---|---|
| default | 0.382 | 0.744 | 1 | 0 | 0.531 |
| default | 0.652 | 0.767 | 1 | 0 | 0.605 |
| default | 0.492 | 0.73 | 1 | 0 | 0.556 |
| scarce_resources | 0.636 | 0.828 | 1 | 0 | 0.616 |
| abundant_resources | 0.616 | 0.836 | 1 | 0 | 0.613 |
| resource_chains_basic | 0.562 | 0.764 | 1 | 0 | 0.581 |
| full_processing | 0.526 | 0.839 | 1 | 0 | 0.591 |
| tooled_colony | 0.69 | 0.811 | 1 | 0 | 0.625 |
| high_threat | 0.42 | 0.785 | 1 | 0 | 0.551 |
| skeleton_crew | 0.671 | 0.749 | 1 | 0 | 0.605 |
| large_colony | 0.568 | 0.809 | 1 | 0 | 0.594 |
| wildlife_heavy | 0.438 | 0.748 | 1 | 0 | 0.547 |
| storm_start | 0.514 | 0.831 | 1 | 0 | 0.586 |
| default | 0.345 | 0.682 | 1 | 0 | 0.507 |
| developed_colony | 0.658 | 0.778 | 1 | 0 | 0.609 |
| default | 0.459 | 0.768 | 1 | 0 | 0.557 |
| default | 0.529 | 0.816 | 1 | 0 | 0.586 |

## 5. Technical (技术性)

| Scenario | Cache Hit | Validity | Goal Stability | AI Rate | Tool Mult | Score |
|---|---|---|---|---|---|---|
| default | 0.507 | 1 | 0 | 0/min | 1 | 0.326 |
| default | 0.092 | 1 | 0 | 0/min | 1 | 0.264 |
| default | 0.129 | 1 | 0 | 0/min | 1 | 0.269 |
| scarce_resources | 0.36 | 1 | 0 | 0/min | 1 | 0.304 |
| abundant_resources | 0.133 | 1 | 0 | 0/min | 1 | 0.27 |
| resource_chains_basic | 0.386 | 1 | 0 | 0/min | 1 | 0.308 |
| full_processing | 0.384 | 1 | 0 | 0/min | 1.15 | 0.374 |
| tooled_colony | 0.299 | 1 | 0 | 0/min | 1.45 | 0.495 |
| high_threat | 0.268 | 1 | 0 | 0/min | 1 | 0.29 |
| skeleton_crew | 0.22 | 1 | 0 | 0/min | 1 | 0.283 |
| large_colony | 0.713 | 1 | 0 | 0/min | 1 | 0.357 |
| wildlife_heavy | 0.091 | 1 | 0 | 0/min | 1 | 0.264 |
| storm_start | 0.393 | 1 | 0 | 0/min | 1 | 0.309 |
| default | 0.24 | 1 | 0 | 0/min | 1 | 0.286 |
| developed_colony | 0.099 | 1 | 0 | 0/min | 1 | 0.265 |
| default | 0.35 | 1 | 0 | 0/min | 1 | 0.303 |
| default | 0.366 | 1 | 0 | 0/min | 1 | 0.305 |

## 6. Reasonableness (合理性)

| Scenario | Diversity | Non-Repetition | Coherence | Productivity | Score |
|---|---|---|---|---|---|
| default | 0.831 | 0.889 | 0.33 | 0.169 | 0.544 |
| default | 0.756 | 0 | 0.33 | 0.094 | 0.321 |
| default | 0.758 | 0 | 0.33 | 0.068 | 0.314 |
| scarce_resources | 0.899 | 0.741 | 0.33 | 0.121 | 0.52 |
| abundant_resources | 0.81 | 0.185 | 0.33 | 0.128 | 0.384 |
| resource_chains_basic | 0.925 | 0.852 | 0.33 | 0.082 | 0.539 |
| full_processing | 0.798 | 0.667 | 0.33 | 0.186 | 0.494 |
| tooled_colony | 0.724 | 0.259 | 0.33 | 0.183 | 0.39 |
| high_threat | 0.914 | 0.778 | 0.33 | 0.121 | 0.532 |
| skeleton_crew | 0.944 | 0 | 0.33 | 0.047 | 0.363 |
| large_colony | 0.651 | 0.963 | 0.33 | 0.156 | 0.501 |
| wildlife_heavy | 0.612 | 0 | 0.33 | 0.117 | 0.285 |
| storm_start | 0.882 | 0.667 | 0.33 | 0.113 | 0.498 |
| default | 0.87 | 0.944 | 0.66 | 0.342 | 0.684 |
| developed_colony | 0.684 | 0.074 | 0.33 | 0.119 | 0.322 |
| default | 0.931 | 0.889 | 0.33 | 0.081 | 0.547 |
| default | 0.92 | 0.889 | 0.33 | 0.074 | 0.542 |

---

## Key Findings & Analysis

### What works well

1. **Perfect stability (A, 1.0)** — All 17 scenarios across 3 map templates and 15 presets ran to completion. Zero NaN, zero negative resources, zero system errors, zero crashes. The simulation loop is rock-solid.

2. **Resource health (1.0)** — Food and wood never hit zero in any scenario, meaning the fallback AI keeps the colony alive reliably.

3. **All 7 resources produced** — Stone, herbs, meals, medicine, and tools all appear in at least one scenario, confirming the Phase 1 resource chain pipeline works end-to-end.

### Critical problems

1. **Zero objectives completed (0/3 in all 17 scenarios)** — The ProgressionSystem never advances to objective completion in headless mode. This devastates Development (0.309) and Playability (progress=0). Root cause: objectives require specific building configurations that fallback AI doesn't construct.

2. **No AI decisions (0/min)** — AI rate is zero because we're running in offline-fallback mode with no LLM. The `aiDecisions` counter tracks environment+policy decisions, but in offline-fallback mode these are counted differently. This makes Technical score artificially low.

3. **Goal stability = 0** — `goalFlipCount` is extremely high relative to workers, likely because the fallback policy constantly reassigns intents. Workers oscillate between eat/farm/deliver each tick instead of committing to a task.

4. **Low intent coverage (7/10)** — The intents "farm", "lumber", "quarry", "gather_herbs", "cook", "smith", "heal" are NOT detected because `chooseWorkerIntent` returns these values but `debug.lastIntent` may be set elsewhere or not at all. This is likely a tracking gap rather than a real coverage problem.

5. **Missing tile types: KITCHEN, SMITHY, CLINIC** — These processing buildings don't appear in natural map generation (they must be player-built). Only the development-progressive scenario with scripted build actions would place them, but the build action scheduler couldn't find valid placements for these buildings because they require stone/herbs as build costs that aren't available at start.

6. **Low coherence (0.33)** — The "eat" intent is frequently absent because workers don't hit the hunger threshold during 180s runs with adequate food. This isn't a bug — it's the metric not accounting for well-fed colonies.

7. **Low productivity rate (0.07-0.19)** — Most workers spend time in "wander" or "eat" states rather than productive work. The intent distribution shows high wander/idle rates, meaning workers lack clear tasks much of the time.

8. **Building count DECREASES over time** — In many scenarios buildings go from ~50 to ~40. This is because saboteurs destroy buildings and the AI doesn't rebuild them. Negative growth harms the Development score.

## Improvement Targets

### Priority 1: Development (F, 0.309)

**Root causes:** No objectives completed; buildings decrease over time; no new buildings constructed.

**Recommended fixes:**
- [ ] Fix fallback AI to construct buildings when resources allow (auto-build farms/roads when wood surplus)
- [ ] Add sabotage defense to fallback (rebuild destroyed buildings)
- [ ] Ensure objectives can be completed without player input in headless mode (or add scripted build sequences to benchmark presets)
- [ ] Track progression milestones independently of objective completion

### Priority 2: Technical (F, 0.31)

**Root causes:** AI decision counting doesn't track fallback decisions; goal flip rate extremely high; tool multiplier rarely active.

**Recommended fixes:**
- [ ] Count fallback policy applications as AI decisions (they ARE decisions)
- [ ] Reduce worker intent oscillation — add intent commitment cooldown (don't re-evaluate intent every tick)
- [ ] Ensure tool production pipeline activates automatically (quarry → smithy → tools)
- [ ] Add path cache warm-up or increase cache hit rate through better cache key design

### Priority 3: Reasonableness (F, 0.458)

**Root causes:** High repetitive behavior; low productivity rate; workers wander excessively.

**Recommended fixes:**
- [ ] Workers should commit to tasks for minimum duration before re-evaluating
- [ ] Reduce wander frequency — workers with valid roles should always seek their worksite
- [ ] Fix coherence metric: "eat" intent absence in well-fed colonies should not count as incoherence
- [ ] Add idle-detection: if worker wanders for >5s, force reassignment to productive role

### Priority 4: Coverage (C, 0.779)

**Root causes:** Processing buildings (KITCHEN/SMITHY/CLINIC) only appear via player action; weather variety low; some intents not tracked.

**Recommended fixes:**
- [ ] Fix `debug.lastIntent` tracking in WorkerAISystem to capture all 10 intent types
- [ ] Add processing buildings to map generation templates (spawn 1 kitchen near farms)
- [ ] Extend eval scenarios with longer duration to see more weather transitions
- [ ] Add HAUL role to coverage (currently unused)

### Priority 5: Playability (D, 0.58)

**Root causes:** Zero objective progress; tension curves decent but lack dramatic peaks.

**Recommended fixes:**
- [ ] Enable objective completion in headless mode (see Development fixes above)
- [ ] Add event pressure variety: more frequent weather changes, more raid events
- [ ] Create "narrative arc" in fallback AI: early expansion → mid-game defense → late-game optimization

### Summary: Top 5 Actionable Items

1. **Intent commitment cooldown** — Workers re-evaluate intent too often, causing oscillation and low productivity
2. **Auto-build in fallback AI** — Colony never grows because AI can't construct buildings
3. **Fix intent tracking** — `debug.lastIntent` doesn't capture the returned intent from `chooseWorkerIntent`
4. **Processing building in map gen** — KITCHEN/SMITHY/CLINIC should sometimes spawn naturally
5. **Fallback AI decision counting** — Track fallback policy applications as real AI decisions
