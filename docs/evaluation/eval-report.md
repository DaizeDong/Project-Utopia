# Project Utopia — Comprehensive Game Evaluation Report

> Generated: 2026-04-09 21:05:36
> Version: 0.5.4 (Phase 1: Resource Chains + Bridge)
> Scenarios: 22 | Duration: 1410s total sim time
> Scoring: 3-tier weighted (Foundation 20% + Gameplay 30% + Maturity 50%)

## Overall Score

**0.803 (B)**

| Tier | Score | Grade | Weight |
|---|---|---|---|
| **Foundation** (基础运行) | 0.955 | A | 20% |
| **Gameplay** (游戏玩法) | 0.77 | C | 30% |
| **Maturity** (游戏成熟度) | 0.762 | C | 50% |

## Tier 1: Foundation (基础运行)

| Dimension | Score | Grade | Description |
|---|---|---|---|
| Stability | 1 | A | Long-run correctness |
| Technical | 0.816 | B | AI quality, pathfinding |
| Coverage | 1.05 | A | Game element utilization |

## Tier 2: Gameplay (游戏玩法)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Development | 0.804 | B | 20% | Progressive complexity growth |
| Playability | 0.847 | B | 20% | Tension curves, engagement |
| Efficiency | 0.715 | C | 18% | Labor throughput, utilization |
| Logistics | 0.48 | F | 15% | Infrastructure quality |
| Reasonableness | 0.855 | B | 15% | NPC behavior naturalness |
| Adaptability | 0.921 | A | 12% | Crisis recovery |

## Tier 3: Maturity (游戏成熟度)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Action Duration Realism | 0.781 | C | 10% | 动作时长真实性 |
| Tile State Richness | 0.658 | C | 8% | 地块状态丰富度 |
| NPC Needs Depth | 0.845 | B | 10% | NPC需求深度 |
| Economic Feedback Loops | 0.82 | B | 8% | 经济反馈循环 |
| Spatial Layout Intelligence | 0.552 | D | 8% | 空间布局智能 |
| Temporal Realism | 0.731 | C | 7% | 时间真实性 |
| Emergent Narrative | 0.957 | A | 8% | 涌现叙事密度 |
| Decision Consequence | 0.714 | C | 9% | 决策后果深度 |
| Traffic Flow Quality | 0.682 | C | 8% | 交通流质量 |
| Population Dynamics | 0.94 | A | 8% | 人口动态真实性 |
| Environmental Responsiveness | 0.767 | C | 8% | 环境响应性 |
| System Coupling Density | 0.673 | C | 8% | 系统耦合密度 |

---

## 1. Stability (稳定性)

| Scenario | Survived | Time | NaN | Neg | Errors | Entities | Outcome |
|---|---|---|---|---|---|---|---|
| default/temperate_plains | YES | 90/90s | 0 | 0 | 0 | 26 | none |
| default/fortified_basin | YES | 90/90s | 0 | 0 | 0 | 26 | none |
| default/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 23 | none |
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
| no_director/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 23 | none |

## 2. Development (发展性)

| Scenario | Buildings Early→Late | Resources Early→Late | Peak Roles | Objectives |
|---|---|---|---|---|
| default | 39→40 | 3.2→6 | 7 | 1/3 |
| default | 44.67→47.57 | 3.7→4 | 8 | 1/3 |
| default | 18.5→20.2 | 3→4 | 5 | 0/3 |
| scarce_resources | 49.83→51.14 | 2.8→3.6 | 6 | 1/3 |
| abundant_resources | 55.33→57 | 3→6 | 8 | 1/3 |
| resource_chains_basic | 55.83→56 | 4→7 | 8 | 1/3 |
| full_processing | 59→59 | 7→7 | 8 | 1/3 |
| tooled_colony | 56.83→58 | 4.8→6 | 8 | 1/3 |
| high_threat | 54.67→56 | 3→6 | 8 | 1/3 |
| skeleton_crew | 50→52 | 3.8→4 | 4 | 0/3 |
| large_colony | 51.67→52 | 4→5.7 | 8 | 1/3 |
| wildlife_heavy | 10.5→11 | 3→3 | 6 | 0/3 |
| storm_start | 54.67→55.71 | 3→6 | 8 | 1/3 |
| default | 39→39.86 | 3.5→6 | 7 | 1/3 |
| developed_colony | 62.83→63 | 4→7 | 8 | 1/3 |
| default | 83.5→84.8 | 3→6 | 8 | 1/3 |
| default | 39.5→41 | 3.3→5.6 | 7 | 1/3 |
| crisis_compound | 49.83→51 | 3.8→4 | 4 | 1/3 |
| island_isolation | 7→5.86 | 3→3.7 | 3 | 0/3 |
| population_boom | 50→50.71 | 3.8→4 | 5 | 0/3 |
| late_game_siege | 62.83→63 | 4→7 | 8 | 1/3 |
| no_director | 49→48.43 | 4→4 | 5 | 0/3 |

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
| default | 1 | 0.92 | 1 | 0.86 | 0.956 |
| default | 1 | 0.912 | 0.919 | 0.5 | 0.879 |
| default | 0.868 | 0.92 | 1 | 0 | 0.787 |
| scarce_resources | 0.824 | 0.884 | 0.952 | 0.57 | 0.836 |
| abundant_resources | 0.943 | 0.921 | 1 | 0.6 | 0.9 |
| resource_chains_basic | 0.629 | 0.931 | 1 | 0.58 | 0.805 |
| full_processing | 1 | 0.939 | 1 | 0.6 | 0.922 |
| tooled_colony | 1 | 0.925 | 1 | 0.6 | 0.917 |
| high_threat | 0.708 | 0.926 | 1 | 0.61 | 0.831 |
| skeleton_crew | 0.631 | 0.852 | 0.984 | 0.33 | 0.741 |
| large_colony | 0.5 | 0.927 | 1 | 0.58 | 0.765 |
| wildlife_heavy | 1 | 0.865 | 1 | 0 | 0.809 |
| storm_start | 0.898 | 0.923 | 1 | 0.58 | 0.884 |
| default | 1 | 0.906 | 1 | 0.83 | 0.946 |
| developed_colony | 0.999 | 0.925 | 1 | 0.6 | 0.917 |
| default | 0.823 | 0.942 | 1 | 0.75 | 0.892 |
| default | 1 | 0.921 | 1 | 0.6 | 0.917 |
| crisis_compound | 1 | 0.92 | 0.952 | 0.59 | 0.902 |
| island_isolation | 1 | 0.698 | 0.548 | 0 | 0.647 |
| population_boom | 0.842 | 0.922 | 0.968 | 0 | 0.771 |
| late_game_siege | 0.869 | 0.933 | 1 | 0.6 | 0.88 |
| no_director | 0.682 | 0.887 | 1 | 0 | 0.721 |

## 5. Technical (技术性)

| Scenario | Cache Hit | Validity | Goal Stability | AI Rate | Tool Mult | Score |
|---|---|---|---|---|---|---|
| default | 0.475 | 1 | 0.989 | 11.3/min | 1.3 | 0.852 |
| default | 0.435 | 1 | 0.989 | 11.3/min | 1 | 0.713 |
| default | 0.179 | 1 | 0.983 | 11/min | 1 | 0.842 |
| scarce_resources | 0.147 | 1 | 0.983 | 11/min | 1 | 0.836 |
| abundant_resources | 0.126 | 1 | 0.983 | 11/min | 1.15 | 0.732 |
| resource_chains_basic | 0.141 | 1 | 0.983 | 11/min | 1.3 | 0.801 |
| full_processing | 0.119 | 1 | 0.983 | 11/min | 1.45 | 0.865 |
| tooled_colony | 0.12 | 1 | 0.983 | 11/min | 1.45 | 0.865 |
| high_threat | 0.155 | 1 | 0.933 | 11/min | 1.3 | 0.793 |
| skeleton_crew | 0.26 | 1 | 0.933 | 11/min | 1 | 0.845 |
| large_colony | 0.189 | 1 | 0.99 | 11/min | 1 | 0.676 |
| wildlife_heavy | 0.207 | 1 | 0.95 | 11/min | 1 | 0.839 |
| storm_start | 0.094 | 1 | 0.983 | 11/min | 1.15 | 0.727 |
| default | 0.475 | 1 | 0.989 | 11.3/min | 1.45 | 0.919 |
| developed_colony | 0.21 | 1 | 0.983 | 11/min | 1.45 | 0.878 |
| default | 0.224 | 1 | 1 | 11/min | 1.15 | 0.75 |
| default | 0.086 | 1 | 0.983 | 11/min | 1.3 | 0.793 |
| crisis_compound | 0.08 | 1 | 0.9 | 11/min | 1 | 0.803 |
| island_isolation | 0.316 | 1 | 0.933 | 11/min | 1 | 0.855 |
| population_boom | 0.211 | 1 | 0.99 | 11/min | 1 | 0.849 |
| late_game_siege | 0.177 | 1 | 0.933 | 11/min | 1.45 | 0.863 |
| no_director | 0.266 | 1 | 0.983 | 11/min | 1 | 0.858 |

## 6. Reasonableness (合理性)

| Scenario | Diversity | Non-Repetition | Coherence | Productivity | Score |
|---|---|---|---|---|---|
| default | 0.772 | 1 | 1 | 0.891 | 0.899 |
| default | 0.747 | 1 | 1 | 0.902 | 0.895 |
| default | 0.735 | 1 | 1 | 0.882 | 0.885 |
| scarce_resources | 0.703 | 1 | 1 | 0.909 | 0.884 |
| abundant_resources | 0.735 | 0.833 | 1 | 0.898 | 0.856 |
| resource_chains_basic | 0.755 | 0.833 | 1 | 0.896 | 0.862 |
| full_processing | 0.782 | 0.556 | 1 | 0.896 | 0.814 |
| tooled_colony | 0.732 | 0.556 | 1 | 0.902 | 0.801 |
| high_threat | 0.785 | 1 | 1 | 0.896 | 0.904 |
| skeleton_crew | 0.907 | 1 | 0.67 | 0.96 | 0.894 |
| large_colony | 0.715 | 1 | 1 | 0.885 | 0.88 |
| wildlife_heavy | 0.714 | 1 | 1 | 0.89 | 0.881 |
| storm_start | 0.709 | 0.556 | 1 | 0.886 | 0.79 |
| default | 0.76 | 1 | 1 | 0.901 | 0.898 |
| developed_colony | 0.792 | 0.556 | 1 | 0.89 | 0.816 |
| default | 0.792 | 1 | 0.67 | 0.883 | 0.836 |
| default | 0.699 | 1 | 0.67 | 0.899 | 0.813 |
| crisis_compound | 0.88 | 1 | 1 | 0.953 | 0.95 |
| island_isolation | 0.658 | 0.556 | 0.67 | 0.944 | 0.726 |
| population_boom | 0.651 | 1 | 1 | 0.891 | 0.862 |
| late_game_siege | 0.77 | 0.833 | 1 | 0.886 | 0.863 |
| no_director | 0.716 | 0.556 | 1 | 0.912 | 0.8 |

## 7. Efficiency (效率)

| Scenario | Deliveries | Carry/W/Min | Idle% | Proc Util | Depot Dist | Score |
|---|---|---|---|---|---|---|
| default | 35 | 1.49 | 2.7% | 0.565 | 1.8 | 0.894 |
| default | 29 | 1.24 | 2.7% | 0.172 | 4.2 | 0.652 |
| default | 26 | 1.81 | 4.3% | 0 | 3.7 | 0.87 |
| scarce_resources | 20 | 1.38 | 2.9% | 0 | 4.1 | 0.775 |
| abundant_resources | 14 | 0.97 | 2.9% | 0.24 | 2.3 | 0.677 |
| resource_chains_basic | 15 | 1.04 | 2.9% | 0.225 | 3.2 | 0.664 |
| full_processing | 13 | 0.9 | 2.9% | 0.267 | 1.5 | 0.694 |
| tooled_colony | 12 | 0.83 | 2.9% | 0.212 | 2 | 0.647 |
| high_threat | 14 | 0.97 | 2.9% | 0.316 | 2 | 0.72 |
| skeleton_crew | 6 | 1.1 | 2.4% | 0 | 3.4 | 0.734 |
| large_colony | 18 | 0.8 | 3% | 0.091 | 1.9 | 0.584 |
| wildlife_heavy | 18 | 1.28 | 3.2% | 0 | 3.2 | 0.589 |
| storm_start | 9 | 0.62 | 2.9% | 0.093 | 2.5 | 0.548 |
| default | 44 | 1.87 | 2.7% | 0.452 | 2 | 0.923 |
| developed_colony | 15 | 1.04 | 3.1% | 0.489 | 1.4 | 0.827 |
| default | 16 | 1.11 | 4.3% | 0.122 | 3.5 | 0.619 |
| default | 31 | 2.15 | 4.3% | 0.341 | 2.1 | 0.886 |
| crisis_compound | 7 | 1.08 | 2.5% | 0 | 2.1 | 0.765 |
| island_isolation | 2 | 0.24 | 2.7% | 0 | 11.6 | 0.358 |
| population_boom | 25 | 1.11 | 3% | 0 | 4.6 | 0.708 |
| late_game_siege | 14 | 0.97 | 2.9% | 0.489 | 1.5 | 0.815 |
| no_director | 20 | 1.39 | 2.9% | 0 | 3.8 | 0.783 |

## 8. Adaptability (适应性)

| Scenario | Weather Chg | Weather Resp | Dips | Recovery | Deaths | Death Impact | Score |
|---|---|---|---|---|---|---|---|
| default | 4 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 4 | 0.911 | 1 | 0 | 1 | 0.997 | 0.673 |
| default | 2 | 0.985 | 1 | 0 | 1 | 0.954 | 0.686 |
| scarce_resources | 2 | 1 | 2 | 0.885 | 1 | 1 | 0.965 |
| abundant_resources | 2 | 0.99 | 0 | 1 | 1 | 0.918 | 0.981 |
| resource_chains_basic | 2 | 0.908 | 0 | 1 | 1 | 1 | 0.973 |
| full_processing | 2 | 0.948 | 0 | 1 | 1 | 0.996 | 0.984 |
| tooled_colony | 2 | 0.991 | 0 | 1 | 1 | 0.974 | 0.992 |
| high_threat | 2 | 0.9 | 0 | 1 | 1 | 1 | 0.97 |
| skeleton_crew | 2 | 0.889 | 1 | 0.999 | 1 | 1 | 0.967 |
| large_colony | 2 | 0.953 | 0 | 1 | 1 | 0.958 | 0.977 |
| wildlife_heavy | 2 | 0.993 | 1 | 0 | 7 | 0.965 | 0.691 |
| storm_start | 3 | 0.988 | 0 | 1 | 1 | 1 | 0.996 |
| default | 3 | 1 | 0 | 1 | 1 | 1 | 1 |
| developed_colony | 2 | 0.941 | 1 | 0.999 | 1 | 0.948 | 0.972 |
| default | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 2 | 0.995 | 0 | 1 | 1 | 1 | 0.998 |
| crisis_compound | 3 | 0.967 | 2 | 0.885 | 1 | 1 | 0.956 |
| island_isolation | 2 | 0.741 | 2 | 0.5 | 1 | 0.778 | 0.728 |
| population_boom | 2 | 0.797 | 2 | 0.5 | 1 | 1 | 0.789 |
| late_game_siege | 3 | 0.97 | 1 | 0.999 | 1 | 0.937 | 0.978 |
| no_director | 2 | 0.935 | 0 | 1 | 1 | 0.973 | 0.975 |

## 9. Logistics (物流)

| Scenario | Road Coverage | Warehouse Dist | Chain Complete | Res Balance | Score |
|---|---|---|---|---|---|
| default | 0.329 | 0.647 | 0.611 | 0.605 | 0.548 |
| default | 0.355 | 0.571 | 0.667 | 0.481 | 0.519 |
| default | 0.929 | 0.758 | 0 | 0.361 | 0.512 |
| scarce_resources | 0.187 | 0.539 | 0 | 0.303 | 0.257 |
| abundant_resources | 0.342 | 0.509 | 0.722 | 0.432 | 0.501 |
| resource_chains_basic | 0.233 | 0.574 | 0.944 | 0.536 | 0.572 |
| full_processing | 0.367 | 0.43 | 1 | 0.785 | 0.646 |
| tooled_colony | 0.374 | 0.468 | 0.833 | 0.482 | 0.539 |
| high_threat | 0.226 | 0.578 | 0.722 | 0.42 | 0.487 |
| skeleton_crew | 0.171 | 0.447 | 0 | 0.507 | 0.281 |
| large_colony | 0.269 | 0.653 | 0.889 | 0.519 | 0.582 |
| wildlife_heavy | 0.8 | 0.755 | 0 | 0.276 | 0.458 |
| storm_start | 0.226 | 0.651 | 0.667 | 0.413 | 0.489 |
| default | 0.329 | 0.599 | 0.611 | 0.507 | 0.512 |
| developed_colony | 0.449 | 0.448 | 1 | 0.632 | 0.632 |
| default | 0.456 | 0.722 | 0.667 | 0.462 | 0.577 |
| default | 0.315 | 0.698 | 0.583 | 0.4 | 0.499 |
| crisis_compound | 0.184 | 0.439 | 0 | 0.334 | 0.239 |
| island_isolation | 0.556 | 0.483 | 0 | 0.35 | 0.347 |
| population_boom | 0.174 | 0.583 | 0 | 0.466 | 0.306 |
| late_game_siege | 0.449 | 0.47 | 1 | 0.625 | 0.636 |
| no_director | 0.171 | 0.645 | 0 | 0.857 | 0.418 |

---

## Maturity Dimension Breakdowns

### 10. Action Duration Realism (动作时长真实性)
| Scenario | Action CV | Action Ratio | Has Progress | Score |
|---|---|---|---|---|
| default | 1.28 | 0.354 | true | 0.954 |
| default | 2.087 | 0.503 | true | 1 |
| default | 1.264 | 0.465 | true | 1 |
| scarce_resources | 0.899 | 0.196 | true | 0.796 |
| abundant_resources | 0.755 | 0.072 | true | 0.655 |
| resource_chains_basic | 1.022 | 0.101 | true | 0.701 |
| full_processing | 0.855 | 0.021 | true | 0.621 |
| tooled_colony | 0.739 | 0.018 | true | 0.595 |
| high_threat | 0.968 | 0.33 | true | 0.93 |
| skeleton_crew | 0.829 | 0.222 | true | 0.822 |
| large_colony | 0.986 | 0.329 | true | 0.929 |
| wildlife_heavy | 1.404 | 0.489 | true | 1 |
| storm_start | 0.328 | 0.012 | true | 0.435 |
| default | 1.878 | 0.331 | true | 0.931 |
| developed_colony | 0.485 | 0.023 | true | 0.506 |
| default | 0.682 | 0.297 | true | 0.853 |
| default | 1.198 | 0.3 | true | 0.9 |
| crisis_compound | 1.162 | 0.379 | true | 0.979 |
| island_isolation | 0 | 0.008 | true | 0.308 |
| population_boom | 1.052 | 0.159 | true | 0.759 |
| late_game_siege | 1.065 | 0.028 | true | 0.628 |
| no_director | 1.254 | 0.288 | true | 0.888 |

### 12. NPC Needs Depth (NPC需求深度)
| Scenario | Needs | Conflicts | Satisfaction Actions | Has Mood | Score |
|---|---|---|---|---|---|
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| scarce_resources | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| abundant_resources | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| resource_chains_basic | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| full_processing | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| tooled_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| high_threat | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| skeleton_crew | hunger,rest,morale,social | 6 | deliver,harvest,socialize | true | 0.744 |
| large_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| wildlife_heavy | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,process,socialize,haul | true | 0.95 |
| storm_start | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| developed_colony | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,process,socialize,haul | true | 0.95 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process,socialize,haul | true | 0.806 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process,socialize,haul | true | 0.806 |
| crisis_compound | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize | true | 0.825 |
| island_isolation | hunger,rest,morale,social | 6 | deliver,harvest,socialize,haul | true | 0.775 |
| population_boom | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize,haul | true | 0.806 |
| late_game_siege | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| no_director | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize,haul | true | 0.806 |

### 14. Spatial Layout Intelligence (空间布局智能)
| Scenario | Cluster | Zoning | Path Eff | Expansion | Score |
|---|---|---|---|---|---|
| default | 0.184 | 0.525 | 0.546 | 0.815 | 0.517 |
| default | 0.697 | 0.667 | 0.634 | 0.385 | 0.596 |
| default | 0.74 | 0.684 | 0.595 | 0.461 | 0.62 |
| scarce_resources | 0.311 | 0.745 | 0.618 | 0.618 | 0.573 |
| abundant_resources | 0.36 | 0.667 | 0.639 | 0.57 | 0.559 |
| resource_chains_basic | 0.319 | 0.679 | 0.631 | 0.58 | 0.552 |
| full_processing | 0.608 | 0.695 | 0.64 | 0.445 | 0.597 |
| tooled_colony | 0.625 | 0.707 | 0.679 | 0.51 | 0.63 |
| high_threat | 0.36 | 0.679 | 0.581 | 0.557 | 0.544 |
| skeleton_crew | 0.311 | 0.769 | 0.589 | 0.636 | 0.576 |
| large_colony | 0.533 | 0.788 | 0.621 | 0.634 | 0.644 |
| wildlife_heavy | 0.69 | 0.091 | 0.626 | 0.101 | 0.377 |
| storm_start | 0.36 | 0.679 | 0.639 | 0.557 | 0.559 |
| default | 0.184 | 0.525 | 0.565 | 0.815 | 0.522 |
| developed_colony | 0.646 | 0.651 | 0.592 | 0.408 | 0.574 |
| default | 0.485 | 0.765 | 0.64 | 0.419 | 0.577 |
| default | 0 | 0.537 | 0.586 | 0.736 | 0.465 |
| crisis_compound | 0.311 | 0.745 | 0.598 | 0.618 | 0.568 |
| island_isolation | 0.405 | 0 | 0.606 | 0.341 | 0.338 |
| population_boom | 0.307 | 0.769 | 0.568 | 0.603 | 0.562 |
| late_game_siege | 0.646 | 0.651 | 0.588 | 0.408 | 0.573 |
| no_director | 0.524 | 0.854 | 0.513 | 0.634 | 0.631 |

### 18. Traffic Flow Quality (交通流质量)
| Scenario | Congestion | Path Div | Roads | Road Score | Gini | Score |
|---|---|---|---|---|---|---|
| default | 170 | 3 | 30 | 0.421 | 0.383 | 0.677 |
| default | 249 | 3 | 50 | 0.875 | 0.203 | 0.821 |
| default | 113 | 3 | 36 | 0.322 | 0.27 | 0.689 |
| scarce_resources | 115 | 3 | 27 | 0.172 | 0.325 | 0.553 |
| abundant_resources | 101 | 3 | 64 | 0.685 | 0.344 | 0.756 |
| resource_chains_basic | 124 | 3 | 52 | 0.516 | 0.207 | 0.748 |
| full_processing | 72 | 3 | 70 | 0.883 | 0.454 | 0.674 |
| tooled_colony | 89 | 3 | 67 | 0.868 | 0.363 | 0.797 |
| high_threat | 83 | 3 | 49 | 0.469 | 0.343 | 0.701 |
| skeleton_crew | 2 | 3 | 30 | 0.237 | 0 | 0.565 |
| large_colony | 196 | 3 | 44 | 0.792 | 0.247 | 0.793 |
| wildlife_heavy | 104 | 3 | 35 | 0 | 0.059 | 0.673 |
| storm_start | 90 | 3 | 69 | 0.783 | 0.265 | 0.791 |
| default | 208 | 3 | 30 | 0.421 | 0.313 | 0.695 |
| developed_colony | 60 | 3 | 56 | 0.726 | 0.443 | 0.635 |
| default | 136 | 3 | 33 | 0.025 | 0.541 | 0.585 |
| default | 77 | 3 | 65 | 0.785 | 0.235 | 0.687 |
| crisis_compound | 20 | 3 | 27 | 0.172 | 0 | 0.614 |
| island_isolation | 64 | 3 | 31 | 0 | 0.246 | 0.632 |
| population_boom | 141 | 3 | 30 | 0.213 | 0.439 | 0.629 |
| late_game_siege | 83 | 3 | 54 | 0.689 | 0.463 | 0.723 |
| no_director | 89 | 3 | 15 | 0 | 0 | 0.563 |

---

## Improvement Targets

### Maturity Tier — Key Gaps

- **Logistics**: 0.48 (F)
- **Spatial Layout Intelligence (空间布局智能)**: 0.552 (D)
- **Tile State Richness (地块状态丰富度)**: 0.658 (C)
- **System Coupling Density (系统耦合密度)**: 0.673 (C)
- **Traffic Flow Quality (交通流质量)**: 0.682 (C)

### What Would Raise the Score

To meaningfully improve the Maturity tier, the game needs:
- **Multiple NPC needs** (rest, morale, social) with conflicting priorities
- **Tile state richness** (crop growth stages, building degradation, cooldowns)
- **Action duration realism** (work progress bars, variable task times)
- **Day/night cycles** affecting behavior and production
- **Social interactions** between NPCs (relationships, conversations)
- **Diminishing returns** on resource gathering
- **Worker specialization** through experience/skills
