# Project Utopia — Comprehensive Game Evaluation Report

> Generated: 2026-04-21 06:45:13
> Version: 0.5.4 (Phase 1: Resource Chains + Bridge)
> Scenarios: 22 | Duration: 1410s total sim time
> Scoring: 3-tier weighted (Foundation 20% + Gameplay 30% + Maturity 50%)

## Overall Score

**0.82 (B)**

| Tier | Score | Grade | Weight |
|---|---|---|---|
| **Foundation** (基础运行) | 0.925 | A | 20% |
| **Gameplay** (游戏玩法) | 0.762 | C | 30% |
| **Maturity** (游戏成熟度) | 0.813 | B | 50% |

## Tier 1: Foundation (基础运行)

| Dimension | Score | Grade | Description |
|---|---|---|---|
| Stability | 1 | A | Long-run correctness |
| Technical | 0.745 | C | AI quality, pathfinding |
| Coverage | 1.03 | A | Game element utilization |

## Tier 2: Gameplay (游戏玩法)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Development | 0.783 | C | 20% | Progressive complexity growth |
| Playability | 0.863 | B | 20% | Tension curves, engagement |
| Efficiency | 0.649 | D | 18% | Labor throughput, utilization |
| Logistics | 0.549 | D | 15% | Infrastructure quality |
| Reasonableness | 0.844 | B | 15% | NPC behavior naturalness |
| Adaptability | 0.894 | B | 12% | Crisis recovery |

## Tier 3: Maturity (游戏成熟度)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Action Duration Realism | 0.72 | C | 10% | 动作时长真实性 |
| Tile State Richness | 0.809 | B | 8% | 地块状态丰富度 |
| NPC Needs Depth | 0.844 | B | 10% | NPC需求深度 |
| Economic Feedback Loops | 0.941 | A | 8% | 经济反馈循环 |
| Spatial Layout Intelligence | 0.624 | D | 8% | 空间布局智能 |
| Temporal Realism | 0.765 | C | 7% | 时间真实性 |
| Emergent Narrative | 0.964 | A | 8% | 涌现叙事密度 |
| Decision Consequence | 0.839 | B | 9% | 决策后果深度 |
| Traffic Flow Quality | 0.759 | C | 8% | 交通流质量 |
| Population Dynamics | 0.947 | A | 8% | 人口动态真实性 |
| Environmental Responsiveness | 0.732 | C | 8% | 环境响应性 |
| System Coupling Density | 0.824 | B | 8% | 系统耦合密度 |

---

## 1. Stability (稳定性)

| Scenario | Survived | Time | NaN | Neg | Errors | Entities | Outcome |
|---|---|---|---|---|---|---|---|
| default/temperate_plains | YES | 90/90s | 0 | 0 | 0 | 28 | none |
| default/fortified_basin | YES | 90/90s | 0 | 0 | 0 | 28 | none |
| default/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 25 | none |
| scarce_resources/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 25 | none |
| abundant_resources/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 25 | none |
| resource_chains_basic/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 25 | none |
| full_processing/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 25 | none |
| tooled_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 25 | none |
| high_threat/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 28 | none |
| skeleton_crew/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 16 | none |
| large_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 33 | none |
| wildlife_heavy/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 30 | none |
| storm_start/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 25 | none |
| default/temperate_plains | YES | 90/90s | 0 | 0 | 0 | 28 | none |
| developed_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 25 | none |
| default/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 25 | none |
| default/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 25 | none |
| crisis_compound/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 19 | none |
| island_isolation/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 19 | none |
| population_boom/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 33 | none |
| late_game_siege/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 29 | none |
| no_director/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 23 | none |

## 2. Development (发展性)

| Scenario | Buildings Early→Late | Resources Early→Late | Peak Roles | Objectives |
|---|---|---|---|---|
| default | 55.83→54.57 | 2.2→3.6 | 7 | 0/3 |
| default | 92.33→94 | 2.5→3 | 7 | 1/3 |
| default | 27→29.8 | 4→4 | 6 | 0/3 |
| scarce_resources | 43.83→49.57 | 2.8→3 | 5 | 1/3 |
| abundant_resources | 52.17→55.29 | 3.2→5 | 7 | 0/3 |
| resource_chains_basic | 53→58.71 | 4→5 | 8 | 1/3 |
| full_processing | 139.67→145.57 | 7→7 | 8 | 1/3 |
| tooled_colony | 137.17→138 | 4.5→5 | 8 | 1/3 |
| high_threat | 51.17→53.86 | 3.2→5 | 7 | 1/3 |
| skeleton_crew | 44.83→45 | 4→4 | 4 | 0/3 |
| large_colony | 133.5→138 | 4→4.7 | 8 | 1/3 |
| wildlife_heavy | 23.17→22.29 | 4→3.3 | 5 | 0/3 |
| storm_start | 51.17→54.43 | 3.2→4 | 7 | 1/3 |
| default | 55→60.14 | 2.3→4.9 | 7 | 1/3 |
| developed_colony | 142.67→147 | 4→6 | 8 | 1/3 |
| default | 41.5→43 | 3→4 | 7 | 0/3 |
| default | 61→65.6 | 2.3→4 | 7 | 1/3 |
| crisis_compound | 43.83→49.43 | 3.8→2.4 | 5 | 1/3 |
| island_isolation | 17→17 | 3.8→4 | 5 | 0/3 |
| population_boom | 45.83→49 | 3.8→4 | 5 | 1/3 |
| late_game_siege | 142.67→148 | 4→6.7 | 8 | 1/3 |
| no_director | 43→42 | 4→4 | 5 | 0/3 |

## 3. Coverage (覆盖度)

| Element | Found | Expected | Missing | Score |
|---|---|---|---|---|
| Tile Types | 14 | 14 | none | 1 |
| Roles | 8 | 8 | none | 1 |
| Resources | 7 | 7 | none | 1 |
| Intents | 13 | 10 | wander | 1.3 |
| Weathers | 4 | 5 | none | 0.8 |

## 4. Playability (可玩性)

| Scenario | Tension | Variety | Resource Health | Progress | Score |
|---|---|---|---|---|---|
| default | 1 | 0.935 | 0.903 | 0 | 0.806 |
| default | 1 | 0.922 | 1 | 0.6 | 0.916 |
| default | 1 | 0.895 | 1 | 0 | 0.818 |
| scarce_resources | 1 | 0.909 | 0.952 | 0.5 | 0.886 |
| abundant_resources | 1 | 0.928 | 1 | 0 | 0.828 |
| resource_chains_basic | 1 | 0.931 | 1 | 0.5 | 0.904 |
| full_processing | 1 | 0.935 | 1 | 0.56 | 0.915 |
| tooled_colony | 1 | 0.913 | 1 | 0.6 | 0.915 |
| high_threat | 1 | 0.926 | 1 | 0.62 | 0.921 |
| skeleton_crew | 0.45 | 0.848 | 1 | 0.33 | 0.689 |
| large_colony | 1 | 0.945 | 1 | 0.6 | 0.923 |
| wildlife_heavy | 1 | 0.877 | 0.919 | 0.17 | 0.818 |
| storm_start | 1 | 0.922 | 1 | 0.56 | 0.911 |
| default | 1 | 0.934 | 1 | 0.5 | 0.905 |
| developed_colony | 1 | 0.933 | 1 | 0.61 | 0.921 |
| default | 1 | 0.906 | 1 | 0.33 | 0.872 |
| default | 1 | 0.939 | 1 | 0.55 | 0.914 |
| crisis_compound | 1 | 0.905 | 0.919 | 0.5 | 0.876 |
| island_isolation | 0.62 | 0.888 | 0.984 | 0.17 | 0.723 |
| population_boom | 1 | 0.917 | 0.984 | 0.56 | 0.905 |
| late_game_siege | 1 | 0.94 | 1 | 0.61 | 0.923 |
| no_director | 0.622 | 0.859 | 1 | 0 | 0.694 |

## 5. Technical (技术性)

| Scenario | Cache Hit | Validity | Goal Stability | AI Rate | Tool Mult | Score |
|---|---|---|---|---|---|---|
| default | 0.227 | 1 | 0.989 | 11.3/min | 1 | 0.682 |
| default | 0.269 | 1 | 0.989 | 11.3/min | 1 | 0.688 |
| default | 0.06 | 1 | 0.983 | 11/min | 1 | 0.656 |
| scarce_resources | 0.079 | 1 | 0.983 | 11/min | 1 | 0.823 |
| abundant_resources | 0.065 | 1 | 0.983 | 11/min | 1 | 0.656 |
| resource_chains_basic | 0.092 | 1 | 0.983 | 11/min | 1 | 0.66 |
| full_processing | 0.158 | 1 | 0.983 | 11/min | 1.45 | 0.87 |
| tooled_colony | 0.158 | 1 | 0.983 | 11/min | 1.45 | 0.87 |
| high_threat | 0.042 | 1 | 0.983 | 11/min | 1 | 0.653 |
| skeleton_crew | 0.107 | 1 | 0.933 | 11/min | 1 | 0.816 |
| large_colony | 0.131 | 1 | 0.99 | 11/min | 1.15 | 0.734 |
| wildlife_heavy | 0.073 | 1 | 0.967 | 11/min | 1 | 0.818 |
| storm_start | 0.035 | 1 | 0.983 | 11/min | 1 | 0.652 |
| default | 0.243 | 1 | 0.989 | 11.3/min | 1.15 | 0.751 |
| developed_colony | 0.094 | 1 | 0.983 | 11/min | 1.15 | 0.727 |
| default | 0.058 | 1 | 0.983 | 11/min | 1 | 0.655 |
| default | 0.104 | 1 | 0.983 | 11/min | 1 | 0.662 |
| crisis_compound | 0.076 | 1 | 0.9 | 11/min | 1 | 0.802 |
| island_isolation | 0.116 | 1 | 0.933 | 11/min | 1 | 0.818 |
| population_boom | 0.166 | 1 | 0.99 | 11/min | 1 | 0.841 |
| late_game_siege | 0.101 | 1 | 0.933 | 11/min | 1.15 | 0.718 |
| no_director | 0.146 | 1 | 0.983 | 11/min | 1 | 0.836 |

## 6. Reasonableness (合理性)

| Scenario | Diversity | Non-Repetition | Coherence | Productivity | Score |
|---|---|---|---|---|---|
| default | 0.784 | 1 | 1 | 0.872 | 0.897 |
| default | 0.788 | 1 | 1 | 0.881 | 0.901 |
| default | 0.773 | 0.833 | 1 | 0.886 | 0.864 |
| scarce_resources | 0.729 | 0.833 | 1 | 0.892 | 0.853 |
| abundant_resources | 0.769 | 1 | 1 | 0.892 | 0.898 |
| resource_chains_basic | 0.793 | 1 | 1 | 0.901 | 0.908 |
| full_processing | 0.782 | 0.556 | 1 | 0.893 | 0.814 |
| tooled_colony | 0.815 | 0.278 | 1 | 0.893 | 0.768 |
| high_threat | 0.774 | 0.556 | 1 | 0.894 | 0.811 |
| skeleton_crew | 0.889 | 1 | 0.67 | 0.936 | 0.881 |
| large_colony | 0.773 | 1 | 0.67 | 0.892 | 0.834 |
| wildlife_heavy | 0.767 | 0.556 | 1 | 0.893 | 0.809 |
| storm_start | 0.742 | 0.833 | 1 | 0.896 | 0.858 |
| default | 0.769 | 1 | 1 | 0.865 | 0.89 |
| developed_colony | 0.776 | 0.556 | 1 | 0.892 | 0.811 |
| default | 0.76 | 0.417 | 0.67 | 0.892 | 0.713 |
| default | 0.72 | 1 | 0.67 | 0.892 | 0.817 |
| crisis_compound | 0.883 | 1 | 1 | 0.927 | 0.943 |
| island_isolation | 0.864 | 1 | 1 | 0.902 | 0.93 |
| population_boom | 0.638 | 1 | 1 | 0.899 | 0.861 |
| late_game_siege | 0.777 | 0.556 | 1 | 0.903 | 0.815 |
| no_director | 0.728 | 0.278 | 0.67 | 0.918 | 0.683 |

## 7. Efficiency (效率)

| Scenario | Deliveries | Carry/W/Min | Idle% | Proc Util | Depot Dist | Score |
|---|---|---|---|---|---|---|
| default | 15 | 0.61 | 2.9% | 0.09 | 7.7 | 0.595 |
| default | 22 | 0.89 | 2.9% | 0 | 2.8 | 0.703 |
| default | 2 | 0.13 | 4.5% | 0 | 6.6 | 0.391 |
| scarce_resources | 13 | 0.87 | 3.9% | 0 | 4.6 | 0.886 |
| abundant_resources | 10 | 0.67 | 3.9% | 0.102 | 4.6 | 0.673 |
| resource_chains_basic | 12 | 0.8 | 3.9% | 0.045 | 3.6 | 0.712 |
| full_processing | 10 | 0.67 | 3.9% | 0.403 | 1.9 | 0.87 |
| tooled_colony | 0 | 0 | 3.9% | 0.235 | 1.9 | 0.535 |
| high_threat | 8 | 0.53 | 3.9% | 0.136 | 3.5 | 0.659 |
| skeleton_crew | 6 | 1 | 4.8% | 0 | 4.1 | 0.898 |
| large_colony | 0 | 0 | 3.6% | 0.045 | 3.9 | 0.408 |
| wildlife_heavy | 0 | 0 | 3.9% | 0 | 6.7 | 0.432 |
| storm_start | 7 | 0.47 | 3.9% | 0 | 4.7 | 0.546 |
| default | 29 | 1.18 | 2.9% | 0.181 | 5.3 | 0.751 |
| developed_colony | 10 | 0.67 | 3.9% | 0.286 | 1.8 | 0.812 |
| default | 1 | 0.07 | 4.5% | 0.034 | 6.6 | 0.382 |
| default | 9 | 0.6 | 4.5% | 0.133 | 4.5 | 0.667 |
| crisis_compound | 9 | 1.29 | 4.6% | 0 | 1.8 | 0.954 |
| island_isolation | 0 | 0 | 4.3% | 0 | 12 | 0.301 |
| population_boom | 9 | 0.39 | 3.6% | 0 | 3.9 | 0.697 |
| late_game_siege | 13 | 0.87 | 3.9% | 0.252 | 2.1 | 0.841 |
| no_director | 2 | 0.14 | 3.5% | 0 | 4.4 | 0.558 |

## 8. Adaptability (适应性)

| Scenario | Weather Chg | Weather Resp | Dips | Recovery | Deaths | Death Impact | Score |
|---|---|---|---|---|---|---|---|
| default | 6 | 0.932 | 1 | 0 | 1 | 1 | 0.68 |
| default | 4 | 0.965 | 0 | 1 | 1 | 1 | 0.99 |
| default | 7 | 0.997 | 1 | 0 | 1 | 1 | 0.699 |
| scarce_resources | 1 | 1 | 3 | 0.576 | 1 | 1 | 0.873 |
| abundant_resources | 0 | 1 | 1 | 0 | 1 | 1 | 0.7 |
| resource_chains_basic | 5 | 1 | 1 | 0.693 | 1 | 1 | 0.908 |
| full_processing | 2 | 0.98 | 1 | 0.824 | 1 | 1 | 0.941 |
| tooled_colony | 0 | 1 | 0 | 1 | 1 | 0.981 | 0.996 |
| high_threat | 0 | 1 | 0 | 1 | 1 | 0.964 | 0.993 |
| skeleton_crew | 0 | 1 | 1 | 0.999 | 1 | 0.991 | 0.998 |
| large_colony | 5 | 1 | 1 | 0.781 | 1 | 0.971 | 0.928 |
| wildlife_heavy | 7 | 0.933 | 1 | 0 | 7 | 0.914 | 0.663 |
| storm_start | 2 | 1 | 2 | 0.999 | 1 | 1 | 1 |
| default | 8 | 0.958 | 3 | 0.666 | 1 | 0.971 | 0.881 |
| developed_colony | 3 | 0.991 | 1 | 0.913 | 1 | 1 | 0.971 |
| default | 3 | 0.983 | 0 | 1 | 1 | 1 | 0.995 |
| default | 5 | 0.987 | 1 | 0.915 | 1 | 1 | 0.971 |
| crisis_compound | 0 | 1 | 4 | 0.616 | 1 | 1 | 0.885 |
| island_isolation | 4 | 0.892 | 2 | 0.5 | 1 | 0.858 | 0.789 |
| population_boom | 3 | 0.988 | 1 | 0.999 | 1 | 1 | 0.996 |
| late_game_siege | 0 | 1 | 1 | 0.423 | 1 | 1 | 0.827 |
| no_director | 1 | 0.951 | 0 | 1 | 1 | 0.964 | 0.978 |

## 9. Logistics (物流)

| Scenario | Road Coverage | Warehouse Dist | Chain Complete | Res Balance | Score |
|---|---|---|---|---|---|
| default | 0.683 | 0.269 | 0.767 | 0.3 | 0.509 |
| default | 0.861 | 0.446 | 0.767 | 0.265 | 0.58 |
| default | 0.925 | 0.227 | 0.55 | 0.448 | 0.519 |
| scarce_resources | 0.688 | 0.525 | 0.4 | 0.32 | 0.469 |
| abundant_resources | 0.948 | 0.081 | 0.767 | 0.391 | 0.537 |
| resource_chains_basic | 1 | 0 | 0.933 | 0.465 | 0.596 |
| full_processing | 0.971 | 0.482 | 1 | 0.758 | 0.804 |
| tooled_colony | 0.97 | 0.374 | 1 | 0.524 | 0.719 |
| high_threat | 0.947 | 0 | 0.767 | 0.403 | 0.52 |
| skeleton_crew | 0.814 | 0.057 | 0.4 | 0.488 | 0.419 |
| large_colony | 0.943 | 0.314 | 0.933 | 0.461 | 0.662 |
| wildlife_heavy | 0.762 | 0.511 | 0.4 | 0.391 | 0.498 |
| storm_start | 0.947 | 0.143 | 0.767 | 0.36 | 0.545 |
| default | 0.692 | 0.201 | 0.767 | 0.244 | 0.48 |
| developed_colony | 0.971 | 0.439 | 1 | 0.596 | 0.753 |
| default | 0.982 | 0.258 | 0.75 | 0.314 | 0.564 |
| default | 0.754 | 0.331 | 0.8 | 0.284 | 0.545 |
| crisis_compound | 0.689 | 0.313 | 0.4 | 0.305 | 0.412 |
| island_isolation | 0.231 | 0 | 0.4 | 0.453 | 0.279 |
| population_boom | 0.817 | 0.232 | 0.4 | 0.414 | 0.445 |
| late_game_siege | 0.971 | 0.372 | 1 | 0.58 | 0.732 |
| no_director | 0.171 | 0.526 | 0.4 | 0.847 | 0.498 |

---

## Maturity Dimension Breakdowns

### 10. Action Duration Realism (动作时长真实性)
| Scenario | Action CV | Action Ratio | Has Progress | Score |
|---|---|---|---|---|
| default | 1.113 | 0.166 | true | 1 |
| default | 1.518 | 0.114 | true | 0.905 |
| default | 0.58 | 0.052 | true | 0.656 |
| scarce_resources | 0.619 | 0.104 | true | 0.808 |
| abundant_resources | 0.554 | 0.03 | true | 0.587 |
| resource_chains_basic | 0.856 | 0.169 | true | 1 |
| full_processing | 0.106 | 0.007 | true | 0.359 |
| tooled_colony | 0.138 | 0.029 | true | 0.429 |
| high_threat | 0.391 | 0.033 | true | 0.533 |
| skeleton_crew | 0.315 | 0.25 | true | 0.818 |
| large_colony | 0 | 0.011 | true | 0.329 |
| wildlife_heavy | 1.344 | 0.239 | true | 1 |
| storm_start | 0.483 | 0.05 | true | 0.613 |
| default | 1.372 | 0.279 | true | 1 |
| developed_colony | 0.959 | 0.014 | true | 0.637 |
| default | 0.33 | 0.099 | true | 0.689 |
| default | 0.441 | 0.011 | true | 0.496 |
| crisis_compound | 0.933 | 0.329 | true | 1 |
| island_isolation | 1.081 | 0.069 | true | 0.783 |
| population_boom | 0.965 | 0.031 | true | 0.684 |
| late_game_siege | 0.75 | 0.025 | true | 0.647 |
| no_director | 0.933 | 0.104 | true | 0.877 |

### 12. NPC Needs Depth (NPC需求深度)
| Scenario | Needs | Conflicts | Satisfaction Actions | Has Mood | Score |
|---|---|---|---|---|---|
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| scarce_resources | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize,haul | true | 0.806 |
| abundant_resources | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| resource_chains_basic | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| full_processing | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| tooled_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| high_threat | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| skeleton_crew | hunger,rest,morale,social | 6 | deliver,harvest,socialize | true | 0.744 |
| large_colony | hunger,rest,morale,social | 6 | eat,harvest,process,socialize,haul | true | 0.806 |
| wildlife_heavy | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize,haul | true | 0.856 |
| storm_start | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| developed_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process,socialize,haul | true | 0.806 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process,socialize,haul | true | 0.806 |
| crisis_compound | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize,haul | true | 0.856 |
| island_isolation | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize,haul | true | 0.856 |
| population_boom | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize,haul | true | 0.806 |
| late_game_siege | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| no_director | hunger,rest,morale,social | 6 | rest,wander,deliver,harvest,socialize,haul | true | 0.837 |

### 14. Spatial Layout Intelligence (空间布局智能)
| Scenario | Cluster | Zoning | Path Eff | Expansion | Score |
|---|---|---|---|---|---|
| default | 0.371 | 0.722 | 0.652 | 0.552 | 0.588 |
| default | 0.293 | 0.84 | 0.658 | 0.391 | 0.564 |
| default | 0.86 | 0.552 | 0.614 | 0.573 | 0.637 |
| scarce_resources | 0.611 | 0.694 | 0.565 | 0.768 | 0.657 |
| abundant_resources | 0.614 | 0.554 | 0.608 | 0.765 | 0.635 |
| resource_chains_basic | 0.683 | 0.569 | 0.603 | 0.702 | 0.635 |
| full_processing | 0.43 | 0.836 | 0.608 | 0.563 | 0.618 |
| tooled_colony | 0.393 | 0.877 | 0.634 | 0.584 | 0.634 |
| high_threat | 0.662 | 0.554 | 0.583 | 0.736 | 0.63 |
| skeleton_crew | 0.509 | 0.711 | 0.634 | 0.807 | 0.671 |
| large_colony | 0.373 | 0.862 | 0.617 | 0.556 | 0.614 |
| wildlife_heavy | 0.451 | 0.636 | 0.591 | 0.471 | 0.544 |
| storm_start | 0.624 | 0.544 | 0.618 | 0.759 | 0.636 |
| default | 0.571 | 0.633 | 0.634 | 0.54 | 0.597 |
| developed_colony | 0.446 | 0.83 | 0.64 | 0.554 | 0.627 |
| default | 0.776 | 0.488 | 0.667 | 0.736 | 0.661 |
| default | 0.568 | 0.657 | 0.65 | 0.501 | 0.598 |
| crisis_compound | 0.561 | 0.694 | 0.589 | 0.803 | 0.663 |
| island_isolation | 0.19 | 0.706 | 0.629 | 0.629 | 0.561 |
| population_boom | 0.602 | 0.653 | 0.573 | 0.781 | 0.651 |
| late_game_siege | 0.446 | 0.811 | 0.606 | 0.559 | 0.613 |
| no_director | 0.556 | 0.833 | 0.535 | 0.821 | 0.685 |

### 18. Traffic Flow Quality (交通流质量)
| Scenario | Congestion | Path Div | Roads | Road Score | Gini | Score |
|---|---|---|---|---|---|---|
| default | 38 | 3 | 44 | 1 | 0.388 | 0.813 |
| default | 32 | 3 | 82 | 1 | 0.478 | 0.696 |
| default | 19 | 3 | 40 | 1 | 0.25 | 0.733 |
| scarce_resources | 32 | 3 | 28 | 0.933 | 0.297 | 0.8 |
| abundant_resources | 18 | 3 | 49 | 1 | 0.286 | 0.724 |
| resource_chains_basic | 12 | 3 | 30 | 1 | 0.298 | 0.721 |
| full_processing | 13 | 3 | 30 | 1 | 0.339 | 0.714 |
| tooled_colony | 22 | 3 | 52 | 1 | 0 | 0.887 |
| high_threat | 15 | 3 | 46 | 1 | 0.481 | 0.78 |
| skeleton_crew | 26 | 3 | 28 | 0.933 | 0 | 0.873 |
| large_colony | 28 | 3 | 36 | 1 | 0 | 0.883 |
| wildlife_heavy | 18 | 3 | 30 | 1 | 0 | 0.778 |
| storm_start | 14 | 3 | 45 | 1 | 0.525 | 0.779 |
| default | 46 | 3 | 37 | 1 | 0.556 | 0.676 |
| developed_colony | 14 | 3 | 45 | 1 | 0.429 | 0.702 |
| default | 16 | 3 | 50 | 1 | 0.278 | 0.738 |
| default | 20 | 3 | 44 | 1 | 0.416 | 0.707 |
| crisis_compound | 9 | 3 | 24 | 0.8 | 0 | 0.738 |
| island_isolation | 4 | 3 | 29 | 1 | 0 | 0.726 |
| population_boom | 28 | 3 | 27 | 0.9 | 0.482 | 0.758 |
| late_game_siege | 16 | 3 | 41 | 1 | 0.367 | 0.708 |
| no_director | 34 | 3 | 15 | 0.5 | 0 | 0.767 |

---

## Improvement Targets

### Maturity Tier — Key Gaps

- **Logistics**: 0.549 (D)
- **Spatial Layout Intelligence (空间布局智能)**: 0.624 (D)
- **Efficiency**: 0.649 (D)
- **Action Duration Realism (动作时长真实性)**: 0.72 (C)
- **Environmental Responsiveness (环境响应性)**: 0.732 (C)

### What Would Raise the Score

To meaningfully improve the Maturity tier, the game needs:
- **Multiple NPC needs** (rest, morale, social) with conflicting priorities
- **Tile state richness** (crop growth stages, building degradation, cooldowns)
- **Action duration realism** (work progress bars, variable task times)
- **Day/night cycles** affecting behavior and production
- **Social interactions** between NPCs (relationships, conversations)
- **Diminishing returns** on resource gathering
- **Worker specialization** through experience/skills
