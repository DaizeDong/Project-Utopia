# Project Utopia — Comprehensive Game Evaluation Report

> Generated: 2026-04-09 21:26:14
> Version: 0.5.4 (Phase 1: Resource Chains + Bridge)
> Scenarios: 22 | Duration: 1410s total sim time
> Scoring: 3-tier weighted (Foundation 20% + Gameplay 30% + Maturity 50%)

## Overall Score

**0.823 (B)**

| Tier | Score | Grade | Weight |
|---|---|---|---|
| **Foundation** (基础运行) | 0.963 | A | 20% |
| **Gameplay** (游戏玩法) | 0.786 | C | 30% |
| **Maturity** (游戏成熟度) | 0.789 | C | 50% |

## Tier 1: Foundation (基础运行)

| Dimension | Score | Grade | Description |
|---|---|---|---|
| Stability | 1 | A | Long-run correctness |
| Technical | 0.82 | B | AI quality, pathfinding |
| Coverage | 1.07 | A | Game element utilization |

## Tier 2: Gameplay (游戏玩法)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Development | 0.795 | C | 20% | Progressive complexity growth |
| Playability | 0.852 | B | 20% | Tension curves, engagement |
| Efficiency | 0.737 | C | 18% | Labor throughput, utilization |
| Logistics | 0.573 | D | 15% | Infrastructure quality |
| Reasonableness | 0.858 | B | 15% | NPC behavior naturalness |
| Adaptability | 0.91 | A | 12% | Crisis recovery |

## Tier 3: Maturity (游戏成熟度)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Action Duration Realism | 0.745 | C | 10% | 动作时长真实性 |
| Tile State Richness | 0.788 | C | 8% | 地块状态丰富度 |
| NPC Needs Depth | 0.846 | B | 10% | NPC需求深度 |
| Economic Feedback Loops | 0.818 | B | 8% | 经济反馈循环 |
| Spatial Layout Intelligence | 0.558 | D | 8% | 空间布局智能 |
| Temporal Realism | 0.735 | C | 7% | 时间真实性 |
| Emergent Narrative | 0.951 | A | 8% | 涌现叙事密度 |
| Decision Consequence | 0.777 | C | 9% | 决策后果深度 |
| Traffic Flow Quality | 0.755 | C | 8% | 交通流质量 |
| Population Dynamics | 0.939 | A | 8% | 人口动态真实性 |
| Environmental Responsiveness | 0.774 | C | 8% | 环境响应性 |
| System Coupling Density | 0.776 | C | 8% | 系统耦合密度 |

---

## 1. Stability (稳定性)

| Scenario | Survived | Time | NaN | Neg | Errors | Entities | Outcome |
|---|---|---|---|---|---|---|---|
| default/temperate_plains | YES | 90/90s | 0 | 0 | 0 | 26 | none |
| default/fortified_basin | YES | 90/90s | 0 | 0 | 0 | 26 | none |
| default/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 22 | none |
| scarce_resources/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| abundant_resources/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| resource_chains_basic/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| full_processing/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| tooled_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| high_threat/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 27 | none |
| skeleton_crew/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 15 | none |
| large_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 32 | none |
| wildlife_heavy/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 29 | none |
| storm_start/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| default/temperate_plains | YES | 90/90s | 0 | 0 | 0 | 26 | none |
| developed_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| default/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| default/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| crisis_compound/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 18 | none |
| island_isolation/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 18 | none |
| population_boom/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 32 | none |
| late_game_siege/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 28 | none |
| no_director/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 23 | none |

## 2. Development (发展性)

| Scenario | Buildings Early→Late | Resources Early→Late | Peak Roles | Objectives |
|---|---|---|---|---|
| default | 39→40 | 3→6 | 7 | 1/3 |
| default | 44.67→45 | 3.7→4 | 7 | 1/3 |
| default | 18.5→17.4 | 3→3.8 | 5 | 0/3 |
| scarce_resources | 49.83→51.14 | 2.8→4 | 5 | 1/3 |
| abundant_resources | 55.33→56 | 3→6 | 7 | 1/3 |
| resource_chains_basic | 55.83→56 | 4→6.4 | 8 | 1/3 |
| full_processing | 59→59 | 7→7 | 8 | 1/3 |
| tooled_colony | 56.83→58 | 4.8→6 | 8 | 1/3 |
| high_threat | 54.67→56 | 3→6 | 8 | 1/3 |
| skeleton_crew | 50→51.57 | 3.8→3.9 | 4 | 0/3 |
| large_colony | 51.67→52 | 4.3→5 | 8 | 1/3 |
| wildlife_heavy | 10.5→11.43 | 3→4 | 6 | 0/3 |
| storm_start | 54.67→56 | 3→5.7 | 8 | 1/3 |
| default | 39→40 | 3→6 | 7 | 1/3 |
| developed_colony | 62.83→63 | 4→7 | 8 | 1/3 |
| default | 84→84.8 | 2.5→4.6 | 7 | 1/3 |
| default | 39.5→41 | 3.3→5.4 | 7 | 1/3 |
| crisis_compound | 49.83→51.14 | 3.8→4 | 4 | 1/3 |
| island_isolation | 7→5.57 | 3→4 | 3 | 0/3 |
| population_boom | 50→50.29 | 3.8→4 | 5 | 0/3 |
| late_game_siege | 62.83→63 | 4→7 | 8 | 1/3 |
| no_director | 49→47 | 4→4 | 5 | 0/3 |

## 3. Coverage (覆盖度)

| Element | Found | Expected | Missing | Score |
|---|---|---|---|---|
| Tile Types | 14 | 14 | none | 1 |
| Roles | 8 | 8 | none | 1 |
| Resources | 7 | 7 | none | 1 |
| Intents | 15 | 10 | none | 1.5 |
| Weathers | 4 | 5 | none | 0.8 |

## 4. Playability (可玩性)

| Scenario | Tension | Variety | Resource Health | Progress | Score |
|---|---|---|---|---|---|
| default | 1 | 0.916 | 1 | 0.82 | 0.948 |
| default | 0.852 | 0.915 | 1 | 0.59 | 0.869 |
| default | 1 | 0.899 | 0.857 | 0 | 0.784 |
| scarce_resources | 0.871 | 0.911 | 0.952 | 0.57 | 0.858 |
| abundant_resources | 0.832 | 0.921 | 1 | 0.61 | 0.867 |
| resource_chains_basic | 0.659 | 0.933 | 1 | 0.59 | 0.816 |
| full_processing | 0.991 | 0.914 | 1 | 0.6 | 0.912 |
| tooled_colony | 1 | 0.919 | 1 | 0.6 | 0.916 |
| high_threat | 0.708 | 0.924 | 1 | 0.58 | 0.827 |
| skeleton_crew | 1 | 0.856 | 0.968 | 0 | 0.799 |
| large_colony | 0.5 | 0.945 | 1 | 0.58 | 0.771 |
| wildlife_heavy | 1 | 0.881 | 1 | 0 | 0.814 |
| storm_start | 0.801 | 0.917 | 1 | 0.6 | 0.855 |
| default | 1 | 0.912 | 1 | 0.93 | 0.963 |
| developed_colony | 1 | 0.924 | 1 | 0.6 | 0.917 |
| default | 1 | 0.926 | 1 | 0.5 | 0.903 |
| default | 1 | 0.948 | 1 | 0.61 | 0.926 |
| crisis_compound | 0.978 | 0.928 | 0.952 | 0.58 | 0.897 |
| island_isolation | 1 | 0.701 | 0.613 | 0 | 0.664 |
| population_boom | 0.941 | 0.922 | 0.935 | 0 | 0.792 |
| late_game_siege | 0.91 | 0.939 | 1 | 0.52 | 0.883 |
| no_director | 0.806 | 0.905 | 1 | 0 | 0.763 |

## 5. Technical (技术性)

| Scenario | Cache Hit | Validity | Goal Stability | AI Rate | Tool Mult | Score |
|---|---|---|---|---|---|---|
| default | 0.453 | 1 | 0.989 | 11.3/min | 1.45 | 0.916 |
| default | 0.406 | 1 | 0.989 | 11.3/min | 1 | 0.709 |
| default | 0.171 | 1 | 0.983 | 11/min | 1 | 0.84 |
| scarce_resources | 0.15 | 1 | 0.983 | 11/min | 1 | 0.836 |
| abundant_resources | 0.096 | 1 | 0.983 | 11/min | 1.15 | 0.728 |
| resource_chains_basic | 0.162 | 1 | 0.983 | 11/min | 1.45 | 0.871 |
| full_processing | 0.151 | 1 | 0.983 | 11/min | 1.45 | 0.869 |
| tooled_colony | 0.108 | 1 | 0.983 | 11/min | 1.45 | 0.863 |
| high_threat | 0.135 | 1 | 0.933 | 11/min | 1.3 | 0.79 |
| skeleton_crew | 0.206 | 1 | 0.933 | 11/min | 1 | 0.834 |
| large_colony | 0.207 | 1 | 0.99 | 11/min | 1 | 0.679 |
| wildlife_heavy | 0.125 | 1 | 0.917 | 11/min | 1 | 0.815 |
| storm_start | 0.128 | 1 | 0.983 | 11/min | 1.15 | 0.733 |
| default | 0.466 | 1 | 0.989 | 11.3/min | 1.45 | 0.918 |
| developed_colony | 0.143 | 1 | 0.983 | 11/min | 1.45 | 0.868 |
| default | 0.242 | 1 | 1 | 11/min | 1.15 | 0.753 |
| default | 0.142 | 1 | 0.983 | 11/min | 1.3 | 0.801 |
| crisis_compound | 0.106 | 1 | 0.9 | 11/min | 1 | 0.807 |
| island_isolation | 0.238 | 1 | 0.933 | 11/min | 1 | 0.84 |
| population_boom | 0.231 | 1 | 0.99 | 11/min | 1 | 0.853 |
| late_game_siege | 0.135 | 1 | 0.933 | 11/min | 1.45 | 0.857 |
| no_director | 0.291 | 1 | 0.983 | 11/min | 1 | 0.863 |

## 6. Reasonableness (合理性)

| Scenario | Diversity | Non-Repetition | Coherence | Productivity | Score |
|---|---|---|---|---|---|
| default | 0.754 | 1 | 1 | 0.897 | 0.895 |
| default | 0.749 | 1 | 1 | 0.892 | 0.892 |
| default | 0.576 | 1 | 0.67 | 0.907 | 0.779 |
| scarce_resources | 0.744 | 1 | 1 | 0.892 | 0.891 |
| abundant_resources | 0.693 | 0.556 | 1 | 0.888 | 0.785 |
| resource_chains_basic | 0.805 | 1 | 1 | 0.901 | 0.912 |
| full_processing | 0.822 | 0.278 | 1 | 0.896 | 0.771 |
| tooled_colony | 0.775 | 0.833 | 1 | 0.896 | 0.868 |
| high_threat | 0.762 | 0.833 | 1 | 0.902 | 0.866 |
| skeleton_crew | 0.908 | 1 | 0.67 | 0.96 | 0.894 |
| large_colony | 0.669 | 1 | 1 | 0.877 | 0.864 |
| wildlife_heavy | 0.735 | 1 | 1 | 0.909 | 0.893 |
| storm_start | 0.776 | 1 | 1 | 0.896 | 0.901 |
| default | 0.782 | 1 | 1 | 0.895 | 0.903 |
| developed_colony | 0.78 | 0.833 | 1 | 0.89 | 0.868 |
| default | 0.726 | 1 | 0.67 | 0.886 | 0.818 |
| default | 0.752 | 1 | 0.67 | 0.886 | 0.825 |
| crisis_compound | 0.867 | 1 | 1 | 0.953 | 0.946 |
| island_isolation | 0.703 | 0.556 | 0.67 | 0.938 | 0.737 |
| population_boom | 0.635 | 1 | 1 | 0.881 | 0.855 |
| late_game_siege | 0.785 | 0.833 | 1 | 0.898 | 0.871 |
| no_director | 0.783 | 1 | 0.67 | 0.929 | 0.848 |

## 7. Efficiency (效率)

| Scenario | Deliveries | Carry/W/Min | Idle% | Proc Util | Depot Dist | Score |
|---|---|---|---|---|---|---|
| default | 33 | 1.41 | 2.7% | 0.497 | 1.8 | 0.95 |
| default | 28 | 1.19 | 2.7% | 0.115 | 3.8 | 0.683 |
| default | 14 | 1 | 4.4% | 0 | 4.5 | 0.753 |
| scarce_resources | 12 | 0.83 | 2.9% | 0 | 3.5 | 0.735 |
| abundant_resources | 6 | 0.42 | 2.9% | 0.133 | 2.9 | 0.551 |
| resource_chains_basic | 16 | 1.11 | 2.9% | 0.404 | 2.4 | 0.833 |
| full_processing | 0 | 0 | 2.9% | 0.4 | 1.6 | 0.624 |
| tooled_colony | 14 | 0.97 | 2.9% | 0.204 | 1.7 | 0.718 |
| high_threat | 16 | 1.11 | 2.9% | 0.266 | 1.9 | 0.773 |
| skeleton_crew | 4 | 0.73 | 2.4% | 0 | 3 | 0.722 |
| large_colony | 9 | 0.4 | 3% | 0.182 | 2.2 | 0.585 |
| wildlife_heavy | 24 | 1.71 | 3% | 0 | 4.1 | 0.681 |
| storm_start | 14 | 0.97 | 2.9% | 0.12 | 2.2 | 0.666 |
| default | 51 | 2.17 | 2.7% | 0.452 | 2 | 0.942 |
| developed_colony | 15 | 1.04 | 3.1% | 0.422 | 1.6 | 0.843 |
| default | 22 | 1.52 | 4.3% | 0.061 | 2.2 | 0.744 |
| default | 24 | 1.66 | 4.3% | 0.58 | 1.7 | 0.971 |
| crisis_compound | 7 | 1.08 | 2.5% | 0 | 2 | 0.839 |
| island_isolation | 3 | 0.35 | 2.7% | 0 | 14.3 | 0.395 |
| population_boom | 17 | 0.76 | 3% | 0 | 4.3 | 0.694 |
| late_game_siege | 13 | 0.9 | 2.9% | 0.467 | 1.3 | 0.842 |
| no_director | 10 | 0.71 | 3% | 0 | 5 | 0.664 |

## 8. Adaptability (适应性)

| Scenario | Weather Chg | Weather Resp | Dips | Recovery | Deaths | Death Impact | Score |
|---|---|---|---|---|---|---|---|
| default | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 4 | 0.92 | 1 | 0.999 | 1 | 0.919 | 0.96 |
| default | 2 | 0.878 | 1 | 0 | 1 | 0.948 | 0.653 |
| scarce_resources | 2 | 1 | 2 | 0.885 | 1 | 1 | 0.965 |
| abundant_resources | 2 | 1 | 0 | 1 | 1 | 0.914 | 0.983 |
| resource_chains_basic | 2 | 0.895 | 0 | 1 | 1 | 1 | 0.969 |
| full_processing | 2 | 0.954 | 0 | 1 | 1 | 1 | 0.986 |
| tooled_colony | 2 | 0.976 | 0 | 1 | 1 | 1 | 0.993 |
| high_threat | 2 | 0.906 | 0 | 1 | 1 | 0.973 | 0.966 |
| skeleton_crew | 2 | 0.882 | 2 | 0.5 | 1 | 1 | 0.815 |
| large_colony | 2 | 0.89 | 0 | 1 | 1 | 0.905 | 0.948 |
| wildlife_heavy | 2 | 0.998 | 1 | 0 | 7 | 0.957 | 0.691 |
| storm_start | 3 | 0.979 | 0 | 1 | 1 | 0.993 | 0.992 |
| default | 4 | 1 | 0 | 1 | 1 | 1 | 1 |
| developed_colony | 2 | 0.949 | 0 | 1 | 1 | 0.948 | 0.974 |
| default | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 2 | 0.917 | 0 | 1 | 1 | 1 | 0.975 |
| crisis_compound | 3 | 0.961 | 2 | 0.885 | 1 | 1 | 0.954 |
| island_isolation | 2 | 0.866 | 2 | 0.5 | 1 | 0.736 | 0.757 |
| population_boom | 2 | 0.851 | 2 | 0.5 | 1 | 1 | 0.805 |
| late_game_siege | 3 | 0.989 | 1 | 0 | 1 | 0.937 | 0.684 |
| no_director | 2 | 0.842 | 0 | 1 | 1 | 1 | 0.953 |

## 9. Logistics (物流)

| Scenario | Road Coverage | Warehouse Dist | Chain Complete | Res Balance | Score |
|---|---|---|---|---|---|
| default | 0.329 | 0.62 | 0.767 | 0.573 | 0.594 |
| default | 0.35 | 0.634 | 0.733 | 0.543 | 0.584 |
| default | 0.964 | 0.706 | 0.367 | 0.384 | 0.576 |
| scarce_resources | 0.208 | 0.656 | 0.4 | 0.377 | 0.42 |
| abundant_resources | 0.675 | 0.6 | 0.8 | 0.482 | 0.646 |
| resource_chains_basic | 0.233 | 0.579 | 0.967 | 0.606 | 0.633 |
| full_processing | 0.367 | 0.494 | 1 | 0.811 | 0.7 |
| tooled_colony | 0.891 | 0.432 | 0.867 | 0.607 | 0.698 |
| high_threat | 0.385 | 0.642 | 0.833 | 0.438 | 0.597 |
| skeleton_crew | 0.195 | 0.365 | 0.4 | 0.532 | 0.383 |
| large_colony | 0.269 | 0.649 | 0.933 | 0.554 | 0.635 |
| wildlife_heavy | 1 | 0.72 | 0.267 | 0.364 | 0.551 |
| storm_start | 0.385 | 0.605 | 0.833 | 0.466 | 0.595 |
| default | 0.329 | 0.62 | 0.767 | 0.593 | 0.599 |
| developed_colony | 0.904 | 0.44 | 1 | 0.641 | 0.751 |
| default | 0.707 | 0.794 | 0.65 | 0.436 | 0.644 |
| default | 0.315 | 0.663 | 0.75 | 0.51 | 0.581 |
| crisis_compound | 0.208 | 0.348 | 0.4 | 0.466 | 0.365 |
| island_isolation | 0.5 | 0.483 | 0.133 | 0.413 | 0.364 |
| population_boom | 0.198 | 0.546 | 0.4 | 0.49 | 0.419 |
| late_game_siege | 0.904 | 0.427 | 1 | 0.668 | 0.755 |
| no_director | 0.195 | 0.633 | 0.4 | 0.822 | 0.523 |

---

## Maturity Dimension Breakdowns

### 10. Action Duration Realism (动作时长真实性)
| Scenario | Action CV | Action Ratio | Has Progress | Score |
|---|---|---|---|---|
| default | 1.144 | 0.293 | true | 0.893 |
| default | 1.586 | 0.404 | true | 1 |
| default | 1.397 | 0.148 | true | 0.748 |
| scarce_resources | 1.175 | 0.172 | true | 0.772 |
| abundant_resources | 1.113 | 0.103 | true | 0.703 |
| resource_chains_basic | 1.173 | 0.283 | true | 0.883 |
| full_processing | 0.362 | 0.047 | true | 0.482 |
| tooled_colony | 0.72 | 0.183 | true | 0.753 |
| high_threat | 0.909 | 0.051 | true | 0.651 |
| skeleton_crew | 1.007 | 0.228 | true | 0.828 |
| large_colony | 1.223 | 0.044 | true | 0.644 |
| wildlife_heavy | 1.201 | 0.332 | true | 0.932 |
| storm_start | 0.996 | 0.28 | true | 0.88 |
| default | 1.13 | 0.271 | true | 0.871 |
| developed_colony | 0.732 | 0.023 | true | 0.597 |
| default | 0.966 | 0.134 | true | 0.734 |
| default | 1.337 | 0.25 | true | 0.85 |
| crisis_compound | 0.829 | 0.106 | true | 0.706 |
| island_isolation | 0.133 | 0.02 | true | 0.37 |
| population_boom | 0.903 | 0.134 | true | 0.734 |
| late_game_siege | 0.463 | 0.028 | true | 0.501 |
| no_director | 1.141 | 0.254 | true | 0.854 |

### 12. NPC Needs Depth (NPC需求深度)
| Scenario | Needs | Conflicts | Satisfaction Actions | Has Mood | Score |
|---|---|---|---|---|---|
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process,socialize,haul | true | 0.806 |
| scarce_resources | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize,haul | true | 0.856 |
| abundant_resources | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| resource_chains_basic | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| full_processing | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| tooled_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| high_threat | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| skeleton_crew | hunger,rest,morale,social | 6 | deliver,harvest,socialize | true | 0.744 |
| large_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| wildlife_heavy | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| storm_start | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| developed_colony | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,process,socialize,haul | true | 0.95 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process,socialize,haul | true | 0.806 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process,socialize,haul | true | 0.806 |
| crisis_compound | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize | true | 0.825 |
| island_isolation | hunger,rest,morale,social | 6 | deliver,harvest,socialize,haul | true | 0.775 |
| population_boom | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize,haul | true | 0.806 |
| late_game_siege | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| no_director | hunger,rest,morale,social | 6 | rest,wander,deliver,harvest,socialize,haul | true | 0.837 |

### 14. Spatial Layout Intelligence (空间布局智能)
| Scenario | Cluster | Zoning | Path Eff | Expansion | Score |
|---|---|---|---|---|---|
| default | 0.223 | 0.525 | 0.558 | 0.815 | 0.547 |
| default | 0.663 | 0.733 | 0.62 | 0.43 | 0.609 |
| default | 0.708 | 0.556 | 0.627 | 0.202 | 0.519 |
| scarce_resources | 0.221 | 0.745 | 0.578 | 0.618 | 0.558 |
| abundant_resources | 0.285 | 0.679 | 0.67 | 0.571 | 0.57 |
| resource_chains_basic | 0.166 | 0.679 | 0.631 | 0.58 | 0.537 |
| full_processing | 0.572 | 0.695 | 0.627 | 0.445 | 0.587 |
| tooled_colony | 0.582 | 0.707 | 0.661 | 0.51 | 0.619 |
| high_threat | 0.159 | 0.679 | 0.588 | 0.557 | 0.517 |
| skeleton_crew | 0.429 | 0.86 | 0.667 | 0.639 | 0.661 |
| large_colony | 0.495 | 0.788 | 0.621 | 0.634 | 0.641 |
| wildlife_heavy | 0.594 | 0.273 | 0.569 | 0.27 | 0.425 |
| storm_start | 0.159 | 0.679 | 0.615 | 0.557 | 0.525 |
| default | 0.223 | 0.525 | 0.556 | 0.815 | 0.546 |
| developed_colony | 0.623 | 0.651 | 0.606 | 0.408 | 0.571 |
| default | 0.179 | 0.821 | 0.563 | 0.425 | 0.516 |
| default | 0 | 0.537 | 0.612 | 0.736 | 0.502 |
| crisis_compound | 0.221 | 0.745 | 0.621 | 0.618 | 0.571 |
| island_isolation | 0.552 | 0.333 | 0.605 | 0.491 | 0.498 |
| population_boom | 0.215 | 0.784 | 0.571 | 0.611 | 0.563 |
| late_game_siege | 0.623 | 0.651 | 0.583 | 0.408 | 0.564 |
| no_director | 0.429 | 0.851 | 0.544 | 0.637 | 0.621 |

### 18. Traffic Flow Quality (交通流质量)
| Scenario | Congestion | Path Div | Roads | Road Score | Gini | Score |
|---|---|---|---|---|---|---|
| default | 193 | 3 | 30 | 0.854 | 0.39 | 0.764 |
| default | 179 | 3 | 51 | 0.486 | 0.137 | 0.754 |
| default | 119 | 3 | 33 | 0.444 | 0.336 | 0.707 |
| scarce_resources | 95 | 3 | 27 | 0.674 | 0.312 | 0.748 |
| abundant_resources | 118 | 3 | 65 | 0.93 | 0.308 | 0.818 |
| resource_chains_basic | 78 | 3 | 56 | 0.968 | 0.25 | 0.83 |
| full_processing | 104 | 3 | 64 | 0.731 | 0.133 | 0.805 |
| tooled_colony | 86 | 3 | 71 | 0.571 | 0.341 | 0.738 |
| high_threat | 85 | 3 | 51 | 0.912 | 0.549 | 0.75 |
| skeleton_crew | 31 | 3 | 30 | 0.74 | 0 | 0.841 |
| large_colony | 222 | 3 | 38 | 0.986 | 0.252 | 0.831 |
| wildlife_heavy | 85 | 3 | 36 | 0 | 0.014 | 0.671 |
| storm_start | 86 | 3 | 69 | 0.884 | 0.162 | 0.827 |
| default | 179 | 3 | 30 | 0.854 | 0.204 | 0.801 |
| developed_colony | 78 | 3 | 60 | 0.873 | 0.583 | 0.739 |
| default | 99 | 3 | 29 | 0.548 | 0.486 | 0.585 |
| default | 109 | 3 | 55 | 0.741 | 0.464 | 0.738 |
| crisis_compound | 33 | 3 | 27 | 0.674 | 0.463 | 0.726 |
| island_isolation | 33 | 3 | 31 | 0 | 0 | 0.681 |
| population_boom | 139 | 3 | 29 | 0.699 | 0.45 | 0.724 |
| late_game_siege | 90 | 3 | 50 | 0.995 | 0.575 | 0.76 |
| no_director | 85 | 3 | 15 | 0.542 | 0 | 0.777 |

---

## Improvement Targets

### Maturity Tier — Key Gaps

- **Spatial Layout Intelligence (空间布局智能)**: 0.558 (D)
- **Logistics**: 0.573 (D)
- **Temporal Realism (时间真实性)**: 0.735 (C)
- **Efficiency**: 0.737 (C)
- **Action Duration Realism (动作时长真实性)**: 0.745 (C)

### What Would Raise the Score

To meaningfully improve the Maturity tier, the game needs:
- **Multiple NPC needs** (rest, morale, social) with conflicting priorities
- **Tile state richness** (crop growth stages, building degradation, cooldowns)
- **Action duration realism** (work progress bars, variable task times)
- **Day/night cycles** affecting behavior and production
- **Social interactions** between NPCs (relationships, conversations)
- **Diminishing returns** on resource gathering
- **Worker specialization** through experience/skills
