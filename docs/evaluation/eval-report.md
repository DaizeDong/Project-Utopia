# Project Utopia — Comprehensive Game Evaluation Report

> Generated: 2026-04-10 03:52:10
> Version: 0.5.4 (Phase 1: Resource Chains + Bridge)
> Scenarios: 22 | Duration: 1410s total sim time
> Scoring: 3-tier weighted (Foundation 20% + Gameplay 30% + Maturity 50%)

## Overall Score

**0.838 (B)**

| Tier | Score | Grade | Weight |
|---|---|---|---|
| **Foundation** (基础运行) | 0.954 | A | 20% |
| **Gameplay** (游戏玩法) | 0.789 | C | 30% |
| **Maturity** (游戏成熟度) | 0.82 | B | 50% |

## Tier 1: Foundation (基础运行)

| Dimension | Score | Grade | Description |
|---|---|---|---|
| Stability | 1 | A | Long-run correctness |
| Technical | 0.812 | B | AI quality, pathfinding |
| Coverage | 1.05 | A | Game element utilization |

## Tier 2: Gameplay (游戏玩法)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Development | 0.79 | C | 20% | Progressive complexity growth |
| Playability | 0.848 | B | 20% | Tension curves, engagement |
| Efficiency | 0.744 | C | 18% | Labor throughput, utilization |
| Logistics | 0.614 | D | 15% | Infrastructure quality |
| Reasonableness | 0.852 | B | 15% | NPC behavior naturalness |
| Adaptability | 0.897 | B | 12% | Crisis recovery |

## Tier 3: Maturity (游戏成熟度)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Action Duration Realism | 0.83 | B | 10% | 动作时长真实性 |
| Tile State Richness | 0.789 | C | 8% | 地块状态丰富度 |
| NPC Needs Depth | 0.855 | B | 10% | NPC需求深度 |
| Economic Feedback Loops | 0.829 | B | 8% | 经济反馈循环 |
| Spatial Layout Intelligence | 0.574 | D | 8% | 空间布局智能 |
| Temporal Realism | 0.81 | B | 7% | 时间真实性 |
| Emergent Narrative | 0.938 | A | 8% | 涌现叙事密度 |
| Decision Consequence | 0.829 | B | 9% | 决策后果深度 |
| Traffic Flow Quality | 0.814 | B | 8% | 交通流质量 |
| Population Dynamics | 0.932 | A | 8% | 人口动态真实性 |
| Environmental Responsiveness | 0.822 | B | 8% | 环境响应性 |
| System Coupling Density | 0.81 | B | 8% | 系统耦合密度 |

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
| wildlife_heavy/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 30 | none |
| storm_start/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| default/temperate_plains | YES | 90/90s | 0 | 0 | 0 | 26 | none |
| developed_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| default/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| default/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| crisis_compound/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 18 | none |
| island_isolation/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 17 | none |
| population_boom/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 32 | none |
| late_game_siege/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 28 | none |
| no_director/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |

## 2. Development (发展性)

| Scenario | Buildings Early→Late | Resources Early→Late | Peak Roles | Objectives |
|---|---|---|---|---|
| default | 38.17→39.57 | 3.8→6 | 8 | 1/3 |
| default | 44.67→44.43 | 3.7→4.9 | 7 | 1/3 |
| default | 18.5→16.6 | 3→3 | 5 | 0/3 |
| scarce_resources | 49.83→51.14 | 2.8→3.3 | 5 | 1/3 |
| abundant_resources | 55.33→57 | 3→6 | 8 | 1/3 |
| resource_chains_basic | 55.83→56 | 4→6.4 | 8 | 1/3 |
| full_processing | 59→59 | 7→7 | 8 | 1/3 |
| tooled_colony | 56.83→57.14 | 4.8→6 | 8 | 1/3 |
| high_threat | 54.67→54.86 | 3→5.3 | 7 | 1/3 |
| skeleton_crew | 50→51.86 | 3.8→4 | 4 | 0/3 |
| large_colony | 51.67→52.43 | 4→5.7 | 8 | 1/3 |
| wildlife_heavy | 10.5→10.29 | 3→3.1 | 6 | 0/3 |
| storm_start | 54.67→55 | 3→5 | 7 | 1/3 |
| default | 38.17→40 | 3.3→6 | 8 | 1/3 |
| developed_colony | 62.83→63 | 4→7 | 8 | 1/3 |
| default | 83.5→84 | 2.5→3.8 | 7 | 1/3 |
| default | 38.75→40 | 3.3→5 | 7 | 1/3 |
| crisis_compound | 49.83→51.14 | 3.8→4 | 4 | 1/3 |
| island_isolation | 7→6 | 3→3.7 | 3 | 0/3 |
| population_boom | 50→49.86 | 3.8→4 | 5 | 0/3 |
| late_game_siege | 62.83→63 | 4→7 | 8 | 1/3 |
| no_director | 49→47.86 | 4→4 | 5 | 0/3 |

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
| default | 1 | 0.911 | 1 | 0.62 | 0.916 |
| default | 1 | 0.91 | 0.935 | 0.5 | 0.882 |
| default | 1 | 0.922 | 0.833 | 0 | 0.785 |
| scarce_resources | 1 | 0.886 | 0.935 | 0.5 | 0.875 |
| abundant_resources | 0.943 | 0.91 | 1 | 0.61 | 0.897 |
| resource_chains_basic | 0.652 | 0.931 | 1 | 0.6 | 0.814 |
| full_processing | 1 | 0.914 | 1 | 0.59 | 0.913 |
| tooled_colony | 1 | 0.903 | 1 | 0.56 | 0.906 |
| high_threat | 0.636 | 0.899 | 1 | 0.6 | 0.801 |
| skeleton_crew | 0.75 | 0.854 | 0.935 | 0 | 0.715 |
| large_colony | 0.776 | 0.943 | 0.984 | 0.51 | 0.839 |
| wildlife_heavy | 1 | 0.857 | 0.855 | 0 | 0.771 |
| storm_start | 0.876 | 0.908 | 1 | 0.6 | 0.876 |
| default | 1 | 0.921 | 1 | 0.63 | 0.921 |
| developed_colony | 1 | 0.916 | 1 | 0.6 | 0.915 |
| default | 0.928 | 0.927 | 1 | 0.65 | 0.904 |
| default | 1 | 0.949 | 1 | 0.72 | 0.942 |
| crisis_compound | 0.959 | 0.916 | 0.952 | 0.57 | 0.886 |
| island_isolation | 1 | 0.856 | 0.548 | 0 | 0.694 |
| population_boom | 0.616 | 0.938 | 0.984 | 0 | 0.712 |
| late_game_siege | 0.875 | 0.915 | 1 | 0.6 | 0.877 |
| no_director | 1 | 0.917 | 1 | 0 | 0.825 |

## 5. Technical (技术性)

| Scenario | Cache Hit | Validity | Goal Stability | AI Rate | Tool Mult | Score |
|---|---|---|---|---|---|---|
| default | 0.382 | 1 | 0.989 | 11.3/min | 1.45 | 0.905 |
| default | 0.39 | 1 | 0.989 | 11.3/min | 1 | 0.706 |
| default | 0.192 | 1 | 0.983 | 11/min | 1 | 0.844 |
| scarce_resources | 0.199 | 1 | 0.983 | 11/min | 1 | 0.846 |
| abundant_resources | 0.149 | 1 | 0.983 | 11/min | 1.15 | 0.736 |
| resource_chains_basic | 0.163 | 1 | 0.983 | 11/min | 1.3 | 0.804 |
| full_processing | 0.127 | 1 | 0.983 | 11/min | 1.45 | 0.866 |
| tooled_colony | 0.094 | 1 | 0.983 | 11/min | 1.45 | 0.861 |
| high_threat | 0.144 | 1 | 0.95 | 11/min | 1.15 | 0.728 |
| skeleton_crew | 0.24 | 1 | 0.933 | 11/min | 1 | 0.841 |
| large_colony | 0.207 | 1 | 0.99 | 11/min | 1 | 0.679 |
| wildlife_heavy | 0.186 | 1 | 0.95 | 11/min | 1 | 0.835 |
| storm_start | 0.143 | 1 | 0.983 | 11/min | 1.15 | 0.735 |
| default | 0.314 | 1 | 0.989 | 11.3/min | 1.3 | 0.828 |
| developed_colony | 0.158 | 1 | 0.983 | 11/min | 1.45 | 0.87 |
| default | 0.16 | 1 | 1 | 11/min | 1.15 | 0.741 |
| default | 0.251 | 1 | 0.983 | 11/min | 1.3 | 0.818 |
| crisis_compound | 0.142 | 1 | 0.85 | 11/min | 1 | 0.802 |
| island_isolation | 0.397 | 1 | 0.933 | 11/min | 1 | 0.87 |
| population_boom | 0.251 | 1 | 0.99 | 11/min | 1 | 0.857 |
| late_game_siege | 0.124 | 1 | 0.917 | 11/min | 1.45 | 0.852 |
| no_director | 0.218 | 1 | 0.983 | 11/min | 1 | 0.849 |

## 6. Reasonableness (合理性)

| Scenario | Diversity | Non-Repetition | Coherence | Productivity | Score |
|---|---|---|---|---|---|
| default | 0.775 | 1 | 1 | 0.889 | 0.899 |
| default | 0.765 | 1 | 1 | 0.9 | 0.899 |
| default | 0.755 | 1 | 0.67 | 0.913 | 0.834 |
| scarce_resources | 0.684 | 1 | 1 | 0.89 | 0.872 |
| abundant_resources | 0.799 | 1 | 1 | 0.899 | 0.909 |
| resource_chains_basic | 0.815 | 0.833 | 1 | 0.89 | 0.878 |
| full_processing | 0.822 | 0.556 | 1 | 0.896 | 0.827 |
| tooled_colony | 0.78 | 0.556 | 1 | 0.898 | 0.815 |
| high_threat | 0.79 | 0.278 | 1 | 0.903 | 0.763 |
| skeleton_crew | 0.894 | 1 | 0.67 | 0.96 | 0.89 |
| large_colony | 0.736 | 1 | 1 | 0.877 | 0.884 |
| wildlife_heavy | 0.777 | 1 | 1 | 0.888 | 0.899 |
| storm_start | 0.798 | 0.278 | 1 | 0.886 | 0.761 |
| default | 0.796 | 1 | 1 | 0.879 | 0.903 |
| developed_colony | 0.824 | 0.278 | 1 | 0.896 | 0.771 |
| default | 0.717 | 1 | 0.67 | 0.883 | 0.814 |
| default | 0.78 | 1 | 0.67 | 0.889 | 0.835 |
| crisis_compound | 0.901 | 1 | 1 | 0.953 | 0.956 |
| island_isolation | 0.757 | 0.556 | 1 | 0.912 | 0.812 |
| population_boom | 0.672 | 1 | 1 | 0.878 | 0.865 |
| late_game_siege | 0.826 | 0.278 | 1 | 0.89 | 0.77 |
| no_director | 0.718 | 1 | 1 | 0.908 | 0.888 |

## 7. Efficiency (效率)

| Scenario | Deliveries | Carry/W/Min | Idle% | Proc Util | Depot Dist | Score |
|---|---|---|---|---|---|---|
| default | 27 | 1.15 | 2.7% | 0.699 | 3 | 0.95 |
| default | 23 | 0.98 | 2.7% | 0.161 | 3.4 | 0.774 |
| default | 13 | 0.96 | 4.6% | 0 | 5 | 0.875 |
| scarce_resources | 11 | 0.76 | 3.1% | 0 | 4.4 | 0.662 |
| abundant_resources | 12 | 0.83 | 2.9% | 0.168 | 2.1 | 0.798 |
| resource_chains_basic | 11 | 0.76 | 2.9% | 0.292 | 2.6 | 0.838 |
| full_processing | 0 | 0 | 2.9% | 0.556 | 1.3 | 0.678 |
| tooled_colony | 9 | 0.62 | 2.9% | 0.223 | 1.6 | 0.768 |
| high_threat | 2 | 0.14 | 2.9% | 0.1 | 2.3 | 0.514 |
| skeleton_crew | 6 | 1.1 | 2.4% | 0 | 3.2 | 0.92 |
| large_colony | 5 | 0.22 | 3% | 0.204 | 2.1 | 0.601 |
| wildlife_heavy | 10 | 0.71 | 3% | 0 | 5.5 | 0.625 |
| storm_start | 2 | 0.14 | 2.9% | 0.067 | 2.3 | 0.498 |
| default | 28 | 1.19 | 2.7% | 0.256 | 3.4 | 0.822 |
| developed_colony | 2 | 0.14 | 2.9% | 0.489 | 1.5 | 0.721 |
| default | 20 | 1.39 | 4.3% | 0.061 | 2.5 | 0.739 |
| default | 14 | 0.97 | 4.3% | 0.649 | 2.4 | 0.96 |
| crisis_compound | 8 | 1.24 | 2.5% | 0 | 2.4 | 0.939 |
| island_isolation | 1 | 0.12 | 2.7% | 0 | 12.2 | 0.36 |
| population_boom | 12 | 0.53 | 3% | 0 | 3.8 | 0.772 |
| late_game_siege | 0 | 0 | 2.9% | 0.444 | 1.3 | 0.65 |
| no_director | 21 | 1.46 | 2.9% | 0 | 3.9 | 0.903 |

## 8. Adaptability (适应性)

| Scenario | Weather Chg | Weather Resp | Dips | Recovery | Deaths | Death Impact | Score |
|---|---|---|---|---|---|---|---|
| default | 4 | 0.933 | 0 | 1 | 1 | 1 | 0.98 |
| default | 4 | 0.877 | 1 | 0 | 1 | 0.837 | 0.63 |
| default | 2 | 0.956 | 1 | 0 | 1 | 0.912 | 0.669 |
| scarce_resources | 2 | 0.82 | 3 | 0.59 | 1 | 1 | 0.823 |
| abundant_resources | 2 | 0.977 | 0 | 1 | 1 | 0.922 | 0.977 |
| resource_chains_basic | 2 | 0.909 | 0 | 1 | 1 | 1 | 0.973 |
| full_processing | 2 | 0.964 | 0 | 1 | 1 | 0.974 | 0.984 |
| tooled_colony | 2 | 0.989 | 0 | 1 | 1 | 1 | 0.997 |
| high_threat | 2 | 0.953 | 1 | 0.999 | 1 | 1 | 0.986 |
| skeleton_crew | 2 | 0.846 | 2 | 0.5 | 1 | 1 | 0.804 |
| large_colony | 2 | 0.875 | 2 | 0.5 | 1 | 0.918 | 0.796 |
| wildlife_heavy | 2 | 0.95 | 1 | 0 | 7 | 0.962 | 0.677 |
| storm_start | 3 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 4 | 0.992 | 0 | 1 | 1 | 1 | 0.998 |
| developed_colony | 2 | 0.969 | 0 | 1 | 1 | 0.925 | 0.976 |
| default | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 2 | 0.992 | 0 | 1 | 1 | 1 | 0.998 |
| crisis_compound | 3 | 0.964 | 2 | 0.885 | 1 | 1 | 0.955 |
| island_isolation | 2 | 0.748 | 2 | 0.5 | 1 | 0.778 | 0.73 |
| population_boom | 2 | 0.895 | 2 | 0.5 | 1 | 1 | 0.818 |
| late_game_siege | 3 | 0.98 | 0 | 1 | 1 | 1 | 0.994 |
| no_director | 2 | 0.963 | 0 | 1 | 1 | 0.867 | 0.962 |

## 9. Logistics (物流)

| Scenario | Road Coverage | Warehouse Dist | Chain Complete | Res Balance | Score |
|---|---|---|---|---|---|
| default | 0.329 | 0.376 | 0.767 | 0.559 | 0.53 |
| default | 0.533 | 0.614 | 0.733 | 0.53 | 0.613 |
| default | 1 | 0.672 | 0.333 | 0.376 | 0.562 |
| scarce_resources | 0.45 | 0.629 | 0.4 | 0.325 | 0.449 |
| abundant_resources | 0.909 | 0.559 | 0.867 | 0.487 | 0.703 |
| resource_chains_basic | 0.465 | 0.594 | 0.967 | 0.634 | 0.69 |
| full_processing | 1 | 0.488 | 1 | 0.814 | 0.826 |
| tooled_colony | 1 | 0.427 | 0.833 | 0.595 | 0.705 |
| high_threat | 0.909 | 0.653 | 0.8 | 0.474 | 0.703 |
| skeleton_crew | 0.439 | 0.616 | 0.4 | 0.539 | 0.497 |
| large_colony | 0.269 | 0.634 | 0.933 | 0.57 | 0.635 |
| wildlife_heavy | 1 | 0.759 | 0.267 | 0.323 | 0.55 |
| storm_start | 0.909 | 0.713 | 0.8 | 0.394 | 0.698 |
| default | 0.329 | 0.339 | 0.8 | 0.6 | 0.541 |
| developed_colony | 1 | 0.481 | 1 | 0.677 | 0.789 |
| default | 0.707 | 0.79 | 0.65 | 0.292 | 0.607 |
| default | 0.744 | 0.72 | 0.75 | 0.506 | 0.68 |
| crisis_compound | 0.45 | 0.473 | 0.4 | 0.461 | 0.444 |
| island_isolation | 1 | 0.457 | 0.133 | 0.4 | 0.454 |
| population_boom | 0.439 | 0.534 | 0.4 | 0.522 | 0.472 |
| late_game_siege | 1 | 0.489 | 1 | 0.658 | 0.787 |
| no_director | 0.439 | 0.611 | 0.4 | 0.825 | 0.567 |

---

## Maturity Dimension Breakdowns

### 10. Action Duration Realism (动作时长真实性)
| Scenario | Action CV | Action Ratio | Has Progress | Score |
|---|---|---|---|---|
| default | 0.974 | 0.289 | true | 1 |
| default | 1.161 | 0.12 | true | 0.919 |
| default | 1.162 | 0.473 | true | 1 |
| scarce_resources | 1.011 | 0.145 | true | 0.986 |
| abundant_resources | 0.788 | 0.23 | true | 0.995 |
| resource_chains_basic | 0.691 | 0.177 | true | 0.959 |
| full_processing | 0.573 | 0.037 | true | 0.615 |
| tooled_colony | 0.532 | 0.021 | true | 0.555 |
| high_threat | 0.869 | 0.065 | true | 0.774 |
| skeleton_crew | 0.616 | 0.213 | true | 0.931 |
| large_colony | 0.557 | 0.004 | true | 0.521 |
| wildlife_heavy | 1.034 | 0.199 | true | 1 |
| storm_start | 0.473 | 0.082 | true | 0.697 |
| default | 1.278 | 0.244 | true | 1 |
| developed_colony | 0.478 | 0.048 | true | 0.607 |
| default | 0.68 | 0.095 | true | 0.809 |
| default | 0.943 | 0.335 | true | 1 |
| crisis_compound | 1.038 | 0.213 | true | 1 |
| island_isolation | 1.359 | 0.085 | true | 0.827 |
| population_boom | 0.682 | 0.027 | true | 0.627 |
| late_game_siege | 0.103 | 0.035 | true | 0.431 |
| no_director | 0.983 | 0.478 | true | 1 |

### 12. NPC Needs Depth (NPC需求深度)
| Scenario | Needs | Conflicts | Satisfaction Actions | Has Mood | Score |
|---|---|---|---|---|---|
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process,socialize,haul | true | 0.806 |
| scarce_resources | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,process,socialize,haul | true | 0.95 |
| abundant_resources | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| resource_chains_basic | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| full_processing | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| tooled_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| high_threat | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| skeleton_crew | hunger,rest,morale,social | 6 | deliver,harvest,socialize | true | 0.744 |
| large_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| wildlife_heavy | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| storm_start | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| developed_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process,socialize,haul | true | 0.806 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process,socialize,haul | true | 0.806 |
| crisis_compound | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize | true | 0.825 |
| island_isolation | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,socialize,haul | true | 0.919 |
| population_boom | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize,haul | true | 0.806 |
| late_game_siege | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| no_director | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize,haul | true | 0.806 |

### 14. Spatial Layout Intelligence (空间布局智能)
| Scenario | Cluster | Zoning | Path Eff | Expansion | Score |
|---|---|---|---|---|---|
| default | 0 | 0.525 | 0.536 | 0.718 | 0.472 |
| default | 0.728 | 0.733 | 0.604 | 0.433 | 0.618 |
| default | 0.556 | 0.625 | 0.621 | 0.286 | 0.525 |
| scarce_resources | 0.403 | 0.769 | 0.597 | 0.603 | 0.603 |
| abundant_resources | 0.287 | 0.667 | 0.602 | 0.57 | 0.547 |
| resource_chains_basic | 0.351 | 0.679 | 0.6 | 0.58 | 0.565 |
| full_processing | 0.667 | 0.695 | 0.615 | 0.445 | 0.603 |
| tooled_colony | 0.675 | 0.707 | 0.698 | 0.51 | 0.648 |
| high_threat | 0.444 | 0.691 | 0.599 | 0.572 | 0.584 |
| skeleton_crew | 0.408 | 0.717 | 0.576 | 0.617 | 0.588 |
| large_colony | 0.619 | 0.774 | 0.642 | 0.621 | 0.665 |
| wildlife_heavy | 0.729 | 0.1 | 0.596 | 0.14 | 0.449 |
| storm_start | 0.444 | 0.691 | 0.606 | 0.572 | 0.586 |
| default | 0 | 0.525 | 0.59 | 0.718 | 0.488 |
| developed_colony | 0.707 | 0.651 | 0.607 | 0.408 | 0.588 |
| default | 0.506 | 0.798 | 0.57 | 0.431 | 0.579 |
| default | 0.143 | 0.55 | 0.613 | 0.812 | 0.553 |
| crisis_compound | 0.394 | 0.745 | 0.602 | 0.618 | 0.6 |
| island_isolation | 0.481 | 0.667 | 0.633 | 0.421 | 0.527 |
| population_boom | 0.36 | 0.816 | 0.565 | 0.627 | 0.603 |
| late_game_siege | 0.707 | 0.651 | 0.627 | 0.408 | 0.594 |
| no_director | 0.556 | 0.851 | 0.563 | 0.637 | 0.652 |

### 18. Traffic Flow Quality (交通流质量)
| Scenario | Congestion | Path Div | Roads | Road Score | Gini | Score |
|---|---|---|---|---|---|---|
| default | 166 | 3 | 33 | 1 | 0.559 | 0.756 |
| default | 168 | 3 | 50 | 1 | 0.392 | 0.802 |
| default | 105 | 3 | 34 | 1 | 0.367 | 0.811 |
| scarce_resources | 82 | 3 | 25 | 0.833 | 0.428 | 0.761 |
| abundant_resources | 82 | 3 | 62 | 1 | 0.341 | 0.812 |
| resource_chains_basic | 97 | 3 | 56 | 1 | 0.207 | 0.839 |
| full_processing | 78 | 3 | 62 | 1 | 0.3 | 0.823 |
| tooled_colony | 89 | 3 | 71 | 1 | 0.458 | 0.808 |
| high_threat | 119 | 3 | 51 | 1 | 0.125 | 0.855 |
| skeleton_crew | 5 | 3 | 30 | 1 | 0 | 0.715 |
| large_colony | 218 | 3 | 35 | 1 | 0.019 | 0.885 |
| wildlife_heavy | 94 | 3 | 32 | 1 | 0.246 | 0.83 |
| storm_start | 114 | 3 | 75 | 1 | 0.071 | 0.867 |
| default | 156 | 3 | 33 | 1 | 0.461 | 0.786 |
| developed_colony | 69 | 3 | 56 | 1 | 0.25 | 0.831 |
| default | 83 | 3 | 50 | 1 | 0.415 | 0.691 |
| default | 105 | 3 | 38 | 1 | 0.115 | 0.86 |
| crisis_compound | 13 | 3 | 27 | 0.9 | 0 | 0.86 |
| island_isolation | 49 | 3 | 30 | 1 | 0.227 | 0.841 |
| population_boom | 108 | 3 | 33 | 1 | 0.097 | 0.854 |
| late_game_siege | 93 | 3 | 56 | 1 | 0.167 | 0.852 |
| no_director | 64 | 3 | 15 | 0.5 | 0 | 0.773 |

---

## Improvement Targets

### Maturity Tier — Key Gaps

- **Spatial Layout Intelligence (空间布局智能)**: 0.574 (D)
- **Logistics**: 0.614 (D)
- **Efficiency**: 0.744 (C)
- **Tile State Richness (地块状态丰富度)**: 0.789 (C)
- **Development**: 0.79 (C)

### What Would Raise the Score

To meaningfully improve the Maturity tier, the game needs:
- **Multiple NPC needs** (rest, morale, social) with conflicting priorities
- **Tile state richness** (crop growth stages, building degradation, cooldowns)
- **Action duration realism** (work progress bars, variable task times)
- **Day/night cycles** affecting behavior and production
- **Social interactions** between NPCs (relationships, conversations)
- **Diminishing returns** on resource gathering
- **Worker specialization** through experience/skills
