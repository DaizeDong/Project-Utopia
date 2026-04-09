# Project Utopia — Comprehensive Game Evaluation Report

> Generated: 2026-04-09 06:30:22
> Version: 0.5.4 (Phase 1: Resource Chains + Bridge)
> Scenarios: 22 | Duration: 1410s total sim time
> Scoring: 3-tier weighted (Foundation 20% + Gameplay 30% + Maturity 50%)

## Overall Score

**0.704 (C)**

| Tier | Score | Grade | Weight |
|---|---|---|---|
| **Foundation** (基础运行) | 0.961 | A | 20% |
| **Gameplay** (游戏玩法) | 0.753 | C | 30% |
| **Maturity** (游戏成熟度) | 0.572 | D | 50% |

## Tier 1: Foundation (基础运行)

| Dimension | Score | Grade | Description |
|---|---|---|---|
| Stability | 1 | A | Long-run correctness |
| Technical | 0.852 | B | AI quality, pathfinding |
| Coverage | 1.03 | A | Game element utilization |

## Tier 2: Gameplay (游戏玩法)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Development | 0.834 | B | 20% | Progressive complexity growth |
| Playability | 0.858 | B | 20% | Tension curves, engagement |
| Efficiency | 0.669 | C | 18% | Labor throughput, utilization |
| Logistics | 0.392 | F | 15% | Infrastructure quality |
| Reasonableness | 0.887 | B | 15% | NPC behavior naturalness |
| Adaptability | 0.85 | B | 12% | Crisis recovery |

## Tier 3: Maturity (游戏成熟度)

| Dimension | Score | Grade | Weight | Description |
|---|---|---|---|---|
| Action Duration Realism | 0.678 | C | 10% | 动作时长真实性 |
| Tile State Richness | 0.656 | C | 8% | 地块状态丰富度 |
| NPC Needs Depth | 0.515 | D | 10% | NPC需求深度 |
| Economic Feedback Loops | 0.769 | C | 8% | 经济反馈循环 |
| Spatial Layout Intelligence | 0.499 | F | 8% | 空间布局智能 |
| Temporal Realism | 0.449 | F | 7% | 时间真实性 |
| Emergent Narrative | 0.506 | D | 8% | 涌现叙事密度 |
| Decision Consequence | 0.47 | F | 9% | 决策后果深度 |
| Traffic Flow Quality | 0.624 | D | 8% | 交通流质量 |
| Population Dynamics | 0.682 | C | 8% | 人口动态真实性 |
| Environmental Responsiveness | 0.473 | F | 8% | 环境响应性 |
| System Coupling Density | 0.533 | D | 8% | 系统耦合密度 |

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
| default | 43.83→45.29 | 3→5 | 6 | 1/3 |
| default | 20.25→24.6 | 3→4.8 | 6 | 0/3 |
| scarce_resources | 49→53 | 2.8→5 | 6 | 1/3 |
| abundant_resources | 53.83→54 | 3→5 | 6 | 2/3 |
| resource_chains_basic | 55→55 | 4.5→6 | 7 | 1/3 |
| full_processing | 59→59 | 7→7 | 8 | 1/3 |
| tooled_colony | 54→54 | 4.2→5 | 6 | 1/3 |
| high_threat | 53.83→54 | 3→5 | 6 | 1/3 |
| skeleton_crew | 51.5→53.14 | 2.8→3 | 2 | 1/3 |
| large_colony | 50→49.86 | 3→3.1 | 6 | 1/3 |
| wildlife_heavy | 12.17→13 | 3→4 | 5 | 0/3 |
| storm_start | 53.83→54 | 3→5 | 6 | 1/3 |
| default | 37.17→39 | 3→5 | 6 | 1/3 |
| developed_colony | 62→62 | 4→7 | 8 | 1/3 |
| default | 82.75→83 | 3→5 | 6 | 1/3 |
| default | 38.25→41 | 3→5 | 6 | 1/3 |
| crisis_compound | 49→53 | 2.8→4 | 3 | 1/3 |
| island_isolation | 7→7 | 2→3 | 2 | 0/3 |
| population_boom | 51.5→53 | 2.8→3.6 | 6 | 1/3 |
| late_game_siege | 62→62 | 4→7 | 8 | 1/3 |
| no_director | 49→49 | 3→4 | 5 | 0/3 |

## 3. Coverage (覆盖度)

| Element | Found | Expected | Missing | Score |
|---|---|---|---|---|
| Tile Types | 14 | 14 | none | 1 |
| Roles | 8 | 8 | none | 1 |
| Resources | 7 | 7 | none | 1 |
| Intents | 13 | 10 | none | 1.3 |
| Weathers | 4 | 5 | none | 0.8 |

## 4. Playability (可玩性)

| Scenario | Tension | Variety | Resource Health | Progress | Score |
|---|---|---|---|---|---|
| default | 1 | 0.921 | 1 | 0.86 | 0.955 |
| default | 1 | 0.898 | 1 | 0.5 | 0.894 |
| default | 1 | 0.955 | 0.929 | 0 | 0.819 |
| scarce_resources | 1 | 0.918 | 0.968 | 0.58 | 0.905 |
| abundant_resources | 0.77 | 0.925 | 1 | 1 | 0.909 |
| resource_chains_basic | 0.721 | 0.948 | 1 | 0.59 | 0.839 |
| full_processing | 1 | 0.953 | 1 | 0.55 | 0.919 |
| tooled_colony | 1 | 0.917 | 1 | 0.79 | 0.943 |
| high_threat | 0.371 | 0.919 | 1 | 0.78 | 0.754 |
| skeleton_crew | 1 | 0.663 | 0.952 | 0.5 | 0.812 |
| large_colony | 0.54 | 0.732 | 1 | 0.58 | 0.719 |
| wildlife_heavy | 1 | 0.911 | 0.984 | 0.17 | 0.844 |
| storm_start | 0.829 | 0.907 | 1 | 0.84 | 0.897 |
| default | 1 | 0.916 | 1 | 0.64 | 0.92 |
| developed_colony | 1 | 0.943 | 1 | 0.84 | 0.959 |
| default | 0.896 | 0.945 | 1 | 0.82 | 0.926 |
| default | 1 | 0.903 | 1 | 0.57 | 0.907 |
| crisis_compound | 1 | 0.94 | 0.968 | 0.5 | 0.899 |
| island_isolation | 1 | 0.695 | 0.5 | 0.17 | 0.659 |
| population_boom | 0.75 | 0.819 | 0.984 | 0.6 | 0.806 |
| late_game_siege | 0.907 | 0.949 | 1 | 0.84 | 0.933 |
| no_director | 0.47 | 0.906 | 1 | 0 | 0.663 |

## 5. Technical (技术性)

| Scenario | Cache Hit | Validity | Goal Stability | AI Rate | Tool Mult | Score |
|---|---|---|---|---|---|---|
| default | 0.29 | 1 | 1 | 11.3/min | 1.45 | 0.894 |
| default | 0.476 | 1 | 1 | 11.3/min | 1.45 | 0.921 |
| default | 0.135 | 1 | 1 | 11/min | 1.3 | 0.804 |
| scarce_resources | 0.158 | 1 | 0.983 | 11/min | 1.3 | 0.804 |
| abundant_resources | 0.166 | 1 | 0.983 | 11/min | 1.45 | 0.872 |
| resource_chains_basic | 0.288 | 1 | 0.983 | 11/min | 1.3 | 0.823 |
| full_processing | 0.392 | 1 | 0.983 | 11/min | 1.45 | 0.905 |
| tooled_colony | 0.401 | 1 | 0.983 | 11/min | 1.45 | 0.907 |
| high_threat | 0.321 | 1 | 0.95 | 11/min | 1.45 | 0.888 |
| skeleton_crew | 0.272 | 1 | 0.933 | 11/min | 1 | 0.847 |
| large_colony | 0.294 | 1 | 0.99 | 11/min | 1.15 | 0.759 |
| wildlife_heavy | 0.144 | 1 | 0.933 | 11/min | 1 | 0.823 |
| storm_start | 0.225 | 1 | 0.983 | 11/min | 1.45 | 0.88 |
| default | 0.349 | 1 | 1 | 11.3/min | 1.3 | 0.836 |
| developed_colony | 0.449 | 1 | 0.983 | 11/min | 1.45 | 0.914 |
| default | 0.294 | 1 | 1 | 11/min | 1.45 | 0.894 |
| default | 0.087 | 1 | 0.983 | 11/min | 1.3 | 0.793 |
| crisis_compound | 0.194 | 1 | 0.85 | 11/min | 1.3 | 0.811 |
| island_isolation | 0.313 | 1 | 0.967 | 11/min | 1 | 0.863 |
| population_boom | 0.254 | 1 | 0.99 | 11/min | 1.15 | 0.753 |
| late_game_siege | 0.35 | 1 | 0.917 | 11/min | 1.45 | 0.886 |
| no_director | 0.337 | 1 | 0.983 | 11/min | 1 | 0.872 |

## 6. Reasonableness (合理性)

| Scenario | Diversity | Non-Repetition | Coherence | Productivity | Score |
|---|---|---|---|---|---|
| default | 0.805 | 1 | 1 | 0.876 | 0.905 |
| default | 0.757 | 1 | 1 | 0.906 | 0.899 |
| default | 0.791 | 1 | 0.67 | 0.889 | 0.838 |
| scarce_resources | 0.805 | 1 | 1 | 0.895 | 0.91 |
| abundant_resources | 0.779 | 1 | 1 | 0.892 | 0.901 |
| resource_chains_basic | 0.843 | 1 | 1 | 0.901 | 0.923 |
| full_processing | 0.887 | 1 | 1 | 0.892 | 0.934 |
| tooled_colony | 0.807 | 1 | 1 | 0.892 | 0.91 |
| high_threat | 0.796 | 1 | 1 | 0.903 | 0.91 |
| skeleton_crew | 0.864 | 1 | 1 | 0.957 | 0.946 |
| large_colony | 0.861 | 0.556 | 0.67 | 0.532 | 0.663 |
| wildlife_heavy | 0.75 | 1 | 1 | 0.901 | 0.895 |
| storm_start | 0.778 | 1 | 1 | 0.906 | 0.905 |
| default | 0.782 | 1 | 1 | 0.874 | 0.897 |
| developed_colony | 0.888 | 0.556 | 1 | 0.887 | 0.844 |
| default | 0.796 | 1 | 0.67 | 0.889 | 0.839 |
| default | 0.754 | 1 | 1 | 0.909 | 0.899 |
| crisis_compound | 0.905 | 1 | 1 | 0.952 | 0.957 |
| island_isolation | 0.784 | 1 | 1 | 0.957 | 0.922 |
| population_boom | 0.838 | 1 | 1 | 0.587 | 0.828 |
| late_game_siege | 0.888 | 1 | 1 | 0.901 | 0.936 |
| no_director | 0.727 | 0.833 | 1 | 0.922 | 0.861 |

## 7. Efficiency (效率)

| Scenario | Deliveries | Carry/W/Min | Idle% | Proc Util | Depot Dist | Score |
|---|---|---|---|---|---|---|
| default | 31 | 1.72 | 3.5% | 0.133 | 3.2 | 0.722 |
| default | 27 | 1.5 | 3.2% | 0.138 | 5.3 | 0.656 |
| default | 17 | 1.42 | 4.8% | 0.14 | 8.6 | 0.59 |
| scarce_resources | 12 | 1 | 3.2% | 0.207 | 3.5 | 0.645 |
| abundant_resources | 11 | 0.86 | 4% | 0.2 | 3.4 | 0.623 |
| resource_chains_basic | 16 | 1.33 | 3.2% | 0.7 | 3.2 | 0.846 |
| full_processing | 10 | 0.83 | 3.2% | 0.756 | 1.7 | 0.797 |
| tooled_colony | 19 | 1.58 | 3.2% | 0 | 2.2 | 0.65 |
| high_threat | 8 | 0.67 | 3.2% | 0.267 | 3.3 | 0.629 |
| skeleton_crew | 4 | 1.33 | 3.2% | 0 | 2.9 | 0.602 |
| large_colony | 5 | 0.25 | 3.2% | 0.067 | 6.9 | 0.405 |
| wildlife_heavy | 10 | 0.83 | 3.2% | 0 | 8.3 | 0.558 |
| storm_start | 14 | 1.17 | 3.2% | 0.2 | 3.2 | 0.672 |
| default | 25 | 1.39 | 3.2% | 0.089 | 4.2 | 0.634 |
| developed_colony | 4 | 0.33 | 3.2% | 0.733 | 1.6 | 0.724 |
| default | 27 | 2.25 | 4.8% | 0.267 | 2.8 | 0.837 |
| default | 19 | 1.58 | 4.8% | 0.133 | 3.7 | 0.692 |
| crisis_compound | 6 | 1.5 | 3.2% | 0.218 | 2.7 | 0.738 |
| island_isolation | 4 | 0.67 | 3.2% | 0 | 8.8 | 0.513 |
| population_boom | 21 | 1.05 | 3.2% | 0.122 | 5.3 | 0.581 |
| late_game_siege | 4 | 0.33 | 3.2% | 0.756 | 1.5 | 0.725 |
| no_director | 22 | 1.83 | 3.2% | 0 | 3.1 | 0.888 |

## 8. Adaptability (适应性)

| Scenario | Weather Chg | Weather Resp | Dips | Recovery | Deaths | Death Impact | Score |
|---|---|---|---|---|---|---|---|
| default | 4 | 1 | 1 | 0.519 | 1 | 1 | 0.856 |
| default | 4 | 0.971 | 1 | 0 | 1 | 1 | 0.691 |
| default | 2 | 0.993 | 1 | 0 | 1 | 0.946 | 0.687 |
| scarce_resources | 2 | 0.993 | 2 | 0.258 | 1 | 0.994 | 0.774 |
| abundant_resources | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| resource_chains_basic | 2 | 0.934 | 2 | 0.499 | 1 | 0.934 | 0.817 |
| full_processing | 2 | 1 | 1 | 0 | 1 | 1 | 0.7 |
| tooled_colony | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| high_threat | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| skeleton_crew | 2 | 0.972 | 1 | 0 | 1 | 1 | 0.692 |
| large_colony | 2 | 0.994 | 0 | 1 | 1 | 1 | 0.998 |
| wildlife_heavy | 2 | 1 | 1 | 0 | 7 | 0.956 | 0.691 |
| storm_start | 3 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 4 | 0.962 | 1 | 0.519 | 1 | 1 | 0.844 |
| developed_colony | 2 | 1 | 0 | 1 | 1 | 0.996 | 0.999 |
| default | 2 | 1 | 0 | 1 | 1 | 1 | 1 |
| default | 2 | 1 | 2 | 0.226 | 0 | 1 | 0.768 |
| crisis_compound | 3 | 1 | 2 | 0.254 | 1 | 1 | 0.776 |
| island_isolation | 2 | 1 | 1 | 0 | 1 | 1 | 0.7 |
| population_boom | 2 | 1 | 1 | 0 | 1 | 1 | 0.7 |
| late_game_siege | 3 | 1 | 0 | 1 | 1 | 1 | 1 |
| no_director | 2 | 1 | 0 | 1 | 1 | 1 | 1 |

## 9. Logistics (物流)

| Scenario | Road Coverage | Warehouse Dist | Chain Complete | Res Balance | Score |
|---|---|---|---|---|---|
| default | 0.289 | 0.713 | 0.333 | 0.256 | 0.398 |
| default | 0.261 | 0.528 | 0.278 | 0.365 | 0.358 |
| default | 0.782 | 0.555 | 0.25 | 0.147 | 0.434 |
| scarce_resources | 0.181 | 0.582 | 0.167 | 0.172 | 0.275 |
| abundant_resources | 0.201 | 0.572 | 0.333 | 0.523 | 0.408 |
| resource_chains_basic | 0.233 | 0.582 | 0.667 | 0.398 | 0.47 |
| full_processing | 0.376 | 0.292 | 1 | 0.489 | 0.539 |
| tooled_colony | 0.345 | 0.35 | 0.333 | 0.583 | 0.403 |
| high_threat | 0.201 | 0.679 | 0.333 | 0.426 | 0.41 |
| skeleton_crew | 0.183 | 0.87 | 0.111 | 0.202 | 0.342 |
| large_colony | 0.218 | 0.449 | 0.333 | 0.449 | 0.362 |
| wildlife_heavy | 0.53 | 0.603 | 0 | 0.135 | 0.317 |
| storm_start | 0.201 | 0.665 | 0.333 | 0.449 | 0.412 |
| default | 0.289 | 0.657 | 0.333 | 0.254 | 0.383 |
| developed_colony | 0.441 | 0.264 | 1 | 0.593 | 0.574 |
| default | 0.368 | 0.58 | 0.333 | 0.422 | 0.426 |
| default | 0.237 | 0.656 | 0.333 | 0.172 | 0.35 |
| crisis_compound | 0.181 | 0.358 | 0.167 | 0.19 | 0.224 |
| island_isolation | 0.667 | 0.48 | 0 | 0.009 | 0.289 |
| population_boom | 0.183 | 0.608 | 0.167 | 0.19 | 0.287 |
| late_game_siege | 0.441 | 0.262 | 1 | 0.596 | 0.575 |
| no_director | 0.171 | 0.586 | 0 | 0.809 | 0.391 |

---

## Maturity Dimension Breakdowns

### 10. Action Duration Realism (动作时长真实性)
| Scenario | Action CV | Action Ratio | Has Progress | Score |
|---|---|---|---|---|
| default | 0 | 0.5 | true | 0.7 |
| default | 0 | 0.475 | true | 0.7 |
| default | 0 | 0.385 | true | 0.685 |
| scarce_resources | 0 | 0.436 | true | 0.7 |
| abundant_resources | 0 | 0.385 | true | 0.685 |
| resource_chains_basic | 0 | 0.474 | true | 0.7 |
| full_processing | 0 | 0.437 | true | 0.7 |
| tooled_colony | 0 | 0.45 | true | 0.7 |
| high_threat | 0 | 0.375 | true | 0.675 |
| skeleton_crew | 0 | 0.409 | true | 0.7 |
| large_colony | 0 | 0.179 | true | 0.479 |
| wildlife_heavy | 0 | 0.426 | true | 0.7 |
| storm_start | 0 | 0.462 | true | 0.7 |
| default | 0 | 0.446 | true | 0.7 |
| developed_colony | 0 | 0.324 | true | 0.624 |
| default | 0 | 0.474 | true | 0.7 |
| default | 0 | 0.47 | true | 0.7 |
| crisis_compound | 0 | 0.469 | true | 0.7 |
| island_isolation | 0 | 0.375 | true | 0.675 |
| population_boom | 0 | 0.444 | true | 0.7 |
| late_game_siege | 0 | 0.303 | true | 0.603 |
| no_director | 0 | 0.465 | true | 0.7 |

### 12. NPC Needs Depth (NPC需求深度)
| Scenario | Needs | Conflicts | Satisfaction Actions | Has Mood | Score |
|---|---|---|---|---|---|
| default | hunger,rest,morale | 3 | eat | true | 0.556 |
| default | hunger,rest,morale | 3 | eat | true | 0.556 |
| default | hunger,rest,morale | 3 | none | true | 0.475 |
| scarce_resources | hunger,rest,morale | 3 | eat | true | 0.556 |
| abundant_resources | hunger,rest,morale | 3 | eat | true | 0.506 |
| resource_chains_basic | hunger,rest,morale | 3 | eat | true | 0.506 |
| full_processing | hunger,rest,morale | 3 | eat | true | 0.506 |
| tooled_colony | hunger,rest,morale | 3 | eat | true | 0.506 |
| high_threat | hunger,rest,morale | 3 | eat | true | 0.506 |
| skeleton_crew | hunger,rest,morale | 3 | eat | true | 0.506 |
| large_colony | hunger,rest,morale | 3 | none | true | 0.475 |
| wildlife_heavy | hunger,rest,morale | 3 | eat | true | 0.506 |
| storm_start | hunger,rest,morale | 3 | eat | true | 0.556 |
| default | hunger,rest,morale | 3 | eat | true | 0.556 |
| developed_colony | hunger,rest,morale | 3 | eat | true | 0.506 |
| default | hunger,rest,morale | 3 | none | true | 0.475 |
| default | hunger,rest,morale | 3 | eat | true | 0.556 |
| crisis_compound | hunger,rest,morale | 3 | eat | true | 0.506 |
| island_isolation | hunger,rest,morale | 3 | eat | true | 0.506 |
| population_boom | hunger,rest,morale | 3 | eat | true | 0.506 |
| late_game_siege | hunger,rest,morale | 3 | eat | true | 0.506 |
| no_director | hunger,rest,morale | 3 | eat | true | 0.506 |

### 14. Spatial Layout Intelligence (空间布局智能)
| Scenario | Cluster | Zoning | Path Eff | Expansion | Score |
|---|---|---|---|---|---|
| default | 0.107 | 0.564 | 0.4 | 0.814 | 0.471 |
| default | 0.255 | 0.822 | 0.4 | 0.429 | 0.477 |
| default | 0.731 | 0.542 | 0.4 | 0.549 | 0.555 |
| scarce_resources | 0.286 | 0.717 | 0.4 | 0.605 | 0.502 |
| abundant_resources | 0.303 | 0.722 | 0.4 | 0.6 | 0.506 |
| resource_chains_basic | 0.346 | 0.691 | 0.4 | 0.586 | 0.506 |
| full_processing | 0.624 | 0.683 | 0.4 | 0.422 | 0.532 |
| tooled_colony | 0.626 | 0.759 | 0.4 | 0.519 | 0.576 |
| high_threat | 0.303 | 0.722 | 0.4 | 0.6 | 0.506 |
| skeleton_crew | 0.286 | 0.704 | 0.4 | 0.598 | 0.497 |
| large_colony | 0.532 | 0.82 | 0.4 | 0.617 | 0.592 |
| wildlife_heavy | 0.714 | 0.071 | 0.4 | 0 | 0.296 |
| storm_start | 0.303 | 0.722 | 0.4 | 0.6 | 0.506 |
| default | 0.107 | 0.564 | 0.4 | 0.814 | 0.471 |
| developed_colony | 0.66 | 0.677 | 0.4 | 0.396 | 0.534 |
| default | 0.523 | 0.819 | 0.4 | 0.462 | 0.551 |
| default | 0.021 | 0.537 | 0.4 | 0.769 | 0.432 |
| crisis_compound | 0.264 | 0.755 | 0.4 | 0.598 | 0.504 |
| island_isolation | 0.702 | 0.286 | 0.367 | 0.332 | 0.422 |
| population_boom | 0.286 | 0.717 | 0.4 | 0.605 | 0.502 |
| late_game_siege | 0.66 | 0.677 | 0.4 | 0.396 | 0.534 |
| no_director | 0.289 | 0.816 | 0.25 | 0.627 | 0.496 |

### 18. Traffic Flow Quality (交通流质量)
| Scenario | Congestion | Path Div | Roads | Road Score | Gini | Score |
|---|---|---|---|---|---|---|
| default | 119 | 3 | 25 | 0.301 | 0 | 0.65 |
| default | 108 | 3 | 25 | 0.501 | 0 | 0.7 |
| default | 83 | 3 | 32 | 0.872 | 0 | 0.793 |
| scarce_resources | 49 | 3 | 28 | 0.168 | 0 | 0.617 |
| abundant_resources | 69 | 3 | 30 | 0.191 | 0 | 0.623 |
| resource_chains_basic | 67 | 3 | 28 | 0.149 | 0 | 0.612 |
| full_processing | 78 | 3 | 26 | 0.213 | 0 | 0.628 |
| tooled_colony | 113 | 3 | 26 | 0.306 | 0 | 0.652 |
| high_threat | 59 | 3 | 26 | 0.126 | 0 | 0.606 |
| skeleton_crew | 10 | 2 | 27 | 0.142 | 0 | 0.527 |
| large_colony | 242 | 3 | 26 | 0.39 | 0 | 0.672 |
| wildlife_heavy | 89 | 3 | 33 | 0.185 | 0 | 0.621 |
| storm_start | 72 | 3 | 26 | 0.126 | 0 | 0.606 |
| default | 143 | 3 | 25 | 0.301 | 0 | 0.65 |
| developed_colony | 45 | 3 | 26 | 0.188 | 0 | 0.622 |
| default | 54 | 3 | 26 | 0 | 0 | 0.575 |
| default | 62 | 3 | 27 | 0.311 | 0 | 0.653 |
| crisis_compound | 22 | 3 | 27 | 0.152 | 0 | 0.613 |
| island_isolation | 41 | 2 | 22 | 0 | 0 | 0.492 |
| population_boom | 116 | 3 | 28 | 0.168 | 0 | 0.617 |
| late_game_siege | 62 | 3 | 26 | 0.188 | 0 | 0.622 |
| no_director | 69 | 3 | 15 | 0 | 0 | 0.575 |

---

## Improvement Targets

### Maturity Tier — Key Gaps

- **Logistics**: 0.392 (F)
- **Temporal Realism (时间真实性)**: 0.449 (F)
- **Decision Consequence (决策后果深度)**: 0.47 (F)
- **Environmental Responsiveness (环境响应性)**: 0.473 (F)
- **Spatial Layout Intelligence (空间布局智能)**: 0.499 (F)

### What Would Raise the Score

To meaningfully improve the Maturity tier, the game needs:
- **Multiple NPC needs** (rest, morale, social) with conflicting priorities
- **Tile state richness** (crop growth stages, building degradation, cooldowns)
- **Action duration realism** (work progress bars, variable task times)
- **Day/night cycles** affecting behavior and production
- **Social interactions** between NPCs (relationships, conversations)
- **Diminishing returns** on resource gathering
- **Worker specialization** through experience/skills
