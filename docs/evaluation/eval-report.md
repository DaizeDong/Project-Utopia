# Project Utopia — Comprehensive Game Evaluation Report

> Generated: 2026-04-09 06:37:23
> Version: 0.5.4 (Phase 1: Resource Chains + Bridge)
> Scenarios: 22 | Duration: 1410s total sim time
> Scoring: 3-tier weighted (Foundation 20% + Gameplay 30% + Maturity 50%)

## Overall Score

**0.719 (C)**

| Tier | Score | Grade | Weight |
|---|---|---|---|
| **Foundation** (基础运行) | 0.961 | A | 20% |
| **Gameplay** (游戏玩法) | 0.752 | C | 30% |
| **Maturity** (游戏成熟度) | 0.602 | D | 50% |

## Tier 1: Foundation (基础运行)

| Dimension | Score | Grade | Description |
|---|---|---|---|
| Stability | 1 | A | Long-run correctness |
| Technical | 0.854 | B | AI quality, pathfinding |
| Coverage | 1.03 | A | Game element utilization |

## Tier 2: Gameplay (游戏玩法)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Development | 0.836 | B | 20% | Progressive complexity growth |
| Playability | 0.859 | B | 20% | Tension curves, engagement |
| Efficiency | 0.65 | C | 18% | Labor throughput, utilization |
| Logistics | 0.389 | F | 15% | Infrastructure quality |
| Reasonableness | 0.882 | B | 15% | NPC behavior naturalness |
| Adaptability | 0.875 | B | 12% | Crisis recovery |

## Tier 3: Maturity (游戏成熟度)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Action Duration Realism | 0.66 | C | 10% | 动作时长真实性 |
| Tile State Richness | 0.656 | C | 8% | 地块状态丰富度 |
| NPC Needs Depth | 0.521 | D | 10% | NPC需求深度 |
| Economic Feedback Loops | 0.767 | C | 8% | 经济反馈循环 |
| Spatial Layout Intelligence | 0.547 | D | 8% | 空间布局智能 |
| Temporal Realism | 0.712 | C | 7% | 时间真实性 |
| Emergent Narrative | 0.51 | D | 8% | 涌现叙事密度 |
| Decision Consequence | 0.471 | F | 9% | 决策后果深度 |
| Traffic Flow Quality | 0.564 | D | 8% | 交通流质量 |
| Population Dynamics | 0.686 | C | 8% | 人口动态真实性 |
| Environmental Responsiveness | 0.661 | C | 8% | 环境响应性 |
| System Coupling Density | 0.51 | D | 8% | 系统耦合密度 |

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
| default | 43.83→44 | 3→4.4 | 6 | 1/3 |
| default | 20.25→21.2 | 3→5 | 6 | 0/3 |
| scarce_resources | 49→53 | 2.8→4 | 6 | 1/3 |
| abundant_resources | 53.83→54.43 | 3→5 | 6 | 2/3 |
| resource_chains_basic | 55→54.86 | 4.5→6 | 7 | 1/3 |
| full_processing | 59→59 | 7→7 | 8 | 1/3 |
| tooled_colony | 54→54 | 4.2→5 | 6 | 1/3 |
| high_threat | 53.83→54 | 3→5 | 6 | 1/3 |
| skeleton_crew | 51.5→51.43 | 2.8→3 | 2 | 1/3 |
| large_colony | 50→50 | 3→3.7 | 6 | 1/3 |
| wildlife_heavy | 12.17→13.57 | 3→3.6 | 5 | 0/3 |
| storm_start | 53.83→54 | 3→5 | 6 | 1/3 |
| default | 37.17→40 | 3→4.3 | 6 | 1/3 |
| developed_colony | 62→62 | 4→7 | 8 | 1/3 |
| default | 82.75→83 | 3→5 | 6 | 1/3 |
| default | 38.25→41 | 3→5 | 6 | 1/3 |
| crisis_compound | 49→53 | 2.8→4 | 3 | 1/3 |
| island_isolation | 7→7 | 2→2.1 | 2 | 0/3 |
| population_boom | 51.5→54.43 | 2.8→3.6 | 6 | 1/3 |
| late_game_siege | 62→62 | 4→7 | 8 | 1/3 |
| no_director | 49→47.43 | 3→4 | 5 | 0/3 |

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
| default | 1 | 0.918 | 1 | 0.83 | 0.95 |
| default | 1 | 0.928 | 1 | 0.65 | 0.925 |
| default | 1 | 0.939 | 0.905 | 0 | 0.808 |
| scarce_resources | 1 | 0.905 | 0.968 | 0.58 | 0.901 |
| abundant_resources | 0.771 | 0.917 | 1 | 1 | 0.906 |
| resource_chains_basic | 0.622 | 0.948 | 1 | 0.6 | 0.811 |
| full_processing | 1 | 0.952 | 1 | 0.7 | 0.94 |
| tooled_colony | 1 | 0.919 | 1 | 0.86 | 0.954 |
| high_threat | 0.43 | 0.907 | 1 | 0.8 | 0.771 |
| skeleton_crew | 1 | 0.685 | 0.903 | 0.5 | 0.806 |
| large_colony | 0.271 | 0.793 | 1 | 0.69 | 0.672 |
| wildlife_heavy | 1 | 0.92 | 0.823 | 0 | 0.782 |
| storm_start | 0.824 | 0.905 | 1 | 0.91 | 0.906 |
| default | 1 | 0.91 | 1 | 0.57 | 0.909 |
| developed_colony | 1 | 0.941 | 1 | 0.85 | 0.96 |
| default | 0.951 | 0.939 | 1 | 0.73 | 0.926 |
| default | 1 | 0.886 | 1 | 0.5 | 0.891 |
| crisis_compound | 1 | 0.916 | 0.968 | 0.58 | 0.904 |
| island_isolation | 1 | 0.695 | 0.5 | 0.17 | 0.658 |
| population_boom | 1 | 0.821 | 0.984 | 0.5 | 0.867 |
| late_game_siege | 0.89 | 0.953 | 1 | 0.84 | 0.93 |
| no_director | 0.687 | 0.906 | 1 | 0 | 0.728 |

## 5. Technical (技术性)

| Scenario | Cache Hit | Validity | Goal Stability | AI Rate | Tool Mult | Score |
|---|---|---|---|---|---|---|
| default | 0.3 | 1 | 1 | 11.3/min | 1.45 | 0.895 |
| default | 0.561 | 1 | 1 | 11.3/min | 1.45 | 0.934 |
| default | 0.191 | 1 | 1 | 11/min | 1.15 | 0.745 |
| scarce_resources | 0.138 | 1 | 0.983 | 11/min | 1 | 0.667 |
| abundant_resources | 0.153 | 1 | 0.983 | 11/min | 1.45 | 0.87 |
| resource_chains_basic | 0.301 | 1 | 0.983 | 11/min | 1.45 | 0.892 |
| full_processing | 0.476 | 1 | 0.983 | 11/min | 1.45 | 0.918 |
| tooled_colony | 0.466 | 1 | 0.983 | 11/min | 1.45 | 0.917 |
| high_threat | 0.228 | 1 | 0.933 | 11/min | 1.45 | 0.871 |
| skeleton_crew | 0.304 | 1 | 0.933 | 11/min | 1 | 0.853 |
| large_colony | 0.412 | 1 | 0.99 | 11/min | 1.45 | 0.91 |
| wildlife_heavy | 0.139 | 1 | 0.967 | 11/min | 1 | 0.83 |
| storm_start | 0.23 | 1 | 0.983 | 11/min | 1.45 | 0.881 |
| default | 0.206 | 1 | 1 | 11.3/min | 1.3 | 0.814 |
| developed_colony | 0.475 | 1 | 0.983 | 11/min | 1.45 | 0.918 |
| default | 0.313 | 1 | 1 | 11/min | 1.45 | 0.897 |
| default | 0.079 | 1 | 0.983 | 11/min | 1.3 | 0.792 |
| crisis_compound | 0.139 | 1 | 0.9 | 11/min | 1.3 | 0.814 |
| island_isolation | 0.342 | 1 | 0.967 | 11/min | 1 | 0.868 |
| population_boom | 0.197 | 1 | 0.99 | 11/min | 1.15 | 0.744 |
| late_game_siege | 0.378 | 1 | 0.933 | 11/min | 1.45 | 0.893 |
| no_director | 0.303 | 1 | 0.983 | 11/min | 1 | 0.865 |

## 6. Reasonableness (合理性)

| Scenario | Diversity | Non-Repetition | Coherence | Productivity | Score |
|---|---|---|---|---|---|
| default | 0.793 | 1 | 1 | 0.901 | 0.908 |
| default | 0.772 | 1 | 1 | 0.866 | 0.891 |
| default | 0.723 | 1 | 0.67 | 0.897 | 0.82 |
| scarce_resources | 0.728 | 1 | 1 | 0.909 | 0.891 |
| abundant_resources | 0.767 | 1 | 1 | 0.903 | 0.901 |
| resource_chains_basic | 0.812 | 0.833 | 1 | 0.901 | 0.88 |
| full_processing | 0.883 | 1 | 1 | 0.892 | 0.933 |
| tooled_colony | 0.803 | 1 | 1 | 0.892 | 0.909 |
| high_threat | 0.703 | 1 | 1 | 0.914 | 0.885 |
| skeleton_crew | 0.8 | 1 | 0.67 | 0.957 | 0.861 |
| large_colony | 0.846 | 0.833 | 1 | 0.529 | 0.779 |
| wildlife_heavy | 0.756 | 1 | 1 | 0.89 | 0.894 |
| storm_start | 0.736 | 1 | 1 | 0.909 | 0.893 |
| default | 0.777 | 1 | 1 | 0.887 | 0.899 |
| developed_colony | 0.888 | 0.833 | 1 | 0.887 | 0.899 |
| default | 0.737 | 1 | 0.67 | 0.897 | 0.824 |
| default | 0.718 | 1 | 1 | 0.921 | 0.892 |
| crisis_compound | 0.915 | 1 | 1 | 0.952 | 0.96 |
| island_isolation | 0.787 | 0.833 | 1 | 0.962 | 0.892 |
| population_boom | 0.826 | 1 | 1 | 0.645 | 0.841 |
| late_game_siege | 0.883 | 1 | 1 | 0.89 | 0.932 |
| no_director | 0.719 | 1 | 0.67 | 0.933 | 0.83 |

## 7. Efficiency (效率)

| Scenario | Deliveries | Carry/W/Min | Idle% | Proc Util | Depot Dist | Score |
|---|---|---|---|---|---|---|
| default | 24 | 1.33 | 3.2% | 0.178 | 3.4 | 0.682 |
| default | 25 | 1.39 | 3.2% | 0.138 | 5.8 | 0.631 |
| default | 9 | 0.75 | 4.8% | 0.07 | 10.7 | 0.419 |
| scarce_resources | 22 | 1.83 | 3.2% | 0 | 3.6 | 0.665 |
| abundant_resources | 20 | 1.55 | 4% | 0.2 | 3 | 0.732 |
| resource_chains_basic | 17 | 1.42 | 3.2% | 0.733 | 3 | 0.863 |
| full_processing | 10 | 0.83 | 3.2% | 0.756 | 1.6 | 0.799 |
| tooled_colony | 19 | 1.58 | 3.2% | 0 | 2.4 | 0.648 |
| high_threat | 14 | 1.17 | 3.2% | 0.2 | 3.6 | 0.665 |
| skeleton_crew | 0 | 0 | 3.2% | 0 | 3.1 | 0.398 |
| large_colony | 2 | 0.1 | 3.2% | 0.333 | 7.4 | 0.508 |
| wildlife_heavy | 9 | 0.75 | 3.2% | 0 | 11 | 0.475 |
| storm_start | 14 | 1.17 | 3.2% | 0.2 | 2.9 | 0.677 |
| default | 27 | 1.5 | 3.2% | 0.089 | 3.2 | 0.667 |
| developed_colony | 4 | 0.33 | 3.2% | 0.711 | 1.6 | 0.724 |
| default | 25 | 2.08 | 4.8% | 0.267 | 3.3 | 0.829 |
| default | 21 | 1.75 | 4.8% | 0.133 | 3.4 | 0.723 |
| crisis_compound | 5 | 1.25 | 3.2% | 0.218 | 3 | 0.696 |
| island_isolation | 3 | 0.5 | 3.2% | 0 | 9 | 0.474 |
| population_boom | 14 | 0.7 | 3.2% | 0.122 | 5 | 0.532 |
| late_game_siege | 10 | 0.83 | 3.2% | 0.733 | 1.6 | 0.798 |
| no_director | 11 | 0.92 | 3.2% | 0 | 3.3 | 0.7 |

## 8. Adaptability (适应性)

| Scenario | Weather Chg | Weather Resp | Dips | Recovery | Deaths | Death Impact | Score |
|---|---|---|---|---|---|---|---|
| default | 4 | 1 | 1 | 0.519 | 1 | 1 | 0.856 |
| default | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 2 | 0.942 | 1 | 0 | 1 | 0.946 | 0.672 |
| scarce_resources | 2 | 1 | 2 | 0.258 | 1 | 1 | 0.778 |
| abundant_resources | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| resource_chains_basic | 2 | 0.963 | 1 | 0.999 | 1 | 0.932 | 0.975 |
| full_processing | 2 | 1 | 0 | 1 | 1 | 0.995 | 0.999 |
| tooled_colony | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| high_threat | 2 | 0.998 | 0 | 1 | 1 | 1 | 1 |
| skeleton_crew | 2 | 0.837 | 1 | 0 | 1 | 0.775 | 0.606 |
| large_colony | 2 | 0.988 | 0 | 1 | 1 | 0.991 | 0.995 |
| wildlife_heavy | 2 | 0.988 | 1 | 0 | 4 | 0.987 | 0.694 |
| storm_start | 3 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 4 | 0.997 | 2 | 0.259 | 1 | 1 | 0.777 |
| developed_colony | 2 | 1 | 0 | 1 | 1 | 0.996 | 0.999 |
| default | 2 | 0.986 | 0 | 1 | 1 | 1 | 0.996 |
| default | 2 | 1 | 2 | 0.226 | 1 | 1 | 0.768 |
| crisis_compound | 3 | 1 | 2 | 0.254 | 1 | 1 | 0.776 |
| island_isolation | 2 | 0.995 | 1 | 0 | 1 | 1 | 0.699 |
| population_boom | 2 | 0.942 | 1 | 0 | 1 | 1 | 0.682 |
| late_game_siege | 3 | 1 | 0 | 1 | 1 | 1 | 1 |
| no_director | 2 | 0.94 | 0 | 1 | 1 | 1 | 0.982 |

## 9. Logistics (物流)

| Scenario | Road Coverage | Warehouse Dist | Chain Complete | Res Balance | Score |
|---|---|---|---|---|---|
| default | 0.289 | 0.627 | 0.333 | 0.274 | 0.381 |
| default | 0.25 | 0.534 | 0.278 | 0.418 | 0.37 |
| default | 0.723 | 0.586 | 0.25 | 0.128 | 0.422 |
| scarce_resources | 0.181 | 0.581 | 0.167 | 0.183 | 0.278 |
| abundant_resources | 0.201 | 0.585 | 0.333 | 0.522 | 0.41 |
| resource_chains_basic | 0.233 | 0.594 | 0.667 | 0.457 | 0.487 |
| full_processing | 0.387 | 0.294 | 1 | 0.493 | 0.544 |
| tooled_colony | 0.345 | 0.343 | 0.333 | 0.584 | 0.401 |
| high_threat | 0.201 | 0.67 | 0.333 | 0.426 | 0.408 |
| skeleton_crew | 0.183 | 0.875 | 0.111 | 0.182 | 0.338 |
| large_colony | 0.231 | 0.453 | 0.333 | 0.425 | 0.361 |
| wildlife_heavy | 0.511 | 0.526 | 0 | 0.104 | 0.285 |
| storm_start | 0.201 | 0.648 | 0.333 | 0.442 | 0.406 |
| default | 0.237 | 0.68 | 0.333 | 0.149 | 0.35 |
| developed_colony | 0.441 | 0.264 | 1 | 0.596 | 0.575 |
| default | 0.368 | 0.592 | 0.333 | 0.402 | 0.424 |
| default | 0.237 | 0.661 | 0.333 | 0.17 | 0.35 |
| crisis_compound | 0.181 | 0.374 | 0.167 | 0.185 | 0.227 |
| island_isolation | 0.667 | 0.456 | 0 | 0.004 | 0.282 |
| population_boom | 0.187 | 0.642 | 0.167 | 0.163 | 0.29 |
| late_game_siege | 0.441 | 0.272 | 1 | 0.594 | 0.577 |
| no_director | 0.171 | 0.582 | 0 | 0.785 | 0.385 |

---

## Maturity Dimension Breakdowns

### 10. Action Duration Realism (动作时长真实性)
| Scenario | Action CV | Action Ratio | Has Progress | Score |
|---|---|---|---|---|
| default | 0 | 0.492 | true | 0.7 |
| default | 0 | 0.507 | true | 0.7 |
| default | 0 | 0.211 | true | 0.511 |
| scarce_resources | 0 | 0.425 | true | 0.7 |
| abundant_resources | 0 | 0.395 | true | 0.695 |
| resource_chains_basic | 0 | 0.472 | true | 0.7 |
| full_processing | 0 | 0.411 | true | 0.7 |
| tooled_colony | 0 | 0.457 | true | 0.7 |
| high_threat | 0 | 0.308 | true | 0.608 |
| skeleton_crew | 0 | 0.214 | true | 0.514 |
| large_colony | 0 | 0.322 | true | 0.622 |
| wildlife_heavy | 0 | 0.411 | true | 0.7 |
| storm_start | 0 | 0.357 | true | 0.657 |
| default | 0 | 0.468 | true | 0.7 |
| developed_colony | 0 | 0.286 | true | 0.586 |
| default | 0 | 0.443 | true | 0.7 |
| default | 0 | 0.419 | true | 0.7 |
| crisis_compound | 0 | 0.435 | true | 0.7 |
| island_isolation | 0 | 0.222 | true | 0.522 |
| population_boom | 0 | 0.451 | true | 0.7 |
| late_game_siege | 0 | 0.44 | true | 0.7 |
| no_director | 0 | 0.395 | true | 0.695 |

### 12. NPC Needs Depth (NPC需求深度)
| Scenario | Needs | Conflicts | Satisfaction Actions | Has Mood | Score |
|---|---|---|---|---|---|
| default | hunger,rest,morale | 3 | eat | true | 0.556 |
| default | hunger,rest,morale | 3 | eat | true | 0.556 |
| default | hunger,rest,morale | 3 | none | true | 0.475 |
| scarce_resources | hunger,rest,morale | 3 | eat | true | 0.506 |
| abundant_resources | hunger,rest,morale | 3 | eat | true | 0.506 |
| resource_chains_basic | hunger,rest,morale | 3 | eat | true | 0.556 |
| full_processing | hunger,rest,morale | 3 | eat | true | 0.506 |
| tooled_colony | hunger,rest,morale | 3 | eat | true | 0.506 |
| high_threat | hunger,rest,morale | 3 | eat | true | 0.556 |
| skeleton_crew | hunger,rest,morale | 3 | none | true | 0.475 |
| large_colony | hunger,rest,morale | 3 | eat | true | 0.506 |
| wildlife_heavy | hunger,rest,morale | 3 | eat | true | 0.506 |
| storm_start | hunger,rest,morale | 3 | eat | true | 0.556 |
| default | hunger,rest,morale | 3 | eat | true | 0.556 |
| developed_colony | hunger,rest,morale | 3 | eat | true | 0.556 |
| default | hunger,rest,morale | 3 | none | true | 0.475 |
| default | hunger,rest,morale | 3 | eat | true | 0.556 |
| crisis_compound | hunger,rest,morale | 3 | eat | true | 0.506 |
| island_isolation | hunger,rest,morale | 3 | eat | true | 0.556 |
| population_boom | hunger,rest,morale | 3 | eat | true | 0.506 |
| late_game_siege | hunger,rest,morale | 3 | eat | true | 0.506 |
| no_director | hunger,rest,morale | 3 | none | true | 0.475 |

### 14. Spatial Layout Intelligence (空间布局智能)
| Scenario | Cluster | Zoning | Path Eff | Expansion | Score |
|---|---|---|---|---|---|
| default | 0.107 | 0.564 | 0.605 | 0.814 | 0.523 |
| default | 0.303 | 0.795 | 0.626 | 0.433 | 0.539 |
| default | 0.731 | 0.591 | 0.682 | 0.504 | 0.627 |
| scarce_resources | 0.286 | 0.717 | 0.625 | 0.605 | 0.558 |
| abundant_resources | 0.303 | 0.709 | 0.539 | 0.606 | 0.539 |
| resource_chains_basic | 0.346 | 0.691 | 0.54 | 0.586 | 0.541 |
| full_processing | 0.624 | 0.695 | 0.591 | 0.434 | 0.586 |
| tooled_colony | 0.626 | 0.759 | 0.628 | 0.519 | 0.633 |
| high_threat | 0.303 | 0.722 | 0.516 | 0.6 | 0.535 |
| skeleton_crew | 0.088 | 0.804 | 0.544 | 0.613 | 0.512 |
| large_colony | 0.532 | 0.82 | 0.557 | 0.617 | 0.632 |
| wildlife_heavy | 0.429 | 0.231 | 0.635 | 0 | 0.324 |
| storm_start | 0.303 | 0.722 | 0.513 | 0.6 | 0.534 |
| default | 0.082 | 0.525 | 0.608 | 0.687 | 0.476 |
| developed_colony | 0.66 | 0.677 | 0.623 | 0.396 | 0.589 |
| default | 0.523 | 0.819 | 0.554 | 0.462 | 0.589 |
| default | 0.021 | 0.61 | 0.599 | 0.765 | 0.499 |
| crisis_compound | 0.286 | 0.717 | 0.656 | 0.605 | 0.566 |
| island_isolation | 0.702 | 0.286 | 0.611 | 0.332 | 0.483 |
| population_boom | 0.264 | 0.768 | 0.588 | 0.575 | 0.549 |
| late_game_siege | 0.66 | 0.677 | 0.563 | 0.396 | 0.574 |
| no_director | 0.524 | 0.851 | 0.521 | 0.637 | 0.633 |

### 18. Traffic Flow Quality (交通流质量)
| Scenario | Congestion | Path Div | Roads | Road Score | Gini | Score |
|---|---|---|---|---|---|---|
| default | 121 | 3 | 25 | 0.301 | 0.187 | 0.604 |
| default | 114 | 3 | 26 | 0.57 | 0.479 | 0.598 |
| default | 105 | 3 | 32 | 0.931 | 0.047 | 0.796 |
| scarce_resources | 61 | 3 | 28 | 0.168 | 0.432 | 0.509 |
| abundant_resources | 51 | 3 | 31 | 0.207 | 0.423 | 0.521 |
| resource_chains_basic | 66 | 3 | 28 | 0.149 | 0.535 | 0.479 |
| full_processing | 81 | 3 | 26 | 0.226 | 0.464 | 0.516 |
| tooled_colony | 112 | 3 | 26 | 0.306 | 0.361 | 0.561 |
| high_threat | 60 | 3 | 26 | 0.126 | 0.048 | 0.595 |
| skeleton_crew | 13 | 2 | 28 | 0.19 | 0 | 0.539 |
| large_colony | 207 | 3 | 26 | 0.39 | 0.022 | 0.667 |
| wildlife_heavy | 75 | 3 | 29 | 0.272 | 0.435 | 0.534 |
| storm_start | 66 | 3 | 26 | 0.126 | 0.141 | 0.571 |
| default | 137 | 3 | 27 | 0.329 | 0.416 | 0.553 |
| developed_colony | 55 | 3 | 26 | 0.188 | 0.333 | 0.539 |
| default | 64 | 3 | 26 | 0 | 0.14 | 0.54 |
| default | 56 | 3 | 26 | 0.288 | 0.305 | 0.571 |
| crisis_compound | 25 | 3 | 28 | 0.168 | 0 | 0.617 |
| island_isolation | 62 | 2 | 22 | 0 | 0 | 0.492 |
| population_boom | 160 | 3 | 24 | 0.077 | 0.283 | 0.523 |
| late_game_siege | 31 | 3 | 26 | 0.188 | 0.452 | 0.509 |
| no_director | 69 | 3 | 15 | 0 | 0 | 0.575 |

---

## Improvement Targets

### Maturity Tier — Key Gaps

- **Logistics**: 0.389 (F)
- **Decision Consequence (决策后果深度)**: 0.471 (F)
- **Emergent Narrative (涌现叙事密度)**: 0.51 (D)
- **System Coupling Density (系统耦合密度)**: 0.51 (D)
- **NPC Needs Depth (NPC需求深度)**: 0.521 (D)

### What Would Raise the Score

To meaningfully improve the Maturity tier, the game needs:
- **Multiple NPC needs** (rest, morale, social) with conflicting priorities
- **Tile state richness** (crop growth stages, building degradation, cooldowns)
- **Action duration realism** (work progress bars, variable task times)
- **Day/night cycles** affecting behavior and production
- **Social interactions** between NPCs (relationships, conversations)
- **Diminishing returns** on resource gathering
- **Worker specialization** through experience/skills
