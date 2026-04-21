# Project Utopia — Comprehensive Game Evaluation Report

> Generated: 2026-04-11 09:15:45
> Version: 0.5.4 (Phase 1: Resource Chains + Bridge)
> Scenarios: 22 | Duration: 2820s total sim time
> Scoring: 3-tier weighted (Foundation 20% + Gameplay 30% + Maturity 50%)

## Overall Score

**0.85 (B)**

| Tier | Score | Grade | Weight |
|---|---|---|---|
| **Foundation** (基础运行) | 0.961 | A | 20% |
| **Gameplay** (游戏玩法) | 0.771 | C | 30% |
| **Maturity** (游戏成熟度) | 0.853 | B | 50% |

## Tier 1: Foundation (基础运行)

| Dimension | Score | Grade | Description |
|---|---|---|---|
| Stability | 1 | A | Long-run correctness |
| Technical | 0.783 | C | AI quality, pathfinding |
| Coverage | 1.1 | A | Game element utilization |

## Tier 2: Gameplay (游戏玩法)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Development | 0.795 | C | 20% | Progressive complexity growth |
| Playability | 0.876 | B | 20% | Tension curves, engagement |
| Efficiency | 0.694 | C | 18% | Labor throughput, utilization |
| Logistics | 0.541 | D | 15% | Infrastructure quality |
| Reasonableness | 0.861 | B | 15% | NPC behavior naturalness |
| Adaptability | 0.847 | B | 12% | Crisis recovery |

## Tier 3: Maturity (游戏成熟度)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Action Duration Realism | 0.975 | A | 10% | 动作时长真实性 |
| Tile State Richness | 0.81 | B | 8% | 地块状态丰富度 |
| NPC Needs Depth | 0.905 | A | 10% | NPC需求深度 |
| Economic Feedback Loops | 0.944 | A | 8% | 经济反馈循环 |
| Spatial Layout Intelligence | 0.624 | D | 8% | 空间布局智能 |
| Temporal Realism | 0.778 | C | 7% | 时间真实性 |
| Emergent Narrative | 0.936 | A | 8% | 涌现叙事密度 |
| Decision Consequence | 0.818 | B | 9% | 决策后果深度 |
| Traffic Flow Quality | 0.72 | C | 8% | 交通流质量 |
| Population Dynamics | 0.991 | A | 8% | 人口动态真实性 |
| Environmental Responsiveness | 0.808 | B | 8% | 环境响应性 |
| System Coupling Density | 0.874 | B | 8% | 系统耦合密度 |

---

## 1. Stability (稳定性)

| Scenario | Survived | Time | NaN | Neg | Errors | Entities | Outcome |
|---|---|---|---|---|---|---|---|
| default/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 37 | none |
| default/fortified_basin | YES | 180/180s | 0 | 0 | 0 | 37 | none |
| default/archipelago_isles | YES | 120/120s | 0 | 0 | 0 | 31 | none |
| scarce_resources/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 29 | none |
| abundant_resources/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 31 | none |
| resource_chains_basic/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 31 | none |
| full_processing/fortified_basin | YES | 120/120s | 0 | 0 | 0 | 31 | none |
| tooled_colony/fortified_basin | YES | 120/120s | 0 | 0 | 0 | 31 | none |
| high_threat/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 34 | none |
| skeleton_crew/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 22 | none |
| large_colony/fortified_basin | YES | 120/120s | 0 | 0 | 0 | 39 | none |
| wildlife_heavy/archipelago_isles | YES | 120/120s | 0 | 0 | 0 | 34 | none |
| storm_start/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 31 | none |
| default/temperate_plains | YES | 180/180s | 0 | 0 | 0 | 36 | none |
| developed_colony/fortified_basin | YES | 120/120s | 0 | 0 | 0 | 31 | none |
| default/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 31 | none |
| default/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 31 | none |
| crisis_compound/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 24 | none |
| island_isolation/archipelago_isles | YES | 120/120s | 0 | 0 | 0 | 26 | none |
| population_boom/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 38 | none |
| late_game_siege/fortified_basin | YES | 120/120s | 0 | 0 | 0 | 35 | none |
| no_director/temperate_plains | YES | 120/120s | 0 | 0 | 0 | 23 | none |

## 2. Development (发展性)

| Scenario | Buildings Early→Late | Resources Early→Late | Peak Roles | Objectives |
|---|---|---|---|---|
| default | 56.42→64.08 | 3.2→5.5 | 8 | 1/3 |
| default | 92.42→92.38 | 3.3→4 | 7 | 1/3 |
| default | 28.38→40.44 | 3→4 | 6 | 0/3 |
| scarce_resources | 44.75→47.38 | 2.9→4 | 5 | 1/3 |
| abundant_resources | 54.58→61.23 | 2.3→4.5 | 7 | 1/3 |
| resource_chains_basic | 52.67→58.31 | 4→4.5 | 8 | 1/3 |
| full_processing | 141.33→147.23 | 7→6.3 | 8 | 1/3 |
| tooled_colony | 136.83→136 | 4.3→5 | 8 | 1/3 |
| high_threat | 52.08→62 | 3.1→4 | 7 | 1/3 |
| skeleton_crew | 46.42→44.92 | 3.9→3.2 | 5 | 1/3 |
| large_colony | 133.75→137 | 4→5.8 | 8 | 1/3 |
| wildlife_heavy | 23.58→22.15 | 3→4 | 5 | 0/3 |
| storm_start | 52.25→62.15 | 2.3→4.6 | 7 | 1/3 |
| default | 56.42→63.92 | 2.3→5.3 | 7 | 1/3 |
| developed_colony | 144.33→149.15 | 4.6→6.7 | 8 | 1/3 |
| default | 44.63→52.56 | 2.3→4 | 8 | 1/3 |
| default | 61.38→59 | 3.1→3.8 | 7 | 0/3 |
| crisis_compound | 43.92→48.46 | 3.9→3 | 5 | 1/3 |
| island_isolation | 17→20.08 | 3.9→4 | 5 | 0/3 |
| population_boom | 46.42→45.62 | 3.9→4 | 5 | 1/3 |
| late_game_siege | 144.33→149.54 | 4.8→6.9 | 8 | 1/3 |
| no_director | 43→37.23 | 4→4 | 5 | 0/3 |

## 3. Coverage (覆盖度)

| Element | Found | Expected | Missing | Score |
|---|---|---|---|---|
| Tile Types | 14 | 14 | none | 1 |
| Roles | 8 | 8 | none | 1 |
| Resources | 7 | 7 | none | 1 |
| Intents | 15 | 10 | none | 1.5 |
| Weathers | 5 | 5 | none | 1 |

## 4. Playability (可玩性)

| Scenario | Tension | Variety | Resource Health | Progress | Score |
|---|---|---|---|---|---|
| default | 1 | 0.889 | 1 | 0.5 | 0.892 |
| default | 1 | 0.899 | 1 | 0.5 | 0.895 |
| default | 1 | 0.906 | 1 | 0.25 | 0.859 |
| scarce_resources | 1 | 0.843 | 0.902 | 0.5 | 0.853 |
| abundant_resources | 1 | 0.906 | 1 | 0.63 | 0.916 |
| resource_chains_basic | 1 | 0.912 | 1 | 0.5 | 0.899 |
| full_processing | 1 | 0.898 | 1 | 0.5 | 0.894 |
| tooled_colony | 0.991 | 0.933 | 1 | 0.6 | 0.917 |
| high_threat | 1 | 0.906 | 1 | 0.53 | 0.901 |
| skeleton_crew | 1 | 0.895 | 0.787 | 0.5 | 0.84 |
| large_colony | 1 | 0.919 | 1 | 0.6 | 0.916 |
| wildlife_heavy | 1 | 0.889 | 0.877 | 0.17 | 0.811 |
| storm_start | 1 | 0.917 | 1 | 0.57 | 0.91 |
| default | 1 | 0.887 | 1 | 0.5 | 0.891 |
| developed_colony | 1 | 0.907 | 1 | 0.58 | 0.909 |
| default | 1 | 0.895 | 1 | 0.5 | 0.894 |
| default | 1 | 0.931 | 0.744 | 0 | 0.765 |
| crisis_compound | 1 | 0.926 | 0.984 | 0.5 | 0.899 |
| island_isolation | 1 | 0.918 | 0.992 | 0 | 0.823 |
| population_boom | 1 | 0.902 | 0.885 | 0.5 | 0.867 |
| late_game_siege | 1 | 0.901 | 1 | 0.56 | 0.904 |
| no_director | 1 | 0.866 | 1 | 0 | 0.81 |

## 5. Technical (技术性)

| Scenario | Cache Hit | Validity | Goal Stability | AI Rate | Tool Mult | Score |
|---|---|---|---|---|---|---|
| default | 0.348 | 1 | 0.994 | 11/min | 1.45 | 0.901 |
| default | 0.346 | 1 | 0.994 | 11/min | 1 | 0.701 |
| default | 0.208 | 1 | 0.992 | 11/min | 1 | 0.68 |
| scarce_resources | 0.097 | 1 | 0.992 | 11/min | 1 | 0.829 |
| abundant_resources | 0.201 | 1 | 0.992 | 11/min | 1 | 0.678 |
| resource_chains_basic | 0.241 | 1 | 0.992 | 11/min | 1 | 0.685 |
| full_processing | 0.386 | 1 | 0.992 | 11/min | 1.45 | 0.906 |
| tooled_colony | 0.274 | 1 | 0.992 | 11/min | 1.45 | 0.889 |
| high_threat | 0.264 | 1 | 0.975 | 11/min | 1 | 0.685 |
| skeleton_crew | 0.195 | 1 | 0.967 | 11/min | 1 | 0.841 |
| large_colony | 0.265 | 1 | 0.995 | 11/min | 1.15 | 0.755 |
| wildlife_heavy | 0.196 | 1 | 0.983 | 11/min | 1 | 0.845 |
| storm_start | 0.229 | 1 | 0.992 | 11/min | 1 | 0.683 |
| default | 0.422 | 1 | 0.994 | 11/min | 1.3 | 0.846 |
| developed_colony | 0.396 | 1 | 0.992 | 11/min | 1.15 | 0.774 |
| default | 0.468 | 1 | 0.992 | 11/min | 1 | 0.719 |
| default | 0.265 | 1 | 0.992 | 11/min | 1 | 0.688 |
| crisis_compound | 0.242 | 1 | 0.95 | 11/min | 1 | 0.845 |
| island_isolation | 0.072 | 1 | 0.967 | 11/min | 1 | 0.818 |
| population_boom | 0.144 | 1 | 0.995 | 11/min | 1 | 0.838 |
| late_game_siege | 0.299 | 1 | 0.975 | 11/min | 1.15 | 0.756 |
| no_director | 0.275 | 1 | 0.992 | 11/min | 1 | 0.862 |

## 6. Reasonableness (合理性)

| Scenario | Diversity | Non-Repetition | Coherence | Productivity | Score |
|---|---|---|---|---|---|
| default | 0.725 | 1 | 1 | 0.885 | 0.883 |
| default | 0.712 | 0.833 | 1 | 0.887 | 0.846 |
| default | 0.765 | 0.625 | 1 | 0.861 | 0.813 |
| scarce_resources | 0.671 | 0.694 | 1 | 0.92 | 0.816 |
| abundant_resources | 0.732 | 1 | 1 | 0.916 | 0.894 |
| resource_chains_basic | 0.78 | 1 | 1 | 0.898 | 0.904 |
| full_processing | 0.751 | 0.694 | 1 | 0.919 | 0.84 |
| tooled_colony | 0.776 | 0.417 | 1 | 0.867 | 0.776 |
| high_threat | 0.723 | 0.972 | 1 | 0.915 | 0.886 |
| skeleton_crew | 0.83 | 1 | 1 | 0.921 | 0.925 |
| large_colony | 0.714 | 1 | 1 | 0.908 | 0.886 |
| wildlife_heavy | 0.75 | 0.556 | 1 | 0.907 | 0.808 |
| storm_start | 0.76 | 0.972 | 1 | 0.89 | 0.889 |
| default | 0.7 | 1 | 1 | 0.89 | 0.877 |
| developed_colony | 0.753 | 0.972 | 1 | 0.905 | 0.892 |
| default | 0.667 | 1 | 1 | 0.902 | 0.871 |
| default | 0.767 | 1 | 1 | 0.836 | 0.881 |
| crisis_compound | 0.84 | 1 | 1 | 0.896 | 0.921 |
| island_isolation | 0.856 | 1 | 1 | 0.84 | 0.909 |
| population_boom | 0.645 | 0.972 | 1 | 0.888 | 0.854 |
| late_game_siege | 0.743 | 0.694 | 1 | 0.904 | 0.833 |
| no_director | 0.743 | 0.556 | 0.67 | 0.904 | 0.739 |

## 7. Efficiency (效率)

| Scenario | Deliveries | Carry/W/Min | Idle% | Proc Util | Depot Dist | Score |
|---|---|---|---|---|---|---|
| default | 61 | 0.97 | 1.5% | 0.232 | 3.4 | 0.809 |
| default | 36 | 0.57 | 1.6% | 0.045 | 3 | 0.637 |
| default | 24 | 0.67 | 2.2% | 0 | 6.9 | 0.587 |
| scarce_resources | 39 | 1.09 | 2.2% | 0 | 23.5 | 0.7 |
| abundant_resources | 50 | 1.39 | 2.2% | 0.066 | 5.9 | 0.684 |
| resource_chains_basic | 33 | 0.92 | 2.2% | 0.049 | 4.7 | 0.695 |
| full_processing | 35 | 0.97 | 2.2% | 0.343 | 1.9 | 0.889 |
| tooled_colony | 12 | 0.33 | 2.2% | 0.234 | 2.1 | 0.656 |
| high_threat | 36 | 1 | 2.2% | 0 | 2.9 | 0.701 |
| skeleton_crew | 16 | 0.89 | 2.9% | 0 | 21.2 | 0.7 |
| large_colony | 22 | 0.42 | 2% | 0.146 | 3.6 | 0.621 |
| wildlife_heavy | 16 | 0.44 | 2.2% | 0 | 5.2 | 0.692 |
| storm_start | 33 | 0.92 | 2.2% | 0.163 | 3.6 | 0.772 |
| default | 71 | 1.13 | 1.5% | 0.157 | 3.4 | 0.771 |
| developed_colony | 35 | 0.97 | 2.2% | 0.259 | 2 | 0.847 |
| default | 40 | 1.11 | 2.2% | 0.058 | 3.4 | 0.722 |
| default | 17 | 0.47 | 2.2% | 0.267 | 8.3 | 0.623 |
| crisis_compound | 24 | 1.21 | 2.5% | 0 | 2.7 | 0.933 |
| island_isolation | 2 | 0.08 | 2.5% | 0 | 9.4 | 0.407 |
| population_boom | 25 | 0.48 | 2% | 0 | 28.8 | 0.542 |
| late_game_siege | 33 | 0.92 | 2.3% | 0.209 | 1.9 | 0.823 |
| no_director | 1 | 0.03 | 5.7% | 0 | 6.2 | 0.462 |

## 8. Adaptability (适应性)

| Scenario | Weather Chg | Weather Resp | Dips | Recovery | Deaths | Death Impact | Score |
|---|---|---|---|---|---|---|---|
| default | 6 | 0.943 | 5 | 0.55 | 1 | 1 | 0.848 |
| default | 10 | 0.764 | 0 | 1 | 1 | 1 | 0.929 |
| default | 5 | 0.984 | 1 | 0 | 2 | 1 | 0.695 |
| scarce_resources | 8 | 0.881 | 3 | 0.576 | 1 | 1 | 0.837 |
| abundant_resources | 6 | 0.992 | 2 | 0.765 | 1 | 0.963 | 0.92 |
| resource_chains_basic | 2 | 0.978 | 4 | 0.505 | 1 | 1 | 0.845 |
| full_processing | 9 | 0.984 | 3 | 0.752 | 1 | 1 | 0.921 |
| tooled_colony | 8 | 0.936 | 0 | 1 | 1 | 0.961 | 0.973 |
| high_threat | 6 | 0.992 | 4 | 0.636 | 1 | 0.966 | 0.882 |
| skeleton_crew | 9 | 0.92 | 2 | 0.5 | 1 | 1 | 0.826 |
| large_colony | 6 | 0.989 | 1 | 0.736 | 1 | 0.981 | 0.914 |
| wildlife_heavy | 8 | 0.842 | 1 | 0 | 7 | 0.953 | 0.643 |
| storm_start | 1 | 0.939 | 2 | 0.626 | 1 | 0.983 | 0.866 |
| default | 0 | 1 | 5 | 0.452 | 2 | 0.923 | 0.82 |
| developed_colony | 2 | 0.929 | 1 | 0.913 | 1 | 1 | 0.953 |
| default | 8 | 0.997 | 3 | 0.921 | 1 | 1 | 0.976 |
| default | 9 | 0.928 | 1 | 0 | 1 | 0.986 | 0.676 |
| crisis_compound | 13 | 0.868 | 4 | 0.321 | 1 | 1 | 0.757 |
| island_isolation | 8 | 0.951 | 2 | 0.5 | 2 | 0.867 | 0.809 |
| population_boom | 10 | 0.915 | 2 | 0.5 | 2 | 0.905 | 0.805 |
| late_game_siege | 10 | 0.984 | 2 | 0.211 | 1 | 1 | 0.759 |
| no_director | 4 | 0.948 | 0 | 1 | 1 | 0.937 | 0.972 |

## 9. Logistics (物流)

| Scenario | Road Coverage | Warehouse Dist | Chain Complete | Res Balance | Score |
|---|---|---|---|---|---|
| default | 0.821 | 0.205 | 0.85 | 0.531 | 0.603 |
| default | 0.86 | 0.511 | 0.783 | 0.372 | 0.628 |
| default | 0.963 | 0 | 0.575 | 0.39 | 0.462 |
| scarce_resources | 0.731 | 0 | 0.4 | 0.369 | 0.358 |
| abundant_resources | 0.951 | 0 | 0.783 | 0.275 | 0.494 |
| resource_chains_basic | 1 | 0 | 0.917 | 0.446 | 0.587 |
| full_processing | 0.985 | 0.489 | 1 | 0.69 | 0.792 |
| tooled_colony | 0.985 | 0.427 | 1 | 0.524 | 0.735 |
| high_threat | 0.958 | 0.408 | 0.783 | 0.281 | 0.599 |
| skeleton_crew | 0.817 | 0 | 0.4 | 0.395 | 0.382 |
| large_colony | 0.928 | 0.263 | 0.967 | 0.522 | 0.672 |
| wildlife_heavy | 0.763 | 0.504 | 0.4 | 0.31 | 0.476 |
| storm_start | 0.962 | 0 | 0.783 | 0.298 | 0.502 |
| default | 0.782 | 0.107 | 0.783 | 0.433 | 0.526 |
| developed_colony | 0.986 | 0.492 | 1 | 0.578 | 0.765 |
| default | 0.991 | 0.185 | 0.775 | 0.365 | 0.568 |
| default | 0.398 | 0.444 | 0.8 | 0.332 | 0.514 |
| crisis_compound | 0.689 | 0.161 | 0.4 | 0.334 | 0.381 |
| island_isolation | 0.268 | 0 | 0.4 | 0.496 | 0.298 |
| population_boom | 0.799 | 0 | 0.4 | 0.406 | 0.381 |
| late_game_siege | 0.986 | 0.301 | 1 | 0.627 | 0.729 |
| no_director | 0.171 | 0.417 | 0.389 | 0.762 | 0.446 |

---

## Maturity Dimension Breakdowns

### 10. Action Duration Realism (动作时长真实性)
| Scenario | Action CV | Action Ratio | Has Progress | Score |
|---|---|---|---|---|
| default | 1.086 | 0.295 | true | 1 |
| default | 1.295 | 0.263 | true | 1 |
| default | 1.421 | 0.13 | true | 0.947 |
| scarce_resources | 1.387 | 0.211 | true | 1 |
| abundant_resources | 1.257 | 0.197 | true | 1 |
| resource_chains_basic | 0.971 | 0.178 | true | 1 |
| full_processing | 1.145 | 0.099 | true | 0.863 |
| tooled_colony | 1.144 | 0.174 | true | 1 |
| high_threat | 0.994 | 0.345 | true | 1 |
| skeleton_crew | 1.258 | 0.179 | true | 1 |
| large_colony | 1.358 | 0.15 | true | 1 |
| wildlife_heavy | 1.105 | 0.26 | true | 1 |
| storm_start | 1.256 | 0.249 | true | 1 |
| default | 1.121 | 0.348 | true | 1 |
| developed_colony | 1.036 | 0.127 | true | 0.938 |
| default | 1.112 | 0.212 | true | 1 |
| default | 1.393 | 0.266 | true | 1 |
| crisis_compound | 0.907 | 0.197 | true | 1 |
| island_isolation | 1.158 | 0.09 | true | 0.841 |
| population_boom | 1.462 | 0.469 | true | 1 |
| late_game_siege | 0.752 | 0.19 | true | 0.982 |
| no_director | 1.716 | 0.105 | true | 0.879 |

### 12. NPC Needs Depth (NPC需求深度)
| Scenario | Needs | Conflicts | Satisfaction Actions | Has Mood | Score |
|---|---|---|---|---|---|
| default | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,process,socialize,haul | true | 0.95 |
| default | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,process,socialize,haul | true | 0.95 |
| default | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,process,socialize,haul | true | 0.95 |
| scarce_resources | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,socialize,haul | true | 0.919 |
| abundant_resources | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| resource_chains_basic | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,process,socialize,haul | true | 0.95 |
| full_processing | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,process,socialize,haul | true | 0.95 |
| tooled_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| high_threat | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| skeleton_crew | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,socialize,haul | true | 0.919 |
| large_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| wildlife_heavy | hunger,rest,morale,social | 6 | eat,rest,deliver,harvest,socialize,haul | true | 0.887 |
| storm_start | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| default | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,process,socialize,haul | true | 0.95 |
| developed_colony | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,process,socialize,haul | true | 0.95 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| crisis_compound | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize,haul | true | 0.856 |
| island_isolation | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize,haul | true | 0.856 |
| population_boom | hunger,rest,morale,social | 6 | eat,rest,deliver,harvest,socialize,haul | true | 0.837 |
| late_game_siege | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,process,socialize,haul | true | 0.95 |
| no_director | hunger,rest,morale,social | 6 | rest,wander,deliver,harvest,socialize,haul | true | 0.837 |

### 14. Spatial Layout Intelligence (空间布局智能)
| Scenario | Cluster | Zoning | Path Eff | Expansion | Score |
|---|---|---|---|---|---|
| default | 0.6 | 0.554 | 0.612 | 0.513 | 0.57 |
| default | 0.258 | 0.839 | 0.656 | 0.387 | 0.555 |
| default | 0.869 | 0.571 | 0.635 | 0.701 | 0.683 |
| scarce_resources | 0.466 | 0.745 | 0.563 | 0.745 | 0.635 |
| abundant_resources | 0.753 | 0.5 | 0.603 | 0.766 | 0.648 |
| resource_chains_basic | 0.68 | 0.586 | 0.627 | 0.706 | 0.647 |
| full_processing | 0.425 | 0.85 | 0.625 | 0.562 | 0.626 |
| tooled_colony | 0.396 | 0.875 | 0.664 | 0.584 | 0.643 |
| high_threat | 0.684 | 0.5 | 0.596 | 0.785 | 0.637 |
| skeleton_crew | 0.447 | 0.75 | 0.601 | 0.764 | 0.648 |
| large_colony | 0.375 | 0.869 | 0.65 | 0.555 | 0.626 |
| wildlife_heavy | 0.451 | 0.636 | 0.586 | 0.471 | 0.543 |
| storm_start | 0.715 | 0.492 | 0.588 | 0.731 | 0.625 |
| default | 0.586 | 0.656 | 0.618 | 0.524 | 0.598 |
| developed_colony | 0.446 | 0.82 | 0.623 | 0.555 | 0.62 |
| default | 0.787 | 0.453 | 0.648 | 0.653 | 0.628 |
| default | 0.341 | 0.746 | 0.615 | 0.51 | 0.567 |
| crisis_compound | 0.55 | 0.708 | 0.598 | 0.814 | 0.67 |
| island_isolation | 0.375 | 0.571 | 0.658 | 0.502 | 0.541 |
| population_boom | 0.467 | 0.711 | 0.635 | 0.741 | 0.647 |
| late_game_siege | 0.446 | 0.807 | 0.63 | 0.562 | 0.621 |
| no_director | 0.556 | 1 | 0.646 | 0.757 | 0.744 |

### 18. Traffic Flow Quality (交通流质量)
| Scenario | Congestion | Path Div | Roads | Road Score | Gini | Score |
|---|---|---|---|---|---|---|
| default | 68 | 3 | 43 | 1 | 0.442 | 0.694 |
| default | 140 | 3 | 90 | 1 | 0.417 | 0.808 |
| default | 10 | 3 | 48 | 1 | 0.403 | 0.707 |
| scarce_resources | 36 | 3 | 28 | 0.933 | 0.196 | 0.72 |
| abundant_resources | 30 | 3 | 51 | 1 | 0.591 | 0.662 |
| resource_chains_basic | 44 | 3 | 29 | 0.967 | 0.586 | 0.762 |
| full_processing | 77 | 3 | 47 | 1 | 0.531 | 0.679 |
| tooled_colony | 88 | 3 | 78 | 1 | 0.578 | 0.777 |
| high_threat | 53 | 3 | 40 | 1 | 0.578 | 0.664 |
| skeleton_crew | 6 | 3 | 26 | 0.867 | 0.531 | 0.647 |
| large_colony | 66 | 3 | 76 | 1 | 0.42 | 0.806 |
| wildlife_heavy | 39 | 3 | 29 | 0.967 | 0.458 | 0.779 |
| storm_start | 48 | 3 | 44 | 1 | 0.646 | 0.748 |
| default | 83 | 3 | 41 | 1 | 0.299 | 0.724 |
| developed_colony | 52 | 3 | 59 | 1 | 0.565 | 0.672 |
| default | 59 | 3 | 50 | 1 | 0.585 | 0.672 |
| default | 48 | 3 | 41 | 1 | 0.261 | 0.731 |
| crisis_compound | 24 | 3 | 25 | 0.833 | 0.311 | 0.684 |
| island_isolation | 26 | 3 | 29 | 0.967 | 0.283 | 0.728 |
| population_boom | 48 | 3 | 27 | 0.9 | 0.405 | 0.686 |
| late_game_siege | 48 | 3 | 61 | 1 | 0.403 | 0.805 |
| no_director | 58 | 3 | 15 | 0.5 | 0 | 0.689 |

---

## Improvement Targets

### Maturity Tier — Key Gaps

- **Logistics**: 0.541 (D)
- **Spatial Layout Intelligence (空间布局智能)**: 0.624 (D)
- **Efficiency**: 0.694 (C)
- **Traffic Flow Quality (交通流质量)**: 0.72 (C)
- **Temporal Realism (时间真实性)**: 0.778 (C)

### What Would Raise the Score

To meaningfully improve the Maturity tier, the game needs:
- **Multiple NPC needs** (rest, morale, social) with conflicting priorities
- **Tile state richness** (crop growth stages, building degradation, cooldowns)
- **Action duration realism** (work progress bars, variable task times)
- **Day/night cycles** affecting behavior and production
- **Social interactions** between NPCs (relationships, conversations)
- **Diminishing returns** on resource gathering
- **Worker specialization** through experience/skills
