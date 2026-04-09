# Project Utopia — Comprehensive Game Evaluation Report

> Generated: 2026-04-09 21:02:02
> Version: 0.5.4 (Phase 1: Resource Chains + Bridge)
> Scenarios: 22 | Duration: 1410s total sim time
> Scoring: 3-tier weighted (Foundation 20% + Gameplay 30% + Maturity 50%)

## Overall Score

**0.794 (C)**

| Tier | Score | Grade | Weight |
|---|---|---|---|
| **Foundation** (基础运行) | 0.963 | A | 20% |
| **Gameplay** (游戏玩法) | 0.771 | C | 30% |
| **Maturity** (游戏成熟度) | 0.74 | C | 50% |

## Tier 1: Foundation (基础运行)

| Dimension | Score | Grade | Description |
|---|---|---|---|
| Stability | 1 | A | Long-run correctness |
| Technical | 0.819 | B | AI quality, pathfinding |
| Coverage | 1.07 | A | Game element utilization |

## Tier 2: Gameplay (游戏玩法)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Development | 0.822 | B | 20% | Progressive complexity growth |
| Playability | 0.845 | B | 20% | Tension curves, engagement |
| Efficiency | 0.697 | C | 18% | Labor throughput, utilization |
| Logistics | 0.487 | F | 15% | Infrastructure quality |
| Reasonableness | 0.848 | B | 15% | NPC behavior naturalness |
| Adaptability | 0.935 | A | 12% | Crisis recovery |

## Tier 3: Maturity (游戏成熟度)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Action Duration Realism | 0.708 | C | 10% | 动作时长真实性 |
| Tile State Richness | 0.658 | C | 8% | 地块状态丰富度 |
| NPC Needs Depth | 0.86 | B | 10% | NPC需求深度 |
| Economic Feedback Loops | 0.82 | B | 8% | 经济反馈循环 |
| Spatial Layout Intelligence | 0.547 | D | 8% | 空间布局智能 |
| Temporal Realism | 0.724 | C | 7% | 时间真实性 |
| Emergent Narrative | 0.937 | A | 8% | 涌现叙事密度 |
| Decision Consequence | 0.643 | D | 9% | 决策后果深度 |
| Traffic Flow Quality | 0.663 | C | 8% | 交通流质量 |
| Population Dynamics | 0.945 | A | 8% | 人口动态真实性 |
| Environmental Responsiveness | 0.702 | C | 8% | 环境响应性 |
| System Coupling Density | 0.66 | C | 8% | 系统耦合密度 |

---

## 1. Stability (稳定性)

| Scenario | Survived | Time | NaN | Neg | Errors | Entities | Outcome |
|---|---|---|---|---|---|---|---|
| default/temperate_plains | YES | 90/90s | 0 | 0 | 0 | 26 | none |
| default/fortified_basin | YES | 90/90s | 0 | 0 | 0 | 27 | none |
| default/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 23 | none |
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
| default/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 25 | none |
| crisis_compound/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 18 | none |
| island_isolation/archipelago_isles | YES | 60/60s | 0 | 0 | 0 | 17 | none |
| population_boom/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 32 | none |
| late_game_siege/fortified_basin | YES | 60/60s | 0 | 0 | 0 | 28 | none |
| no_director/temperate_plains | YES | 60/60s | 0 | 0 | 0 | 23 | none |

## 2. Development (发展性)

| Scenario | Buildings Early→Late | Resources Early→Late | Peak Roles | Objectives |
|---|---|---|---|---|
| default | 39.17→40 | 3.5→6 | 7 | 1/3 |
| default | 44.67→46 | 3.7→4.7 | 8 | 1/3 |
| default | 18.5→18.8 | 3→3.6 | 5 | 0/3 |
| scarce_resources | 49.83→51.43 | 2.8→3.1 | 6 | 1/3 |
| abundant_resources | 55.33→56 | 3→5 | 7 | 1/3 |
| resource_chains_basic | 55.83→56 | 4→6 | 8 | 1/3 |
| full_processing | 59→59 | 7→7 | 8 | 1/3 |
| tooled_colony | 56.83→58 | 4.8→6 | 8 | 1/3 |
| high_threat | 54.67→56 | 3→6 | 8 | 1/3 |
| skeleton_crew | 50→53 | 3.8→4 | 4 | 0/3 |
| large_colony | 51.67→52 | 4.3→5 | 8 | 1/3 |
| wildlife_heavy | 10.5→9.86 | 3→3.4 | 6 | 0/3 |
| storm_start | 54.67→55.71 | 3→5.6 | 8 | 1/3 |
| default | 39.17→40 | 3.7→5.4 | 7 | 1/3 |
| developed_colony | 62.83→63 | 4→7 | 8 | 1/3 |
| default | 83.5→83.8 | 3→6 | 7 | 1/3 |
| default | 39.75→41 | 3.3→6 | 7 | 1/3 |
| crisis_compound | 49.83→51.57 | 3.8→3.6 | 5 | 1/3 |
| island_isolation | 7→5.86 | 3→3.7 | 3 | 0/3 |
| population_boom | 50→51 | 3.8→4 | 5 | 0/3 |
| late_game_siege | 62.83→63 | 4→7 | 8 | 1/3 |
| no_director | 49→47.86 | 4→4 | 5 | 0/3 |

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
| default | 1 | 0.91 | 1 | 0.72 | 0.931 |
| default | 0.872 | 0.912 | 1 | 0.67 | 0.886 |
| default | 1 | 0.93 | 0.905 | 0 | 0.805 |
| scarce_resources | 0.843 | 0.89 | 0.952 | 0.59 | 0.846 |
| abundant_resources | 0.744 | 0.912 | 1 | 0.67 | 0.847 |
| resource_chains_basic | 0.553 | 0.937 | 1 | 0.66 | 0.795 |
| full_processing | 0.894 | 0.944 | 1 | 0.65 | 0.898 |
| tooled_colony | 1 | 0.909 | 1 | 0.65 | 0.92 |
| high_threat | 0.708 | 0.911 | 1 | 0.63 | 0.83 |
| skeleton_crew | 0.75 | 0.867 | 0.984 | 0.33 | 0.781 |
| large_colony | 0.659 | 0.913 | 1 | 0.6 | 0.811 |
| wildlife_heavy | 0.936 | 0.85 | 0.952 | 0 | 0.774 |
| storm_start | 0.791 | 0.923 | 1 | 0.66 | 0.862 |
| default | 1 | 0.918 | 1 | 0.93 | 0.965 |
| developed_colony | 0.952 | 0.937 | 1 | 0.64 | 0.913 |
| default | 0.882 | 0.948 | 1 | 0.78 | 0.916 |
| default | 1 | 0.943 | 1 | 0.84 | 0.958 |
| crisis_compound | 0.776 | 0.933 | 0.952 | 0.57 | 0.837 |
| island_isolation | 1 | 0.706 | 0.565 | 0 | 0.653 |
| population_boom | 0.48 | 0.904 | 0.984 | 0.33 | 0.711 |
| late_game_siege | 0.974 | 0.94 | 1 | 0.57 | 0.91 |
| no_director | 0.758 | 0.857 | 1 | 0 | 0.734 |

## 5. Technical (技术性)

| Scenario | Cache Hit | Validity | Goal Stability | AI Rate | Tool Mult | Score |
|---|---|---|---|---|---|---|
| default | 0.472 | 1 | 0.989 | 11.3/min | 1.45 | 0.919 |
| default | 0.412 | 1 | 0.989 | 11.3/min | 1 | 0.71 |
| default | 0.167 | 1 | 0.983 | 11/min | 1 | 0.84 |
| scarce_resources | 0.14 | 1 | 0.983 | 11/min | 1 | 0.835 |
| abundant_resources | 0.181 | 1 | 0.983 | 11/min | 1 | 0.674 |
| resource_chains_basic | 0.12 | 1 | 0.983 | 11/min | 1.15 | 0.731 |
| full_processing | 0.14 | 1 | 0.983 | 11/min | 1.45 | 0.868 |
| tooled_colony | 0.18 | 1 | 0.983 | 11/min | 1.45 | 0.874 |
| high_threat | 0.16 | 1 | 0.933 | 11/min | 1.3 | 0.794 |
| skeleton_crew | 0.216 | 1 | 0.933 | 11/min | 1 | 0.836 |
| large_colony | 0.276 | 1 | 0.99 | 11/min | 1 | 0.689 |
| wildlife_heavy | 0.125 | 1 | 0.983 | 11/min | 1 | 0.832 |
| storm_start | 0.108 | 1 | 0.983 | 11/min | 1.15 | 0.729 |
| default | 0.476 | 1 | 0.989 | 11.3/min | 1.45 | 0.919 |
| developed_colony | 0.192 | 1 | 0.983 | 11/min | 1.45 | 0.875 |
| default | 0.272 | 1 | 1 | 11/min | 1.15 | 0.757 |
| default | 0.194 | 1 | 0.983 | 11/min | 1.45 | 0.876 |
| crisis_compound | 0.117 | 1 | 0.85 | 11/min | 1 | 0.797 |
| island_isolation | 0.346 | 1 | 0.933 | 11/min | 1 | 0.861 |
| population_boom | 0.464 | 1 | 0.99 | 11/min | 1 | 0.897 |
| late_game_siege | 0.105 | 1 | 0.95 | 11/min | 1.45 | 0.856 |
| no_director | 0.251 | 1 | 0.983 | 11/min | 1 | 0.855 |

## 6. Reasonableness (合理性)

| Scenario | Diversity | Non-Repetition | Coherence | Productivity | Score |
|---|---|---|---|---|---|
| default | 0.752 | 1 | 1 | 0.903 | 0.897 |
| default | 0.761 | 1 | 1 | 0.9 | 0.898 |
| default | 0.728 | 1 | 1 | 0.898 | 0.888 |
| scarce_resources | 0.724 | 1 | 1 | 0.903 | 0.888 |
| abundant_resources | 0.747 | 0.556 | 1 | 0.894 | 0.803 |
| resource_chains_basic | 0.764 | 0.833 | 1 | 0.898 | 0.865 |
| full_processing | 0.781 | 0.556 | 1 | 0.886 | 0.811 |
| tooled_colony | 0.807 | 0.833 | 1 | 0.894 | 0.877 |
| high_threat | 0.715 | 0.556 | 1 | 0.888 | 0.792 |
| skeleton_crew | 0.886 | 1 | 0.67 | 0.96 | 0.888 |
| large_colony | 0.653 | 1 | 1 | 0.888 | 0.862 |
| wildlife_heavy | 0.636 | 0.833 | 1 | 0.916 | 0.832 |
| storm_start | 0.753 | 0.833 | 1 | 0.894 | 0.861 |
| default | 0.722 | 1 | 1 | 0.899 | 0.886 |
| developed_colony | 0.792 | 0.556 | 1 | 0.896 | 0.818 |
| default | 0.786 | 1 | 0.67 | 0.883 | 0.835 |
| default | 0.76 | 1 | 0.67 | 0.889 | 0.829 |
| crisis_compound | 0.862 | 1 | 1 | 0.957 | 0.946 |
| island_isolation | 0.691 | 0.556 | 0.67 | 0.934 | 0.733 |
| population_boom | 0.624 | 1 | 1 | 0.881 | 0.852 |
| late_game_siege | 0.781 | 0.556 | 1 | 0.898 | 0.815 |
| no_director | 0.666 | 0.556 | 1 | 0.914 | 0.785 |

## 7. Efficiency (效率)

| Scenario | Deliveries | Carry/W/Min | Idle% | Proc Util | Depot Dist | Score |
|---|---|---|---|---|---|---|
| default | 25 | 1.07 | 2.7% | 0.587 | 1.8 | 0.829 |
| default | 35 | 1.49 | 2.7% | 0.226 | 3.3 | 0.732 |
| default | 20 | 1.4 | 4.3% | 0 | 4.7 | 0.761 |
| scarce_resources | 24 | 1.66 | 2.9% | 0 | 3.3 | 0.643 |
| abundant_resources | 14 | 0.97 | 2.9% | 0.1 | 1.8 | 0.615 |
| resource_chains_basic | 13 | 0.9 | 2.9% | 0.27 | 2.5 | 0.678 |
| full_processing | 11 | 0.76 | 2.9% | 0.533 | 1.5 | 0.788 |
| tooled_colony | 1 | 0.07 | 2.9% | 0.34 | 1.6 | 0.603 |
| high_threat | 15 | 1.04 | 2.9% | 0.115 | 2.5 | 0.622 |
| skeleton_crew | 8 | 1.47 | 2.4% | 0 | 3.4 | 0.808 |
| large_colony | 9 | 0.4 | 3.2% | 0.136 | 2.2 | 0.541 |
| wildlife_heavy | 14 | 1 | 3.2% | 0 | 3.2 | 0.545 |
| storm_start | 16 | 1.11 | 2.9% | 0.062 | 2.3 | 0.609 |
| default | 40 | 1.7 | 2.7% | 0.542 | 1.8 | 0.926 |
| developed_colony | 11 | 0.76 | 2.9% | 0.578 | 1.5 | 0.789 |
| default | 19 | 1.32 | 4.3% | 0.2 | 3.1 | 0.695 |
| default | 35 | 2.43 | 4.3% | 0.649 | 1.5 | 0.974 |
| crisis_compound | 10 | 1.55 | 2.5% | 0 | 2 | 0.649 |
| island_isolation | 2 | 0.24 | 2.7% | 0 | 12 | 0.348 |
| population_boom | 17 | 0.76 | 3% | 0 | 4.4 | 0.642 |
| late_game_siege | 14 | 0.97 | 2.9% | 0.622 | 1.3 | 0.823 |
| no_director | 16 | 1.11 | 2.9% | 0 | 4.1 | 0.72 |

## 8. Adaptability (适应性)

| Scenario | Weather Chg | Weather Resp | Dips | Recovery | Deaths | Death Impact | Score |
|---|---|---|---|---|---|---|---|
| default | 3 | 0.997 | 0 | 1 | 1 | 1 | 0.999 |
| default | 4 | 0.954 | 0 | 1 | 2 | 0.893 | 0.965 |
| default | 2 | 0.966 | 1 | 0 | 1 | 0.94 | 0.678 |
| scarce_resources | 2 | 0.969 | 2 | 0.885 | 1 | 1 | 0.956 |
| abundant_resources | 2 | 0.999 | 0 | 1 | 1 | 0.938 | 0.987 |
| resource_chains_basic | 2 | 0.883 | 0 | 1 | 1 | 0.817 | 0.928 |
| full_processing | 2 | 0.962 | 0 | 1 | 1 | 0.941 | 0.977 |
| tooled_colony | 2 | 0.966 | 0 | 1 | 1 | 0.995 | 0.989 |
| high_threat | 2 | 0.95 | 0 | 1 | 1 | 1 | 0.985 |
| skeleton_crew | 2 | 0.866 | 1 | 0.999 | 1 | 1 | 0.96 |
| large_colony | 2 | 0.837 | 1 | 0.999 | 1 | 0.911 | 0.933 |
| wildlife_heavy | 2 | 0.985 | 1 | 0 | 7 | 0.952 | 0.686 |
| storm_start | 3 | 0.992 | 0 | 1 | 1 | 1 | 0.998 |
| default | 4 | 1 | 0 | 1 | 1 | 1 | 1 |
| developed_colony | 2 | 0.953 | 0 | 1 | 1 | 0.947 | 0.975 |
| default | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| crisis_compound | 3 | 0.956 | 2 | 0.885 | 1 | 1 | 0.952 |
| island_isolation | 2 | 0.573 | 2 | 0.5 | 1 | 0.778 | 0.677 |
| population_boom | 2 | 0.943 | 1 | 0.999 | 1 | 1 | 0.983 |
| late_game_siege | 3 | 0.938 | 0 | 1 | 1 | 0.99 | 0.98 |
| no_director | 2 | 0.93 | 0 | 1 | 1 | 0.901 | 0.959 |

## 9. Logistics (物流)

| Scenario | Road Coverage | Warehouse Dist | Chain Complete | Res Balance | Score |
|---|---|---|---|---|---|
| default | 0.329 | 0.617 | 0.611 | 0.59 | 0.537 |
| default | 0.35 | 0.665 | 0.611 | 0.528 | 0.539 |
| default | 0.929 | 0.723 | 0 | 0.361 | 0.503 |
| scarce_resources | 0.184 | 0.527 | 0 | 0.33 | 0.26 |
| abundant_resources | 0.342 | 0.614 | 0.667 | 0.322 | 0.486 |
| resource_chains_basic | 0.233 | 0.579 | 0.944 | 0.661 | 0.604 |
| full_processing | 0.367 | 0.486 | 1 | 0.845 | 0.674 |
| tooled_colony | 0.374 | 0.46 | 0.833 | 0.56 | 0.557 |
| high_threat | 0.226 | 0.652 | 0.722 | 0.417 | 0.504 |
| skeleton_crew | 0.171 | 0.411 | 0 | 0.508 | 0.272 |
| large_colony | 0.269 | 0.649 | 0.889 | 0.574 | 0.595 |
| wildlife_heavy | 0.8 | 0.76 | 0 | 0.278 | 0.459 |
| storm_start | 0.226 | 0.61 | 0.667 | 0.393 | 0.474 |
| default | 0.329 | 0.642 | 0.611 | 0.606 | 0.547 |
| developed_colony | 0.449 | 0.464 | 1 | 0.751 | 0.666 |
| default | 0.456 | 0.792 | 0.667 | 0.463 | 0.594 |
| default | 0.315 | 0.708 | 0.583 | 0.474 | 0.52 |
| crisis_compound | 0.187 | 0.391 | 0 | 0.326 | 0.226 |
| island_isolation | 0.556 | 0.472 | 0 | 0.35 | 0.344 |
| population_boom | 0.171 | 0.543 | 0 | 0.488 | 0.3 |
| late_game_siege | 0.449 | 0.471 | 1 | 0.685 | 0.651 |
| no_director | 0.171 | 0.627 | 0 | 0.855 | 0.413 |

---

## Maturity Dimension Breakdowns

### 10. Action Duration Realism (动作时长真实性)
| Scenario | Action CV | Action Ratio | Has Progress | Score |
|---|---|---|---|---|
| default | 0.948 | 0.24 | true | 0.84 |
| default | 1.233 | 0.287 | true | 0.887 |
| default | 1.428 | 0.488 | true | 1 |
| scarce_resources | 0.933 | 0.162 | true | 0.762 |
| abundant_resources | 0.3 | 0.022 | true | 0.435 |
| resource_chains_basic | 0.827 | 0.048 | true | 0.648 |
| full_processing | 0.362 | 0.01 | true | 0.446 |
| tooled_colony | 0.622 | 0.093 | true | 0.626 |
| high_threat | 1.118 | 0.103 | true | 0.703 |
| skeleton_crew | 0.511 | 0.074 | true | 0.566 |
| large_colony | 0.957 | 0.031 | true | 0.631 |
| wildlife_heavy | 1.481 | 0.156 | true | 0.756 |
| storm_start | 1.108 | 0.338 | true | 0.938 |
| default | 1.184 | 0.316 | true | 0.916 |
| developed_colony | 0.519 | 0.015 | true | 0.509 |
| default | 0.843 | 0.247 | true | 0.847 |
| default | 1.114 | 0.315 | true | 0.915 |
| crisis_compound | 0.645 | 0.141 | true | 0.683 |
| island_isolation | 0 | 0.007 | true | 0.307 |
| population_boom | 1.213 | 0.107 | true | 0.707 |
| late_game_siege | 0.597 | 0.018 | true | 0.541 |
| no_director | 1.271 | 0.318 | true | 0.918 |

### 12. NPC Needs Depth (NPC需求深度)
| Scenario | Needs | Conflicts | Satisfaction Actions | Has Mood | Score |
|---|---|---|---|---|---|
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| scarce_resources | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize,haul | true | 0.856 |
| abundant_resources | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| resource_chains_basic | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| full_processing | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| tooled_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| high_threat | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| skeleton_crew | hunger,rest,morale,social | 6 | deliver,harvest,socialize | true | 0.744 |
| large_colony | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,process,socialize,haul | true | 0.95 |
| wildlife_heavy | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,process,socialize,haul | true | 0.95 |
| storm_start | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| default | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| developed_colony | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.887 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process,socialize,haul | true | 0.806 |
| default | hunger,rest,morale,social | 6 | deliver,harvest,process,socialize,haul | true | 0.806 |
| crisis_compound | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize | true | 0.856 |
| island_isolation | hunger,rest,morale,social | 6 | deliver,harvest,socialize,haul | true | 0.775 |
| population_boom | hunger,rest,morale,social | 6 | eat,deliver,harvest,socialize,haul | true | 0.856 |
| late_game_siege | hunger,rest,morale,social | 6 | eat,deliver,harvest,process,socialize,haul | true | 0.837 |
| no_director | hunger,rest,morale,social | 6 | eat,rest,wander,deliver,harvest,socialize,haul | true | 0.919 |

### 14. Spatial Layout Intelligence (空间布局智能)
| Scenario | Cluster | Zoning | Path Eff | Expansion | Score |
|---|---|---|---|---|---|
| default | 0.148 | 0.525 | 0.537 | 0.827 | 0.509 |
| default | 0.697 | 0.717 | 0.625 | 0.415 | 0.614 |
| default | 0.74 | 0.667 | 0.634 | 0.28 | 0.58 |
| scarce_resources | 0.311 | 0.745 | 0.581 | 0.618 | 0.564 |
| abundant_resources | 0.36 | 0.679 | 0.638 | 0.571 | 0.562 |
| resource_chains_basic | 0.319 | 0.679 | 0.602 | 0.58 | 0.545 |
| full_processing | 0.608 | 0.695 | 0.611 | 0.445 | 0.59 |
| tooled_colony | 0.625 | 0.707 | 0.633 | 0.51 | 0.619 |
| high_threat | 0.36 | 0.679 | 0.596 | 0.557 | 0.548 |
| skeleton_crew | 0.311 | 0.774 | 0.583 | 0.64 | 0.577 |
| large_colony | 0.533 | 0.788 | 0.631 | 0.634 | 0.646 |
| wildlife_heavy | 0.524 | 0.111 | 0.634 | 0.017 | 0.322 |
| storm_start | 0.36 | 0.679 | 0.601 | 0.557 | 0.549 |
| default | 0.148 | 0.525 | 0.555 | 0.827 | 0.514 |
| developed_colony | 0.646 | 0.651 | 0.611 | 0.408 | 0.579 |
| default | 0.485 | 0.774 | 0.591 | 0.424 | 0.569 |
| default | 0 | 0.537 | 0.563 | 0.739 | 0.46 |
| crisis_compound | 0.311 | 0.731 | 0.6 | 0.61 | 0.563 |
| island_isolation | 0.405 | 0 | 0.629 | 0.341 | 0.344 |
| population_boom | 0.311 | 0.745 | 0.589 | 0.632 | 0.569 |
| late_game_siege | 0.646 | 0.651 | 0.571 | 0.408 | 0.569 |
| no_director | 0.524 | 0.851 | 0.566 | 0.637 | 0.644 |

### 18. Traffic Flow Quality (交通流质量)
| Scenario | Congestion | Path Div | Roads | Road Score | Gini | Score |
|---|---|---|---|---|---|---|
| default | 153 | 3 | 28 | 0.353 | 0.457 | 0.647 |
| default | 187 | 3 | 51 | 0.731 | 0.055 | 0.82 |
| default | 106 | 3 | 38 | 0.212 | 0.097 | 0.71 |
| scarce_resources | 67 | 3 | 27 | 0.172 | 0.349 | 0.641 |
| abundant_resources | 105 | 3 | 63 | 0.689 | 0.367 | 0.752 |
| resource_chains_basic | 92 | 3 | 48 | 0.454 | 0.488 | 0.673 |
| full_processing | 107 | 3 | 56 | 0.834 | 0.519 | 0.745 |
| tooled_colony | 89 | 3 | 53 | 0.832 | 0.438 | 0.766 |
| high_threat | 97 | 3 | 43 | 0.375 | 0.43 | 0.568 |
| skeleton_crew | 2 | 3 | 29 | 0.219 | 0 | 0.56 |
| large_colony | 219 | 3 | 26 | 0.345 | 0.245 | 0.706 |
| wildlife_heavy | 83 | 3 | 38 | 0 | 0.01 | 0.585 |
| storm_start | 89 | 3 | 59 | 0.626 | 0.266 | 0.752 |
| default | 160 | 3 | 28 | 0.353 | 0.402 | 0.661 |
| developed_colony | 83 | 3 | 48 | 0.579 | 0.4 | 0.718 |
| default | 121 | 3 | 33 | 0.03 | 0.598 | 0.565 |
| default | 113 | 3 | 31 | 0.401 | 0.493 | 0.654 |
| crisis_compound | 14 | 3 | 26 | 0.144 | 0 | 0.609 |
| island_isolation | 50 | 3 | 31 | 0 | 0.344 | 0.617 |
| population_boom | 153 | 3 | 32 | 0.272 | 0.195 | 0.693 |
| late_game_siege | 68 | 3 | 40 | 0.433 | 0.4 | 0.581 |
| no_director | 84 | 3 | 15 | 0 | 0 | 0.573 |

---

## Improvement Targets

### Maturity Tier — Key Gaps

- **Logistics**: 0.487 (F)
- **Spatial Layout Intelligence (空间布局智能)**: 0.547 (D)
- **Decision Consequence (决策后果深度)**: 0.643 (D)
- **Tile State Richness (地块状态丰富度)**: 0.658 (C)
- **System Coupling Density (系统耦合密度)**: 0.66 (C)

### What Would Raise the Score

To meaningfully improve the Maturity tier, the game needs:
- **Multiple NPC needs** (rest, morale, social) with conflicting priorities
- **Tile state richness** (crop growth stages, building degradation, cooldowns)
- **Action duration realism** (work progress bars, variable task times)
- **Day/night cycles** affecting behavior and production
- **Social interactions** between NPCs (relationships, conversations)
- **Diminishing returns** on resource gathering
- **Worker specialization** through experience/skills
