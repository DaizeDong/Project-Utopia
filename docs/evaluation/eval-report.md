# Project Utopia — Comprehensive Game Evaluation Report

> Generated: 2026-04-09 06:54:44
> Version: 0.5.4 (Phase 1: Resource Chains + Bridge)
> Scenarios: 22 | Duration: 1410s total sim time
> Scoring: 3-tier weighted (Foundation 20% + Gameplay 30% + Maturity 50%)

## Overall Score

**0.746 (C)**

| Tier | Score | Grade | Weight |
|---|---|---|---|
| **Foundation** (基础运行) | 0.965 | A | 20% |
| **Gameplay** (游戏玩法) | 0.752 | C | 30% |
| **Maturity** (游戏成熟度) | 0.655 | C | 50% |

## Tier 1: Foundation (基础运行)

| Dimension | Score | Grade | Description |
|---|---|---|---|
| Stability | 1 | A | Long-run correctness |
| Technical | 0.846 | B | AI quality, pathfinding |
| Coverage | 1.05 | A | Game element utilization |

## Tier 2: Gameplay (游戏玩法)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Development | 0.833 | B | 20% | Progressive complexity growth |
| Playability | 0.856 | B | 20% | Tension curves, engagement |
| Efficiency | 0.668 | C | 18% | Labor throughput, utilization |
| Logistics | 0.394 | F | 15% | Infrastructure quality |
| Reasonableness | 0.872 | B | 15% | NPC behavior naturalness |
| Adaptability | 0.871 | B | 12% | Crisis recovery |

## Tier 3: Maturity (游戏成熟度)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Action Duration Realism | 0.8 | C | 10% | 动作时长真实性 |
| Tile State Richness | 0.656 | C | 8% | 地块状态丰富度 |
| NPC Needs Depth | 0.619 | D | 10% | NPC需求深度 |
| Economic Feedback Loops | 0.739 | C | 8% | 经济反馈循环 |
| Spatial Layout Intelligence | 0.556 | D | 8% | 空间布局智能 |
| Temporal Realism | 0.731 | C | 7% | 时间真实性 |
| Emergent Narrative | 0.563 | D | 8% | 涌现叙事密度 |
| Decision Consequence | 0.644 | D | 9% | 决策后果深度 |
| Traffic Flow Quality | 0.559 | D | 8% | 交通流质量 |
| Population Dynamics | 0.694 | C | 8% | 人口动态真实性 |
| Environmental Responsiveness | 0.632 | D | 8% | 环境响应性 |
| System Coupling Density | 0.645 | D | 8% | 系统耦合密度 |

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
| default | 43.83→44.29 | 3→5 | 6 | 1/3 |
| default | 20.25→22.6 | 3→5 | 6 | 0/3 |
| scarce_resources | 49→53 | 2.8→4 | 6 | 1/3 |
| abundant_resources | 53.83→54 | 3→5 | 6 | 2/3 |
| resource_chains_basic | 55→54.86 | 4.5→6 | 7 | 1/3 |
| full_processing | 59→59 | 7→7 | 8 | 1/3 |
| tooled_colony | 54→54 | 4.2→5 | 6 | 1/3 |
| high_threat | 53.83→53.86 | 3→5 | 6 | 1/3 |
| skeleton_crew | 51.5→53 | 2.8→2.4 | 2 | 1/3 |
| large_colony | 50→50 | 3→3 | 6 | 1/3 |
| wildlife_heavy | 12.17→13 | 3→4 | 5 | 0/3 |
| storm_start | 53.83→54 | 3→5 | 6 | 1/3 |
| default | 37.17→39 | 3→5 | 6 | 1/3 |
| developed_colony | 62→62 | 4→7 | 8 | 1/3 |
| default | 82.75→82.8 | 3→5 | 6 | 1/3 |
| default | 38.25→40.6 | 3→4.8 | 6 | 1/3 |
| crisis_compound | 49→53 | 2.8→3.9 | 3 | 1/3 |
| island_isolation | 7→6.86 | 2→2.3 | 2 | 0/3 |
| population_boom | 51.5→53.14 | 2.8→4 | 6 | 1/3 |
| late_game_siege | 62→61.86 | 4→7 | 8 | 1/3 |
| no_director | 49→48.71 | 3→4 | 5 | 0/3 |

## 3. Coverage (覆盖度)

| Element | Found | Expected | Missing | Score |
|---|---|---|---|---|
| Tile Types | 14 | 14 | none | 1 |
| Roles | 8 | 8 | none | 1 |
| Resources | 7 | 7 | none | 1 |
| Intents | 14 | 10 | none | 1.4 |
| Weathers | 4 | 5 | none | 0.8 |

## 4. Playability (可玩性)

| Scenario | Tension | Variety | Resource Health | Progress | Score |
|---|---|---|---|---|---|
| default | 1 | 0.909 | 1 | 0.84 | 0.95 |
| default | 1 | 0.931 | 1 | 0.57 | 0.914 |
| default | 1 | 0.941 | 1 | 0 | 0.832 |
| scarce_resources | 1 | 0.9 | 0.968 | 0.62 | 0.905 |
| abundant_resources | 0.786 | 0.924 | 1 | 1 | 0.913 |
| resource_chains_basic | 0.525 | 0.945 | 1 | 0.59 | 0.78 |
| full_processing | 1 | 0.952 | 1 | 0.72 | 0.943 |
| tooled_colony | 1 | 0.906 | 1 | 0.93 | 0.962 |
| high_threat | 0.578 | 0.917 | 1 | 0.61 | 0.79 |
| skeleton_crew | 0.967 | 0.692 | 0.903 | 0.5 | 0.798 |
| large_colony | 0.322 | 0.742 | 1 | 0.74 | 0.681 |
| wildlife_heavy | 1 | 0.877 | 1 | 0.17 | 0.838 |
| storm_start | 0.819 | 0.927 | 1 | 0.84 | 0.899 |
| default | 1 | 0.922 | 1 | 0.89 | 0.96 |
| developed_colony | 0.989 | 0.954 | 1 | 0.85 | 0.96 |
| default | 0.818 | 0.932 | 1 | 0.71 | 0.882 |
| default | 1 | 0.903 | 0.976 | 0.5 | 0.89 |
| crisis_compound | 1 | 0.916 | 0.968 | 0.56 | 0.901 |
| island_isolation | 1 | 0.695 | 0.5 | 0 | 0.634 |
| population_boom | 1 | 0.825 | 0.984 | 0.56 | 0.877 |
| late_game_siege | 0.869 | 0.944 | 1 | 0.5 | 0.869 |
| no_director | 0.502 | 0.883 | 1 | 0 | 0.665 |

## 5. Technical (技术性)

| Scenario | Cache Hit | Validity | Goal Stability | AI Rate | Tool Mult | Score |
|---|---|---|---|---|---|---|
| default | 0.321 | 1 | 1 | 11.3/min | 1.45 | 0.898 |
| default | 0.518 | 1 | 1 | 11.3/min | 1.45 | 0.928 |
| default | 0.163 | 1 | 1 | 11/min | 1.15 | 0.741 |
| scarce_resources | 0.206 | 1 | 0.983 | 11/min | 1 | 0.677 |
| abundant_resources | 0.143 | 1 | 0.983 | 11/min | 1.45 | 0.868 |
| resource_chains_basic | 0.293 | 1 | 0.983 | 11/min | 1.45 | 0.891 |
| full_processing | 0.427 | 1 | 0.983 | 11/min | 1.45 | 0.911 |
| tooled_colony | 0.46 | 1 | 0.983 | 11/min | 1.45 | 0.916 |
| high_threat | 0.26 | 1 | 0.933 | 11/min | 1.45 | 0.876 |
| skeleton_crew | 0.411 | 1 | 0.933 | 11/min | 1 | 0.873 |
| large_colony | 0.391 | 1 | 0.99 | 11/min | 1 | 0.707 |
| wildlife_heavy | 0.148 | 1 | 0.983 | 11/min | 1 | 0.836 |
| storm_start | 0.222 | 1 | 0.983 | 11/min | 1.45 | 0.88 |
| default | 0.317 | 1 | 1 | 11.3/min | 1.45 | 0.898 |
| developed_colony | 0.459 | 1 | 0.983 | 11/min | 1.45 | 0.916 |
| default | 0.269 | 1 | 1 | 11/min | 1.45 | 0.89 |
| default | 0.083 | 1 | 0.983 | 11/min | 1.3 | 0.792 |
| crisis_compound | 0.175 | 1 | 0.85 | 11/min | 1.3 | 0.808 |
| island_isolation | 0.324 | 1 | 0.967 | 11/min | 1 | 0.865 |
| population_boom | 0.243 | 1 | 0.99 | 11/min | 1 | 0.684 |
| late_game_siege | 0.378 | 1 | 0.917 | 11/min | 1.45 | 0.89 |
| no_director | 0.329 | 1 | 0.983 | 11/min | 1 | 0.87 |

## 6. Reasonableness (合理性)

| Scenario | Diversity | Non-Repetition | Coherence | Productivity | Score |
|---|---|---|---|---|---|
| default | 0.777 | 1 | 1 | 0.89 | 0.9 |
| default | 0.782 | 1 | 1 | 0.882 | 0.899 |
| default | 0.745 | 1 | 0.67 | 0.901 | 0.828 |
| scarce_resources | 0.755 | 1 | 1 | 0.903 | 0.898 |
| abundant_resources | 0.762 | 1 | 1 | 0.906 | 0.9 |
| resource_chains_basic | 0.844 | 1 | 1 | 0.898 | 0.923 |
| full_processing | 0.882 | 1 | 1 | 0.892 | 0.932 |
| tooled_colony | 0.799 | 1 | 1 | 0.892 | 0.907 |
| high_threat | 0.739 | 1 | 1 | 0.914 | 0.896 |
| skeleton_crew | 0.8 | 1 | 1 | 0.946 | 0.924 |
| large_colony | 0.77 | 0.556 | 0.67 | 0.605 | 0.658 |
| wildlife_heavy | 0.738 | 0.833 | 1 | 0.906 | 0.86 |
| storm_start | 0.767 | 1 | 1 | 0.909 | 0.903 |
| default | 0.804 | 1 | 1 | 0.858 | 0.898 |
| developed_colony | 0.888 | 0.278 | 1 | 0.887 | 0.788 |
| default | 0.705 | 1 | 0.67 | 0.905 | 0.817 |
| default | 0.746 | 1 | 1 | 0.929 | 0.902 |
| crisis_compound | 0.915 | 1 | 1 | 0.952 | 0.96 |
| island_isolation | 0.736 | 1 | 1 | 0.962 | 0.909 |
| population_boom | 0.806 | 1 | 1 | 0.674 | 0.844 |
| late_game_siege | 0.872 | 0.556 | 1 | 0.895 | 0.841 |
| no_director | 0.687 | 0.556 | 1 | 0.906 | 0.789 |

## 7. Efficiency (效率)

| Scenario | Deliveries | Carry/W/Min | Idle% | Proc Util | Depot Dist | Score |
|---|---|---|---|---|---|---|
| default | 31 | 1.72 | 3.2% | 0.133 | 3.4 | 0.718 |
| default | 23 | 1.28 | 3.2% | 0.184 | 5.3 | 0.645 |
| default | 6 | 0.5 | 4.8% | 0.07 | 8.7 | 0.414 |
| scarce_resources | 19 | 1.58 | 3.5% | 0 | 3.6 | 0.627 |
| abundant_resources | 18 | 1.37 | 3.9% | 0.2 | 4 | 0.689 |
| resource_chains_basic | 11 | 0.92 | 3.2% | 0.733 | 3 | 0.787 |
| full_processing | 12 | 1 | 3.2% | 0.711 | 1.6 | 0.823 |
| tooled_colony | 17 | 1.42 | 3.2% | 0 | 2.5 | 0.62 |
| high_threat | 17 | 1.42 | 3.2% | 0.2 | 3.5 | 0.705 |
| skeleton_crew | 3 | 1 | 3.2% | 0 | 3 | 0.55 |
| large_colony | 3 | 0.15 | 3.2% | 0 | 6.7 | 0.361 |
| wildlife_heavy | 16 | 1.33 | 3.2% | 0 | 8.4 | 0.657 |
| storm_start | 20 | 1.67 | 3.2% | 0.2 | 2.9 | 0.751 |
| default | 32 | 1.78 | 3.2% | 0.133 | 3.4 | 0.727 |
| developed_colony | 4 | 0.33 | 3.2% | 0.711 | 1.6 | 0.724 |
| default | 24 | 2 | 4.8% | 0.267 | 3.4 | 0.827 |
| default | 19 | 1.58 | 4.8% | 0.133 | 3.7 | 0.693 |
| crisis_compound | 5 | 1.25 | 3.2% | 0.218 | 3.1 | 0.694 |
| island_isolation | 3 | 0.5 | 3.2% | 0 | 8.4 | 0.491 |
| population_boom | 22 | 1.1 | 3.2% | 0 | 4.3 | 0.543 |
| late_game_siege | 11 | 0.92 | 3.2% | 0.756 | 2.1 | 0.803 |
| no_director | 19 | 1.58 | 3.2% | 0 | 3.2 | 0.837 |

## 8. Adaptability (适应性)

| Scenario | Weather Chg | Weather Resp | Dips | Recovery | Deaths | Death Impact | Score |
|---|---|---|---|---|---|---|---|
| default | 2 | 1 | 1 | 0.519 | 1 | 1 | 0.856 |
| default | 3 | 1 | 1 | 0 | 1 | 1 | 0.7 |
| default | 2 | 1 | 1 | 0 | 1 | 0.946 | 0.689 |
| scarce_resources | 2 | 1 | 2 | 0.258 | 1 | 1 | 0.778 |
| abundant_resources | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| resource_chains_basic | 2 | 0.97 | 1 | 0.999 | 1 | 0.927 | 0.976 |
| full_processing | 2 | 1 | 0 | 1 | 1 | 0.995 | 0.999 |
| tooled_colony | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| high_threat | 2 | 0.958 | 0 | 1 | 1 | 1 | 0.987 |
| skeleton_crew | 2 | 0.972 | 1 | 0 | 1 | 1 | 0.691 |
| large_colony | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| wildlife_heavy | 2 | 1 | 1 | 0 | 7 | 0.979 | 0.696 |
| storm_start | 3 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 2 | 1 | 1 | 0.519 | 1 | 1 | 0.856 |
| developed_colony | 2 | 1 | 0 | 1 | 1 | 0.996 | 0.999 |
| default | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 2 | 0.972 | 2 | 0.226 | 0 | 1 | 0.759 |
| crisis_compound | 3 | 1 | 2 | 0.254 | 1 | 1 | 0.776 |
| island_isolation | 2 | 1 | 1 | 0 | 1 | 1 | 0.7 |
| population_boom | 2 | 1 | 1 | 0 | 1 | 1 | 0.7 |
| late_game_siege | 3 | 1 | 0 | 1 | 1 | 1 | 1 |
| no_director | 2 | 1 | 0 | 1 | 1 | 1 | 1 |

## 9. Logistics (物流)

| Scenario | Road Coverage | Warehouse Dist | Chain Complete | Res Balance | Score |
|---|---|---|---|---|---|
| default | 0.289 | 0.67 | 0.333 | 0.26 | 0.388 |
| default | 0.25 | 0.552 | 0.278 | 0.422 | 0.375 |
| default | 0.782 | 0.589 | 0.25 | 0.148 | 0.442 |
| scarce_resources | 0.181 | 0.532 | 0.167 | 0.182 | 0.266 |
| abundant_resources | 0.201 | 0.557 | 0.333 | 0.523 | 0.404 |
| resource_chains_basic | 0.233 | 0.59 | 0.667 | 0.459 | 0.487 |
| full_processing | 0.387 | 0.298 | 1 | 0.473 | 0.539 |
| tooled_colony | 0.345 | 0.349 | 0.333 | 0.584 | 0.403 |
| high_threat | 0.201 | 0.643 | 0.333 | 0.402 | 0.395 |
| skeleton_crew | 0.183 | 0.875 | 0.111 | 0.203 | 0.343 |
| large_colony | 0.231 | 0.428 | 0.333 | 0.449 | 0.361 |
| wildlife_heavy | 0.53 | 0.59 | 0 | 0.137 | 0.314 |
| storm_start | 0.201 | 0.664 | 0.333 | 0.446 | 0.411 |
| default | 0.289 | 0.726 | 0.333 | 0.282 | 0.407 |
| developed_colony | 0.441 | 0.266 | 1 | 0.596 | 0.576 |
| default | 0.368 | 0.601 | 0.333 | 0.422 | 0.431 |
| default | 0.231 | 0.653 | 0.333 | 0.177 | 0.349 |
| crisis_compound | 0.181 | 0.368 | 0.167 | 0.185 | 0.225 |
| island_isolation | 0.667 | 0.486 | 0 | 0.004 | 0.289 |
| population_boom | 0.183 | 0.657 | 0.167 | 0.203 | 0.303 |
| late_game_siege | 0.441 | 0.261 | 1 | 0.598 | 0.575 |
| no_director | 0.171 | 0.585 | 0 | 0.802 | 0.389 |

---

## Maturity Dimension Breakdowns

### 10. Action Duration Realism (动作时长真实性)
| Scenario | Action CV | Action Ratio | Has Progress | Score |
|---|---|---|---|---|
| default | 1.234 | 0.459 | true | 1 |
| default | 1.295 | 0.372 | true | 0.972 |
| default | 0.869 | 0.242 | true | 0.842 |
| scarce_resources | 0.777 | 0.276 | true | 0.867 |
| abundant_resources | 1.004 | 0.326 | true | 0.926 |
| resource_chains_basic | 0.992 | 0.222 | true | 0.822 |
| full_processing | 0.971 | 0.172 | true | 0.772 |
| tooled_colony | 0.986 | 0.174 | true | 0.774 |
| high_threat | 0.727 | 0.212 | true | 0.785 |
| skeleton_crew | 0.204 | 0.091 | true | 0.468 |
| large_colony | 0 | 0.005 | true | 0.305 |
| wildlife_heavy | 1.038 | 0.302 | true | 0.902 |
| storm_start | 0.996 | 0.349 | true | 0.949 |
| default | 1.049 | 0.38 | true | 0.98 |
| developed_colony | 0.326 | 0.076 | true | 0.498 |
| default | 0.885 | 0.263 | true | 0.863 |
| default | 0.966 | 0.405 | true | 1 |
| crisis_compound | 0.471 | 0.111 | true | 0.587 |
| island_isolation | 0.611 | 0.178 | true | 0.707 |
| population_boom | 1.182 | 0.424 | true | 1 |
| late_game_siege | 0.82 | 0.074 | true | 0.674 |
| no_director | 1.325 | 0.307 | true | 0.907 |

### 12. NPC Needs Depth (NPC需求深度)
| Scenario | Needs | Conflicts | Satisfaction Actions | Has Mood | Score |
|---|---|---|---|---|---|
| default | hunger,rest,morale | 3 | eat,deliver,harvest,process | true | 0.65 |
| default | hunger,rest,morale | 3 | eat,deliver,harvest,process | true | 0.65 |
| default | hunger,rest,morale | 3 | deliver,harvest,process | true | 0.569 |
| scarce_resources | hunger,rest,morale | 3 | eat,wander,deliver,harvest,process | true | 0.681 |
| abundant_resources | hunger,rest,morale | 3 | eat,deliver,harvest,process | true | 0.6 |
| resource_chains_basic | hunger,rest,morale | 3 | eat,deliver,harvest,process | true | 0.6 |
| full_processing | hunger,rest,morale | 3 | eat,deliver,harvest,process | true | 0.6 |
| tooled_colony | hunger,rest,morale | 3 | eat,deliver,harvest,process | true | 0.65 |
| high_threat | hunger,rest,morale | 3 | eat,deliver,harvest,process | true | 0.65 |
| skeleton_crew | hunger,rest,morale | 3 | eat,deliver,harvest | true | 0.619 |
| large_colony | hunger,rest,morale | 3 | deliver,harvest | true | 0.538 |
| wildlife_heavy | hunger,rest,morale | 3 | eat,deliver,harvest | true | 0.619 |
| storm_start | hunger,rest,morale | 3 | eat,deliver,harvest,process | true | 0.6 |
| default | hunger,rest,morale | 3 | eat,deliver,harvest,process | true | 0.65 |
| developed_colony | hunger,rest,morale | 3 | eat,deliver,harvest,process | true | 0.6 |
| default | hunger,rest,morale | 3 | deliver,harvest,process | true | 0.569 |
| default | hunger,rest,morale | 3 | eat,deliver,harvest,process | true | 0.65 |
| crisis_compound | hunger,rest,morale | 3 | eat,deliver,harvest,process | true | 0.6 |
| island_isolation | hunger,rest,morale | 3 | eat,deliver,harvest | true | 0.569 |
| population_boom | hunger,rest,morale | 3 | eat,deliver,harvest | true | 0.569 |
| late_game_siege | hunger,rest,morale | 3 | eat,rest,wander,deliver,harvest,process | true | 0.713 |
| no_director | hunger,rest,morale | 3 | eat,rest,wander,deliver,harvest | true | 0.681 |

### 14. Spatial Layout Intelligence (空间布局智能)
| Scenario | Cluster | Zoning | Path Eff | Expansion | Score |
|---|---|---|---|---|---|
| default | 0.107 | 0.564 | 0.561 | 0.814 | 0.512 |
| default | 0.303 | 0.8 | 0.612 | 0.424 | 0.535 |
| default | 0.731 | 0.5 | 0.697 | 0.504 | 0.608 |
| scarce_resources | 0.286 | 0.717 | 0.615 | 0.605 | 0.556 |
| abundant_resources | 0.303 | 0.722 | 0.542 | 0.6 | 0.542 |
| resource_chains_basic | 0.346 | 0.691 | 0.517 | 0.586 | 0.535 |
| full_processing | 0.624 | 0.695 | 0.601 | 0.434 | 0.588 |
| tooled_colony | 0.626 | 0.759 | 0.602 | 0.519 | 0.627 |
| high_threat | 0.303 | 0.722 | 0.544 | 0.6 | 0.542 |
| skeleton_crew | 0.264 | 0.755 | 0.547 | 0.598 | 0.541 |
| large_colony | 0.532 | 0.82 | 0.552 | 0.617 | 0.63 |
| wildlife_heavy | 0.714 | 0 | 0.64 | 0.411 | 0.441 |
| storm_start | 0.303 | 0.722 | 0.508 | 0.6 | 0.533 |
| default | 0.107 | 0.564 | 0.501 | 0.814 | 0.497 |
| developed_colony | 0.66 | 0.677 | 0.641 | 0.396 | 0.594 |
| default | 0.523 | 0.819 | 0.543 | 0.462 | 0.587 |
| default | 0 | 0.65 | 0.614 | 0.768 | 0.508 |
| crisis_compound | 0.286 | 0.717 | 0.597 | 0.605 | 0.551 |
| island_isolation | 0.417 | 0.667 | 0.607 | 0.421 | 0.528 |
| population_boom | 0.286 | 0.704 | 0.577 | 0.598 | 0.541 |
| late_game_siege | 0.64 | 0.705 | 0.626 | 0.404 | 0.594 |
| no_director | 0.524 | 0.854 | 0.53 | 0.634 | 0.635 |

### 18. Traffic Flow Quality (交通流质量)
| Scenario | Congestion | Path Div | Roads | Road Score | Gini | Score |
|---|---|---|---|---|---|---|
| default | 158 | 3 | 25 | 0.301 | 0.397 | 0.553 |
| default | 146 | 3 | 25 | 0.501 | 0.452 | 0.592 |
| default | 99 | 3 | 34 | 0.923 | 0.025 | 0.779 |
| scarce_resources | 85 | 3 | 28 | 0.168 | 0.251 | 0.567 |
| abundant_resources | 48 | 3 | 33 | 0.24 | 0.419 | 0.533 |
| resource_chains_basic | 42 | 3 | 28 | 0.149 | 0.546 | 0.484 |
| full_processing | 81 | 3 | 26 | 0.226 | 0.5 | 0.525 |
| tooled_colony | 113 | 3 | 26 | 0.306 | 0.333 | 0.575 |
| high_threat | 78 | 3 | 26 | 0.126 | 0.233 | 0.547 |
| skeleton_crew | 12 | 2 | 27 | 0.152 | 0 | 0.533 |
| large_colony | 212 | 3 | 26 | 0.39 | 0.086 | 0.631 |
| wildlife_heavy | 78 | 3 | 34 | 0 | 0.48 | 0.492 |
| storm_start | 54 | 3 | 26 | 0.126 | 0.44 | 0.499 |
| default | 113 | 3 | 25 | 0.301 | 0.474 | 0.526 |
| developed_colony | 52 | 3 | 26 | 0.188 | 0.357 | 0.554 |
| default | 51 | 3 | 26 | 0 | 0.045 | 0.56 |
| default | 75 | 3 | 26 | 0.306 | 0.337 | 0.576 |
| crisis_compound | 6 | 3 | 28 | 0.168 | 0 | 0.613 |
| island_isolation | 38 | 2 | 22 | 0 | 0 | 0.515 |
| population_boom | 152 | 3 | 27 | 0.142 | 0.309 | 0.542 |
| late_game_siege | 48 | 3 | 26 | 0.2 | 0.391 | 0.547 |
| no_director | 46 | 3 | 15 | 0 | 0 | 0.566 |

---

## Improvement Targets

### Maturity Tier — Key Gaps

- **Logistics**: 0.394 (F)
- **Spatial Layout Intelligence (空间布局智能)**: 0.556 (D)
- **Traffic Flow Quality (交通流质量)**: 0.559 (D)
- **Emergent Narrative (涌现叙事密度)**: 0.563 (D)
- **NPC Needs Depth (NPC需求深度)**: 0.619 (D)

### What Would Raise the Score

To meaningfully improve the Maturity tier, the game needs:
- **Multiple NPC needs** (rest, morale, social) with conflicting priorities
- **Tile state richness** (crop growth stages, building degradation, cooldowns)
- **Action duration realism** (work progress bars, variable task times)
- **Day/night cycles** affecting behavior and production
- **Social interactions** between NPCs (relationships, conversations)
- **Diminishing returns** on resource gathering
- **Worker specialization** through experience/skills
