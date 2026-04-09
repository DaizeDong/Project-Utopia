# Project Utopia — Comprehensive Game Evaluation Report

> Generated: 2026-04-09 08:16:02
> Version: 0.5.4 (Phase 1: Resource Chains + Bridge)
> Scenarios: 22 | Duration: 1410s total sim time
> Scoring: 3-tier weighted (Foundation 20% + Gameplay 30% + Maturity 50%)

## Overall Score

**0.778 (C)**

| Tier | Score | Grade | Weight |
|---|---|---|---|
| **Foundation** (基础运行) | 0.949 | A | 20% |
| **Gameplay** (游戏玩法) | 0.759 | C | 30% |
| **Maturity** (游戏成熟度) | 0.722 | C | 50% |

## Tier 1: Foundation (基础运行)

| Dimension | Score | Grade | Description |
|---|---|---|---|
| Stability | 1 | A | Long-run correctness |
| Technical | 0.816 | B | AI quality, pathfinding |
| Coverage | 1.03 | A | Game element utilization |

## Tier 2: Gameplay (游戏玩法)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Development | 0.819 | B | 20% | Progressive complexity growth |
| Playability | 0.854 | B | 20% | Tension curves, engagement |
| Efficiency | 0.752 | C | 18% | Labor throughput, utilization |
| Logistics | 0.428 | F | 15% | Infrastructure quality |
| Reasonableness | 0.871 | B | 15% | NPC behavior naturalness |
| Adaptability | 0.782 | C | 12% | Crisis recovery |

## Tier 3: Maturity (游戏成熟度)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Action Duration Realism | 0.814 | B | 10% | 动作时长真实性 |
| Tile State Richness | 0.656 | C | 8% | 地块状态丰富度 |
| NPC Needs Depth | 0.788 | C | 10% | NPC需求深度 |
| Economic Feedback Loops | 0.767 | C | 8% | 经济反馈循环 |
| Spatial Layout Intelligence | 0.564 | D | 8% | 空间布局智能 |
| Temporal Realism | 0.662 | C | 7% | 时间真实性 |
| Emergent Narrative | 0.885 | B | 8% | 涌现叙事密度 |
| Decision Consequence | 0.661 | C | 9% | 决策后果深度 |
| Traffic Flow Quality | 0.661 | C | 8% | 交通流质量 |
| Population Dynamics | 0.903 | A | 8% | 人口动态真实性 |
| Environmental Responsiveness | 0.607 | D | 8% | 环境响应性 |
| System Coupling Density | 0.657 | C | 8% | 系统耦合密度 |

---

## 1. Stability (稳定性)

| Scenario | Survived | Time | NaN | Neg | Errors | Entities | Outcome |
|---|---|---|---|---|---|---|---|
| default/temperate_plains | YES | 90/90s | 0 | 0 | 0 | 23 | none |
| default/fortified_basin | YES | 90/90s | 0 | 0 | 0 | 20 | none |
| default/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 21 | none |
| scarce_resources/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 21 | none |
| abundant_resources/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| resource_chains_basic/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 23 | none |
| full_processing/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| tooled_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| high_threat/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 26 | none |
| skeleton_crew/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 15 | none |
| large_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 28 | none |
| wildlife_heavy/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 30 | none |
| storm_start/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 23 | none |
| default/temperate_plains | YES | 90/90s | 0 | 0 | 0 | 23 | none |
| developed_colony/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| default/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 23 | none |
| default/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 23 | none |
| crisis_compound/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 17 | none |
| island_isolation/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 15 | none |
| population_boom/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 28 | none |
| late_game_siege/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 28 | none |
| no_director/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 20 | none |

## 2. Development (发展性)

| Scenario | Buildings Early→Late | Resources Early→Late | Peak Roles | Objectives |
|---|---|---|---|---|
| default | 38.5→39.86 | 3.7→6 | 8 | 1/3 |
| default | 44.67→45.14 | 3.7→6 | 7 | 1/3 |
| default | 17.5→18 | 3→4 | 5 | 0/3 |
| scarce_resources | 49→52.14 | 2.8→3 | 5 | 1/3 |
| abundant_resources | 56→57 | 2.3→6 | 7 | 1/3 |
| resource_chains_basic | 55.83→57.29 | 4→7 | 8 | 1/3 |
| full_processing | 59→59 | 7→7 | 8 | 1/3 |
| tooled_colony | 55.83→56.57 | 4→6 | 7 | 1/3 |
| high_threat | 54.67→55.71 | 2.3→5 | 8 | 1/3 |
| skeleton_crew | 51→51 | 2.8→3.9 | 4 | 1/3 |
| large_colony | 50.83→51.57 | 3→5 | 8 | 1/3 |
| wildlife_heavy | 10.67→14 | 3→4 | 5 | 0/3 |
| storm_start | 54.67→55 | 2.3→6 | 7 | 1/3 |
| default | 38.5→39.71 | 3.5→6 | 8 | 1/3 |
| developed_colony | 62.83→63 | 4→7 | 8 | 1/3 |
| default | 83.5→84 | 2.3→5 | 7 | 1/3 |
| default | 39.25→40 | 3.3→5 | 7 | 1/3 |
| crisis_compound | 49→51 | 2.8→3.9 | 4 | 1/3 |
| island_isolation | 7→6 | 2→2.7 | 2 | 0/3 |
| population_boom | 51→51 | 2.8→3 | 5 | 1/3 |
| late_game_siege | 62.83→62.86 | 4→7 | 8 | 1/3 |
| no_director | 49→47.57 | 3→4 | 5 | 0/3 |

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
| default | 1 | 0.912 | 1 | 0.65 | 0.922 |
| default | 1 | 0.946 | 0.952 | 0.5 | 0.897 |
| default | 0.58 | 0.917 | 1 | 0.25 | 0.736 |
| scarce_resources | 1 | 0.915 | 0.952 | 0.5 | 0.888 |
| abundant_resources | 0.943 | 0.916 | 1 | 0.67 | 0.908 |
| resource_chains_basic | 1 | 0.951 | 0.984 | 0.5 | 0.906 |
| full_processing | 0.942 | 0.931 | 1 | 0.65 | 0.91 |
| tooled_colony | 0.923 | 0.905 | 1 | 0.55 | 0.881 |
| high_threat | 0.708 | 0.924 | 1 | 0.65 | 0.837 |
| skeleton_crew | 0.81 | 0.856 | 0.984 | 0.56 | 0.83 |
| large_colony | 0.886 | 0.898 | 1 | 0.5 | 0.86 |
| wildlife_heavy | 1 | 0.902 | 1 | 0.33 | 0.871 |
| storm_start | 0.647 | 0.932 | 1 | 0.5 | 0.799 |
| default | 1 | 0.919 | 1 | 0.75 | 0.938 |
| developed_colony | 1 | 0.914 | 1 | 0.65 | 0.922 |
| default | 0.872 | 0.947 | 1 | 0.73 | 0.905 |
| default | 1 | 0.942 | 1 | 0.7 | 0.938 |
| crisis_compound | 1 | 0.923 | 0.968 | 0.58 | 0.906 |
| island_isolation | 1 | 0.7 | 0.548 | 0 | 0.647 |
| population_boom | 0.465 | 0.82 | 0.984 | 0.56 | 0.715 |
| late_game_siege | 0.906 | 0.916 | 1 | 0.59 | 0.885 |
| no_director | 0.578 | 0.912 | 1 | 0 | 0.697 |

## 5. Technical (技术性)

| Scenario | Cache Hit | Validity | Goal Stability | AI Rate | Tool Mult | Score |
|---|---|---|---|---|---|---|
| default | 0.483 | 1 | 0.989 | 11.3/min | 1.45 | 0.92 |
| default | 0.404 | 1 | 0.989 | 11.3/min | 1.15 | 0.775 |
| default | 0.199 | 1 | 0.983 | 11/min | 1 | 0.846 |
| scarce_resources | 0.106 | 1 | 0.983 | 11/min | 1 | 0.828 |
| abundant_resources | 0.148 | 1 | 0.983 | 11/min | 1.15 | 0.736 |
| resource_chains_basic | 0.136 | 1 | 0.983 | 11/min | 1.3 | 0.8 |
| full_processing | 0.169 | 1 | 0.983 | 11/min | 1.45 | 0.872 |
| tooled_colony | 0.269 | 1 | 0.983 | 11/min | 1.45 | 0.887 |
| high_threat | 0.563 | 1 | 0.933 | 11/min | 1 | 0.721 |
| skeleton_crew | 0.215 | 1 | 0.933 | 11/min | 1 | 0.836 |
| large_colony | 0.273 | 1 | 0.99 | 11/min | 1 | 0.689 |
| wildlife_heavy | 0.113 | 1 | 0.95 | 11/min | 1 | 0.821 |
| storm_start | 0.156 | 1 | 0.983 | 11/min | 1.15 | 0.737 |
| default | 0.408 | 1 | 0.989 | 11.3/min | 1.3 | 0.842 |
| developed_colony | 0.191 | 1 | 0.983 | 11/min | 1.45 | 0.875 |
| default | 0.223 | 1 | 1 | 11/min | 1 | 0.683 |
| default | 0.252 | 1 | 0.983 | 11/min | 1.3 | 0.818 |
| crisis_compound | 0.141 | 1 | 0.85 | 11/min | 1 | 0.801 |
| island_isolation | 0.331 | 1 | 0.933 | 11/min | 1 | 0.858 |
| population_boom | 0.275 | 1 | 0.99 | 11/min | 1 | 0.861 |
| late_game_siege | 0.201 | 1 | 0.933 | 11/min | 1.45 | 0.867 |
| no_director | 0.33 | 1 | 0.983 | 11/min | 1 | 0.87 |

## 6. Reasonableness (合理性)

| Scenario | Diversity | Non-Repetition | Coherence | Productivity | Score |
|---|---|---|---|---|---|
| default | 0.787 | 1 | 1 | 0.913 | 0.91 |
| default | 0.822 | 1 | 1 | 0.831 | 0.896 |
| default | 0.773 | 1 | 1 | 0.882 | 0.897 |
| scarce_resources | 0.762 | 1 | 1 | 0.906 | 0.9 |
| abundant_resources | 0.809 | 1 | 1 | 0.892 | 0.91 |
| resource_chains_basic | 0.821 | 1 | 1 | 0.89 | 0.913 |
| full_processing | 0.822 | 1 | 1 | 0.896 | 0.915 |
| tooled_colony | 0.798 | 1 | 1 | 0.896 | 0.908 |
| high_threat | 0.752 | 0.556 | 1 | 0.886 | 0.802 |
| skeleton_crew | 0.889 | 1 | 0.67 | 0.96 | 0.889 |
| large_colony | 0.814 | 0.833 | 1 | 0.671 | 0.812 |
| wildlife_heavy | 0.723 | 1 | 1 | 0.923 | 0.894 |
| storm_start | 0.772 | 1 | 1 | 0.896 | 0.9 |
| default | 0.807 | 1 | 1 | 0.905 | 0.913 |
| developed_colony | 0.822 | 0.278 | 1 | 0.898 | 0.772 |
| default | 0.786 | 1 | 0.67 | 0.896 | 0.839 |
| default | 0.773 | 1 | 0.67 | 0.895 | 0.834 |
| crisis_compound | 0.909 | 1 | 1 | 0.959 | 0.96 |
| island_isolation | 0.812 | 0.556 | 1 | 0.935 | 0.835 |
| population_boom | 0.816 | 1 | 1 | 0.639 | 0.836 |
| late_game_siege | 0.824 | 0.278 | 1 | 0.896 | 0.771 |
| no_director | 0.786 | 1 | 0.67 | 0.93 | 0.849 |

## 7. Efficiency (效率)

| Scenario | Deliveries | Carry/W/Min | Idle% | Proc Util | Depot Dist | Score |
|---|---|---|---|---|---|---|
| default | 55 | 2.47 | 2.8% | 0.535 | 1.8 | 0.969 |
| default | 24 | 1.24 | 3.2% | 0.413 | 3.9 | 0.778 |
| default | 27 | 2.09 | 4.8% | 0 | 3 | 0.926 |
| scarce_resources | 11 | 0.84 | 2.9% | 0 | 2.3 | 0.708 |
| abundant_resources | 8 | 0.55 | 2.9% | 0.133 | 2.1 | 0.565 |
| resource_chains_basic | 27 | 1.88 | 2.9% | 0.427 | 2.6 | 0.903 |
| full_processing | 15 | 1.04 | 2.9% | 0.444 | 1.5 | 0.803 |
| tooled_colony | 12 | 0.83 | 2.9% | 0.233 | 1.6 | 0.665 |
| high_threat | 18 | 1.25 | 2.9% | 0.185 | 2.5 | 0.688 |
| skeleton_crew | 7 | 1.28 | 2.4% | 0 | 2.2 | 0.802 |
| large_colony | 22 | 1.1 | 3.2% | 0.148 | 2.2 | 0.652 |
| wildlife_heavy | 31 | 2.4 | 3.3% | 0 | 2.4 | 0.94 |
| storm_start | 15 | 1.04 | 2.9% | 0.3 | 1.9 | 0.726 |
| default | 41 | 1.84 | 2.8% | 0.501 | 1.9 | 0.944 |
| developed_colony | 2 | 0.14 | 2.9% | 0.622 | 1 | 0.705 |
| default | 16 | 1.12 | 4.3% | 0.133 | 2.5 | 0.643 |
| default | 27 | 1.88 | 4.3% | 0.546 | 1.9 | 0.95 |
| crisis_compound | 6 | 1.08 | 2.3% | 0 | 2.5 | 0.755 |
| island_isolation | 1 | 0.14 | 3.3% | 0 | 12.2 | 0.329 |
| population_boom | 11 | 0.55 | 3.2% | 0 | 2 | 0.659 |
| late_game_siege | 3 | 0.21 | 2.9% | 0.644 | 1.5 | 0.706 |
| no_director | 13 | 1.08 | 3.2% | 0 | 3.6 | 0.727 |

## 8. Adaptability (适应性)

| Scenario | Weather Chg | Weather Resp | Dips | Recovery | Deaths | Death Impact | Score |
|---|---|---|---|---|---|---|---|
| default | 4 | 0.896 | 1 | 0.321 | 1 | 0.935 | 0.752 |
| default | 4 | 0.898 | 1 | 0 | 1 | 0.901 | 0.65 |
| default | 2 | 1 | 1 | 0 | 1 | 0.991 | 0.698 |
| scarce_resources | 2 | 0.894 | 2 | 0.254 | 1 | 1 | 0.745 |
| abundant_resources | 2 | 0.992 | 0 | 1 | 1 | 1 | 0.998 |
| resource_chains_basic | 2 | 0.616 | 2 | 0.499 | 1 | 0.871 | 0.709 |
| full_processing | 2 | 0.96 | 0 | 1 | 1 | 0.924 | 0.973 |
| tooled_colony | 2 | 0.954 | 2 | 0.231 | 1 | 1 | 0.755 |
| high_threat | 2 | 0.906 | 1 | 0 | 1 | 1 | 0.672 |
| skeleton_crew | 2 | 0.838 | 2 | 0 | 1 | 1 | 0.652 |
| large_colony | 2 | 0.95 | 1 | 0 | 1 | 1 | 0.685 |
| wildlife_heavy | 2 | 1 | 1 | 0 | 7 | 1 | 0.7 |
| storm_start | 3 | 0.951 | 2 | 0.232 | 1 | 0.956 | 0.746 |
| default | 3 | 0.94 | 1 | 0.297 | 1 | 0.924 | 0.756 |
| developed_colony | 2 | 0.946 | 0 | 1 | 1 | 0.946 | 0.973 |
| default | 2 | 1 | 1 | 0.523 | 1 | 1 | 0.857 |
| default | 2 | 0.973 | 1 | 0.427 | 1 | 0.912 | 0.802 |
| crisis_compound | 3 | 0.91 | 2 | 0.259 | 1 | 1 | 0.751 |
| island_isolation | 2 | 0.958 | 1 | 0 | 1 | 0.9 | 0.667 |
| population_boom | 2 | 1 | 1 | 0 | 1 | 1 | 0.7 |
| late_game_siege | 3 | 0.961 | 0 | 1 | 1 | 1 | 0.988 |
| no_director | 2 | 0.942 | 0 | 1 | 1 | 1 | 0.983 |

## 9. Logistics (物流)

| Scenario | Road Coverage | Warehouse Dist | Chain Complete | Res Balance | Score |
|---|---|---|---|---|---|
| default | 0.329 | 0.618 | 0.667 | 0.468 | 0.52 |
| default | 0.35 | 0.359 | 0.556 | 0.271 | 0.384 |
| default | 0.924 | 0.691 | 0 | 0.153 | 0.442 |
| scarce_resources | 0.19 | 0.518 | 0 | 0.171 | 0.22 |
| abundant_resources | 0.342 | 0.693 | 0.667 | 0.267 | 0.492 |
| resource_chains_basic | 0.238 | 0.581 | 0.944 | 0.441 | 0.551 |
| full_processing | 0.367 | 0.456 | 1 | 0.339 | 0.54 |
| tooled_colony | 0.374 | 0.403 | 0.667 | 0.366 | 0.452 |
| high_threat | 0.226 | 0.635 | 0.667 | 0.309 | 0.459 |
| skeleton_crew | 0.187 | 0.477 | 0 | 0.313 | 0.244 |
| large_colony | 0.269 | 0.629 | 0.667 | 0.277 | 0.461 |
| wildlife_heavy | 0.828 | 0.728 | 0 | 0.141 | 0.424 |
| storm_start | 0.226 | 0.666 | 0.667 | 0.296 | 0.464 |
| default | 0.329 | 0.64 | 0.611 | 0.5 | 0.52 |
| developed_colony | 0.449 | 0.447 | 1 | 0.372 | 0.567 |
| default | 0.456 | 0.774 | 0.667 | 0.335 | 0.558 |
| default | 0.315 | 0.659 | 0.583 | 0.367 | 0.481 |
| crisis_compound | 0.184 | 0.343 | 0 | 0.207 | 0.183 |
| island_isolation | 0.556 | 0.48 | 0 | 0 | 0.259 |
| population_boom | 0.187 | 0.545 | 0 | 0.171 | 0.226 |
| late_game_siege | 0.449 | 0.469 | 1 | 0.374 | 0.573 |
| no_director | 0.171 | 0.592 | 0 | 0.79 | 0.388 |

---

## Maturity Dimension Breakdowns

### 10. Action Duration Realism (动作时长真实性)
| Scenario | Action CV | Action Ratio | Has Progress | Score |
|---|---|---|---|---|
| default | 1.139 | 0.333 | true | 0.933 |
| default | 1.919 | 0.318 | true | 0.918 |
| default | 1.235 | 0.287 | true | 0.887 |
| scarce_resources | 0.979 | 0.127 | true | 0.727 |
| abundant_resources | 1.107 | 0.215 | true | 0.815 |
| resource_chains_basic | 0.967 | 0.209 | true | 0.809 |
| full_processing | 0.951 | 0.144 | true | 0.744 |
| tooled_colony | 0.928 | 0.121 | true | 0.721 |
| high_threat | 1.223 | 0.225 | true | 0.825 |
| skeleton_crew | 1.012 | 0.194 | true | 0.794 |
| large_colony | 1.054 | 0.313 | true | 0.913 |
| wildlife_heavy | 1.262 | 0.37 | true | 0.97 |
| storm_start | 1.082 | 0.293 | true | 0.893 |
| default | 1.341 | 0.335 | true | 0.935 |
| developed_colony | 0.62 | 0.066 | true | 0.598 |
| default | 0.966 | 0.185 | true | 0.785 |
| default | 1.294 | 0.357 | true | 0.957 |
| crisis_compound | 1.359 | 0.218 | true | 0.818 |
| island_isolation | 1.464 | 0.054 | true | 0.654 |
| population_boom | 1.064 | 0.117 | true | 0.717 |
| late_game_siege | 0.537 | 0.059 | true | 0.56 |
| no_director | 1.301 | 0.324 | true | 0.924 |

### 12. NPC Needs Depth (NPC需求深度)
| Scenario | Needs | Conflicts | Satisfaction Actions | Has Mood | Score |
|---|---|---|---|---|---|
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| scarce_resources | hunger,rest,morale,social | 6 | eat,deliver,harvest | true | 0.794 |
| abundant_resources | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| resource_chains_basic | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| full_processing | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| tooled_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| high_threat | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| skeleton_crew | hunger,rest,morale,social | 6 | deliver,harvest | true | 0.712 |
| large_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest | true | 0.794 |
| wildlife_heavy | hunger,rest,morale,social | 6 | eat,deliver,harvest | true | 0.744 |
| storm_start | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| developed_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process | true | 0.744 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process | true | 0.744 |
| crisis_compound | hunger,rest,morale,social | 6 | eat,deliver,harvest | true | 0.794 |
| island_isolation | hunger,rest,morale,social | 6 | eat,deliver,harvest | true | 0.744 |
| population_boom | hunger,rest,morale,social | 6 | eat,deliver,harvest | true | 0.744 |
| late_game_siege | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| no_director | hunger,rest,morale,social | 6 | rest,wander,deliver,harvest | true | 0.775 |

### 14. Spatial Layout Intelligence (空间布局智能)
| Scenario | Cluster | Zoning | Path Eff | Expansion | Score |
|---|---|---|---|---|---|
| default | 0.148 | 0.525 | 0.553 | 0.826 | 0.513 |
| default | 0.649 | 0.761 | 0.661 | 0.416 | 0.622 |
| default | 0.792 | 0.5 | 0.566 | 0.357 | 0.554 |
| scarce_resources | 0.311 | 0.704 | 0.624 | 0.594 | 0.558 |
| abundant_resources | 0.36 | 0.667 | 0.641 | 0.57 | 0.559 |
| resource_chains_basic | 0.314 | 0.69 | 0.601 | 0.557 | 0.541 |
| full_processing | 0.608 | 0.695 | 0.592 | 0.445 | 0.585 |
| tooled_colony | 0.626 | 0.719 | 0.608 | 0.518 | 0.618 |
| high_threat | 0.36 | 0.679 | 0.597 | 0.557 | 0.548 |
| skeleton_crew | 0.311 | 0.745 | 0.584 | 0.618 | 0.565 |
| large_colony | 0.5 | 0.804 | 0.618 | 0.657 | 0.645 |
| wildlife_heavy | 0.905 | 0.214 | 0.599 | 0.353 | 0.518 |
| storm_start | 0.339 | 0.727 | 0.588 | 0.556 | 0.552 |
| default | 0.148 | 0.525 | 0.552 | 0.826 | 0.513 |
| developed_colony | 0.646 | 0.651 | 0.628 | 0.408 | 0.583 |
| default | 0.485 | 0.774 | 0.625 | 0.424 | 0.577 |
| default | 0 | 0.55 | 0.551 | 0.756 | 0.464 |
| crisis_compound | 0.311 | 0.745 | 0.586 | 0.618 | 0.565 |
| island_isolation | 0.417 | 0.667 | 0.659 | 0.421 | 0.541 |
| population_boom | 0.311 | 0.745 | 0.607 | 0.618 | 0.57 |
| late_game_siege | 0.646 | 0.651 | 0.609 | 0.408 | 0.578 |
| no_director | 0.524 | 0.851 | 0.513 | 0.637 | 0.631 |

### 18. Traffic Flow Quality (交通流质量)
| Scenario | Congestion | Path Div | Roads | Road Score | Gini | Score |
|---|---|---|---|---|---|---|
| default | 140 | 3 | 28 | 0.353 | 0.356 | 0.67 |
| default | 225 | 3 | 50 | 0.762 | 0.209 | 0.803 |
| default | 83 | 3 | 43 | 0.095 | 0.186 | 0.555 |
| scarce_resources | 82 | 3 | 24 | 0.093 | 0.337 | 0.636 |
| abundant_resources | 118 | 3 | 61 | 0.658 | 0.447 | 0.73 |
| resource_chains_basic | 101 | 3 | 29 | 0.137 | 0.288 | 0.55 |
| full_processing | 100 | 3 | 56 | 0.834 | 0.521 | 0.741 |
| tooled_colony | 114 | 3 | 29 | 0.32 | 0.25 | 0.696 |
| high_threat | 85 | 3 | 31 | 0.187 | 0.282 | 0.66 |
| skeleton_crew | 8 | 3 | 27 | 0.172 | 0 | 0.611 |
| large_colony | 173 | 3 | 35 | 0.597 | 0.198 | 0.764 |
| wildlife_heavy | 76 | 3 | 32 | 0 | 0.127 | 0.555 |
| storm_start | 92 | 3 | 39 | 0.325 | 0.326 | 0.577 |
| default | 170 | 3 | 28 | 0.353 | 0.427 | 0.656 |
| developed_colony | 96 | 3 | 46 | 0.542 | 0.286 | 0.737 |
| default | 127 | 3 | 33 | 0.03 | 0.538 | 0.583 |
| default | 94 | 3 | 31 | 0.423 | 0.122 | 0.73 |
| crisis_compound | 13 | 3 | 27 | 0.172 | 0 | 0.712 |
| island_isolation | 74 | 2 | 28 | 0 | 0.222 | 0.581 |
| population_boom | 168 | 3 | 27 | 0.172 | 0.067 | 0.702 |
| late_game_siege | 92 | 3 | 42 | 0.469 | 0.278 | 0.72 |
| no_director | 51 | 3 | 15 | 0 | 0 | 0.563 |

---

## Improvement Targets

### Maturity Tier — Key Gaps

- **Logistics**: 0.428 (F)
- **Spatial Layout Intelligence (空间布局智能)**: 0.564 (D)
- **Environmental Responsiveness (环境响应性)**: 0.607 (D)
- **Tile State Richness (地块状态丰富度)**: 0.656 (C)
- **System Coupling Density (系统耦合密度)**: 0.657 (C)

### What Would Raise the Score

To meaningfully improve the Maturity tier, the game needs:
- **Multiple NPC needs** (rest, morale, social) with conflicting priorities
- **Tile state richness** (crop growth stages, building degradation, cooldowns)
- **Action duration realism** (work progress bars, variable task times)
- **Day/night cycles** affecting behavior and production
- **Social interactions** between NPCs (relationships, conversations)
- **Diminishing returns** on resource gathering
- **Worker specialization** through experience/skills
