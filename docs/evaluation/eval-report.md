# Project Utopia — Comprehensive Game Evaluation Report

> Generated: 2026-04-09 06:01:32
> Version: 0.5.4 (Phase 1: Resource Chains + Bridge)
> Scenarios: 22 | Duration: 1410s total sim time
> Scoring: 3-tier weighted (Foundation 20% + Gameplay 30% + Maturity 50%)

## Overall Score

**0.638 (D)**

| Tier | Score | Grade | Weight |
|---|---|---|---|
| **Foundation** (基础运行) | 0.956 | A | 20% |
| **Gameplay** (游戏玩法) | 0.768 | C | 30% |
| **Maturity** (游戏成熟度) | 0.432 | F | 50% |

## Tier 1: Foundation (基础运行)

| Dimension | Score | Grade | Description |
|---|---|---|---|
| Stability | 1 | A | Long-run correctness |
| Technical | 0.857 | B | AI quality, pathfinding |
| Coverage | 1.01 | A | Game element utilization |

## Tier 2: Gameplay (游戏玩法)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Development | 0.839 | B | 20% | Progressive complexity growth |
| Playability | 0.862 | B | 20% | Tension curves, engagement |
| Efficiency | 0.716 | C | 18% | Labor throughput, utilization |
| Logistics | 0.392 | F | 15% | Infrastructure quality |
| Reasonableness | 0.894 | B | 15% | NPC behavior naturalness |
| Adaptability | 0.885 | B | 12% | Crisis recovery |

## Tier 3: Maturity (游戏成熟度)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Action Duration Realism | 0.695 | C | 10% | 动作时长真实性 |
| Tile State Richness | 0.078 | F | 8% | 地块状态丰富度 |
| NPC Needs Depth | 0.519 | D | 10% | NPC需求深度 |
| Economic Feedback Loops | 0.304 | F | 8% | 经济反馈循环 |
| Spatial Layout Intelligence | 0.503 | D | 8% | 空间布局智能 |
| Temporal Realism | 0.306 | F | 7% | 时间真实性 |
| Emergent Narrative | 0.508 | D | 8% | 涌现叙事密度 |
| Decision Consequence | 0.447 | F | 9% | 决策后果深度 |
| Traffic Flow Quality | 0.393 | F | 8% | 交通流质量 |
| Population Dynamics | 0.688 | C | 8% | 人口动态真实性 |
| Environmental Responsiveness | 0.29 | F | 8% | 环境响应性 |
| System Coupling Density | 0.353 | F | 8% | 系统耦合密度 |

---

## 1. Stability (稳定性)

| Scenario | Survived | Time | NaN | Neg | Errors | Entities | Outcome |
|---|---|---|---|---|---|---|---|
| default/temperate_plains | YES | 90/90s | 0 | 0 | 0 | 20 | none |
| default/fortified_basin | YES | 90/90s | 0 | 0 | 0 | 20 | none |
| default/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 20 | none |
| scarce_resources/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 20 | none |
| abundant_resources/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 23 | none |
| resource_chains_basic/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 20 | none |
| full_processing/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 20 | none |
| tooled_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 20 | none |
| high_threat/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 23 | none |
| skeleton_crew/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 11 | none |
| large_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 28 | none |
| wildlife_heavy/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 29 | none |
| storm_start/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 20 | none |
| default/temperate_plains | YES | 90/90s | 0 | 0 | 0 | 20 | none |
| developed_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 20 | none |
| default/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 20 | none |
| default/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 20 | none |
| crisis_compound/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 14 | none |
| island_isolation/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 14 | none |
| population_boom/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 28 | none |
| late_game_siege/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| no_director/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 20 | none |

## 2. Development (发展性)

| Scenario | Buildings Early→Late | Resources Early→Late | Peak Roles | Objectives |
|---|---|---|---|---|
| default | 37.17→39 | 3→5 | 6 | 1/3 |
| default | 43.83→44 | 3→5 | 6 | 1/3 |
| default | 20.25→22.8 | 3→4.8 | 6 | 0/3 |
| scarce_resources | 49→53.29 | 2.8→5 | 6 | 1/3 |
| abundant_resources | 53.83→54.57 | 3→5 | 6 | 2/3 |
| resource_chains_basic | 55→55 | 4.5→6 | 7 | 1/3 |
| full_processing | 59→58.86 | 7→7 | 8 | 1/3 |
| tooled_colony | 54→53.86 | 4.2→5 | 6 | 1/3 |
| high_threat | 53.83→53.86 | 3→5 | 6 | 1/3 |
| skeleton_crew | 51.5→54.43 | 2.8→3 | 2 | 1/3 |
| large_colony | 50→50 | 3→3.3 | 6 | 1/3 |
| wildlife_heavy | 12.17→14.29 | 3→4 | 5 | 0/3 |
| storm_start | 53.83→53.86 | 3→5 | 6 | 1/3 |
| default | 37.17→39 | 3→5 | 6 | 1/3 |
| developed_colony | 62→62 | 4→7 | 8 | 1/3 |
| default | 82.75→83 | 3→5 | 6 | 1/3 |
| default | 38.25→41.8 | 3→3.8 | 6 | 1/3 |
| crisis_compound | 49→53 | 2.8→3.9 | 3 | 1/3 |
| island_isolation | 7→6.14 | 2→2 | 2 | 0/3 |
| population_boom | 51.5→53 | 2.8→4 | 6 | 1/3 |
| late_game_siege | 62→61.86 | 4→7 | 8 | 1/3 |
| no_director | 49→49 | 3→4 | 5 | 0/3 |

## 3. Coverage (覆盖度)

| Element | Found | Expected | Missing | Score |
|---|---|---|---|---|
| Tile Types | 14 | 14 | none | 1 |
| Roles | 8 | 8 | none | 1 |
| Resources | 7 | 7 | none | 1 |
| Intents | 12 | 10 | wander | 1.2 |
| Weathers | 4 | 5 | none | 0.8 |

## 4. Playability (可玩性)

| Scenario | Tension | Variety | Resource Health | Progress | Score |
|---|---|---|---|---|---|
| default | 1 | 0.902 | 1 | 0.79 | 0.94 |
| default | 1 | 0.906 | 1 | 0.61 | 0.913 |
| default | 1 | 0.954 | 0.881 | 0 | 0.806 |
| scarce_resources | 1 | 0.909 | 0.968 | 0.53 | 0.894 |
| abundant_resources | 0.833 | 0.905 | 1 | 1 | 0.921 |
| resource_chains_basic | 0.482 | 0.945 | 1 | 0.59 | 0.766 |
| full_processing | 1 | 0.946 | 1 | 0.69 | 0.938 |
| tooled_colony | 1 | 0.925 | 1 | 0.85 | 0.955 |
| high_threat | 0.798 | 0.901 | 1 | 0.67 | 0.859 |
| skeleton_crew | 1 | 0.77 | 0.903 | 0.5 | 0.832 |
| large_colony | 0.325 | 0.695 | 1 | 0.74 | 0.666 |
| wildlife_heavy | 1 | 0.907 | 1 | 0.25 | 0.859 |
| storm_start | 0.904 | 0.922 | 1 | 0.75 | 0.911 |
| default | 1 | 0.907 | 1 | 0.88 | 0.954 |
| developed_colony | 0.97 | 0.948 | 1 | 0.89 | 0.959 |
| default | 0.961 | 0.94 | 1 | 0.85 | 0.949 |
| default | 1 | 0.919 | 0.976 | 0.5 | 0.895 |
| crisis_compound | 1 | 0.935 | 0.968 | 0.6 | 0.912 |
| island_isolation | 1 | 0.601 | 0.516 | 0 | 0.609 |
| population_boom | 0.75 | 0.803 | 0.984 | 0.56 | 0.796 |
| late_game_siege | 1 | 0.955 | 1 | 0.82 | 0.959 |
| no_director | 0.506 | 0.92 | 1 | 0 | 0.678 |

## 5. Technical (技术性)

| Scenario | Cache Hit | Validity | Goal Stability | AI Rate | Tool Mult | Score |
|---|---|---|---|---|---|---|
| default | 0.373 | 1 | 1 | 11.3/min | 1.45 | 0.906 |
| default | 0.485 | 1 | 1 | 11.3/min | 1.45 | 0.923 |
| default | 0.176 | 1 | 1 | 11/min | 1.15 | 0.743 |
| scarce_resources | 0.114 | 1 | 0.983 | 11/min | 1.15 | 0.73 |
| abundant_resources | 0.118 | 1 | 0.983 | 11/min | 1.45 | 0.864 |
| resource_chains_basic | 0.335 | 1 | 0.983 | 11/min | 1.45 | 0.897 |
| full_processing | 0.409 | 1 | 0.983 | 11/min | 1.45 | 0.908 |
| tooled_colony | 0.278 | 1 | 0.983 | 11/min | 1.45 | 0.888 |
| high_threat | 0.232 | 1 | 0.933 | 11/min | 1.45 | 0.871 |
| skeleton_crew | 0.196 | 1 | 0.933 | 11/min | 1 | 0.833 |
| large_colony | 0.298 | 1 | 0.99 | 11/min | 1.45 | 0.893 |
| wildlife_heavy | 0.123 | 1 | 0.95 | 11/min | 1 | 0.823 |
| storm_start | 0.181 | 1 | 0.983 | 11/min | 1.45 | 0.874 |
| default | 0.31 | 1 | 1 | 11.3/min | 1.45 | 0.897 |
| developed_colony | 0.313 | 1 | 0.983 | 11/min | 1.45 | 0.894 |
| default | 0.291 | 1 | 1 | 11/min | 1.45 | 0.894 |
| default | 0.066 | 1 | 0.983 | 11/min | 1.3 | 0.79 |
| crisis_compound | 0.203 | 1 | 0.9 | 11/min | 1.3 | 0.826 |
| island_isolation | 0.255 | 1 | 0.967 | 11/min | 1 | 0.852 |
| population_boom | 0.204 | 1 | 0.99 | 11/min | 1.3 | 0.812 |
| late_game_siege | 0.271 | 1 | 0.917 | 11/min | 1.45 | 0.874 |
| no_director | 0.332 | 1 | 0.983 | 11/min | 1 | 0.871 |

## 6. Reasonableness (合理性)

| Scenario | Diversity | Non-Repetition | Coherence | Productivity | Score |
|---|---|---|---|---|---|
| default | 0.793 | 1 | 1 | 0.914 | 0.912 |
| default | 0.785 | 1 | 1 | 0.882 | 0.9 |
| default | 0.795 | 1 | 0.67 | 0.893 | 0.84 |
| scarce_resources | 0.776 | 1 | 1 | 0.898 | 0.902 |
| abundant_resources | 0.765 | 1 | 1 | 0.92 | 0.905 |
| resource_chains_basic | 0.862 | 1 | 1 | 0.911 | 0.932 |
| full_processing | 0.888 | 0.833 | 1 | 0.895 | 0.902 |
| tooled_colony | 0.815 | 1 | 1 | 0.909 | 0.917 |
| high_threat | 0.769 | 1 | 1 | 0.917 | 0.906 |
| skeleton_crew | 0.902 | 1 | 1 | 0.946 | 0.954 |
| large_colony | 0.767 | 0.556 | 0.67 | 0.823 | 0.722 |
| wildlife_heavy | 0.733 | 1 | 1 | 0.903 | 0.891 |
| storm_start | 0.789 | 1 | 1 | 0.917 | 0.912 |
| default | 0.797 | 1 | 1 | 0.911 | 0.912 |
| developed_colony | 0.878 | 1 | 1 | 0.927 | 0.942 |
| default | 0.762 | 1 | 0.67 | 0.905 | 0.834 |
| default | 0.725 | 1 | 1 | 0.909 | 0.89 |
| crisis_compound | 0.914 | 1 | 1 | 0.952 | 0.96 |
| island_isolation | 0.798 | 1 | 0.67 | 0.968 | 0.864 |
| population_boom | 0.699 | 1 | 1 | 0.776 | 0.842 |
| late_game_siege | 0.891 | 1 | 1 | 0.906 | 0.939 |
| no_director | 0.702 | 1 | 1 | 0.919 | 0.886 |

## 7. Efficiency (效率)

| Scenario | Deliveries | Carry/W/Min | Idle% | Proc Util | Depot Dist | Score |
|---|---|---|---|---|---|---|
| default | 32 | 1.78 | 3.2% | 0.178 | 4 | 0.739 |
| default | 24 | 1.33 | 3.2% | 0.138 | 5.6 | 0.625 |
| default | 9 | 0.75 | 4.8% | 0.07 | 11.5 | 0.407 |
| scarce_resources | 20 | 1.67 | 3.2% | 0.103 | 3.7 | 0.69 |
| abundant_resources | 18 | 1.4 | 3% | 0.2 | 3 | 0.708 |
| resource_chains_basic | 22 | 1.83 | 3.2% | 0.767 | 2.8 | 0.928 |
| full_processing | 6 | 0.5 | 3.2% | 0.689 | 1.7 | 0.747 |
| tooled_colony | 24 | 2 | 3.2% | 0 | 2.3 | 0.711 |
| high_threat | 20 | 1.67 | 3.2% | 0.2 | 3 | 0.75 |
| skeleton_crew | 10 | 3.33 | 3.2% | 0 | 2.4 | 0.709 |
| large_colony | 11 | 0.55 | 3.2% | 0.333 | 5.1 | 0.615 |
| wildlife_heavy | 13 | 1.08 | 3.2% | 0 | 7.7 | 0.624 |
| storm_start | 20 | 1.67 | 3.2% | 0.2 | 2.8 | 0.753 |
| default | 30 | 1.67 | 3.2% | 0.178 | 3.4 | 0.733 |
| developed_colony | 19 | 1.58 | 3.2% | 0.756 | 1.2 | 0.917 |
| default | 20 | 1.67 | 4.8% | 0.2 | 2.8 | 0.754 |
| default | 11 | 0.92 | 4.8% | 0.133 | 4.2 | 0.584 |
| crisis_compound | 12 | 3 | 3.2% | 0.207 | 3 | 0.804 |
| island_isolation | 5 | 0.83 | 3.2% | 0 | 9 | 0.542 |
| population_boom | 16 | 0.8 | 3.2% | 0.276 | 5 | 0.625 |
| late_game_siege | 25 | 2.08 | 3.2% | 0.733 | 1.4 | 0.977 |
| no_director | 18 | 1.5 | 3.2% | 0 | 3.3 | 0.819 |

## 8. Adaptability (适应性)

| Scenario | Weather Chg | Weather Resp | Dips | Recovery | Deaths | Death Impact | Score |
|---|---|---|---|---|---|---|---|
| default | 4 | 0.997 | 1 | 0.519 | 1 | 1 | 0.855 |
| default | 3 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 2 | 0.98 | 1 | 0 | 1 | 0.949 | 0.684 |
| scarce_resources | 2 | 1 | 2 | 0.259 | 1 | 1 | 0.778 |
| abundant_resources | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| resource_chains_basic | 2 | 0.983 | 1 | 0.999 | 1 | 0.949 | 0.984 |
| full_processing | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| tooled_colony | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| high_threat | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| skeleton_crew | 2 | 0.984 | 1 | 0 | 1 | 1 | 0.695 |
| large_colony | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| wildlife_heavy | 2 | 1 | 1 | 0 | 7 | 0.988 | 0.698 |
| storm_start | 3 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 4 | 1 | 1 | 0.519 | 1 | 1 | 0.856 |
| developed_colony | 4 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 2 | 0.95 | 2 | 0.226 | 1 | 1 | 0.753 |
| crisis_compound | 3 | 1 | 2 | 0.259 | 1 | 1 | 0.778 |
| island_isolation | 2 | 1 | 1 | 0 | 1 | 1 | 0.7 |
| population_boom | 2 | 1 | 1 | 0 | 1 | 1 | 0.7 |
| late_game_siege | 3 | 1 | 0 | 1 | 1 | 1 | 1 |
| no_director | 2 | 1 | 0 | 1 | 1 | 1 | 1 |

## 9. Logistics (物流)

| Scenario | Road Coverage | Warehouse Dist | Chain Complete | Res Balance | Score |
|---|---|---|---|---|---|
| default | 0.289 | 0.698 | 0.333 | 0.263 | 0.396 |
| default | 0.25 | 0.587 | 0.278 | 0.408 | 0.381 |
| default | 0.782 | 0.515 | 0.25 | 0.146 | 0.423 |
| scarce_resources | 0.181 | 0.579 | 0.167 | 0.18 | 0.277 |
| abundant_resources | 0.201 | 0.577 | 0.333 | 0.515 | 0.407 |
| resource_chains_basic | 0.233 | 0.571 | 0.667 | 0.459 | 0.482 |
| full_processing | 0.387 | 0.336 | 1 | 0.441 | 0.541 |
| tooled_colony | 0.345 | 0.364 | 0.333 | 0.574 | 0.404 |
| high_threat | 0.201 | 0.658 | 0.333 | 0.428 | 0.405 |
| skeleton_crew | 0.187 | 0.886 | 0.167 | 0.153 | 0.348 |
| large_colony | 0.231 | 0.457 | 0.333 | 0.432 | 0.363 |
| wildlife_heavy | 0.53 | 0.619 | 0 | 0.124 | 0.318 |
| storm_start | 0.201 | 0.628 | 0.333 | 0.434 | 0.399 |
| default | 0.289 | 0.669 | 0.333 | 0.269 | 0.39 |
| developed_colony | 0.441 | 0.274 | 1 | 0.571 | 0.572 |
| default | 0.368 | 0.582 | 0.333 | 0.426 | 0.427 |
| default | 0.226 | 0.572 | 0.333 | 0.16 | 0.323 |
| crisis_compound | 0.181 | 0.379 | 0.167 | 0.185 | 0.228 |
| island_isolation | 0.667 | 0.552 | 0 | 0.005 | 0.306 |
| population_boom | 0.183 | 0.632 | 0.111 | 0.182 | 0.277 |
| late_game_siege | 0.431 | 0.267 | 1 | 0.56 | 0.565 |
| no_director | 0.171 | 0.594 | 0 | 0.774 | 0.385 |

---

## Maturity Dimension Breakdowns

### 10. Action Duration Realism (动作时长真实性)
| Scenario | Action CV | Action Ratio | Has Progress | Score |
|---|---|---|---|---|
| default | 0 | 0.486 | true | 0.7 |
| default | 0 | 0.467 | true | 0.7 |
| default | 0 | 0.45 | true | 0.7 |
| scarce_resources | 0 | 0.461 | true | 0.7 |
| abundant_resources | 0 | 0.45 | true | 0.7 |
| resource_chains_basic | 0 | 0.503 | true | 0.7 |
| full_processing | 0 | 0.313 | true | 0.613 |
| tooled_colony | 0 | 0.449 | true | 0.7 |
| high_threat | 0 | 0.471 | true | 0.7 |
| skeleton_crew | 0 | 0.514 | true | 0.7 |
| large_colony | 0 | 0.41 | true | 0.7 |
| wildlife_heavy | 0 | 0.389 | true | 0.689 |
| storm_start | 0 | 0.469 | true | 0.7 |
| default | 0 | 0.513 | true | 0.7 |
| developed_colony | 0 | 0.432 | true | 0.7 |
| default | 0 | 0.447 | true | 0.7 |
| default | 0 | 0.42 | true | 0.7 |
| crisis_compound | 0 | 0.508 | true | 0.7 |
| island_isolation | 0 | 0.405 | true | 0.7 |
| population_boom | 0 | 0.406 | true | 0.7 |
| late_game_siege | 0 | 0.503 | true | 0.7 |
| no_director | 0 | 0.397 | true | 0.697 |

### 12. NPC Needs Depth (NPC需求深度)
| Scenario | Needs | Conflicts | Satisfaction Actions | Has Mood | Score |
|---|---|---|---|---|---|
| default | hunger,rest,morale | 3 | eat | true | 0.556 |
| default | hunger,rest,morale | 3 | eat | true | 0.556 |
| default | hunger,rest,morale | 3 | none | true | 0.475 |
| scarce_resources | hunger,rest,morale | 3 | eat | true | 0.556 |
| abundant_resources | hunger,rest,morale | 3 | eat | true | 0.556 |
| resource_chains_basic | hunger,rest,morale | 3 | eat | true | 0.556 |
| full_processing | hunger,rest,morale | 3 | eat | true | 0.506 |
| tooled_colony | hunger,rest,morale | 3 | eat | true | 0.506 |
| high_threat | hunger,rest,morale | 3 | eat | true | 0.506 |
| skeleton_crew | hunger,rest,morale | 3 | eat | true | 0.556 |
| large_colony | hunger,rest,morale | 3 | none | true | 0.475 |
| wildlife_heavy | hunger,rest,morale | 3 | eat | true | 0.506 |
| storm_start | hunger,rest,morale | 3 | eat | true | 0.556 |
| default | hunger,rest,morale | 3 | eat | true | 0.556 |
| developed_colony | hunger,rest,morale | 3 | eat | true | 0.506 |
| default | hunger,rest,morale | 3 | none | true | 0.475 |
| default | hunger,rest,morale | 3 | eat | true | 0.506 |
| crisis_compound | hunger,rest,morale | 3 | eat | true | 0.506 |
| island_isolation | hunger,rest,morale | 3 | none | true | 0.475 |
| population_boom | hunger,rest,morale | 3 | eat | true | 0.506 |
| late_game_siege | hunger,rest,morale | 3 | eat | true | 0.506 |
| no_director | hunger,rest,morale | 3 | eat | true | 0.506 |

### 14. Spatial Layout Intelligence (空间布局智能)
| Scenario | Cluster | Zoning | Path Eff | Expansion | Score |
|---|---|---|---|---|---|
| default | 0.107 | 0.564 | 0.4 | 0.814 | 0.471 |
| default | 0.303 | 0.795 | 0.4 | 0.433 | 0.483 |
| default | 0.952 | 0.591 | 0.4 | 0.539 | 0.621 |
| scarce_resources | 0.286 | 0.704 | 0.4 | 0.598 | 0.497 |
| abundant_resources | 0.303 | 0.709 | 0.4 | 0.607 | 0.505 |
| resource_chains_basic | 0.346 | 0.691 | 0.4 | 0.586 | 0.506 |
| full_processing | 0.624 | 0.695 | 0.4 | 0.434 | 0.538 |
| tooled_colony | 0.626 | 0.759 | 0.4 | 0.519 | 0.576 |
| high_threat | 0.303 | 0.722 | 0.4 | 0.6 | 0.506 |
| skeleton_crew | 0.286 | 0.709 | 0.4 | 0.591 | 0.496 |
| large_colony | 0.532 | 0.82 | 0.4 | 0.617 | 0.592 |
| wildlife_heavy | 0.714 | 0 | 0.4 | 0.122 | 0.309 |
| storm_start | 0.303 | 0.722 | 0.4 | 0.6 | 0.506 |
| default | 0.107 | 0.564 | 0.4 | 0.814 | 0.471 |
| developed_colony | 0.66 | 0.677 | 0.4 | 0.396 | 0.534 |
| default | 0.523 | 0.819 | 0.4 | 0.462 | 0.551 |
| default | 0 | 0.659 | 0.4 | 0.775 | 0.458 |
| crisis_compound | 0.286 | 0.717 | 0.4 | 0.605 | 0.502 |
| island_isolation | 0.524 | 0 | 0.4 | 0.68 | 0.401 |
| population_boom | 0.286 | 0.717 | 0.4 | 0.605 | 0.502 |
| late_game_siege | 0.66 | 0.677 | 0.4 | 0.396 | 0.534 |
| no_director | 0.289 | 0.816 | 0.25 | 0.627 | 0.496 |

### 18. Traffic Flow Quality (交通流质量)
| Scenario | Congestion | Path Div | Roads | Road Score | Gini | Score |
|---|---|---|---|---|---|---|
| default | 150 | 1 | 25 | 0.301 | 0 | 0.409 |
| default | 108 | 1 | 26 | 0.57 | 0 | 0.476 |
| default | 100 | 1 | 33 | 0.964 | 0 | 0.574 |
| scarce_resources | 85 | 1 | 27 | 0.142 | 0 | 0.369 |
| abundant_resources | 67 | 1 | 34 | 0.256 | 0 | 0.397 |
| resource_chains_basic | 73 | 1 | 28 | 0.149 | 0 | 0.371 |
| full_processing | 172 | 1 | 26 | 0.226 | 0 | 0.39 |
| tooled_colony | 151 | 1 | 26 | 0.306 | 0 | 0.41 |
| high_threat | 87 | 1 | 26 | 0.126 | 0 | 0.365 |
| skeleton_crew | 13 | 1 | 26 | 0.117 | 0 | 0.362 |
| large_colony | 170 | 1 | 26 | 0.39 | 0 | 0.431 |
| wildlife_heavy | 72 | 1 | 31 | 0.313 | 0 | 0.412 |
| storm_start | 88 | 1 | 26 | 0.126 | 0 | 0.365 |
| default | 163 | 1 | 25 | 0.301 | 0 | 0.409 |
| developed_colony | 93 | 1 | 26 | 0.188 | 0 | 0.38 |
| default | 61 | 1 | 26 | 0 | 0 | 0.333 |
| default | 104 | 1 | 27 | 0.311 | 0 | 0.411 |
| crisis_compound | 3 | 1 | 27 | 0.152 | 0 | 0.371 |
| island_isolation | 59 | 1 | 26 | 0 | 0 | 0.333 |
| population_boom | 154 | 1 | 28 | 0.168 | 0 | 0.375 |
| late_game_siege | 42 | 1 | 26 | 0.188 | 0 | 0.38 |
| no_director | 67 | 1 | 15 | 0 | 0 | 0.333 |

---

## Improvement Targets

### Maturity Tier — Key Gaps

- **Tile State Richness (地块状态丰富度)**: 0.078 (F)
- **Environmental Responsiveness (环境响应性)**: 0.29 (F)
- **Economic Feedback Loops (经济反馈循环)**: 0.304 (F)
- **Temporal Realism (时间真实性)**: 0.306 (F)
- **System Coupling Density (系统耦合密度)**: 0.353 (F)

### What Would Raise the Score

To meaningfully improve the Maturity tier, the game needs:
- **Multiple NPC needs** (rest, morale, social) with conflicting priorities
- **Tile state richness** (crop growth stages, building degradation, cooldowns)
- **Action duration realism** (work progress bars, variable task times)
- **Day/night cycles** affecting behavior and production
- **Social interactions** between NPCs (relationships, conversations)
- **Diminishing returns** on resource gathering
- **Worker specialization** through experience/skills
