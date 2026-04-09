# Project Utopia — Comprehensive Game Evaluation Report

> Generated: 2026-04-09 08:23:08
> Version: 0.5.4 (Phase 1: Resource Chains + Bridge)
> Scenarios: 22 | Duration: 1410s total sim time
> Scoring: 3-tier weighted (Foundation 20% + Gameplay 30% + Maturity 50%)

## Overall Score

**0.784 (C)**

| Tier | Score | Grade | Weight |
|---|---|---|---|
| **Foundation** (基础运行) | 0.966 | A | 20% |
| **Gameplay** (游戏玩法) | 0.758 | C | 30% |
| **Maturity** (游戏成熟度) | 0.727 | C | 50% |

## Tier 1: Foundation (基础运行)

| Dimension | Score | Grade | Description |
|---|---|---|---|
| Stability | 1 | A | Long-run correctness |
| Technical | 0.829 | B | AI quality, pathfinding |
| Coverage | 1.07 | A | Game element utilization |

## Tier 2: Gameplay (游戏玩法)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Development | 0.814 | B | 20% | Progressive complexity growth |
| Playability | 0.862 | B | 20% | Tension curves, engagement |
| Efficiency | 0.74 | C | 18% | Labor throughput, utilization |
| Logistics | 0.428 | F | 15% | Infrastructure quality |
| Reasonableness | 0.881 | B | 15% | NPC behavior naturalness |
| Adaptability | 0.779 | C | 12% | Crisis recovery |

## Tier 3: Maturity (游戏成熟度)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Action Duration Realism | 0.775 | C | 10% | 动作时长真实性 |
| Tile State Richness | 0.656 | C | 8% | 地块状态丰富度 |
| NPC Needs Depth | 0.795 | C | 10% | NPC需求深度 |
| Economic Feedback Loops | 0.775 | C | 8% | 经济反馈循环 |
| Spatial Layout Intelligence | 0.558 | D | 8% | 空间布局智能 |
| Temporal Realism | 0.66 | C | 7% | 时间真实性 |
| Emergent Narrative | 0.874 | B | 8% | 涌现叙事密度 |
| Decision Consequence | 0.661 | C | 9% | 决策后果深度 |
| Traffic Flow Quality | 0.679 | C | 8% | 交通流质量 |
| Population Dynamics | 0.902 | A | 8% | 人口动态真实性 |
| Environmental Responsiveness | 0.666 | C | 8% | 环境响应性 |
| System Coupling Density | 0.7 | C | 8% | 系统耦合密度 |

---

## 1. Stability (稳定性)

| Scenario | Survived | Time | NaN | Neg | Errors | Entities | Outcome |
|---|---|---|---|---|---|---|---|
| default/temperate_plains | YES | 90/90s | 0 | 0 | 0 | 23 | none |
| default/fortified_basin | YES | 90/90s | 0 | 0 | 0 | 20 | none |
| default/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 21 | none |
| scarce_resources/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 21 | none |
| abundant_resources/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| resource_chains_basic/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
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
| default/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 24 | none |
| crisis_compound/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 17 | none |
| island_isolation/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 15 | none |
| population_boom/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 28 | none |
| late_game_siege/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 28 | none |
| no_director/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 20 | none |

## 2. Development (发展性)

| Scenario | Buildings Early→Late | Resources Early→Late | Peak Roles | Objectives |
|---|---|---|---|---|
| default | 38.5→41.43 | 3.7→6 | 8 | 1/3 |
| default | 44.67→45 | 3.7→5.1 | 8 | 1/3 |
| default | 17.5→19.2 | 3→3.8 | 5 | 0/3 |
| scarce_resources | 49→51.43 | 2.8→3.1 | 5 | 1/3 |
| abundant_resources | 56→56.86 | 2.3→6 | 7 | 1/3 |
| resource_chains_basic | 55.83→56.71 | 4→6.9 | 8 | 1/3 |
| full_processing | 59→59 | 7→7 | 8 | 1/3 |
| tooled_colony | 55.83→56 | 4→5 | 7 | 1/3 |
| high_threat | 54.67→55.86 | 2.3→5 | 7 | 1/3 |
| skeleton_crew | 51→51 | 2.8→3 | 4 | 1/3 |
| large_colony | 50.83→52 | 3.5→6 | 8 | 1/3 |
| wildlife_heavy | 10.67→12.29 | 3→3 | 5 | 0/3 |
| storm_start | 54.67→56.14 | 2.3→6 | 8 | 1/3 |
| default | 38.5→39.86 | 3.7→5.9 | 8 | 1/3 |
| developed_colony | 62.83→63 | 4→7 | 8 | 1/3 |
| default | 83.5→84.6 | 2.3→5 | 8 | 1/3 |
| default | 39.25→40 | 3.3→6 | 7 | 1/3 |
| crisis_compound | 49→51 | 2.8→3 | 4 | 1/3 |
| island_isolation | 7→7 | 2→2.7 | 2 | 0/3 |
| population_boom | 51→50.43 | 2.8→2.6 | 5 | 1/3 |
| late_game_siege | 62.83→63 | 4→7 | 8 | 1/3 |
| no_director | 49→46.86 | 3→3 | 5 | 0/3 |

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
| default | 1 | 0.925 | 1 | 0.52 | 0.905 |
| default | 1 | 0.939 | 0.855 | 0.5 | 0.87 |
| default | 0.929 | 0.919 | 0.929 | 0 | 0.786 |
| scarce_resources | 1 | 0.902 | 0.968 | 0.51 | 0.889 |
| abundant_resources | 0.943 | 0.925 | 1 | 0.56 | 0.894 |
| resource_chains_basic | 1 | 0.951 | 1 | 0.56 | 0.92 |
| full_processing | 0.981 | 0.906 | 1 | 0.65 | 0.913 |
| tooled_colony | 0.887 | 0.898 | 1 | 0.73 | 0.895 |
| high_threat | 0.943 | 0.93 | 1 | 0.52 | 0.89 |
| skeleton_crew | 0.777 | 0.852 | 0.984 | 0.58 | 0.821 |
| large_colony | 0.5 | 0.899 | 1 | 0.64 | 0.766 |
| wildlife_heavy | 1 | 0.903 | 0.984 | 0.33 | 0.867 |
| storm_start | 0.943 | 0.933 | 1 | 0.56 | 0.897 |
| default | 1 | 0.923 | 1 | 0.76 | 0.941 |
| developed_colony | 0.998 | 0.916 | 1 | 0.65 | 0.922 |
| default | 0.663 | 0.944 | 1 | 0.56 | 0.817 |
| default | 1 | 0.931 | 1 | 0.63 | 0.924 |
| crisis_compound | 1 | 0.921 | 0.968 | 0.52 | 0.896 |
| island_isolation | 1 | 0.766 | 0.5 | 0.17 | 0.68 |
| population_boom | 0.902 | 0.891 | 0.935 | 0.5 | 0.847 |
| late_game_siege | 0.862 | 0.934 | 1 | 0.65 | 0.886 |
| no_director | 0.734 | 0.907 | 1 | 0 | 0.742 |

## 5. Technical (技术性)

| Scenario | Cache Hit | Validity | Goal Stability | AI Rate | Tool Mult | Score |
|---|---|---|---|---|---|---|
| default | 0.409 | 1 | 0.989 | 11.3/min | 1.45 | 0.909 |
| default | 0.398 | 1 | 0.989 | 11.3/min | 1 | 0.707 |
| default | 0.207 | 1 | 0.983 | 11/min | 1 | 0.847 |
| scarce_resources | 0.118 | 1 | 0.983 | 11/min | 1 | 0.83 |
| abundant_resources | 0.145 | 1 | 0.983 | 11/min | 1.15 | 0.735 |
| resource_chains_basic | 0.169 | 1 | 0.983 | 11/min | 1.45 | 0.872 |
| full_processing | 0.174 | 1 | 0.983 | 11/min | 1.45 | 0.873 |
| tooled_colony | 0.397 | 1 | 0.983 | 11/min | 1.45 | 0.906 |
| high_threat | 0.214 | 1 | 0.933 | 11/min | 1 | 0.669 |
| skeleton_crew | 0.216 | 1 | 0.933 | 11/min | 1 | 0.836 |
| large_colony | 0.329 | 1 | 0.99 | 11/min | 1.45 | 0.897 |
| wildlife_heavy | 0.15 | 1 | 0.967 | 11/min | 1 | 0.832 |
| storm_start | 0.145 | 1 | 0.983 | 11/min | 1.15 | 0.735 |
| default | 0.499 | 1 | 0.989 | 11.3/min | 1.45 | 0.923 |
| developed_colony | 0.198 | 1 | 0.983 | 11/min | 1.45 | 0.876 |
| default | 0.196 | 1 | 1 | 11/min | 1 | 0.679 |
| default | 0.213 | 1 | 0.983 | 11/min | 1.3 | 0.812 |
| crisis_compound | 0.106 | 1 | 0.85 | 11/min | 1 | 0.795 |
| island_isolation | 0.716 | 1 | 0.933 | 11/min | 1 | 0.93 |
| population_boom | 0.256 | 1 | 0.99 | 11/min | 1 | 0.858 |
| late_game_siege | 0.166 | 1 | 0.917 | 11/min | 1.45 | 0.858 |
| no_director | 0.323 | 1 | 0.983 | 11/min | 1 | 0.869 |

## 6. Reasonableness (合理性)

| Scenario | Diversity | Non-Repetition | Coherence | Productivity | Score |
|---|---|---|---|---|---|
| default | 0.804 | 1 | 1 | 0.893 | 0.909 |
| default | 0.833 | 1 | 1 | 0.888 | 0.916 |
| default | 0.766 | 1 | 1 | 0.875 | 0.892 |
| scarce_resources | 0.74 | 1 | 1 | 0.894 | 0.89 |
| abundant_resources | 0.795 | 1 | 1 | 0.892 | 0.906 |
| resource_chains_basic | 0.837 | 1 | 1 | 0.894 | 0.919 |
| full_processing | 0.823 | 0.833 | 1 | 0.894 | 0.882 |
| tooled_colony | 0.788 | 0.833 | 1 | 0.897 | 0.872 |
| high_threat | 0.772 | 0.556 | 1 | 0.902 | 0.813 |
| skeleton_crew | 0.91 | 1 | 0.67 | 0.96 | 0.895 |
| large_colony | 0.766 | 0.833 | 1 | 0.674 | 0.799 |
| wildlife_heavy | 0.747 | 1 | 1 | 0.9 | 0.894 |
| storm_start | 0.787 | 1 | 1 | 0.892 | 0.904 |
| default | 0.798 | 1 | 1 | 0.891 | 0.907 |
| developed_colony | 0.823 | 0.833 | 1 | 0.896 | 0.882 |
| default | 0.787 | 1 | 0.67 | 0.882 | 0.835 |
| default | 0.771 | 1 | 1 | 0.895 | 0.9 |
| crisis_compound | 0.913 | 1 | 1 | 0.959 | 0.961 |
| island_isolation | 0.755 | 1 | 1 | 0.935 | 0.907 |
| population_boom | 0.826 | 1 | 1 | 0.631 | 0.837 |
| late_game_siege | 0.805 | 0.556 | 1 | 0.896 | 0.821 |
| no_director | 0.765 | 1 | 0.67 | 0.93 | 0.843 |

## 7. Efficiency (效率)

| Scenario | Deliveries | Carry/W/Min | Idle% | Proc Util | Depot Dist | Score |
|---|---|---|---|---|---|---|
| default | 51 | 2.29 | 2.8% | 0.559 | 1.9 | 0.969 |
| default | 35 | 1.8 | 3.2% | 0.447 | 3.4 | 0.888 |
| default | 24 | 1.86 | 4.8% | 0 | 5 | 0.847 |
| scarce_resources | 11 | 0.84 | 2.9% | 0 | 2.4 | 0.707 |
| abundant_resources | 8 | 0.55 | 2.9% | 0.167 | 2.1 | 0.581 |
| resource_chains_basic | 14 | 0.98 | 2.9% | 0.494 | 2.2 | 0.807 |
| full_processing | 1 | 0.07 | 2.9% | 0.311 | 1.7 | 0.588 |
| tooled_colony | 11 | 0.76 | 3.1% | 0.233 | 1.7 | 0.652 |
| high_threat | 7 | 0.49 | 2.9% | 0.1 | 2 | 0.539 |
| skeleton_crew | 5 | 0.92 | 2.4% | 0 | 2.1 | 0.731 |
| large_colony | 24 | 1.2 | 3.2% | 0.472 | 1.7 | 0.838 |
| wildlife_heavy | 25 | 1.94 | 3.3% | 0 | 3.8 | 0.893 |
| storm_start | 18 | 1.25 | 2.9% | 0.27 | 2.2 | 0.737 |
| default | 39 | 1.75 | 2.8% | 0.473 | 1.8 | 0.918 |
| developed_colony | 4 | 0.28 | 2.9% | 0.689 | 1.2 | 0.721 |
| default | 14 | 0.98 | 4.3% | 0.156 | 2.5 | 0.633 |
| default | 32 | 2.23 | 4.3% | 0.649 | 2 | 0.967 |
| crisis_compound | 5 | 0.9 | 2.3% | 0 | 2.6 | 0.714 |
| island_isolation | 5 | 0.72 | 3.3% | 0 | 10.6 | 0.481 |
| population_boom | 11 | 0.55 | 3.2% | 0 | 2.1 | 0.658 |
| late_game_siege | 10 | 0.69 | 2.9% | 0.556 | 1.4 | 0.78 |
| no_director | 8 | 0.67 | 3.2% | 0 | 3.9 | 0.636 |

## 8. Adaptability (适应性)

| Scenario | Weather Chg | Weather Resp | Dips | Recovery | Deaths | Death Impact | Score |
|---|---|---|---|---|---|---|---|
| default | 4 | 0.925 | 2 | 0.12 | 1 | 0.916 | 0.697 |
| default | 4 | 0.915 | 1 | 0 | 1 | 0.898 | 0.654 |
| default | 2 | 0.994 | 1 | 0 | 1 | 1 | 0.698 |
| scarce_resources | 2 | 0.917 | 2 | 0.254 | 1 | 1 | 0.751 |
| abundant_resources | 2 | 0.9 | 1 | 0 | 1 | 1 | 0.67 |
| resource_chains_basic | 2 | 0.815 | 2 | 0.499 | 0 | 1 | 0.794 |
| full_processing | 2 | 0.965 | 0 | 1 | 1 | 0.962 | 0.982 |
| tooled_colony | 2 | 0.996 | 1 | 0.461 | 1 | 1 | 0.837 |
| high_threat | 2 | 0.883 | 2 | 0.072 | 1 | 1 | 0.687 |
| skeleton_crew | 2 | 0.853 | 1 | 0 | 1 | 1 | 0.656 |
| large_colony | 2 | 1 | 0 | 1 | 1 | 0.994 | 0.999 |
| wildlife_heavy | 2 | 0.997 | 1 | 0 | 7 | 0.993 | 0.698 |
| storm_start | 3 | 0.941 | 2 | 0.232 | 1 | 0.958 | 0.744 |
| default | 4 | 0.928 | 1 | 0.273 | 1 | 0.896 | 0.74 |
| developed_colony | 2 | 0.944 | 0 | 1 | 1 | 0.919 | 0.967 |
| default | 2 | 0.957 | 2 | 0.263 | 1 | 0.988 | 0.764 |
| default | 2 | 0.907 | 1 | 0.417 | 1 | 0.823 | 0.762 |
| crisis_compound | 3 | 0.921 | 2 | 0.259 | 1 | 1 | 0.754 |
| island_isolation | 2 | 1 | 1 | 0 | 1 | 0.9 | 0.68 |
| population_boom | 2 | 1 | 1 | 0 | 1 | 1 | 0.7 |
| late_game_siege | 3 | 0.956 | 0 | 1 | 1 | 0.963 | 0.979 |
| no_director | 2 | 0.848 | 0 | 1 | 1 | 0.907 | 0.936 |

## 9. Logistics (物流)

| Scenario | Road Coverage | Warehouse Dist | Chain Complete | Res Balance | Score |
|---|---|---|---|---|---|
| default | 0.333 | 0.616 | 0.667 | 0.278 | 0.473 |
| default | 0.337 | 0.658 | 0.722 | 0.212 | 0.482 |
| default | 0.886 | 0.66 | 0 | 0.147 | 0.423 |
| scarce_resources | 0.187 | 0.542 | 0 | 0.189 | 0.23 |
| abundant_resources | 0.342 | 0.649 | 0.667 | 0.252 | 0.477 |
| resource_chains_basic | 0.233 | 0.585 | 0.944 | 0.516 | 0.57 |
| full_processing | 0.367 | 0.455 | 1 | 0.324 | 0.537 |
| tooled_colony | 0.374 | 0.493 | 0.667 | 0.39 | 0.481 |
| high_threat | 0.226 | 0.658 | 0.667 | 0.287 | 0.459 |
| skeleton_crew | 0.187 | 0.364 | 0 | 0.311 | 0.215 |
| large_colony | 0.269 | 0.596 | 0.667 | 0.315 | 0.462 |
| wildlife_heavy | 0.828 | 0.661 | 0 | 0.125 | 0.404 |
| storm_start | 0.226 | 0.633 | 0.722 | 0.286 | 0.467 |
| default | 0.329 | 0.585 | 0.667 | 0.463 | 0.511 |
| developed_colony | 0.449 | 0.476 | 1 | 0.374 | 0.575 |
| default | 0.456 | 0.752 | 0.667 | 0.323 | 0.549 |
| default | 0.315 | 0.693 | 0.583 | 0.368 | 0.49 |
| crisis_compound | 0.187 | 0.247 | 0 | 0.199 | 0.158 |
| island_isolation | 0.667 | 0.474 | 0 | 0.001 | 0.285 |
| population_boom | 0.187 | 0.552 | 0 | 0.176 | 0.229 |
| late_game_siege | 0.449 | 0.439 | 1 | 0.373 | 0.565 |
| no_director | 0.171 | 0.562 | 0 | 0.798 | 0.382 |

---

## Maturity Dimension Breakdowns

### 10. Action Duration Realism (动作时长真实性)
| Scenario | Action CV | Action Ratio | Has Progress | Score |
|---|---|---|---|---|
| default | 1.037 | 0.288 | true | 0.888 |
| default | 1.605 | 0.256 | true | 0.856 |
| default | 1.407 | 0.266 | true | 0.866 |
| scarce_resources | 0.895 | 0.12 | true | 0.72 |
| abundant_resources | 1.067 | 0.181 | true | 0.781 |
| resource_chains_basic | 1.154 | 0.327 | true | 0.927 |
| full_processing | 0.418 | 0.044 | true | 0.5 |
| tooled_colony | 0.738 | 0.041 | true | 0.618 |
| high_threat | 0.986 | 0.037 | true | 0.637 |
| skeleton_crew | 1.016 | 0.139 | true | 0.739 |
| large_colony | 1.052 | 0.329 | true | 0.929 |
| wildlife_heavy | 1.209 | 0.312 | true | 0.912 |
| storm_start | 1.079 | 0.272 | true | 0.872 |
| default | 1.174 | 0.256 | true | 0.856 |
| developed_colony | 0.353 | 0.051 | true | 0.484 |
| default | 1.344 | 0.311 | true | 0.911 |
| default | 0.939 | 0.228 | true | 0.828 |
| crisis_compound | 1.425 | 0.236 | true | 0.836 |
| island_isolation | 0.546 | 0.137 | true | 0.642 |
| population_boom | 0.972 | 0.141 | true | 0.741 |
| late_game_siege | 0.9 | 0.047 | true | 0.647 |
| no_director | 1.109 | 0.253 | true | 0.853 |

### 12. NPC Needs Depth (NPC需求深度)
| Scenario | Needs | Conflicts | Satisfaction Actions | Has Mood | Score |
|---|---|---|---|---|---|
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| scarce_resources | hunger,rest,morale,social | 6 | eat,deliver,harvest | true | 0.794 |
| abundant_resources | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| resource_chains_basic | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| full_processing | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| tooled_colony | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,process | true | 0.887 |
| high_threat | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| skeleton_crew | hunger,rest,morale,social | 6 | deliver,harvest | true | 0.712 |
| large_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest | true | 0.794 |
| wildlife_heavy | hunger,rest,morale,social | 6 | eat,deliver,harvest | true | 0.794 |
| storm_start | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.825 |
| developed_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process | true | 0.744 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| crisis_compound | hunger,rest,morale,social | 6 | eat,deliver,harvest | true | 0.794 |
| island_isolation | hunger,rest,morale,social | 6 | eat,deliver,harvest | true | 0.794 |
| population_boom | hunger,rest,morale,social | 6 | eat,deliver,harvest | true | 0.794 |
| late_game_siege | hunger,rest,morale,social | 6 | eat,deliver,harvest,process | true | 0.775 |
| no_director | hunger,rest,morale,social | 6 | rest,wander,deliver,harvest | true | 0.775 |

### 14. Spatial Layout Intelligence (空间布局智能)
| Scenario | Cluster | Zoning | Path Eff | Expansion | Score |
|---|---|---|---|---|---|
| default | 0.148 | 0.5 | 0.552 | 0.795 | 0.499 |
| default | 0.65 | 0.727 | 0.615 | 0.45 | 0.61 |
| default | 0.74 | 0.632 | 0.605 | 0.303 | 0.57 |
| scarce_resources | 0.311 | 0.717 | 0.614 | 0.601 | 0.561 |
| abundant_resources | 0.36 | 0.667 | 0.607 | 0.57 | 0.551 |
| resource_chains_basic | 0.335 | 0.667 | 0.562 | 0.572 | 0.534 |
| full_processing | 0.608 | 0.695 | 0.672 | 0.445 | 0.605 |
| tooled_colony | 0.626 | 0.732 | 0.601 | 0.518 | 0.619 |
| high_threat | 0.36 | 0.667 | 0.62 | 0.552 | 0.55 |
| skeleton_crew | 0.311 | 0.745 | 0.602 | 0.618 | 0.569 |
| large_colony | 0.533 | 0.788 | 0.585 | 0.634 | 0.635 |
| wildlife_heavy | 0.881 | 0 | 0.641 | 0.036 | 0.39 |
| storm_start | 0.36 | 0.667 | 0.596 | 0.552 | 0.544 |
| default | 0.148 | 0.525 | 0.603 | 0.826 | 0.526 |
| developed_colony | 0.646 | 0.651 | 0.605 | 0.408 | 0.577 |
| default | 0.485 | 0.765 | 0.611 | 0.419 | 0.57 |
| default | 0 | 0.55 | 0.548 | 0.756 | 0.463 |
| crisis_compound | 0.311 | 0.731 | 0.601 | 0.61 | 0.563 |
| island_isolation | 0.702 | 0.286 | 0.597 | 0.332 | 0.479 |
| population_boom | 0.524 | 0.8 | 0.621 | 0.619 | 0.641 |
| late_game_siege | 0.646 | 0.651 | 0.617 | 0.408 | 0.581 |
| no_director | 0.524 | 0.891 | 0.531 | 0.643 | 0.647 |

### 18. Traffic Flow Quality (交通流质量)
| Scenario | Congestion | Path Div | Roads | Road Score | Gini | Score |
|---|---|---|---|---|---|---|
| default | 148 | 3 | 26 | 0.271 | 0.258 | 0.673 |
| default | 141 | 3 | 50 | 0.628 | 0.388 | 0.731 |
| default | 91 | 3 | 35 | 0.505 | 0.081 | 0.766 |
| scarce_resources | 99 | 3 | 25 | 0.118 | 0.363 | 0.634 |
| abundant_resources | 106 | 3 | 53 | 0.532 | 0.511 | 0.686 |
| resource_chains_basic | 101 | 3 | 31 | 0.177 | 0.182 | 0.671 |
| full_processing | 112 | 3 | 54 | 0.793 | 0.333 | 0.786 |
| tooled_colony | 119 | 3 | 29 | 0.337 | 0.431 | 0.662 |
| high_threat | 98 | 3 | 30 | 0.162 | 0.202 | 0.676 |
| skeleton_crew | 8 | 3 | 27 | 0.172 | 0 | 0.615 |
| large_colony | 150 | 3 | 34 | 0.544 | 0.211 | 0.744 |
| wildlife_heavy | 108 | 3 | 30 | 0 | 0.123 | 0.664 |
| storm_start | 94 | 3 | 40 | 0.315 | 0.247 | 0.693 |
| default | 165 | 3 | 28 | 0.353 | 0.283 | 0.695 |
| developed_colony | 94 | 3 | 42 | 0.469 | 0.242 | 0.726 |
| default | 117 | 3 | 33 | 0.025 | 0.419 | 0.603 |
| default | 115 | 3 | 31 | 0.423 | 0.419 | 0.67 |
| crisis_compound | 11 | 3 | 26 | 0.144 | 0 | 0.609 |
| island_isolation | 40 | 2 | 23 | 0 | 0 | 0.613 |
| population_boom | 168 | 3 | 26 | 0.165 | 0.446 | 0.628 |
| late_game_siege | 85 | 3 | 48 | 0.579 | 0.393 | 0.721 |
| no_director | 50 | 3 | 15 | 0 | 0 | 0.666 |

---

## Improvement Targets

### Maturity Tier — Key Gaps

- **Logistics**: 0.428 (F)
- **Spatial Layout Intelligence (空间布局智能)**: 0.558 (D)
- **Tile State Richness (地块状态丰富度)**: 0.656 (C)
- **Temporal Realism (时间真实性)**: 0.66 (C)
- **Decision Consequence (决策后果深度)**: 0.661 (C)

### What Would Raise the Score

To meaningfully improve the Maturity tier, the game needs:
- **Multiple NPC needs** (rest, morale, social) with conflicting priorities
- **Tile state richness** (crop growth stages, building degradation, cooldowns)
- **Action duration realism** (work progress bars, variable task times)
- **Day/night cycles** affecting behavior and production
- **Social interactions** between NPCs (relationships, conversations)
- **Diminishing returns** on resource gathering
- **Worker specialization** through experience/skills
